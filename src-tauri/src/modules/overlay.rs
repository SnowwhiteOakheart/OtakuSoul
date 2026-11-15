//! Streaming overlay: the active figure's portrait, mood and speech bubble as a transparent page
//! for OBS (browser source). The main window pushes what the figure does ([`OverlayHub::push`]),
//! the web server hands it to the open pages over a WebSocket (`/api/overlay-ws`). With a VRM or
//! GLB model the page shows the 3D figure: the hub keeps the model's path (never sent to pages)
//! and the web server serves only that file (`/overlay/model`).

use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use tokio::sync::broadcast;

/// The page OBS loads (`/overlay?token=…`).
pub const PAGE: &str = include_str!("overlay.html");

/// Portraits are data URLs and may be large; more than this is not forwarded.
const MAX_PORTRAIT_BYTES: usize = 6 * 1024 * 1024;
const MAX_TEXT_CHARS: usize = 2000;
/// A model larger than this is not served to the overlay.
const MAX_MODEL_BYTES: u64 = 300 * 1024 * 1024;

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
    /// The 3D model the page may load (checked path) and a counter that changes with it.
    model: Mutex<Option<PathBuf>>,
    model_version: AtomicUsize,
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
        model: Mutex::new(None),
        model_version: AtomicUsize::new(0),
    })
}

/// Folders the overlay may serve models from: the bundled ones and the user's imported avatars.
fn model_roots() -> Vec<PathBuf> {
    let paths = crate::modules::paths::resolve_app_paths();
    vec![
        PathBuf::from(paths.bundled_vrm_dir),
        PathBuf::from(paths.data_dir).join("avatars"),
    ]
}

/// The model file and its kind (`vrm`/`glb`) if the overlay may serve it: a self-contained 3D
/// model inside `roots`. VRoid Hub models never leave the app (their terms), glTF with outside
/// files, MMD and 2D figures stay in the app as well; the page then shows the portrait.
fn model_file(path: &str, roots: &[PathBuf]) -> Option<(PathBuf, &'static str)> {
    if path.starts_with("vroid:") {
        return None;
    }
    let kind = match Path::new(path)
        .extension()?
        .to_str()?
        .to_ascii_lowercase()
        .as_str()
    {
        "vrm" => "vrm",
        "glb" => "glb",
        _ => return None,
    };
    let file = std::fs::canonicalize(path).ok()?;
    let inside = roots
        .iter()
        .filter_map(|root| std::fs::canonicalize(root).ok())
        .any(|root| file.starts_with(root));
    let meta = std::fs::metadata(&file).ok()?;
    (inside && meta.is_file() && meta.len() <= MAX_MODEL_BYTES).then_some((file, kind))
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
        self.push_with_roots(message, &model_roots())
    }

    fn push_with_roots(&self, message: &Value, roots: &[PathBuf]) -> usize {
        let Some(mut clean) = sanitize(message) else {
            return self.clients.load(Ordering::SeqCst);
        };
        // The model's path stays here; the page learns only its kind and a version to reload.
        if clean["type"] == "state"
            && let Some(path) = message.get("model").and_then(Value::as_str)
        {
            let found = model_file(path, roots);
            let mut model = self.model.lock().unwrap_or_else(|e| e.into_inner());
            let next = found.as_ref().map(|(file, _)| file.clone());
            if *model != next {
                *model = next;
                self.model_version.fetch_add(1, Ordering::SeqCst);
            }
            let tag = found.map_or(String::new(), |(_, kind)| {
                format!("{kind}:{}", self.model_version.load(Ordering::SeqCst))
            });
            clean["model"] = Value::String(tag);
        }
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

    /// The bytes of the model the main window named last, if there is one.
    pub fn model_bytes(&self) -> Option<Vec<u8>> {
        let path = self
            .model
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()?;
        let meta = std::fs::metadata(&path).ok()?;
        if meta.len() > MAX_MODEL_BYTES {
            return None;
        }
        std::fs::read(path).ok()
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
            model: Mutex::new(None),
            model_version: AtomicUsize::new(0),
        }))
    }

    #[test]
    fn only_vrm_and_glb_inside_the_model_folders_are_served() {
        let dir = std::env::temp_dir().join(format!("otakusoul-overlay-{}", std::process::id()));
        let avatars = dir.join("avatars");
        std::fs::create_dir_all(&avatars).unwrap();
        for name in ["figur.vrm", "figur.glb", "figur.pmx", "figur.gltf"] {
            std::fs::write(avatars.join(name), b"glTF").unwrap();
        }
        std::fs::write(dir.join("geheim.vrm"), b"x").unwrap();
        let roots = vec![avatars.clone()];
        let hub = fresh();

        hub.push_with_roots(
            &json!({ "type": "state", "model": avatars.join("figur.vrm").to_string_lossy() }),
            &roots,
        );
        let snapshot: Value = serde_json::from_str(&hub.snapshot().unwrap()).unwrap();
        assert_eq!(
            snapshot["model"], "vrm:1",
            "the page gets kind and version, not the path"
        );
        assert_eq!(hub.model_bytes().unwrap(), b"glTF");

        // Outside the folders, other kinds and VRoid Hub models: nothing to serve.
        for path in [
            dir.join("geheim.vrm").to_string_lossy().to_string(),
            avatars
                .join("..")
                .join("geheim.vrm")
                .to_string_lossy()
                .to_string(),
            avatars.join("figur.pmx").to_string_lossy().to_string(),
            avatars.join("figur.gltf").to_string_lossy().to_string(),
            "vroid:12345".to_string(),
        ] {
            hub.push_with_roots(&json!({ "type": "state", "model": path }), &roots);
            let snapshot: Value = serde_json::from_str(&hub.snapshot().unwrap()).unwrap();
            assert_eq!(snapshot["model"], "", "{path} must not be served");
            assert!(hub.model_bytes().is_none());
        }

        // A GLB counts as a new model (new version), the same one again does not.
        let glb = avatars.join("figur.glb").to_string_lossy().to_string();
        hub.push_with_roots(&json!({ "type": "state", "model": glb }), &roots);
        hub.push_with_roots(&json!({ "type": "state", "model": glb }), &roots);
        let snapshot: Value = serde_json::from_str(&hub.snapshot().unwrap()).unwrap();
        assert_eq!(snapshot["model"], "glb:3");
        let _ = std::fs::remove_dir_all(dir);
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
