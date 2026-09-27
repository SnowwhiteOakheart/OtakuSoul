use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use tracing::{debug, info, warn};

use crate::modules::paths::resolve_app_paths;

pub const DEFAULT_DISCORD_CLIENT_ID: &str = "1540392006956621876";

// ============================================================================
// 1. DISCORD RICH PRESENCE (IPC)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordRpcActivity {
    pub details: String,
    pub state: String,
    pub character_name: Option<String>,
    pub start_timestamp: Option<u64>,
}

pub struct DiscordRpcClient {
    client_id: String,
    enabled: Arc<AtomicBool>,
    current_activity: Arc<RwLock<Option<DiscordRpcActivity>>>,
    start_time: u64,
}

impl DiscordRpcClient {
    pub fn new(client_id: Option<String>) -> Self {
        let start = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        Self {
            client_id: client_id.unwrap_or_else(|| DEFAULT_DISCORD_CLIENT_ID.to_string()),
            enabled: Arc::new(AtomicBool::new(false)),
            current_activity: Arc::new(RwLock::new(None)),
            start_time: start,
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.enabled.store(enabled, Ordering::Relaxed);
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    pub async fn update_activity(&self, activity: DiscordRpcActivity) {
        let mut act = activity;
        if act.start_timestamp.is_none() {
            act.start_timestamp = Some(self.start_time);
        }
        *self.current_activity.write().await = Some(act);
    }

    /// Spawns the background RPC heartbeat task.
    ///
    /// Runs during `AppState::new()`, before Tauri's runtime is entered, so it must use
    /// `tauri::async_runtime::spawn` – `tokio::spawn` panics there ("no reactor running").
    pub fn start_background_worker(self: Arc<Self>) {
        tauri::async_runtime::spawn(async move {
            let mut last_activity_sent: Option<String> = None;

            loop {
                tokio::time::sleep(Duration::from_secs(5)).await;

                if !self.is_enabled() {
                    continue;
                }

                let activity_opt = self.current_activity.read().await.clone();
                let activity = match activity_opt {
                    Some(a) => a,
                    None => DiscordRpcActivity {
                        details: "Im Hauptmenü".to_string(),
                        state: "Erkundet unendliche Welten".to_string(),
                        character_name: None,
                        start_timestamp: Some(self.start_time),
                    },
                };

                let act_key = format!("{}:{}:{:?}", activity.details, activity.state, activity.character_name);
                if last_activity_sent.as_deref() == Some(&act_key) {
                    continue;
                }

                if let Err(e) = self.send_ipc_activity(&activity).await {
                    debug!("Discord RPC IPC-Sendefehler (Discord eventuell nicht gestartet): {}", e);
                } else {
                    last_activity_sent = Some(act_key);
                }
            }
        });
    }

    #[cfg(unix)]
    async fn send_ipc_activity(&self, activity: &DiscordRpcActivity) -> Result<(), String> {
        use tokio::net::UnixStream;

        let socket_path = Self::find_unix_socket()?;
        let mut stream = UnixStream::connect(&socket_path).await
            .map_err(|e| format!("Kann nicht mit Discord IPC-Socket verbinden ({:?}): {}", socket_path, e))?;

        // 1. Handshake (Opcode 0)
        let handshake_payload = serde_json::json!({
            "v": 1,
            "client_id": self.client_id
        }).to_string();

        Self::write_ipc_frame(&mut stream, 0, &handshake_payload).await?;

        // Read handshake response
        let _ = Self::read_ipc_frame(&mut stream).await?;

        // 2. Set Activity (Opcode 1)
        let char_text = activity.character_name.as_deref().unwrap_or("OtakuSoul Companion");
        let start = activity.start_timestamp.unwrap_or(self.start_time);

        let activity_payload = serde_json::json!({
            "cmd": "SET_ACTIVITY",
            "args": {
                "pid": std::process::id(),
                "activity": {
                    "details": activity.details,
                    "state": activity.state,
                    "timestamps": {
                        "start": start
                    },
                    "assets": {
                        "large_image": "otakusoul_logo",
                        "large_text": "OtakuSoul – Infinite Worlds",
                        "small_image": "avatar",
                        "small_text": char_text
                    }
                }
            },
            "nonce": format!("nonce_{}", Utc::now().timestamp_millis())
        }).to_string();

        Self::write_ipc_frame(&mut stream, 1, &activity_payload).await?;

        // Wait brief response
        let _ = Self::read_ipc_frame(&mut stream).await?;
        Ok(())
    }

    #[cfg(not(unix))]
    async fn send_ipc_activity(&self, _activity: &DiscordRpcActivity) -> Result<(), String> {
        // Windows Named Pipe IPC (\\.\pipe\discord-ipc-0)
        Ok(())
    }

    #[cfg(unix)]
    fn find_unix_socket() -> Result<PathBuf, String> {
        let xdg = env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| "/tmp".to_string());
        for i in 0..10 {
            let p1 = PathBuf::from(&xdg).join(format!("discord-ipc-{}", i));
            if p1.exists() {
                return Ok(p1);
            }
            if let Ok(uid) = env::var("UID") {
                let p2 = PathBuf::from(format!("/run/user/{}/discord-ipc-{}", uid, i));
                if p2.exists() {
                    return Ok(p2);
                }
            }
            let p3 = PathBuf::from(format!("/tmp/discord-ipc-{}", i));
            if p3.exists() {
                return Ok(p3);
            }
        }
        Err("Kein aktiver Discord-IPC Socket gefunden.".to_string())
    }

    #[cfg(unix)]
    async fn write_ipc_frame(stream: &mut tokio::net::UnixStream, opcode: u32, payload: &str) -> Result<(), String> {
        use tokio::io::AsyncWriteExt;
        let bytes = payload.as_bytes();
        let len = bytes.len() as u32;

        let mut header = [0u8; 8];
        header[0..4].copy_from_slice(&opcode.to_le_bytes());
        header[4..8].copy_from_slice(&len.to_le_bytes());

        stream.write_all(&header).await.map_err(|e| e.to_string())?;
        stream.write_all(bytes).await.map_err(|e| e.to_string())?;
        stream.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    #[cfg(unix)]
    async fn read_ipc_frame(stream: &mut tokio::net::UnixStream) -> Result<(u32, String), String> {
        use tokio::io::AsyncReadExt;
        let mut header = [0u8; 8];
        stream.read_exact(&mut header).await.map_err(|e| e.to_string())?;

        let opcode = u32::from_le_bytes(header[0..4].try_into().unwrap());
        let len = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;

        let mut buf = vec![0u8; len];
        stream.read_exact(&mut buf).await.map_err(|e| e.to_string())?;

        let text = String::from_utf8_lossy(&buf).to_string();
        Ok((opcode, text))
    }
}

// ============================================================================
// 2. DISCORD GATEWAY & BOT
// ============================================================================

const DISCORD_TOKEN_ACCOUNT: &str = "discord_bot_token";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordBotConfig {
    pub enabled: bool,
    pub bot_token: String,
    pub command_prefix: String,
    pub allowed_channels: Vec<String>,
    pub cooldown_secs: u64,
}

impl Default for DiscordBotConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            bot_token: String::new(),
            command_prefix: "!".to_string(),
            allowed_channels: Vec::new(),
            cooldown_secs: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscordBotStatus {
    pub is_running: bool,
    pub bot_user: Option<String>,
    pub connected_guilds: usize,
    pub uptime_secs: u64,
}

pub struct DiscordBotManager {
    config: Arc<RwLock<DiscordBotConfig>>,
    is_running: Arc<AtomicBool>,
    shutdown_tx: Arc<Mutex<Option<mpsc::Sender<()>>>>,
    start_time: Arc<RwLock<Option<Instant>>>,
}

impl Default for DiscordBotManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DiscordBotManager {
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(Self::load_config())),
            is_running: Arc::new(AtomicBool::new(false)),
            shutdown_tx: Arc::new(Mutex::new(None)),
            start_time: Arc::new(RwLock::new(None)),
        }
    }

    pub fn load_config() -> DiscordBotConfig {
        let paths = resolve_app_paths();
        let path = PathBuf::from(&paths.data_dir).join("discord_bot_config.json");
        if path.exists()
            && let Ok(content) = fs::read_to_string(&path)
                && let Ok(mut cfg) = serde_json::from_str::<DiscordBotConfig>(&content) {
                    if crate::modules::secrets::hydrate(DISCORD_TOKEN_ACCOUNT, &mut cfg.bot_token) {
                        let _ = Self::write_config(&cfg);
                    }
                    return cfg;
                }
        DiscordBotConfig::default()
    }

    pub async fn save_config(&self, config: DiscordBotConfig) -> Result<(), String> {
        Self::write_config(&config)?;
        *self.config.write().await = config;
        Ok(())
    }

    fn write_config(config: &DiscordBotConfig) -> Result<(), String> {
        let paths = resolve_app_paths();
        let path = PathBuf::from(&paths.data_dir).join("discord_bot_config.json");
        let mut on_disk = config.clone();
        crate::modules::secrets::externalize(DISCORD_TOKEN_ACCOUNT, &mut on_disk.bot_token);
        let content = serde_json::to_string_pretty(&on_disk)
            .map_err(|e| format!("Fehler beim Serialisieren der Discord-Konfiguration: {}", e))?;
        fs::write(&path, content)
            .map_err(|e| format!("Fehler beim Speichern der Discord-Konfiguration: {}", e))
    }

    pub async fn get_status(&self) -> DiscordBotStatus {
        let running = self.is_running.load(Ordering::Relaxed);
        let uptime = self.start_time.read().await.map(|t| t.elapsed().as_secs()).unwrap_or(0);
        DiscordBotStatus {
            is_running: running,
            bot_user: if running { Some("OtakuSoul Bot".into()) } else { None },
            connected_guilds: if running { 1 } else { 0 },
            uptime_secs: uptime,
        }
    }

    pub async fn start_bot(&self) -> Result<(), String> {
        if self.is_running.load(Ordering::Relaxed) {
            return Ok(());
        }

        let cfg = self.config.read().await.clone();
        if cfg.bot_token.trim().is_empty() {
            return Err("Kein Discord Bot-Token konfiguriert.".to_string());
        }

        let (tx, mut rx) = mpsc::channel::<()>(1);
        *self.shutdown_tx.lock().await = Some(tx);
        self.is_running.store(true, Ordering::Relaxed);
        *self.start_time.write().await = Some(Instant::now());

        let running_flag = Arc::clone(&self.is_running);
        let token = cfg.bot_token.clone();
        let prefix = cfg.command_prefix.clone();

        tokio::spawn(async move {
            info!("Discord Bot wird gestartet...");
            let gateway_url = "wss://gateway.discord.gg/?v=10&encoding=json";

            loop {
                if !running_flag.load(Ordering::Relaxed) {
                    break;
                }

                match connect_async(gateway_url).await {
                    Ok((ws_stream, _)) => {
                        info!("Mit Discord Gateway verbunden.");
                        let (mut write, mut read) = ws_stream.split();

                        let mut heartbeat_interval = Duration::from_secs(41);
                        let mut last_heartbeat = Instant::now();

                        // Gateway loop
                        loop {
                            tokio::select! {
                                _ = rx.recv() => {
                                    info!("Discord Bot Shutdown-Signal empfangen.");
                                    let _ = write.send(Message::Close(None)).await;
                                    running_flag.store(false, Ordering::Relaxed);
                                    return;
                                }
                                _ = tokio::time::sleep(Duration::from_millis(500)) => {
                                    if last_heartbeat.elapsed() >= heartbeat_interval {
                                        let hb = serde_json::json!({"op": 1, "d": null}).to_string();
                                        let _ = write.send(Message::Text(hb.into())).await;
                                        last_heartbeat = Instant::now();
                                    }
                                }
                                msg_opt = read.next() => {
                                    match msg_opt {
                                        Some(Ok(Message::Text(text))) => {
                                            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                                                let op = val["op"].as_i64().unwrap_or(-1);
                                                // Op 10 Hello
                                                if op == 10 {
                                                    if let Some(ms) = val["d"]["heartbeat_interval"].as_u64() {
                                                        heartbeat_interval = Duration::from_millis(ms);
                                                    }
                                                    // Identify
                                                    let identify = serde_json::json!({
                                                        "op": 2,
                                                        "d": {
                                                            "token": token,
                                                            "intents": 33280, // GuildMessages + MessageContent
                                                            "properties": {
                                                                "os": "linux",
                                                                "browser": "otakusoul",
                                                                "device": "otakusoul"
                                                            }
                                                        }
                                                    }).to_string();
                                                    let _ = write.send(Message::Text(identify.into())).await;
                                                } else if op == 0 {
                                                    // Dispatch event
                                                    let event_type = val["t"].as_str().unwrap_or("");
                                                    if event_type == "MESSAGE_CREATE" {
                                                        Self::handle_message(&token, &prefix, &val["d"]).await;
                                                    }
                                                }
                                            }
                                        }
                                        Some(Ok(Message::Close(_))) | None => {
                                            warn!("Discord Gateway Verbindung geschlossen. Wiederverbindung in 5s...");
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        warn!("Fehler beim Verbinden mit Discord Gateway: {}. Erneuter Versuch in 10s...", e);
                    }
                }

                tokio::time::sleep(Duration::from_secs(10)).await;
            }

            running_flag.store(false, Ordering::Relaxed);
        });

        Ok(())
    }

    pub async fn stop_bot(&self) -> Result<(), String> {
        self.is_running.store(false, Ordering::Relaxed);
        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(()).await;
        }
        *self.start_time.write().await = None;
        info!("Discord Bot gestoppt.");
        Ok(())
    }

    async fn handle_message(token: &str, prefix: &str, data: &serde_json::Value) {
        // Ignore bot's own messages
        if data["author"]["bot"].as_bool().unwrap_or(false) {
            return;
        }

        let content = data["content"].as_str().unwrap_or("").trim();
        let channel_id = data["channel_id"].as_str().unwrap_or("");
        let author_name = data["author"]["username"].as_str().unwrap_or("User");

        if let Some(cmd_text) = content.strip_prefix(prefix) {
            let mut parts = cmd_text.splitn(2, ' ');
            let command = parts.next().unwrap_or("").to_lowercase();
            let args = parts.next().unwrap_or("").trim();

            let reply = match command.as_str() {
                "ask" => {
                    if args.is_empty() {
                        "Bitte gib eine Nachricht ein: `!ask <deine Frage>`".to_string()
                    } else {
                        format!("*OtakuSoul denkt nach für {}:* „{}“", author_name, args)
                    }
                }
                "character" => {
                    "Aktiver Charakter: **OtakuSoul Companion** (Status: Verbunden und aktiv)".to_string()
                }
                "status" => {
                    format!("✨ **OtakuSoul System Status:**\n• Bot: Online\n• Angesprochen von: {}\n• Latenz: Normal", author_name)
                }
                "reset" => {
                    "🔄 Chat-Gedächtnis für diese Sitzung wurde zurückgesetzt.".to_string()
                }
                _ => {
                    format!(
                        "🌸 **OtakuSoul Discord Bot Befehle:**\n• `{}ask <text>` - Mit deinem Charakter chatten\n• `{}character` - Aktiven Charakter anzeigen\n• `{}status` - Systemstatus prüfen\n• `{}reset` - Konversation neustarten",
                        prefix, prefix, prefix, prefix
                    )
                }
            };

            Self::send_discord_message(token, channel_id, &reply).await;
        }
    }

    async fn send_discord_message(token: &str, channel_id: &str, text: &str) {
        let client = reqwest::Client::new();
        let url = format!("https://discord.com/api/v10/channels/{}/messages", channel_id);

        let chunks = Self::split_message(text, 1900);
        for chunk in chunks {
            let payload = serde_json::json!({ "content": chunk });
            let _ = client.post(&url)
                .header("Authorization", format!("Bot {}", token))
                .header("Content-Type", "application/json")
                .json(&payload)
                .send().await;
        }
    }

    fn split_message(text: &str, limit: usize) -> Vec<String> {
        if text.len() <= limit {
            return vec![text.to_string()];
        }
        let mut chunks = Vec::new();
        let mut rem = text;
        while rem.len() > limit {
            // Never cut inside a multi-byte UTF-8 character (umlauts, emoji, CJK).
            let mut boundary = limit;
            while !rem.is_char_boundary(boundary) {
                boundary -= 1;
            }
            let window = &rem[..boundary];
            let cut = match window.rfind('\n').or_else(|| window.rfind(' ')) {
                Some(pos) if pos > 0 => pos,
                _ => boundary,
            };
            chunks.push(rem[..cut].to_string());
            rem = rem[cut..].trim_start();
        }
        if !rem.is_empty() {
            chunks.push(rem.to_string());
        }
        chunks
    }
}

#[cfg(test)]
mod tests {
    use super::DiscordBotManager;

    #[test]
    fn split_message_respects_utf8_boundaries() {
        let text = "ä".repeat(1500); // 3000 bytes, no whitespace
        let chunks = DiscordBotManager::split_message(&text, 2000);
        assert_eq!(chunks.concat(), text);
        assert!(chunks.iter().all(|c| c.len() <= 2000));
    }

    #[test]
    fn split_message_prefers_line_breaks() {
        let text = format!("{}\n{}", "a".repeat(1500), "b".repeat(1500));
        let chunks = DiscordBotManager::split_message(&text, 2000);
        assert_eq!(chunks, vec!["a".repeat(1500), "b".repeat(1500)]);
    }
}
