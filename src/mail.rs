//! Email the relay sends on a person's behalf: a team invitation, and a
//! welcome the first time someone joins. Sent through Resend's HTTP API.
//!
//! Optional, like everything outside the claim path. A relay with no
//! `RESEND_API_KEY` sends nothing and says so, and the console falls back to
//! handing the admin the link to pass on themselves — which is how a
//! self-hosted relay with no mail provider works.
//!
//! What the relay will send is fixed here, not supplied by a caller: the
//! templates take a team name, an address and a link the relay built itself.
//! An endpoint that relayed arbitrary text to arbitrary addresses would be an
//! open mailer with knoot.dev's name on it.
//!
//! Sign-up confirmation is not here: Neon Auth sends it, through the same
//! Resend account over SMTP, so the code and the link come from where the
//! account lives.

use std::time::Duration;

/// A message ready to send.
#[derive(Debug, Clone, PartialEq)]
pub struct Email {
    pub to: String,
    pub subject: String,
    pub text: String,
    pub html: String,
}

#[derive(Clone)]
pub struct Mailer {
    http: reqwest::Client,
    key: String,
    /// `knoot <hello@knoot.dev>`: a verified sender on the Resend account.
    from: String,
    /// `https://api.resend.com`, or a test server.
    api: String,
    /// Where links in mail point: `https://knoot.dev`.
    pub public_url: String,
}

impl Mailer {
    /// Configured from the environment, or `None` — and then no mail is sent.
    ///
    ///   RESEND_API_KEY   a sending key, restricted to the knoot domain
    ///   KNOOT_MAIL_FROM  the sender, e.g. `knoot <hello@knoot.dev>`
    ///   KNOOT_PUBLIC_URL where links point, e.g. `https://knoot.dev`
    pub fn from_env() -> Option<Self> {
        let key = crate::config::env_or_legacy("RESEND_API_KEY")?;
        let from = crate::config::env_or_legacy("KNOOT_MAIL_FROM")?;
        let public_url = crate::config::env_or_legacy("KNOOT_PUBLIC_URL")?;
        let api = std::env::var("RESEND_API_URL").unwrap_or_else(|_| "https://api.resend.com".into());
        Some(Self::new(&key, &from, &api, &public_url))
    }

    pub fn new(key: &str, from: &str, api: &str, public_url: &str) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default();
        Self {
            http,
            key: key.to_string(),
            from: from.to_string(),
            api: api.trim_end_matches('/').to_string(),
            public_url: public_url.trim_end_matches('/').to_string(),
        }
    }

    /// Send one message. `idempotency` names it, so a retry of the same
    /// invitation or welcome is one email, not two: Resend drops a repeat of
    /// a key it has seen in the last day.
    pub async fn send(&self, email: &Email, idempotency: &str) -> Result<String, String> {
        let resp = self
            .http
            .post(format!("{}/emails", self.api))
            .bearer_auth(&self.key)
            .header("Idempotency-Key", idempotency)
            .json(&serde_json::json!({
                "from": self.from,
                "to": [email.to],
                "subject": email.subject,
                "text": email.text,
                "html": email.html,
            }))
            .send()
            .await
            .map_err(|e| format!("mail provider unreachable: {e}"))?;
        let status = resp.status();
        let body: serde_json::Value = resp.json().await.unwrap_or_default();
        if !status.is_success() {
            let why = body.get("message").and_then(|m| m.as_str()).unwrap_or("refused");
            return Err(format!("mail provider said {status}: {why}"));
        }
        Ok(body.get("id").and_then(|i| i.as_str()).unwrap_or_default().to_string())
    }
}

fn esc(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// The frame every message shares: black, green type, one column, the logo.
/// Inline styles only, because mail clients ignore most of everything else.
fn frame(heading: &str, body_html: &str) -> String {
    format!(
        "<!doctype html><html><body style=\"margin:0;padding:0;background:#000\">\
<div style=\"max-width:560px;margin:0 auto;padding:36px 28px;background:#000;color:#b9f6c7;\
font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:15px;line-height:1.6\">\
<div style=\"font-weight:800;font-size:17px;color:#e6ffe9\"><span style=\"color:#00ff41\">&gt;</span> knoot</div>\
<h1 style=\"margin:28px 0 14px;font-size:22px;color:#e6ffe9\">{}</h1>{}\
<p style=\"margin-top:36px;padding-top:16px;border-top:1px solid #0f3a1a;color:#4fa463;font-size:12.5px\">\
knoot: shared memory and coordination for your team's coding agents.</p></div></body></html>",
        esc(heading),
        body_html
    )
}

fn button(link: &str, label: &str) -> String {
    format!(
        "<p style=\"margin:26px 0\"><a href=\"{}\" style=\"display:inline-block;background:#00ff41;color:#00140a;\
font-weight:700;padding:12px 18px;text-decoration:none;border-radius:2px\">{}</a></p>",
        esc(link),
        esc(label)
    )
}

/// An invitation to join a team. `link` is built by the relay from the
/// invitation's own secret; `role` is `member` or `admin`.
pub fn invite_email(to: &str, team: &str, inviter: &str, role: &str, link: &str) -> Email {
    let as_role = if role == "admin" { "an admin" } else { "a member" };
    let subject = format!("{inviter} invited you to {team} on knoot");
    let text = format!(
        "{inviter} invited you to join {team} on knoot as {as_role}.\n\n\
         Accept the invitation:\n{link}\n\n\
         The link works only for {to}, and it lapses after seven days. If you did not expect \
         this, ignore it: nothing happens until it is accepted.\n"
    );
    let html = frame(
        &format!("Join {team} on knoot"),
        &format!(
            "<p><b style=\"color:#e6ffe9\">{}</b> invited you to join <b style=\"color:#e6ffe9\">{}</b> as {}.</p>{}\
<p style=\"color:#7fcf93\">The link works only for {}, and it lapses after seven days. If you did not \
expect this, ignore it: nothing happens until it is accepted.</p>\
<p style=\"color:#4fa463;font-size:12.5px;word-break:break-all\">{}</p>",
            esc(inviter),
            esc(team),
            as_role,
            button(link, "Accept the invitation"),
            esc(to),
            esc(link)
        ),
    );
    Email { to: to.to_string(), subject, text, html }
}

/// The first email after someone joins: what to run, in order.
pub fn welcome_email(to: &str, team: &str, base: &str) -> Email {
    let relay = base.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1) + "/ws";
    let console = format!("{base}/app/");
    let docs = format!("{base}/docs/");
    let subject = format!("Welcome to knoot, {team} is ready");
    let text = format!(
        "You're in {team} on knoot.\n\n\
         Three steps put your agents on it:\n\n\
         1. Install:            curl -fsSL https://raw.githubusercontent.com/Ash20pk/knoot/main/install.sh | sh\n\
         2. On each machine:    knoot join <your device key> --relay {relay}\n\
                                (mint the key in the console: {console})\n\
         3. In a repository:    knoot init --relay {relay}\n\n\
         Then run `knoot status` — it says whether coordination is really on.\n\n\
         Docs: {docs}\n"
    );
    let code = |c: &str| {
        format!(
            "<div style=\"background:#031007;border:1px solid #0f3a1a;padding:10px 12px;margin:6px 0 16px;\
color:#00ff41;font-size:13px;word-break:break-all\">{}</div>",
            esc(c)
        )
    };
    let html = frame(
        &format!("{team} is ready"),
        &format!(
            "<p>Three steps put your agents on it.</p>\
<p style=\"margin-bottom:0;color:#e6ffe9\">1. Install</p>{}\
<p style=\"margin-bottom:0;color:#e6ffe9\">2. On each machine, with a device key from the console</p>{}\
<p style=\"margin-bottom:0;color:#e6ffe9\">3. In a repository</p>{}\
<p>Then <code style=\"color:#00ff41\">knoot status</code> says whether coordination is really on.</p>{}\
<p style=\"color:#7fcf93\">The <a href=\"{}\" style=\"color:#00ff41\">docs</a> cover the rest.</p>",
            code("curl -fsSL https://raw.githubusercontent.com/Ash20pk/knoot/main/install.sh | sh"),
            code(&format!("knoot join <your device key> --relay {relay}")),
            code(&format!("knoot init --relay {relay}")),
            button(&console, "Open the console"),
            esc(&docs)
        ),
    );
    Email { to: to.to_string(), subject, text, html }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_invitation_names_the_team_the_inviter_and_where_it_works() {
        let e = invite_email("priya@acme.test", "acme", "ash@acme.test", "member", "https://knoot.dev/app/#join=kni_x");
        assert_eq!(e.to, "priya@acme.test");
        assert!(e.subject.contains("acme") && e.subject.contains("ash@acme.test"), "{}", e.subject);
        for body in [&e.text, &e.html] {
            assert!(body.contains("https://knoot.dev/app/#join=kni_x"), "the link: {body}");
            assert!(body.contains("priya@acme.test"), "only works for them: {body}");
            assert!(body.contains("seven days"), "{body}");
        }
    }

    #[test]
    fn a_team_name_cannot_inject_markup_into_the_html() {
        let e = invite_email("p@x.test", "<script>x</script>", "a@x.test", "admin", "https://knoot.dev/app/#join=k");
        assert!(!e.html.contains("<script>"), "{}", e.html);
        assert!(e.html.contains("&lt;script&gt;"));
        assert!(e.text.contains("an admin"));
    }

    #[test]
    fn a_welcome_points_at_this_relay() {
        let e = welcome_email("ash@acme.test", "acme", "https://knoot.dev");
        assert!(e.text.contains("knoot join <your device key> --relay wss://knoot.dev/ws"), "{}", e.text);
        assert!(e.text.contains("knoot init --relay wss://knoot.dev/ws"));
        assert!(e.html.contains("https://knoot.dev/app/"));
    }

    /// A stand-in for Resend: records what was posted and answers with an id.
    async fn fake_resend() -> (String, std::sync::Arc<std::sync::Mutex<Vec<(String, serde_json::Value)>>>) {
        use axum::{routing::post, Json, Router};
        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let s2 = seen.clone();
        let app = Router::new().route(
            "/emails",
            post(move |headers: axum::http::HeaderMap, Json(v): Json<serde_json::Value>| {
                let s2 = s2.clone();
                async move {
                    let key = headers.get("idempotency-key").and_then(|h| h.to_str().ok()).unwrap_or("").to_string();
                    let auth = headers.get("authorization").and_then(|h| h.to_str().ok()).unwrap_or("").to_string();
                    s2.lock().unwrap().push((format!("{key}|{auth}"), v));
                    Json(serde_json::json!({ "id": "em_123" }))
                }
            }),
        );
        let l = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = l.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(l, app).await.unwrap() });
        (format!("http://{addr}"), seen)
    }

    #[tokio::test]
    async fn a_message_goes_to_the_provider_as_the_configured_sender_with_its_key() {
        let (url, seen) = fake_resend().await;
        let m = Mailer::new("re_test", "knoot <hello@knoot.dev>", &url, "https://knoot.dev");
        let id = m.send(&welcome_email("ash@acme.test", "acme", &m.public_url), "welcome:m_1").await.unwrap();
        assert_eq!(id, "em_123");
        let seen = seen.lock().unwrap();
        let (meta, body) = &seen[0];
        assert_eq!(meta, "welcome:m_1|Bearer re_test", "idempotency key and API key travel as headers");
        assert_eq!(body["from"], "knoot <hello@knoot.dev>");
        assert_eq!(body["to"][0], "ash@acme.test");
        assert!(body["html"].as_str().unwrap().contains("acme"));
    }
}
