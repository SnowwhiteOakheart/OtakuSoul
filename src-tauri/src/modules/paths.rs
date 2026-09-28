use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::modules::characters::{
    CharacterProfile, load_character_from_file, parse_character_json,
};

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
    if base_root.ends_with("src-tauri")
        && let Some(parent) = base_root.parent()
    {
        base_root = parent.to_path_buf();
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
    if let Ok(content) = fs::read_to_string(&path)
        && let Ok(val) = serde_json::from_str::<serde_json::Value>(&content)
        && let Some(hidden) = val.get("hidden_character_ids").and_then(|v| v.as_array())
    {
        return hidden
            .iter()
            .filter_map(|v| v.as_str())
            .map(normalize_identifier)
            .collect();
    }
    std::collections::HashSet::new()
}

type BundledExpressionSets = HashMap<String, JsonMap<String, JsonValue>>;

fn resolve_bundled_expression_set(
    card_path: &Path,
    expressions: &JsonMap<String, JsonValue>,
) -> JsonMap<String, JsonValue> {
    let parent = card_path.parent().unwrap_or_else(|| Path::new("."));

    expressions
        .iter()
        .map(|(emotion, value)| {
            let resolved = value.as_str().map(|source| {
                let is_external = source.starts_with("data:")
                    || source.starts_with("blob:")
                    || source.starts_with("http://")
                    || source.starts_with("https://")
                    || source.starts_with("asset:");
                let source_path = Path::new(source);

                if is_external || source_path.is_absolute() {
                    source.to_string()
                } else {
                    parent.join(source_path).to_string_lossy().to_string()
                }
            });

            (
                emotion.clone(),
                resolved
                    .map(JsonValue::String)
                    .unwrap_or_else(|| value.clone()),
            )
        })
        .collect()
}

/// Loads expression sets from bundled JSON cards once so older user copies of those cards can inherit
/// newly shipped artwork without replacing any user-authored character data.
fn collect_bundled_expression_sets(presets_dir: &Path) -> BundledExpressionSets {
    let mut sets = HashMap::new();

    let Ok(preset_folders) = fs::read_dir(presets_dir) else {
        return sets;
    };

    for folder in preset_folders.flatten() {
        let folder_path = folder.path();
        if !folder_path.is_dir() {
            continue;
        }

        let Ok(entries) = fs::read_dir(&folder_path) else {
            continue;
        };

        for entry in entries.flatten() {
            let card_path = entry.path();
            if card_path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }

            let Ok(content) = fs::read_to_string(&card_path) else {
                continue;
            };
            let Ok(card) = parse_character_json(&content) else {
                continue;
            };
            let Some(expressions) = card
                .data
                .extensions
                .get("expressions")
                .and_then(JsonValue::as_object)
                .filter(|values| !values.is_empty())
            else {
                continue;
            };

            let resolved = resolve_bundled_expression_set(&card_path, expressions);
            if let Some(stem) = card_path.file_stem().and_then(|value| value.to_str()) {
                sets.insert(normalize_identifier(stem), resolved.clone());
            }
            sets.insert(normalize_identifier(&card.data.name), resolved);
        }
    }

    sets
}

fn apply_bundled_expression_fallback(
    profile: &mut CharacterProfile,
    bundled_sets: &BundledExpressionSets,
) {
    let extensions = &mut profile.card.data.extensions;
    let has_expressions = ["expressions", "sow_expressions"].iter().any(|key| {
        extensions
            .get(key)
            .and_then(JsonValue::as_object)
            .map(|values| !values.is_empty())
            .unwrap_or(false)
    });
    if has_expressions {
        return;
    }

    let expressions = bundled_sets
        .get(&normalize_identifier(&profile.id))
        .or_else(|| bundled_sets.get(&normalize_identifier(&profile.card.data.name)))
        .cloned();
    let Some(expressions) = expressions else {
        return;
    };

    if !extensions.is_object() {
        *extensions = JsonValue::Object(JsonMap::new());
    }
    if let Some(values) = extensions.as_object_mut() {
        values.insert("expressions".to_string(), JsonValue::Object(expressions));
    }
}

/// Recursively scans for character cards (.png and .json) in presets and user directories
pub fn scan_available_characters() -> Vec<CharacterProfile> {
    let paths = resolve_app_paths();
    let mut profiles = Vec::new();
    let mut seen_identifiers = std::collections::HashSet::new();
    let hidden = load_hidden_character_ids();
    let bundled_expression_sets =
        collect_bundled_expression_sets(Path::new(&paths.bundled_presets_dir));

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

                if let Ok(mut profile) = load_character_from_file(&path) {
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
                    apply_bundled_expression_fallback(&mut profile, &bundled_expression_sets);
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

    #[test]
    fn test_bundled_expression_sets_resolve_to_absolute_paths() {
        let paths = resolve_app_paths();
        let sets = collect_bundled_expression_sets(Path::new(&paths.bundled_presets_dir));
        let jibril = sets
            .get("jibril")
            .expect("Jibril preset should provide expressions");

        assert_eq!(jibril.len(), 6);
        for source in jibril.values().filter_map(JsonValue::as_str) {
            assert!(Path::new(source).is_absolute(), "not absolute: {source}");
            assert!(Path::new(source).exists(), "missing expression: {source}");
        }
    }

    #[test]
    fn test_missing_user_expressions_inherit_bundled_set() {
        let paths = resolve_app_paths();
        let preset_path = Path::new(&paths.bundled_presets_dir)
            .join("no-game-no-life")
            .join("jibril.json");
        let mut profile = load_character_from_file(&preset_path).expect("load Jibril preset");
        profile.source_path = Some("/tmp/user-characters/Jibril.png".to_string());
        profile
            .card
            .data
            .extensions
            .as_object_mut()
            .expect("extensions object")
            .remove("expressions");

        let sets = collect_bundled_expression_sets(Path::new(&paths.bundled_presets_dir));
        apply_bundled_expression_fallback(&mut profile, &sets);

        let inherited = profile
            .card
            .data
            .extensions
            .get("expressions")
            .and_then(JsonValue::as_object)
            .expect("runtime expression fallback");
        assert_eq!(inherited.len(), 6);
        assert!(
            inherited
                .get("happy")
                .and_then(JsonValue::as_str)
                .map(Path::new)
                .map(Path::exists)
                .unwrap_or(false)
        );
    }
}
