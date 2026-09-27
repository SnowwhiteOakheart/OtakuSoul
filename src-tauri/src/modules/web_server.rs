use std::fs;
use std::net::{SocketAddr, UdpSocket};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use axum::{
    extract::{Query, State, WebSocketUpgrade},
    extract::ws::{Message as WsMessage, WebSocket},
    http::{HeaderMap, StatusCode},
    response::{Html, IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use qrcode::render::svg;
use qrcode::QrCode;
use serde::{Deserialize, Serialize};
use tokio::sync::{oneshot, RwLock};
use tracing::{error, info, warn};

use crate::modules::paths::resolve_app_paths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebServerConfig {
    pub enabled: bool,
    pub port: u16,
    pub host: String,
    pub auth_token: String,
}

impl Default for WebServerConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: 8088,
            host: "0.0.0.0".to_string(),
            auth_token: Self::generate_token(),
        }
    }
}

impl WebServerConfig {
    /// 256-bit token from a CSPRNG.
    pub fn generate_token() -> String {
        // ThreadRng is a CSPRNG that is periodically reseeded from the OS.
        let mut bytes = [0u8; 32];
        rand::fill(&mut bytes);
        bytes.iter().map(|b| format!("{:02x}", b)).collect()
    }

    /// Earlier versions derived tokens from a fixed-seed xorshift, so every install produced
    /// the same, publicly computable sequence. Such tokens must be replaced.
    fn is_legacy_predictable_token(token: &str) -> bool {
        let mut state: u64 = 12345678901234567;
        let mut next = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        (0..64).any(|_| format!("{:016x}{:016x}", next(), next()) == token)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebServerStatus {
    pub is_running: bool,
    pub port: u16,
    pub local_ip: String,
    pub connection_url: String,
    pub qr_code_svg: String,
    pub auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileChatRequest {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileChatResponse {
    pub reply: String,
    pub character_name: String,
    pub emotion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MobileStatusResponse {
    pub character_name: String,
    pub emotion: String,
    pub mood_label: String,
    pub dopamine: f32,
    pub oxytocin: f32,
    pub system_status: String,
}

#[derive(Clone)]
struct AppStateContext {
    auth_token: String,
    active_character_name: Arc<RwLock<String>>,
    active_emotion: Arc<RwLock<String>>,
}

pub struct WebServerManager {
    config: Arc<RwLock<WebServerConfig>>,
    is_running: Arc<AtomicBool>,
    shutdown_tx: Arc<tokio::sync::Mutex<Option<oneshot::Sender<()>>>>,
}

impl Default for WebServerManager {
    fn default() -> Self {
        Self::new()
    }
}

impl WebServerManager {
    pub fn new() -> Self {
        Self {
            config: Arc::new(RwLock::new(Self::load_config())),
            is_running: Arc::new(AtomicBool::new(false)),
            shutdown_tx: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    pub fn load_config() -> WebServerConfig {
        let paths = resolve_app_paths();
        let path = PathBuf::from(&paths.data_dir).join("web_server_config.json");
        if path.exists()
            && let Ok(content) = fs::read_to_string(&path)
                && let Ok(mut cfg) = serde_json::from_str::<WebServerConfig>(&content) {
                    if cfg.auth_token.len() < 32 || WebServerConfig::is_legacy_predictable_token(&cfg.auth_token) {
                        warn!("Unsicheres Web-Server-Token erkannt, es wurde neu erzeugt.");
                        cfg.auth_token = WebServerConfig::generate_token();
                        let _ = Self::save_config_internal(&cfg);
                    }
                    return cfg;
                }
        let default_cfg = WebServerConfig::default();
        let _ = Self::save_config_internal(&default_cfg);
        default_cfg
    }

    fn save_config_internal(config: &WebServerConfig) -> Result<(), String> {
        let paths = resolve_app_paths();
        let path = PathBuf::from(&paths.data_dir).join("web_server_config.json");
        let content = serde_json::to_string_pretty(config)
            .map_err(|e| format!("Fehler beim Serialisieren der Web-Server-Konfiguration: {}", e))?;
        fs::write(&path, content)
            .map_err(|e| format!("Fehler beim Speichern der Web-Server-Konfiguration: {}", e))?;
        Ok(())
    }

    pub async fn save_config(&self, config: WebServerConfig) -> Result<(), String> {
        Self::save_config_internal(&config)?;
        *self.config.write().await = config;
        Ok(())
    }

    pub async fn regenerate_token(&self) -> Result<String, String> {
        let mut cfg = self.config.read().await.clone();
        cfg.auth_token = WebServerConfig::generate_token();
        self.save_config(cfg.clone()).await?;
        Ok(cfg.auth_token)
    }

    pub fn detect_local_ip() -> String {
        // Query outbound routing IP without transmitting packets
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0")
            && socket.connect("8.8.8.8:80").is_ok()
                && let Ok(addr) = socket.local_addr() {
                    return addr.ip().to_string();
                }
        "127.0.0.1".to_string()
    }

    pub fn generate_qr_svg(url: &str) -> String {
        if let Ok(code) = QrCode::new(url.as_bytes()) {
            code.render::<svg::Color>()
                .min_dimensions(200, 200)
                .dark_color(svg::Color("#38bdf8"))
                .light_color(svg::Color("#090d16"))
                .build()
        } else {
            String::new()
        }
    }

    pub async fn get_status(&self) -> WebServerStatus {
        let running = self.is_running.load(Ordering::Relaxed);
        let cfg = self.config.read().await.clone();
        let local_ip = Self::detect_local_ip();
        let connection_url = format!("http://{}:{}/?token={}", local_ip, cfg.port, cfg.auth_token);
        let qr_code_svg = Self::generate_qr_svg(&connection_url);

        WebServerStatus {
            is_running: running,
            port: cfg.port,
            local_ip,
            connection_url,
            qr_code_svg,
            auth_token: cfg.auth_token,
        }
    }

    pub async fn start_server(&self) -> Result<(), String> {
        if self.is_running.load(Ordering::Relaxed) {
            return Ok(());
        }

        let cfg = self.config.read().await.clone();
        let bind_addr: SocketAddr = format!("{}:{}", cfg.host, cfg.port)
            .parse()
            .map_err(|e| format!("Ungültige Bind-Adresse '{}:{}': {}", cfg.host, cfg.port, e))?;

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        *self.shutdown_tx.lock().await = Some(shutdown_tx);
        self.is_running.store(true, Ordering::Relaxed);

        let is_running_flag = Arc::clone(&self.is_running);

        let state = AppStateContext {
            auth_token: cfg.auth_token.clone(),
            active_character_name: Arc::new(RwLock::new("OtakuSoul Companion".to_string())),
            active_emotion: Arc::new(RwLock::new("warm".to_string())),
        };

        let app = Router::new()
            .route("/", get(handle_index))
            .route("/api/status", get(handle_status))
            .route("/api/chat", post(handle_chat))
            .route("/api/ws", get(handle_ws))
            .with_state(state);

        tokio::spawn(async move {
            info!("Mobiler Web-Server lauscht auf http://{}", bind_addr);

            match tokio::net::TcpListener::bind(bind_addr).await {
                Ok(listener) => {
                    let server = axum::serve(listener, app)
                        .with_graceful_shutdown(async move {
                            let _ = shutdown_rx.await;
                            info!("Web-Server beendet.");
                        });

                    if let Err(e) = server.await {
                        error!("Web-Server Fehler im Laufzeit-Loop: {}", e);
                    }
                }
                Err(e) => {
                    error!("Fehler beim Binden des Web-Servers auf {}: {}", bind_addr, e);
                }
            }

            is_running_flag.store(false, Ordering::Relaxed);
        });

        Ok(())
    }

    pub async fn stop_server(&self) -> Result<(), String> {
        self.is_running.store(false, Ordering::Relaxed);
        if let Some(tx) = self.shutdown_tx.lock().await.take() {
            let _ = tx.send(());
        }
        info!("Web-Server Stop-Signal gesendet.");
        Ok(())
    }
}

// ============================================================================
// HTTP ROUTE HANDLERS
// ============================================================================

#[derive(Deserialize)]
struct AuthParams {
    token: Option<String>,
}

/// Compares without an early exit so response timing does not leak the token prefix.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn check_auth(headers: &HeaderMap, params: &AuthParams, expected_token: &str) -> bool {
    if expected_token.is_empty() {
        return false;
    }
    let header_token = headers.get("X-Otaku-Token").and_then(|v| v.to_str().ok());
    // The query parameter is only needed for the WebSocket handshake, where browsers cannot set headers.
    let provided = header_token.or(params.token.as_deref()).map(str::trim).unwrap_or("");
    constant_time_eq(provided.as_bytes(), expected_token.as_bytes())
}

async fn handle_index() -> Html<&'static str> {
    Html(MOBILE_CLIENT_HTML)
}

async fn handle_status(
    State(ctx): State<AppStateContext>,
    headers: HeaderMap,
    Query(params): Query<AuthParams>,
) -> Response {
    if !check_auth(&headers, &params, &ctx.auth_token) {
        return (StatusCode::UNAUTHORIZED, "Ungültiges oder fehlendes Authentifizierungs-Token").into_response();
    }

    let char_name = ctx.active_character_name.read().await.clone();
    let emotion = ctx.active_emotion.read().await.clone();

    let resp = MobileStatusResponse {
        character_name: char_name,
        emotion,
        mood_label: "Aktiv & Verbunden".to_string(),
        dopamine: 75.0,
        oxytocin: 85.0,
        system_status: "Online".to_string(),
    };

    Json(resp).into_response()
}

async fn handle_chat(
    State(ctx): State<AppStateContext>,
    headers: HeaderMap,
    Query(params): Query<AuthParams>,
    Json(payload): Json<MobileChatRequest>,
) -> Response {
    if !check_auth(&headers, &params, &ctx.auth_token) {
        return (StatusCode::UNAUTHORIZED, "Ungültiges oder fehlendes Authentifizierungs-Token").into_response();
    }

    let user_msg = payload.message.trim();
    let char_name = ctx.active_character_name.read().await.clone();
    let current_emo = ctx.active_emotion.read().await.clone();

    let reply_text = if user_msg.is_empty() {
        "Ich bin hier! Was möchtest du besprechen?".to_string()
    } else {
        format!("*lächelt dich warm an* Schön, von deinem Smartphone aus mit dir verbunden zu sein! Du hast gesagt: „{}“. Ich begleite dich jederzeit.", user_msg)
    };

    let resp = MobileChatResponse {
        reply: reply_text,
        character_name: char_name,
        emotion: current_emo,
    };

    Json(resp).into_response()
}

async fn handle_ws(
    ws: WebSocketUpgrade,
    State(ctx): State<AppStateContext>,
    headers: HeaderMap,
    Query(params): Query<AuthParams>,
) -> Response {
    if !check_auth(&headers, &params, &ctx.auth_token) {
        return (StatusCode::UNAUTHORIZED, "Ungültiges Token für WebSocket").into_response();
    }

    ws.on_upgrade(move |socket| handle_ws_socket(socket, ctx))
}

async fn handle_ws_socket(mut socket: WebSocket, ctx: AppStateContext) {
    let char_name = ctx.active_character_name.read().await.clone();
    let welcome = serde_json::json!({
        "type": "connected",
        "character_name": char_name,
        "status": "ready"
    }).to_string();

    let _ = socket.send(WsMessage::Text(welcome.into())).await;

    while let Some(msg_res) = socket.recv().await {
        if let Ok(msg) = msg_res {
            if let WsMessage::Text(text) = msg {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text)
                    && val.get("type").and_then(|v| v.as_str()) == Some("ping") {
                        let pong = serde_json::json!({"type": "pong"}).to_string();
                        let _ = socket.send(WsMessage::Text(pong.into())).await;
                    }
            } else if let WsMessage::Close(_) = msg {
                break;
            }
        } else {
            break;
        }
    }
}

// ============================================================================
// EMBEDDED RESPONSIVE MOBILE WEB CLIENT
// ============================================================================

const MOBILE_CLIENT_HTML: &str = r#"<!DOCTYPE html>
<html lang="de" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>OtakuSoul – Mobiler Begleiter</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #050811; color: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; }
    .glass { background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(16px); border: 1px solid rgba(56, 189, 248, 0.2); }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: rgba(56, 189, 248, 0.3); border-radius: 9999px; }
  </style>
</head>
<body class="h-screen w-screen flex flex-col justify-between overflow-hidden">
  <!-- Top Navigation & Character Status -->
  <header class="glass p-3 flex items-center justify-between shadow-lg z-10">
    <div class="flex items-center gap-3">
      <div class="relative">
        <div class="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-fuchsia-500 p-0.5 shadow-md">
          <div class="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center text-lg">🌸</div>
        </div>
        <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 border-2 border-slate-950 rounded-full animate-pulse"></span>
      </div>
      <div>
        <h1 id="charName" class="text-sm font-bold tracking-tight text-cyan-300">OtakuSoul Companion</h1>
        <div class="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span id="emotionBadge" class="px-1.5 py-0.2 rounded-full bg-cyan-950 border border-cyan-500/30 text-cyan-300 font-mono">warm</span>
          <span>•</span>
          <span id="moodLabel">Aktiv & Verbunden</span>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button onclick="toggleAudioPlayback()" id="audioBtn" title="Sprachausgabe" class="p-2 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 active:scale-95 transition">
        🔊
      </button>
    </div>
  </header>

  <!-- Chat Log Feed -->
  <main id="chatFeed" class="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
    <div class="flex gap-2 max-w-[85%] self-start animate-fade-in">
      <div class="w-7 h-7 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-xs shrink-0 mt-0.5">🌸</div>
      <div class="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-sm text-slate-200 shadow-md">
        Hallo! Schön, dass wir auch über dein Smartphone verbunden sind. Wie kann ich dir heute zur Seite stehen? ✨
      </div>
    </div>
  </main>

  <!-- Input Area & Microphone Dock -->
  <footer class="glass p-3 flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <input 
        type="text" 
        id="msgInput" 
        placeholder="Schreibe eine Nachricht..." 
        class="flex-1 bg-slate-900/90 border border-slate-700/80 rounded-2xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
        onkeydown="if(event.key==='Enter') sendChatMessage()"
      />
      <button 
        onclick="toggleMicrophone()" 
        id="micBtn" 
        title="Sprachaufnahme" 
        class="p-2.5 rounded-2xl bg-slate-800 border border-slate-700 text-slate-300 active:scale-95 transition"
      >
        🎙️
      </button>
      <button 
        onclick="sendChatMessage()" 
        class="p-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold shadow-md shadow-cyan-500/20 active:scale-95 transition"
      >
        ➤
      </button>
    </div>
  </footer>

  <script>
    const urlParams = new URLSearchParams(window.location.search);
    let token = urlParams.get('token') || localStorage.getItem('otaku_token') || '';
    if (urlParams.get('token')) {
      localStorage.setItem('otaku_token', token);
      // Keep the token out of the address bar and browser history.
      history.replaceState(null, '', window.location.pathname);
    }
    const authHeaders = () => ({ 'X-Otaku-Token': token });

    let isRecording = false;
    let mediaRecorder = null;
    let audioChunks = [];

    async function fetchStatus() {
      try {
        const res = await fetch('/api/status', { headers: authHeaders() });
        if (res.ok) {
          const data = await res.json();
          document.getElementById('charName').textContent = data.character_name;
          document.getElementById('emotionBadge').textContent = data.emotion;
          document.getElementById('moodLabel').textContent = data.mood_label;
        }
      } catch (err) {
        console.warn('Status fetch error:', err);
      }
    }

    async function sendChatMessage() {
      const input = document.getElementById('msgInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';

      appendMessage(text, 'user');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ message: text })
        });
        if (res.ok) {
          const data = await res.json();
          appendMessage(data.reply, 'companion');
          if (data.emotion) {
            document.getElementById('emotionBadge').textContent = data.emotion;
          }
        }
      } catch (err) {
        appendMessage('Verbindungsfehler zum Desktop-Server.', 'system');
      }
    }

    function appendMessage(text, sender) {
      const feed = document.getElementById('chatFeed');
      const wrapper = document.createElement('div');

      if (sender === 'user') {
        wrapper.className = 'flex gap-2 max-w-[85%] self-end';
        wrapper.innerHTML = `<div class="p-3 rounded-2xl bg-cyan-600 text-white text-sm shadow-md">${escapeHtml(text)}</div>`;
      } else {
        wrapper.className = 'flex gap-2 max-w-[85%] self-start';
        wrapper.innerHTML = `
          <div class="w-7 h-7 rounded-xl bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center text-xs shrink-0 mt-0.5">🌸</div>
          <div class="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 text-sm text-slate-200 shadow-md">${escapeHtml(text)}</div>
        `;
      }

      feed.appendChild(wrapper);
      feed.scrollTop = feed.scrollHeight;
    }

    function escapeHtml(str) {
      return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    function toggleAudioPlayback() {
      const btn = document.getElementById('audioBtn');
      btn.classList.toggle('text-cyan-400');
    }

    async function toggleMicrophone() {
      const btn = document.getElementById('micBtn');
      if (!isRecording) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];
          mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
          mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            btn.classList.remove('bg-rose-600', 'text-white', 'animate-pulse');
            btn.classList.add('bg-slate-800', 'text-slate-300');
            isRecording = false;
          };
          mediaRecorder.start();
          isRecording = true;
          btn.classList.remove('bg-slate-800', 'text-slate-300');
          btn.classList.add('bg-rose-600', 'text-white', 'animate-pulse');
        } catch (err) {
          alert('Mikrofonzugriff nicht gestattet oder nicht verfügbar.');
        }
      } else {
        if (mediaRecorder) mediaRecorder.stop();
      }
    }

    fetchStatus();
    setInterval(fetchStatus, 6000);
  </script>
</body>
</html>
"#;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_tokens_are_long_and_unique() {
        let a = WebServerConfig::generate_token();
        let b = WebServerConfig::generate_token();
        assert_eq!(a.len(), 64);
        assert_ne!(a, b);
        assert!(!WebServerConfig::is_legacy_predictable_token(&a));
    }

    #[test]
    fn detects_legacy_fixed_seed_token() {
        let mut s: u64 = 12345678901234567;
        let mut next = || {
            s ^= s << 13;
            s ^= s >> 7;
            s ^= s << 17;
            s
        };
        let first_legacy_token = format!("{:016x}{:016x}", next(), next());
        assert!(WebServerConfig::is_legacy_predictable_token(&first_legacy_token));
    }

    #[test]
    fn auth_accepts_header_and_rejects_wrong_or_empty() {
        let mut headers = HeaderMap::new();
        headers.insert("X-Otaku-Token", "secret".parse().unwrap());
        let none = AuthParams { token: None };
        assert!(check_auth(&headers, &none, "secret"));
        assert!(!check_auth(&headers, &none, "other"));
        assert!(!check_auth(&HeaderMap::new(), &AuthParams { token: Some(String::new()) }, ""));
        assert!(check_auth(&HeaderMap::new(), &AuthParams { token: Some("secret".into()) }, "secret"));
    }
}
