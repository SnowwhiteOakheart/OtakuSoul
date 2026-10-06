//! Local, multilingual speech synthesis with CrispASR (`crispasr --server`).
//!
//! The app downloads the models of a small catalog, starts one `crispasr` server for the model
//! a character uses and asks it for speech through the OpenAI-compatible
//! `POST /v1/audio/speech`. Voices are either presets shipped with a model or voices the user
//! cloned from their own recording.
//!
//! The repository is public, so licensing is explicit: models with a non-commercial licence
//! (F5-TTS) stay locked until the user allows them, and cloned voices always carry the consent
//! statement the user confirmed. CrispASR watermarks the audio itself (EU AI Act, Art. 50).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use ts_rs::TS;

use crate::modules::model_files::RemoteFile;

const TTS_PORT: u16 = 48598;
const READY_TIMEOUT: Duration = Duration::from_secs(300);
/// Cloned voices need a clean sample of a few seconds; longer ones only slow synthesis down.
const MIN_SAMPLE_SECS: f32 = 3.0;
const MAX_SAMPLE_SECS: f32 = 30.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Role {
    Main,
    /// Companion GGUF (`--codec-model`).
    Codec,
    /// Voice packs and other files that only need to sit next to the model.
    Extra,
}

struct TtsFile {
    role: Role,
    file: RemoteFile,
}

struct PresetVoice {
    id: &'static str,
    label: &'static str,
    /// Voice pack in the models folder; `None` for the model's built-in voice.
    file: Option<&'static str>,
    language: &'static str,
}

struct TtsModel {
    id: &'static str,
    name: &'static str,
    backend: &'static str,
    license: &'static str,
    /// Weights may only be used non-commercially; locked until the user allows it.
    noncommercial: bool,
    languages: &'static [&'static str],
    /// Can speak with a voice cloned from a recording.
    cloning: bool,
    /// Needs a cloned voice (no preset of its own).
    needs_clone: bool,
    /// The voice comes from a description (`instructions`) instead of a preset or clone.
    voice_design: bool,
    vram_mb: u64,
    files: &'static [TtsFile],
    voices: &'static [PresetVoice],
    /// Language the server is started with (kokoro picks its German backbone this way).
    start_language: Option<&'static str>,
}

const QWEN_LANGS: &[&str] = &["de", "en", "ru", "ja", "zh", "ko", "fr", "es", "it", "pt"];
const CHATTERBOX_LANGS: &[&str] = &[
    "ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it", "ja", "ko", "ms", "nl", "no",
    "pl", "pt", "ru", "sv", "sw", "tr", "zh",
];

const CATALOG: &[TtsModel] = &[
    // The 0.6B *Base* GGUF lacks the codec language table, so every language but English ran
    // in "auto" and produced gibberish (e2e test 2026-10-01). Built-in voices therefore use
    // CustomVoice (has the table) and cloning the 1.7B Base model.
    TtsModel {
        id: "qwen3-tts-customvoice-0.6b",
        name: "Qwen3-TTS 0.6B (eingebaute Stimmen)",
        backend: "qwen3-tts-customvoice",
        license: "Apache-2.0",
        noncommercial: false,
        languages: QWEN_LANGS,
        cloning: false,
        needs_clone: false,
        voice_design: false,
        vram_mb: 3_200,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-0.6b-customvoice-GGUF",
                    path: "qwen3-tts-12hz-0.6b-customvoice-q8_0.gguf",
                    size: 967_980_192,
                    sha256: Some(
                        "5227dcbc4df7c5533341d111cc469fa491a48e722b23dd10f553181b52dff2d9",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-tokenizer-12hz-GGUF",
                    path: "qwen3-tts-tokenizer-12hz.gguf",
                    size: 358_453_280,
                    sha256: Some(
                        "70dc95dbfdd9aa5d9d406236ff771d061bf17b0cda02a72513953355606e719b",
                    ),
                },
            },
        ],
        voices: &[
            PresetVoice {
                id: "vivian",
                label: "Vivian",
                file: None,
                language: "multi",
            },
            PresetVoice {
                id: "serena",
                label: "Serena",
                file: None,
                language: "multi",
            },
            PresetVoice {
                id: "ono_anna",
                label: "Ono Anna",
                file: None,
                language: "multi",
            },
            PresetVoice {
                id: "sohee",
                label: "Sohee",
                file: None,
                language: "multi",
            },
            PresetVoice {
                id: "ryan",
                label: "Ryan",
                file: None,
                language: "multi",
            },
            PresetVoice {
                id: "aiden",
                label: "Aiden",
                file: None,
                language: "multi",
            },
            PresetVoice {
                id: "dylan",
                label: "Dylan",
                file: None,
                language: "multi",
            },
            PresetVoice {
                id: "eric",
                label: "Eric",
                file: None,
                language: "multi",
            },
            PresetVoice {
                id: "uncle_fu",
                label: "Uncle Fu",
                file: None,
                language: "multi",
            },
        ],
        start_language: None,
    },
    TtsModel {
        id: "qwen3-tts-1.7b",
        name: "Qwen3-TTS 1.7B (Stimmklon)",
        backend: "qwen3-tts-1.7b-base",
        license: "Apache-2.0",
        noncommercial: false,
        languages: QWEN_LANGS,
        cloning: true,
        needs_clone: true,
        voice_design: false,
        vram_mb: 3_600,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-1.7b-base-GGUF",
                    path: "qwen3-tts-12hz-1.7b-base-q8_0.gguf",
                    size: 2_066_258_176,
                    sha256: Some(
                        "bbb93ab1f4a3f771f94fc6f68404b2b969bdf3b14c6303473dbf64c63011520d",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-tokenizer-12hz-GGUF",
                    path: "qwen3-tts-tokenizer-12hz.gguf",
                    size: 358_453_280,
                    sha256: Some(
                        "70dc95dbfdd9aa5d9d406236ff771d061bf17b0cda02a72513953355606e719b",
                    ),
                },
            },
        ],
        voices: &[],
        start_language: None,
    },
    // VoiceDesign: the voice is described in words (character card or voice settings).
    TtsModel {
        id: "qwen3-tts-1.7b-voicedesign",
        name: "Qwen3-TTS 1.7B VoiceDesign (Stimme per Beschreibung)",
        backend: "qwen3-tts-1.7b-voicedesign",
        license: "Apache-2.0",
        noncommercial: false,
        languages: QWEN_LANGS,
        cloning: false,
        needs_clone: false,
        voice_design: true,
        vram_mb: 3_600,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-1.7b-voicedesign-GGUF",
                    path: "qwen3-tts-12hz-1.7b-voicedesign-q8_0.gguf",
                    size: 2_042_225_536,
                    sha256: Some(
                        "ce9c6d69146891f7854ac46be3bf4e40f803fbebbfe7cdbd12ae3a4b24777295",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/qwen3-tts-tokenizer-12hz-GGUF",
                    path: "qwen3-tts-tokenizer-12hz.gguf",
                    size: 358_453_280,
                    sha256: Some(
                        "70dc95dbfdd9aa5d9d406236ff771d061bf17b0cda02a72513953355606e719b",
                    ),
                },
            },
        ],
        voices: &[],
        start_language: None,
    },
    TtsModel {
        id: "chatterbox-multilingual",
        name: "Chatterbox Multilingual",
        backend: "chatterbox",
        license: "MIT",
        noncommercial: false,
        languages: CHATTERBOX_LANGS,
        cloning: false,
        needs_clone: false,
        voice_design: false,
        vram_mb: 2_300,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/chatterbox-GGUF",
                    path: "chatterbox-v3-t3-q8_0.gguf",
                    size: 639_286_176,
                    sha256: Some(
                        "c896a0d882aedd61083e5ea1b6764e52fa09a5734cba54b55fdcec18036e8211",
                    ),
                },
            },
            TtsFile {
                role: Role::Codec,
                file: RemoteFile {
                    repo: "cstr/chatterbox-GGUF",
                    path: "chatterbox-v3-s3gen-q8_0.gguf",
                    size: 364_590_688,
                    sha256: Some(
                        "ad2d99210a469e7d5ee66780a1e2e8604473e2dcc2ee09cef3409dbed2015c83",
                    ),
                },
            },
        ],
        voices: &[PresetVoice {
            id: "default",
            label: "Standard",
            file: None,
            language: "multi",
        }],
        start_language: None,
    },
    TtsModel {
        id: "kokoro-de",
        name: "Kokoro (Deutsch)",
        backend: "kokoro",
        license: "Apache-2.0",
        noncommercial: false,
        languages: &["de"],
        cloning: false,
        needs_clone: false,
        voice_design: false,
        vram_mb: 600,
        files: &[
            TtsFile {
                role: Role::Main,
                file: RemoteFile {
                    repo: "cstr/kokoro-82m-GGUF",
                    path: "kokoro-82m-q8_0.gguf",
                    size: 141_322_336,
                    sha256: Some(
                        "3c8b60064b287a10abd35396a59c9981675c618db8bc91bd290db63f55eb492d",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    // CrispASR only picks the German backbone up under this f16 name.
                    repo: "cstr/kokoro-de-hui-base-GGUF",
                    path: "kokoro-de-hui-base-f16.gguf",
                    size: 163_728_096,
                    sha256: Some(
                        "af1b5339f936635e711fcb1e2aa0f60fb505ff00f55743bc11708d98d4dabaa5",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/kokoro-voices-GGUF",
                    path: "kokoro-voice-df_victoria.gguf",
                    size: 522_784,
                    sha256: Some(
                        "ef7b5021f1f2c77c12d4423a22a31b214c3bfc7eb36c615ca54d5f13ccdba8d1",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/kokoro-voices-GGUF",
                    path: "kokoro-voice-df_eva.gguf",
                    size: 524_832,
                    sha256: Some(
                        "3942404617a4a77728a46b54ead8bbc4dd799128784e071ee37c941a08acc674",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/kokoro-voices-GGUF",
                    path: "kokoro-voice-dm_bernd.gguf",
                    size: 524_832,
                    sha256: Some(
                        "b2c075a3d78b35d169ae0839228705a6aa05c0d66cabe9d5f4a841f32a4b2050",
                    ),
                },
            },
            TtsFile {
                role: Role::Extra,
                file: RemoteFile {
                    repo: "cstr/kokoro-voices-GGUF",
                    path: "kokoro-voice-dm_martin.gguf",
                    size: 522_784,
                    sha256: Some(
                        "7eda2f6da5571e041b2d737f73bad4fdcebd939759de4d1b075b841543e53a29",
                    ),
                },
            },
        ],
        voices: &[
            PresetVoice {
                id: "df_victoria",
                label: "Victoria",
                file: Some("kokoro-voice-df_victoria.gguf"),
                language: "de",
            },
            PresetVoice {
                id: "df_eva",
                label: "Eva",
                file: Some("kokoro-voice-df_eva.gguf"),
                language: "de",
            },
            PresetVoice {
                id: "dm_bernd",
                label: "Bernd",
                file: Some("kokoro-voice-dm_bernd.gguf"),
                language: "de",
            },
            PresetVoice {
                id: "dm_martin",
                label: "Martin",
                file: Some("kokoro-voice-dm_martin.gguf"),
                language: "de",
            },
        ],
        start_language: Some("de"),
    },
    TtsModel {
        id: "f5-tts-v1",
        // ~1 min per second of audio on CUDA in CrispASR 0.8.39 (e2e test 2026-10-01).
        name: "F5-TTS v1 (experimentell, sehr langsam)",
        backend: "f5-tts",
        license: "CC-BY-NC-4.0",
        noncommercial: true,
        languages: &["en", "zh"],
        cloning: true,
        needs_clone: true,
        voice_design: false,
        vram_mb: 2_000,
        files: &[TtsFile {
            role: Role::Main,
            file: RemoteFile {
                repo: "cstr/f5-tts-GGUF",
                path: "f5-tts-v1-base-f16.gguf",
                size: 999_097_152,
                sha256: Some("25a4d273048dad072774ff139cf19b96fe442bebda8392c08009d73256cf1e81"),
            },
        }],
        voices: &[],
        start_language: None,
    },
];

fn catalog_model(id: &str) -> Result<&'static TtsModel, String> {
    // Settings saved with the withdrawn 0.6B Base model use the built-in-voice model instead.
    let id = if id == "qwen3-tts-0.6b" {
        "qwen3-tts-customvoice-0.6b"
    } else {
        id
    };
    CATALOG
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| crate::err!("backend.tts.unknownModel", model = id))
}

fn data_dir() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir)
}

fn models_dir() -> PathBuf {
    data_dir().join("tts-models")
}

fn voices_dir() -> PathBuf {
    data_dir().join("voices")
}

fn is_installed(model: &TtsModel) -> bool {
    let dir = models_dir();
    model.files.iter().all(|f| f.file.is_complete(&dir))
}

// ---------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------

/// App-wide settings of the local speech engine (`tts_local.json`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TtsLocalSettings {
    /// Allow models whose weights are licensed for non-commercial use only (off by default).
    #[serde(default)]
    pub allow_noncommercial: bool,
    /// Speak a short AI disclosure before lines in a cloned voice (CrispASR default).
    #[serde(default = "default_true")]
    pub spoken_disclaimer: bool,
}

fn default_true() -> bool {
    true
}

impl Default for TtsLocalSettings {
    fn default() -> Self {
        Self {
            allow_noncommercial: false,
            spoken_disclaimer: true,
        }
    }
}

fn settings_path() -> PathBuf {
    data_dir().join("tts_local.json")
}

pub fn load_settings() -> TtsLocalSettings {
    std::fs::read_to_string(settings_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_settings(settings: &TtsLocalSettings) -> Result<(), String> {
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    std::fs::write(settings_path(), json)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

// ---------------------------------------------------------------------------------------
// Catalog for the UI and downloads
// ---------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TtsVoiceInfo {
    /// `preset:<id>` or `clone:<id>`, stored as the character's `voice_id`.
    pub voice_id: String,
    pub label: String,
    pub language: String,
    pub cloned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TtsModelInfo {
    pub id: String,
    pub name: String,
    pub license: String,
    pub noncommercial: bool,
    /// Usable under the current settings (non-commercial models need to be allowed).
    pub allowed: bool,
    pub languages: Vec<String>,
    pub cloning: bool,
    pub needs_clone: bool,
    /// The voice is described in words (`openai_instructions` of the voice settings).
    pub voice_design: bool,
    pub vram_mb: u64,
    pub download_bytes: u64,
    pub missing_bytes: u64,
    pub installed: bool,
    pub voices: Vec<TtsVoiceInfo>,
}

pub fn list_models() -> Vec<TtsModelInfo> {
    let settings = load_settings();
    let dir = models_dir();
    let clones = list_cloned_voices();
    CATALOG
        .iter()
        .map(|m| {
            let download_bytes = m.files.iter().map(|f| f.file.size).sum();
            let missing_bytes = m
                .files
                .iter()
                .filter(|f| !f.file.is_complete(&dir))
                .map(|f| f.file.size)
                .sum();
            let mut voices: Vec<TtsVoiceInfo> = m
                .voices
                .iter()
                .map(|v| TtsVoiceInfo {
                    voice_id: format!("preset:{}", v.id),
                    label: v.label.to_string(),
                    language: v.language.to_string(),
                    cloned: false,
                })
                .collect();
            if m.cloning {
                voices.extend(clones.iter().map(|c| TtsVoiceInfo {
                    voice_id: format!("clone:{}", c.id),
                    label: c.name.clone(),
                    language: c.language.clone(),
                    cloned: true,
                }));
            }
            TtsModelInfo {
                id: m.id.to_string(),
                name: m.name.to_string(),
                license: m.license.to_string(),
                noncommercial: m.noncommercial,
                allowed: !m.noncommercial || settings.allow_noncommercial,
                languages: m.languages.iter().map(|l| l.to_string()).collect(),
                cloning: m.cloning,
                needs_clone: m.needs_clone,
                voice_design: m.voice_design,
                vram_mb: m.vram_mb,
                download_bytes,
                missing_bytes,
                installed: missing_bytes == 0,
                voices,
            }
        })
        .collect()
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TtsModelProgress {
    pub model_id: String,
    pub file_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f32,
    pub finished: bool,
}

static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);

pub fn cancel_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

fn ensure_allowed(model: &TtsModel) -> Result<(), String> {
    if model.noncommercial && !load_settings().allow_noncommercial {
        return Err(crate::err!(
            "backend.tts.noncommercialLocked",
            model = model.name
        ));
    }
    Ok(())
}

/// Downloads the missing files of `model_id`; progress goes to `tts-model-progress`.
pub async fn download_model<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    model_id: &str,
) -> Result<(), String> {
    download_model_with(model_id, &|p| {
        let _ = app.emit("tts-model-progress", p);
    })
    .await
}

/// [`download_model`] with a progress callback instead of the Tauri event (tests, tools).
pub async fn download_model_with(
    model_id: &str,
    emit: &(impl Fn(TtsModelProgress) + Sync),
) -> Result<(), String> {
    let model = catalog_model(model_id)?;
    ensure_allowed(model)?;
    CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);
    let dir = models_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let client = crate::modules::model_files::http_client()?;
    let total: u64 = model.files.iter().map(|f| f.file.size).sum();
    let mut done: u64 = model
        .files
        .iter()
        .filter(|f| f.file.is_complete(&dir))
        .map(|f| f.file.size)
        .sum();
    let emit_progress = |file_name: &str, bytes: u64, finished: bool| {
        emit(TtsModelProgress {
            model_id: model.id.to_string(),
            file_name: file_name.to_string(),
            downloaded_bytes: bytes,
            total_bytes: total,
            percent: (bytes as f32 / total.max(1) as f32 * 100.0).min(100.0),
            finished,
        });
    };
    for file in model.files.iter().filter(|f| !f.file.is_complete(&dir)) {
        crate::modules::model_files::download_file(
            &client,
            &file.file,
            &dir,
            &CANCEL_DOWNLOAD,
            &|bytes| emit_progress(file.file.file_name(), done + bytes, false),
        )
        .await?;
        done += file.file.size;
    }
    emit_progress("", total, true);
    tracing::info!("Sprachmodell {} heruntergeladen", model.id);
    Ok(())
}

/// Deletes the files of `model_id`.
pub async fn delete_model(model_id: &str) -> Result<(), String> {
    let model = catalog_model(model_id)?;
    let engine = engine();
    if engine.loaded_model().await.as_deref() == Some(model.id) {
        engine.stop().await;
    }
    let dir = models_dir();
    for file in model.files {
        let path = file.file.path_in(&dir);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(crate::modules::model_files::part_path(&path));
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------
// Cloned voices
// ---------------------------------------------------------------------------------------

/// A voice cloned from the user's own recording (`voices/<id>.wav|.txt|.json`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ClonedVoice {
    pub id: String,
    pub name: String,
    /// Language the reference is spoken in.
    pub language: String,
    /// Transcript of the reference recording.
    pub ref_text: String,
    /// The consent statement the user confirmed; sent with every synthesis request.
    pub consent_statement: String,
    pub duration_secs: f32,
    pub created_at: String,
}

pub fn list_cloned_voices() -> Vec<ClonedVoice> {
    let Ok(entries) = std::fs::read_dir(voices_dir()) else {
        return Vec::new();
    };
    let mut voices: Vec<ClonedVoice> = entries
        .flatten()
        .filter(|e| e.path().extension().is_some_and(|x| x == "json"))
        .filter_map(|e| serde_json::from_str(&std::fs::read_to_string(e.path()).ok()?).ok())
        .filter(|v: &ClonedVoice| voices_dir().join(format!("{}.wav", v.id)).is_file())
        .collect();
    voices.sort_by_key(|v| v.name.to_lowercase());
    voices
}

fn slug(name: &str) -> String {
    let base: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let base = if base.is_empty() {
        "voice".to_string()
    } else {
        base
    };
    format!("{base}-{:x}", chrono::Utc::now().timestamp_millis())
}

/// Stores a cloned voice from mono f32 PCM samples. `consent` must be confirmed.
pub fn create_cloned_voice(
    name: &str,
    samples: &[f32],
    sample_rate: u32,
    ref_text: &str,
    language: &str,
    consent: bool,
) -> Result<ClonedVoice, String> {
    if !consent {
        return Err(crate::err!("backend.tts.consentRequired"));
    }
    let name = name.trim();
    if name.is_empty() {
        return Err(crate::err!("backend.tts.voiceNameRequired"));
    }
    if ref_text.trim().is_empty() {
        return Err(crate::err!("backend.tts.refTextRequired"));
    }
    if !(8_000..=48_000).contains(&sample_rate) {
        return Err(crate::err!("backend.tts.sampleInvalid"));
    }
    let duration = samples.len() as f32 / sample_rate as f32;
    if !(MIN_SAMPLE_SECS..=MAX_SAMPLE_SECS).contains(&duration) {
        return Err(crate::err!(
            "backend.tts.sampleLength",
            seconds = format!("{duration:.1}"),
            min = MIN_SAMPLE_SECS,
            max = MAX_SAMPLE_SECS
        ));
    }

    let dir = voices_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let id = slug(name);
    // Qwen3-TTS rejects references that are not 24 kHz.
    let samples = resample_linear(samples, sample_rate, REFERENCE_RATE);
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: REFERENCE_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(dir.join(format!("{id}.wav")), spec)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    for s in &samples {
        writer
            .write_sample((s.clamp(-1.0, 1.0) * f32::from(i16::MAX)) as i16)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    writer
        .finalize()
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;

    let voice = ClonedVoice {
        id: id.clone(),
        name: name.to_string(),
        language: language.to_string(),
        ref_text: ref_text.trim().to_string(),
        consent_statement: format!(
            "OtakuSoul user confirmed on {}: I am this speaker or have their consent to clone this voice.",
            chrono::Utc::now().to_rfc3339()
        ),
        duration_secs: duration,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    // crispasr reads `<name>.txt` next to a `.wav` reference as its transcript.
    std::fs::write(dir.join(format!("{id}.txt")), &voice.ref_text)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    let json = serde_json::to_string_pretty(&voice)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    std::fs::write(dir.join(format!("{id}.json")), json)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    tracing::info!("Stimme {} ({:.1}s) gespeichert", voice.id, duration);
    Ok(voice)
}

/// Sample rate of stored voice references (required by Qwen3-TTS).
pub const REFERENCE_RATE: u32 = 24_000;

fn resample_linear(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() {
        return input.to_vec();
    }
    let ratio = f64::from(from) / f64::from(to);
    let len = ((input.len() as f64) / ratio).round().max(1.0) as usize;
    (0..len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let left = (pos as usize).min(input.len() - 1);
            let right = (left + 1).min(input.len() - 1);
            let frac = (pos - left as f64) as f32;
            input[left] * (1.0 - frac) + input[right] * frac
        })
        .collect()
}

pub fn delete_cloned_voice(id: &str) -> Result<(), String> {
    // Only ids we created: no path separators.
    if id.is_empty() || id.contains(['/', '\\', '.']) {
        return Err(crate::err!("backend.tts.unknownVoice", voice = id));
    }
    for ext in ["wav", "txt", "json"] {
        let _ = std::fs::remove_file(voices_dir().join(format!("{id}.{ext}")));
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------
// crispasr server and synthesis
// ---------------------------------------------------------------------------------------

struct CrispProcess {
    child: Child,
    model_id: String,
    spoken_disclaimer: bool,
}

pub struct LocalTtsEngine {
    process: Mutex<Option<CrispProcess>>,
    logs: Arc<Mutex<std::collections::VecDeque<String>>>,
    busy: Mutex<()>,
}

/// The one speech engine of the app (synthesis is called from chat, web server and Discord).
pub fn engine() -> &'static LocalTtsEngine {
    static ENGINE: OnceLock<LocalTtsEngine> = OnceLock::new();
    ENGINE.get_or_init(|| LocalTtsEngine {
        process: Mutex::new(None),
        logs: Arc::new(Mutex::new(std::collections::VecDeque::with_capacity(60))),
        busy: Mutex::new(()),
    })
}

/// How a character's `voice_id` is sent to the server.
#[derive(Debug, PartialEq)]
enum VoiceChoice {
    /// The model's built-in voice.
    Default,
    /// A voice name the server resolves itself: a built-in speaker (`vivian`) or a voice pack
    /// file in the voice folder (`kokoro-voice-df_eva.gguf`).
    Preset(String),
    Clone(ClonedVoice),
}

fn resolve_voice(model: &TtsModel, voice_id: &str) -> Result<VoiceChoice, String> {
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
        #[cfg(unix)]
        // SAFETY: prctl only affects the child that is about to exec.
        unsafe {
            cmd.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                Ok(())
            });
        }

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
        self.synthesize_with(model_id, voice_id, text, language, speed, "")
            .await
    }

    /// `synthesize` with a voice description for VoiceDesign models.
    pub async fn synthesize_with(
        &self,
        model_id: &str,
        voice_id: &str,
        text: &str,
        language: &str,
        speed: f32,
        description: &str,
    ) -> Result<Vec<u8>, String> {
        let _busy = self.busy.lock().await;
        let model = catalog_model(model_id)?;
        ensure_allowed(model)?;
        let description = description.trim();
        if model.voice_design && description.is_empty() {
            return Err(crate::err!(
                "backend.tts.needsDescription",
                model = model.name
            ));
        }
        let voice = resolve_voice(model, voice_id)?;
        let settings = load_settings();
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
            body["instructions"] = description.into();
        }
        match &voice {
            VoiceChoice::Default => {}
            // The server only accepts bare names, resolved against `--voice-dir`.
            VoiceChoice::Preset(name) => {
                body["voice"] = name.clone().into();
            }
            VoiceChoice::Clone(clone) => {
                body["voice"] = clone.id.clone().into();
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
            description,
        )
        .await?;
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, wav);
    Ok(format!("data:audio/wav;base64,{b64}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_is_consistent() {
        for model in CATALOG {
            assert_eq!(
                model.files.iter().filter(|f| f.role == Role::Main).count(),
                1,
                "{}",
                model.id
            );
            for file in model.files {
                assert!(
                    file.file.sha256.is_some_and(|s| s.len() == 64),
                    "{}",
                    file.file.path
                );
            }
            for voice in model.voices {
                if let Some(name) = voice.file {
                    assert!(
                        model.files.iter().any(|f| f.file.file_name() == name),
                        "{} missing {}",
                        model.id,
                        name
                    );
                }
            }
            // Without presets a model needs a clone, unless the voice is described (VoiceDesign).
            assert_eq!(
                model.needs_clone,
                model.voices.is_empty() && !model.voice_design,
                "{}",
                model.id
            );
            // Non-commercial weights must be flagged by their licence name.
            assert_eq!(
                model.noncommercial,
                model.license.contains("NC"),
                "{}",
                model.id
            );
        }
    }

    #[test]
    fn resolves_voices_per_model() {
        let kokoro = catalog_model("kokoro-de").unwrap();
        assert_eq!(
            resolve_voice(kokoro, "preset:dm_bernd").unwrap(),
            VoiceChoice::Preset("kokoro-voice-dm_bernd.gguf".into())
        );
        // Unknown presets fall back to the model's first voice.
        assert_eq!(
            resolve_voice(kokoro, "").unwrap(),
            VoiceChoice::Preset("kokoro-voice-df_victoria.gguf".into())
        );
        // Built-in speakers go by name; the old 0.6B Base id maps to CustomVoice.
        let qwen = catalog_model("qwen3-tts-0.6b").unwrap();
        assert_eq!(qwen.id, "qwen3-tts-customvoice-0.6b");
        assert_eq!(
            resolve_voice(qwen, "preset:serena").unwrap(),
            VoiceChoice::Preset("serena".into())
        );
        assert_eq!(
            resolve_voice(qwen, "preset:default").unwrap(),
            VoiceChoice::Preset("vivian".into())
        );
        // Kokoro cannot clone; F5 and the 1.7B model need a clone.
        assert!(resolve_voice(kokoro, "clone:someone").is_err());
        assert!(resolve_voice(catalog_model("f5-tts-v1").unwrap(), "preset:default").is_err());
        assert!(resolve_voice(catalog_model("qwen3-tts-1.7b").unwrap(), "preset:vivian").is_err());
    }

    #[test]
    fn resamples_references_to_24_khz() {
        let one_second_16k = vec![0.5f32; 16_000];
        let out = resample_linear(&one_second_16k, 16_000, REFERENCE_RATE);
        assert_eq!(out.len(), 24_000);
        assert!(out.iter().all(|s| (s - 0.5).abs() < 1e-6));
        assert_eq!(
            resample_linear(&one_second_16k, 16_000, 16_000).len(),
            16_000
        );
    }

    #[test]
    fn slugs_voice_names() {
        let id = slug("Mein Stimm-Sample Nr. 1");
        assert!(id.starts_with("mein-stimm-sample-nr-1-"), "{id}");
        assert!(!id.contains(['/', '.', ' ']));
    }
}
