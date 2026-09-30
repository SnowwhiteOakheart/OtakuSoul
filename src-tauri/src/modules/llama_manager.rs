use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{Mutex, RwLock};
use tracing::{error, info, warn};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    #[serde(default)]
    pub thinking_budget: Option<i32>,
    #[serde(default)]
    pub batch_size: Option<u32>,
    #[serde(default)]
    pub ubatch_size: Option<u32>,
    #[serde(default)]
    pub cache_type_k: Option<String>,
    #[serde(default)]
    pub cache_type_v: Option<String>,
    #[serde(default)]
    pub mlock: bool,
    #[serde(default)]
    pub no_mmap: bool,
    #[serde(default)]
    pub cpu_moe: bool,
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
            thinking_budget: Some(0),
            batch_size: Some(2048),
            ubatch_size: Some(512),
            cache_type_k: Some("f16".to_string()),
            cache_type_v: Some("f16".to_string()),
            mlock: false,
            no_mmap: false,
            cpu_moe: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
#[serde(rename_all = "snake_case")]
pub enum ServerState {
    Stopped,
    Starting,
    Running,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

impl Default for LlamaServerManager {
    fn default() -> Self {
        Self::new()
    }
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

    fn requires_prism_runtime(model_path: &str) -> bool {
        let name = Path::new(model_path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(model_path)
            .to_ascii_lowercase();
        name.contains("pq2_0") || name.contains("ptq1_0")
    }

    fn is_deprecated_bonsai_pack(model_path: &str) -> bool {
        Path::new(model_path)
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.eq_ignore_ascii_case("Ternary-Bonsai-27B-Q2_0.gguf"))
            .unwrap_or(false)
    }

    /// Resolve the correct llama-server binary for the selected model. Prism's PQ2_0
    /// format intentionally lives beside the ordinary runtime so existing GGUFs keep
    /// using upstream llama.cpp.
    pub fn resolve_binary_for_model(
        &self,
        custom_path: Option<&str>,
        model_path: &str,
    ) -> Result<PathBuf, String> {
        if let Some(path_str) = custom_path {
            let path = PathBuf::from(path_str);
            if path.exists() {
                return Ok(path);
            }
        }

        let app_paths = crate::modules::paths::resolve_app_paths();
        let bin_dir = PathBuf::from(&app_paths.bundled_bin_dir);

        if Self::is_deprecated_bonsai_pack(model_path) {
            return Err(crate::err!("backend.server.bonsaiLegacy"));
        }

        if Self::requires_prism_runtime(model_path) {
            if let Some(runtime) =
                crate::modules::runtimes::installed(crate::modules::runtimes::RuntimeKind::Prism)
            {
                return Ok(PathBuf::from(runtime.server_path));
            }
            let bin_root = if bin_dir.file_name().and_then(|n| n.to_str()) == Some("cuda") {
                bin_dir.parent().unwrap_or(&bin_dir).to_path_buf()
            } else {
                bin_dir.clone()
            };
            let prism_candidates = [
                bin_root.join("prism-cuda").join("llama-server"),
                bin_root.join("prism").join("llama-server"),
                PathBuf::from("./bin/prism-cuda/llama-server"),
                PathBuf::from("../bin/prism-cuda/llama-server"),
            ];
            if let Some(binary) = prism_candidates.into_iter().find(|path| path.is_file()) {
                return Ok(binary);
            }
            return Err(crate::err!("backend.server.prismRequired"));
        }

        // The runtime downloaded in the app beats the developer bin/ folders and PATH.
        if let Some(runtime) =
            crate::modules::runtimes::installed(crate::modules::runtimes::RuntimeKind::Llama)
        {
            return Ok(PathBuf::from(runtime.server_path));
        }

        #[allow(unused_mut)]
        let mut candidates = vec![
            bin_dir.join("llama-server"),
            bin_dir.join("cuda").join("llama-server"),
            PathBuf::from("./bin/cuda/llama-server"),
            PathBuf::from("../bin/cuda/llama-server"),
            PathBuf::from("./bin/llama-server"),
            PathBuf::from("../bin/llama-server"),
        ];

        #[cfg(windows)]
        {
            candidates.push(bin_dir.join("llama-server.exe"));
            candidates.push(bin_dir.join("cuda").join("llama-server.exe"));
            candidates.push(PathBuf::from("./bin/cuda/llama-server.exe"));
            candidates.push(PathBuf::from("./bin/llama-server.exe"));
        }

        for candidate in candidates {
            if candidate.exists() {
                return Ok(candidate);
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

        Err(crate::err!("backend.server.binaryMissing"))
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

        let binary_path = match self
            .resolve_binary_for_model(config.binary_path.as_deref(), &config.model_path)
        {
            Ok(path) => path,
            Err(message) => {
                let mut status = self.status.write().await;
                status.state = ServerState::Failed;
                status.error_message = Some(message.clone());
                return Err(message);
            }
        };
        let model_path = Path::new(&config.model_path);
        if !model_path.exists() {
            let message = format!("Modelldatei nicht gefunden: {}", config.model_path);
            let mut status = self.status.write().await;
            status.state = ServerState::Failed;
            status.error_message = Some(message.clone());
            return Err(message);
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

        // Ensure port is completely free on Linux/Unix to prevent EADDRINUSE
        #[cfg(unix)]
        {
            let _ = tokio::process::Command::new("fuser")
                .arg("-k")
                .arg(format!("{}/tcp", config.port))
                .output()
                .await;
            tokio::time::sleep(Duration::from_millis(150)).await;
        }

        let mut cmd = Command::new(&binary_path);

        if let Some(parent) = binary_path.parent() {
            // The server's folder plus any library folders of an app-installed runtime
            // (e.g. the CUDA runtime unpacked next to it).
            let mut dirs: Vec<PathBuf> = vec![parent.to_path_buf()];
            dirs.extend(crate::modules::runtimes::library_dirs_for(&binary_path));
            let var = if cfg!(windows) {
                "PATH"
            } else {
                "LD_LIBRARY_PATH"
            };
            if let Some(existing) = std::env::var_os(var) {
                dirs.extend(std::env::split_paths(&existing));
            }
            if let Ok(joined) = std::env::join_paths(dirs) {
                cmd.env(var, joined);
            }
        }
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
        } else if let Some(budget) = config.thinking_budget {
            cmd.arg("--reasoning-budget").arg(budget.to_string());
        }

        if let Some(b) = config.batch_size {
            cmd.arg("-b").arg(b.to_string());
        }
        if let Some(ub) = config.ubatch_size {
            cmd.arg("-ub").arg(ub.to_string());
        }
        if let Some(ref k) = config.cache_type_k
            && !k.is_empty()
        {
            cmd.arg("--cache-type-k").arg(k);
        }
        if let Some(ref v) = config.cache_type_v
            && !v.is_empty()
        {
            cmd.arg("--cache-type-v").arg(v);
        }
        if config.mlock {
            cmd.arg("--mlock");
        }
        if config.no_mmap {
            cmd.arg("--no-mmap");
        }
        if config.cpu_moe {
            cmd.arg("--cpu-moe");
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
                            let last_logs = self
                                .logs
                                .lock()
                                .await
                                .iter()
                                .cloned()
                                .collect::<Vec<_>>()
                                .join("\n");
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

            if let Ok(resp) = client.get(&health_url).send().await
                && resp.status().is_success()
            {
                healthy = true;
                break;
            }
        }

        if healthy {
            info!("llama-server ist bereit auf Port {}", config.port);
            let mut s = self.status.write().await;
            s.state = ServerState::Running;
            Ok(())
        } else {
            let last_logs = self
                .logs
                .lock()
                .await
                .iter()
                .cloned()
                .collect::<Vec<_>>()
                .join("\n");
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

#[cfg(test)]
mod tests {
    use super::LlamaServerManager;

    #[test]
    fn routes_prism_formats_without_affecting_normal_ggufs() {
        assert!(LlamaServerManager::requires_prism_runtime(
            "/models/Ternary-Bonsai-27B-PQ2_0.gguf"
        ));
        assert!(LlamaServerManager::requires_prism_runtime(
            "/models/Ternary-Bonsai-2-27B-PTQ1_0.gguf"
        ));
        assert!(!LlamaServerManager::requires_prism_runtime(
            "/models/Qwen3-8B-Q4_K_M.gguf"
        ));
        assert!(!LlamaServerManager::requires_prism_runtime(
            "/models/Ternary-Bonsai-27B-Q2_g64.gguf"
        ));
    }

    #[test]
    fn rejects_the_old_27b_transition_pack() {
        assert!(LlamaServerManager::is_deprecated_bonsai_pack(
            "/models/Ternary-Bonsai-27B-Q2_0.gguf"
        ));
        assert!(!LlamaServerManager::is_deprecated_bonsai_pack(
            "/models/Ternary-Bonsai-27B-PQ2_0.gguf"
        ));
    }
}
