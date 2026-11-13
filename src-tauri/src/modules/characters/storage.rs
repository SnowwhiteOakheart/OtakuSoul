use base64::prelude::*;
use std::fs;
use std::path::{Path, PathBuf};

use crate::modules::paths::resolve_app_paths;

use super::models::{CharacterCardV2, CharacterProfile, UserPersona};
use super::png::{
    get_placeholder_png, inject_character_metadata_png, parse_character_json,
    parse_character_png_card, resolve_profile_expression_paths,
};

pub fn load_character_from_file(path: &Path) -> Result<CharacterProfile, String> {
    if !path.exists() {
        return Err(crate::err!(
            "backend.common.fileMissing",
            path = format!("{:?}", path)
        ));
    }

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    let id = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "character".to_string());

    let mut bound_lorebooks = Vec::new();
    // Only the picture's path: the bytes are read where they are needed (save, export, image
    // references), not for every card on every library scan.
    let (mut card, avatar_path) = if extension == "json" {
        let content = fs::read_to_string(path)
            .map_err(|e| crate::err!("backend.common.jsonRead", error = e))?;
        let card = parse_character_json(&content)?;
        let parent = path.parent().unwrap_or(Path::new("."));
        let png_candidate = parent.join(format!("{}.png", id));
        let avatar_path = png_candidate
            .is_file()
            .then(|| png_candidate.to_string_lossy().to_string());
        (card, avatar_path)
    } else if extension == "png" {
        let bytes =
            fs::read(path).map_err(|e| crate::err!("backend.characters.pngRead", error = e))?;
        let card = parse_character_png_card(&bytes)?;
        (card, Some(path.to_string_lossy().to_string()))
    } else {
        return Err(crate::err!(
            "backend.common.unsupportedFormat",
            extension = extension
        ));
    };

    resolve_profile_expression_paths(&mut card, path);

    if let Some(ext) = card.data.extensions.as_object() {
        if let Some(lb) = ext.get("selected_lorebook").and_then(|v| v.as_str())
            && !lb.trim().is_empty()
            && lb != "None"
        {
            bound_lorebooks.push(lb.to_string());
        }
        if let Some(lbs) = ext.get("bound_lorebooks").and_then(|v| v.as_array()) {
            for b in lbs {
                if let Some(s) = b.as_str()
                    && !s.trim().is_empty()
                    && !bound_lorebooks.contains(&s.to_string())
                {
                    bound_lorebooks.push(s.to_string());
                }
            }
        }
    }

    Ok(CharacterProfile {
        id,
        card,
        avatar_data_url: None,
        avatar_path,
        source_path: Some(path.to_string_lossy().to_string()),
        bound_lorebooks,
    })
}

pub fn extract_and_save_embedded_lorebook(
    card: &CharacterCardV2,
    char_name: &str,
) -> Option<String> {
    let book_val = card
        .data
        .character_book
        .as_ref()
        .or_else(|| card.data.extensions.get("character_book"))
        .or_else(|| card.data.extensions.get("embedded_lorebook"))?;

    let json_str = serde_json::to_string(book_val).ok()?;
    let paths = resolve_app_paths();
    let fallback_name = format!("Lore_{}", char_name);
    if let Ok(lorebook) =
        crate::modules::lorebook::Lorebook::import_from_json_string(&json_str, Some(&fallback_name))
        && !lorebook.entries.is_empty()
    {
        let slug = if !lorebook.id.trim().is_empty() {
            lorebook.id.clone()
        } else {
            lorebook
                .name
                .trim()
                .to_lowercase()
                .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
        };
        let target_path = PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug));
        let _ = lorebook.save_to_file(&target_path);
        return Some(lorebook.name);
    }
    None
}

/// Saves or updates a character profile in the user's data directory (~/.local/share/otakusoul/characters)
pub fn save_character_to_user_dir(profile: &CharacterProfile) -> Result<CharacterProfile, String> {
    let paths = resolve_app_paths();
    let char_dir = PathBuf::from(paths.characters_dir);
    let _ = fs::create_dir_all(&char_dir);

    let safe_name = profile
        .card
        .data
        .name
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let safe_stem = if safe_name.trim().is_empty() {
        profile.id.clone()
    } else {
        safe_name
    };

    let target_png = char_dir.join(format!("{}.png", safe_stem));
    let target_json = char_dir.join(format!("{}.json", safe_stem));

    let mut saved_profile = profile.clone();
    saved_profile.id = safe_stem;
    if let Some(source) = profile.source_path.as_deref() {
        resolve_profile_expression_paths(&mut saved_profile.card, Path::new(source));
    }

    // Ensure bound_lorebooks is updated in extensions
    if let Some(ext) = saved_profile.card.data.extensions.as_object_mut() {
        ext.insert(
            "bound_lorebooks".to_string(),
            serde_json::to_value(&saved_profile.bound_lorebooks).unwrap_or(serde_json::Value::Null),
        );
        // Without bindings the old key goes too: loading reads it back as a binding.
        match saved_profile.bound_lorebooks.first() {
            Some(first_lb) => {
                ext.insert(
                    "selected_lorebook".to_string(),
                    serde_json::Value::String(first_lb.clone()),
                );
            }
            None => {
                ext.remove("selected_lorebook");
            }
        }
    }

    // With a picture (new data URL or the card's file) write a SillyTavern V2 PNG.
    if profile.has_avatar() {
        let base_bytes = profile
            .avatar_png_bytes()
            .unwrap_or_else(get_placeholder_png);

        let enriched_png = inject_character_metadata_png(&base_bytes, &saved_profile.card)?;
        fs::write(&target_png, enriched_png).map_err(|e| {
            crate::err!(
                "backend.common.fileWritePath",
                path = format!("{:?}", target_png),
                error = e
            )
        })?;

        saved_profile.source_path = Some(target_png.to_string_lossy().to_string());
        saved_profile.avatar_path = saved_profile.source_path.clone();
        saved_profile.avatar_data_url = None;
    } else {
        // Save as JSON
        let json_text = serde_json::to_string_pretty(&saved_profile.card)
            .map_err(|e| crate::err!("backend.characters.serialize", error = e))?;
        fs::write(&target_json, json_text).map_err(|e| {
            crate::err!(
                "backend.common.fileWritePath",
                path = format!("{:?}", target_json),
                error = e
            )
        })?;

        saved_profile.source_path = Some(target_json.to_string_lossy().to_string());
        saved_profile.avatar_path = None;
        saved_profile.avatar_data_url = None;
    }

    Ok(saved_profile)
}

/// The character the library already shows under this name (case and punctuation ignored).
pub fn find_character_by_name(name: &str) -> Option<CharacterProfile> {
    let target = crate::modules::paths::normalize_identifier(name);
    crate::modules::paths::scan_available_characters()
        .into_iter()
        .find(|c| crate::modules::paths::normalize_identifier(&c.card.data.name) == target)
}

/// Stores an imported card under its own name. A character of the same name is replaced only
/// with `overwrite`; otherwise `backend.characters.exists` lets the interface ask first.
/// Replacing keeps one entry: older copies under other file names go to the trash, a hidden
/// (deleted) preset of that name shows again, and lorebooks bound by the user stay bound.
pub fn store_imported_card(
    card: CharacterCardV2,
    avatar_data_url: Option<String>,
    overwrite: bool,
) -> Result<crate::modules::hub::CharacterImportResult, String> {
    // An adult card would be stored and then hidden: refuse it while adult content is off.
    crate::modules::nsfw::ensure_visible(&card.data.extensions)?;
    let existing = find_character_by_name(&card.data.name);
    if existing.is_some() && !overwrite {
        return Err(crate::err!(
            "backend.characters.exists",
            name = card.data.name
        ));
    }
    let imported_lorebook = extract_and_save_embedded_lorebook(&card, &card.data.name);
    let bound_lorebooks = match &imported_lorebook {
        Some(name) => vec![name.clone()],
        None => existing.map(|c| c.bound_lorebooks).unwrap_or_default(),
    };
    let profile = CharacterProfile {
        id: card.data.name.clone(),
        card,
        avatar_data_url,
        avatar_path: None,
        source_path: None,
        bound_lorebooks,
    };
    let saved = save_character_to_user_dir(&profile)?;
    let paths = resolve_app_paths();
    if let Some(keep) = saved.source_path.as_deref() {
        trash_other_copies(
            Path::new(&paths.characters_dir),
            Path::new(&paths.trash_dir),
            &saved.card.data.name,
            Path::new(keep),
        );
    }
    unhide_character(&saved.card.data.name)?;
    Ok(crate::modules::hub::CharacterImportResult {
        profile: saved,
        imported_lorebook,
    })
}

/// Moves every card in `dir` that belongs to `name` (by file name or card name) to `trash`,
/// except `keep`.
pub(super) fn trash_other_copies(dir: &Path, trash: &Path, name: &str, keep: &Path) {
    let target = crate::modules::paths::normalize_identifier(name);
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    for path in entries.flatten().map(|e| e.path()) {
        let is_card = path.is_file()
            && matches!(
                path.extension()
                    .and_then(|e| e.to_str())
                    .map(str::to_lowercase)
                    .as_deref(),
                Some("png" | "json")
            );
        if !is_card || path == keep {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        let same = crate::modules::paths::normalize_identifier(stem) == target
            || load_character_from_file(&path).is_ok_and(|c| {
                crate::modules::paths::normalize_identifier(&c.card.data.name) == target
            });
        if same {
            let _ = fs::create_dir_all(trash);
            let file_name = path.file_name().unwrap_or_default().to_string_lossy();
            let _ = fs::rename(&path, trash.join(format!("{timestamp}_{file_name}")));
        }
    }
}

/// Shows a deleted character again once a card of that name is imported.
fn unhide_character(name: &str) -> Result<(), String> {
    let target = crate::modules::paths::normalize_identifier(name);
    let mut settings = crate::modules::settings::load_app_settings();
    let before = settings.hidden_character_ids.len();
    settings
        .hidden_character_ids
        .retain(|id| crate::modules::paths::normalize_identifier(id) != target);
    if settings.hidden_character_ids.len() != before {
        crate::modules::settings::save_app_settings(&settings)?;
    }
    Ok(())
}

/// Imports a card file chosen in the library (see [`store_imported_card`]).
pub fn import_character_file(
    path: &Path,
    overwrite: bool,
) -> Result<crate::modules::hub::CharacterImportResult, String> {
    let loaded = load_character_from_file(path)?;
    let avatar = loaded
        .avatar_png_bytes()
        .map(|bytes| format!("data:image/png;base64,{}", BASE64_STANDARD.encode(bytes)));
    store_imported_card(loaded.card, avatar, overwrite)
}

/// Keys in a card's `extensions` that name an avatar model on this computer.
const AVATAR_MODEL_KEYS: [&str; 5] = [
    "custom_vrm",
    "sow_vrm",
    "custom_live2d",
    "sow_live2d",
    "custom_inochi2d",
];

/// What of an avatar model reference may leave this computer: web addresses as they are, a local
/// path only as its last two parts (no user folder, no drive), a VRoid Hub model not at all.
fn portable_model_reference(model: &str) -> Option<String> {
    let model = model.trim();
    if model.is_empty() || model.starts_with(crate::modules::vroid_hub::PATH_PREFIX) {
        return None;
    }
    if model.starts_with("http://") || model.starts_with("https://") {
        return Some(model.to_string());
    }
    let parts: Vec<&str> = model
        .split(['/', '\\'])
        .filter(|p| !p.is_empty() && !p.contains(':'))
        .collect();
    let end = parts[parts.len().saturating_sub(2)..].join("/");
    (!end.is_empty()).then_some(end)
}

/// Exports a character card to an arbitrary destination chosen by the user
/// A card leaving the app carries no local file paths: emotion pictures stored as paths on this
/// computer (absolute after loading) would only reveal the user's folders and not work elsewhere.
/// Web and `data:` pictures stay. Avatar models keep only the end of their path (folder and file,
/// which the viewers match on) and VRoid Hub models are dropped: they may only be used by the
/// account they were shared with.
pub(super) fn without_local_picture_paths(card: &CharacterCardV2) -> CharacterCardV2 {
    let mut card = card.clone();
    if let Some(extensions) = card.data.extensions.as_object_mut() {
        for key in AVATAR_MODEL_KEYS {
            let Some(model) = extensions.get(key).and_then(serde_json::Value::as_str) else {
                continue;
            };
            match portable_model_reference(model) {
                Some(short) => {
                    extensions.insert(key.into(), short.into());
                }
                None => {
                    extensions.remove(key);
                }
            }
        }
    }
    for key in ["expressions", "custom_expressions", "sow_expressions"] {
        if let Some(map) = card
            .data
            .extensions
            .get_mut(key)
            .and_then(serde_json::Value::as_object_mut)
        {
            map.retain(|_, value| {
                value.as_str().is_some_and(|source| {
                    ["data:", "http://", "https://"]
                        .iter()
                        .any(|prefix| source.starts_with(prefix))
                })
            });
        }
    }
    card
}

pub fn export_character_card(
    profile: &CharacterProfile,
    target_path: &Path,
    export_as_png: bool,
) -> Result<(), String> {
    let card = without_local_picture_paths(&profile.card);
    if export_as_png {
        let enriched_png = card_png_bytes(profile)?;
        fs::write(target_path, enriched_png)
            .map_err(|e| crate::err!("backend.characters.exportPng", error = e))?;
    } else {
        let json_text = serde_json::to_string_pretty(&card)
            .map_err(|e| crate::err!("backend.characters.serialize", error = e))?;
        fs::write(target_path, json_text)
            .map_err(|e| crate::err!("backend.characters.exportJson", error = e))?;
    }

    Ok(())
}

/// The card as a PNG with its data inside (the format cards travel in), without local picture paths.
pub fn card_png_bytes(profile: &CharacterProfile) -> Result<Vec<u8>, String> {
    let card = without_local_picture_paths(&profile.card);
    let base_bytes = profile
        .avatar_png_bytes()
        .unwrap_or_else(get_placeholder_png);
    inject_character_metadata_png(&base_bytes, &card)
}

/// Deletes a character: moves user-created files to the trash folder, and hides preset characters
pub fn delete_character(char_id: &str) -> Result<(), String> {
    let paths = resolve_app_paths();
    let char_dir = PathBuf::from(&paths.characters_dir);
    let trash_dir = PathBuf::from(&paths.trash_dir);
    let _ = fs::create_dir_all(&trash_dir);

    let norm_target = crate::modules::paths::normalize_identifier(char_id);
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // 1. Move any matching files in the user's characters_dir to trash
    if char_dir.exists()
        && char_dir.is_dir()
        && let Ok(entries) = fs::read_dir(&char_dir)
    {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_file() {
                continue;
            }
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
            let norm_stem = crate::modules::paths::normalize_identifier(stem);

            if stem == char_id || norm_stem == norm_target {
                let file_name = p.file_name().unwrap().to_string_lossy();
                let trash_target = trash_dir.join(format!("{}_{}", timestamp, file_name));
                let _ = fs::rename(&p, &trash_target);
            }
        }
    }

    let candidates = [
        char_dir.join(format!("{}.png", char_id)),
        char_dir.join(format!("{}.json", char_id)),
    ];
    for candidate in &candidates {
        if candidate.exists() {
            let file_name = candidate.file_name().unwrap().to_string_lossy();
            let trash_target = trash_dir.join(format!("{}_{}", timestamp, file_name));
            let _ = fs::rename(candidate, &trash_target);
        }
    }

    // 2. Mark this character as hidden in AppSettings so bundled/preset cards are hidden
    let mut settings = crate::modules::settings::load_app_settings();
    hide_character_in_settings(&mut settings, char_id);
    crate::modules::settings::save_app_settings(&settings)?;

    Ok(())
}

pub(super) fn hide_character_in_settings(
    settings: &mut crate::modules::settings::AppSettings,
    char_id: &str,
) {
    let norm_target = crate::modules::paths::normalize_identifier(char_id);
    if !settings
        .hidden_character_ids
        .iter()
        .any(|id| id == char_id || crate::modules::paths::normalize_identifier(id) == norm_target)
    {
        settings.hidden_character_ids.push(char_id.to_string());
    }

    // If active character was this one, reset it
    if let Some(ref active_id) = settings.active_character_id
        && (active_id == char_id
            || crate::modules::paths::normalize_identifier(active_id) == norm_target)
    {
        settings.active_character_id = None;
    }
}

/// Restores all previously hidden / deleted preset characters
pub fn restore_hidden_characters() -> Result<(), String> {
    let mut settings = crate::modules::settings::load_app_settings();
    settings.hidden_character_ids.clear();
    crate::modules::settings::save_app_settings(&settings)
}

// --- User Personas Support ---

pub fn get_personas_file_path() -> PathBuf {
    let paths = resolve_app_paths();
    PathBuf::from(paths.personas_dir).join("personas.json")
}

pub fn load_personas() -> Vec<UserPersona> {
    let path = get_personas_file_path();
    let personas = load_personas_from_path(&path);
    if !path.exists() {
        let _ = save_personas_list_to_path(&personas, &path);
    }
    personas
}

pub(super) fn load_personas_from_path(path: &Path) -> Vec<UserPersona> {
    if path.exists()
        && let Ok(content) = fs::read_to_string(path)
        && let Ok(personas) = serde_json::from_str::<Vec<UserPersona>>(&content)
        && !personas.is_empty()
    {
        return personas;
    }

    let default_list = vec![UserPersona::default()];
    default_list
}

pub fn save_persona(persona: UserPersona) -> Result<Vec<UserPersona>, String> {
    let mut list = load_personas();
    if let Some(idx) = list.iter().position(|p| p.id == persona.id) {
        list[idx] = persona;
    } else {
        list.push(persona);
    }
    save_personas_list(&list)?;
    Ok(list)
}

pub fn delete_persona(persona_id: &str) -> Result<Vec<UserPersona>, String> {
    let mut list = load_personas();
    list.retain(|p| p.id != persona_id);
    if list.is_empty() {
        list.push(UserPersona::default());
    }
    save_personas_list(&list)?;
    Ok(list)
}

fn save_personas_list(list: &[UserPersona]) -> Result<(), String> {
    let path = get_personas_file_path();
    save_personas_list_to_path(list, &path)
}

pub(super) fn save_personas_list_to_path(list: &[UserPersona], path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| crate::err!("backend.characters.personaDir", error = e))?;
    }
    let json = serde_json::to_string_pretty(list)
        .map_err(|e| crate::err!("backend.characters.personaSerialize", error = e))?;
    fs::write(path, json).map_err(|e| crate::err!("backend.characters.personaWrite", error = e))?;
    Ok(())
}
