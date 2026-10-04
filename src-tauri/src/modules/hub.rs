use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use tracing::info;
use ts_rs::TS;

use crate::modules::characters::{
    CharacterProfile, extract_and_save_embedded_lorebook, inject_character_metadata_png,
    parse_character_json, parse_character_png, save_character_to_user_dir,
};
use crate::modules::lorebook::Lorebook;
use crate::modules::paths::resolve_app_paths;
use crate::modules::stage::{SceneDefinition, SceneState, create_custom_scene, save_scene_state};

const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const SOUL_GATEWAY_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/SnowwhiteOakheart/sow-data/main/soul_registry.json";
const LOREBOOKS_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/SnowwhiteOakheart/sow-data/main/lorebooks_registry.json";
const STAGES_REGISTRY_URL: &str =
    "https://raw.githubusercontent.com/SnowwhiteOakheart/sow-data/main/stages_registry.json";

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GatewayCharacterEntry {
    pub name: String,
    pub author: String,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GatewayLorebookEntry {
    pub name: String,
    pub author: String,
    pub description: String,
    pub entry_count: u32,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GatewaySceneEntry {
    #[serde(default)]
    pub id: String,
    pub title: String,
    pub author: String,
    pub description: String,
    pub starting_location: String,
    pub download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChubSearchItem {
    pub id: u64,
    pub name: String,
    #[serde(alias = "fullPath")]
    pub full_path: String,
    pub description: Option<String>,
    pub tagline: Option<String>,
    pub avatar_url: Option<String>,
    #[serde(alias = "starCount", default)]
    pub star_count: u32,
    #[serde(alias = "n_favorites", default)]
    pub n_favorites: u32,
    #[serde(alias = "nTokens", default)]
    pub n_tokens: u32,
    #[serde(alias = "nChats", default)]
    pub n_chats: u32,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub nsfw_image: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChubSearchResult {
    pub items: Vec<ChubSearchItem>,
    pub total_count: Option<u64>,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChubCharacterDetail {
    pub name: String,
    pub tagline: String,
    pub avatar_url: String,
    pub star_count: u32,
    pub n_favorites: u32,
    pub n_tokens: u32,
    pub personality: String,
    pub first_message: String,
    pub scenario: String,
    pub example_dialogs: String,
    pub alternate_greetings: Vec<String>,
    pub has_embedded_lorebook: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterImportResult {
    pub profile: CharacterProfile,
    pub imported_lorebook: Option<String>,
}

fn get_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(BROWSER_USER_AGENT)
        .timeout(std::time::Duration::from_secs(35))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))
}

fn ensure_unique_character_name(base_name: &str, char_dir: &Path) -> String {
    let mut candidate = base_name.to_string();
    let mut suffix = 1;
    let safe_stem = |name: &str| {
        let s = name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
        if s.trim().is_empty() {
            "character".to_string()
        } else {
            s
        }
    };

    while char_dir
        .join(format!("{}.png", safe_stem(&candidate)))
        .exists()
        || char_dir
            .join(format!("{}.json", safe_stem(&candidate)))
            .exists()
    {
        candidate = format!("{}_{}", base_name, suffix);
        suffix += 1;
    }
    candidate
}

fn convert_image_bytes_to_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() >= 8 && &bytes[0..8] == b"\x89PNG\r\n\x1a\n" {
        return Ok(bytes.to_vec());
    }

    let dyn_img = image::load_from_memory(bytes)
        .map_err(|e| crate::err!("backend.common.imageDecode", error = e))?;
    let mut buf = Vec::new();
    dyn_img
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| crate::err!("backend.common.pngConvert", error = e))?;
    Ok(buf)
}

fn get_placeholder_png() -> Vec<u8> {
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

// =========================================================================
// 1. Soul Gateway (Kuratierte Waifus & Gefährten)
// =========================================================================

pub async fn fetch_soul_gateway_registry() -> Result<Vec<GatewayCharacterEntry>, String> {
    let client = get_http_client()?;
    let res = client
        .get(SOUL_GATEWAY_REGISTRY_URL)
        .send()
        .await
        .map_err(|e| crate::err!("backend.hub.gatewayFetch", error = e))?;

    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.hub.registryStatus",
            status = res.status()
        ));
    }

    let val = res
        .json::<serde_json::Value>()
        .await
        .map_err(|e| crate::err!("backend.hub.gatewayParse", error = e))?;

    let characters = val
        .get("characters")
        .and_then(|v| v.as_array())
        .ok_or_else(|| crate::err!("backend.hub.gatewayNoCharacters"))?;

    let mut results = Vec::new();
    for c in characters {
        if let (Some(name), Some(author), Some(download_url)) = (
            c.get("name").and_then(|v| v.as_str()),
            c.get("author").and_then(|v| v.as_str()),
            c.get("download_url").and_then(|v| v.as_str()),
        ) {
            results.push(GatewayCharacterEntry {
                name: name.to_string(),
                author: author.to_string(),
                download_url: download_url.to_string(),
            });
        }
    }

    Ok(results)
}

pub async fn import_soul_gateway_character(
    name: &str,
    author: &str,
    download_url: &str,
) -> Result<CharacterImportResult, String> {
    let client = get_http_client()?;
    let res = client
        .get(download_url)
        .header("Accept", "image/png,image/*,*/*")
        .send()
        .await
        .map_err(|e| {
            format!(
                "Fehler beim Herunterladen der Charakterkarte von {}: {}",
                download_url, e
            )
        })?;

    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.common.downloadStatus",
            status = res.status()
        ));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| crate::err!("backend.hub.cardRead", error = e))?;

    let (mut card, avatar_data_url) = parse_character_png(&bytes)?;

    if card.data.name.trim().is_empty() {
        card.data.name = name.to_string();
    }
    if card.data.creator.is_none() && !author.trim().is_empty() {
        card.data.creator = Some(author.to_string());
    }

    let paths = resolve_app_paths();
    let char_dir = PathBuf::from(&paths.characters_dir);
    let _ = fs::create_dir_all(&char_dir);

    // Check if embedded lorebook is present and extract it
    let imported_lorebook = extract_and_save_embedded_lorebook(&card, &card.data.name);
    let mut bound_lorebooks = Vec::new();
    if let Some(ref lb_name) = imported_lorebook {
        bound_lorebooks.push(lb_name.clone());
    }

    // Resolve unique name
    let unique_name = ensure_unique_character_name(&card.data.name, &char_dir);
    card.data.name = unique_name;

    let profile = CharacterProfile {
        id: card.data.name.clone(),
        card,
        avatar_data_url: Some(avatar_data_url),
        source_path: None,
        bound_lorebooks,
    };

    let saved = save_character_to_user_dir(&profile)?;

    Ok(CharacterImportResult {
        profile: saved,
        imported_lorebook,
    })
}

// =========================================================================
// 2. Chub AI (Characters Gateway)
// =========================================================================

pub async fn search_chub_characters(
    query: &str,
    page: u32,
    first: u32,
    sort: &str,
    topics: Option<Vec<String>>,
    nsfw: bool,
) -> Result<ChubSearchResult, String> {
    let client = get_http_client()?;
    let safe_page = page.max(1);
    let safe_first = first.clamp(1, 100);

    let sort_val = match sort {
        "popular" => "download_count",
        "favorites" => "star_count",
        "recent" => "new",
        _ => "trending",
    };

    let encoded_query = urlencoding::encode(query.trim());
    let mut url = format!(
        "https://gateway.chub.ai/search?first={}&page={}&namespace=characters&search={}&include_forks=true&nsfw={}&nsfw_only=false&nsfl=false&asc=false&min_ai_rating=0&min_tokens=100&max_tokens=100000&chub=true&exclude_mine=true&sort={}&inclusive_or=false&recommended_verified=false&venus=true&count=true",
        safe_first,
        safe_page,
        encoded_query,
        if nsfw { "true" } else { "false" },
        sort_val
    );

    if let Some(t_list) = topics
        && !t_list.is_empty()
    {
        let joined = t_list.join(",");
        url.push_str(&format!("&topics={}", urlencoding::encode(&joined)));
    }

    let res = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| crate::err!("backend.hub.chubSearch", error = e))?;

    if !res.status().is_success() {
        return Err(crate::err!("backend.hub.chubStatus", status = res.status()));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| crate::err!("backend.hub.chubParse", error = e))?;

    let payload = if val.get("data").is_some() {
        val.get("data").cloned().unwrap_or(val.clone())
    } else {
        val.clone()
    };

    let total_count = payload
        .get("total_count")
        .or_else(|| payload.get("totalCount"))
        .or_else(|| payload.get("count"))
        .and_then(|v| v.as_u64());

    let nodes = payload
        .get("nodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut items = Vec::new();
    for n in &nodes {
        let id = n.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
        let name = n
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown")
            .to_string();
        let full_path = match n.get("fullPath").and_then(|v| v.as_str()) {
            Some(p) => p.to_string(),
            None => continue,
        };
        let description = n
            .get("description")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let tagline = n
            .get("tagline")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let avatar_url = n
            .get("avatar_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let star_count = n.get("starCount").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let n_favorites = n.get("n_favorites").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let n_tokens = n.get("nTokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let n_chats = n.get("nChats").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
        let topics = n
            .get("topics")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|x| x.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        let nsfw_image = n
            .get("nsfw_image")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        items.push(ChubSearchItem {
            id,
            name,
            full_path,
            description,
            tagline,
            avatar_url,
            star_count,
            n_favorites,
            n_tokens,
            n_chats,
            topics,
            nsfw_image,
        });
    }

    let has_more = nodes.len() >= safe_first as usize
        && match total_count {
            Some(tot) => (safe_page as u64 * safe_first as u64) < tot,
            None => true,
        };

    Ok(ChubSearchResult {
        items,
        total_count,
        has_more,
    })
}

pub async fn get_chub_character_details(full_path: &str) -> Result<ChubCharacterDetail, String> {
    let client = get_http_client()?;
    let url = format!(
        "https://gateway.chub.ai/api/characters/{}?full=true",
        full_path.trim_start_matches('/')
    );

    let res = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .send()
        .await
        .map_err(|e| {
            format!(
                "Fehler beim Abrufen der Charakterdetails für {}: {}",
                full_path, e
            )
        })?;

    if !res.status().is_success() {
        return Err(crate::err!("backend.hub.chubStatus", status = res.status()));
    }

    let data: serde_json::Value = res
        .json()
        .await
        .map_err(|e| crate::err!("backend.hub.chubDetailsParse", error = e))?;

    let node = data
        .get("node")
        .ok_or_else(|| crate::err!("backend.hub.chubNoNode"))?;

    let def = node.get("definition").unwrap_or(&serde_json::Value::Null);

    let name = node
        .get("name")
        .or_else(|| def.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();

    let tagline = node
        .get("tagline")
        .or_else(|| def.get("creator_notes"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let avatar_url = node
        .get("avatar_url")
        .or_else(|| node.get("max_res_url"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let star_count = node.get("starCount").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    let n_favorites = node
        .get("n_favorites")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let n_tokens = node.get("nTokens").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

    let personality = {
        let tp = def
            .get("tavern_personality")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !tp.trim().is_empty() {
            tp.to_string()
        } else {
            def.get("personality")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string()
        }
    };

    let first_message = def
        .get("first_message")
        .or_else(|| def.get("first_mes"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let scenario = def
        .get("scenario")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let example_dialogs = def
        .get("example_dialogs")
        .or_else(|| def.get("mes_example"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let alternate_greetings = def
        .get("alternate_greetings")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let has_embedded_lorebook = def.get("embedded_lorebook").is_some()
        || def
            .get("extensions")
            .and_then(|e| e.get("character_book"))
            .is_some();

    Ok(ChubCharacterDetail {
        name,
        tagline,
        avatar_url,
        star_count,
        n_favorites,
        n_tokens,
        personality,
        first_message,
        scenario,
        example_dialogs,
        alternate_greetings,
        has_embedded_lorebook,
    })
}

pub async fn import_chub_character(full_path: &str) -> Result<CharacterImportResult, String> {
    let client = get_http_client()?;
    let clean_path = full_path.trim().trim_matches('/');

    let paths = resolve_app_paths();
    let char_dir = PathBuf::from(&paths.characters_dir);
    let _ = fs::create_dir_all(&char_dir);

    // 1. Try downloading pre-built SillyTavern V2 card PNG from CDN
    let cdn_url = format!(
        "https://avatars.charhub.io/avatars/{}/chara_card_v2.png",
        clean_path
    );
    info!("[SoulHub] Attempting CDN download from {}", cdn_url);

    let cdn_result = client
        .get(&cdn_url)
        .header("Accept", "image/png,image/*,*/*")
        .send()
        .await;

    if let Ok(resp) = cdn_result
        && resp.status().is_success()
        && let Ok(bytes) = resp.bytes().await
        && bytes.len() >= 8
        && &bytes[0..8] == b"\x89PNG\r\n\x1a\n"
        && let Ok((mut card, avatar_data_url)) = parse_character_png(&bytes)
    {
        info!(
            "[SoulHub] Successfully downloaded V2 card from CDN for {}",
            clean_path
        );

        let imported_lorebook = extract_and_save_embedded_lorebook(&card, &card.data.name);
        let mut bound_lorebooks = Vec::new();
        if let Some(ref lb_name) = imported_lorebook {
            bound_lorebooks.push(lb_name.clone());
        }

        let unique_name = ensure_unique_character_name(&card.data.name, &char_dir);
        card.data.name = unique_name;

        let profile = CharacterProfile {
            id: card.data.name.clone(),
            card,
            avatar_data_url: Some(avatar_data_url),
            source_path: None,
            bound_lorebooks,
        };

        let saved = save_character_to_user_dir(&profile)?;
        return Ok(CharacterImportResult {
            profile: saved,
            imported_lorebook,
        });
    }

    // 2. Fallback: Query Chub API node and rebuild CharacterCardV2 locally
    info!(
        "[SoulHub] CDN unavailable; reconstructing character from Chub API node for {}",
        clean_path
    );
    let api_url = format!(
        "https://gateway.chub.ai/api/characters/{}?full=true",
        clean_path
    );
    let api_res = client
        .get(&api_url)
        .header("Accept", "application/json, text/plain, */*")
        .send()
        .await
        .map_err(|e| {
            format!(
                "Fehler beim Abrufen der API-Daten für {}: {}",
                clean_path, e
            )
        })?;

    if !api_res.status().is_success() {
        return Err(crate::err!(
            "backend.hub.chubCharacterStatus",
            status = api_res.status()
        ));
    }

    let val: serde_json::Value = api_res
        .json()
        .await
        .map_err(|e| crate::err!("backend.hub.chubParse", error = e))?;

    let mut card = parse_character_json(&serde_json::to_string(&val).unwrap())?;

    // Download avatar image
    let node = val.get("node");
    let avatar_url = node
        .and_then(|n| n.get("avatar_url").or_else(|| n.get("max_res_url")))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let avatar_bytes = if !avatar_url.is_empty() {
        match client.get(avatar_url).send().await {
            Ok(img_resp) if img_resp.status().is_success() => match img_resp.bytes().await {
                Ok(b) => convert_image_bytes_to_png(&b).unwrap_or_else(|_| get_placeholder_png()),
                Err(_) => get_placeholder_png(),
            },
            _ => get_placeholder_png(),
        }
    } else {
        get_placeholder_png()
    };

    let imported_lorebook = extract_and_save_embedded_lorebook(&card, &card.data.name);
    let mut bound_lorebooks = Vec::new();
    if let Some(ref lb_name) = imported_lorebook {
        bound_lorebooks.push(lb_name.clone());
    }

    let unique_name = ensure_unique_character_name(&card.data.name, &char_dir);
    card.data.name = unique_name;

    // Inject V2 metadata chunk into avatar PNG
    let enriched_png = inject_character_metadata_png(&avatar_bytes, &card)?;
    let avatar_data_url = format!(
        "data:image/png;base64,{}",
        BASE64_STANDARD.encode(&enriched_png)
    );

    let profile = CharacterProfile {
        id: card.data.name.clone(),
        card,
        avatar_data_url: Some(avatar_data_url),
        source_path: None,
        bound_lorebooks,
    };

    let saved = save_character_to_user_dir(&profile)?;

    Ok(CharacterImportResult {
        profile: saved,
        imported_lorebook,
    })
}

pub async fn import_character_from_url(url: &str) -> Result<CharacterImportResult, String> {
    let trimmed = url.trim();

    // Check if it's a Chub AI link: e.g. https://chub.ai/characters/author/name
    if trimmed.contains("chub.ai/characters/") {
        let parts: Vec<&str> = trimmed.split("chub.ai/characters/").collect();
        if let Some(path_part) = parts.get(1) {
            let clean_path = path_part.split('?').next().unwrap_or("").trim_matches('/');
            return import_chub_character(clean_path).await;
        }
    }

    // Direct PNG or JSON URL
    let client = get_http_client()?;
    let res = client
        .get(trimmed)
        .send()
        .await
        .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;

    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.common.downloadStatus",
            status = res.status()
        ));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| crate::err!("backend.common.downloadRead", error = e))?;

    let paths = resolve_app_paths();
    let char_dir = PathBuf::from(&paths.characters_dir);
    let _ = fs::create_dir_all(&char_dir);

    if bytes.len() >= 8 && &bytes[0..8] == b"\x89PNG\r\n\x1a\n" {
        let (mut card, avatar_data_url) = parse_character_png(&bytes)?;
        let imported_lorebook = extract_and_save_embedded_lorebook(&card, &card.data.name);
        let mut bound_lorebooks = Vec::new();
        if let Some(ref lb_name) = imported_lorebook {
            bound_lorebooks.push(lb_name.clone());
        }

        let unique_name = ensure_unique_character_name(&card.data.name, &char_dir);
        card.data.name = unique_name;

        let profile = CharacterProfile {
            id: card.data.name.clone(),
            card,
            avatar_data_url: Some(avatar_data_url),
            source_path: None,
            bound_lorebooks,
        };
        let saved = save_character_to_user_dir(&profile)?;
        Ok(CharacterImportResult {
            profile: saved,
            imported_lorebook,
        })
    } else {
        // Attempt JSON parsing
        let text = String::from_utf8(bytes.to_vec()).map_err(|_| {
            "Datei ist weder ein valides PNG noch eine UTF-8 JSON-Datei".to_string()
        })?;
        let mut card = parse_character_json(&text)?;
        let imported_lorebook = extract_and_save_embedded_lorebook(&card, &card.data.name);
        let mut bound_lorebooks = Vec::new();
        if let Some(ref lb_name) = imported_lorebook {
            bound_lorebooks.push(lb_name.clone());
        }

        let unique_name = ensure_unique_character_name(&card.data.name, &char_dir);
        card.data.name = unique_name;

        let profile = CharacterProfile {
            id: card.data.name.clone(),
            card,
            avatar_data_url: None,
            source_path: None,
            bound_lorebooks,
        };
        let saved = save_character_to_user_dir(&profile)?;
        Ok(CharacterImportResult {
            profile: saved,
            imported_lorebook,
        })
    }
}

// =========================================================================
// 3. Welt-Lorebooks (World Lorebooks)
// =========================================================================

pub async fn fetch_lorebooks_gateway_registry() -> Result<Vec<GatewayLorebookEntry>, String> {
    let client = get_http_client()?;
    let res = client
        .get(LOREBOOKS_REGISTRY_URL)
        .send()
        .await
        .map_err(|e| crate::err!("backend.hub.lorebooksFetch", error = e))?;

    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.hub.registryStatus",
            status = res.status()
        ));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| crate::err!("backend.hub.lorebooksParse", error = e))?;

    let books = val
        .get("lorebooks")
        .and_then(|v| v.as_array())
        .ok_or_else(|| crate::err!("backend.hub.lorebooksMissing"))?;

    let mut results = Vec::new();
    for b in books {
        if let (Some(name), Some(author), Some(download_url)) = (
            b.get("name").and_then(|v| v.as_str()),
            b.get("author").and_then(|v| v.as_str()),
            b.get("download_url").and_then(|v| v.as_str()),
        ) {
            let description = b
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let entry_count = b.get("entry_count").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

            results.push(GatewayLorebookEntry {
                name: name.to_string(),
                author: author.to_string(),
                description,
                entry_count,
                download_url: download_url.to_string(),
            });
        }
    }

    Ok(results)
}

pub async fn import_lorebook_from_gateway(
    download_url: &str,
    fallback_name: &str,
) -> Result<Lorebook, String> {
    let client = get_http_client()?;
    let res = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| crate::err!("backend.hub.lorebookDownload", error = e))?;

    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.common.downloadStatus",
            status = res.status()
        ));
    }

    let content = res
        .text()
        .await
        .map_err(|e| crate::err!("backend.hub.lorebookRead", error = e))?;

    let mut lorebook = Lorebook::import_from_json_string(&content, Some(fallback_name))?;

    let paths = resolve_app_paths();
    let lore_dir = PathBuf::from(&paths.lorebooks_dir);
    let _ = fs::create_dir_all(&lore_dir);

    // Ensure unique name
    let mut candidate = lorebook.name.clone();
    let mut suffix = 1;
    let safe_slug = |n: &str| {
        n.trim()
            .to_lowercase()
            .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
    };

    while lore_dir
        .join(format!("{}.json", safe_slug(&candidate)))
        .exists()
    {
        candidate = format!("{}_{}", lorebook.name, suffix);
        suffix += 1;
    }
    lorebook.name = candidate;
    lorebook.id = safe_slug(&lorebook.name);

    let target_path = lore_dir.join(format!("{}.json", lorebook.id));
    lorebook.save_to_file(&target_path)?;

    Ok(lorebook)
}

// =========================================================================
// 4. Soul-Stage-Szenarien (Soul Stage Scenarios)
// =========================================================================

pub async fn fetch_stages_gateway_registry() -> Result<Vec<GatewaySceneEntry>, String> {
    let client = get_http_client()?;
    let res = client
        .get(STAGES_REGISTRY_URL)
        .send()
        .await
        .map_err(|e| crate::err!("backend.hub.stagesFetch", error = e))?;

    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.hub.registryStatus",
            status = res.status()
        ));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| crate::err!("backend.hub.stagesParse", error = e))?;

    let scenes = val
        .get("scenes")
        .and_then(|v| v.as_array())
        .ok_or_else(|| crate::err!("backend.hub.scenesMissing"))?;

    let mut results = Vec::new();
    for s in scenes {
        if let (Some(title), Some(author), Some(download_url)) = (
            s.get("title").and_then(|v| v.as_str()),
            s.get("author").and_then(|v| v.as_str()),
            s.get("download_url").and_then(|v| v.as_str()),
        ) {
            let id = s
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let description = s
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let starting_location = s
                .get("starting_location")
                .and_then(|v| v.as_str())
                .unwrap_or("Startgebiet")
                .to_string();

            results.push(GatewaySceneEntry {
                id,
                title: title.to_string(),
                author: author.to_string(),
                description,
                starting_location,
                download_url: download_url.to_string(),
            });
        }
    }

    Ok(results)
}

pub async fn import_scene_from_gateway(
    download_url: &str,
    fallback_title: &str,
) -> Result<SceneState, String> {
    let client = get_http_client()?;
    let res = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| crate::err!("backend.hub.sceneDownload", error = e))?;

    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.common.downloadStatus",
            status = res.status()
        ));
    }

    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| crate::err!("backend.hub.sceneParse", error = e))?;

    let title = val
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or(fallback_title)
        .to_string();

    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let _ = fs::create_dir_all(&scenes_dir);

    let raw_slug = title
        .trim()
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
    let mut id = if raw_slug.trim().is_empty() {
        format!("scene_{}", chrono::Utc::now().timestamp_millis())
    } else {
        raw_slug
    };

    let mut suffix = 1;
    let base_id = id.clone();
    while scenes_dir.join(format!("{}.json", id)).exists() {
        id = format!("{}_{}", base_id, suffix);
        suffix += 1;
    }

    let description = val
        .get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let world_context = val
        .get("world_context")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let starting_location = val
        .get("starting_location")
        .and_then(|v| v.as_str())
        .unwrap_or("Startgebiet")
        .to_string();
    let time_of_day = val
        .get("time_of_day")
        .and_then(|v| v.as_str())
        .unwrap_or("Dämmerung")
        .to_string();
    let opening_narration = val
        .get("opening_narration")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let first_message = val
        .get("first_message")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let party = val
        .get("party")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let gm_tone = val
        .get("gm_tone")
        .and_then(|v| v.as_str())
        .unwrap_or("Epic Fantasy")
        .to_string();
    let narrator_style = val
        .get("narrator_style")
        .and_then(|v| v.as_str())
        .unwrap_or("Getragene, bildstarke Prosa im Präsens.")
        .to_string();
    let persona = val
        .get("persona")
        .and_then(|v| v.as_str())
        .unwrap_or("None")
        .to_string();
    let lorebook = val
        .get("lorebook")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let solo_mode = val
        .get("solo_mode")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let max_actor_depth = val
        .get("max_actor_depth")
        .and_then(|v| v.as_u64())
        .map(|n| n as u32)
        .unwrap_or(3);
    let dice_rolls_enabled = val
        .get("dice_rolls_enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let starting_bg = val
        .get("starting_bg")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let starting_ambient = val
        .get("starting_ambient")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let disable_ambient = val
        .get("disable_ambient")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let lock_bg = val
        .get("lock_bg")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let folder = val
        .get("folder")
        .and_then(|v| v.as_str())
        .unwrap_or("Soul Hub")
        .to_string();

    let def = SceneDefinition {
        id,
        title,
        description,
        world_context,
        starting_location,
        time_of_day,
        opening_narration,
        first_message,
        party,
        gm_tone,
        narrator_style,
        persona,
        lorebook,
        folder,
        lock_bg,
        disable_ambient,
        solo_mode,
        max_actor_depth,
        dice_rolls_enabled,
        starting_bg,
        starting_ambient,
        extensions: serde_json::Value::Null,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_played: None,
    };

    let state = create_custom_scene(def)?;
    save_scene_state(&state)?;

    Ok(state)
}
