use serde::{Deserialize, Serialize};
use std::time::Duration;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum TtsEngine {
    #[serde(rename = "edge")]
    Edge,
    #[serde(rename = "kokoro")]
    Kokoro,
    #[serde(rename = "elevenlabs")]
    ElevenLabs,
    #[serde(rename = "openai")]
    OpenAi,
    /// Local, multilingual speech through CrispASR (`modules/tts_local.rs`).
    #[serde(rename = "local")]
    Local,
    #[serde(rename = "disabled")]
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum TtsFilterMode {
    #[serde(rename = "all")]
    All,
    #[serde(rename = "dialogue_only")]
    DialogueOnly,
    #[serde(rename = "strip_actions")]
    StripActions,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub enum SttEngine {
    #[serde(rename = "native_whisper")]
    NativeWhisper,
    #[serde(rename = "openai")]
    OpenAi,
    #[serde(rename = "disabled")]
    #[default]
    Disabled,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RvcConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub endpoint: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub pitch: i32,
    #[serde(default = "default_rvc_index_rate")]
    pub index_rate: f32,
    #[serde(default = "default_rvc_protect")]
    pub protect: f32,
}

impl Default for RvcConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoint: String::new(),
            api_key: String::new(),
            model: String::new(),
            pitch: 0,
            index_rate: default_rvc_index_rate(),
            protect: default_rvc_protect(),
        }
    }
}

/// Sound effects applied to a voice when it is played (Web Audio in the app; the server
/// returns the plain voice). Presets only fill these values.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, TS)]
#[serde(default)]
#[ts(export)]
pub struct VoiceEffects {
    /// Last chosen preset (`robot`, `radio`, `ghost`, `cave`, `deep`, `fairy`); empty = own values.
    pub preset: String,
    /// Pitch in semitones (−12 … 12) without changing the tempo.
    pub pitch_semitones: f32,
    /// Reverb share 0 … 1.
    pub reverb: f32,
    /// Echo share 0 … 1.
    pub echo: f32,
    /// Robotic ring modulation 0 … 1.
    pub robot: f32,
    /// Cuts frequencies below (Hz, 0 = off).
    pub highpass_hz: u32,
    /// Cuts frequencies above (Hz, 0 = off).
    pub lowpass_hz: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SttConfig {
    #[serde(default)]
    pub engine: SttEngine,
    #[serde(default)]
    pub whisper_model_path: String,
    #[serde(default = "default_stt_endpoint")]
    pub endpoint: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_stt_model")]
    pub model: String,
    #[serde(default)]
    pub language: String,
    #[serde(default)]
    pub prompt: String,
    #[serde(default = "default_vad_threshold")]
    pub vad_threshold: f32,
    #[serde(default = "default_vad_silence_ms")]
    pub vad_silence_ms: u32,
    #[serde(default)]
    pub input_device_id: String,
    /// Voice call: speaking while the character talks stops her (barge-in).
    #[serde(default = "default_barge_in")]
    pub barge_in: bool,
    /// Tell speech from typing, breathing and noise with Silero VAD (`modules::vad`) on top of
    /// the level; without the model the level alone decides.
    #[serde(default = "default_barge_in")]
    pub speech_model: bool,
}

impl Default for SttConfig {
    fn default() -> Self {
        Self {
            engine: SttEngine::Disabled,
            whisper_model_path: String::new(),
            endpoint: default_stt_endpoint(),
            api_key: String::new(),
            model: default_stt_model(),
            language: String::new(),
            prompt: String::new(),
            vad_threshold: default_vad_threshold(),
            vad_silence_ms: default_vad_silence_ms(),
            input_device_id: String::new(),
            barge_in: default_barge_in(),
            speech_model: default_barge_in(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct VoiceConfig {
    pub engine: TtsEngine,
    pub voice_id: String,
    #[serde(default = "default_rate")]
    pub rate: String,
    #[serde(default = "default_pitch")]
    pub pitch: String,
    #[serde(default = "default_volume")]
    pub volume: String,
    #[serde(default = "default_filter_mode")]
    pub filter_mode: TtsFilterMode,
    #[serde(default)]
    pub custom_regex: String,
    #[serde(default)]
    pub elevenlabs_api_key: String,
    #[serde(default = "default_openai_endpoint")]
    pub openai_endpoint: String,
    #[serde(default)]
    pub openai_api_key: String,
    #[serde(default = "default_openai_model")]
    pub openai_model: String,
    #[serde(default)]
    pub openai_instructions: String,
    #[serde(default)]
    pub kokoro: crate::modules::kokoro::KokoroConfig,
    /// Catalog id of the local speech model (engine `local`).
    #[serde(default)]
    pub local_model_id: Option<String>,
    #[serde(default)]
    pub output_device_id: String,
    #[serde(default)]
    pub rvc: RvcConfig,
    #[serde(default)]
    pub stt: SttConfig,
    /// Played with these effects; `None` = plain voice.
    #[serde(default)]
    #[ts(optional)]
    pub effects: Option<VoiceEffects>,
    /// The character speaks only their own words; `*actions*` are read by the narrator voice
    /// (profile `stage_narrator`, split in the frontend: `services/narratorVoice.ts`).
    #[serde(default)]
    pub narrator_for_actions: bool,
    /// How a local voice with style control speaks (Qwen3-TTS 1.7B CustomVoice), e.g. "softly
    /// and a little shy". Only manner, never age or gender: those bend the preset voice.
    #[serde(default)]
    pub local_style: String,
    /// Such a voice also takes on the feeling of each sentence (`emotions::speaking_style`).
    #[serde(default = "default_local_emotion")]
    pub local_emotion: bool,
}

fn default_local_emotion() -> bool {
    true
}

fn default_rate() -> String {
    "+0%".to_string()
}
fn default_pitch() -> String {
    "+0Hz".to_string()
}
fn default_volume() -> String {
    "+0%".to_string()
}
fn default_filter_mode() -> TtsFilterMode {
    TtsFilterMode::StripActions
}
fn default_openai_endpoint() -> String {
    "http://localhost:8880/v1/audio/speech".to_string()
}
fn default_openai_model() -> String {
    "tts-1".to_string()
}
fn default_stt_endpoint() -> String {
    "http://localhost:8080/v1/audio/transcriptions".to_string()
}
fn default_stt_model() -> String {
    "whisper-1".to_string()
}
fn default_vad_threshold() -> f32 {
    0.025
}
fn default_vad_silence_ms() -> u32 {
    900
}
fn default_barge_in() -> bool {
    true
}
fn default_rvc_index_rate() -> f32 {
    0.75
}
fn default_rvc_protect() -> f32 {
    0.33
}

pub(super) fn http_client(timeout_seconds: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .build()
        .map_err(|e| crate::err!("backend.voice.httpClient", error = e))
}

impl Default for VoiceConfig {
    fn default() -> Self {
        Self {
            engine: TtsEngine::Edge,
            voice_id: "de-DE-KatjaNeural".to_string(),
            rate: default_rate(),
            pitch: default_pitch(),
            volume: default_volume(),
            filter_mode: TtsFilterMode::StripActions,
            custom_regex: String::new(),
            elevenlabs_api_key: String::new(),
            openai_endpoint: default_openai_endpoint(),
            openai_api_key: String::new(),
            openai_model: default_openai_model(),
            openai_instructions: String::new(),
            kokoro: crate::modules::kokoro::KokoroConfig::default(),
            local_model_id: None,
            output_device_id: String::new(),
            rvc: RvcConfig::default(),
            stt: SttConfig::default(),
            effects: None,
            narrator_for_actions: false,
            local_style: String::new(),
            local_emotion: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScannedVoice {
    pub id: String,
    pub name: String,
    pub locale: String,
    pub gender: String,
}

/// Generates a random UUID v4 string without an external crate dependency.
pub(super) fn uuid_v4() -> String {
    let bytes: [u8; 16] = rand::random();
    format!(
        "{:08x}-{:04x}-4{:03x}-{:04x}-{:012x}",
        u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]),
        u16::from_be_bytes([bytes[4], bytes[5]]),
        u16::from_be_bytes([bytes[6], bytes[7]]) & 0x0FFF,
        (u16::from_be_bytes([bytes[8], bytes[9]]) & 0x3FFF) | 0x8000,
        u64::from_be_bytes([
            0, 0, bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ])
    )
}
