use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Cursor;
use std::path::PathBuf;
use tracing::info;
use ts_rs::TS;

use crate::modules::characters::{
    CharacterProfile, inject_character_metadata_png, parse_character_json, parse_character_png,
    store_imported_card,
};
use crate::modules::hub_installed;
use crate::modules::lorebook::Lorebook;
use crate::modules::paths::resolve_app_paths;
use crate::modules::stage::{
    SceneDefinition, SceneState, create_custom_scene, find_scene_path, load_scene_by_id,
    save_scene_state, update_scene_definition,
};

const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HUB_BASE_URL: &str =
    "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main";

/// The adult content repository: a second source, only fetched when NSFW is on and the age was
/// confirmed (`settings::nsfw_allowed`).
const NSFW_HUB_BASE_URL: &str =
    "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data-nsfw/main";

fn nsfw_base() -> String {
    std::env::var("OTAKUSOUL_NSFW_HUB_BASE").unwrap_or_else(|_| NSFW_HUB_BASE_URL.to_string())
}

/// Address of a file in the adult content repository (`OTAKUSOUL_NSFW_HUB_BASE` for E2E).
pub fn nsfw_hub_url(file: &str) -> String {
    format!("{}/{file}", nsfw_base().trim_end_matches('/'))
}

/// The download comes from the adult content repository.
fn from_nsfw_source(download_url: &str) -> bool {
    download_url.starts_with(nsfw_base().trim_end_matches('/'))
        || download_url.starts_with(NSFW_HUB_BASE_URL)
}

/// Downloads from the adult repository need NSFW on and a confirmed age.
fn ensure_source_allowed(download_url: &str) -> Result<(), String> {
    if from_nsfw_source(download_url) && !crate::modules::settings::nsfw_allowed() {
        return Err(crate::err!("backend.hub.nsfwDisabled"));
    }
    Ok(())
}

/// The entries of a registry in the adult repository; it is optional, so a failure (offline,
/// not yet public) only logs and gives none.
async fn nsfw_registry_items(file: &str, key: &str) -> Vec<serde_json::Value> {
    let fetch = async {
        let res = get_http_client()?
            .get(nsfw_hub_url(file))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP {}", res.status()));
        }
        res.json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())
    };
    match fetch.await {
        Ok(value) => value
            .get(key)
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        Err(error) => {
            tracing::warn!("NSFW-Registry {file} nicht erreichbar: {error}");
            Vec::new()
        }
    }
}

/// Whether a registry entry is marked as adult content.
fn is_nsfw(entry: &serde_json::Value) -> bool {
    entry.get("nsfw").and_then(|v| v.as_bool()).unwrap_or(false)
}

/// Address of a file in the data repository; `OTAKUSOUL_HUB_BASE` points the hub elsewhere (E2E
/// mock server).
pub fn hub_url(file: &str) -> String {
    let base = std::env::var("OTAKUSOUL_HUB_BASE").unwrap_or_else(|_| HUB_BASE_URL.to_string());
    format!("{}/{file}", base.trim_end_matches('/'))
}

/// Texts of a registry entry in other languages (`translations.<lang>.<field>`); anything that is
/// not a string is left out.
fn entry_translations(
    entry: &serde_json::Value,
) -> std::collections::HashMap<String, std::collections::HashMap<String, String>> {
    entry
        .get("translations")
        .and_then(|v| v.as_object())
        .map(|langs| {
            langs
                .iter()
                .filter_map(|(lang, fields)| {
                    let texts: std::collections::HashMap<String, String> = fields
                        .as_object()?
                        .iter()
                        .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                        .collect();
                    (!texts.is_empty()).then(|| (lang.clone(), texts))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Revision and date of a registry entry (entries without them count as revision 1).
fn entry_revision(entry: &serde_json::Value) -> (u32, String) {
    let revision = entry
        .get("revision")
        .and_then(|v| v.as_u64())
        .map_or(1, |n| n.max(1) as u32);
    let updated = entry
        .get("updated")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    (revision, updated)
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GatewayCharacterEntry {
    pub name: String,
    pub author: String,
    pub download_url: String,
    /// Increases with every change of the content; compared with the installed copy.
    #[serde(default)]
    pub revision: u32,
    /// Date of the current revision (for display).
    #[serde(default)]
    pub updated: String,
    /// Content for adults (from the NSFW source or marked so).
    #[serde(default)]
    pub nsfw: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GatewayLorebookEntry {
    pub name: String,
    pub author: String,
    pub description: String,
    pub entry_count: u32,
    pub download_url: String,
    /// Increases with every change of the content; compared with the installed copy.
    #[serde(default)]
    pub revision: u32,
    /// Date of the current revision (for display).
    #[serde(default)]
    pub updated: String,
    /// Texts for the list in other languages (`{"en": {"description": "…"}}`); the original
    /// name or title stays the key for updates.
    #[serde(default)]
    #[ts(type = "Record<string, Record<string, string>>")]
    pub translations: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
    /// Content for adults (from the NSFW source or marked so).
    #[serde(default)]
    pub nsfw: bool,
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
    /// Increases with every change of the content; compared with the installed copy.
    #[serde(default)]
    pub revision: u32,
    /// Date of the current revision (for display).
    #[serde(default)]
    pub updated: String,
    /// Texts for the list in other languages (see `GatewayLorebookEntry::translations`).
    #[serde(default)]
    #[ts(type = "Record<string, Record<string, string>>")]
    pub translations: std::collections::HashMap<String, std::collections::HashMap<String, String>>,
    /// Content for adults (from the NSFW source or marked so).
    #[serde(default)]
    pub nsfw: bool,
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
        .get(hub_url("soul_registry.json"))
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

    let nsfw = crate::modules::settings::nsfw_allowed();
    let mut results: Vec<GatewayCharacterEntry> = characters
        .iter()
        .filter(|c| nsfw || !is_nsfw(c))
        .filter_map(|c| character_entry(c, false))
        .collect();
    if nsfw {
        for c in nsfw_registry_items("soul_registry.json", "characters").await {
            results.extend(character_entry(&c, true));
        }
    }
    Ok(results)
}

fn character_entry(c: &serde_json::Value, from_nsfw: bool) -> Option<GatewayCharacterEntry> {
    let (revision, updated) = entry_revision(c);
    Some(GatewayCharacterEntry {
        name: c.get("name")?.as_str()?.to_string(),
        author: c.get("author")?.as_str()?.to_string(),
        download_url: c.get("download_url")?.as_str()?.to_string(),
        revision,
        updated,
        nsfw: from_nsfw || is_nsfw(c),
    })
}

pub async fn import_soul_gateway_character(
    name: &str,
    author: &str,
    download_url: &str,
    overwrite: bool,
    revision: u32,
    updated: &str,
) -> Result<CharacterImportResult, String> {
    ensure_source_allowed(download_url)?;
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
    // Adult content stays hidden while adult content is off.
    if from_nsfw_source(download_url) {
        crate::modules::nsfw::mark(&mut card.data.extensions);
    }

    let result = store_imported_card(card, Some(avatar_data_url), overwrite)?;
    hub_installed::record(
        "character",
        name,
        &result.profile.id,
        revision.max(1),
        updated,
        None,
    )?;
    Ok(result)
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
    // Adult results only with NSFW on and a confirmed age (also when the page asks for them).
    let nsfw = nsfw && crate::modules::settings::nsfw_allowed();
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

pub async fn import_chub_character(
    full_path: &str,
    overwrite: bool,
) -> Result<CharacterImportResult, String> {
    let client = get_http_client()?;
    let clean_path = full_path.trim().trim_matches('/');

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
        && let Ok((card, avatar_data_url)) = parse_character_png(&bytes)
    {
        info!(
            "[SoulHub] Successfully downloaded V2 card from CDN for {}",
            clean_path
        );

        return store_imported_card(card, Some(avatar_data_url), overwrite);
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

    let card = parse_character_json(&serde_json::to_string(&val).unwrap())?;

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

    // Inject V2 metadata chunk into avatar PNG
    let enriched_png = inject_character_metadata_png(&avatar_bytes, &card)?;
    let avatar_data_url = format!(
        "data:image/png;base64,{}",
        BASE64_STANDARD.encode(&enriched_png)
    );
    store_imported_card(card, Some(avatar_data_url), overwrite)
}

pub async fn import_character_from_url(
    url: &str,
    overwrite: bool,
) -> Result<CharacterImportResult, String> {
    let trimmed = url.trim();

    // Check if it's a Chub AI link: e.g. https://chub.ai/characters/author/name
    if trimmed.contains("chub.ai/characters/") {
        let parts: Vec<&str> = trimmed.split("chub.ai/characters/").collect();
        if let Some(path_part) = parts.get(1) {
            let clean_path = path_part.split('?').next().unwrap_or("").trim_matches('/');
            return import_chub_character(clean_path, overwrite).await;
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

    if bytes.len() >= 8 && &bytes[0..8] == b"\x89PNG\r\n\x1a\n" {
        let (card, avatar_data_url) = parse_character_png(&bytes)?;
        store_imported_card(card, Some(avatar_data_url), overwrite)
    } else {
        // Attempt JSON parsing
        let text = String::from_utf8(bytes.to_vec()).map_err(|_| {
            "Datei ist weder ein valides PNG noch eine UTF-8 JSON-Datei".to_string()
        })?;
        let card = parse_character_json(&text)?;
        store_imported_card(card, None, overwrite)
    }
}

// =========================================================================
// 3. Welt-Lorebooks (World Lorebooks)
// =========================================================================

pub async fn fetch_lorebooks_gateway_registry() -> Result<Vec<GatewayLorebookEntry>, String> {
    let client = get_http_client()?;
    let res = client
        .get(hub_url("lorebooks_registry.json"))
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

    let nsfw = crate::modules::settings::nsfw_allowed();
    let mut results: Vec<GatewayLorebookEntry> = books
        .iter()
        .filter(|b| nsfw || !is_nsfw(b))
        .filter_map(|b| lorebook_entry(b, false))
        .collect();
    if nsfw {
        for b in nsfw_registry_items("lorebooks_registry.json", "lorebooks").await {
            results.extend(lorebook_entry(&b, true));
        }
    }
    Ok(results)
}

fn lorebook_entry(b: &serde_json::Value, from_nsfw: bool) -> Option<GatewayLorebookEntry> {
    let (revision, updated) = entry_revision(b);
    Some(GatewayLorebookEntry {
        name: b.get("name")?.as_str()?.to_string(),
        author: b.get("author")?.as_str()?.to_string(),
        description: b
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        entry_count: b.get("entry_count").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        download_url: b.get("download_url")?.as_str()?.to_string(),
        revision,
        updated,
        translations: entry_translations(b),
        nsfw: from_nsfw || is_nsfw(b),
    })
}

/// Downloads a lorebook from the gateway. An installed copy is updated in place (characters stay
/// bound to its id); a copy the user changed, or an own lorebook of the same name, is kept: without
/// `keep_copy` the call fails with `backend.hub.lorebookModified`, with it the own version is
/// saved under a new name first.
pub async fn import_lorebook_from_gateway(
    download_url: &str,
    fallback_name: &str,
    revision: u32,
    updated: &str,
    keep_copy: bool,
) -> Result<Lorebook, String> {
    ensure_source_allowed(download_url)?;
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
    if from_nsfw_source(download_url) {
        crate::modules::nsfw::mark(&mut lorebook.extensions);
    }
    let lore_dir = PathBuf::from(&resolve_app_paths().lorebooks_dir);
    install_lorebook(
        &lore_dir,
        lorebook,
        fallback_name,
        revision.max(1),
        updated,
        keep_copy,
    )
}

fn lorebook_slug(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
}

fn install_lorebook(
    lore_dir: &std::path::Path,
    mut lorebook: Lorebook,
    hub_id: &str,
    revision: u32,
    updated: &str,
    keep_copy: bool,
) -> Result<Lorebook, String> {
    let _ = fs::create_dir_all(lore_dir);
    let installed = hub_installed::find("lorebook", hub_id);
    let id = installed
        .as_ref()
        .map(|item| item.local_id.clone())
        .unwrap_or_else(|| lorebook_slug(&lorebook.name));
    let target_path = lore_dir.join(format!("{id}.json"));

    if target_path.exists() && hub_installed::is_modified(&target_path, installed.as_ref()) {
        if !keep_copy {
            return Err(crate::err!(
                "backend.hub.lorebookModified",
                name = lorebook.name
            ));
        }
        // The user's version stays as its own lorebook next to the update.
        let mut own = Lorebook::load_from_file(&target_path)?;
        let mut suffix = 1;
        let (copy_id, copy_path) = loop {
            let candidate = format!(
                "{id}_own{}",
                if suffix == 1 {
                    String::new()
                } else {
                    format!("_{suffix}")
                }
            );
            let path = lore_dir.join(format!("{candidate}.json"));
            if !path.exists() {
                break (candidate, path);
            }
            suffix += 1;
        };
        own.name = crate::modules::content_lang::ContentLang::current()
            .t("{name} (own version)")
            .replace("{name}", &own.name);
        own.id = copy_id;
        own.save_to_file(&copy_path)?;
    }

    lorebook.id = id;
    lorebook.save_to_file(&target_path)?;
    hub_installed::record(
        "lorebook",
        hub_id,
        &lorebook.id,
        revision,
        updated,
        Some(&target_path),
    )?;
    Ok(lorebook)
}

// =========================================================================
// 4. Soul-Stage-Szenarien (Soul Stage Scenarios)
// =========================================================================

pub async fn fetch_stages_gateway_registry() -> Result<Vec<GatewaySceneEntry>, String> {
    let client = get_http_client()?;
    let res = client
        .get(hub_url("stages_registry.json"))
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

    let nsfw = crate::modules::settings::nsfw_allowed();
    let mut results: Vec<GatewaySceneEntry> = scenes
        .iter()
        .filter(|s| nsfw || !is_nsfw(s))
        .filter_map(|s| scene_entry(s, false))
        .collect();
    if nsfw {
        for s in nsfw_registry_items("stages_registry.json", "scenes").await {
            results.extend(scene_entry(&s, true));
        }
    }
    Ok(results)
}

fn scene_entry(s: &serde_json::Value, from_nsfw: bool) -> Option<GatewaySceneEntry> {
    let text = |key: &str, default: &str| {
        s.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or(default)
            .to_string()
    };
    let (revision, updated) = entry_revision(s);
    Some(GatewaySceneEntry {
        id: text("id", ""),
        title: s.get("title")?.as_str()?.to_string(),
        author: s.get("author")?.as_str()?.to_string(),
        description: text("description", ""),
        starting_location: text("starting_location", "Startgebiet"),
        download_url: s.get("download_url")?.as_str()?.to_string(),
        revision,
        updated,
        translations: entry_translations(s),
        nsfw: from_nsfw || is_nsfw(s),
    })
}

/// Downloads a scene from the gateway. An installed copy is updated in place: its settings are
/// replaced, progress (history, world state, party values) stays.
pub async fn import_scene_from_gateway(
    download_url: &str,
    fallback_title: &str,
    hub_id: &str,
    revision: u32,
    updated: &str,
) -> Result<SceneState, String> {
    ensure_source_allowed(download_url)?;
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
    let mut def = scene_definition_from_hub(val, fallback_title)?;
    if from_nsfw_source(download_url) {
        crate::modules::nsfw::mark(&mut def.extensions);
    }
    download_scene_assets(&client, &def).await;
    let hub_id = if hub_id.trim().is_empty() {
        fallback_title
    } else {
        hub_id
    };
    install_hub_scene(def, hub_id, revision.max(1), updated)
}

/// One picture a hub scene can use: its file name in the app and its path in the content repository.
#[derive(Debug, Clone, PartialEq, Deserialize)]
struct SceneAsset {
    file: String,
    path: String,
}

/// Backgrounds listed in `extensions.otakusoul_assets.backgrounds` that are safe to fetch: a plain
/// file name with a picture extension, and a repository path below `presets/` without `..`.
fn scene_background_assets(def: &SceneDefinition) -> Vec<SceneAsset> {
    let Some(list) = def
        .extensions
        .get("otakusoul_assets")
        .and_then(|assets| assets.get("backgrounds"))
        .and_then(|list| list.as_array())
    else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|item| serde_json::from_value::<SceneAsset>(item.clone()).ok())
        .filter(|asset| {
            let picture = std::path::Path::new(&asset.file)
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| {
                    matches!(
                        e.to_ascii_lowercase().as_str(),
                        "png" | "jpg" | "jpeg" | "webp"
                    )
                });
            let plain_name = !asset.file.contains(['/', '\\']) && !asset.file.starts_with('.');
            let safe_path = asset.path.starts_with("presets/")
                && !asset
                    .path
                    .split(['/', '\\'])
                    .any(|part| part == ".." || part.is_empty());
            picture && plain_name && safe_path
        })
        .collect()
}

/// Fetches the backgrounds of a hub scene that are not in `<data>/backgrounds` yet, so the opening
/// picture and the ones the game master switches to are there. Failures only cost the picture.
async fn download_scene_assets(client: &reqwest::Client, def: &SceneDefinition) {
    let dir = PathBuf::from(resolve_app_paths().data_dir).join("backgrounds");
    for asset in scene_background_assets(def) {
        let target = dir.join(&asset.file);
        if target.exists() {
            continue;
        }
        let encoded: Vec<String> = asset
            .path
            .split('/')
            .map(|part| urlencoding::encode(part).into_owned())
            .collect();
        let url = hub_url(&encoded.join("/"));
        let bytes = match client.get(&url).send().await {
            Ok(res) if res.status().is_success() => res.bytes().await.ok(),
            _ => None,
        };
        match bytes {
            Some(bytes) if !bytes.is_empty() => {
                let _ = fs::create_dir_all(&dir);
                if let Err(e) = fs::write(&target, &bytes) {
                    tracing::warn!("Hintergrund {} nicht gespeichert: {e}", asset.file);
                }
            }
            _ => tracing::warn!("Hintergrund {} nicht geladen ({url})", asset.file),
        }
    }
}

/// A scene file from the gateway as definition, keeping translations and story data
/// (`extensions`). Fields that are `null` in the file count as missing.
pub(crate) fn scene_definition_from_hub(
    mut val: serde_json::Value,
    fallback_title: &str,
) -> Result<SceneDefinition, String> {
    // Some gateway files are whole scene states.
    if let Some(definition) = val.get("definition").filter(|d| d.is_object()) {
        val = definition.clone();
    }
    if let Some(object) = val.as_object_mut() {
        object.retain(|_, value| !value.is_null());
    }
    let mut def: SceneDefinition = serde_json::from_value(val)
        .map_err(|e| crate::err!("backend.hub.sceneParse", error = e))?;
    if def.title.trim().is_empty() {
        def.title = fallback_title.to_string();
    }
    if def.folder.trim().is_empty() {
        def.folder = HUB_SCENE_FOLDER.to_string();
    }
    def.persona = def.persona.trim().trim_matches('"').to_string();
    if def.persona.eq_ignore_ascii_case("none") {
        def.persona.clear();
    }
    def.solo_mode = def.party.is_empty();
    Ok(def)
}

const HUB_SCENE_FOLDER: &str = "Soul Hub";

fn scene_slug(text: &str) -> String {
    text.trim()
        .to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
}

fn install_hub_scene(
    mut def: SceneDefinition,
    hub_id: &str,
    revision: u32,
    updated: &str,
) -> Result<SceneState, String> {
    // The installed copy: from the index, or one imported before the index existed (id = slug
    // of the title, same title).
    let existing = hub_installed::find("scene", hub_id)
        .and_then(|item| load_scene_by_id(&item.local_id).ok())
        .or_else(|| {
            load_scene_by_id(&scene_slug(&def.title))
                .ok()
                .filter(|state| state.definition.title == def.title)
        });
    let state = match existing {
        Some(mut state) => {
            update_scene_definition(&mut state, def);
            save_scene_state(&state)?;
            state
        }
        None => {
            let base = format!("hub_{}", scene_slug(hub_id));
            let mut id = base.clone();
            let mut suffix = 1;
            while find_scene_path(&id).is_some() {
                suffix += 1;
                id = format!("{base}_{suffix}");
            }
            def.id = id;
            create_custom_scene(def)?
        }
    };
    hub_installed::record(
        "scene",
        hub_id,
        &state.definition.id,
        revision,
        updated,
        None,
    )?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_entries_bring_their_list_texts_per_language() {
        let entry = serde_json::json!({
            "title": "Matchball",
            "translations": {
                "en": {"title": "Match point", "description": "Hazel's final.", "count": 3},
                "ru": "kaputt",
                "fr": {}
            }
        });
        let texts = super::entry_translations(&entry);
        assert_eq!(texts.len(), 1, "only languages with texts");
        assert_eq!(texts["en"]["title"], "Match point");
        assert!(!texts["en"].contains_key("count"), "only strings");
        assert!(super::entry_translations(&serde_json::json!({})).is_empty());
    }

    #[test]
    fn scene_backgrounds_are_only_fetched_from_safe_paths() {
        let file = serde_json::json!({
            "title": "Audienz",
            "description": "Thronsaal",
            "extensions": { "otakusoul_assets": { "backgrounds": [
                { "file": "Horizontal Elkia Throne Room.png", "path": "presets/no-game-no-life/backgrounds/Horizontal Elkia Throne Room.png" },
                { "file": "../evil.png", "path": "presets/x/evil.png" },
                { "file": "evil.png", "path": "presets/../../etc/evil.png" },
                { "file": "notes.txt", "path": "presets/x/notes.txt" },
                { "file": "outside.png", "path": "tools/outside.png" }
            ] } }
        });
        let def = scene_definition_from_hub(file, "Fallback").unwrap();
        let assets = scene_background_assets(&def);
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].file, "Horizontal Elkia Throne Room.png");
    }

    #[test]
    fn hub_scenes_keep_translations_and_story_data() {
        let file = serde_json::json!({
            "id": null,
            "folder": null,
            "title": "Matchball",
            "description": "Tennis",
            "party": ["Hazel Williams"],
            "persona": "None",
            "time_of_day": "Tag",
            "conversation_method": "Local LLM",
            "extensions": {
                "otakusoul_i18n": { "source_language": "de", "translations": { "en": { "title": "Match point" } } },
                "otakusoul_story": { "genre": "slice_of_life", "minutes": 30, "difficulty": "easy", "beginner": true }
            }
        });
        let def = scene_definition_from_hub(file, "Fallback").unwrap();
        assert_eq!(def.folder, HUB_SCENE_FOLDER);
        assert_eq!(def.persona, "");
        assert_eq!(def.localized("en").title, "Match point");
        let story = def.story_info().unwrap();
        assert_eq!(story.genre, "slice_of_life");
        assert!(story.beginner);
        assert!(!def.solo_mode);
    }

    #[test]
    fn whole_scene_states_and_missing_titles_are_accepted() {
        let file = serde_json::json!({ "definition": { "title": "", "description": "x" }, "chat_log": [] });
        let def = scene_definition_from_hub(file, "Aus dem Hub").unwrap();
        assert_eq!(def.title, "Aus dem Hub");
        assert!(def.solo_mode, "no party = the game master plays everyone");
    }

    #[test]
    fn registry_entries_carry_their_adult_marking() {
        let marked =
            serde_json::json!({"name": "Mint", "author": "a", "download_url": "u", "nsfw": true});
        let plain = serde_json::json!({"name": "Ayu", "author": "a", "download_url": "u"});
        assert!(is_nsfw(&marked) && !is_nsfw(&plain));
        assert!(character_entry(&marked, false).unwrap().nsfw);
        assert!(!character_entry(&plain, false).unwrap().nsfw);
        // Everything from the adult source counts as adult content.
        assert!(character_entry(&plain, true).unwrap().nsfw);
        let scene = serde_json::json!({"title": "T", "author": "a", "download_url": "u"});
        assert!(scene_entry(&scene, true).unwrap().nsfw);
        assert_eq!(
            scene_entry(&scene, false).unwrap().starting_location,
            "Startgebiet"
        );
        let book =
            serde_json::json!({"name": "B", "author": "a", "download_url": "u", "nsfw": true});
        assert!(lorebook_entry(&book, false).unwrap().nsfw);
        // Incomplete entries are skipped.
        assert!(character_entry(&serde_json::json!({"name": "X"}), false).is_none());
    }

    #[test]
    fn registry_entries_without_revision_count_as_first() {
        assert_eq!(entry_revision(&serde_json::json!({})), (1, String::new()));
        assert_eq!(
            entry_revision(&serde_json::json!({ "revision": 4, "updated": "2026-10-16" })),
            (4, "2026-10-16".to_string())
        );
    }
}
