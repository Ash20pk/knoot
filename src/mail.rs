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
    /// Where a reply goes, when not to the sender. An invitation sets it to
    /// the admin who sent it: a question about joining is theirs to answer.
    pub reply_to: Option<String>,
}

#[derive(Clone)]
pub struct Mailer {
    http: reqwest::Client,
    key: String,
    /// `Ash from knoot <ash@knoot.dev>`: a verified sender on the Resend
    /// account, and a real inbox, since the welcome asks people to reply.
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
    ///   KNOOT_MAIL_FROM  the sender, e.g. `Ash from knoot <ash@knoot.dev>`
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
        let mut body = serde_json::json!({
            "from": self.from,
            "to": [email.to],
            "subject": email.subject,
            "text": email.text,
            "html": email.html,
        });
        if let Some(r) = &email.reply_to {
            body["reply_to"] = serde_json::json!([r]);
        }
        let resp = self
            .http
            .post(format!("{}/emails", self.api))
            .bearer_auth(&self.key)
            .header("Idempotency-Key", idempotency)
            .json(&body)
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
knoot.dev: shared memory and coordination for your team's coding agents.</p></div></body></html>",
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
    Email { to: to.to_string(), subject, text, html, reply_to: Some(inviter.to_string()) }
}

/// What a one-time code is for, in Neon Auth's words, and how a message
/// about it reads.
fn code_purpose(kind: &str) -> (&'static str, &'static str) {
    match kind {
        "sign-in" => ("Your knoot.dev sign-in code", "Enter this code to sign in to knoot.dev."),
        "forget-password" => ("Your knoot.dev password reset code", "Enter this code to choose a new password for knoot.dev."),
        _ => ("Confirm your email for knoot.dev", "Enter this code to confirm your address and finish creating your knoot.dev account."),
    }
}

/// A one-time code Neon Auth issued and handed to the relay to deliver.
/// `minutes` is how long it lasts, from the code's own expiry.
pub fn code_email(to: &str, code: &str, kind: &str, minutes: u64) -> Email {
    let (subject, ask) = code_purpose(kind);
    let lasts = if minutes == 1 { "1 minute".to_string() } else { format!("{minutes} minutes") };
    let text = format!(
        "{ask}\n\n    {code}\n\nIt expires in {lasts}. If you did not ask for it, ignore this email: \
         nothing happens without the code.\n"
    );
    let html = frame(
        subject,
        &format!(
            "<p>{}</p>\
<div style=\"margin:22px 0;padding:16px 18px;background:#031007;border:1px solid #0f3a1a;color:#00ff41;\
font-size:30px;font-weight:800;letter-spacing:8px;text-shadow:0 0 10px rgba(0,255,65,.45)\">{}</div>\
<p style=\"color:#7fcf93\">It expires in {}. If you did not ask for it, ignore this email: nothing happens without the code.</p>",
            esc(ask),
            esc(code),
            esc(&lasts)
        ),
    );
    Email { to: to.to_string(), subject: subject.to_string(), text, html, reply_to: None }
}

/// A sign-in, confirmation or reset link Neon Auth issued for the relay to
/// deliver. The link is Neon's own, pointing back at this site.
pub fn link_email(to: &str, link: &str, kind: &str) -> Email {
    let (subject, ask, label) = match kind {
        "sign-in" => ("Sign in to knoot.dev", "Follow this link to sign in to knoot.dev.", "Sign in"),
        "forget-password" => ("Reset your knoot.dev password", "Follow this link to choose a new password for knoot.dev.", "Choose a new password"),
        _ => ("Confirm your email for knoot.dev", "Follow this link to confirm your address for knoot.dev.", "Confirm my address"),
    };
    let text = format!("{ask}\n\n{link}\n\nIf you did not ask for it, ignore this email.\n");
    let html = frame(
        subject,
        &format!(
            "<p>{}</p>{}<p style=\"color:#7fcf93\">If you did not ask for it, ignore this email.</p>\
<p style=\"color:#4fa463;font-size:12.5px;word-break:break-all\">{}</p>",
            esc(ask),
            button(link, label),
            esc(link)
        ),
    );
    Email { to: to.to_string(), subject: subject.to_string(), text, html, reply_to: None }
}

/// The first email after someone joins: a short note from Ash, the three
/// commands, and an invitation to reply. In the same frame as the invitation,
/// but written as a person, not a notification.
pub fn welcome_email(to: &str, team: &str, base: &str) -> Email {
    let relay = base.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1) + "/ws";
    let console = format!("{base}/app/");
    let docs = format!("{base}/docs/");
    let install = "curl -fsSL https://raw.githubusercontent.com/Ash20pk/knoot/main/install.sh | sh";
    let join = format!("knoot join <your device key> --relay {relay}");
    let init = format!("knoot init --relay {relay}");
    let subject = "Welcome to knoot.dev".to_string();
    let text = format!(
        "Hi,\n\n\
         I'm Ash, I build knoot.dev. You're in {team} now, so here's how to get your agents onto it.\n\n\
         1. Install it:\n   {install}\n\n\
         2. On each machine, with a device key from the console ({console}):\n   {join}\n\n\
         3. In each repository:\n   {init}\n\n\
         Then `knoot status` tells you whether coordination is actually on. The docs cover the rest: {docs}\n\n\
         If anything is confusing or broken, just reply. This comes straight to me and I read every one.\n\n\
         Ash\n\
         Founder, knoot.dev\n"
    );
    let code = |c: &str| {
        format!(
            "<div style=\"background:#031007;border:1px solid #0f3a1a;padding:10px 12px;margin:6px 0 16px;\
color:#00ff41;font-size:13px;word-break:break-all\">{}</div>",
            esc(c)
        )
    };
    let step = |s: &str| format!("<p style=\"margin-bottom:0;color:#e6ffe9\">{s}</p>");
    let html = frame(
        &format!("You're in {team}"),
        &format!(
            "<p>Hi,</p>\
<p>I'm Ash, I build knoot.dev. You're in <b style=\"color:#e6ffe9\">{team}</b> now, so here's how to get your agents onto it.</p>\
{s1}{install}{s2}{join}{s3}{init}\
<p>Then <code style=\"color:#00ff41\">knoot status</code> tells you whether coordination is actually on. \
<a href=\"{docs}\" style=\"color:#00ff41\">The docs</a> cover the rest.</p>{button}\
<p>If anything is confusing or broken, just reply. This comes straight to me and I read every one.</p>\
<p style=\"margin-bottom:0;color:#e6ffe9\">Ash</p><p style=\"margin-top:0;color:#7fcf93\">Founder, knoot.dev</p>",
            team = esc(team),
            s1 = step("1. Install it"),
            install = code(install),
            s2 = step("2. On each machine, with a device key from the console"),
            join = code(&join),
            s3 = step("3. In each repository"),
            init = code(&init),
            docs = esc(&docs),
            button = button(&console, "Open the console"),
        ),
    );
    Email { to: to.to_string(), subject, text, html, reply_to: None }
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
        assert_eq!(e.reply_to.as_deref(), Some("ash@acme.test"), "replies go to the inviter");
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
        assert!(e.text.contains("just reply"), "a welcome invites a reply: {}", e.text);
        assert_eq!(e.reply_to, None, "and the reply goes to the sender");
    }

    #[test]
    fn a_team_name_cannot_inject_markup_into_the_welcome() {
        let e = welcome_email("p@x.test", "<img src=x>", "https://knoot.dev");
        assert!(!e.html.contains("<img"), "{}", e.html);
    }

    #[test]
    fn a_code_email_says_what_the_code_is_for_and_when_it_lapses() {
        let e = code_email("p@x.test", "348132", "email-verification", 10);
        assert!(e.subject.contains("Confirm"), "{}", e.subject);
        for body in [&e.text, &e.html] {
            assert!(body.contains("348132") && body.contains("10 minutes"), "{body}");
        }
        assert!(e.html.contains("background:#000"), "in the knoot frame");
        assert!(code_email("p@x.test", "1", "forget-password", 1).text.contains("1 minute."));
        assert!(code_email("p@x.test", "1", "sign-in", 5).subject.contains("sign-in"));
    }

    #[test]
    fn a_link_email_cannot_be_given_markup() {
        let e = link_email("p@x.test", "https://knoot.dev/x?a=\"><script>", "forget-password");
        assert!(!e.html.contains("<script>"), "{}", e.html);
        assert!(e.subject.contains("Reset"));
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
        let m = Mailer::new("re_test", "Ash from knoot <ash@knoot.dev>", &url, "https://knoot.dev");
        let id = m.send(&welcome_email("ash@acme.test", "acme", &m.public_url), "welcome:m_1").await.unwrap();
        assert_eq!(id, "em_123");
        let seen = seen.lock().unwrap();
        let (meta, body) = &seen[0];
        assert_eq!(meta, "welcome:m_1|Bearer re_test", "idempotency key and API key travel as headers");
        assert_eq!(body["from"], "Ash from knoot <ash@knoot.dev>");
        assert_eq!(body["to"][0], "ash@acme.test");
        assert!(body["html"].as_str().unwrap().contains("acme"));
        assert!(body.get("reply_to").is_none(), "no reply_to unless the message sets one");
    }
}
