//! Live2D models and emotion classification.

#[tauri::command]
pub fn scan_live2d_models() -> Vec<crate::modules::live2d::ScannedLive2d> {
    crate::modules::live2d::scan_available_live2d_models()
}

#[tauri::command]
pub fn get_live2d_catalog() -> Vec<crate::modules::live2d::Live2dCatalogItem> {
    crate::modules::live2d::get_live2d_catalog()
}

#[tauri::command]
pub async fn download_live2d_model(model_id: String) -> Result<String, String> {
    crate::modules::live2d::download_live2d_model(&model_id).await
}

/// Async so the first call (loading the cue words) does not hold up the main thread.
#[tauri::command]
pub async fn classify_text_emotion(text: String) -> crate::modules::emotions::EmotionResult {
    crate::modules::emotions::classify_emotion(&text)
}

#[tauri::command]
pub fn import_live2d_model(
    source_path: String,
) -> Result<crate::modules::live2d::ScannedLive2d, String> {
    crate::modules::live2d::import_live2d_model(&source_path)
}

#[tauri::command]
pub fn scan_avatar_motions() -> Vec<crate::modules::avatar_motions::AvatarMotion> {
    crate::modules::avatar_motions::scan_avatar_motions()
}

#[tauri::command]
pub fn import_avatar_motion(
    source_path: String,
) -> Result<crate::modules::avatar_motions::AvatarMotion, String> {
    crate::modules::avatar_motions::import_avatar_motion(&source_path)
}

#[tauri::command]
pub fn set_avatar_motion_role(file: String, role: String) -> Result<(), String> {
    crate::modules::avatar_motions::set_avatar_motion_role(&file, &role)
}

#[tauri::command]
pub fn list_model_clips(
    model_path: String,
) -> Result<Vec<crate::modules::avatar_motions::ModelClip>, String> {
    crate::modules::avatar_motions::model_clips(&model_path)
}

#[tauri::command]
pub fn set_model_clip_role(model_path: String, clip: String, role: String) -> Result<(), String> {
    crate::modules::avatar_motions::set_model_clip_role(&model_path, &clip, &role)
}

#[tauri::command]
pub fn set_model_clip_mood(model_path: String, clip: String, mood: String) -> Result<(), String> {
    crate::modules::avatar_motions::set_model_clip_mood(&model_path, &clip, &mood)
}

#[tauri::command]
pub fn set_avatar_motion_mood(file: String, mood: String) -> Result<(), String> {
    crate::modules::avatar_motions::set_avatar_motion_mood(&file, &mood)
}

#[tauri::command]
pub fn get_model_face(
    model_path: String,
) -> Result<crate::modules::avatar_motions::ModelFaceInfo, String> {
    crate::modules::avatar_motions::model_face(&model_path)
}

#[tauri::command]
pub fn set_model_face(
    model_path: String,
    face: crate::modules::avatar_motions::ModelFace,
) -> Result<(), String> {
    crate::modules::avatar_motions::set_model_face(&model_path, face)
}

#[tauri::command]
pub fn delete_avatar_motion(file: String) -> Result<(), String> {
    crate::modules::avatar_motions::delete_avatar_motion(&file)
}

/// Key of an avatar in the name list: a 3D model by its path below the avatar folders, a Live2D
/// model by its folder.
fn avatar_key(kind: crate::modules::avatar_library::AvatarKind, path: &str) -> String {
    use crate::modules::avatar_library::{AvatarKind, key_for};
    let path = std::path::Path::new(path);
    match kind {
        AvatarKind::Vrm => key_for(path, &crate::modules::paths::avatar_roots()),
        AvatarKind::Live2d => path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
    }
}

/// Gives an avatar (`kind` = `vrm` or `live2d`) an own name; an empty name restores the original.
#[tauri::command]
pub fn rename_avatar(kind: String, path: String, name: String) -> Result<(), String> {
    let kind = crate::modules::avatar_library::AvatarKind::parse(&kind)?;
    let data_dir = std::path::PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir);
    crate::modules::avatar_library::rename(&data_dir, kind, &avatar_key(kind, &path), &name)
}

/// Stores the preview picture the avatar manager took of a model (`data_url`: WebP or PNG).
#[tauri::command]
pub fn save_avatar_thumbnail(
    kind: String,
    path: String,
    data_url: String,
) -> Result<String, String> {
    let kind = crate::modules::avatar_library::AvatarKind::parse(&kind)?;
    let data_dir = std::path::PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir);
    crate::modules::avatar_library::save_thumbnail(
        &data_dir,
        kind,
        &avatar_key(kind, &path),
        &data_url,
    )
}

/// Moves an imported avatar with its folder to the app's trash.
#[tauri::command]
pub fn delete_avatar(kind: String, path: String) -> Result<(), String> {
    let kind = crate::modules::avatar_library::AvatarKind::parse(&kind)?;
    let paths = crate::modules::paths::resolve_app_paths();
    crate::modules::avatar_library::remove(
        std::path::Path::new(&paths.data_dir),
        std::path::Path::new(&paths.trash_dir),
        kind,
        std::path::Path::new(&path),
        &avatar_key(kind, &path),
    )
    .map(|_| ())
}
