use base64::prelude::*;
use std::path::Path;

use super::models::{CharacterCardV2, CharacterData};

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
    let card = parse_character_png_card(bytes)?;
    let avatar_data_url = format!("data:image/png;base64,{}", BASE64_STANDARD.encode(bytes));
    Ok((card, avatar_data_url))
}

/// Only the card from a PNG, without encoding the picture (see [`parse_character_png`]).
pub fn parse_character_png_card(bytes: &[u8]) -> Result<CharacterCardV2, String> {
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

    parse_character_json(&chara_json)
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

pub(super) fn get_placeholder_png() -> Vec<u8> {
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
pub(super) fn resolve_profile_expression_paths(card: &mut CharacterCardV2, source: &Path) {
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
