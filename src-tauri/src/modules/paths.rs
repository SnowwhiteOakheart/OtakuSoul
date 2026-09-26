use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::modules::characters::{load_character_from_file, CharacterProfile};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppPaths {
    pub config_dir: String,
    pub data_dir: String,
    pub characters_dir: String,
    pub lorebooks_dir: String,
    pub personas_dir: String,
    pub scenes_dir: String,
    pub trash_dir: String,
    pub bundled_presets_dir: String,
    pub bundled_models_dir: String,
    pub bundled_vrm_dir: String,
    pub bundled_bin_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedModel {
    pub name: String,
    pub path: String,
    pub size_mb: u64,
    pub runtime: String,
    pub recommended_context: u32,
    pub compatibility_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedVrm {
    pub name: String,
    pub path: String,
    pub size_mb: u64,
}

/// Resolves standard base directories for OtakuSoul and creates required user directories
pub fn resolve_app_paths() -> AppPaths {
    let (config_dir, data_dir) =
        if let Some(proj_dirs) = ProjectDirs::from("com", "snowwhite", "otakusoul") {
            (
                proj_dirs.config_dir().to_path_buf(),
                proj_dirs.data_dir().to_path_buf(),
            )
        } else {
            (PathBuf::from("./config"), PathBuf::from("./data"))
        };

    let characters_dir = data_dir.join("characters");
    let lorebooks_dir = data_dir.join("lorebooks");
    let personas_dir = data_dir.join("personas");
    let scenes_dir = data_dir.join("scenes");
    let trash_dir = data_dir.join(".trash");

    // Ensure user directories exist
    let _ = fs::create_dir_all(&config_dir);
    let _ = fs::create_dir_all(&data_dir);
    let _ = fs::create_dir_all(&characters_dir);
    let _ = fs::create_dir_all(&lorebooks_dir);
    let _ = fs::create_dir_all(&personas_dir);
    let _ = fs::create_dir_all(&scenes_dir);
    let _ = fs::create_dir_all(&trash_dir);

    // Locate bundled directories relative to CWD or executable
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let mut base_root = current_dir.clone();

    // If running inside src-tauri, parent is workspace root
    if base_root.ends_with("src-tauri") {
        if let Some(parent) = base_root.parent() {
            base_root = parent.to_path_buf();
        }
    }

    let bundled_presets = find_existing_dir(&base_root, &["presets", "../presets"]);
    let bundled_models =
        find_existing_dir(&base_root, &["assets/models", "../assets/models", "models"]);
    let bundled_vrm = find_existing_dir(&base_root, &["assets/vrm", "../assets/vrm", "vrm"]);
    let bundled_bin = find_existing_dir(&base_root, &["bin/cuda", "bin", "../bin/cuda", "../bin"]);

    AppPaths {
        config_dir: config_dir.to_string_lossy().to_string(),
        data_dir: data_dir.to_string_lossy().to_string(),
        characters_dir: characters_dir.to_string_lossy().to_string(),
        lorebooks_dir: lorebooks_dir.to_string_lossy().to_string(),
        personas_dir: personas_dir.to_string_lossy().to_string(),
        scenes_dir: scenes_dir.to_string_lossy().to_string(),
        trash_dir: trash_dir.to_string_lossy().to_string(),
        bundled_presets_dir: bundled_presets.to_string_lossy().to_string(),
        bundled_models_dir: bundled_models.to_string_lossy().to_string(),
        bundled_vrm_dir: bundled_vrm.to_string_lossy().to_string(),
        bundled_bin_dir: bundled_bin.to_string_lossy().to_string(),
    }
}

fn find_existing_dir(base: &Path, candidates: &[&str]) -> PathBuf {
    for candidate in candidates {
        let p = base.join(candidate);
        if p.exists() && p.is_dir() {
            return fs::canonicalize(&p).unwrap_or(p);
        }
    }
    // Fallback to first candidate resolved against base
    base.join(candidates[0])
}

/// Helper to normalize strings for robust deduplication (collapses case and non-alphanumeric chars)
pub fn normalize_identifier(s: &str) -> String {
    s.trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Reads hidden character identifiers from settings.json without triggering full settings initialization
fn load_hidden_character_ids() -> std::collections::HashSet<String> {
    let path = PathBuf::from(resolve_app_paths().config_dir).join("settings.json");
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(hidden) = val.get("hidden_character_ids").and_then(|v| v.as_array()) {
                return hidden
                    .iter()
                    .filter_map(|v| v.as_str())
                    .map(normalize_identifier)
                    .collect();
            }
        }
    }
    std::collections::HashSet::new()
}

/// Recursively scans for character cards (.png and .json) in presets and user directories
pub fn scan_available_characters() -> Vec<CharacterProfile> {
    let paths = resolve_app_paths();
    let mut profiles = Vec::new();
    let mut seen_identifiers = std::collections::HashSet::new();
    let hidden = load_hidden_character_ids();

    let scan_dirs = [
        PathBuf::from(&paths.characters_dir),
        PathBuf::from(&paths.bundled_presets_dir).join("sakura-succubus-3"),
        PathBuf::from(&paths.bundled_presets_dir).join("no-game-no-life"),
        PathBuf::from(&paths.bundled_presets_dir).join("cards"),
        PathBuf::from(&paths.bundled_presets_dir),
    ];

    for dir in &scan_dirs {
        if !dir.exists() || !dir.is_dir() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                let ext = path
                    .extension()
                    .and_then(|s| s.to_str())
                    .map(|s| s.to_lowercase());
                if ext != Some("png".to_string()) && ext != Some("json".to_string()) {
                    continue;
                }

                // Ignore lorebook and scene JSON files
                let stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or_default();
                if stem.starts_with("persona_")
                    || stem.contains("lorebook")
                    || stem.contains("scene")
                    || stem.contains("episode")
                    || stem.contains("figuren")
                    || stem.contains("orte")
                    || stem.contains("welt")
                    || stem.contains("rassen")
                {
                    continue;
                }

                let norm_stem = normalize_identifier(stem);
                if hidden.contains(&norm_stem) {
                    continue;
                }

                if seen_identifiers.contains(&norm_stem) {
                    continue;
                }

                if let Ok(profile) = load_character_from_file(&path) {
                    let norm_id = normalize_identifier(&profile.id);
                    let norm_name = normalize_identifier(&profile.card.data.name);

                    if hidden.contains(&norm_id) || hidden.contains(&norm_name) {
                        continue;
                    }

                    if seen_identifiers.contains(&norm_id) || seen_identifiers.contains(&norm_name)
                    {
                        continue;
                    }

                    seen_identifiers.insert(norm_stem);
                    seen_identifiers.insert(norm_id);
                    seen_identifiers.insert(norm_name);
                    profiles.push(profile);
                }
            }
        }
    }

    // Sort by name for clean presentation
    profiles.sort_by(|a, b| {
        a.card
            .data
            .name
            .to_lowercase()
            .cmp(&b.card.data.name.to_lowercase())
    });
    profiles
}

/// Scans for .gguf model files in bundled assets and user directory
pub fn scan_available_models() -> Vec<ScannedModel> {
    let paths = resolve_app_paths();
    let mut models = Vec::new();

    let scan_dirs = [
        PathBuf::from(&paths.bundled_models_dir),
        PathBuf::from(&paths.data_dir).join("models"),
    ];

    for dir in &scan_dirs {
        if !dir.exists() || !dir.is_dir() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("gguf") {
                    let name = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Model")
                        .to_string();
                    let size_mb = entry
                        .metadata()
                        .map(|m| m.len() / (1024 * 1024))
                        .unwrap_or(0);
                    let lower_name = name.to_ascii_lowercase();
                    let is_prism = lower_name.contains("pq2_0") || lower_name.contains("ptq1_0");
                    let is_bonsai = lower_name.contains("bonsai");
                    models.push(ScannedModel {
                        name,
                        path: path.to_string_lossy().to_string(),
                        size_mb,
                        runtime: if is_prism { "prism" } else { "standard" }.to_string(),
                        recommended_context: if is_bonsai { 32768 } else { 8192 },
                        compatibility_note: if is_prism {
                            "PrismML Runtime wird automatisch verwendet".to_string()
                        } else {
                            "Standard llama.cpp".to_string()
                        },
                    });
                }
            }
        }
    }

    models.sort_by(|a, b| {
        let a_recommended = a
            .name
            .to_ascii_lowercase()
            .contains("ternary-bonsai-27b-pq2_0");
        let b_recommended = b
            .name
            .to_ascii_lowercase()
            .contains("ternary-bonsai-27b-pq2_0");
        b_recommended
            .cmp(&a_recommended)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    models
}

/// Scans for .vrm 3D avatar files in bundled assets and user directory
pub fn scan_available_vrm_models() -> Vec<ScannedVrm> {
    let paths = resolve_app_paths();
    let mut vrms = Vec::new();

    let scan_dirs = [
        PathBuf::from(&paths.bundled_vrm_dir),
        PathBuf::from(&paths.data_dir).join("avatars"),
    ];

    for dir in &scan_dirs {
        if !dir.exists() || !dir.is_dir() {
            continue;
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("vrm") {
                    let name = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Avatar")
                        .to_string();
                    let size_mb = entry
                        .metadata()
                        .map(|m| m.len() / (1024 * 1024))
                        .unwrap_or(0);
                    vrms.push(ScannedVrm {
                        name,
                        path: path.to_string_lossy().to_string(),
                        size_mb,
                    });
                }
            }
        }
    }

    vrms
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_app_paths() {
        let paths = resolve_app_paths();
        assert!(!paths.config_dir.is_empty());
        assert!(!paths.data_dir.is_empty());
        assert!(!paths.characters_dir.is_empty());
    }

    #[test]
    fn test_scan_characters() {
        let chars = scan_available_characters();
        // At least our bundled presets should be found
        println!("Scanned {} characters", chars.len());
        assert!(!chars.is_empty());
    }
}
