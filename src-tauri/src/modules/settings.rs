use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tracing::{info, warn};

use crate::modules::inference::SamplingParams;
use crate::modules::llama_manager::LlamaServerConfig;
use crate::modules::paths::{resolve_app_paths, scan_available_characters, scan_available_models, scan_available_vrm_models};

fn default_cloud_provider() -> String {
    "open_router".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub server_config: LlamaServerConfig,
    pub sampling: SamplingParams,
    pub selected_backend: String, // "local" | "cloud"
    #[serde(default = "default_cloud_provider")]
    pub cloud_provider: String,
    pub cloud_endpoint: String,
    pub cloud_api_key: String,
    pub cloud_model: String,
    #[serde(default)]
    pub active_preset_id: Option<String>,
    pub reply_language: String,
    pub lorebook_scan_depth: u32,
    pub active_character_id: Option<String>,
    pub active_persona_id: Option<String>,
    pub active_vrm_path: Option<String>,
    #[serde(default)]
    pub global_lorebooks: Vec<String>,
    #[serde(default = "default_true")]
    pub scene_tension_enabled: bool,
    #[serde(default)]
    pub hidden_character_ids: Vec<String>,
}

fn default_true() -> bool {
    true
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
            cloud_provider: "open_router".to_string(),
            cloud_endpoint: "https://openrouter.ai/api/v1/chat/completions".to_string(),
            cloud_api_key: String::new(),
            cloud_model: "anthropic/claude-3.5-sonnet".to_string(),
            active_preset_id: Some("storytelling_kreativ".to_string()),
            reply_language: "Deutsch".to_string(),
            lorebook_scan_depth: 5,
            active_character_id: default_char_id,
            active_persona_id: None,
            active_vrm_path: default_vrm_path,
            global_lorebooks: Vec::new(),
            scene_tension_enabled: true,
            hidden_character_ids: Vec::new(),
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
    save_app_settings_to_path(settings, &path)?;
    info!("Einstellungen erfolgreich in {:?} gespeichert.", path);
    Ok(())
}

fn save_app_settings_to_path(settings: &AppSettings, path: &std::path::Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Einstellungsordner konnte nicht erstellt werden: {}", e))?;
    }

    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Fehler bei der Serialisierung der Einstellungen: {}", e))?;

    fs::write(path, json)
        .map_err(|e| format!("Fehler beim Schreiben von {:?}: {}", path, e))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_settings_load_save() {
        let test_dir = std::env::temp_dir().join(format!(
            "otakusoul-settings-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = test_dir.join("settings.json");
        let settings = AppSettings {
            reply_language: "English".to_string(),
            ..Default::default()
        };
        let save_res = save_app_settings_to_path(&settings, &path);
        assert!(save_res.is_ok());

        let content = fs::read_to_string(&path).unwrap();
        let loaded: AppSettings = serde_json::from_str(&content).unwrap();
        assert_eq!(loaded.reply_language, "English");
        let _ = fs::remove_dir_all(test_dir);
    }
}
