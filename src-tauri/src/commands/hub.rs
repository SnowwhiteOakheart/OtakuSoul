//! Soul Hub: gateway registries and chub.ai imports.

/// Reload button in the hub: newest commits of the data repositories, and the avatar and
/// Inochi2D catalogs fetched again (otherwise only read at start).
#[tauri::command]
pub async fn refresh_hub_sources() {
    crate::modules::hub::pin_latest_commits().await;
    tokio::join!(
        crate::modules::avatar_hub::refresh_registry(),
        crate::modules::inochi2d::refresh_registry(),
        crate::modules::stage_music::refresh_registry()
    );
}

#[tauri::command]
pub async fn fetch_soul_gateway_registry()
-> Result<Vec<crate::modules::hub::GatewayCharacterEntry>, String> {
    crate::modules::hub::fetch_soul_gateway_registry().await
}

#[tauri::command]
pub async fn import_soul_gateway_character(
    name: String,
    author: String,
    download_url: String,
    overwrite: Option<bool>,
    revision: Option<u32>,
    updated: Option<String>,
) -> Result<crate::modules::hub::CharacterImportResult, String> {
    crate::modules::hub::import_soul_gateway_character(
        &name,
        &author,
        &download_url,
        overwrite.unwrap_or(false),
        revision.unwrap_or(1),
        updated.as_deref().unwrap_or(""),
    )
    .await
}

#[tauri::command]
pub async fn search_chub_characters(
    query: String,
    page: u32,
    first: u32,
    sort: String,
    topics: Option<Vec<String>>,
    nsfw: bool,
) -> Result<crate::modules::hub::ChubSearchResult, String> {
    crate::modules::hub::search_chub_characters(&query, page, first, &sort, topics, nsfw).await
}

#[tauri::command]
pub async fn get_chub_character_details(
    full_path: String,
) -> Result<crate::modules::hub::ChubCharacterDetail, String> {
    crate::modules::hub::get_chub_character_details(&full_path).await
}

#[tauri::command]
pub async fn import_chub_character(
    full_path: String,
    overwrite: Option<bool>,
) -> Result<crate::modules::hub::CharacterImportResult, String> {
    crate::modules::hub::import_chub_character(&full_path, overwrite.unwrap_or(false)).await
}

#[tauri::command]
pub async fn import_character_from_url(
    url: String,
    overwrite: Option<bool>,
) -> Result<crate::modules::hub::CharacterImportResult, String> {
    crate::modules::hub::import_character_from_url(&url, overwrite.unwrap_or(false)).await
}

#[tauri::command]
pub async fn fetch_lorebooks_gateway_registry()
-> Result<Vec<crate::modules::hub::GatewayLorebookEntry>, String> {
    crate::modules::hub::fetch_lorebooks_gateway_registry().await
}

#[tauri::command]
pub async fn import_lorebook_from_gateway(
    download_url: String,
    fallback_name: String,
    revision: Option<u32>,
    updated: Option<String>,
    keep_copy: Option<bool>,
) -> Result<crate::modules::lorebook::Lorebook, String> {
    crate::modules::hub::import_lorebook_from_gateway(
        &download_url,
        &fallback_name,
        revision.unwrap_or(1),
        updated.as_deref().unwrap_or(""),
        keep_copy.unwrap_or(false),
    )
    .await
}

#[tauri::command]
pub async fn fetch_collections_gateway_registry()
-> Result<Vec<crate::modules::hub::GatewayCollectionEntry>, String> {
    crate::modules::hub::fetch_collections_gateway_registry().await
}

#[tauri::command]
pub async fn fetch_stages_gateway_registry()
-> Result<Vec<crate::modules::hub::GatewaySceneEntry>, String> {
    crate::modules::hub::fetch_stages_gateway_registry().await
}

#[tauri::command]
pub async fn import_scene_from_gateway(
    download_url: String,
    fallback_title: String,
    hub_id: Option<String>,
    revision: Option<u32>,
    updated: Option<String>,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::hub::import_scene_from_gateway(
        &download_url,
        &fallback_title,
        hub_id.as_deref().unwrap_or(""),
        revision.unwrap_or(1),
        updated.as_deref().unwrap_or(""),
    )
    .await
}

/// Hub contents installed so far, with their revisions (the hub compares them for updates).
#[tauri::command]
pub fn list_installed_hub_items() -> Vec<crate::modules::hub_installed::InstalledHubItem> {
    crate::modules::hub_installed::list()
}

// ---------------------------------------------------------------------------------------
// Contributing to the hub (`modules/contribution.rs`)
// ---------------------------------------------------------------------------------------

/// What the hub needs of a character, before it is contributed.
#[tauri::command(async)]
pub fn check_character_contribution(
    profile: crate::modules::characters::CharacterProfile,
) -> Vec<crate::modules::contribution::Finding> {
    crate::modules::contribution::check_character(&profile)
}

/// What the hub needs of a story, before it is contributed.
#[tauri::command(async)]
pub fn check_story_contribution(
    scene_id: String,
) -> Result<Vec<crate::modules::contribution::Finding>, String> {
    let state = crate::modules::stage::load_scene_by_id(&scene_id)?;
    Ok(crate::modules::contribution::check_story(&state.definition))
}

/// Writes the contribution package of a character to `target_path` (a ZIP); the result has the
/// address of the prefilled issue.
#[tauri::command(async)]
pub fn export_character_contribution(
    profile: crate::modules::characters::CharacterProfile,
    info: crate::modules::contribution::SubmissionInfo,
    target_path: String,
) -> Result<crate::modules::contribution::ContributionResult, String> {
    use crate::modules::contribution::{Kind, character_files, check_character, prepare};
    let findings = check_character(&profile);
    let files = character_files(&profile, &info)?;
    let (bytes, result) = prepare(
        Kind::Character,
        &profile.card.data.name,
        &info,
        &findings,
        files,
    )?;
    std::fs::write(&target_path, bytes).map_err(|e| e.to_string())?;
    Ok(result)
}

/// Writes the contribution package of a story to `target_path` (a ZIP).
#[tauri::command(async)]
pub fn export_story_contribution(
    scene_id: String,
    info: crate::modules::contribution::SubmissionInfo,
    target_path: String,
) -> Result<crate::modules::contribution::ContributionResult, String> {
    use crate::modules::contribution::{Kind, check_story, prepare, story_files};
    let state = crate::modules::stage::load_scene_by_id(&scene_id)?;
    let findings = check_story(&state.definition);
    let files = story_files(&state.definition, &info)?;
    let (bytes, result) = prepare(
        Kind::Story,
        &state.definition.title,
        &info,
        &findings,
        files,
    )?;
    std::fs::write(&target_path, bytes).map_err(|e| e.to_string())?;
    Ok(result)
}
