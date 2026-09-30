//! Profile backups, image generation, Discord and the mobile web server.

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn create_profile_backup(
    selection: crate::modules::profile_backup::BackupGroupSelection,
    description: Option<String>,
) -> Result<crate::modules::profile_backup::BackupEntryInfo, String> {
    crate::modules::profile_backup::ProfileBackupManager::create_backup(
        selection,
        description,
        false,
    )
}

#[tauri::command]
pub fn list_profile_backups() -> Result<Vec<crate::modules::profile_backup::BackupEntryInfo>, String>
{
    Ok(crate::modules::profile_backup::ProfileBackupManager::list_backups())
}

#[tauri::command]
pub fn restore_profile_backup(
    filename: String,
    groups: Option<crate::modules::profile_backup::BackupGroupSelection>,
) -> Result<String, String> {
    crate::modules::profile_backup::ProfileBackupManager::restore_backup(&filename, groups)
}

#[tauri::command]
pub fn delete_profile_backup(filename: String) -> Result<bool, String> {
    crate::modules::profile_backup::ProfileBackupManager::delete_backup(&filename)
}

#[tauri::command]
pub fn get_image_gen_config() -> Result<crate::modules::image_generator::ImageGenConfig, String> {
    Ok(crate::modules::image_generator::ImageGenerator::load_config())
}

#[tauri::command]
pub fn save_image_gen_config(
    config: crate::modules::image_generator::ImageGenConfig,
) -> Result<(), String> {
    crate::modules::image_generator::ImageGenerator::save_config(&config)
}

#[tauri::command]
pub fn build_character_image_prompt(
    character_name: String,
    character_description: Option<String>,
    emotion: Option<String>,
    scene_context: Option<String>,
    user_prompt: Option<String>,
) -> Result<String, String> {
    Ok(
        crate::modules::image_generator::ImageGenerator::build_character_prompt(
            &character_name,
            character_description.as_deref(),
            emotion.as_deref(),
            scene_context.as_deref(),
            user_prompt.as_deref(),
        ),
    )
}

#[tauri::command]
pub async fn generate_image_action(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    prompt: String,
    negative: Option<String>,
    custom_config: Option<crate::modules::image_generator::ImageGenConfig>,
) -> Result<crate::modules::image_generator::GeneratedImageResult, String> {
    crate::modules::image_generator::ImageGenerator::generate_image(
        &prompt,
        negative.as_deref(),
        custom_config,
        Some(crate::modules::image_generator::LocalBackend {
            app: &app,
            engine: &state.local_image,
            llama: state.llama_manager.clone(),
        }),
    )
    .await
}

#[tauri::command]
pub async fn write_image_prompt(
    state: State<'_, AppState>,
    request: crate::modules::image_generator::ImagePromptRequest,
) -> Result<String, String> {
    crate::modules::image_generator::ImageGenerator::write_image_prompt(
        &state.inference_client,
        request,
    )
    .await
}

#[tauri::command]
pub fn save_stage_background(file_path: String) -> Result<String, String> {
    crate::modules::image_generator::ImageGenerator::save_stage_background(&file_path)
}

#[tauri::command]
pub fn list_image_models() -> Vec<crate::modules::local_image::ImageModelInfo> {
    crate::modules::local_image::list_models()
}

#[tauri::command]
pub async fn download_image_model(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    crate::modules::local_image::download_model(&app, &model_id).await
}

#[tauri::command]
pub fn cancel_image_model_download() {
    crate::modules::local_image::cancel_download();
}

#[tauri::command]
pub async fn delete_image_model(
    state: State<'_, AppState>,
    model_id: String,
) -> Result<(), String> {
    if state.local_image.loaded_model().await.as_deref() == Some(model_id.as_str()) {
        state.local_image.stop().await;
    }
    crate::modules::local_image::delete_model(&model_id)
}

#[tauri::command]
pub async fn stop_local_image_server(state: State<'_, AppState>) -> Result<(), String> {
    state.local_image.stop().await;
    Ok(())
}

#[tauri::command]
pub fn list_generated_images()
-> Result<Vec<crate::modules::image_generator::GeneratedImageInfo>, String> {
    Ok(crate::modules::image_generator::ImageGenerator::list_generated_images())
}

#[tauri::command]
pub fn set_discord_rpc_enabled(state: State<'_, AppState>, enabled: bool) -> Result<(), String> {
    state.discord_rpc.set_enabled(enabled);
    Ok(())
}

#[tauri::command]
pub fn get_discord_rpc_enabled(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.discord_rpc.is_enabled())
}

#[tauri::command]
pub async fn update_discord_rpc_activity(
    state: State<'_, AppState>,
    activity: crate::modules::discord::DiscordRpcActivity,
) -> Result<(), String> {
    state.discord_rpc.update_activity(activity).await;
    Ok(())
}

#[tauri::command]
pub async fn get_discord_bot_config(
    _state: State<'_, AppState>,
) -> Result<crate::modules::discord::DiscordBotConfig, String> {
    Ok(crate::modules::discord::DiscordBotManager::load_config())
}

#[tauri::command]
pub async fn save_discord_bot_config(
    state: State<'_, AppState>,
    config: crate::modules::discord::DiscordBotConfig,
) -> Result<(), String> {
    state.discord_bot.save_config(config).await
}

#[tauri::command]
pub async fn start_discord_bot(state: State<'_, AppState>) -> Result<(), String> {
    state.discord_bot.start_bot().await
}

#[tauri::command]
pub async fn stop_discord_bot(state: State<'_, AppState>) -> Result<(), String> {
    state.discord_bot.stop_bot().await
}

#[tauri::command]
pub async fn get_discord_bot_status(
    state: State<'_, AppState>,
) -> Result<crate::modules::discord::DiscordBotStatus, String> {
    Ok(state.discord_bot.get_status().await)
}

#[tauri::command]
pub fn get_web_server_config(
    _state: State<'_, AppState>,
) -> Result<crate::modules::web_server::WebServerConfig, String> {
    Ok(crate::modules::web_server::WebServerManager::load_config())
}

#[tauri::command]
pub async fn save_web_server_config(
    state: State<'_, AppState>,
    config: crate::modules::web_server::WebServerConfig,
) -> Result<(), String> {
    state.web_server.save_config(config).await
}

#[tauri::command]
pub async fn start_web_server(state: State<'_, AppState>) -> Result<(), String> {
    state.web_server.start_server().await
}

#[tauri::command]
pub async fn stop_web_server(state: State<'_, AppState>) -> Result<(), String> {
    state.web_server.stop_server().await
}

#[tauri::command]
pub async fn get_web_server_status(
    state: State<'_, AppState>,
) -> Result<crate::modules::web_server::WebServerStatus, String> {
    Ok(state.web_server.get_status().await)
}

#[tauri::command]
pub async fn regenerate_web_server_token(state: State<'_, AppState>) -> Result<String, String> {
    state.web_server.regenerate_token().await
}

#[tauri::command]
pub fn build_character_wizard_prompt_cmd(
    input: crate::modules::characters::CharacterWizardInput,
) -> Result<String, String> {
    Ok(crate::modules::characters::build_character_wizard_prompt(
        &input,
    ))
}
