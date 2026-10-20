//! "Sign in with OpenRouter": OAuth with PKCE instead of copying an API key. The app opens
//! OpenRouter in the browser with a callback to a short-lived listener on localhost (OpenRouter
//! allows any port there), exchanges the returned code for a key of the user's own account and,
//! for an account without credit, picks a free model. See
//! <https://openrouter.ai/docs/guides/overview/auth/oauth>.

use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::LazyLock;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Notify;
use ts_rs::TS;

const AUTH_URL: &str = "https://openrouter.ai/auth";
const API: &str = "https://openrouter.ai/api/v1";
/// How long the browser may take before the sign-in counts as abandoned.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
/// Free models that write good role-play in German, English and Russian, best first (prefixes:
/// the list changes often, so newer versions of the same family match too).
const PREFERRED_FREE: &[&str] = &[
    "google/gemma-4-31b",
    "google/gemma-4-26b",
    "google/gemma",
    "minimax/",
    "thinkingmachines/inkling:",
    "nvidia/nemotron-3-super",
    "nvidia/nemotron-3-ultra",
];
/// Free models that are no chat partners.
const NOT_FOR_CHAT: &[&str] = &["safety", "guard", "code", "embed"];
/// Smallest context a chosen free model must offer.
const MIN_CONTEXT: u64 = 32_768;

/// Ends a sign-in that is waiting for the browser.
static CANCEL: LazyLock<Notify> = LazyLock::new(Notify::new);

/// What the sign-in gave the app.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct OpenRouterLogin {
    /// API key of the user's own OpenRouter account.
    pub key: String,
    /// The account has never bought credit: only free models answer.
    pub free_tier: bool,
    /// A free model to start with (only for an account without credit).
    pub model: Option<String>,
}

/// Random verifier and its S256 challenge (base64url without padding, RFC 7636).
fn pkce_pair() -> (String, String) {
    let base64 = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let verifier = base64.encode(rand::random::<[u8; 32]>());
    let challenge = base64.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// The `code` of a callback request line (`GET /callback?code=…&state=… HTTP/1.1`) when its
/// state matches; `Err` when the user declined or the state is foreign, `Ok(None)` for other
/// requests (the browser's favicon).
fn callback_code(request_line: &str, state: &str) -> Result<Option<String>, String> {
    let Some(target) = request_line.split_whitespace().nth(1) else {
        return Ok(None);
    };
    let Ok(url) = reqwest::Url::parse(&format!("http://localhost{target}")) else {
        return Ok(None);
    };
    if url.path() != "/callback" {
        return Ok(None);
    }
    let query = |name: &str| {
        url.query_pairs()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.into_owned())
    };
    match query("code") {
        Some(code) if query("state").as_deref() == Some(state) => Ok(Some(code)),
        Some(_) => Err(crate::err!("backend.openrouter.stateMismatch")),
        None => Err(crate::err!("backend.openrouter.declined")),
    }
}

/// A free chat model from `/models` (id, context length), by `PREFERRED_FREE`, else the one with
/// the most context.
fn pick_free_model(models: &[(String, u64)]) -> Option<String> {
    let usable: Vec<&(String, u64)> = models
        .iter()
        .filter(|(id, context)| {
            id.ends_with(":free")
                && *context >= MIN_CONTEXT
                && !NOT_FOR_CHAT.iter().any(|word| id.contains(word))
        })
        .collect();
    PREFERRED_FREE
        .iter()
        .find_map(|prefix| usable.iter().find(|(id, _)| id.starts_with(prefix)))
        .or_else(|| usable.iter().max_by_key(|(_, context)| *context))
        .map(|(id, _)| id.clone())
}

/// Answers the browser with a short page; the user goes back to the app from there.
async fn reply(stream: &mut TcpStream, status: &str, text: &str) {
    let body = format!(
        "<!doctype html><meta charset=\"utf-8\"><title>OtakuSoul</title><body style=\"font-family:sans-serif;background:#0b0b14;color:#e2e8f0;display:grid;place-items:center;height:90vh\"><p>{text}</p></body>"
    );
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
}

/// Waits on both listeners for the callback with the code; the browser page speaks `language`
/// (the interface language).
async fn wait_for_code(
    listeners: &[TcpListener],
    state: &str,
    language: &str,
) -> Result<String, String> {
    let text = |key: &str, german: &str| {
        crate::modules::ui_locales::ui_text(language, key).unwrap_or_else(|| german.to_string())
    };
    loop {
        let accept = futures_accept(listeners).await;
        let Ok(mut stream) = accept else { continue };
        let mut buffer = vec![0u8; 8192];
        let read = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut buffer))
            .await
            .ok()
            .and_then(Result::ok)
            .unwrap_or(0);
        let request = String::from_utf8_lossy(&buffer[..read]);
        let line = request.lines().next().unwrap_or_default();
        match callback_code(line, state) {
            Ok(Some(code)) => {
                reply(
                    &mut stream,
                    "200 OK",
                    &text(
                        "openrouter.browserDone",
                        "Angemeldet – du kannst zu OtakuSoul zurückkehren.",
                    ),
                )
                .await;
                return Ok(code);
            }
            Ok(None) => reply(&mut stream, "404 Not Found", "").await,
            Err(error) => {
                reply(
                    &mut stream,
                    "200 OK",
                    &text(
                        "openrouter.browserDeclined",
                        "Anmeldung abgebrochen – du kannst zu OtakuSoul zurückkehren.",
                    ),
                )
                .await;
                return Err(error);
            }
        }
    }
}

/// The next connection on any of the listeners.
async fn futures_accept(listeners: &[TcpListener]) -> std::io::Result<TcpStream> {
    match listeners {
        [one] => one.accept().await.map(|(stream, _)| stream),
        [first, second, ..] => tokio::select! {
            accepted = first.accept() => accepted.map(|(stream, _)| stream),
            accepted = second.accept() => accepted.map(|(stream, _)| stream),
        },
        [] => std::future::pending().await,
    }
}

/// Runs the whole sign-in: browser, callback, key exchange, free-model choice.
pub async fn login(app: &tauri::AppHandle, language: &str) -> Result<OpenRouterLogin, String> {
    use tauri_plugin_opener::OpenerExt;
    // `localhost` may resolve to IPv4 or IPv6 in the browser: listen on both, same port.
    let v4 = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| crate::err!("backend.openrouter.listen", error = e))?;
    let port = v4
        .local_addr()
        .map_err(|e| crate::err!("backend.openrouter.listen", error = e))?
        .port();
    let mut listeners = vec![v4];
    if let Ok(v6) = TcpListener::bind(("::1", port)).await {
        listeners.push(v6);
    }

    let (verifier, challenge) = pkce_pair();
    let state = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(rand::random::<[u8; 16]>());
    let mut url = reqwest::Url::parse(AUTH_URL).expect("valid constant URL");
    url.query_pairs_mut()
        .append_pair("callback_url", &format!("http://localhost:{port}/callback"))
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("key_label", "OtakuSoul")
        .append_pair("state", &state);
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| crate::err!("backend.openrouter.browser", error = e))?;

    let code = tokio::select! {
        code = wait_for_code(&listeners, &state, language) => code?,
        _ = tokio::time::sleep(LOGIN_TIMEOUT) => return Err(crate::err!("backend.openrouter.timeout")),
        _ = CANCEL.notified() => return Err(crate::err!("backend.openrouter.cancelled")),
    };
    drop(listeners);
    exchange(&code, &verifier).await
}

/// Ends a waiting sign-in (the user closed the dialog).
pub fn cancel() {
    CANCEL.notify_waiters();
}

/// Swaps the code for the key, then looks at the account for the model choice.
async fn exchange(code: &str, verifier: &str) -> Result<OpenRouterLogin, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
    let response = client
        .post(format!("{API}/auth/keys"))
        .json(&serde_json::json!({
            "code": code,
            "code_verifier": verifier,
            "code_challenge_method": "S256",
        }))
        .send()
        .await
        .map_err(|e| crate::err!("backend.openrouter.exchange", error = e))?;
    if !response.status().is_success() {
        // OpenRouter answers `{"error": {"message": "Invalid code", …}}`.
        let body = response.text().await.unwrap_or_default();
        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|json| json["error"]["message"].as_str().map(str::to_string))
            .unwrap_or(body);
        return Err(crate::err!("backend.openrouter.exchange", error = message));
    }
    let key = response
        .json::<serde_json::Value>()
        .await
        .ok()
        .and_then(|json| json["key"].as_str().map(str::to_string))
        .filter(|key| !key.is_empty())
        .ok_or_else(|| crate::err!("backend.openrouter.exchange", error = "no key"))?;

    // Without credit only free models answer; a failed look leaves the model as it was.
    let free_tier = client
        .get(format!("{API}/key"))
        .bearer_auth(&key)
        .send()
        .await
        .ok()
        .filter(|r| r.status().is_success());
    let free_tier = match free_tier {
        Some(response) => response
            .json::<serde_json::Value>()
            .await
            .ok()
            .and_then(|json| json["data"]["is_free_tier"].as_bool())
            .unwrap_or(false),
        None => false,
    };
    let model = if free_tier {
        free_models(&client)
            .await
            .and_then(|models| pick_free_model(&models))
    } else {
        None
    };
    Ok(OpenRouterLogin {
        key,
        free_tier,
        model,
    })
}

async fn free_models(client: &reqwest::Client) -> Option<Vec<(String, u64)>> {
    let json: serde_json::Value = client
        .get(format!("{API}/models"))
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    Some(
        json["data"]
            .as_array()?
            .iter()
            .filter_map(|m| {
                Some((
                    m["id"].as_str()?.to_string(),
                    m["context_length"].as_u64().unwrap_or(0),
                ))
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_the_s256_of_the_verifier() {
        let (verifier, challenge) = pkce_pair();
        assert_eq!(verifier.len(), 43);
        let expected = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(Sha256::digest(verifier.as_bytes()));
        assert_eq!(challenge, expected);
        assert!(!challenge.contains(['=', '+', '/']));
        // RFC 7636 appendix B.
        let rfc = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(
            b"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        ));
        assert_eq!(rfc, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn the_callback_must_carry_our_state() {
        assert_eq!(
            callback_code("GET /callback?code=abc&state=s1 HTTP/1.1", "s1").unwrap(),
            Some("abc".to_string())
        );
        assert!(callback_code("GET /callback?code=abc&state=other HTTP/1.1", "s1").is_err());
        assert!(callback_code("GET /callback?error=access_denied HTTP/1.1", "s1").is_err());
        assert_eq!(
            callback_code("GET /favicon.ico HTTP/1.1", "s1").unwrap(),
            None
        );
    }

    #[tokio::test]
    async fn the_local_callback_answers_the_browser_and_returns_the_code() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let browser = tokio::spawn(async move {
            let get = |path: &'static str| async move {
                let mut stream = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
                stream
                    .write_all(format!("GET {path} HTTP/1.1\r\nHost: localhost\r\n\r\n").as_bytes())
                    .await
                    .unwrap();
                let mut page = String::new();
                stream.read_to_string(&mut page).await.unwrap();
                page
            };
            let favicon = get("/favicon.ico").await;
            let done = get("/callback?code=c0de&state=s1").await;
            (favicon, done)
        });
        let code = wait_for_code(&[listener], "s1", "de").await.unwrap();
        let (favicon, done) = browser.await.unwrap();
        assert_eq!(code, "c0de");
        assert!(favicon.starts_with("HTTP/1.1 404"));
        assert!(done.starts_with("HTTP/1.1 200") && done.contains("OtakuSoul"));
    }

    #[test]
    fn a_free_chat_model_is_picked_by_preference_then_context() {
        let models = |ids: &[(&str, u64)]| {
            ids.iter()
                .map(|(id, c)| (id.to_string(), *c))
                .collect::<Vec<_>>()
        };
        let list = models(&[
            ("nvidia/nemotron-3.5-content-safety:free", 128_000),
            ("thinkingmachines/inkling:free", 1_048_576),
            ("google/gemma-4-31b-it:free", 262_144),
            ("anthropic/claude-sonnet-5", 1_000_000),
        ]);
        assert_eq!(
            pick_free_model(&list).as_deref(),
            Some("google/gemma-4-31b-it:free")
        );
        let unknown = models(&[
            ("liquid/lfm-2.5-2.6b:free", 65_536),
            ("someone/big-model:free", 200_000),
            ("cohere/north-mini-code:free", 256_000),
            ("tiny/model:free", 8_192),
        ]);
        assert_eq!(
            pick_free_model(&unknown).as_deref(),
            Some("someone/big-model:free")
        );
        assert_eq!(pick_free_model(&models(&[("a/b", 100_000)])), None);
    }
}
