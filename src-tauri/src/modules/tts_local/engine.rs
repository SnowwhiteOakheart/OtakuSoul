use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use super::catalog::{
    PresetVoice, Role, TtsModel, catalog_model, is_installed, models_dir, voices_dir,
};
use super::cloning::{ClonedVoice, clone_voice_name, list_cloned_voices};
use super::downloads::ensure_allowed;
use super::models::{VoicePrompt, design_description, load_settings};

const TTS_PORT: u16 = 48598;
const READY_TIMEOUT: Duration = Duration::from_secs(300);

struct CrispProcess {
    child: Child,
    model_id: String,
    spoken_disclaimer: bool,
}

pub struct LocalTtsEngine {
    process: Mutex<Option<CrispProcess>>,
    logs: Arc<Mutex<std::collections::VecDeque<String>>>,
    busy: Mutex<()>,
    /// VRAM of the speech model used last in this session, kept after it is unloaded so the
    /// chat model leaves room for it.
    reserved_vram_mb: AtomicU64,
}

/// The one speech engine of the app (synthesis is called from chat, web server and Discord).
pub fn engine() -> &'static LocalTtsEngine {
    static ENGINE: OnceLock<LocalTtsEngine> = OnceLock::new();
    ENGINE.get_or_init(|| LocalTtsEngine {
        process: Mutex::new(None),
        logs: Arc::new(Mutex::new(std::collections::VecDeque::with_capacity(60))),
        busy: Mutex::new(()),
        reserved_vram_mb: AtomicU64::new(0),
    })
}

/// How a character's `voice_id` is sent to the server.
#[derive(Debug, PartialEq)]
pub(super) enum VoiceChoice {
    /// The model's built-in voice.
    Default,
    /// A voice name the server resolves itself: a built-in speaker (`vivian`) or a voice pack
    /// file in the voice folder (`kokoro-voice-df_eva.gguf`).
    Preset(String),
    Clone(ClonedVoice),
}

pub(super) fn resolve_voice(model: &TtsModel, voice_id: &str) -> Result<VoiceChoice, String> {
    if let Some(id) = voice_id.strip_prefix("clone:") {
        if !model.cloning {
            return Err(crate::err!("backend.tts.noCloning", model = model.name));
        }
        return list_cloned_voices()
            .into_iter()
            .find(|v| v.id == id)
            .map(VoiceChoice::Clone)
            .ok_or_else(|| crate::err!("backend.tts.unknownVoice", voice = id));
    }
    let preset = voice_id.strip_prefix("preset:").unwrap_or(voice_id);
    if model.needs_clone {
        return Err(crate::err!("backend.tts.needsClone", model = model.name));
    }
    match model
        .voices
        .iter()
        .find(|v| v.id == preset)
        .or(model.voices.first())
    {
        Some(PresetVoice {
            file: Some(file), ..
        }) => Ok(VoiceChoice::Preset(file.to_string())),
        Some(PresetVoice { id, file: None, .. }) if *id != "default" => {
            Ok(VoiceChoice::Preset(id.to_string()))
        }
        _ => Ok(VoiceChoice::Default),
    }
}

impl LocalTtsEngine {
    pub async fn loaded_model(&self) -> Option<String> {
        let mut guard = self.process.lock().await;
        let running = guard
            .as_mut()
            .is_some_and(|p| matches!(p.child.try_wait(), Ok(None)));
        if !running {
            *guard = None;
        }
        guard.as_ref().map(|p| p.model_id.clone())
    }

    /// Estimated VRAM of the loaded speech model, 0 when none is running.
    pub async fn loaded_vram_mb(&self) -> u64 {
        self.loaded_model()
            .await
            .and_then(|id| catalog_model(&id).ok())
            .map_or(0, |m| m.vram_mb)
    }

    /// VRAM to keep free for the speech model in use, 0 before the first line was spoken.
    pub fn reserved_vram_mb(&self) -> u64 {
        self.reserved_vram_mb.load(Ordering::Relaxed)
    }

    pub async fn stop(&self) {
        if let Some(mut process) = self.process.lock().await.take() {
            #[cfg(unix)]
            if let Some(pid) = process.child.id() {
                // SAFETY: plain signal to our own child process.
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
            }
            tokio::select! {
                _ = process.child.wait() => {}
                _ = tokio::time::sleep(Duration::from_secs(5)) => {
                    let _ = process.child.kill().await;
                }
            }
            tracing::info!("crispasr gestoppt ({})", process.model_id);
        }
    }

    async fn ensure_server(&self, model: &TtsModel, spoken_disclaimer: bool) -> Result<(), String> {
        {
            let guard = self.process.lock().await;
            if let Some(p) = guard.as_ref()
                && p.model_id == model.id
                && p.spoken_disclaimer == spoken_disclaimer
            {
                drop(guard);
                if self.loaded_model().await.is_some() {
                    return Ok(());
                }
            }
        }
        self.stop().await;

        let runtime =
            crate::modules::runtimes::installed(crate::modules::runtimes::RuntimeKind::Crisp)
                .ok_or_else(|| crate::err!("backend.tts.noRuntime"))?;
        if !is_installed(model) {
            return Err(crate::err!("backend.tts.notInstalled", model = model.name));
        }
        let dir = models_dir();
        std::fs::create_dir_all(voices_dir())
            .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
        // Voice packs have to sit in the voice folder to be addressable by name.
        for voice in model.voices {
            if let Some(file) = voice.file {
                let target = voices_dir().join(file);
                if !target.is_file() {
                    std::fs::copy(dir.join(file), &target)
                        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
                }
            }
        }
        let binary = PathBuf::from(&runtime.server_path);
        let mut cmd = Command::new(&binary);
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
                .map_err(|e| crate::err!("backend.tts.startFailed", error = e))?;
        cmd.env(var, joined);

        // F5's text embedding runs on the CPU by default and makes it very slow; on CUDA the
        // GPU path is several times faster (CrispASR issue #294, opt-in since 0.8.x).
        if model.backend == "f5-tts" && runtime.backend.starts_with("cuda") {
            cmd.env("CRISPASR_F5_EMBED_GPU", "1");
        }
        // TADA clones a reference WAV on the fly only with this opt-in (CrispASR #201).
        if model.backend.starts_with("tada") {
            cmd.env("CRISPASR_TADA_WAV_CLONE", "1");
            // One noise draw per token can rush or drop whole phrases (GPU test: a German clone
            // lost its first sentence); best-of-4 is far steadier and costs little.
            cmd.env("CRISPASR_TADA_NUM_CANDIDATES", "4");
        }

        // Kokoro resolves voice packs relative to the working directory instead of
        // `--voice-dir`, so the server runs inside the voice folder.
        cmd.current_dir(voices_dir());
        cmd.arg("--server")
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(TTS_PORT.to_string())
            .arg("--backend")
            .arg(model.backend)
            .arg("--voice-dir")
            .arg(voices_dir());
        for file in model.files {
            match file.role {
                Role::Main => {
                    cmd.arg("-m").arg(file.file.path_in(&dir));
                }
                Role::Codec => {
                    cmd.arg("--codec-model").arg(file.file.path_in(&dir));
                }
                Role::Extra => {}
            }
        }
        if let Some(lang) = model.start_language {
            cmd.arg("-l").arg(lang);
        }
        if !spoken_disclaimer {
            // Turning the spoken label off means the user takes over the marking duty.
            cmd.arg("--no-spoken-disclaimer")
                .arg("--accept-marking-responsibility");
        }
        cmd.stdout(std::process::Stdio::piped())
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

        // The chat model may hold the VRAM the speech model needs; it can make room.
        self.reserved_vram_mb
            .store(model.vram_mb, Ordering::Relaxed);
        crate::modules::llama_manager::make_room_for_speech(model.vram_mb).await;

        tracing::info!("Starte crispasr mit {}", model.id);
        self.logs.lock().await.clear();
        let mut child = cmd
            .spawn()
            .map_err(|e| crate::err!("backend.tts.startFailed", error = e))?;
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
                    tracing::debug!(target: "crispasr", "{line}");
                    let mut guard = logs.lock().await;
                    if guard.len() >= 60 {
                        guard.pop_front();
                    }
                    guard.push_back(line);
                }
            });
        }
        *self.process.lock().await = Some(CrispProcess {
            child,
            model_id: model.id.to_string(),
            spoken_disclaimer,
        });

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
        let started = std::time::Instant::now();
        while started.elapsed() < READY_TIMEOUT {
            tokio::time::sleep(Duration::from_millis(400)).await;
            if self.loaded_model().await.is_none() {
                let logs = self.logs.lock().await.iter().cloned().collect::<Vec<_>>();
                let tail = logs[logs.len().saturating_sub(12)..].join("\n");
                return Err(crate::err!("backend.tts.crashed", logs = tail));
            }
            if client
                .get(format!("http://127.0.0.1:{TTS_PORT}/health"))
                .send()
                .await
                .is_ok_and(|r| r.status().is_success())
            {
                tracing::info!(
                    "crispasr bereit nach {:.1}s",
                    started.elapsed().as_secs_f32()
                );
                return Ok(());
            }
        }
        self.stop().await;
        Err(crate::err!("backend.tts.timeout"))
    }

    /// Synthesises `text` with `model_id` and the character's `voice_id`; returns WAV bytes.
    pub async fn synthesize(
        &self,
        model_id: &str,
        voice_id: &str,
        text: &str,
        language: &str,
        speed: f32,
    ) -> Result<Vec<u8>, String> {
        self.synthesize_with(
            model_id,
            voice_id,
            text,
            language,
            speed,
            VoicePrompt::default(),
        )
        .await
    }

    /// `synthesize` with a voice description for VoiceDesign models and a speaking style for
    /// models with style control.
    pub async fn synthesize_with(
        &self,
        model_id: &str,
        voice_id: &str,
        text: &str,
        language: &str,
        speed: f32,
        prompt: VoicePrompt<'_>,
    ) -> Result<Vec<u8>, String> {
        let VoicePrompt { description, style } = prompt;
        let _busy = self.busy.lock().await;
        let model = catalog_model(model_id)?;
        ensure_allowed(model)?;
        let settings = load_settings();
        let description = design_description(voice_id, &settings.designed_voices, description);
        if model.voice_design && description.is_empty() {
            return Err(crate::err!(
                "backend.tts.needsDescription",
                model = model.name
            ));
        }
        let voice = resolve_voice(model, voice_id)?;
        self.ensure_server(model, settings.spoken_disclaimer)
            .await?;

        let mut body = serde_json::json!({
            "input": text,
            "language": language,
            "response_format": "wav",
            "speed": speed.clamp(0.5, 2.0),
        });
        if !settings.spoken_disclaimer {
            // The server only honours the opt-out with an attestation (CrispASR >= 0.8.22).
            body["spoken_disclaimer"] = false.into();
            body["marking_attestation"] =
                "The OtakuSoul user turned the spoken AI label off and discloses AI-generated audio themselves."
                    .into();
        }
        if model.voice_design {
            body["instructions"] = description.as_str().into();
        } else if model.style_control && !style.trim().is_empty() {
            body["instructions"] = style.trim().into();
        }
        match &voice {
            VoiceChoice::Default => {}
            // The server only accepts bare names, resolved against `--voice-dir`.
            VoiceChoice::Preset(name) => {
                body["voice"] = name.clone().into();
            }
            VoiceChoice::Clone(clone) => {
                body["voice"] = clone_voice_name(model, &clone.id).into();
                body["ref_text"] = clone.ref_text.clone().into();
                body["source_lang"] = clone.language.clone().into();
                body["consent_attestation"] = clone.consent_statement.clone().into();
            }
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
        let response = client
            .post(format!("http://127.0.0.1:{TTS_PORT}/v1/audio/speech"))
            .json(&body)
            .send()
            .await
            .map_err(|e| crate::err!("backend.tts.synthFailed", error = e))?;
        if !response.status().is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(crate::err!("backend.tts.synthFailed", error = text));
        }
        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| crate::err!("backend.tts.synthFailed", error = e))
    }
}

/// Synthesises for the voice settings of a character and returns a WAV data URL.
pub async fn synthesize_data_url(
    model_id: Option<&str>,
    voice_id: &str,
    text: &str,
    rate: &str,
    description: &str,
    style: &str,
) -> Result<String, String> {
    let model_id = model_id
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| crate::err!("backend.tts.noModel"))?;
    let language = crate::modules::content_lang::language_code(
        &crate::modules::content_lang::ContentLang::reply_language_name(),
    );
    let wav = engine()
        .synthesize_with(
            model_id,
            voice_id,
            text,
            &language,
            crate::modules::kokoro::rate_to_speed(rate),
            VoicePrompt { description, style },
        )
        .await?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, wav);
    Ok(format!("data:audio/wav;base64,{b64}"))
}
