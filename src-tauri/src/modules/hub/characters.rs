use crate::modules::characters::{parse_character_json, parse_character_png, store_imported_card};
use crate::modules::hub_installed;

use super::chub::import_chub_character;
use super::http::get_http_client;
use super::models::{CharacterImportResult, GatewayCharacterEntry};
use super::pins::{
    ensure_source_allowed, entry_revision, from_nsfw_source, hub_url, is_nsfw, nsfw_registry_items,
};

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

pub(super) fn character_entry(
    c: &serde_json::Value,
    from_nsfw: bool,
) -> Option<GatewayCharacterEntry> {
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
