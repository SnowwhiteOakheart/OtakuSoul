//! Mobiler Web-Client (LAN): Der Chat läuft weiter im Hauptfenster, das Handy ist nur ein zweites
//! Eingabe- und Anzeigefenster. Nachrichten und Befehle vom Handy gehen als Ereignisse
//! ([`INBOX_EVENT`], [`COMMAND_EVENT`]) an das Hauptfenster (normale Chat-Pipeline: Figur,
//! Gedächtnis, Stimme); das Hauptfenster meldet Zustand, Verlauf, Live-Text und Auswahl zurück
//! ([`MobileHub::push`]), der Web-Server reicht sie über `/api/ws` an die offenen Seiten weiter.

use serde_json::{Map, Value, json};
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;

/// Die Seite, die das Handy lädt (`/`; der Token steht im Adress-Fragment).
pub const PAGE: &str = include_str!("mobile.html");

/// Ereignis an das Hauptfenster: `{ "text": "…", "image"?: "data:image/…" }`, eine Nachricht vom Handy.
pub const INBOX_EVENT: &str = "mobile-message";
/// Ereignis an das Hauptfenster: ein geprüfter Befehl ([`command`]).
pub const COMMAND_EVENT: &str = "mobile-command";
/// Längste Nachricht, die vom Handy angenommen wird (Zeichen).
pub const MAX_INCOMING_CHARS: usize = 8000;
/// Größtes Bild vom Handy als data-URL (Zeichen); die Seite verkleinert vorher.
pub const MAX_IMAGE_CHARS: usize = 8 * 1024 * 1024;

const MAX_PORTRAIT_BYTES: usize = 3 * 1024 * 1024;
const MAX_TEXT_CHARS: usize = 4000;
const MAX_STREAM_CHARS: usize = 16_000;
const MAX_MESSAGES: usize = 80;
const MAX_IMAGES_PER_MESSAGE: usize = 8;
const MAX_ID_CHARS: usize = 128;
const STATE_KEYS: [&str; 4] = ["characterName", "emotion", "thinking", "portrait"];
const NOTICE_CODES: [&str; 4] = ["busy", "failed", "noChat", "notFound"];
const IMAGE_TYPES: [&str; 4] = ["image/png", "image/jpeg", "image/webp", "image/gif"];

static APP: OnceLock<AppHandle> = OnceLock::new();

/// Wird beim Start gesetzt; ohne Handle kann keine Handy-Nachricht zugestellt werden.
pub fn set_app(app: AppHandle) {
    let _ = APP.set(app);
}

fn emit(event: &str, payload: Value) -> Result<(), String> {
    let app = APP.get().ok_or("no app handle")?;
    app.emit(event, payload).map_err(|e| e.to_string())
}

/// Ein Bild vom Handy, wenn es eine erlaubte data-URL ist.
pub fn valid_image(image: &str) -> bool {
    image.len() <= MAX_IMAGE_CHARS
        && IMAGE_TYPES
            .iter()
            .any(|t| image.starts_with(&format!("data:{t};base64,")))
}

/// Reicht eine Nachricht vom Handy an das Hauptfenster weiter (Text und/oder ein Bild).
pub fn deliver(text: &str, image: Option<&str>) -> Result<(), String> {
    let mut payload = json!({ "text": text });
    if let Some(image) = image {
        payload["image"] = Value::String(image.to_string());
    }
    emit(INBOX_EVENT, payload)
}

fn short_id(value: Option<&Value>) -> Option<String> {
    let id = value?.as_str()?;
    (!id.is_empty() && id.chars().count() <= MAX_ID_CHARS).then(|| id.to_string())
}

/// Prüft einen Befehl vom Handy; nur bekannte Aktionen mit passenden Feldern kommen durch.
///
/// - `stop`: laufende Antwort abbrechen
/// - `regenerate {id}`: neue Variante der Antwort
/// - `swipe {id, index}`: andere Variante zeigen
/// - `edit {id, text}`: Nachricht ändern
/// - `newChat`, `openChat {id}`, `openCharacter {id}`
pub fn command(raw: &Value) -> Option<Value> {
    let action = raw.get("action")?.as_str()?;
    match action {
        "stop" | "newChat" => Some(json!({ "action": action })),
        "regenerate" | "openChat" | "openCharacter" => {
            Some(json!({ "action": action, "id": short_id(raw.get("id"))? }))
        }
        "swipe" => {
            let index = raw.get("index")?.as_u64()?;
            let id = short_id(raw.get("id"))?;
            (index < 1000).then(|| json!({ "action": action, "id": id, "index": index }))
        }
        "edit" => {
            let text = raw.get("text")?.as_str()?.trim();
            let id = short_id(raw.get("id"))?;
            (!text.is_empty() && text.chars().count() <= MAX_INCOMING_CHARS)
                .then(|| json!({ "action": action, "id": id, "text": text }))
        }
        _ => None,
    }
}

/// Reicht einen geprüften Befehl an das Hauptfenster weiter.
pub fn deliver_command(command: Value) -> Result<(), String> {
    emit(COMMAND_EVENT, command)
}

pub struct MobileHub {
    tx: broadcast::Sender<String>,
    /// Zusammengeführter letzter Zustand (Name, Stimmung, Porträt, „denkt“).
    state: Mutex<Map<String, Value>>,
    /// Letzter Verlauf als fertige `history`-Nachricht.
    history: Mutex<Option<String>>,
    /// Bilder des letzten Verlaufs (Datei → MIME); nur sie liefert `/api/attachment` aus.
    files: Mutex<HashMap<String, String>>,
    /// Die Antwort, die gerade entsteht (bis der nächste Verlauf sie enthält).
    stream: Mutex<Option<String>>,
    /// Figuren und Chats zur Auswahl.
    catalog: Mutex<Option<String>>,
    clients: AtomicUsize,
}

pub struct ClientGuard(&'static MobileHub);

impl Drop for ClientGuard {
    fn drop(&mut self) {
        self.0.clients.fetch_sub(1, Ordering::SeqCst);
    }
}

impl MobileHub {
    fn new(capacity: usize) -> Self {
        Self {
            tx: broadcast::channel(capacity).0,
            state: Mutex::new(Map::new()),
            history: Mutex::new(None),
            files: Mutex::new(HashMap::new()),
            stream: Mutex::new(None),
            catalog: Mutex::new(None),
            clients: AtomicUsize::new(0),
        }
    }
}

pub fn hub() -> &'static MobileHub {
    static HUB: OnceLock<MobileHub> = OnceLock::new();
    HUB.get_or_init(|| MobileHub::new(64))
}

fn short(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|e| e.into_inner())
}

/// Ein Eintrag `{id, label}` einer Auswahlliste, oder `None`.
fn pick(entry: &Value, label: &str) -> Option<Value> {
    let id = short_id(entry.get("id"))?;
    let text = entry.get(label)?.as_str()?;
    Some(json!({ "id": id, label: short(text, 120) }))
}

fn history_entry(m: &Value) -> Option<Value> {
    let role = m.get("role")?.as_str()?;
    if role != "user" && role != "assistant" {
        return None;
    }
    let text = m.get("text").and_then(Value::as_str).unwrap_or("");
    let mut out = json!({ "role": role, "text": short(text, MAX_TEXT_CHARS) });
    if let Some(id) = short_id(m.get("id")) {
        out["id"] = Value::String(id);
    }
    // Speaker of a guest's reply in a group chat.
    if let Some(name) = m.get("name").and_then(Value::as_str) {
        out["name"] = Value::String(short(name, 80));
    }
    if let (Some(swipe), Some(swipes)) = (
        m.get("swipe").and_then(Value::as_u64),
        m.get("swipes").and_then(Value::as_u64),
    ) && swipes > 1
        && swipe < swipes
    {
        out["swipe"] = swipe.into();
        out["swipes"] = swipes.min(1000).into();
    }
    let images: Vec<Value> = m
        .get("images")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|img| {
                    let file = img.get("file")?.as_str()?;
                    let mime = img.get("mime")?.as_str()?;
                    (file.len() <= 200
                        && crate::modules::attachments::path_of(file).is_some()
                        && IMAGE_TYPES.contains(&mime))
                    .then(|| json!({ "file": file, "mime": mime }))
                })
                .take(MAX_IMAGES_PER_MESSAGE)
                .collect()
        })
        .unwrap_or_default();
    if !images.is_empty() {
        out["images"] = Value::Array(images);
    } else if text.is_empty() {
        return None;
    }
    Some(out)
}

/// Eine bereinigte Nachricht für die Seiten oder `None`, wenn sie nicht zu uns gehört.
///
/// - `state`: Name, Stimmung, `thinking`, Porträt (nur `data:image/…`, leer = entfernen)
/// - `history`: `{messages: [{id, role, text, name?, images?: [{file, mime}], swipe?, swipes?}]}`,
///   die letzten Nachrichten des offenen Chats (`name` nur bei Gästen im Gruppen-Chat)
/// - `stream`: `{text}`, die Antwort, die gerade entsteht
/// - `catalog`: `{characters: [{id, name}], chats: [{id, title}], characterId, chatId}`
/// - `notice`: `{code}`, ein Hinweis an das Handy (`busy`, `failed`, `noChat`, `notFound`)
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
                        Some(text) if key != "portrait" => {
                            Value::String(short(text, MAX_TEXT_CHARS))
                        }
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
            let messages: Vec<Value> = list[start..].iter().filter_map(history_entry).collect();
            Some(json!({ "type": "history", "messages": messages }))
        }
        "stream" => {
            let text = message.get("text")?.as_str()?;
            Some(json!({ "type": "stream", "text": short(text, MAX_STREAM_CHARS) }))
        }
        "catalog" => {
            let list = |key: &str, label: &str, max: usize| -> Vec<Value> {
                message
                    .get(key)
                    .and_then(Value::as_array)
                    .map(|l| l.iter().filter_map(|e| pick(e, label)).take(max).collect())
                    .unwrap_or_default()
            };
            Some(json!({
                "type": "catalog",
                "characters": list("characters", "name", 300),
                "chats": list("chats", "title", 100),
                "characterId": short_id(message.get("characterId")),
                "chatId": short_id(message.get("chatId")),
            }))
        }
        "notice" => {
            let code = message.get("code")?.as_str()?;
            NOTICE_CODES
                .contains(&code)
                .then(|| json!({ "type": "notice", "code": code }))
        }
        _ => None,
    }
}

impl MobileHub {
    /// Nimmt eine Nachricht des Hauptfensters an, merkt sich Zustand, Verlauf, Live-Text und
    /// Auswahl und gibt sie an die offenen Seiten weiter. Rückgabe: Zahl offener Seiten (das
    /// Hauptfenster spart sich sonst den Live-Text).
    pub fn push(&self, message: &Value) -> usize {
        let Some(clean) = sanitize(message) else {
            return self.clients.load(Ordering::SeqCst);
        };
        match clean["type"].as_str() {
            Some("state") => {
                if let Some(fields) = clean.as_object() {
                    let mut state = lock(&self.state);
                    for (key, value) in fields {
                        if key != "type" {
                            state.insert(key.clone(), value.clone());
                        }
                    }
                }
                if clean.get("thinking") == Some(&Value::Bool(false)) {
                    *lock(&self.stream) = None;
                }
            }
            Some("history") => {
                let mut files = HashMap::new();
                for m in clean["messages"].as_array().into_iter().flatten() {
                    for img in m
                        .get("images")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                    {
                        if let (Some(file), Some(mime)) =
                            (img["file"].as_str(), img["mime"].as_str())
                        {
                            files.insert(file.to_string(), mime.to_string());
                        }
                    }
                }
                *lock(&self.files) = files;
                *lock(&self.history) = Some(clean.to_string());
                *lock(&self.stream) = None;
            }
            Some("stream") => *lock(&self.stream) = Some(clean.to_string()),
            Some("catalog") => *lock(&self.catalog) = Some(clean.to_string()),
            _ => {}
        }
        let _ = self.tx.send(clean.to_string());
        self.clients.load(Ordering::SeqCst)
    }

    /// Alles, was eine neu verbundene Seite zuerst bekommt: Zustand, Auswahl, Verlauf, Live-Text.
    pub fn snapshot(&self) -> Vec<String> {
        let mut out = Vec::new();
        {
            let state = lock(&self.state);
            if !state.is_empty() {
                let mut message = state.clone();
                message.insert("type".into(), "state".into());
                out.push(Value::Object(message).to_string());
            }
        }
        out.extend(lock(&self.catalog).clone());
        out.extend(lock(&self.history).clone());
        out.extend(lock(&self.stream).clone());
        out
    }

    /// MIME eines Bildes im aktuellen Verlauf; andere Dateien liefert der Server nicht aus.
    pub fn file_mime(&self, file: &str) -> Option<String> {
        lock(&self.files).get(file).cloned()
    }

    /// Kurzer Zustand für `/api/status` (ohne Porträt).
    pub fn status(&self) -> Value {
        let state = lock(&self.state);
        json!({
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

    fn fresh() -> &'static MobileHub {
        Box::leak(Box::new(MobileHub::new(16)))
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
            list.push(json!({ "id": format!("m{i}"), "role": role, "text": format!("n{i}") }));
        }
        hub.push(&json!({ "type": "history", "messages": list }));
        let snap: Value = serde_json::from_str(&hub.snapshot()[0]).unwrap();
        let messages = snap["messages"].as_array().unwrap();
        assert_eq!(messages.len(), MAX_MESSAGES);
        assert_eq!(messages.last().unwrap()["text"], "n99");
        assert_eq!(messages.last().unwrap()["id"], "m99");
        assert!(messages.iter().all(|m| m["role"] != "system"));
        hub.push(&json!({ "type": "history", "messages": [
            { "role": "assistant", "text": "Hi", "name": "Lirwen", "swipe": 1, "swipes": 3 }
        ] }));
        let snap: Value = serde_json::from_str(&hub.snapshot()[0]).unwrap();
        assert_eq!(snap["messages"][0]["name"], "Lirwen");
        assert_eq!(snap["messages"][0]["swipes"], 3);
    }

    #[test]
    fn only_images_of_the_history_are_served() {
        let hub = fresh();
        hub.push(&json!({ "type": "history", "messages": [{
            "role": "assistant", "text": "",
            "images": [
                { "file": "chat1/a.png", "mime": "image/png" },
                { "file": "../etc/passwd", "mime": "image/png" },
                { "file": "chat1/b.svg", "mime": "image/svg+xml" },
            ],
        }] }));
        assert_eq!(hub.file_mime("chat1/a.png").as_deref(), Some("image/png"));
        assert!(hub.file_mime("../etc/passwd").is_none());
        assert!(hub.file_mime("chat1/b.svg").is_none());
        // A newer history without the picture takes it back.
        hub.push(&json!({ "type": "history", "messages": [] }));
        assert!(hub.file_mime("chat1/a.png").is_none());
    }

    #[test]
    fn stream_is_kept_until_the_reply_is_in_the_history() {
        let hub = fresh();
        hub.push(&json!({ "type": "stream", "text": "Es war ein" }));
        assert!(hub.snapshot().iter().any(|s| s.contains("Es war ein")));
        hub.push(&json!({ "type": "history", "messages": [] }));
        assert!(hub.snapshot().iter().all(|s| !s.contains("Es war ein")));
    }

    #[test]
    fn commands_are_checked() {
        assert_eq!(
            command(&json!({ "action": "stop", "x": 1 })),
            Some(json!({ "action": "stop" }))
        );
        assert!(command(&json!({ "action": "regenerate" })).is_none());
        assert!(command(&json!({ "action": "swipe", "id": "m1", "index": -1 })).is_none());
        assert_eq!(
            command(&json!({ "action": "swipe", "id": "m1", "index": 2 })).unwrap()["index"],
            2
        );
        assert!(command(&json!({ "action": "edit", "id": "m1", "text": "  " })).is_none());
        assert!(command(&json!({ "action": "deleteEverything" })).is_none());
        assert!(command(&json!({ "action": "openChat", "id": "x".repeat(500) })).is_none());
    }

    #[test]
    fn only_picture_data_urls_are_accepted_from_the_phone() {
        assert!(valid_image("data:image/jpeg;base64,AAAA"));
        assert!(!valid_image("data:image/svg+xml;base64,AAAA"));
        assert!(!valid_image("data:text/html;base64,AAAA"));
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
