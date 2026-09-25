use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, RwLock};
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlamaServerConfig {
    pub binary_path: Option<String>,
    pub model_path: String,
    pub port: u16,
    pub context_size: u32,
    pub gpu_layers: u32,
    pub threads: Option<u32>,
    pub flash_attn: bool,
    #[serde(default)]
    pub reasoning_mode: bool,
}

impl Default for LlamaServerConfig {
    fn default() -> Self {
        Self {
            binary_path: None,
            model_path: String::new(),
            port: 48596,
            context_size: 4096,
            gpu_layers: 99,
            threads: None,
            flash_attn: true,
            reasoning_mode: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServerState {
    Stopped,
    Starting,
    Running,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerStatus {
    pub state: ServerState,
    pub port: u16,
    pub pid: Option<u32>,
    pub model_name: Option<String>,
    pub error_message: Option<String>,
    pub recent_logs: Vec<String>,
}

pub struct LlamaServerManager {
    child: Arc<Mutex<Option<Child>>>,
    status: Arc<RwLock<ServerStatus>>,
    logs: Arc<Mutex<VecDeque<String>>>,
}

impl LlamaServerManager {
    pub fn new() -> Self {
        let default_status = ServerStatus {
            state: ServerState::Stopped,
            port: 48596,
            pid: None,
            model_name: None,
            error_message: None,
            recent_logs: Vec::new(),
        };

        Self {
            child: Arc::new(Mutex::new(None)),
            status: Arc::new(RwLock::new(default_status)),
            logs: Arc::new(Mutex::new(VecDeque::with_capacity(100))),
        }
    }

    /// Resolve llama-server binary location across default folders and system PATH
    pub fn resolve_binary(&self, custom_path: Option<&str>) -> Result<PathBuf, String> {
        if let Some(path_str) = custom_path {
            let path = PathBuf::from(path_str);
            if path.exists() {
                return Ok(path);
            }
        }

        // Candidate search paths
        let candidates = vec![
            // 1. Soul-of-Waifu linux default paths (for seamless transition)
            "/home/deathtrap/development/Soul-of-Waifu-linux/app/utils/ai_clients/backend/cuda/llama-server",
            "/home/deathtrap/development/Soul-of-Waifu-linux/app/utils/ai_clients/backend/vulkan/llama-server",
            // 2. Local relative paths inside OtakuSoul
            "./bin/llama-server",
            "../bin/llama-server",
            "llama-server",
        ];

        for candidate in candidates {
            let path = PathBuf::from(candidate);
            if path.exists() {
                return Ok(path);
            }
        }

        // 3. Check system PATH
        if let Some(path_var) = std::env::var_os("PATH") {
            for p in std::env::split_paths(&path_var) {
                let candidate = p.join("llama-server");
                if candidate.is_file() {
                    return Ok(candidate);
                }
                #[cfg(windows)]
                {
                    let candidate_exe = p.join("llama-server.exe");
                    if candidate_exe.is_file() {
                        return Ok(candidate_exe);
                    }
                }
            }
        }

        Err("llama-server Binary nicht gefunden. Bitte installiere llama.cpp oder gib den Pfad in den Einstellungen an.".to_string())
    }

    pub async fn get_status(&self) -> ServerStatus {
        let mut status = self.status.read().await.clone();
        let logs_guard = self.logs.lock().await;
        status.recent_logs = logs_guard.iter().cloned().collect();
        status
    }

    pub async fn start(&self, config: LlamaServerConfig) -> Result<(), String> {
        // If already running or starting, stop first
        self.stop().await?;

        let binary_path = self.resolve_binary(config.binary_path.as_deref())?;
        let model_path = Path::new(&config.model_path);
        if !model_path.exists() {
            return Err(format!("Modelldatei nicht gefunden: {}", config.model_path));
        }

        let model_name = model_path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "GGUF Model".to_string());

        // Update status to Starting
        {
            let mut s = self.status.write().await;
            s.state = ServerState::Starting;
            s.port = config.port;
            s.model_name = Some(model_name.clone());
            s.error_message = None;
        }
        {
            let mut l = self.logs.lock().await;
            l.clear();
            l.push_back(format!("Starte llama-server: {:?}", binary_path));
        }

        info!(
            "Spawning llama-server {:?} on port {} with model {:?}",
            binary_path, config.port, model_path
        );

        let mut cmd = Command::new(&binary_path);
        cmd.arg("-m")
            .arg(&config.model_path)
            .arg("-c")
            .arg(config.context_size.to_string())
            .arg("-ngl")
            .arg(config.gpu_layers.to_string())
            .arg("--port")
            .arg(config.port.to_string())
            .arg("--host")
            .arg("127.0.0.1");

        if config.flash_attn {
            cmd.arg("-fa");
            cmd.arg("auto");
        }

        if !config.reasoning_mode {
            cmd.arg("--reasoning")
                .arg("off")
                .arg("--reasoning-budget")
                .arg("0");
        }

        if let Some(t) = config.threads {
            cmd.arg("-t").arg(t.to_string());
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        cmd.kill_on_drop(true);

        // Linux/Unix safety: Ensure child dies if OtakuSoul terminates
        #[cfg(unix)]
        unsafe {
            cmd.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                Ok(())
            });
        }

        let mut child = cmd.spawn().map_err(|e| {
            let err = format!("Fehler beim Starten von llama-server: {}", e);
            error!("{}", err);
            err
        })?;

        let pid = child.id().unwrap_or(0);
        {
            let mut s = self.status.write().await;
            s.pid = Some(pid);
        }

        // Pipe stderr/stdout to ring buffer for live log monitoring in UI
        let logs_clone = self.logs.clone();
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let mut guard = logs_clone.lock().await;
                    if guard.len() >= 100 {
                        guard.pop_front();
                    }
                    guard.push_back(line);
                }
            });
        }

        *self.child.lock().await = Some(child);

        // Health-check loop: wait until /health responds with 200 OK
        let health_url = format!("http://127.0.0.1:{}/health", config.port);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(800))
            .build()
            .map_err(|e| e.to_string())?;

        let mut healthy = false;
        let start_time = std::time::Instant::now();
        let timeout_duration = Duration::from_secs(45);

        while start_time.elapsed() < timeout_duration {
            tokio::time::sleep(Duration::from_millis(500)).await;

            // Check if process crashed early
            {
                let mut guard = self.child.lock().await;
                if let Some(child_proc) = guard.as_mut() {
                    match child_proc.try_wait() {
                        Ok(Some(status)) => {
                            let last_logs = self.logs.lock().await.iter().cloned().collect::<Vec<_>>().join("\n");
                            let err_msg = format!(
                                "llama-server Prozess unerwartet beendet mit Status {}.\nLogs:\n{}",
                                status, last_logs
                            );
                            let mut s = self.status.write().await;
                            s.state = ServerState::Failed;
                            s.error_message = Some(err_msg.clone());
                            return Err(err_msg);
                        }
                        Ok(None) => {}
                        Err(e) => {
                            warn!("Fehler beim Überprüfen des Child-Status: {}", e);
                        }
                    }
                }
            }

            if let Ok(resp) = client.get(&health_url).send().await {
                if resp.status().is_success() {
                    healthy = true;
                    break;
                }
            }
        }

        if healthy {
            info!("llama-server ist bereit auf Port {}", config.port);
            let mut s = self.status.write().await;
            s.state = ServerState::Running;
            Ok(())
        } else {
            let last_logs = self.logs.lock().await.iter().cloned().collect::<Vec<_>>().join("\n");
            let err_msg = format!(
                "Timeout: llama-server hat nach 45s nicht geantwortet.\nLetzte Logs:\n{}",
                last_logs
            );
            let mut s = self.status.write().await;
            s.state = ServerState::Failed;
            s.error_message = Some(err_msg.clone());
            self.stop().await.ok();
            Err(err_msg)
        }
    }

    pub async fn stop(&self) -> Result<(), String> {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            info!("Stoppe llama-server...");
            // Graceful shutdown attempt
            #[cfg(unix)]
            if let Some(pid) = child.id() {
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
            }

            // Wait up to 3s for graceful termination, else kill
            let kill_timeout = Duration::from_secs(3);
            tokio::select! {
                _ = child.wait() => {
                    info!("llama-server sauber beendet");
                }
                _ = tokio::time::sleep(kill_timeout) => {
                    warn!("llama-server reagiert nicht auf SIGTERM, erzwinge SIGKILL...");
                    child.kill().await.ok();
                }
            }
        }

        let mut s = self.status.write().await;
        s.state = ServerState::Stopped;
        s.pid = None;
        Ok(())
    }
}
