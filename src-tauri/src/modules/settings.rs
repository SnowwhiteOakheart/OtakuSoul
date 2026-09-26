use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tracing::{info, warn};

use crate::modules::inference::SamplingParams;
use crate::modules::llama_manager::LlamaServerConfig;
use crate::modules::paths::{resolve_app_paths, scan_available_characters, scan_available_models, scan_available_vrm_models};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub server_config: LlamaServerConfig,
    pub sampling: SamplingParams,
    pub selected_backend: String, // "local" | "cloud"
    pub cloud_endpoint: String,
    pub cloud_api_key: String,
    pub cloud_model: String,
    pub reply_language: String,
    pub lorebook_scan_depth: u32,
    pub active_character_id: Option<String>,
    pub active_persona_id: Option<String>,
    pub active_vrm_path: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        // Automatically discover defaults from scanned assets
        let models = scan_available_models();
        let default_model_path = models.first().map(|m| m.path.clone()).unwrap_or_default();

        let vrms = scan_available_vrm_models();
        let default_vrm_path = vrms.first().map(|v| v.path.clone());

        let characters = scan_available_characters();
        let default_char_id = characters.first().map(|c| c.id.clone());

        Self {
            server_config: LlamaServerConfig {
                model_path: default_model_path,
                ..Default::default()
            },
            sampling: SamplingParams::default(),
            selected_backend: "local".to_string(),
            cloud_endpoint: "https://openrouter.ai/api/v1/chat/completions".to_string(),
            cloud_api_key: String::new(),
            cloud_model: "anthropic/claude-3.5-sonnet".to_string(),
            reply_language: "Deutsch".to_string(),
            lorebook_scan_depth: 5,
            active_character_id: default_char_id,
            active_persona_id: None,
            active_vrm_path: default_vrm_path,
        }
    }
}

pub fn get_settings_file_path() -> PathBuf {
    let paths = resolve_app_paths();
    PathBuf::from(paths.config_dir).join("settings.json")
}

pub fn load_app_settings() -> AppSettings {
    let path = get_settings_file_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(mut settings) = serde_json::from_str::<AppSettings>(&content) {
                // If model path or vrm path is empty, try populating from scan
                if settings.server_config.model_path.is_empty() {
                    let models = scan_available_models();
                    if let Some(first_model) = models.first() {
                        settings.server_config.model_path = first_model.path.clone();
                    }
                }
                if settings.active_vrm_path.is_none() {
                    let vrms = scan_available_vrm_models();
                    if let Some(first_vrm) = vrms.first() {
                        settings.active_vrm_path = Some(first_vrm.path.clone());
                    }
                }
                return settings;
            } else {
                warn!("settings.json ist beschädigt, erstelle neue Standardkonfiguration.");
            }
        }
    }

    let defaults = AppSettings::default();
    let _ = save_app_settings(&defaults);
    defaults
}

pub fn save_app_settings(settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Fehler bei der Serialisierung der Einstellungen: {}", e))?;

    fs::write(&path, json)
        .map_err(|e| format!("Fehler beim Schreiben von {:?}: {}", path, e))?;

    info!("Einstellungen erfolgreich in {:?} gespeichert.", path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_load_save() {
        let mut settings = AppSettings::default();
        settings.reply_language = "English".to_string();
        let save_res = save_app_settings(&settings);
        assert!(save_res.is_ok());

        let loaded = load_app_settings();
        assert_eq!(loaded.reply_language, "English");

        // Clean up test alteration
        settings.reply_language = "Deutsch".to_string();
        let _ = save_app_settings(&settings);
    }
}
