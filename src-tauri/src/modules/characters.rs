use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::modules::paths::resolve_app_paths;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CharacterData {
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    #[serde(alias = "first_message", default)]
    pub first_mes: String,
    #[serde(alias = "example_messages", default)]
    pub mes_example: String,
    #[serde(default)]
    pub alternate_greetings: Vec<String>,
    pub system_prompt: Option<String>,
    pub post_history_instructions: Option<String>,
    pub creator_notes: Option<String>,
    pub character_version: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub creator: Option<String>,
    #[serde(default)]
    pub extensions: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterCardV2 {
    #[serde(default = "default_spec")]
    pub spec: String,
    #[serde(default = "default_spec_version")]
    pub spec_version: String,
    pub data: CharacterData,
}

fn default_spec() -> String {
    "chara_card_v2".to_string()
}

fn default_spec_version() -> String {
    "2.0".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterProfile {
    pub id: String,
    pub card: CharacterCardV2,
    pub avatar_data_url: Option<String>,
    pub source_path: Option<String>,
    pub bound_lorebooks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserPersona {
    pub id: String,
    pub name: String,
    pub description: String,
    pub avatar_data_url: Option<String>,
}

impl Default for UserPersona {
    fn default() -> Self {
        Self {
            id: "default_user".to_string(),
            name: "User".to_string(),
            description: "Ein wissbegieriger Abenteurer und Gesprächspartner.".to_string(),
            avatar_data_url: None,
        }
    }
}

pub fn parse_character_json(content: &str) -> Result<CharacterCardV2, String> {
    if let Ok(card_v2) = serde_json::from_str::<CharacterCardV2>(content) {
        return Ok(card_v2);
    }

    if let Ok(flat_data) = serde_json::from_str::<CharacterData>(content) {
        return Ok(CharacterCardV2 {
            spec: "chara_card_v2".to_string(),
            spec_version: "2.0".to_string(),
            data: flat_data,
        });
    }

    if let Ok(val) = serde_json::from_str::<serde_json::Value>(content) {
        if let Some(inner_data) = val.get("data") {
            if let Ok(data) = serde_json::from_value::<CharacterData>(inner_data.clone()) {
                return Ok(CharacterCardV2 {
                    spec: "chara_card_v2".to_string(),
                    spec_version: "2.0".to_string(),
                    data,
                });
            }
        }
    }

    Err("Ungültiges Character Card JSON-Format".to_string())
}

/// Extracts SillyTavern / Tavern V2 text chunk from a PNG binary
pub fn parse_character_png(bytes: &[u8]) -> Result<(CharacterCardV2, String), String> {
    if bytes.len() < 8 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("Die Datei ist kein gültiges PNG-Bild".to_string());
    }

    let mut cursor = 8;
    let mut chara_json_opt: Option<String> = None;

    while cursor + 8 <= bytes.len() {
        let length = u32::from_be_bytes(bytes[cursor..cursor + 4].try_into().unwrap()) as usize;
        let chunk_type = &bytes[cursor + 4..cursor + 8];
        cursor += 8;

        if cursor + length > bytes.len() {
            break;
        }

        let chunk_data = &bytes[cursor..cursor + length];
        cursor += length + 4; // Skip data + 4 bytes CRC

        if chunk_type == b"tEXt" {
            if let Some(null_pos) = chunk_data.iter().position(|&b| b == 0) {
                let keyword = String::from_utf8_lossy(&chunk_data[..null_pos]);
                if keyword == "chara" || keyword == "ccv3" {
                    let base64_text = String::from_utf8_lossy(&chunk_data[null_pos + 1..]);
                    let trimmed = base64_text.trim();
                    if let Ok(decoded_bytes) = BASE64_STANDARD.decode(trimmed) {
                        if let Ok(json_str) = String::from_utf8(decoded_bytes) {
                            chara_json_opt = Some(json_str);
                            break;
                        }
                    }
                }
            }
        }
    }

    let chara_json = chara_json_opt.ok_or_else(|| {
        "Kein 'chara' Metadaten-Chunk im PNG gefunden. Es handelt sich um ein normales Bild.".to_string()
    })?;

    let card = parse_character_json(&chara_json)?;
    let avatar_data_url = format!("data:image/png;base64,{}", BASE64_STANDARD.encode(bytes));

    Ok((card, avatar_data_url))
}

/// Injects CharacterCardV2 metadata into a PNG as a SillyTavern-compatible 'chara' tEXt chunk
pub fn inject_character_metadata_png(base_png: &[u8], card: &CharacterCardV2) -> Result<Vec<u8>, String> {
    if base_png.len() < 8 || &base_png[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("Ungültiger PNG-Header".to_string());
    }

    let card_json = serde_json::to_string(card)
        .map_err(|e| format!("Fehler beim Serialisieren der Karte: {}", e))?;
    let base64_payload = BASE64_STANDARD.encode(card_json.as_bytes());

    let mut text_chunk_data = Vec::new();
    text_chunk_data.extend_from_slice(b"chara\0");
    text_chunk_data.extend_from_slice(base64_payload.as_bytes());

    let mut type_and_data = Vec::with_capacity(4 + text_chunk_data.len());
    type_and_data.extend_from_slice(b"tEXt");
    type_and_data.extend_from_slice(&text_chunk_data);
    let crc = crc32fast::hash(&type_and_data);

    let mut new_png = Vec::new();
    new_png.extend_from_slice(b"\x89PNG\r\n\x1a\n");

    let mut cursor = 8;
    let mut inserted = false;

    while cursor + 8 <= base_png.len() {
        let length = u32::from_be_bytes(base_png[cursor..cursor + 4].try_into().unwrap()) as usize;
        let chunk_type = &base_png[cursor + 4..cursor + 8];
        cursor += 8;

        if cursor + length + 4 > base_png.len() {
            break;
        }

        let chunk_data = &base_png[cursor..cursor + length];
        let chunk_crc = &base_png[cursor + length..cursor + length + 4];
        cursor += length + 4;

        // Skip existing chara or ccv3 tEXt chunks
        if chunk_type == b"tEXt" {
            if let Some(null_pos) = chunk_data.iter().position(|&b| b == 0) {
                let kw = &chunk_data[..null_pos];
                if kw == b"chara" || kw == b"ccv3" {
                    continue;
                }
            }
        }

        // Copy existing chunk
        new_png.extend_from_slice(&(length as u32).to_be_bytes());
        new_png.extend_from_slice(chunk_type);
        new_png.extend_from_slice(chunk_data);
        new_png.extend_from_slice(chunk_crc);

        // Inject new chara tEXt chunk immediately after IHDR
        if chunk_type == b"IHDR" && !inserted {
            new_png.extend_from_slice(&(text_chunk_data.len() as u32).to_be_bytes());
            new_png.extend_from_slice(&type_and_data);
            new_png.extend_from_slice(&crc.to_be_bytes());
            inserted = true;
        }
    }

    if !inserted {
        return Err("IHDR-Chunk im PNG nicht gefunden".to_string());
    }

    Ok(new_png)
}

fn get_placeholder_png() -> Vec<u8> {
    // Minimal 1x1 RGBA PNG
    let mut out = Vec::new();
    out.extend_from_slice(b"\x89PNG\r\n\x1a\n");
    let ihdr_data = [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0];
    let ihdr_len = (ihdr_data.len() as u32).to_be_bytes();
    let mut ihdr_full = Vec::from(b"IHDR" as &[u8]);
    ihdr_full.extend_from_slice(&ihdr_data);
    let ihdr_crc = crc32fast::hash(&ihdr_full).to_be_bytes();
    out.extend_from_slice(&ihdr_len);
    out.extend_from_slice(&ihdr_full);
    out.extend_from_slice(&ihdr_crc);

    let idat_data = [0x78, 0x9c, 0x63, 0x54, 0x33, 0xda, 0xff, 0x00, 0x04, 0x8a, 0x02, 0xec];
    let idat_len = (idat_data.len() as u32).to_be_bytes();
    let mut idat_full = Vec::from(b"IDAT" as &[u8]);
    idat_full.extend_from_slice(&idat_data);
    let idat_crc = crc32fast::hash(&idat_full).to_be_bytes();
    out.extend_from_slice(&idat_len);
    out.extend_from_slice(&idat_full);
    out.extend_from_slice(&idat_crc);

    out.extend_from_slice(&[0, 0, 0, 0, b'I', b'E', b'N', b'D', 0xae, 0x42, 0x60, 0x82]);
    out
}

pub fn load_character_from_file(path: &Path) -> Result<CharacterProfile, String> {
    if !path.exists() {
        return Err(format!("Datei nicht gefunden: {:?}", path));
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

    if extension == "json" {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Fehler beim Lesen der JSON-Datei: {}", e))?;
        let card = parse_character_json(&content)?;

        let mut avatar_data_url = None;
        let parent = path.parent().unwrap_or(Path::new("."));
        let png_candidate = parent.join(format!("{}.png", id));
        if png_candidate.exists() {
            if let Ok(png_bytes) = fs::read(&png_candidate) {
                avatar_data_url = Some(format!(
                    "data:image/png;base64,{}",
                    BASE64_STANDARD.encode(&png_bytes)
                ));
            }
        }

        Ok(CharacterProfile {
            id,
            card,
            avatar_data_url,
            source_path: Some(path.to_string_lossy().to_string()),
            bound_lorebooks: Vec::new(),
        })
    } else if extension == "png" {
        let bytes = fs::read(path).map_err(|e| format!("Fehler beim Lesen der PNG-Datei: {}", e))?;
        let (card, avatar_data_url) = parse_character_png(&bytes)?;

        Ok(CharacterProfile {
            id,
            card,
            avatar_data_url: Some(avatar_data_url),
            source_path: Some(path.to_string_lossy().to_string()),
            bound_lorebooks: Vec::new(),
        })
    } else {
        Err(format!("Nicht unterstütztes Dateiformat: .{}", extension))
    }
}

/// Saves or updates a character profile in the user's data directory (~/.local/share/otakusoul/characters)
pub fn save_character_to_user_dir(profile: &CharacterProfile) -> Result<CharacterProfile, String> {
    let paths = resolve_app_paths();
    let char_dir = PathBuf::from(paths.characters_dir);
    let _ = fs::create_dir_all(&char_dir);

    let safe_name = profile.card.data.name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    let safe_stem = if safe_name.trim().is_empty() {
        profile.id.clone()
    } else {
        safe_name
    };

    let target_png = char_dir.join(format!("{}.png", safe_stem));
    let target_json = char_dir.join(format!("{}.json", safe_stem));

    let mut saved_profile = profile.clone();
    saved_profile.id = safe_stem;

    // If avatar data is present, write as SillyTavern V2 PNG
    if let Some(ref data_url) = profile.avatar_data_url {
        let base_bytes = if let Some(stripped) = data_url.strip_prefix("data:image/png;base64,") {
            BASE64_STANDARD.decode(stripped).unwrap_or_else(|_| get_placeholder_png())
        } else if let Some(stripped) = data_url.strip_prefix("data:image/jpeg;base64,") {
            let _ = stripped;
            get_placeholder_png()
        } else {
            get_placeholder_png()
        };

        let enriched_png = inject_character_metadata_png(&base_bytes, &profile.card)?;
        fs::write(&target_png, enriched_png)
            .map_err(|e| format!("Fehler beim Schreiben von {:?}: {}", target_png, e))?;

        saved_profile.source_path = Some(target_png.to_string_lossy().to_string());
    } else {
        // Save as JSON
        let json_text = serde_json::to_string_pretty(&profile.card)
            .map_err(|e| format!("Fehler bei der Serialisierung: {}", e))?;
        fs::write(&target_json, json_text)
            .map_err(|e| format!("Fehler beim Schreiben von {:?}: {}", target_json, e))?;

        saved_profile.source_path = Some(target_json.to_string_lossy().to_string());
    }

    Ok(saved_profile)
}

/// Exports a character card to an arbitrary destination chosen by the user
pub fn export_character_card(profile: &CharacterProfile, target_path: &Path, export_as_png: bool) -> Result<(), String> {
    if export_as_png {
        let base_bytes = if let Some(ref data_url) = profile.avatar_data_url {
            if let Some(stripped) = data_url.strip_prefix("data:image/png;base64,") {
                BASE64_STANDARD.decode(stripped).unwrap_or_else(|_| get_placeholder_png())
            } else {
                get_placeholder_png()
            }
        } else {
            get_placeholder_png()
        };

        let enriched_png = inject_character_metadata_png(&base_bytes, &profile.card)?;
        fs::write(target_path, enriched_png)
            .map_err(|e| format!("Fehler beim Exportieren des PNGs: {}", e))?;
    } else {
        let json_text = serde_json::to_string_pretty(&profile.card)
            .map_err(|e| format!("Fehler beim Serialisieren des JSONs: {}", e))?;
        fs::write(target_path, json_text)
            .map_err(|e| format!("Fehler beim Exportieren des JSONs: {}", e))?;
    }

    Ok(())
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
    if char_dir.exists() && char_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&char_dir) {
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
    if !settings
        .hidden_character_ids
        .iter()
        .any(|id| id == char_id || crate::modules::paths::normalize_identifier(id) == norm_target)
    {
        settings.hidden_character_ids.push(char_id.to_string());
    }

    // If active character was this one, reset it
    if let Some(ref active_id) = settings.active_character_id {
        if active_id == char_id || crate::modules::paths::normalize_identifier(active_id) == norm_target {
            settings.active_character_id = None;
        }
    }

    crate::modules::settings::save_app_settings(&settings)?;

    Ok(())
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
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(personas) = serde_json::from_str::<Vec<UserPersona>>(&content) {
                if !personas.is_empty() {
                    return personas;
                }
            }
        }
    }

    let default_list = vec![UserPersona::default()];
    let _ = save_personas_list(&default_list);
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
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(list)
        .map_err(|e| format!("Fehler bei der Serialisierung der Personas: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Fehler beim Schreiben der Personas: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_png_metadata_injection_and_roundtrip() {
        let dummy_png = get_placeholder_png();
        let card = CharacterCardV2 {
            spec: "chara_card_v2".to_string(),
            spec_version: "2.0".to_string(),
            data: CharacterData {
                name: "Test Character".to_string(),
                description: "A test description".to_string(),
                personality: "Cheerful".to_string(),
                ..Default::default()
            },
        };

        let enriched = inject_character_metadata_png(&dummy_png, &card)
            .expect("Injection into PNG failed");
        let (extracted_card, _) = parse_character_png(&enriched)
            .expect("Extraction from enriched PNG failed");

        assert_eq!(extracted_card.data.name, "Test Character");
        assert_eq!(extracted_card.data.personality, "Cheerful");
    }

    #[test]
    fn test_load_character_relative_paths() {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
        let root = Path::new(&manifest_dir).parent().unwrap_or(Path::new("."));

        let json_path = root.join("presets/sakura-succubus-3/ayu_ikue.json");
        if json_path.exists() {
            let profile = load_character_from_file(&json_path).expect("Failed to load ayu_ikue.json");
            assert_eq!(profile.card.data.name, "Ayu Ikue");
        }

        let png_path = root.join("presets/cards/Akane Kurokawa.png");
        if png_path.exists() {
            let profile = load_character_from_file(&png_path).expect("Failed to load Akane Kurokawa.png");
            assert_eq!(profile.card.data.name, "Akane Kurokawa");
            assert!(profile.avatar_data_url.is_some());
        }
    }

    #[test]
    fn test_personas_lifecycle() {
        let test_persona = UserPersona {
            id: "test_persona_unit".to_string(),
            name: "Tester".to_string(),
            description: "A unit test persona".to_string(),
            avatar_data_url: None,
        };

        let saved = save_persona(test_persona.clone()).expect("Failed to save persona");
        assert!(saved.iter().any(|p| p.id == "test_persona_unit"));

        let deleted = delete_persona("test_persona_unit").expect("Failed to delete persona");
        assert!(!deleted.iter().any(|p| p.id == "test_persona_unit"));
    }

    #[test]
    fn test_delete_and_restore_character() {
        let initial_chars = crate::modules::paths::scan_available_characters();
        assert!(initial_chars.iter().any(|c| c.id == "ayu_ikue" || c.card.data.name == "Ayu Ikue"));

        // Delete (hide) character
        let del_res = delete_character("ayu_ikue");
        assert!(del_res.is_ok());

        let after_del = crate::modules::paths::scan_available_characters();
        assert!(!after_del.iter().any(|c| c.id == "ayu_ikue" || c.card.data.name == "Ayu Ikue"));

        // Restore character
        let res_res = restore_hidden_characters();
        assert!(res_res.is_ok());

        let after_restore = crate::modules::paths::scan_available_characters();
        assert!(after_restore.iter().any(|c| c.id == "ayu_ikue" || c.card.data.name == "Ayu Ikue"));
    }
}
