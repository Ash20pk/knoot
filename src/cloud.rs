//! Neon-backed identity for people.
//!
//! Two credentials reach this relay and they are not the same kind of thing.
//! A machine presents an agent token: minted here, stored as a hash, verified
//! against local SQLite with no network, because the hot path must keep
//! working when nothing else does. A person presents a Neon Auth JWT from the
//! console, which this module exchanges for a user and a team.
//!
//! Identity lives in Neon; the event log and token hashes stay on the relay.
//! That split is deliberate. A self-hosted relay with no Neon configuration
//! behaves exactly as it did before: `from_env` returns `None` and nothing
//! here is ever called.
//!
//! The relay holds no database secret. The JWT is checked here against Neon
//! Auth's published keys, and the membership read goes to the Data API with
//! the person's own token, so row-level security decides what it may see —
//! the same rules the console is held to. A leaked relay environment hands
//! over two public URLs.

use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use base64::Engine as _;
use ed25519_dalek::{Signature, VerifyingKey};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// How long a verified access token is trusted without asking Neon again.
/// Short enough that a removed member loses access promptly, long enough that
/// a console refreshing its log does not make a call per request.
const TTL: Duration = Duration::from_secs(60);

/// Clock skew allowed on `exp`. Neon's tokens live fifteen minutes; this is
/// slack for a droplet clock, not an extension.
const LEEWAY_SECS: u64 = 30;

/// A token signed with a key this relay has not seen sends it back to the
/// JWKS, which is how a key rotation is picked up. Not more often than this,
/// or a stream of made-up `kid`s becomes a stream of fetches.
const JWKS_REFRESH: Duration = Duration::from_secs(60);

#[derive(Clone, Debug)]
pub struct Team {
    pub id: String,
    pub name: String,
}

/// A signed-in person and the team they belong to.
///
/// The team alone was enough while the console only read a log. It stops being
/// enough once rooms decide what a person may enter and once a memory shard
/// records who wrote it: the relay needs the email and the role too, and it
/// must get them from Neon rather than from the browser.
#[derive(Clone, Debug)]
pub struct Principal {
    pub team: Team,
    pub user_id: String,
    pub email: String,
    /// `owner` | `admin` | `member`, as `team_members.role` has it.
    pub role: String,
}

/// Verified access tokens, and what they resolved to, until when. A `None` is
/// a cached refusal, which matters as much as a cached success: without it a
/// stale console tab retrying becomes a request amplifier against Neon.
type VerifiedCache = HashMap<String, (Instant, Option<Principal>)>;

#[derive(Default)]
struct Keys {
    by_kid: HashMap<String, VerifyingKey>,
    fetched: Option<Instant>,
}

#[derive(Clone)]
pub struct Cloud {
    /// Neon Auth for the branch, e.g. `https://ep-….neonauth.…/neondb/auth`.
    /// The JWKS lives under it and the token's issuer is its origin.
    auth_url: String,
    /// The Data API, e.g. `https://ep-….apirest.…/neondb/rest/v1`.
    data_api_url: String,
    http: reqwest::Client,
    keys: std::sync::Arc<Mutex<Keys>>,
    cache: std::sync::Arc<Mutex<VerifiedCache>>,
}

impl Cloud {
    /// Built from the environment, or `None` when this relay is not attached
    /// to a Neon project. Both URLs are required: a relay that could verify a
    /// person but never find their team would fail in a way that looks like a
    /// permissions bug.
    pub fn from_env() -> Option<Self> {
        let auth_url = crate::config::env_or_legacy("NEON_AUTH_URL")?;
        let data_api_url = crate::config::env_or_legacy("NEON_DATA_API_URL")?;
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .ok()?;
        Some(Self::new(&auth_url, &data_api_url, http))
    }

    fn new(auth_url: &str, data_api_url: &str, http: reqwest::Client) -> Self {
        Self {
            auth_url: auth_url.trim_end_matches('/').to_string(),
            data_api_url: data_api_url.trim_end_matches('/').to_string(),
            http,
            keys: Default::default(),
            cache: Default::default(),
        }
    }

    /// Same wiring, pointed at a server the test controls.
    #[cfg(test)]
    pub fn for_test(url: &str) -> Self {
        Self::new(&format!("{url}/neondb/auth"), &format!("{url}/neondb/rest/v1"), reqwest::Client::new())
    }

    /// A Neon Auth access token is a JWT: three base64url segments. Agent
    /// tokens never look like this, so the shape alone is enough to route a
    /// credential to the right verifier without trying both.
    pub fn looks_like_jwt(tok: &str) -> bool {
        let mut parts = tok.split('.');
        let (a, b, c, rest) = (parts.next(), parts.next(), parts.next(), parts.next());
        rest.is_none()
            && [a, b, c].iter().all(|p| {
                p.map(|p| !p.is_empty() && p.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_'))
                    .unwrap_or(false)
            })
    }

    /// Verify an access token and resolve the team it speaks for.
    ///
    /// Returns `None` for a token that does not verify, and also for a valid
    /// user who belongs to no team — there is nothing for them to read yet,
    /// and inventing a team here would let the console diverge from the
    /// database that owns team membership.
    pub async fn team_for_token(&self, access_token: &str) -> Option<Team> {
        self.principal_for_token(access_token).await.map(|p| p.team)
    }

    /// Verify an access token and resolve the person and team it speaks for.
    pub async fn principal_for_token(&self, access_token: &str) -> Option<Principal> {
        if let Some((until, who)) = self.cache.lock().unwrap().get(access_token) {
            if Instant::now() < *until {
                return who.clone();
            }
        }
        let (who, exp) = match self.verify(access_token).await {
            Some(claims) => (self.lookup(access_token, &claims).await, claims.exp),
            None => (None, 0),
        };
        // A success is never trusted past the token's own expiry; a refusal
        // is held for the full TTL.
        let mut until = Instant::now() + TTL;
        if who.is_some() {
            let left = exp.saturating_sub(now_secs());
            until = until.min(Instant::now() + Duration::from_secs(left));
        }
        self.cache
            .lock()
            .unwrap()
            .insert(access_token.to_string(), (until, who.clone()));
        who
    }

    /// The token's issuer: the origin of the auth URL, which is what Neon
    /// Auth signs into both `iss` and `aud`.
    fn issuer(&self) -> &str {
        let after_scheme = self.auth_url.find("://").map(|i| i + 3).unwrap_or(0);
        match self.auth_url[after_scheme..].find('/') {
            Some(i) => &self.auth_url[..after_scheme + i],
            None => &self.auth_url,
        }
    }

    /// Check the signature against Neon Auth's keys and the claims against
    /// this branch. Every rejection is a `None`; the caller never learns why,
    /// and neither does whoever presented the token.
    async fn verify(&self, tok: &str) -> Option<Claims> {
        let mut parts = tok.split('.');
        let (h, p, s) = (parts.next()?, parts.next()?, parts.next()?);
        let header: serde_json::Value = serde_json::from_slice(&B64.decode(h).ok()?).ok()?;
        // The algorithm is pinned rather than read from the header, or a
        // token could choose a weaker one for itself.
        if header.get("alg")?.as_str()? != "EdDSA" {
            return None;
        }
        let kid = header.get("kid")?.as_str()?;
        let key = self.key(kid).await?;
        let sig = Signature::from_slice(&B64.decode(s).ok()?).ok()?;
        key.verify_strict(format!("{h}.{p}").as_bytes(), &sig).ok()?;

        let claims: Claims = serde_json::from_slice(&B64.decode(p).ok()?).ok()?;
        let iss = self.issuer();
        if claims.iss != iss || !claims.aud.contains(iss) {
            return None;
        }
        if claims.exp + LEEWAY_SECS < now_secs() {
            return None;
        }
        // `sub` goes into a query string next; a verified one is a UUID, and
        // anything else is refused rather than escaped.
        if claims.sub.is_empty() || !claims.sub.bytes().all(|c| c.is_ascii_hexdigit() || c == b'-') {
            return None;
        }
        Some(claims)
    }

    /// The verifying key for `kid`, fetching the JWKS when it is unknown.
    async fn key(&self, kid: &str) -> Option<VerifyingKey> {
        {
            let keys = self.keys.lock().unwrap();
            if let Some(k) = keys.by_kid.get(kid) {
                return Some(*k);
            }
            if keys.fetched.is_some_and(|t| t.elapsed() < JWKS_REFRESH) {
                return None;
            }
        }
        let fetched = self.fetch_keys().await;
        let mut keys = self.keys.lock().unwrap();
        keys.fetched = Some(Instant::now());
        if let Some(by_kid) = fetched {
            keys.by_kid = by_kid;
        }
        keys.by_kid.get(kid).copied()
    }

    async fn fetch_keys(&self) -> Option<HashMap<String, VerifyingKey>> {
        let r = self
            .http
            .get(format!("{}/.well-known/jwks.json", self.auth_url))
            .send()
            .await
            .ok()?;
        if !r.status().is_success() {
            return None;
        }
        let jwks: serde_json::Value = r.json().await.ok()?;
        let mut out = HashMap::new();
        for k in jwks.get("keys")?.as_array()? {
            let field = |n: &str| k.get(n).and_then(|v| v.as_str());
            if field("kty") != Some("OKP") || field("crv") != Some("Ed25519") {
                continue;
            }
            let (Some(kid), Some(x)) = (field("kid"), field("x")) else { continue };
            let Ok(bytes) = B64.decode(x) else { continue };
            let Ok(bytes) = <[u8; 32]>::try_from(bytes.as_slice()) else { continue };
            if let Ok(key) = VerifyingKey::from_bytes(&bytes) {
                out.insert(kid.to_string(), key);
            }
        }
        Some(out)
    }

    /// Check a Neon Auth webhook: a detached Ed25519 JWS over the timestamp
    /// and the raw body, signed with the same keys as access tokens.
    ///
    /// The signing input is `header . b64(timestamp . b64(body))` — the body
    /// is encoded twice, so `timestamp.body` alone never verifies. A delivery
    /// more than five minutes from now either way is refused, so a captured
    /// one cannot be replayed later.
    pub async fn verify_webhook(&self, signature: &str, kid: &str, timestamp_ms: &str, body: &[u8]) -> bool {
        let Some((h, s)) = signature.split_once("..") else { return false };
        let Ok(ts) = timestamp_ms.parse::<u64>() else { return false };
        let now_ms = now_secs() * 1000;
        if ts.abs_diff(now_ms) > 5 * 60 * 1000 {
            return false;
        }
        let Some(header) = B64.decode(h).ok().and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok()) else {
            return false;
        };
        if header.get("alg").and_then(|a| a.as_str()) != Some("EdDSA") {
            return false;
        }
        let kid = header.get("kid").and_then(|k| k.as_str()).unwrap_or(kid);
        let Some(key) = self.key(kid).await else { return false };
        let Some(sig) = B64.decode(s).ok().and_then(|b| Signature::from_slice(&b).ok()) else { return false };
        let inner = B64.encode(format!("{timestamp_ms}.{}", B64.encode(body)));
        key.verify_strict(format!("{h}.{inner}").as_bytes(), &sig).is_ok()
    }

    /// Read the person's own membership row. The Data API is handed the same
    /// token, so this is exactly what row-level security lets them see.
    async fn lookup(&self, access_token: &str, claims: &Claims) -> Option<Principal> {
        let rows = self
            .http
            .get(format!(
                "{}/team_members?user_id=eq.{}&select=team_id,email,role,teams(name)&limit=1",
                self.data_api_url, claims.sub
            ))
            .bearer_auth(access_token)
            .send()
            .await
            .ok()?;
        if !rows.status().is_success() {
            return None;
        }
        let rows: serde_json::Value = rows.json().await.ok()?;
        let row = rows.as_array()?.first()?;
        let id = row.get("team_id")?.as_str()?.to_string();
        let name = row
            .get("teams")
            .and_then(|t| t.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("team")
            .to_string();
        // The membership row's address, written from Neon Auth's own record,
        // never the browser's claim about it: this becomes the authorship
        // string on every event.
        let email = row
            .get("email")
            .and_then(|e| e.as_str())
            .map(str::to_string)
            .or_else(|| claims.email.clone())?;
        let role = row
            .get("role")
            .and_then(|r| r.as_str())
            .unwrap_or("member")
            .to_string();
        Some(Principal { team: Team { id, name }, user_id: claims.sub.clone(), email, role })
    }
}

impl Cloud {
    /// Whether `secret` is the live invitation for `email` in `team_id`, asked
    /// of the Data API as the person holding `access_token`. Row-level
    /// security lets a team read its own invitations' hashes and nothing
    /// else, so this proves both that the invitation exists and that the
    /// caller's team issued it — before the relay emails anybody. Returns the
    /// invitation's role when it matches.
    pub async fn invite_matches(&self, access_token: &str, team_id: &str, email: &str, secret: &str) -> Option<String> {
        use sha2::{Digest, Sha256};
        let enc = |s: &str| s.replace('%', "%25").replace('&', "%26").replace('+', "%2B").replace(',', "%2C");
        let Ok(resp) = self
            .http
            .get(format!(
                "{}/invites?team_id=eq.{}&email=eq.{}&accepted_at=is.null&select=token_hash,role&limit=1",
                self.data_api_url,
                enc(team_id),
                enc(&email.trim().to_lowercase())
            ))
            .bearer_auth(access_token)
            .send()
            .await
        else {
            return None;
        };
        if !resp.status().is_success() {
            return None;
        }
        let rows = resp.json::<serde_json::Value>().await.ok()?;
        let row = rows.as_array().and_then(|r| r.first())?;
        let want = row.get("token_hash").and_then(|h| h.as_str()).unwrap_or_default();
        let got = format!("{:x}", Sha256::digest(secret.as_bytes()));
        (!want.is_empty() && want == got)
            .then(|| row.get("role").and_then(|r| r.as_str()).unwrap_or("member").to_string())
    }
}

#[derive(serde::Deserialize)]
struct Claims {
    sub: String,
    iss: String,
    aud: Audience,
    exp: u64,
    email: Option<String>,
}

/// `aud` is a string or a list of them, by the JWT spec.
#[derive(serde::Deserialize)]
#[serde(untagged)]
enum Audience {
    One(String),
    Many(Vec<String>),
}

impl Audience {
    fn contains(&self, want: &str) -> bool {
        match self {
            Audience::One(a) => a == want,
            Audience::Many(v) => v.iter().any(|a| a == want),
        }
    }
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::response::IntoResponse;
    use ed25519_dalek::{Signer, SigningKey};

    /// A Data API that holds one invitation, and answers only the bearer it
    /// was given — as row-level security would for another team.
    async fn invites_api(hash: String) -> String {
        use axum::{extract::Query, routing::get, Json, Router};
        let app = Router::new().route(
            "/neondb/rest/v1/invites",
            get(move |headers: axum::http::HeaderMap, Query(q): Query<std::collections::HashMap<String, String>>| {
                let hash = hash.clone();
                async move {
                    let ours = headers.get("authorization").and_then(|v| v.to_str().ok()) == Some("Bearer admin-jwt");
                    let row = q.get("team_id").map(String::as_str) == Some("eq.t1")
                        && q.get("email").map(String::as_str) == Some("eq.priya@acme.test")
                        && q.get("accepted_at").map(String::as_str) == Some("is.null");
                    let rows = if ours && row {
                        serde_json::json!([{ "token_hash": hash, "role": "admin" }])
                    } else {
                        serde_json::json!([])
                    };
                    Json(rows).into_response()
                }
            }),
        );
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = l.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn an_invitation_is_emailed_only_when_its_secret_matches_a_live_one() {
        use sha2::{Digest, Sha256};
        let secret = "kni_0123456789abcdef";
        let url = invites_api(format!("{:x}", Sha256::digest(secret.as_bytes()))).await;
        let cloud = Cloud::for_test(&url);
        assert_eq!(
            cloud.invite_matches("admin-jwt", "t1", "Priya@Acme.test ", secret).await.as_deref(),
            Some("admin"),
            "the real secret, any case or spacing of the address: yes, with its role"
        );
        assert!(cloud.invite_matches("admin-jwt", "t1", "priya@acme.test", "kni_guess").await.is_none(), "a wrong secret: no");
        assert!(cloud.invite_matches("admin-jwt", "t1", "sam@acme.test", secret).await.is_none(), "another address: no");
        assert!(cloud.invite_matches("other-jwt", "t1", "priya@acme.test", secret).await.is_none(), "another team's view: no");
    }

    const KID: &str = "test-key";
    const USER: &str = "23406640-82dc-4cea-ad63-650fef648f8f";

    fn signing_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    /// A token as Neon Auth would sign it, for the stub at `base`.
    fn token(base: &str, key: &SigningKey, kid: &str, exp: u64, sub: &str) -> String {
        let h = B64.encode(serde_json::json!({ "alg": "EdDSA", "kid": kid }).to_string());
        let p = B64.encode(
            serde_json::json!({
                "sub": sub, "email": "ash@example.com", "role": "authenticated",
                "iss": base, "aud": base, "exp": exp,
            })
            .to_string(),
        );
        let sig = key.sign(format!("{h}.{p}").as_bytes());
        format!("{h}.{p}.{}", B64.encode(sig.to_bytes()))
    }

    fn fresh() -> u64 {
        now_secs() + 900
    }

    /// A stand-in for the two Neon endpoints this module calls, so the
    /// exchange is exercised for real rather than mocked at the seam. Counts
    /// JWKS fetches and records the `Authorization` header the Data API saw.
    #[derive(Clone, Default)]
    struct Seen {
        jwks_fetches: std::sync::Arc<Mutex<usize>>,
        data_auth: std::sync::Arc<Mutex<Option<String>>>,
    }

    async fn stub(seen: Seen) -> String {
        use axum::{routing::get, Json, Router};
        let x = B64.encode(signing_key().verifying_key().to_bytes());
        let jwks_seen = seen.clone();
        let app = Router::new()
            .route("/neondb/auth/.well-known/jwks.json", get(move || {
                let seen = jwks_seen.clone();
                async move {
                    *seen.jwks_fetches.lock().unwrap() += 1;
                    Json(serde_json::json!({ "keys": [
                        { "kty": "OKP", "crv": "Ed25519", "alg": "EdDSA", "kid": KID, "x": x }
                    ]}))
                }
            }))
            .route("/neondb/rest/v1/team_members", get(move |uri: axum::http::Uri, headers: axum::http::HeaderMap| {
                let seen = seen.clone();
                async move {
                    // The lookup must be keyed by the id the token proved,
                    // never by anything the caller supplied.
                    assert!(uri.query().unwrap().contains(&format!("user_id=eq.{USER}")));
                    let auth = headers
                        .get(axum::http::header::AUTHORIZATION)
                        .map(|v| v.to_str().unwrap().to_string());
                    *seen.data_auth.lock().unwrap() = auth;
                    Json(serde_json::json!([
                        {
                            "team_id": "team-abc",
                            "email": "ash@example.com",
                            "role": "admin",
                            "teams": { "name": "Platform team" }
                        }
                    ]))
                    .into_response()
                }
            }));
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = l.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
        format!("http://{addr}")
    }

    /// A webhook delivery signed the way Neon Auth signs one.
    fn webhook_signature(key: &SigningKey, ts: &str, body: &[u8]) -> String {
        let h = B64.encode(serde_json::json!({ "alg": "EdDSA", "kid": KID }).to_string());
        let inner = B64.encode(format!("{ts}.{}", B64.encode(body)));
        let sig = key.sign(format!("{h}.{inner}").as_bytes());
        format!("{h}..{}", B64.encode(sig.to_bytes()))
    }

    #[tokio::test]
    async fn a_webhook_verifies_only_as_signed_and_only_while_fresh() {
        let base = stub(Seen::default()).await;
        let cloud = Cloud::for_test(&base);
        let body = br#"{"event_type":"send.otp","event_id":"e1"}"#;
        let now = (now_secs() * 1000).to_string();
        let sig = webhook_signature(&signing_key(), &now, body);
        assert!(cloud.verify_webhook(&sig, KID, &now, body).await, "a genuine delivery");
        assert!(!cloud.verify_webhook(&sig, KID, &now, br#"{"event_type":"send.otp","event_id":"e2"}"#).await, "another body");
        let later = (now_secs() * 1000 + 1).to_string();
        assert!(!cloud.verify_webhook(&sig, KID, &later, body).await, "another timestamp");
        let stale = ((now_secs() - 600) * 1000).to_string();
        let stale_sig = webhook_signature(&signing_key(), &stale, body);
        assert!(!cloud.verify_webhook(&stale_sig, KID, &stale, body).await, "ten minutes old");
        let forged = webhook_signature(&SigningKey::from_bytes(&[9u8; 32]), &now, body);
        assert!(!cloud.verify_webhook(&forged, KID, &now, body).await, "another key");
        assert!(!cloud.verify_webhook("", KID, &now, body).await, "no signature");
    }

    #[tokio::test]
    async fn a_valid_access_token_resolves_to_its_team() {
        let base = stub(Seen::default()).await;
        let cloud = Cloud::for_test(&base);
        let team = cloud
            .team_for_token(&token(&base, &signing_key(), KID, fresh(), USER))
            .await
            .expect("should resolve");
        assert_eq!(team.id, "team-abc");
        assert_eq!(team.name, "Platform team");
    }

    /// Rooms and memory provenance both need the person, not just the team,
    /// and both must get them from Neon rather than from the browser.
    #[tokio::test]
    async fn a_valid_access_token_resolves_to_the_person_behind_it() {
        let base = stub(Seen::default()).await;
        let cloud = Cloud::for_test(&base);
        let who = cloud
            .principal_for_token(&token(&base, &signing_key(), KID, fresh(), USER))
            .await
            .expect("should resolve");
        assert_eq!(who.email, "ash@example.com");
        assert_eq!(who.user_id, USER);
        assert_eq!(who.role, "admin");
        assert_eq!(who.team.id, "team-abc");
    }

    /// The relay holds no database secret: the Data API is asked with the
    /// person's own token, so row-level security bounds what it returns.
    #[tokio::test]
    async fn the_membership_read_carries_the_persons_own_token() {
        let seen = Seen::default();
        let base = stub(seen.clone()).await;
        let cloud = Cloud::for_test(&base);
        let tok = token(&base, &signing_key(), KID, fresh(), USER);
        cloud.team_for_token(&tok).await.expect("should resolve");
        assert_eq!(*seen.data_auth.lock().unwrap(), Some(format!("Bearer {tok}")));
    }

    #[tokio::test]
    async fn a_token_signed_by_another_key_authenticates_nothing() {
        let base = stub(Seen::default()).await;
        let cloud = Cloud::for_test(&base);
        let forged = token(&base, &SigningKey::from_bytes(&[9u8; 32]), KID, fresh(), USER);
        assert!(cloud.team_for_token(&forged).await.is_none());
    }

    #[tokio::test]
    async fn an_expired_token_authenticates_nothing() {
        let base = stub(Seen::default()).await;
        let cloud = Cloud::for_test(&base);
        let stale = token(&base, &signing_key(), KID, now_secs() - 120, USER);
        assert!(cloud.team_for_token(&stale).await.is_none());
    }

    /// A token from another Neon branch is signed by that branch's keys, but
    /// the issuer check is what refuses it even if the keys were shared.
    #[tokio::test]
    async fn a_token_for_another_issuer_authenticates_nothing() {
        let base = stub(Seen::default()).await;
        let cloud = Cloud::for_test(&base);
        let elsewhere = token("https://other.example", &signing_key(), KID, fresh(), USER);
        assert!(cloud.team_for_token(&elsewhere).await.is_none());
    }

    /// `alg` is pinned. A token that names another algorithm is refused
    /// before its signature is even looked at.
    #[tokio::test]
    async fn a_token_naming_another_algorithm_authenticates_nothing() {
        let base = stub(Seen::default()).await;
        let cloud = Cloud::for_test(&base);
        let good = token(&base, &signing_key(), KID, fresh(), USER);
        let rest = good.split_once('.').unwrap().1;
        let none = format!("{}.{rest}", B64.encode(r#"{"alg":"none","kid":"test-key"}"#));
        assert!(cloud.team_for_token(&none).await.is_none());
    }

    /// An unknown `kid` sends the relay back to the JWKS once, for a key
    /// rotation, and then not again until the refresh window passes.
    #[tokio::test]
    async fn unknown_key_ids_do_not_turn_into_a_stream_of_fetches() {
        let seen = Seen::default();
        let base = stub(seen.clone()).await;
        let cloud = Cloud::for_test(&base);
        for i in 0..5 {
            let t = token(&base, &signing_key(), &format!("made-up-{i}"), fresh(), USER);
            assert!(cloud.team_for_token(&t).await.is_none());
        }
        assert_eq!(*seen.jwks_fetches.lock().unwrap(), 1);
    }

    /// A refusal is cached like a success. Without that, a stale console tab
    /// retrying every few seconds becomes a request amplifier against Neon.
    #[tokio::test]
    async fn refusals_are_cached_too() {
        let cloud = Cloud::for_test("http://127.0.0.1:1"); // nothing listening
        assert!(cloud.team_for_token("good.token.sig").await.is_none());
        assert!(cloud.cache.lock().unwrap().contains_key("good.token.sig"));
    }

    #[test]
    fn the_issuer_is_the_origin_of_the_auth_url() {
        let cloud = Cloud::new(
            "https://ep-x.neonauth.c-6.eu-central-1.aws.neon.tech/neondb/auth/",
            "https://ep-x.apirest.c-6.eu-central-1.aws.neon.tech/neondb/rest/v1",
            reqwest::Client::new(),
        );
        assert_eq!(cloud.issuer(), "https://ep-x.neonauth.c-6.eu-central-1.aws.neon.tech");
    }

    #[test]
    fn jwt_shape_is_distinguishable_from_an_agent_token() {
        assert!(Cloud::looks_like_jwt("eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiIxIn0.c2ln"));
        // Agent tokens are one hex run with a prefix; they must not be sent to
        // Neon, or a revoked token would produce a confusing network error
        // instead of a clean refusal.
        assert!(!Cloud::looks_like_jwt("knt_2f6c9a1b3d4e5f60718293a4b5c6d7e8"));
        assert!(!Cloud::looks_like_jwt("a.b"));
        assert!(!Cloud::looks_like_jwt("a.b.c.d"));
        assert!(!Cloud::looks_like_jwt("a..c"));
        assert!(!Cloud::looks_like_jwt("a.b!.c"));
    }
}
