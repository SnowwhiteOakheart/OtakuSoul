use axum::{
    Router,
    extract::ws::{Message as WsMessage, WebSocket},
    extract::{Query, State, WebSocketUpgrade},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Json, Response},
    routing::{get, post},
};
use qrcode::QrCode;
use qrcode::render::svg;
use serde::{Deserialize, Serialize};
use std::fs;
use std::net::{SocketAddr, UdpSocket};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{RwLock, oneshot};
use tracing::{error, info, warn};
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WebServerStatus {
    pub is_running: bool,
    pub port: u16,
    pub local_ip: String,
    pub connection_url: String,
    pub qr_code_svg: String,
    pub auth_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MobileChatRequest {
    pub message: String,
}

#[derive(Clone)]
struct AppStateContext {
    auth_token: Arc<RwLock<String>>,
}

pub struct WebServerManager {
    config: Arc<RwLock<WebServerConfig>>,
    active_token: Arc<RwLock<String>>,
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
        let config = Self::load_config();
        Self {
            active_token: Arc::new(RwLock::new(config.auth_token.clone())),
            config: Arc::new(RwLock::new(config)),
            is_running: Arc::new(AtomicBool::new(false)),
            shutdown_tx: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    pub fn load_config() -> WebServerConfig {
        let paths = resolve_app_paths();
        let path = PathBuf::from(&paths.data_dir).join("web_server_config.json");
        if path.exists()
            && let Ok(content) = fs::read_to_string(&path)
            && let Ok(mut cfg) = serde_json::from_str::<WebServerConfig>(&content)
        {
            if cfg.auth_token.len() < 32
                || WebServerConfig::is_legacy_predictable_token(&cfg.auth_token)
            {
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
        let content = serde_json::to_string_pretty(config).map_err(|e| {
            format!(
                "Fehler beim Serialisieren der Web-Server-Konfiguration: {}",
                e
            )
        })?;
        fs::write(&path, content)
            .map_err(|e| crate::err!("backend.webServer.configSave", error = e))?;
        Ok(())
    }

    pub async fn save_config(&self, config: WebServerConfig) -> Result<(), String> {
        Self::save_config_internal(&config)?;
        *self.active_token.write().await = config.auth_token.clone();
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
            && let Ok(addr) = socket.local_addr()
        {
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
        // Fragments are not sent in HTTP requests or referrer headers.
        let connection_url = format!("http://{}:{}/#token={}", local_ip, cfg.port, cfg.auth_token);
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
        self.remember_enabled(true).await;
        let bind_addr: SocketAddr = format!("{}:{}", cfg.host, cfg.port).parse().map_err(
            |e: std::net::AddrParseError| {
                crate::err!(
                    "backend.webServer.bindAddress",
                    host = cfg.host,
                    port = cfg.port,
                    error = e
                )
            },
        )?;

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
        *self.shutdown_tx.lock().await = Some(shutdown_tx);
        self.is_running.store(true, Ordering::Relaxed);

        let is_running_flag = Arc::clone(&self.is_running);

        let state = AppStateContext {
            auth_token: Arc::clone(&self.active_token),
        };

        let app = Router::new()
            .route("/", get(handle_index))
            .route("/api/status", get(handle_status))
            .route("/api/chat", post(handle_chat))
            .route("/api/ws", get(handle_ws))
            .route("/overlay", get(handle_overlay))
            .route("/api/overlay-ws", get(handle_overlay_ws))
            .with_state(state);

        tokio::spawn(async move {
            info!("Mobiler Web-Server lauscht auf http://{}", bind_addr);

            match tokio::net::TcpListener::bind(bind_addr).await {
                Ok(listener) => {
                    let server = axum::serve(listener, app).with_graceful_shutdown(async move {
                        let _ = shutdown_rx.await;
                        info!("Web-Server beendet.");
                    });

                    if let Err(e) = server.await {
                        error!("Web-Server Fehler im Laufzeit-Loop: {}", e);
                    }
                }
                Err(e) => {
                    error!(
                        "Fehler beim Binden des Web-Servers auf {}: {}",
                        bind_addr, e
                    );
                }
            }

            is_running_flag.store(false, Ordering::Relaxed);
        });

        Ok(())
    }

    /// Remembers whether the server should come back at the next start.
    async fn remember_enabled(&self, enabled: bool) {
        let mut cfg = self.config.write().await;
        if cfg.enabled != enabled {
            cfg.enabled = enabled;
            let _ = Self::save_config_internal(&cfg);
        }
    }

    /// Starts the server at app start when it was running when the app was closed.
    pub async fn autostart(&self) {
        if self.config.read().await.enabled
            && let Err(e) = self.start_server().await
        {
            warn!("Web-Server-Autostart fehlgeschlagen: {}", e);
        }
    }

    pub async fn stop_server(&self) -> Result<(), String> {
        self.remember_enabled(false).await;
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
    let provided = header_token
        .or(params.token.as_deref())
        .map(str::trim)
        .unwrap_or("");
    constant_time_eq(provided.as_bytes(), expected_token.as_bytes())
}

async fn handle_index() -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws:; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    (headers, Html(crate::modules::mobile::PAGE))
}

/// The streaming overlay for OBS (browser source): a transparent page; what it shows comes over
/// `/api/overlay-ws`, which needs the token.
async fn handle_overlay() -> impl IntoResponse {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws: wss:; img-src data:; base-uri 'none'; form-action 'none'"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    (headers, Html(crate::modules::overlay::PAGE))
}

async fn handle_overlay_ws(
    ws: WebSocketUpgrade,
    State(ctx): State<AppStateContext>,
    headers: HeaderMap,
    Query(params): Query<AuthParams>,
) -> Response {
    if !check_auth(&headers, &params, &ctx.auth_token.read().await) {
        return (StatusCode::UNAUTHORIZED, "Invalid token for WebSocket").into_response();
    }
    ws.on_upgrade(handle_overlay_socket)
}

async fn handle_overlay_socket(mut socket: WebSocket) {
    let hub = crate::modules::overlay::hub();
    let (mut feed, _guard) = hub.subscribe();
    if let Some(state) = hub.snapshot()
        && socket.send(WsMessage::Text(state.into())).await.is_err()
    {
        return;
    }
    loop {
        tokio::select! {
            message = feed.recv() => match message {
                Ok(text) => {
                    if socket.send(WsMessage::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                // A slow page skips what it missed (voice frames); the state follows anyway.
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(_) => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(WsMessage::Close(_))) | None | Some(Err(_)) => break,
                Some(Ok(_)) => {}
            },
        }
    }
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        "Invalid or missing authentication token",
    )
        .into_response()
}

async fn handle_status(
    State(ctx): State<AppStateContext>,
    headers: HeaderMap,
    Query(params): Query<AuthParams>,
) -> Response {
    if !check_auth(&headers, &params, &ctx.auth_token.read().await) {
        return unauthorized();
    }
    Json(crate::modules::mobile::hub().status()).into_response()
}

/// A message from the phone. It is handed to the main window, which answers through the normal
/// chat pipeline; the answer arrives over the WebSocket, so this only acknowledges (202).
async fn handle_chat(
    State(ctx): State<AppStateContext>,
    headers: HeaderMap,
    Query(params): Query<AuthParams>,
    Json(payload): Json<MobileChatRequest>,
) -> Response {
    if !check_auth(&headers, &params, &ctx.auth_token.read().await) {
        return unauthorized();
    }
    let text = payload.message.trim();
    if text.is_empty() {
        return (StatusCode::BAD_REQUEST, "Empty message").into_response();
    }
    if text.chars().count() > crate::modules::mobile::MAX_INCOMING_CHARS {
        return (StatusCode::PAYLOAD_TOO_LARGE, "Message too long").into_response();
    }
    match crate::modules::mobile::deliver(text) {
        Ok(()) => (
            StatusCode::ACCEPTED,
            Json(serde_json::json!({ "accepted": true })),
        )
            .into_response(),
        Err(e) => {
            warn!("Handy-Nachricht nicht zugestellt: {}", e);
            (StatusCode::SERVICE_UNAVAILABLE, "Desktop app not ready").into_response()
        }
    }
}

async fn handle_ws(
    ws: WebSocketUpgrade,
    State(ctx): State<AppStateContext>,
    headers: HeaderMap,
    Query(params): Query<AuthParams>,
) -> Response {
    if !check_auth(&headers, &params, &ctx.auth_token.read().await) {
        return (StatusCode::UNAUTHORIZED, "Invalid token for WebSocket").into_response();
    }
    ws.on_upgrade(handle_ws_socket)
}

/// The phone's page: state and history first, then everything the main window reports.
async fn handle_ws_socket(mut socket: WebSocket) {
    let hub = crate::modules::mobile::hub();
    // Subscribe before the snapshot so nothing falls between the two.
    let (mut feed, _guard) = hub.subscribe();
    for message in hub.snapshot() {
        if socket.send(WsMessage::Text(message.into())).await.is_err() {
            return;
        }
    }
    loop {
        tokio::select! {
            message = feed.recv() => match message {
                Ok(text) => {
                    if socket.send(WsMessage::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                // A slow phone skips messages; the next history message makes it whole again.
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                Err(_) => break,
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(WsMessage::Text(text))) => {
                    if serde_json::from_str::<serde_json::Value>(&text)
                        .ok()
                        .and_then(|v| v.get("type").and_then(|t| t.as_str()).map(|t| t == "ping"))
                        == Some(true)
                    {
                        let pong = serde_json::json!({"type": "pong"}).to_string();
                        if socket.send(WsMessage::Text(pong.into())).await.is_err() {
                            break;
                        }
                    }
                }
                Some(Ok(WsMessage::Close(_))) | None | Some(Err(_)) => break,
                Some(Ok(_)) => {}
            },
        }
    }
}

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
        assert!(WebServerConfig::is_legacy_predictable_token(
            &first_legacy_token
        ));
    }

    #[test]
    fn auth_accepts_header_and_rejects_wrong_or_empty() {
        let mut headers = HeaderMap::new();
        headers.insert("X-Otaku-Token", "secret".parse().unwrap());
        let none = AuthParams { token: None };
        assert!(check_auth(&headers, &none, "secret"));
        assert!(!check_auth(&headers, &none, "other"));
        assert!(!check_auth(
            &HeaderMap::new(),
            &AuthParams {
                token: Some(String::new())
            },
            ""
        ));
        assert!(check_auth(
            &HeaderMap::new(),
            &AuthParams {
                token: Some("secret".into())
            },
            "secret"
        ));
    }
}
