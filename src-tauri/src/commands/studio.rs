//! The creative studios' folders (Song Studio, Image Studio) and the Image Studio's generation.

use crate::modules::studio_files::{self, StudioFolder, StudioKind};
use crate::state::AppState;
use tauri::State;

/// The folder a studio saves to and whether it is the default (system music/pictures folder).
#[tauri::command(async)]
pub fn get_studio_folder(kind: StudioKind) -> StudioFolder {
    studio_files::folder(kind)
}

/// Sets a studio's folder; `None` goes back to the default.
#[tauri::command(async)]
pub fn set_studio_folder(kind: StudioKind, path: Option<String>) -> Result<StudioFolder, String> {
    studio_files::set_output_dir(kind, path.as_deref())
}

/// Opens a studio's folder in the file manager.
#[tauri::command(async)]
pub fn open_studio_folder(app: tauri::AppHandle, kind: StudioKind) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = studio_files::prepare_dir(kind)?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| crate::err!("backend.common.openFolder", error = e))
}

/// Deletes a file (and its origin file) from a studio's folder.
#[tauri::command(async)]
pub fn delete_studio_file(kind: StudioKind, file_name: String) -> Result<(), String> {
    studio_files::delete(kind, &file_name)
}

/// Installed local image models with their own settings.
#[tauri::command(async)]
pub fn list_image_studio_models() -> Vec<crate::modules::local_image::ImageStudioModel> {
    crate::modules::local_image::installed_models()
}

/// Images in the Image Studio's folder, newest first.
#[tauri::command(async)]
pub fn list_studio_images() -> Vec<crate::modules::image_studio::StudioImage> {
    crate::modules::image_studio::list()
}

/// Generates the Image Studio's request into its folder; progress goes to
/// `image-studio-progress`. Returns the saved file names.
#[tauri::command]
pub async fn generate_studio_images(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: crate::modules::image_studio::ImageStudioRequest,
) -> Result<Vec<String>, String> {
    crate::modules::image_studio::generate_with_events(
        &app,
        state.llama_manager.clone(),
        &state.local_image,
        &request,
    )
    .await
}

/// Stops an Image Studio batch after the current image.
#[tauri::command]
pub fn cancel_studio_images(state: State<'_, AppState>) {
    state.local_image.cancel_batch();
}
