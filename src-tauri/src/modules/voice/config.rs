use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;

use crate::modules::paths::resolve_app_paths;

use super::models::{TtsFilterMode, VoiceConfig};

fn get_voice_config_dir() -> PathBuf {
    let paths = resolve_app_paths();
    PathBuf::from(paths.config_dir).join("voice_configs")
}

fn get_voice_config_path(char_id: &str) -> PathBuf {
    let safe_id: String = char_id
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect();
    let safe_id = if safe_id.trim_matches('_').is_empty() {
        "default"
    } else {
        &safe_id
    };
    get_voice_config_dir().join(format!("{}.json", safe_id))
}

/// Voice profile of the narrator: Soul Stage game master and NPCs, and `*actions*` in the chat
/// (`narrator_for_actions`; frontend `services/narratorVoice.ts`).
pub const NARRATOR_VOICE_ID: &str = "stage_narrator";

/// The narrator's voice until the user saves one: a calm male storyteller that differs from the
/// characters' default (a female voice). Works without any model (Edge-TTS in the reply
/// language) and brings a description for VoiceDesign/OpenAI and a style for voices with style
/// control, so switching to a local model sounds like a narrator, too.
pub fn narrator_default_config(language: &str) -> VoiceConfig {
    let voice_id = match language {
        "de" => "de-DE-ConradNeural",
        "ru" => "ru-RU-DmitryNeural",
        "ja" => "ja-JP-KeitaNeural",
        _ => "en-GB-RyanNeural",
    };
    VoiceConfig {
        voice_id: voice_id.to_string(),
        // The narrator reads the actions themselves (without asterisks): nothing to filter.
        filter_mode: TtsFilterMode::All,
        openai_instructions: "A calm, warm mature male narrator with a clear, resonant baritone; \
            measured pace, gentle storytelling tone, like an audiobook reader."
            .to_string(),
        local_style:
            "Speak calmly and evenly like an audiobook narrator, with a gentle storytelling tone."
                .to_string(),
        ..VoiceConfig::default()
    }
}

pub fn load_character_voice_config(char_id: &str) -> VoiceConfig {
    let path = get_voice_config_path(char_id);
    let mut config = if char_id == NARRATOR_VOICE_ID && !path.exists() {
        let language = crate::modules::content_lang::language_code(
            &crate::modules::content_lang::ContentLang::reply_language_name(),
        );
        narrator_default_config(&language)
    } else {
        load_voice_config_from_path(&path)
    };
    let prefix = voice_secret_prefix(&path);
    let mut needs_migration = false;
    for (name, value) in voice_secret_fields(&mut config) {
        needs_migration |= crate::modules::secrets::hydrate(&format!("{}/{}", prefix, name), value);
    }
    if needs_migration {
        let _ = save_character_voice_config(char_id, &config);
    }
    config
}

fn voice_secret_prefix(path: &Path) -> String {
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    format!("voice/{}", stem)
}

fn voice_secret_fields(config: &mut VoiceConfig) -> [(&'static str, &mut String); 4] {
    [
        ("elevenlabs_api_key", &mut config.elevenlabs_api_key),
        ("openai_api_key", &mut config.openai_api_key),
        ("rvc_api_key", &mut config.rvc.api_key),
        ("stt_api_key", &mut config.stt.api_key),
    ]
}

pub(super) fn load_voice_config_from_path(path: &Path) -> VoiceConfig {
    if path.exists()
        && let Ok(content) = fs::read_to_string(path)
        && let Ok(config) = serde_json::from_str::<VoiceConfig>(&content)
    {
        return config;
    }
    VoiceConfig::default()
}

pub fn save_character_voice_config(char_id: &str, config: &VoiceConfig) -> Result<(), String> {
    let path = get_voice_config_path(char_id);
    let prefix = voice_secret_prefix(&path);
    let mut on_disk = config.clone();
    for (name, value) in voice_secret_fields(&mut on_disk) {
        crate::modules::secrets::externalize(&format!("{}/{}", prefix, name), value);
    }
    save_voice_config_to_path(&path, &on_disk)?;
    info!(
        "Stimmen-Konfiguration für '{}' gespeichert in {:?}",
        char_id, path
    );
    Ok(())
}

pub(super) fn save_voice_config_to_path(path: &Path, config: &VoiceConfig) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| {
            format!(
                "Stimmen-Konfigurationsordner konnte nicht erstellt werden: {}",
                e
            )
        })?;
    }
    let json = serde_json::to_string_pretty(config).map_err(|e| {
        format!(
            "Fehler bei der Serialisierung der Stimmen-Konfiguration: {}",
            e
        )
    })?;
    fs::write(path, json).map_err(|e| crate::err!("backend.voice.configWrite", error = e))?;
    Ok(())
}
