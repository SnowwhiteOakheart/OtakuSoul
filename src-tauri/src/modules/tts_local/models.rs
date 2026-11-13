use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use ts_rs::TS;

use super::catalog::{CATALOG, data_dir, models_dir, speaks_sound_tags};
use super::cloning::list_cloned_voices;

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
    /// Voices described in words for VoiceDesign models; characters pick them as `design:<id>`.
    #[serde(default)]
    pub designed_voices: Vec<DesignedVoice>,
}

/// A named voice description for VoiceDesign models, shared by any number of characters.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DesignedVoice {
    pub id: String,
    pub name: String,
    pub description: String,
}

fn default_true() -> bool {
    true
}

impl Default for TtsLocalSettings {
    fn default() -> Self {
        Self {
            allow_noncommercial: false,
            spoken_disclaimer: true,
            designed_voices: Vec::new(),
        }
    }
}

/// The description a VoiceDesign model speaks with: the designed voice `voice_id` names
/// (`design:<id>`), otherwise the character's own description.
pub(super) fn design_description(voice_id: &str, designed: &[DesignedVoice], own: &str) -> String {
    voice_id
        .strip_prefix("design:")
        .and_then(|id| designed.iter().find(|v| v.id == id))
        .map_or_else(
            || own.trim().to_string(),
            |v| v.description.trim().to_string(),
        )
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TtsVoiceInfo {
    /// `preset:<id>`, `clone:<id>` or `design:<id>`, stored as the character's `voice_id`.
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
    /// Cloning is marked experimental upstream (shown next to the model).
    pub clone_experimental: bool,
    /// The voice is described in words (`openai_instructions` of the voice settings).
    pub voice_design: bool,
    /// A preset voice that takes a speaking style (`local_style` of the voice settings plus the
    /// feeling of each sentence).
    pub style_control: bool,
    /// Roleplay actions such as *laughs* become sounds (`speaks_sound_tags`).
    pub sound_tags: bool,
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
            if m.voice_design {
                voices.extend(settings.designed_voices.iter().map(|v| TtsVoiceInfo {
                    voice_id: format!("design:{}", v.id),
                    label: v.name.clone(),
                    language: "multi".to_string(),
                    cloned: false,
                }));
            }
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
                clone_experimental: m.clone_experimental,
                voice_design: m.voice_design,
                style_control: m.style_control,
                sound_tags: speaks_sound_tags(Some(m.id)),
                vram_mb: m.vram_mb,
                download_bytes,
                missing_bytes,
                installed: missing_bytes == 0,
                voices,
            }
        })
        .collect()
}

/// What a voice is asked for besides the text: the voice description of VoiceDesign models and
/// the speaking style of models with style control (each ignored by the other models).
#[derive(Debug, Clone, Copy, Default)]
pub struct VoicePrompt<'a> {
    pub description: &'a str,
    pub style: &'a str,
}
