use serde::Deserialize;
use std::fs;
use std::path::PathBuf;

use crate::modules::hub_installed;
use crate::modules::lorebook::Lorebook;
use crate::modules::paths::resolve_app_paths;
use crate::modules::stage::{
    SceneDefinition, SceneState, create_custom_scene, find_scene_path, load_scene_by_id,
    save_scene_state, update_scene_definition,
};

use super::http::get_http_client;
use super::models::{GatewayCollectionEntry, GatewayLorebookEntry, GatewaySceneEntry};
use super::pins::{
    ensure_source_allowed, entry_revision, entry_translations, from_nsfw_source, hub_url, is_nsfw,
    nsfw_registry_items,
};

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

pub(super) fn lorebook_entry(b: &serde_json::Value, from_nsfw: bool) -> Option<GatewayLorebookEntry> {
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
// 3b. Sammlungen (Story collections)
// =========================================================================

/// The story collections. A data repository without `collections_registry.json` (older state,
/// E2E mock) has none, which is not an error: the hub then lists everything ungrouped.
pub async fn fetch_collections_gateway_registry() -> Result<Vec<GatewayCollectionEntry>, String> {
    let res = get_http_client()?
        .get(hub_url("collections_registry.json"))
        .send()
        .await
        .map_err(|e| crate::err!("backend.hub.collectionsFetch", error = e))?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(Vec::new());
    }
    if !res.status().is_success() {
        return Err(crate::err!(
            "backend.hub.registryStatus",
            status = res.status()
        ));
    }
    let val: serde_json::Value = res
        .json()
        .await
        .map_err(|e| crate::err!("backend.hub.collectionsFetch", error = e))?;
    let nsfw = crate::modules::settings::nsfw_allowed();
    let mut results: Vec<GatewayCollectionEntry> = val
        .get("collections")
        .and_then(|v| v.as_array())
        .map(|items| {
            items
                .iter()
                .filter(|c| nsfw || !is_nsfw(c))
                .filter_map(|c| collection_entry(c, false))
                .collect()
        })
        .unwrap_or_default();
    if nsfw {
        for c in nsfw_registry_items("collections_registry.json", "collections").await {
            results.extend(collection_entry(&c, true));
        }
    }
    Ok(results)
}

pub(super) fn collection_entry(c: &serde_json::Value, from_nsfw: bool) -> Option<GatewayCollectionEntry> {
    let text = |key: &str| {
        c.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };
    let names = |key: &str| -> Vec<String> {
        c.get(key)
            .and_then(|v| v.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default()
    };
    let (revision, updated) = entry_revision(c);
    let id = c.get("id")?.as_str()?.to_string();
    let title = c
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or(&id)
        .to_string();
    Some(GatewayCollectionEntry {
        id,
        title,
        author: text("author"),
        description: text("description"),
        cover_url: text("cover_url"),
        lorebooks: names("lorebooks"),
        scenes: names("scenes"),
        characters: names("characters"),
        revision,
        updated,
        translations: entry_translations(c),
        nsfw: from_nsfw || is_nsfw(c),
    })
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

pub(super) fn scene_entry(s: &serde_json::Value, from_nsfw: bool) -> Option<GatewaySceneEntry> {
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
pub(super) struct SceneAsset {
    pub(super) file: String,
    path: String,
}

/// Backgrounds listed in `extensions.otakusoul_assets.backgrounds` that are safe to fetch: a plain
/// file name with a picture extension, and a repository path below `presets/` without `..`.
pub(super) fn scene_background_assets(def: &SceneDefinition) -> Vec<SceneAsset> {
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

pub(super) const HUB_SCENE_FOLDER: &str = "Soul Hub";

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
