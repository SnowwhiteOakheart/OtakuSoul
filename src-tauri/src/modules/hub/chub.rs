use base64::prelude::*;
use tracing::info;

use crate::modules::characters::{
    inject_character_metadata_png, parse_character_json, parse_character_png, store_imported_card,
};

use super::http::{convert_image_bytes_to_png, get_http_client, get_placeholder_png};
use super::models::{CharacterImportResult, ChubCharacterDetail, ChubSearchItem, ChubSearchResult};

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
