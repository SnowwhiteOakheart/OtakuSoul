use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Value as JsonValue};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use ts_rs::TS;

use crate::modules::characters::{
    CharacterProfile, load_character_from_file, parse_character_json,
};

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    pub loras_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScannedModel {
    pub name: String,
    pub path: String,
    pub size_mb: u64,
    pub runtime: String,
    pub recommended_context: u32,
    pub compatibility_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScannedVrm {
    pub name: String,
    pub path: String,
    pub size_mb: u64,
    /// `vrm` or `mmd` (PMX/PMD with its textures next to it).
    pub format: String,
}

/// `(config_dir, data_dir)`: the platform folders, or `$OTAKUSOUL_HOME/config|data` when set
/// (end-to-end tests run against a throwaway profile next to a real installation).
pub fn base_dirs() -> (PathBuf, PathBuf) {
    if let Some(home) = isolated_home() {
        return (home.join("config"), home.join("data"));
    }
    match ProjectDirs::from("com", "snowwhite", "otakusoul") {
        Some(dirs) => (
            dirs.config_dir().to_path_buf(),
            dirs.data_dir().to_path_buf(),
        ),
        None => (PathBuf::from("./config"), PathBuf::from("./data")),
    }
}

/// The profile folder from `OTAKUSOUL_HOME`, if the app runs isolated.
pub fn isolated_home() -> Option<PathBuf> {
    std::env::var_os("OTAKUSOUL_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

/// Resolves standard base directories for OtakuSoul and creates required user directories
pub fn resolve_app_paths() -> AppPaths {
    let (config_dir, data_dir) = base_dirs();

    let characters_dir = data_dir.join("characters");
    let lorebooks_dir = data_dir.join("lorebooks");
    let personas_dir = data_dir.join("personas");
    let scenes_dir = data_dir.join("scenes");
    let loras_dir = data_dir.join("loras");
    let trash_dir = data_dir.join(".trash");

    // Ensure user directories exist
    let _ = fs::create_dir_all(&config_dir);
    let _ = fs::create_dir_all(&data_dir);
    let _ = fs::create_dir_all(&characters_dir);
    let _ = fs::create_dir_all(&lorebooks_dir);
    let _ = fs::create_dir_all(&personas_dir);
    let _ = fs::create_dir_all(&scenes_dir);
    let _ = fs::create_dir_all(&loras_dir);
    let _ = fs::create_dir_all(&trash_dir);

    let roots = bundle_roots();
    let bundled_presets = find_existing_dir(&roots, &["presets"]);
    let bundled_models = find_existing_dir(&roots, &["assets/models", "models"]);
    let bundled_vrm = find_existing_dir(&roots, &["assets/vrm", "vrm"]);
    let bundled_bin = find_existing_dir(&roots, &["bin/cuda", "bin"]);

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
        loras_dir: loras_dir.to_string_lossy().to_string(),
    }
}

static RESOURCE_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

/// Registers Tauri's resource directory (installed builds ship `presets/` and `assets/` there).
pub fn set_resource_dir(dir: PathBuf) {
    let _ = RESOURCE_DIR.set(dir);
}

/// Folders that may hold the bundled `presets`, `assets` and `bin` directories, in order: Tauri's
/// resource directory, the working directory (and the workspace root when started from
/// `src-tauri`), the executable's folder and its parents, and in debug builds the source checkout.
pub fn bundle_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = RESOURCE_DIR.get().cloned().into_iter().collect();
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.ends_with("src-tauri")
            && let Some(parent) = cwd.parent()
        {
            roots.push(parent.to_path_buf());
        }
        roots.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        roots.extend(exe.ancestors().skip(1).take(4).map(Path::to_path_buf));
    }
    if cfg!(debug_assertions) {
        roots.push(Path::new(env!("CARGO_MANIFEST_DIR")).join(".."));
    }
    if roots.is_empty() {
        roots.push(PathBuf::from("."));
    }
    roots
}

fn find_existing_dir(roots: &[PathBuf], candidates: &[&str]) -> PathBuf {
    for root in roots {
        for candidate in candidates {
            let p = root.join(candidate);
            if p.is_dir() {
                return canonical(&p);
            }
        }
    }
    // Nothing found: point at the first candidate so callers get a sensible, if missing, path.
    roots[0].join(candidates[0])
}

/// `fs::canonicalize` without the Windows `\\?\C:\…` form: such verbatim paths reject `/`,
/// which the frontend uses to join subpaths. UNC paths stay verbatim.
fn canonical(p: &Path) -> PathBuf {
    let Ok(c) = fs::canonicalize(p) else {
        return p.to_path_buf();
    };
    if cfg!(windows)
        && let Some(rest) = c.to_str().and_then(|s| s.strip_prefix(r"\\?\"))
        && rest.as_bytes().get(1) == Some(&b':')
    {
        return PathBuf::from(rest);
    }
    c
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
    let has_expressions = ["expressions", "custom_expressions", "sow_expressions"]
        .iter()
        .any(|key| {
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
    scan_gguf(false)
}

/// Vision projectors (`mmproj-*.gguf`) that let a chat model see images.
pub fn scan_loras() -> Vec<ScannedModel> {
    let paths = resolve_app_paths();
    let mut loras = Vec::new();
    let lora_dir = PathBuf::from(&paths.loras_dir);
    if lora_dir.exists()
        && lora_dir.is_dir()
        && let Ok(entries) = fs::read_dir(lora_dir)
    {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if ext == "safetensors" || ext == "gguf" || ext == "pt" || ext == "bin" {
                    let name = path
                        .file_stem()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    loras.push(ScannedModel {
                        name,
                        path: path.to_string_lossy().to_string(),
                        size_mb: size / (1024 * 1024),
                        runtime: "sd-server".to_string(),
                        recommended_context: 0,
                        compatibility_note: String::new(),
                    });
                }
            }
        }
    }
    loras.sort_by_key(|a| a.name.to_lowercase());
    loras
}

pub fn scan_vision_projectors() -> Vec<ScannedModel> {
    scan_gguf(true)
}

fn is_mmproj(name: &str) -> bool {
    name.to_ascii_lowercase().contains("mmproj")
}

fn scan_gguf(projectors: bool) -> Vec<ScannedModel> {
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
                    if is_mmproj(&name) != projectors {
                        continue;
                    }
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
                            crate::err!("backend.models.notePrismInstalled")
                        } else {
                            crate::err!("backend.models.noteStandard")
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
            .contains("ternary-bonsai-2-27b-pq2_0");
        let b_recommended = b
            .name
            .to_ascii_lowercase()
            .contains("ternary-bonsai-2-27b-pq2_0");
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
                        format: "vrm".into(),
                    });
                }
            }
        }
        // MMD models live in their own folders (textures next to them).
        for model in crate::modules::avatar_models::find_mmd_models(dir, 4) {
            let name = model
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("MMD")
                .to_string();
            let size_mb = fs::metadata(&model)
                .map(|m| m.len() / (1024 * 1024))
                .unwrap_or(0);
            vrms.push(ScannedVrm {
                name,
                path: model.to_string_lossy().to_string(),
                size_mb,
                format: "mmd".into(),
            });
        }
    }

    vrms
}

/// Folders 3D avatars may be loaded from (bundled ones and the user's).
pub fn avatar_roots() -> Vec<PathBuf> {
    let paths = resolve_app_paths();
    vec![
        PathBuf::from(&paths.bundled_vrm_dir),
        PathBuf::from(&paths.data_dir).join("avatars"),
    ]
}

/// Copies a .vrm file into the user's avatar folder so it shows up in the list and stays
/// readable after a restart (files outside the app folders are not in the asset scope).
/// An identical file already in the folder is reused; a different one with the same name
/// gets a numbered name.
pub fn import_vrm_model(source_path: &str) -> Result<ScannedVrm, String> {
    let src = Path::new(source_path);
    let avatars = PathBuf::from(resolve_app_paths().data_dir).join("avatars");
    let is_vrm = src
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("vrm"));
    if is_vrm {
        return import_vrm_into(src, &avatars);
    }
    if !src.is_file() {
        return Err(crate::err!(
            "backend.common.pathMissing",
            path = src.display()
        ));
    }
    let model = crate::modules::avatar_models::import_mmd(src, &avatars)?;
    Ok(ScannedVrm {
        name: model
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("MMD")
            .to_string(),
        size_mb: fs::metadata(&model)
            .map(|m| m.len() / (1024 * 1024))
            .unwrap_or(0),
        path: model.to_string_lossy().to_string(),
        format: "mmd".into(),
    })
}

fn import_vrm_into(src: &Path, dest_dir: &Path) -> Result<ScannedVrm, String> {
    if !src.is_file() {
        return Err(crate::err!(
            "backend.common.pathMissing",
            path = src.display()
        ));
    }
    let is_vrm = src
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("vrm"));
    // VRM files are binary glTF: they start with the magic bytes "glTF".
    let mut magic = [0u8; 4];
    let has_magic = fs::File::open(src)
        .and_then(|mut f| std::io::Read::read_exact(&mut f, &mut magic))
        .is_ok()
        && &magic == b"glTF";
    if !is_vrm || !has_magic {
        return Err(crate::err!("backend.vrm.invalid"));
    }

    fs::create_dir_all(dest_dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("Avatar");
    let src_len = fs::metadata(src).map(|m| m.len()).unwrap_or(0);
    let mut dest = dest_dir.join(format!("{stem}.vrm"));
    let mut n = 2;
    while dest.exists() {
        let same_file = fs::canonicalize(&dest).ok() == fs::canonicalize(src).ok();
        let same_content = fs::metadata(&dest).map(|m| m.len()).ok() == Some(src_len)
            && fs::read(&dest).ok() == fs::read(src).ok();
        if same_file || same_content {
            break;
        }
        dest = dest_dir.join(format!("{stem} ({n}).vrm"));
        n += 1;
    }
    if !dest.exists() {
        fs::copy(src, &dest).map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }

    Ok(ScannedVrm {
        name: dest
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Avatar")
            .to_string(),
        path: dest.to_string_lossy().to_string(),
        size_mb: src_len / (1024 * 1024),
        format: "vrm".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_paths_accept_slash_joined_subpaths() {
        let dir = canonical(&std::env::temp_dir());
        assert!(dir.is_absolute());
        assert!(!dir.to_string_lossy().starts_with(r"\\?\"));
        // The frontend appends `/sub/file`; that has to resolve on every OS.
        let joined = PathBuf::from(format!("{}/.", dir.to_string_lossy()));
        assert!(joined.is_dir());
    }

    #[test]
    fn imports_vrm_files_without_duplicates() {
        let root =
            std::env::temp_dir().join(format!("otakusoul-vrm-import-{}", std::process::id()));
        let src_dir = root.join("src");
        let dest = root.join("avatars");
        fs::create_dir_all(&src_dir).unwrap();
        let vrm = src_dir.join("Mika.vrm");
        fs::write(&vrm, b"glTF\x02\0\0\0rest").unwrap();

        let first = import_vrm_into(&vrm, &dest).unwrap();
        assert_eq!(first.name, "Mika");
        assert!(Path::new(&first.path).exists());
        // Same file again: reused, not copied twice.
        assert_eq!(import_vrm_into(&vrm, &dest).unwrap().path, first.path);
        // Different content with the same name: numbered copy.
        fs::write(&vrm, b"glTF\x02\0\0\0other").unwrap();
        assert_eq!(import_vrm_into(&vrm, &dest).unwrap().name, "Mika (2)");
        // Not a VRM.
        let fake = src_dir.join("fake.vrm");
        fs::write(&fake, b"nope").unwrap();
        assert!(import_vrm_into(&fake, &dest).is_err());

        let _ = fs::remove_dir_all(root);
    }

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
