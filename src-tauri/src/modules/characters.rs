use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

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

pub fn parse_character_json(content: &str) -> Result<CharacterCardV2, String> {
    // Some character cards have the top level { "spec": "chara_card_v2", "data": { ... } }
    // while older V1 formats are just a flat dictionary.
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

    // Try unwrapping if it's wrapped in { "data": { ... } } without spec
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
    // 1. Verify PNG magic header [137, 80, 78, 71, 13, 10, 26, 10]
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

        // Search for tEXt chunk
        if chunk_type == b"tEXt" {
            // tEXt format: keyword\0text
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

        // Check if an avatar with matching filename exists in same directory
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_character_json() {
        let path = Path::new("/home/deathtrap/development/Soul-of-Waifu-linux/presets/sakura-succubus-3/ayu_ikue.json");
        if path.exists() {
            let profile = load_character_from_file(path).expect("Failed to load ayu_ikue.json");
            assert_eq!(profile.card.data.name, "Ayu Ikue");
            assert!(!profile.card.data.personality.is_empty());
            println!("Loaded character JSON: {}", profile.card.data.name);
        }
    }

    #[test]
    fn test_load_character_png() {
        let path = Path::new("/home/deathtrap/development/Soul-of-Waifu-linux/app/utils/ai_clients/backend/_temp/gateway_cache/Akane Kurokawa.png");
        if path.exists() {
            let profile = load_character_from_file(path).expect("Failed to load Akane Kurokawa.png");
            assert_eq!(profile.card.data.name, "Akane Kurokawa");
            assert!(profile.avatar_data_url.is_some());
            println!("Loaded character PNG: {}", profile.card.data.name);
        }
    }
}

