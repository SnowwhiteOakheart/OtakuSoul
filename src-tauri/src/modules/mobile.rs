//! Mobiler Web-Client (LAN): Der Chat läuft weiter im Hauptfenster, das Handy ist nur ein zweites
//! Eingabe- und Anzeigefenster. Nachrichten vom Handy gehen als Ereignis [`INBOX_EVENT`] an das
//! Hauptfenster (normale Chat-Pipeline: Figur, Gedächtnis, Stimme); das Hauptfenster meldet
//! Zustand und Verlauf zurück ([`MobileHub::push`]), der Web-Server reicht sie über `/api/ws` an
//! die offenen Seiten weiter.

use serde_json::{Map, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

/// Die Seite, die das Handy lädt (`/`; der Token steht im Adress-Fragment).
pub const PAGE: &str = include_str!("mobile.html");

/// Ereignis an das Hauptfenster: `{ "text": "…" }`, eine Nachricht vom Handy.
pub const INBOX_EVENT: &str = "mobile-message";
/// Längste Nachricht, die vom Handy angenommen wird (Zeichen).
pub const MAX_INCOMING_CHARS: usize = 8000;

const MAX_PORTRAIT_BYTES: usize = 3 * 1024 * 1024;
const MAX_TEXT_CHARS: usize = 4000;
const MAX_MESSAGES: usize = 80;
const STATE_KEYS: [&str; 4] = ["characterName", "emotion", "thinking", "portrait"];
const NOTICE_CODES: [&str; 3] = ["busy", "failed", "noChat"];

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Wird beim Start gesetzt; ohne Handle kann keine Handy-Nachricht zugestellt werden.
pub fn set_app(app: AppHandle) {
    let _ = APP.set(app);
}

/// Reicht eine Nachricht vom Handy an das Hauptfenster weiter.
pub fn deliver(text: &str) -> Result<(), String> {
    let app = APP.get().ok_or("no app handle")?;
    app.emit(INBOX_EVENT, serde_json::json!({ "text": text }))
        .map_err(|e| e.to_string())
}

pub struct MobileHub {
    tx: broadcast::Sender<String>,
    /// Zusammengeführter letzter Zustand (Name, Stimmung, Porträt, „denkt“).
    state: Mutex<Map<String, Value>>,
    /// Letzter Verlauf als fertige `history`-Nachricht.
    history: Mutex<Option<String>>,
    clients: AtomicUsize,
}

pub struct ClientGuard(&'static MobileHub);

impl Drop for ClientGuard {
    fn drop(&mut self) {
        self.0.clients.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn hub() -> &'static MobileHub {
    static HUB: OnceLock<MobileHub> = OnceLock::new();
    HUB.get_or_init(|| MobileHub {
        tx: broadcast::channel(32).0,
        state: Mutex::new(Map::new()),
        history: Mutex::new(None),
        clients: AtomicUsize::new(0),
    })
}

fn short(text: &str) -> String {
    text.chars().take(MAX_TEXT_CHARS).collect()
}

/// Eine bereinigte Nachricht für die Seiten oder `None`, wenn sie nicht zu uns gehört.
///
/// - `state`: Name, Stimmung, `thinking`, Porträt (nur `data:image/…`, leer = entfernen)
/// - `history`: `{messages: [{role: user|assistant, text, name?}]}`, die letzten Nachrichten des
///   offenen Chats (`name` nur bei Gästen im Gruppen-Chat)
/// - `notice`: `{code}`, ein Hinweis an das Handy (`busy`, `failed`, `noChat`)
fn sanitize(message: &Value) -> Option<Value> {
    match message.get("type")?.as_str()? {
        "state" => {
            let mut out = Map::new();
            out.insert("type".into(), "state".into());
            for key in STATE_KEYS {
                let Some(value) = message.get(key) else {
                    continue;
                };
                let keep = match key {
                    "portrait" => value.as_str().is_some_and(|p| {
                        p.is_empty()
                            || (p.starts_with("data:image/") && p.len() <= MAX_PORTRAIT_BYTES)
                    }),
                    "thinking" => value.is_boolean(),
                    _ => value.is_string(),
                };
                if keep {
                    let value = match value.as_str() {
                        Some(text) if key != "portrait" => Value::String(short(text)),
                        _ => value.clone(),
                    };
                    out.insert(key.into(), value);
                }
            }
            Some(Value::Object(out))
        }
        "history" => {
            let list = message.get("messages")?.as_array()?;
            let start = list.len().saturating_sub(MAX_MESSAGES);
            let messages: Vec<Value> = list[start..]
                .iter()
                .filter_map(|m| {
                    let role = m.get("role")?.as_str()?;
                    if role != "user" && role != "assistant" {
                        return None;
                    }
                    let text = m.get("text")?.as_str()?;
                    let mut out = serde_json::json!({ "role": role, "text": short(text) });
                    // Speaker of a guest's reply in a group chat.
                    if let Some(name) = m.get("name").and_then(Value::as_str) {
                        out["name"] = Value::String(name.chars().take(80).collect());
                    }
                    Some(out)
                })
                .collect();
            Some(serde_json::json!({ "type": "history", "messages": messages }))
        }
        "notice" => {
            let code = message.get("code")?.as_str()?;
            NOTICE_CODES
                .contains(&code)
                .then(|| serde_json::json!({ "type": "notice", "code": code }))
        }
        _ => None,
    }
}

impl MobileHub {
    /// Nimmt eine Nachricht des Hauptfensters an, merkt sich Zustand und Verlauf und gibt sie an
    /// die offenen Seiten weiter. Rückgabe: Zahl offener Seiten (das Hauptfenster spart sich
    /// sonst große Porträts und den Verlauf).
    pub fn push(&self, message: &Value) -> usize {
        let Some(clean) = sanitize(message) else {
            return self.clients.load(Ordering::SeqCst);
        };
        match clean["type"].as_str() {
            Some("state") => {
                if let Some(fields) = clean.as_object() {
                    let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
                    for (key, value) in fields {
                        if key != "type" {
                            state.insert(key.clone(), value.clone());
                        }
                    }
                }
            }
            Some("history") => {
                *self.history.lock().unwrap_or_else(|e| e.into_inner()) = Some(clean.to_string());
            }
            _ => {}
        }
        let _ = self.tx.send(clean.to_string());
        self.clients.load(Ordering::SeqCst)
    }

    /// Alles, was eine neu verbundene Seite zuerst bekommt: Zustand, dann Verlauf.
    pub fn snapshot(&self) -> Vec<String> {
        let mut out = Vec::new();
        {
            let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            if !state.is_empty() {
                let mut message = state.clone();
                message.insert("type".into(), "state".into());
                out.push(Value::Object(message).to_string());
            }
        }
        if let Some(history) = self
            .history
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
        {
            out.push(history);
        }
        out
    }

    /// Kurzer Zustand für `/api/status` (ohne Porträt).
    pub fn status(&self) -> Value {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        serde_json::json!({
            "character_name": state.get("characterName").cloned().unwrap_or(Value::Null),
            "emotion": state.get("emotion").cloned().unwrap_or(Value::Null),
            "thinking": state.get("thinking").cloned().unwrap_or(Value::Bool(false)),
            "desktop_ready": APP.get().is_some() && !state.is_empty(),
        })
    }

    pub fn subscribe(&'static self) -> (broadcast::Receiver<String>, ClientGuard) {
        self.clients.fetch_add(1, Ordering::SeqCst);
        (self.tx.subscribe(), ClientGuard(self))
    }

    #[cfg(test)]
    fn clients(&self) -> usize {
        self.clients.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fresh() -> &'static MobileHub {
        Box::leak(Box::new(MobileHub {
            tx: broadcast::channel(16).0,
            state: Mutex::new(Map::new()),
            history: Mutex::new(None),
            clients: AtomicUsize::new(0),
        }))
    }

    #[test]
    fn state_is_merged_and_unknown_keys_are_dropped() {
        let hub = fresh();
        assert!(hub.snapshot().is_empty());
        hub.push(&json!({ "type": "state", "characterName": "Lirwen", "emotion": "joy", "x": 1 }));
        hub.push(&json!({ "type": "state", "emotion": "sadness", "thinking": true }));
        let snap: Value = serde_json::from_str(&hub.snapshot()[0]).unwrap();
        assert_eq!(snap["characterName"], "Lirwen");
        assert_eq!(snap["emotion"], "sadness");
        assert_eq!(snap["thinking"], true);
        assert!(snap.get("x").is_none());
    }

    #[test]
    fn foreign_portraits_are_not_forwarded() {
        let hub = fresh();
        hub.push(&json!({ "type": "state", "portrait": "https://evil.example/x.png" }));
        assert!(hub.snapshot().iter().all(|s| !s.contains("evil")));
        hub.push(&json!({ "type": "state", "portrait": "data:image/png;base64,AAAA" }));
        let snap: Value = serde_json::from_str(&hub.snapshot()[0]).unwrap();
        assert_eq!(snap["portrait"], "data:image/png;base64,AAAA");
    }

    #[test]
    fn history_keeps_only_user_and_assistant_and_the_last_messages() {
        let hub = fresh();
        let mut list = vec![
            json!({ "role": "system", "text": "geheim" }),
            json!({ "role": "assistant", "text": "Gast", "name": 7 }),
        ];
        for i in 0..100 {
            let role = if i % 2 == 0 { "user" } else { "assistant" };
            list.push(json!({ "role": role, "text": format!("n{i}") }));
        }
        hub.push(&json!({ "type": "history", "messages": list }));
        let snap: Value = serde_json::from_str(&hub.snapshot()[0]).unwrap();
        let messages = snap["messages"].as_array().unwrap();
        assert_eq!(messages.len(), MAX_MESSAGES);
        assert_eq!(messages.last().unwrap()["text"], "n99");
        assert!(messages.iter().all(|m| m["role"] != "system"));
        hub.push(&json!({ "type": "history", "messages": [{ "role": "assistant", "text": "Hi", "name": "Lirwen" }] }));
        let snap: Value = serde_json::from_str(&hub.snapshot()[0]).unwrap();
        assert_eq!(snap["messages"][0]["name"], "Lirwen");
    }

    #[tokio::test]
    async fn pages_get_notices_but_not_unknown_messages() {
        let hub = fresh();
        let (mut feed, guard) = hub.subscribe();
        assert_eq!(hub.clients(), 1);
        hub.push(&json!({ "type": "notice", "code": "busy" }));
        hub.push(&json!({ "type": "notice", "code": "other" }));
        hub.push(&json!({ "type": "exec" }));
        let notice: Value = serde_json::from_str(&feed.recv().await.unwrap()).unwrap();
        assert_eq!(notice["code"], "busy");
        assert!(feed.try_recv().is_err());
        // Hinweise sind flüchtig.
        assert!(hub.snapshot().is_empty());
        drop(guard);
        assert_eq!(hub.clients(), 0);
    }
}
