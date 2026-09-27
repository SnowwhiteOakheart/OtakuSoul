use crate::modules::inference::SamplingParams;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmPreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_builtin: bool,
    pub sampling: SamplingParams,
}

pub fn get_default_presets() -> Vec<LlmPreset> {
    vec![
        LlmPreset {
            id: "roleplay_balanced".to_string(),
            name: "Ausgewogenes Rollenspiel (Standard)".to_string(),
            description: "Optimal für immersive Dialoge und lebendige Reaktionen ohne Repetition.".to_string(),
            is_builtin: true,
            sampling: SamplingParams {
                temperature: Some(0.8),
                top_p: Some(0.9),
                min_p: Some(0.05),
                top_k: Some(40),
                frequency_penalty: None,
                presence_penalty: None,
                repeat_penalty: Some(1.05),
                dynatemp_range: None,
                dynatemp_exponent: None,
                dry_multiplier: Some(0.8),
                dry_base: Some(1.75),
                dry_allowed_length: Some(2),
                dry_penalty_last_n: Some(-1),
                xtc_threshold: None,
                xtc_probability: None,
                stop_strings: Vec::new(),
                max_tokens: Some(2048),
            },
        },
        LlmPreset {
            id: "storytelling_creative".to_string(),
            name: "Storytelling & Kreativ".to_string(),
            description: "Höhere Varianz mit Dynamic Temperature und DRY für abwechslungsreiche Prosa.".to_string(),
            is_builtin: true,
            sampling: SamplingParams {
                temperature: Some(1.15),
                top_p: Some(0.95),
                min_p: Some(0.04),
                top_k: Some(60),
                frequency_penalty: None,
                presence_penalty: None,
                repeat_penalty: Some(1.08),
                dynatemp_range: Some(0.25),
                dynatemp_exponent: Some(1.0),
                dry_multiplier: Some(1.0),
                dry_base: Some(1.75),
                dry_allowed_length: Some(2),
                dry_penalty_last_n: Some(-1),
                xtc_threshold: None,
                xtc_probability: None,
                stop_strings: Vec::new(),
                max_tokens: Some(3072),
            },
        },
        LlmPreset {
            id: "tactical_logic".to_string(),
            name: "Taktisch & Präzise (Stage GM)".to_string(),
            description: "Niedrige Temperatur für verlässliche Würfelprüfungen, Logik und Kampfregeln.".to_string(),
            is_builtin: true,
            sampling: SamplingParams {
                temperature: Some(0.35),
                top_p: Some(0.8),
                min_p: Some(0.1),
                top_k: Some(20),
                frequency_penalty: None,
                presence_penalty: None,
                repeat_penalty: Some(1.1),
                dynatemp_range: None,
                dynatemp_exponent: None,
                dry_multiplier: None,
                dry_base: None,
                dry_allowed_length: None,
                dry_penalty_last_n: None,
                xtc_threshold: None,
                xtc_probability: None,
                stop_strings: Vec::new(),
                max_tokens: Some(2048),
            },
        },
        LlmPreset {
            id: "uncensored_xtc".to_string(),
            name: "Unzensiert & Wild (XTC Explorer)".to_string(),
            description: "Nutzt XTC (Exclude Top Choices) für überraschende, originelle Wortwahlen.".to_string(),
            is_builtin: true,
            sampling: SamplingParams {
                temperature: Some(1.25),
                top_p: Some(0.98),
                min_p: Some(0.03),
                top_k: Some(80),
                frequency_penalty: None,
                presence_penalty: None,
                repeat_penalty: Some(1.06),
                dynatemp_range: Some(0.2),
                dynatemp_exponent: Some(1.0),
                dry_multiplier: Some(0.8),
                dry_base: Some(1.75),
                dry_allowed_length: Some(2),
                dry_penalty_last_n: Some(-1),
                xtc_threshold: Some(0.15),
                xtc_probability: Some(0.5),
                stop_strings: Vec::new(),
                max_tokens: Some(2048),
            },
        },
        LlmPreset {
            id: "fast_chat".to_string(),
            name: "Schneller Chat & Visual Novel".to_string(),
            description: "Kompakte Token-Länge für rasanten Gesprächsfluss.".to_string(),
            is_builtin: true,
            sampling: SamplingParams {
                temperature: Some(0.7),
                top_p: Some(0.85),
                min_p: Some(0.07),
                top_k: Some(40),
                frequency_penalty: None,
                presence_penalty: None,
                repeat_penalty: Some(1.04),
                dynatemp_range: None,
                dynatemp_exponent: None,
                dry_multiplier: None,
                dry_base: None,
                dry_allowed_length: None,
                dry_penalty_last_n: None,
                xtc_threshold: None,
                xtc_probability: None,
                stop_strings: Vec::new(),
                max_tokens: Some(1024),
            },
        },
    ]
}

pub fn default_presets_path() -> PathBuf {
    let base_dir = directories::ProjectDirs::from("com", "snowwhite", "otakusoul")
        .map(|dirs| dirs.config_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("./config"));
    base_dir.join("llm_presets.json")
}

pub fn load_llm_presets(custom_path: Option<&Path>) -> Vec<LlmPreset> {
    let path = custom_path
        .map(|p| p.to_path_buf())
        .unwrap_or_else(default_presets_path);

    let mut presets = get_default_presets();

    if path.exists()
        && let Ok(content) = std::fs::read_to_string(&path)
            && let Ok(user_presets) = serde_json::from_str::<Vec<LlmPreset>>(&content) {
                for up in user_presets {
                    if !presets.iter().any(|p| p.id == up.id) {
                        presets.push(up);
                    }
                }
            }

    presets
}

pub fn save_llm_preset(preset: LlmPreset, custom_path: Option<&Path>) -> Result<Vec<LlmPreset>, String> {
    let path = custom_path
        .map(|p| p.to_path_buf())
        .unwrap_or_else(default_presets_path);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Fehler beim Erstellen des Preset-Ordners: {}", e))?;
    }

    let mut current = load_llm_presets(Some(&path));
    if let Some(idx) = current.iter().position(|p| p.id == preset.id) {
        current[idx] = preset;
    } else {
        current.push(preset);
    }

    let user_only: Vec<LlmPreset> = current.iter().filter(|p| !p.is_builtin).cloned().collect();
    let json = serde_json::to_string_pretty(&user_only)
        .map_err(|e| format!("Fehler beim Serialisieren der Presets: {}", e))?;

    std::fs::write(&path, json)
        .map_err(|e| format!("Fehler beim Speichern der Presets: {}", e))?;

    Ok(current)
}

pub fn delete_llm_preset(preset_id: &str, custom_path: Option<&Path>) -> Result<Vec<LlmPreset>, String> {
    let path = custom_path
        .map(|p| p.to_path_buf())
        .unwrap_or_else(default_presets_path);

    let mut current = load_llm_presets(Some(&path));
    current.retain(|p| p.id != preset_id || p.is_builtin);

    let user_only: Vec<LlmPreset> = current.iter().filter(|p| !p.is_builtin).cloned().collect();
    let json = serde_json::to_string_pretty(&user_only)
        .map_err(|e| format!("Fehler beim Serialisieren der Presets: {}", e))?;

    std::fs::write(&path, json)
        .map_err(|e| format!("Fehler beim Speichern der Presets: {}", e))?;

    Ok(current)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_presets() {
        let presets = get_default_presets();
        assert_eq!(presets.len(), 5);
        assert!(presets.iter().any(|p| p.id == "roleplay_balanced"));
        assert!(presets.iter().any(|p| p.id == "storytelling_creative"));
        assert!(presets.iter().any(|p| p.id == "uncensored_xtc"));
    }
}
