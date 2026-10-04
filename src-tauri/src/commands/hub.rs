//! Soul Hub: gateway registries and chub.ai imports.

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
) -> Result<crate::modules::hub::CharacterImportResult, String> {
    crate::modules::hub::import_soul_gateway_character(
        &name,
        &author,
        &download_url,
        overwrite.unwrap_or(false),
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
) -> Result<crate::modules::lorebook::Lorebook, String> {
    crate::modules::hub::import_lorebook_from_gateway(&download_url, &fallback_name).await
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
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::hub::import_scene_from_gateway(&download_url, &fallback_title).await
}
