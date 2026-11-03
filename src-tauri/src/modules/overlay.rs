//! Streaming overlay: the active figure's portrait, mood and speech bubble as a transparent page
//! for OBS (browser source). The main window pushes what the figure does ([`OverlayHub::push`]),
//! the web server hands it to the open pages over a WebSocket (`/api/overlay-ws`).

use serde_json::{Map, Value};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use tokio::sync::broadcast;

/// The page OBS loads (`/overlay?token=…`).
pub const PAGE: &str = include_str!("overlay.html");

/// Portraits are data URLs and may be large; more than this is not forwarded.
const MAX_PORTRAIT_BYTES: usize = 6 * 1024 * 1024;
const MAX_TEXT_CHARS: usize = 2000;

/// Keys of a `state` message that are kept and shown (everything else is dropped).
const STATE_KEYS: [&str; 5] = [
    "characterName",
    "emotion",
    "expression",
    "thinking",
    "portrait",
];

pub struct OverlayHub {
    tx: broadcast::Sender<String>,
    /// The last known state, merged from all `state` messages; sent first to a page that connects.
    state: Mutex<Map<String, Value>>,
    clients: AtomicUsize,
}

/// Counts an open page; the count drops when the page's connection ends.
pub struct ClientGuard(&'static OverlayHub);

impl Drop for ClientGuard {
    fn drop(&mut self) {
        self.0.clients.fetch_sub(1, Ordering::SeqCst);
    }
}

pub fn hub() -> &'static OverlayHub {
    static HUB: OnceLock<OverlayHub> = OnceLock::new();
    HUB.get_or_init(|| OverlayHub {
        tx: broadcast::channel(64).0,
        state: Mutex::new(Map::new()),
        clients: AtomicUsize::new(0),
    })
}

fn short(text: &str) -> String {
    text.chars().take(MAX_TEXT_CHARS).collect()
}

/// A message cleaned for the pages, or `None` if it is none of ours.
///
/// - `state`: figure name, mood, expression, thinking, portrait (`data:image/…` only)
/// - `say`: `{text}`, a finished reply for the bubble
/// - `sentence`: `{text, ms}`, the sentence the voice reads now
/// - `audio`: `{amplitude}`, the voice's level (0–1) for the mouth
fn sanitize(message: &Value) -> Option<Value> {
    let kind = message.get("type")?.as_str()?;
    match kind {
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
        "say" | "sentence" => {
            let text = message.get("text")?.as_str()?;
            let mut out = Map::new();
            out.insert("type".into(), kind.into());
            out.insert("text".into(), Value::String(short(text)));
            if kind == "sentence" {
                let ms = message.get("ms").and_then(Value::as_u64).unwrap_or(3000);
                out.insert("ms".into(), ms.min(60_000).into());
            }
            Some(Value::Object(out))
        }
        "audio" => {
            let amplitude = message.get("amplitude").and_then(Value::as_f64)?;
            Some(serde_json::json!({ "type": "audio", "amplitude": amplitude.clamp(0.0, 1.0) }))
        }
        _ => None,
    }
}

impl OverlayHub {
    /// Takes a message from the main window: `state` messages are remembered (keys merged), all
    /// are forwarded to the open pages. Returns how many pages are open, so the sender can skip
    /// the rest (voice frames) while nobody watches.
    pub fn push(&self, message: &Value) -> usize {
        let Some(clean) = sanitize(message) else {
            return self.clients.load(Ordering::SeqCst);
        };
        if clean["type"] == "state"
            && let Some(fields) = clean.as_object()
        {
            let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
            for (key, value) in fields {
                if key != "type" {
                    state.insert(key.clone(), value.clone());
                }
            }
        }
        let _ = self.tx.send(clean.to_string());
        self.clients.load(Ordering::SeqCst)
    }

    /// The remembered state as one `state` message, if there is any.
    pub fn snapshot(&self) -> Option<String> {
        let state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.is_empty() {
            return None;
        }
        let mut message = state.clone();
        message.insert("type".into(), "state".into());
        Some(Value::Object(message).to_string())
    }

    /// A page connects: its feed of messages and the guard that counts it.
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

    fn fresh() -> &'static OverlayHub {
        Box::leak(Box::new(OverlayHub {
            tx: broadcast::channel(16).0,
            state: Mutex::new(Map::new()),
            clients: AtomicUsize::new(0),
        }))
    }

    #[test]
    fn states_are_merged_and_only_known_keys_survive() {
        let hub = fresh();
        assert!(hub.snapshot().is_none());
        hub.push(
            &json!({ "type": "state", "characterName": "Lirwen", "emotion": "joy", "secret": "x" }),
        );
        hub.push(&json!({ "type": "state", "emotion": "sadness", "thinking": true }));
        let snapshot: Value = serde_json::from_str(&hub.snapshot().unwrap()).unwrap();
        assert_eq!(snapshot["characterName"], "Lirwen");
        assert_eq!(snapshot["emotion"], "sadness");
        assert_eq!(snapshot["thinking"], true);
        assert!(snapshot.get("secret").is_none());
    }

    #[test]
    fn only_picture_data_urls_are_forwarded_and_an_empty_one_clears() {
        let hub = fresh();
        hub.push(&json!({ "type": "state", "portrait": "data:image/png;base64,AAAA" }));
        hub.push(&json!({ "type": "state", "portrait": "https://evil.example/x.png" }));
        let snapshot: Value = serde_json::from_str(&hub.snapshot().unwrap()).unwrap();
        assert_eq!(snapshot["portrait"], "data:image/png;base64,AAAA");
        hub.push(&json!({ "type": "state", "portrait": "" }));
        let snapshot: Value = serde_json::from_str(&hub.snapshot().unwrap()).unwrap();
        assert_eq!(snapshot["portrait"], "");
    }

    #[tokio::test]
    async fn pages_get_say_sentence_and_audio_but_not_unknown_messages() {
        let hub = fresh();
        let (mut feed, guard) = hub.subscribe();
        assert_eq!(hub.clients(), 1);
        assert_eq!(hub.push(&json!({ "type": "say", "text": "Hallo" })), 1);
        hub.push(&json!({ "type": "sentence", "text": "Ein Satz.", "ms": 999_999 }));
        hub.push(&json!({ "type": "audio", "amplitude": 7.0 }));
        hub.push(&json!({ "type": "exec", "text": "rm -rf" }));
        let say: Value = serde_json::from_str(&feed.recv().await.unwrap()).unwrap();
        assert_eq!(say["text"], "Hallo");
        let sentence: Value = serde_json::from_str(&feed.recv().await.unwrap()).unwrap();
        assert_eq!(sentence["ms"], 60_000);
        let audio: Value = serde_json::from_str(&feed.recv().await.unwrap()).unwrap();
        assert_eq!(audio["amplitude"], 1.0);
        assert!(feed.try_recv().is_err(), "the unknown message was dropped");
        // `say` and `sentence` are transient: a page that connects later does not get them.
        assert!(hub.snapshot().is_none());
        drop(guard);
        assert_eq!(hub.clients(), 0);
    }
}
