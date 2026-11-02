//! Music generation with ACE-Step (models, generating a story's music, cancelling).

use crate::state::AppState;
use tauri::State;

#[tauri::command(async)]
pub fn list_music_models() -> Vec<crate::modules::music_gen::MusicModelInfo> {
    crate::modules::music_gen::list_models()
}

#[tauri::command]
pub async fn download_music_model(app: tauri::AppHandle, model_id: String) -> Result<(), String> {
    crate::modules::music_gen::download_model(&app, &model_id).await
}

#[tauri::command]
pub fn cancel_music_model_download() {
    crate::modules::music_gen::cancel_download();
}

#[tauri::command(async)]
pub fn delete_music_model(model_id: String) -> Result<(), String> {
    crate::modules::music_gen::delete_model(&model_id)
}

/// Generates the missing tracks of the scene's music plan (`moods`: only these); progress goes
/// to `music-gen-progress`. Returns how many tracks were saved.
#[tauri::command]
pub async fn generate_scene_music(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    definition: crate::modules::stage::SceneDefinition,
    model_id: String,
    moods: Option<Vec<String>>,
) -> Result<u32, String> {
    crate::modules::music_gen::generate_scene(
        &app,
        state.llama_manager.clone(),
        state.local_image.clone(),
        &definition,
        &model_id,
        moods.as_deref(),
    )
    .await
}

#[tauri::command]
pub fn cancel_music_generation() {
    crate::modules::music_gen::engine().cancel();
}
