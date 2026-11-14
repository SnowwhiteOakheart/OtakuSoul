//! Music generation with ACE-Step 1.5 through acestep.cpp's `ace-server` (runtime `Ace`), before a
//! story is played: every mood of a scene's music plan (`story_music::plan_for_scene`) gets its
//! tracks, saved in the story's set folder with their origin next to them.
//!
//! A track takes two jobs on the server: `/lm` (the 5Hz language model writes the song's
//! structure as audio codes, also for vocals) and `/synth` (the diffusion model renders them).
//! Models come from `Serveurperso/ACE-Step-1.5-GGUF` at a fixed revision (SHA-256 checked) into
//! `<data>/music-models/`. The GPU is shared like for local images (`local_image::plan`): the chat
//! model steps aside when both do not fit and starts again afterwards.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use ts_rs::TS;

use crate::modules::llama_manager::LlamaServerManager;
use crate::modules::local_image::{
    LocalImageEngine, PlanInput, VramDecision, VramPlan, VramStrategy,
};
use crate::modules::model_files::RemoteFile;
use crate::modules::songs::SongRequest;
use crate::modules::stage::SceneDefinition;
use crate::modules::story_music::{self, PlannedMood};

/// Port of the app's own `ace-server` (next to llama-server's 48596 and sd-server's 48597).
const ACE_PORT: u16 = 48598;
const HF_REPO: &str = "Serveurperso/ACE-Step-1.5-GGUF";
/// Revision the sizes and checksums below belong to.
const HF_REVISION: &str = "666ac70204440867d8c01ba4b119cc79c95b370a";
/// `ace-server` scans its model folder before it listens.
const READY_TIMEOUT: Duration = Duration::from_secs(120);
/// One phase of one track (loading models from a slow disk included).
const JOB_TIMEOUT: Duration = Duration::from_secs(45 * 60);
const POLL_INTERVAL: Duration = Duration::from_millis(1500);
/// Upper limit of the diffusion model: 600 s (5 audio codes per second).
const MAX_SECONDS: u32 = 600;
const CODES_PER_SECOND: u32 = 5;

struct ModelFile {
    name: &'static str,
    size: u64,
    sha256: &'static str,
}

impl ModelFile {
    fn remote(&self) -> RemoteFile {
        RemoteFile {
            repo: HF_REPO,
            path: self.name,
            size: self.size,
            sha256: Some(self.sha256),
        }
    }

    fn url(&self) -> String {
        format!(
            "https://huggingface.co/{HF_REPO}/resolve/{HF_REVISION}/{}",
            self.name
        )
    }

    fn path(&self) -> PathBuf {
        models_dir().join(self.name)
    }

    /// A finished file is only moved into place after its checksum matched.
    fn ready(&self) -> bool {
        self.path().is_file()
    }
}

const VAE: ModelFile = ModelFile {
    name: "vae-BF16.gguf",
    size: 337_420_928,
    sha256: "0599862ac5d15cd308e1d2e368373aea6c02e25ebd1737ad4a4562a0901b0ef8",
};
const TEXT_ENCODER: ModelFile = ModelFile {
    name: "Qwen3-Embedding-0.6B-Q8_0.gguf",
    size: 784_144_960,
    sha256: "972f23255e46adfe744a0eb9a0039f3c63988f65753b0968d776e8b27168c321",
};
const SYNTH_2B: ModelFile = ModelFile {
    name: "acestep-v15-sft-Q8_0.gguf",
    size: 2_549_527_936,
    sha256: "17f1984e48aaab27b3eb8ccbf0b754a6656e677884c60ea7003845cfc0059b70",
};
const SYNTH_XL: ModelFile = ModelFile {
    name: "acestep-v15-xl-sft-Q8_0.gguf",
    size: 5_305_828_704,
    sha256: "d7b06fadab214375ef5ebcfa44bf4a10489ea364b119f5b9ecbcd870408bdab9",
};
const LM_SMALL: ModelFile = ModelFile {
    name: "acestep-5Hz-lm-0.6B-Q8_0.gguf",
    size: 709_846_656,
    sha256: "bdaf9e292d4470f31c19cafeaca1b74936a114667e3a85e5d33b65247e9908ec",
};
const LM_MEDIUM: ModelFile = ModelFile {
    name: "acestep-5Hz-lm-1.7B-Q8_0.gguf",
    size: 1_975_837_568,
    sha256: "726f99a82f050b32ebc5c5e36acaa9d7acd06bfe5e579a62b00e0d0d6d0b7ec6",
};

/// A set of models to generate with: diffusion model plus language model.
struct Tier {
    id: &'static str,
    name: &'static str,
    synth: &'static ModelFile,
    lm: &'static ModelFile,
    /// Estimated VRAM while generating, in MB.
    vram_mb: u64,
    /// Diffusion steps (SFT models: 50 per acestep.cpp's preset).
    steps: u32,
}

impl Tier {
    fn files(&self) -> [&'static ModelFile; 4] {
        [&VAE, &TEXT_ENCODER, self.synth, self.lm]
    }

    fn installed(&self) -> bool {
        self.files().iter().all(|f| f.ready())
    }
}

const TIERS: &[Tier] = &[
    Tier {
        id: "standard",
        name: "ACE-Step 1.5 (2B, LM 0.6B)",
        synth: &SYNTH_2B,
        lm: &LM_SMALL,
        vram_mb: 6_000,
        steps: 50,
    },
    Tier {
        id: "quality",
        name: "ACE-Step 1.5 (2B, LM 1.7B)",
        synth: &SYNTH_2B,
        lm: &LM_MEDIUM,
        vram_mb: 8_000,
        steps: 50,
    },
    Tier {
        id: "xl",
        name: "ACE-Step 1.5 XL (4B, LM 1.7B)",
        synth: &SYNTH_XL,
        lm: &LM_MEDIUM,
        vram_mb: 12_000,
        steps: 50,
    },
];

fn tier(id: &str) -> Result<&'static Tier, String> {
    TIERS
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| crate::err!("backend.music.unknownModel", model = id))
}

fn models_dir() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir).join("music-models")
}

/// VRAM kept free for the desktop, the WebView and driver overhead.
const OS_RESERVE_MB: u64 = 1_536;

/// (total, free) VRAM of the GPU in MB; free is `None` when the driver doesn't say.
fn gpu_vram() -> (u64, Option<u64>) {
    crate::modules::hardware::probe_hardware()
        .primary_gpu()
        .map(|g| {
            (
                g.total_vram_mb,
                (g.free_vram_mb > 0).then_some(g.free_vram_mb),
            )
        })
        .unwrap_or((0, None))
}

/// A model set as the music settings show it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MusicModelInfo {
    pub id: String,
    pub name: String,
    pub vram_mb: u64,
    pub download_bytes: u64,
    /// Bytes still missing (0 when installed); files shared with another set count once there.
    pub missing_bytes: u64,
    pub installed: bool,
    /// Largest set that fits this GPU on its own.
    pub recommended: bool,
    pub fits_gpu: bool,
}

pub fn list_models() -> Vec<MusicModelInfo> {
    let usable = gpu_vram().0.saturating_sub(OS_RESERVE_MB);
    let recommended = TIERS
        .iter()
        .filter(|t| t.vram_mb <= usable)
        .max_by_key(|t| t.vram_mb)
        .or(TIERS.first())
        .map(|t| t.id);
    TIERS
        .iter()
        .map(|t| MusicModelInfo {
            id: t.id.to_string(),
            name: t.name.to_string(),
            vram_mb: t.vram_mb,
            download_bytes: t.files().iter().map(|f| f.size).sum(),
            missing_bytes: t
                .files()
                .iter()
                .filter(|f| !f.ready())
                .map(|f| f.size)
                .sum(),
            installed: t.installed(),
            recommended: Some(t.id) == recommended,
            fits_gpu: t.vram_mb <= usable,
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MusicModelProgress {
    pub model_id: String,
    pub file_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f32,
    pub finished: bool,
}

static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);

/// Stops a running download after the current chunk; the partial file is resumed next time.
pub fn cancel_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

/// Downloads the missing files of a model set (resumed, SHA-256 checked). Progress goes to the
/// `music-model-progress` event.
pub async fn download_model<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    model_id: &str,
) -> Result<(), String> {
    let tier = tier(model_id)?;
    CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);
    let dir = models_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let client = crate::modules::model_files::http_client()?;
    let files = tier.files();
    let total: u64 = files.iter().map(|f| f.size).sum();
    let mut done: u64 = files.iter().filter(|f| f.ready()).map(|f| f.size).sum();
    let emit = |file: &str, bytes: u64, finished: bool| {
        let _ = app.emit(
            "music-model-progress",
            MusicModelProgress {
                model_id: tier.id.to_string(),
                file_name: file.to_string(),
                downloaded_bytes: bytes,
                total_bytes: total,
                percent: (bytes as f32 / total.max(1) as f32 * 100.0).min(100.0),
                finished,
            },
        );
    };
    for file in files.iter().filter(|f| !f.ready()) {
        crate::modules::model_files::download_file_from(
            &client,
            &file.url(),
            &file.remote(),
            &file.path(),
            &CANCEL_DOWNLOAD,
            &|bytes| emit(file.name, done + bytes, false),
        )
        .await?;
        done += file.size;
    }
    emit("", total, true);
    tracing::info!("Musikmodelle {} heruntergeladen", tier.id);
    Ok(())
}

/// Deletes the files of a model set that no other installed set uses.
pub fn delete_model(model_id: &str) -> Result<(), String> {
    let tier = tier(model_id)?;
    for file in tier.files() {
        let shared = TIERS.iter().any(|other| {
            other.id != tier.id
                && other.installed()
                && other.files().iter().any(|f| f.name == file.name)
        });
        if !shared {
            let _ = std::fs::remove_file(file.path());
            crate::modules::model_files::remove_partial(&file.path());
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------
// ace-server
// ---------------------------------------------------------------------------------------

/// Progress of a story's music generation (`music-gen-progress`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MusicGenProgress {
    pub set: String,
    pub mood: String,
    /// Track being made (1-based) and how many this run makes.
    pub track: u32,
    pub total: u32,
    /// `planning`, `unloading_llm`, `starting`, `composing` (language model), `rendering`
    /// (diffusion), `saved`, `reloading_llm`, `done`, `failed` or `cancelled`.
    pub phase: String,
    /// File just saved (`saved`).
    pub file: Option<String>,
    pub error: Option<String>,
}

/// Owns the app's `ace-server` and runs one generation at a time.
pub struct MusicEngine {
    process: Mutex<Option<Child>>,
    logs: Arc<Mutex<std::collections::VecDeque<String>>>,
    busy: Mutex<()>,
    cancel: AtomicBool,
}

pub fn engine() -> &'static MusicEngine {
    static ENGINE: OnceLock<MusicEngine> = OnceLock::new();
    ENGINE.get_or_init(|| MusicEngine {
        process: Mutex::new(None),
        logs: Arc::new(Mutex::new(std::collections::VecDeque::with_capacity(60))),
        busy: Mutex::new(()),
        cancel: AtomicBool::new(false),
    })
}

/// Language names ACE-Step's language model understands for `vocal_language`.
fn language_name(code: &str) -> Option<&'static str> {
    Some(match code {
        "en" => "English",
        "de" => "German",
        "fr" => "French",
        "es" => "Spanish",
        "it" => "Italian",
        "pt" => "Portuguese",
        "ja" => "Japanese",
        "ko" => "Korean",
        "zh" => "Chinese",
        "ru" => "Russian",
        _ => return None,
    })
}

/// Fine tuning the Song Studio offers beyond a story's music plan (all `None`/empty: defaults).
#[derive(Debug, Clone, Default)]
struct TrackOptions {
    timesignature: String,
    lm_temperature: Option<f32>,
    steps: Option<u32>,
}

impl TrackOptions {
    fn apply_lm(&self, body: &mut serde_json::Value) {
        if !self.timesignature.trim().is_empty() {
            body["timesignature"] = self.timesignature.trim().into();
        }
        if let Some(temperature) = self.lm_temperature {
            body["lm_temperature"] = f64::from(temperature.clamp(0.1, 1.5)).into();
        }
    }

    fn apply_synth(&self, body: &mut serde_json::Value) {
        if let Some(steps) = self.steps {
            body["inference_steps"] = steps.clamp(1, 200).into();
        }
    }
}

/// The `/lm` request for one track: the story's caption and lyrics taken word for word.
fn lm_request(planned: &PlannedMood, tier: &Tier, seed: i64) -> serde_json::Value {
    let mut body = serde_json::json!({
        "caption": planned.caption,
        "lyrics": planned.lyrics,
        "duration": planned.duration.min(MAX_SECONDS),
        "seed": seed,
        "use_cot_caption": false,
        "lm_model": tier.lm.name,
        "synth_model": tier.synth.name,
    });
    if let Some(bpm) = planned.bpm {
        body["bpm"] = bpm.into();
    }
    if !planned.keyscale.is_empty() {
        body["keyscale"] = planned.keyscale.clone().into();
    }
    if planned.has_vocals
        && let Some(name) = language_name(&planned.vocal_language)
    {
        body["vocal_language"] = name.into();
    }
    body
}

/// The `/synth` request from what the language model returned: audio codes cut to the wanted
/// length (it sometimes writes a few more, which the diffusion model would refuse), MP3 output
/// normalised to the real peak (`peak_clip: 0`, otherwise loud parts crackle).
fn synth_request(
    mut enriched: serde_json::Value,
    planned: &PlannedMood,
    tier: &Tier,
) -> Result<serde_json::Value, String> {
    let codes = enriched["audio_codes"].as_str().unwrap_or_default();
    let mut codes: Vec<&str> = codes.split(',').filter(|c| !c.trim().is_empty()).collect();
    if codes.is_empty() {
        return Err(crate::err!("backend.music.noCodes"));
    }
    codes.truncate((planned.duration.min(MAX_SECONDS) * CODES_PER_SECOND) as usize);
    enriched["audio_codes"] = codes.join(",").into();
    if planned.has_vocals && !planned.vocal_language.is_empty() {
        enriched["vocal_language"] = planned.vocal_language.clone().into();
    }
    enriched["output_format"] = "mp3".into();
    enriched["mp3_bitrate"] = 192.into();
    enriched["peak_clip"] = 0.into();
    enriched["synth_model"] = tier.synth.name.into();
    enriched["inference_steps"] = tier.steps.into();
    Ok(enriched)
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// The audio of a `/synth` result: the body itself (`audio/*`) or the audio part of a
/// `multipart/mixed` answer (JSON metadata plus audio).
fn extract_audio(content_type: &str, body: &[u8]) -> Option<Vec<u8>> {
    if content_type.starts_with("audio/") {
        return Some(body.to_vec());
    }
    let boundary = content_type
        .split(';')
        .find_map(|p| p.trim().strip_prefix("boundary="))?
        .trim_matches('"');
    let delimiter = format!("--{boundary}");
    let mut rest = body;
    while let Some(start) = find(rest, delimiter.as_bytes()) {
        rest = &rest[start + delimiter.len()..];
        if rest.starts_with(b"--") {
            break;
        }
        let end = find(rest, delimiter.as_bytes()).unwrap_or(rest.len());
        let part = &rest[..end];
        let header_end = find(part, b"\r\n\r\n")?;
        let headers = String::from_utf8_lossy(&part[..header_end]).to_ascii_lowercase();
        if headers.contains("content-type: audio/") {
            let data = &part[header_end + 4..];
            let data = data.strip_suffix(b"\r\n").unwrap_or(data);
            return (!data.is_empty()).then(|| data.to_vec());
        }
        rest = &rest[end..];
    }
    None
}

/// Next free `<mood>_NN.mp3` in a mood folder.
fn next_file_name(dir: &Path, mood: &str) -> String {
    (1..)
        .map(|n| format!("{mood}_{n:02}.mp3"))
        .find(|name| !dir.join(name).exists())
        .unwrap_or_else(|| format!("{mood}.mp3"))
}

impl MusicEngine {
    async fn running(&self) -> bool {
        let mut guard = self.process.lock().await;
        let alive = guard
            .as_mut()
            .is_some_and(|child| matches!(child.try_wait(), Ok(None)));
        if !alive {
            *guard = None;
        }
        alive
    }

    /// Stops `ace-server` and frees its memory.
    pub async fn stop(&self) {
        if let Some(mut child) = self.process.lock().await.take() {
            #[cfg(unix)]
            if let Some(pid) = child.id() {
                // SAFETY: plain signal to our own child process.
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
            }
            tokio::select! {
                _ = child.wait() => {}
                _ = tokio::time::sleep(Duration::from_secs(5)) => {
                    let _ = child.kill().await;
                }
            }
            tracing::info!("ace-server gestoppt");
        }
    }

    async fn log_tail(&self) -> String {
        let logs = self.logs.lock().await;
        let lines: Vec<&String> = logs.iter().collect();
        lines[lines.len().saturating_sub(12)..]
            .iter()
            .map(|l| l.as_str())
            .collect::<Vec<_>>()
            .join("\n")
    }

    async fn ensure_server(&self) -> Result<(), String> {
        if self.running().await {
            return Ok(());
        }
        let runtime =
            crate::modules::runtimes::installed(crate::modules::runtimes::RuntimeKind::Ace)
                .ok_or_else(|| crate::err!("backend.music.noRuntime"))?;
        let binary = PathBuf::from(&runtime.server_path);
        let mut lib_dirs: Vec<PathBuf> = runtime.library_dirs.iter().map(PathBuf::from).collect();
        if let Some(parent) = binary.parent() {
            lib_dirs.push(parent.to_path_buf());
        }
        let var = if cfg!(windows) {
            "PATH"
        } else {
            "LD_LIBRARY_PATH"
        };
        let existing = std::env::var_os(var).unwrap_or_default();
        let joined =
            std::env::join_paths(lib_dirs.into_iter().chain(std::env::split_paths(&existing)))
                .map_err(|e| crate::err!("backend.music.startFailed", error = e))?;
        let mut cmd = Command::new(&binary);
        cmd.env(var, &joined)
            .arg("--models")
            .arg(models_dir())
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(ACE_PORT.to_string())
            .arg("--max-batch")
            .arg("1")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);
        #[cfg(target_os = "linux")]
        // SAFETY: prctl only affects the child that is about to exec.
        unsafe {
            cmd.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                Ok(())
            });
        }
        tracing::info!("Starte ace-server ({})", runtime.backend);
        self.logs.lock().await.clear();
        let mut child = cmd
            .spawn()
            .map_err(|e| crate::err!("backend.music.startFailed", error = e))?;
        for stream in [
            child
                .stdout
                .take()
                .map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
            child
                .stderr
                .take()
                .map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
        ]
        .into_iter()
        .flatten()
        {
            let logs = self.logs.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stream).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    tracing::debug!(target: "ace_server", "{line}");
                    let mut guard = logs.lock().await;
                    if guard.len() >= 60 {
                        guard.pop_front();
                    }
                    guard.push_back(line);
                }
            });
        }
        *self.process.lock().await = Some(child);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
        let started = std::time::Instant::now();
        while started.elapsed() < READY_TIMEOUT {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if !self.running().await {
                return Err(crate::err!(
                    "backend.music.crashed",
                    logs = self.log_tail().await
                ));
            }
            if client
                .get(format!("http://127.0.0.1:{ACE_PORT}/health"))
                .send()
                .await
                .is_ok_and(|r| r.status().is_success())
            {
                return Ok(());
            }
        }
        self.stop().await;
        Err(crate::err!("backend.music.timeout"))
    }

    /// Waits for job `id` and returns its result; asks the server to drop it on a cancel.
    async fn wait_job(
        &self,
        client: &reqwest::Client,
        id: &str,
    ) -> Result<reqwest::Response, String> {
        let base = format!("http://127.0.0.1:{ACE_PORT}/job");
        let id = urlencoding::encode(id);
        let started = std::time::Instant::now();
        loop {
            if self.cancel.load(Ordering::SeqCst) || started.elapsed() > JOB_TIMEOUT {
                let _ = client.post(format!("{base}?id={id}&cancel=1")).send().await;
                return Err(if self.cancel.load(Ordering::SeqCst) {
                    crate::err!("backend.music.cancelled")
                } else {
                    crate::err!("backend.music.timeout")
                });
            }
            let status = client
                .get(format!("{base}?id={id}"))
                .send()
                .await
                .and_then(reqwest::Response::error_for_status)
                .map_err(|e| crate::err!("backend.music.generateFailed", error = e))?
                .json::<serde_json::Value>()
                .await
                .map_err(|e| crate::err!("backend.music.generateFailed", error = e))?;
            let state = status["status"].as_str().unwrap_or_default().to_lowercase();
            if state == "done" {
                return client
                    .get(format!("{base}?id={id}&result=1"))
                    .send()
                    .await
                    .and_then(reqwest::Response::error_for_status)
                    .map_err(|e| crate::err!("backend.music.generateFailed", error = e));
            }
            if ["err", "fail", "cancel"].iter().any(|w| state.contains(w)) {
                return Err(crate::err!(
                    "backend.music.generateFailed",
                    error = format!("{status}\n{}", self.log_tail().await)
                ));
            }
            tokio::time::sleep(POLL_INTERVAL).await;
        }
    }

    async fn submit(
        &self,
        client: &reqwest::Client,
        endpoint: &str,
        body: &serde_json::Value,
    ) -> Result<reqwest::Response, String> {
        let job = client
            .post(format!("http://127.0.0.1:{ACE_PORT}/{endpoint}"))
            .json(body)
            .send()
            .await
            .map_err(|e| crate::err!("backend.music.generateFailed", error = e))?;
        if !job.status().is_success() {
            let text = job.text().await.unwrap_or_default();
            return Err(crate::err!("backend.music.generateFailed", error = text));
        }
        let id = job
            .json::<serde_json::Value>()
            .await
            .map_err(|e| crate::err!("backend.music.generateFailed", error = e))?["id"]
            .to_string()
            .trim_matches('"')
            .to_string();
        self.wait_job(client, &id).await
    }

    /// One track: language model, then diffusion; returns the MP3 and the lyrics as sung (the
    /// language model writes them when the request has none).
    async fn make_track(
        &self,
        planned: &PlannedMood,
        tier: &Tier,
        seed: i64,
        options: &TrackOptions,
        on_phase: &(impl Fn(&str) + Sync),
    ) -> Result<(Vec<u8>, String), String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
        on_phase("composing");
        let mut lm_body = lm_request(planned, tier, seed);
        options.apply_lm(&mut lm_body);
        let lm = self
            .submit(&client, "lm", &lm_body)
            .await?
            .json::<serde_json::Value>()
            .await
            .map_err(|e| crate::err!("backend.music.generateFailed", error = e))?;
        let enriched = match lm {
            serde_json::Value::Array(mut items) if !items.is_empty() => items.swap_remove(0),
            other => other,
        };
        let lyrics = enriched["lyrics"]
            .as_str()
            .filter(|l| !l.trim().is_empty())
            .unwrap_or(&planned.lyrics)
            .to_string();
        on_phase("rendering");
        let mut synth_body = synth_request(enriched, planned, tier)?;
        options.apply_synth(&mut synth_body);
        let synth = self.submit(&client, "synth", &synth_body).await?;
        let content_type = synth
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string();
        let body = synth
            .bytes()
            .await
            .map_err(|e| crate::err!("backend.music.generateFailed", error = e))?;
        let audio = extract_audio(&content_type, &body)
            .ok_or_else(|| crate::err!("backend.music.noAudio"))?;
        Ok((audio, lyrics))
    }

    /// Asks a running generation to stop (the current server job is cancelled as well).
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// Generates the missing tracks of a scene's music plan (`moods`: only these) with the model
    /// set `model_id`, sharing the GPU with the chat model. Returns how many tracks were saved.
    pub async fn generate_scene(
        &self,
        on_progress: &(impl Fn(MusicGenProgress) + Sync),
        llama: Arc<LlamaServerManager>,
        image: Arc<LocalImageEngine>,
        def: &SceneDefinition,
        model_id: &str,
        moods: Option<&[String]>,
    ) -> Result<u32, String> {
        let Ok(_busy) = self.busy.try_lock() else {
            return Err(crate::err!("backend.music.busy"));
        };
        self.cancel.store(false, Ordering::SeqCst);
        let tier = tier(model_id)?;
        if let Some(missing) = tier.files().iter().find(|f| !f.ready()) {
            return Err(crate::err!(
                "backend.music.notInstalled",
                model = tier.name,
                file = missing.name
            ));
        }
        let plan = {
            let def = def.clone();
            tokio::task::spawn_blocking(move || story_music::plan_for_scene(&def))
                .await
                .map_err(|e| crate::err!("backend.music.generateFailed", error = e))?
        };
        let set = plan
            .set
            .clone()
            .ok_or_else(|| crate::err!("backend.music.noSet"))?;
        let jobs: Vec<(&PlannedMood, u32)> = plan
            .moods
            .iter()
            .filter(|m| moods.is_none_or(|wanted| wanted.contains(&m.mood)))
            .flat_map(|m| (m.installed..m.count).map(move |i| (m, i)))
            .collect();
        let total = jobs.len() as u32;
        let emit =
            |mood: &str, track: u32, phase: &str, file: Option<String>, error: Option<String>| {
                on_progress(MusicGenProgress {
                    set: set.clone(),
                    mood: mood.to_string(),
                    track,
                    total,
                    phase: phase.to_string(),
                    file,
                    error,
                });
            };
        if jobs.is_empty() {
            emit("", 0, "done", None, None);
            return Ok(0);
        }
        emit("", 0, "planning", None, None);
        let room = self
            .make_room(&llama, &image, tier, &|| {
                emit("", 0, "unloading_llm", None, None)
            })
            .await?;

        let dir = story_music::set_dir(
            &PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir),
            &set,
        );
        let mut saved = 0;
        let result: Result<(), String> = async {
            emit("", 0, "starting", None, None);
            self.ensure_server().await?;
            for (number, (planned, index)) in jobs.iter().enumerate() {
                let track = number as u32 + 1;
                let seed = planned
                    .seed
                    .map(|s| s + i64::from(*index))
                    .unwrap_or_else(|| i64::from(rand::random::<u32>() >> 1));
                let (audio, _) = self
                    .make_track(planned, tier, seed, &TrackOptions::default(), &|phase| {
                        emit(&planned.mood, track, phase, None, None)
                    })
                    .await?;
                let mood_dir = dir.join(&planned.mood);
                tokio::fs::create_dir_all(&mood_dir)
                    .await
                    .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
                let name = next_file_name(&mood_dir, &planned.mood);
                tokio::fs::write(mood_dir.join(&name), &audio)
                    .await
                    .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
                let origin = serde_json::json!({
                    "set": set,
                    "mood": planned.mood,
                    "generator": generator_name(),
                    "model": tier.synth.name,
                    "lm_model": tier.lm.name,
                    "caption": planned.caption,
                    "lyrics": planned.lyrics,
                    "vocal_language": planned.vocal_language,
                    "seed": seed,
                    "steps": tier.steps,
                    "generated": chrono::Local::now().format("%Y-%m-%d").to_string(),
                    "license": LICENSE_NOTE,
                });
                let _ = tokio::fs::write(
                    mood_dir.join(format!("{name}.json")),
                    serde_json::to_string_pretty(&origin).unwrap_or_default(),
                )
                .await;
                saved += 1;
                emit(&planned.mood, track, "saved", Some(name), None);
            }
            Ok(())
        }
        .await;

        self.release_room(room, llama, &|| {
            emit("", saved, "reloading_llm", None, None)
        })
        .await;
        match &result {
            Ok(()) => emit("", saved, "done", None, None),
            Err(e) if self.cancel.load(Ordering::SeqCst) => {
                emit("", saved, "cancelled", None, Some(e.clone()))
            }
            Err(e) => emit("", saved, "failed", None, Some(e.clone())),
        }
        result.map(|()| saved)
    }

    /// Makes room on the GPU for `tier`: the image server is idle and goes, local TTS and the
    /// chat model when both do not fit next to the music models (`on_unload` before the chat
    /// model stops). [`Self::release_room`] undoes it.
    async fn make_room(
        &self,
        llama: &Arc<LlamaServerManager>,
        image: &Arc<LocalImageEngine>,
        tier: &Tier,
        on_unload: &(impl Fn() + Sync),
    ) -> Result<GpuRoom, String> {
        image.stop().await;
        let llm_config = llama.running_config().await;
        let tts_vram = crate::modules::tts_local::engine().loaded_vram_mb().await;
        let decision = {
            let llm = llm_config.clone();
            let music_vram = tier.vram_mb;
            tokio::task::spawn_blocking(move || {
                let (total_vram, free) = gpu_vram();
                let (llm_vram, total_layers, gpu_layers) = match &llm {
                    Some(cfg) => {
                        let total_layers =
                            crate::modules::gguf::block_count(Path::new(&cfg.model_path));
                        let full = crate::modules::hardware::estimate_llm_vram_mb(
                            &cfg.model_path,
                            total_layers.unwrap_or(0),
                            cfg.context_size,
                            cfg.cache_type_k.as_deref(),
                            cfg.cache_type_v.as_deref(),
                        );
                        let gpu_layers =
                            total_layers.map_or(cfg.gpu_layers, |t| cfg.gpu_layers.min(t));
                        let share = total_layers
                            .filter(|t| *t > 0)
                            .map_or(1.0, |t| f64::from(gpu_layers) / f64::from(t));
                        ((full as f64 * share) as u64, total_layers, gpu_layers)
                    }
                    None => (0, None, 0),
                };
                crate::modules::local_image::plan(
                    &PlanInput {
                        total_vram_mb: total_vram,
                        free_vram_mb: free,
                        llm_running: llm.is_some(),
                        llm_vram_mb: llm_vram,
                        llm_gpu_layers: gpu_layers,
                        llm_total_layers: total_layers,
                        image_vram_mb: music_vram,
                        tts_vram_mb: tts_vram,
                    },
                    VramStrategy::Auto,
                )
            })
            .await
            .unwrap_or(VramDecision {
                plan: VramPlan::Swap,
                unload_tts: true,
            })
        };
        tracing::info!("VRAM-Plan für Musik ({}): {:?}", tier.id, decision);
        if decision.unload_tts {
            crate::modules::tts_local::engine().stop().await;
        }
        let swapped = decision.plan != VramPlan::Parallel && llm_config.is_some();
        if swapped {
            on_unload();
            llama.stop().await?;
        }
        Ok(GpuRoom {
            llm_to_restart: llm_config.filter(|_| swapped),
        })
    }

    /// Stops `ace-server` and starts the chat model again when it made room.
    async fn release_room(
        &self,
        room: GpuRoom,
        llama: Arc<LlamaServerManager>,
        on_reload: &(impl Fn() + Sync),
    ) {
        self.stop().await;
        if let Some(cfg) = room.llm_to_restart {
            on_reload();
            tokio::spawn(async move {
                if let Err(e) = llama.start(cfg).await {
                    tracing::warn!("Chat-Modell konnte nach der Musik nicht neu starten: {e}");
                }
            });
        }
    }

    /// Generates the Song Studio's `request` (`versions` songs, seeds counting up) into the song
    /// folder, sharing the GPU like a story's music. Returns the saved file names.
    pub async fn generate_song(
        &self,
        on_progress: &(impl Fn(MusicGenProgress) + Sync),
        llama: Arc<LlamaServerManager>,
        image: Arc<LocalImageEngine>,
        request: &SongRequest,
    ) -> Result<Vec<String>, String> {
        let Ok(_busy) = self.busy.try_lock() else {
            return Err(crate::err!("backend.music.busy"));
        };
        self.cancel.store(false, Ordering::SeqCst);
        let tier = tier(&request.model_id)?;
        if let Some(missing) = tier.files().iter().find(|f| !f.ready()) {
            return Err(crate::err!(
                "backend.music.notInstalled",
                model = tier.name,
                file = missing.name
            ));
        }
        if request.caption.trim().is_empty() {
            return Err(crate::err!("backend.music.noCaption"));
        }
        let dir = crate::modules::songs::prepare_dir()?;
        let title = crate::modules::songs::song_title(&request.title);
        let planned = song_plan(request);
        let options = TrackOptions {
            timesignature: request.timesignature.clone(),
            lm_temperature: request.lm_temperature,
            steps: request.steps,
        };
        let total = request.versions.clamp(1, MAX_VERSIONS);
        let emit = |track: u32, phase: &str, file: Option<String>, error: Option<String>| {
            on_progress(MusicGenProgress {
                set: SONG_SET.to_string(),
                mood: title.clone(),
                track,
                total,
                phase: phase.to_string(),
                file,
                error,
            });
        };
        emit(0, "planning", None, None);
        let room = self
            .make_room(&llama, &image, tier, &|| {
                emit(0, "unloading_llm", None, None)
            })
            .await?;

        let base_seed = request
            .seed
            .unwrap_or_else(|| i64::from(rand::random::<u32>() >> 1));
        let mut saved = Vec::new();
        let result: Result<(), String> = async {
            emit(0, "starting", None, None);
            self.ensure_server().await?;
            for index in 0..total {
                let track = index + 1;
                let seed = base_seed + i64::from(index);
                let (audio, lyrics) = self
                    .make_track(&planned, tier, seed, &options, &|phase| {
                        emit(track, phase, None, None)
                    })
                    .await?;
                let name = crate::modules::songs::unique_file_name(&dir, &title);
                tokio::fs::write(dir.join(&name), &audio)
                    .await
                    .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
                let mut kept = request.clone();
                kept.title = title.clone();
                let origin = crate::modules::songs::SongOrigin {
                    title: if total > 1 {
                        format!("{title} ({track})")
                    } else {
                        title.clone()
                    },
                    request: Some(kept),
                    lyrics,
                    seed: Some(seed),
                    generator: generator_name(),
                    model: tier.synth.name.to_string(),
                    lm_model: tier.lm.name.to_string(),
                    generated: chrono::Local::now().format("%Y-%m-%d %H:%M").to_string(),
                    license: LICENSE_NOTE.to_string(),
                };
                let _ = tokio::fs::write(
                    dir.join(format!("{name}.json")),
                    serde_json::to_string_pretty(&origin).unwrap_or_default(),
                )
                .await;
                emit(track, "saved", Some(name.clone()), None);
                saved.push(name);
            }
            Ok(())
        }
        .await;

        let count = saved.len() as u32;
        self.release_room(room, llama, &|| emit(count, "reloading_llm", None, None))
            .await;
        match &result {
            Ok(()) => emit(count, "done", None, None),
            Err(e) if self.cancel.load(Ordering::SeqCst) => {
                emit(count, "cancelled", None, Some(e.clone()))
            }
            Err(e) => emit(count, "failed", None, Some(e.clone())),
        }
        result.map(|()| saved)
    }
}

/// What [`MusicEngine::make_room`] changed: the chat model to start again afterwards.
struct GpuRoom {
    llm_to_restart: Option<crate::modules::llama_manager::LlamaServerConfig>,
}

/// `set` of the Song Studio's `music-gen-progress` events (`mood` holds the song title).
pub const SONG_SET: &str = "@song";
const MAX_VERSIONS: u32 = 10;
const LICENSE_NOTE: &str = "KI-generiert mit ACE-Step 1.5 (MIT), selbst erzeugt";

fn generator_name() -> String {
    format!(
        "ACE-Step 1.5 (acestep.cpp, {})",
        crate::modules::runtimes::ACESTEP_RELEASE
    )
}

/// A Song Studio request as one planned track (`lm_request`/`synth_request` take that form).
fn song_plan(request: &SongRequest) -> PlannedMood {
    let lyrics = request.lyrics.trim().to_string();
    PlannedMood {
        mood: SONG_SET.to_string(),
        caption: request.caption.trim().to_string(),
        has_vocals: !lyrics.eq_ignore_ascii_case(story_music::INSTRUMENTAL),
        lyrics,
        vocal_language: request.vocal_language.trim().to_string(),
        bpm: request.bpm.filter(|b| (30..=300).contains(b)),
        keyscale: request.keyscale.trim().to_string(),
        duration: request.duration.clamp(10, MAX_SECONDS),
        count: 1,
        seed: request.seed,
        installed: 0,
    }
}

/// Generates a scene's music and reports progress as the `music-gen-progress` event.
pub async fn generate_scene<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    llama: Arc<LlamaServerManager>,
    image: Arc<LocalImageEngine>,
    def: &SceneDefinition,
    model_id: &str,
    moods: Option<&[String]>,
) -> Result<u32, String> {
    engine()
        .generate_scene(
            &|p| {
                let _ = app.emit("music-gen-progress", p);
            },
            llama,
            image,
            def,
            model_id,
            moods,
        )
        .await
}

/// Generates a Song Studio request and reports progress as the `music-gen-progress` event
/// (`set` = [`SONG_SET`]).
pub async fn generate_song<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    llama: Arc<LlamaServerManager>,
    image: Arc<LocalImageEngine>,
    request: &SongRequest,
) -> Result<Vec<String>, String> {
    engine()
        .generate_song(
            &|p| {
                let _ = app.emit("music-gen-progress", p);
            },
            llama,
            image,
            request,
        )
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn song_requests_become_one_planned_track() {
        let request = SongRequest {
            caption: "  synthwave, female vocals ".into(),
            lyrics: String::new(),
            vocal_language: "ja".into(),
            duration: 5_000,
            bpm: Some(5),
            versions: 3,
            model_id: "standard".into(),
            ..Default::default()
        };
        let planned = song_plan(&request);
        assert_eq!(planned.caption, "synthwave, female vocals");
        // Empty lyrics: the language model writes them, so there are vocals.
        assert!(planned.has_vocals);
        assert_eq!(planned.duration, MAX_SECONDS);
        assert_eq!(planned.bpm, None);
        let lm = lm_request(&planned, &TIERS[0], 1);
        assert_eq!(lm["lyrics"], "");
        assert_eq!(lm["vocal_language"], "Japanese");

        let instrumental = song_plan(&SongRequest {
            lyrics: "[instrumental]".into(),
            duration: 1,
            ..request
        });
        assert!(!instrumental.has_vocals);
        assert_eq!(instrumental.duration, 10);
    }

    #[test]
    fn track_options_only_set_what_was_chosen() {
        let mut lm = serde_json::json!({});
        let mut synth = serde_json::json!({ "inference_steps": 50 });
        TrackOptions::default().apply_lm(&mut lm);
        TrackOptions::default().apply_synth(&mut synth);
        assert_eq!(lm, serde_json::json!({}));
        assert_eq!(synth["inference_steps"], 50);
        let options = TrackOptions {
            timesignature: " 3 ".into(),
            lm_temperature: Some(9.0),
            steps: Some(500),
        };
        options.apply_lm(&mut lm);
        options.apply_synth(&mut synth);
        assert_eq!(lm["timesignature"], "3");
        assert_eq!(lm["lm_temperature"], 1.5);
        assert_eq!(synth["inference_steps"], 200);
    }

    fn planned(lyrics: &str, language: &str) -> PlannedMood {
        PlannedMood {
            mood: "calm".into(),
            caption: "celtic folk, harp".into(),
            lyrics: lyrics.into(),
            vocal_language: language.into(),
            has_vocals: lyrics != story_music::INSTRUMENTAL,
            bpm: Some(72),
            keyscale: String::new(),
            duration: 4,
            count: 1,
            seed: None,
            installed: 0,
        }
    }

    #[test]
    fn tiers_share_their_common_files() {
        let names = |t: &Tier| t.files().iter().map(|f| f.name).collect::<Vec<_>>();
        assert_eq!(names(&TIERS[0])[..2], names(&TIERS[2])[..2]);
        assert!(
            TIERS
                .iter()
                .all(|t| t.files().iter().all(|f| f.sha256.len() == 64))
        );
        assert_eq!(
            tier("xl").unwrap().synth.name,
            "acestep-v15-xl-sft-Q8_0.gguf"
        );
        assert!(tier("huge").is_err());
    }

    #[test]
    fn requests_keep_the_story_wording_and_cut_the_codes() {
        let tier = &TIERS[0];
        let lm = lm_request(&planned(story_music::INSTRUMENTAL, ""), tier, 7);
        assert_eq!(lm["caption"], "celtic folk, harp");
        assert_eq!(lm["lyrics"], "[Instrumental]");
        assert_eq!(lm["use_cot_caption"], false);
        assert_eq!(lm["bpm"], 72);
        assert!(lm.get("vocal_language").is_none());
        assert!(lm.get("keyscale").is_none());

        let sung = lm_request(&planned("[Verse]\nooh", "de"), tier, 7);
        assert_eq!(sung["vocal_language"], "German");

        let enriched = serde_json::json!({ "caption": "x", "audio_codes": "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22" });
        let synth = synth_request(enriched, &planned("[Verse]\nooh", "de"), tier).unwrap();
        // 4 seconds × 5 codes.
        assert_eq!(
            synth["audio_codes"].as_str().unwrap().split(',').count(),
            20
        );
        assert_eq!(synth["vocal_language"], "de");
        assert_eq!(synth["output_format"], "mp3");
        assert_eq!(synth["peak_clip"], 0);
        assert_eq!(synth["inference_steps"], 50);
        assert!(
            synth_request(
                serde_json::json!({ "audio_codes": "" }),
                &planned("", ""),
                tier
            )
            .is_err()
        );
    }

    #[test]
    fn reads_the_audio_part_of_a_multipart_answer() {
        let body = b"--b0und\r\nContent-Type: application/json\r\n\r\n{\"bpm\":72}\r\n--b0und\r\nContent-Type: audio/mpeg\r\n\r\nID3\x00\x01mp3\r\n--b0und--\r\n";
        assert_eq!(
            extract_audio("multipart/mixed; boundary=b0und", body).as_deref(),
            Some(&b"ID3\x00\x01mp3"[..])
        );
        assert_eq!(
            extract_audio("multipart/mixed; boundary=\"b0und\"", body).as_deref(),
            Some(&b"ID3\x00\x01mp3"[..])
        );
        assert_eq!(
            extract_audio("audio/mpeg", b"raw").as_deref(),
            Some(&b"raw"[..])
        );
        let no_audio = b"--b\r\nContent-Type: application/json\r\n\r\n{}\r\n--b--\r\n";
        assert_eq!(extract_audio("multipart/mixed; boundary=b", no_audio), None);
        assert_eq!(extract_audio("text/plain", b"x"), None);
    }

    #[test]
    fn numbers_tracks_after_the_existing_ones() {
        let dir = std::env::temp_dir().join(format!("otakusoul-music-gen-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(next_file_name(&dir, "calm"), "calm_01.mp3");
        std::fs::write(dir.join("calm_01.mp3"), b"x").unwrap();
        assert_eq!(next_file_name(&dir, "calm"), "calm_02.mp3");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
