use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct CharacterData {
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    #[serde(alias = "first_message", default)]
    pub first_mes: String,
    #[serde(alias = "example_messages", alias = "example_dialogs", default)]
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
    pub character_book: Option<serde_json::Value>,
    #[serde(default)]
    pub extensions: serde_json::Value,
}

/// Key in `extensions` that holds translations of a card:
/// `{"source_language": "de", "translations": {"en": {"description": "...", ...}}}`.
/// Keeping them in `extensions` leaves the card a valid V2 card for other apps; cards without
/// it (e.g. imported from the web) simply use their base fields in every language.
pub const I18N_EXTENSION: &str = "otakusoul_i18n";

/// Text fields a translation may override; empty or missing ones fall back to the base card.
const TRANSLATABLE_TEXT: [&str; 9] = [
    "name",
    "description",
    "personality",
    "scenario",
    "first_mes",
    "mes_example",
    "system_prompt",
    "post_history_instructions",
    "creator_notes",
];

impl CharacterData {
    /// The card with its fields in `lang` (ISO 639-1) where a translation exists.
    pub fn localized(&self, lang: &str) -> CharacterData {
        let Some(translation) = self
            .extensions
            .get(I18N_EXTENSION)
            .and_then(|i18n| i18n.get("translations"))
            .and_then(|translations| translations.get(lang))
            .and_then(serde_json::Value::as_object)
        else {
            return self.clone();
        };
        let mut data = serde_json::to_value(self).unwrap_or_default();
        let Some(fields) = data.as_object_mut() else {
            return self.clone();
        };
        for key in TRANSLATABLE_TEXT {
            if let Some(text) = translation.get(key).and_then(serde_json::Value::as_str)
                && !text.trim().is_empty()
            {
                fields.insert(key.to_string(), text.into());
            }
        }
        for key in ["alternate_greetings", "tags"] {
            if let Some(list) = translation.get(key).and_then(serde_json::Value::as_array)
                && !list.is_empty()
            {
                fields.insert(key.to_string(), list.clone().into());
            }
        }
        if let Some(title) = translation
            .get("custom_title")
            .or_else(|| translation.get("sow_title"))
            .and_then(serde_json::Value::as_str)
            && let Some(extensions) = fields.get_mut("extensions").and_then(|e| e.as_object_mut())
        {
            extensions.insert("custom_title".to_string(), title.into());
            if extensions.contains_key("sow_title") {
                extensions.insert("sow_title".to_string(), title.into());
            }
        }
        serde_json::from_value(data).unwrap_or_else(|_| self.clone())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterProfile {
    pub id: String,
    pub card: CharacterCardV2,
    pub avatar_data_url: Option<String>,
    pub source_path: Option<String>,
    pub bound_lorebooks: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
            description: crate::modules::content_lang::ContentLang::current()
                .t("A curious adventurer and conversation partner.")
                .to_string(),
            avatar_data_url: None,
        }
    }
}

pub fn parse_character_json(content: &str) -> Result<CharacterCardV2, String> {
    if let Ok(mut card_v2) = serde_json::from_str::<CharacterCardV2>(content) {
        if card_v2.data.personality.trim().is_empty()
            && let Ok(val) = serde_json::from_str::<serde_json::Value>(content)
            && let Some(tp) = val
                .get("data")
                .and_then(|d| d.get("tavern_personality"))
                .and_then(|v| v.as_str())
            && !tp.trim().is_empty()
        {
            card_v2.data.personality = tp.to_string();
        }
        return Ok(card_v2);
    }

    if let Ok(mut flat_data) = serde_json::from_str::<CharacterData>(content) {
        if flat_data.personality.trim().is_empty()
            && let Ok(val) = serde_json::from_str::<serde_json::Value>(content)
            && let Some(tp) = val.get("tavern_personality").and_then(|v| v.as_str())
            && !tp.trim().is_empty()
        {
            flat_data.personality = tp.to_string();
        }
        return Ok(CharacterCardV2 {
            spec: "chara_card_v2".to_string(),
            spec_version: "2.0".to_string(),
            data: flat_data,
        });
    }

    if let Ok(val) = serde_json::from_str::<serde_json::Value>(content) {
        if let Some(inner_data) = val.get("data")
            && let Ok(mut data) = serde_json::from_value::<CharacterData>(inner_data.clone())
        {
            if data.personality.trim().is_empty()
                && let Some(tp) = inner_data
                    .get("tavern_personality")
                    .and_then(|v| v.as_str())
            {
                data.personality = tp.to_string();
            }
            return Ok(CharacterCardV2 {
                spec: "chara_card_v2".to_string(),
                spec_version: "2.0".to_string(),
                data,
            });
        }

        // Support Chub AI node object { "node": { "definition": { ... } } }
        if let Some(node) = val.get("node") {
            let def = node.get("definition").unwrap_or(&serde_json::Value::Null);
            let name = node
                .get("name")
                .or_else(|| def.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown")
                .to_string();
            let desc = def
                .get("description")
                .or_else(|| node.get("description"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let personality = {
                let p1 = def
                    .get("tavern_personality")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if !p1.trim().is_empty() {
                    p1.to_string()
                } else {
                    def.get("personality")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                }
            };
            let scenario = def
                .get("scenario")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let first_mes = def
                .get("first_message")
                .or_else(|| def.get("first_mes"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mes_example = def
                .get("example_dialogs")
                .or_else(|| def.get("mes_example"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let creator_notes = node
                .get("tagline")
                .or_else(|| def.get("creator_notes"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let system_prompt = def
                .get("system_prompt")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let post_history = def
                .get("post_history_instructions")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let alt_greetings = def
                .get("alternate_greetings")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let tags = node
                .get("topics")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let character_book = def.get("embedded_lorebook").cloned();
            let extensions = def
                .get("extensions")
                .cloned()
                .unwrap_or(serde_json::json!({}));

            return Ok(CharacterCardV2 {
                spec: "chara_card_v2".to_string(),
                spec_version: "2.0".to_string(),
                data: CharacterData {
                    name,
                    description: desc,
                    personality,
                    scenario,
                    first_mes,
                    mes_example,
                    alternate_greetings: alt_greetings,
                    system_prompt,
                    post_history_instructions: post_history,
                    creator_notes: Some(creator_notes),
                    character_version: None,
                    tags,
                    creator: node
                        .get("fullPath")
                        .and_then(|v| v.as_str())
                        .map(|s| s.split('/').next().unwrap_or("").to_string()),
                    character_book,
                    extensions,
                },
            });
        }
    }

    Err(crate::err!("backend.characters.invalidJson"))
}

/// Extracts SillyTavern / Tavern V2 text chunk from a PNG binary
pub fn parse_character_png(bytes: &[u8]) -> Result<(CharacterCardV2, String), String> {
    if bytes.len() < 8 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(crate::err!("backend.characters.notPng"));
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

        if chunk_type == b"tEXt"
            && let Some(null_pos) = chunk_data.iter().position(|&b| b == 0)
        {
            let keyword = String::from_utf8_lossy(&chunk_data[..null_pos]);
            if keyword == "chara" || keyword == "ccv3" {
                let base64_text = String::from_utf8_lossy(&chunk_data[null_pos + 1..]);
                let trimmed = base64_text.trim();
                if let Ok(decoded_bytes) = BASE64_STANDARD.decode(trimmed)
                    && let Ok(json_str) = String::from_utf8(decoded_bytes)
                {
                    chara_json_opt = Some(json_str);
                    break;
                }
            }
        }
    }

    let chara_json =
        chara_json_opt.ok_or_else(|| crate::err!("backend.characters.noCharaChunk"))?;

    let card = parse_character_json(&chara_json)?;
    let avatar_data_url = format!("data:image/png;base64,{}", BASE64_STANDARD.encode(bytes));

    Ok((card, avatar_data_url))
}

/// Injects CharacterCardV2 metadata into a PNG as a SillyTavern-compatible 'chara' tEXt chunk
pub fn inject_character_metadata_png(
    base_png: &[u8],
    card: &CharacterCardV2,
) -> Result<Vec<u8>, String> {
    if base_png.len() < 8 || &base_png[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(crate::err!("backend.characters.pngHeader"));
    }

    let card_json = serde_json::to_string(card)
        .map_err(|e| crate::err!("backend.characters.serialize", error = e))?;
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
        if chunk_type == b"tEXt"
            && let Some(null_pos) = chunk_data.iter().position(|&b| b == 0)
        {
            let kw = &chunk_data[..null_pos];
            if kw == b"chara" || kw == b"ccv3" {
                continue;
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
        return Err(crate::err!("backend.characters.pngNoIhdr"));
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

    let idat_data = [
        0x78, 0x9c, 0x63, 0x54, 0x33, 0xda, 0xff, 0x00, 0x04, 0x8a, 0x02, 0xec,
    ];
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

/// Keep expression paths tied to their original card folder when a card is saved or imported.
fn resolve_profile_expression_paths(card: &mut CharacterCardV2, source: &Path) {
    for key in ["expressions", "custom_expressions", "sow_expressions"] {
        if let Some(expressions) = card
            .data
            .extensions
            .get(key)
            .and_then(serde_json::Value::as_object)
        {
            let resolved = crate::modules::paths::resolve_expression_set(source, expressions);
            card.data.extensions[key] = serde_json::Value::Object(resolved);
        }
    }
}

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
    let mut card = if extension == "json" {
        let content = fs::read_to_string(path)
            .map_err(|e| crate::err!("backend.common.jsonRead", error = e))?;
        parse_character_json(&content)?
    } else if extension == "png" {
        let bytes =
            fs::read(path).map_err(|e| crate::err!("backend.characters.pngRead", error = e))?;
        let (card, _) = parse_character_png(&bytes)?;
        card
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

    if extension == "json" {
        let mut avatar_data_url = None;
        let parent = path.parent().unwrap_or(Path::new("."));
        let png_candidate = parent.join(format!("{}.png", id));
        if png_candidate.exists()
            && let Ok(png_bytes) = fs::read(&png_candidate)
        {
            avatar_data_url = Some(format!(
                "data:image/png;base64,{}",
                BASE64_STANDARD.encode(&png_bytes)
            ));
        }

        Ok(CharacterProfile {
            id,
            card,
            avatar_data_url,
            source_path: Some(path.to_string_lossy().to_string()),
            bound_lorebooks,
        })
    } else {
        let bytes =
            fs::read(path).map_err(|e| crate::err!("backend.characters.pngRead", error = e))?;
        let (_, avatar_data_url) = parse_character_png(&bytes)?;

        Ok(CharacterProfile {
            id,
            card,
            avatar_data_url: Some(avatar_data_url),
            source_path: Some(path.to_string_lossy().to_string()),
            bound_lorebooks,
        })
    }
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
        if let Some(first_lb) = saved_profile.bound_lorebooks.first() {
            ext.insert(
                "selected_lorebook".to_string(),
                serde_json::Value::String(first_lb.clone()),
            );
        }
    }

    // If avatar data is present, write as SillyTavern V2 PNG
    if let Some(ref data_url) = profile.avatar_data_url {
        let base_bytes = if let Some(stripped) = data_url.strip_prefix("data:image/png;base64,") {
            BASE64_STANDARD
                .decode(stripped)
                .unwrap_or_else(|_| get_placeholder_png())
        } else if let Some(stripped) = data_url.strip_prefix("data:image/jpeg;base64,") {
            let _ = stripped;
            get_placeholder_png()
        } else {
            get_placeholder_png()
        };

        let enriched_png = inject_character_metadata_png(&base_bytes, &saved_profile.card)?;
        fs::write(&target_png, enriched_png).map_err(|e| {
            crate::err!(
                "backend.common.fileWritePath",
                path = format!("{:?}", target_png),
                error = e
            )
        })?;

        saved_profile.source_path = Some(target_png.to_string_lossy().to_string());
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
fn trash_other_copies(dir: &Path, trash: &Path, name: &str, keep: &Path) {
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
    store_imported_card(loaded.card, loaded.avatar_data_url, overwrite)
}

/// Exports a character card to an arbitrary destination chosen by the user
/// A card leaving the app carries no local file paths: emotion pictures stored as paths on this
/// computer (absolute after loading) would only reveal the user's folders and not work elsewhere.
/// Web and `data:` pictures stay.
fn without_local_picture_paths(card: &CharacterCardV2) -> CharacterCardV2 {
    let mut card = card.clone();
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
        let base_bytes = if let Some(ref data_url) = profile.avatar_data_url {
            if let Some(stripped) = data_url.strip_prefix("data:image/png;base64,") {
                BASE64_STANDARD
                    .decode(stripped)
                    .unwrap_or_else(|_| get_placeholder_png())
            } else {
                get_placeholder_png()
            }
        } else {
            get_placeholder_png()
        };

        let enriched_png = inject_character_metadata_png(&base_bytes, &card)?;
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

fn hide_character_in_settings(settings: &mut crate::modules::settings::AppSettings, char_id: &str) {
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

fn load_personas_from_path(path: &Path) -> Vec<UserPersona> {
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

fn save_personas_list_to_path(list: &[UserPersona], path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| crate::err!("backend.characters.personaDir", error = e))?;
    }
    let json = serde_json::to_string_pretty(list)
        .map_err(|e| crate::err!("backend.characters.personaSerialize", error = e))?;
    fs::write(path, json).map_err(|e| crate::err!("backend.characters.personaWrite", error = e))?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterWizardInput {
    pub name: String,
    pub concept: String,
    pub archetype: String,
    pub visual_style: String,
    pub personality_traits: String,
    pub world_background: String,
    pub relationship_to_user: String,
    pub greeting_scenario: String,
    pub target_language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct CharacterDraft {
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    pub first_mes: String,
    pub mes_example: String,
    pub system_prompt: String,
    pub tags: Vec<String>,
}

pub fn build_character_wizard_prompt(input: &CharacterWizardInput) -> String {
    let lang = input.target_language.as_deref().unwrap_or("Deutsch");
    format!(
        r#"You are a masterful AI author of roleplay characters and SillyTavern V2 character cards.
Based on the user's key facts below, create a deep, vivid and consistent character card. Write every value in {lang}.

KEY FACTS:
- Name: {name}
- Concept: {concept}
- Archetype: {archetype}
- Visual appearance: {visual}
- Personality & traits: {personality}
- World & background: {world}
- Relationship to {{{{user}}}}: {relationship}
- Opening scenario: {scenario}

FORMAT REQUIREMENTS:
Reply ONLY with a single valid JSON object in this format (no explanations, no code fences):
{{
  "name": "{name}",
  "description": "<Detailed visual description: clothing, hair, eyes, build, age, social role>",
  "personality": "<Thorough personality: traits, quirks, fears, desires, tone, speech patterns>",
  "scenario": "<Current setting in which {{{{char}}}} meets {{{{user}}}}>",
  "first_mes": "<Atmospheric first message from {{{{char}}}}, including *actions* and \"spoken dialogue\">",
  "mes_example": "<START>\\n{{{{user}}}}: <greeting>\\n{{{{char}}}}: <reply with *action* and dialogue>",
  "system_prompt": "<One or two sentences in {lang} telling the model to write as {name}, stay in character and use *...* for actions and sensations>",
  "tags": ["Anime", "{archetype}", "<genre tag>"]
}}
"#,
        lang = lang,
        name = input.name,
        concept = input.concept,
        archetype = input.archetype,
        visual = input.visual_style,
        personality = input.personality_traits,
        world = input.world_background,
        relationship = input.relationship_to_user,
        scenario = input.greeting_scenario,
    )
}

pub fn parse_character_wizard_draft(raw_text: &str) -> Result<CharacterDraft, String> {
    let cleaned = raw_text.trim();
    let json_candidate = if let Some(start) = cleaned.find('{') {
        if let Some(end) = cleaned.rfind('}') {
            &cleaned[start..=end]
        } else {
            cleaned
        }
    } else {
        cleaned
    };

    serde_json::from_str::<CharacterDraft>(json_candidate)
        .map_err(|e| crate::err!("backend.characters.draftParse", error = e))
}

#[cfg(test)]
mod tests {

    #[test]
    fn exported_cards_carry_no_local_picture_paths() {
        let card: CharacterCardV2 = serde_json::from_value(serde_json::json!({
            "spec": "chara_card_v2", "spec_version": "2.0",
            "data": {"name": "Export", "description": "", "personality": "", "scenario": "", "first_mes": "",
                "extensions": {"expressions": {
                    "happy": "/home/someone/presets/expressions/happy.webp",
                    "sad": "https://example.org/sad.webp",
                    "angry": "data:image/webp;base64,abc"
                }}
            }
        })).unwrap();
        let target =
            std::env::temp_dir().join(format!("otakusoul-export-{}.json", std::process::id()));
        let profile = CharacterProfile {
            id: "export".into(),
            card,
            avatar_data_url: None,
            source_path: None,
            bound_lorebooks: Vec::new(),
        };
        export_character_card(&profile, &target, false).unwrap();
        let written = std::fs::read_to_string(&target).unwrap();
        let _ = std::fs::remove_file(&target);
        assert!(!written.contains("/home/someone"));
        assert!(
            written.contains("https://example.org/sad.webp") && written.contains("data:image/webp")
        );
        // The card in the app keeps its pictures.
        assert!(profile.card.data.extensions["expressions"]["happy"].is_string());
    }

    #[test]
    fn portrait_paths_survive_moving_a_card_to_the_user_folder() {
        let mut card: CharacterCardV2 = serde_json::from_value(serde_json::json!({
            "spec": "chara_card_v2", "spec_version": "2.0",
            "data": {"name": "Portrait", "description": "", "personality": "", "scenario": "", "first_mes": "",
                "extensions": {
                    "expressions": {"happy": "expressions/happy.webp", "sad": "https://example.org/sad.webp"},
                    "custom_expressions": {"angry": "custom/angry.png"},
                    "sow_expressions": {"neutral": "data:image/png;base64,abc"}
                }
            }
        })).unwrap();
        let root = std::env::temp_dir().join("otakusoul-portrait-paths");
        resolve_profile_expression_paths(&mut card, &root.join("presets/card.json"));
        let expected = root
            .join("presets/expressions/happy.webp")
            .to_string_lossy()
            .to_string();
        assert_eq!(card.data.extensions["expressions"]["happy"], expected);
        // Resolving again after a save must retain the original directory.
        resolve_profile_expression_paths(&mut card, &root.join("user/card.png"));
        let (restored, _) = parse_character_png(
            &inject_character_metadata_png(&get_placeholder_png(), &card).unwrap(),
        )
        .unwrap();
        assert_eq!(restored.data.extensions["expressions"]["happy"], expected);
        assert_eq!(
            restored.data.extensions["expressions"]["sad"],
            "https://example.org/sad.webp"
        );
        assert_eq!(
            restored.data.extensions["custom_expressions"]["angry"],
            root.join("presets/custom/angry.png")
                .to_string_lossy()
                .as_ref()
        );
        assert_eq!(
            restored.data.extensions["sow_expressions"]["neutral"],
            "data:image/png;base64,abc"
        );
    }

    #[test]
    fn replacing_a_character_trashes_its_other_copies() {
        let root = std::env::temp_dir().join(format!("otakusoul-copies-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let (dir, trash) = (root.join("characters"), root.join("trash"));
        fs::create_dir_all(&dir).unwrap();
        let card = |name: &str| {
            format!(
                r#"{{"spec":"chara_card_v2","spec_version":"2.0","data":{{"name":"{name}","description":"","personality":"","scenario":"","first_mes":"Hi","mes_example":""}}}}"#
            )
        };
        fs::write(dir.join("Ayu Ikue.png"), b"new").unwrap();
        fs::write(dir.join("Ayu Ikue.json"), card("Ayu Ikue")).unwrap();
        fs::write(dir.join("Ayu Ikue_1.json"), card("ayu ikue")).unwrap();
        fs::write(dir.join("Rin.json"), card("Rin")).unwrap();

        trash_other_copies(&dir, &trash, "Ayu Ikue", &dir.join("Ayu Ikue.png"));

        let mut left: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().into_string().unwrap())
            .collect();
        left.sort();
        assert_eq!(left, ["Ayu Ikue.png", "Rin.json"]);
        assert_eq!(
            fs::read_dir(&trash).unwrap().count(),
            2,
            "copies go to the trash, not away"
        );
        let _ = fs::remove_dir_all(&root);
    }

    use super::*;

    #[test]
    fn localizes_cards_and_falls_back_to_base_fields() {
        let card: CharacterData = serde_json::from_value(serde_json::json!({
            "name": "Ayu",
            "description": "Ein Idol.",
            "personality": "stolz",
            "scenario": "Tokio",
            "first_mes": "Hallo!",
            "tags": ["Idol"],
            "extensions": {
                "sow_title": "Top-Idol",
                "otakusoul_i18n": {
                    "source_language": "de",
                    "translations": {
                        "en": {"description": "An idol.", "first_mes": "", "tags": ["Idol", "English"], "sow_title": "Top idol"}
                    }
                }
            }
        }))
        .unwrap();

        let en = card.localized("en");
        assert_eq!(en.description, "An idol.");
        // Empty or missing translated fields keep the base text.
        assert_eq!(en.first_mes, "Hallo!");
        assert_eq!(en.personality, "stolz");
        assert_eq!(en.tags, vec!["Idol", "English"]);
        assert_eq!(en.extensions["sow_title"], "Top idol");
        assert_eq!(en.extensions["custom_title"], "Top idol");
        // Languages without a translation (and plain imported cards) are unchanged.
        assert_eq!(card.localized("ru").description, "Ein Idol.");
        let plain = CharacterData {
            description: "Plain".into(),
            ..Default::default()
        };
        assert_eq!(plain.localized("en").description, "Plain");
    }

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

        let enriched =
            inject_character_metadata_png(&dummy_png, &card).expect("Injection into PNG failed");
        let (extracted_card, _) =
            parse_character_png(&enriched).expect("Extraction from enriched PNG failed");

        assert_eq!(extracted_card.data.name, "Test Character");
        assert_eq!(extracted_card.data.personality, "Cheerful");
    }

    #[test]
    fn test_load_character_relative_paths() {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
        let root = Path::new(&manifest_dir).parent().unwrap_or(Path::new("."));

        let json_path = root.join("presets/characters/ayu_ikue.json");
        if json_path.exists() {
            let profile =
                load_character_from_file(&json_path).expect("Failed to load ayu_ikue.json");
            assert_eq!(profile.card.data.name, "Ayu Ikue");
        }

        let png_path = root.join("presets/characters/Emilia.png");
        if png_path.exists() {
            let profile = load_character_from_file(&png_path).expect("Failed to load Emilia.png");
            assert_eq!(profile.card.data.name, "Emilia");
            assert!(profile.avatar_data_url.is_some());
        }
    }

    #[test]
    fn test_personas_lifecycle() {
        let test_dir = std::env::temp_dir().join(format!(
            "otakusoul-persona-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let path = test_dir.join("personas.json");
        let test_persona = UserPersona {
            id: "test_persona_unit".to_string(),
            name: "Tester".to_string(),
            description: "A unit test persona".to_string(),
            avatar_data_url: None,
        };

        let mut saved = load_personas_from_path(&path);
        saved.push(test_persona.clone());
        save_personas_list_to_path(&saved, &path).expect("Failed to save persona");
        let saved = load_personas_from_path(&path);
        assert!(saved.iter().any(|p| p.id == "test_persona_unit"));

        let mut deleted = saved;
        deleted.retain(|p| p.id != "test_persona_unit");
        save_personas_list_to_path(&deleted, &path).expect("Failed to delete persona");
        let deleted = load_personas_from_path(&path);
        assert!(!deleted.iter().any(|p| p.id == "test_persona_unit"));
        let _ = fs::remove_dir_all(test_dir);
    }

    #[test]
    fn test_delete_and_restore_character() {
        let mut settings = crate::modules::settings::AppSettings {
            active_character_id: Some("ayu_ikue".to_string()),
            ..Default::default()
        };
        hide_character_in_settings(&mut settings, "ayu_ikue");
        assert_eq!(settings.hidden_character_ids, vec!["ayu_ikue"]);
        assert!(settings.active_character_id.is_none());

        // Repeated hiding is idempotent and restoration is a simple clear.
        hide_character_in_settings(&mut settings, "Ayu Ikue");
        assert_eq!(settings.hidden_character_ids.len(), 1);
        settings.hidden_character_ids.clear();
        assert!(settings.hidden_character_ids.is_empty());
    }
}
