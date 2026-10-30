//! Live2D and Inochi2D models, avatar library and emotion classification.

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
pub fn scan_inochi2d_models() -> Vec<crate::modules::inochi2d::ScannedInochi2d> {
    crate::modules::inochi2d::scan_inochi2d_models()
}

#[tauri::command]
pub fn get_inochi2d_catalog(
    lang: Option<String>,
) -> Vec<crate::modules::inochi2d::Inochi2dCatalogItem> {
    crate::modules::inochi2d::catalog(lang.as_deref().unwrap_or("en"))
}

/// Whether the models for speaking portraits are there.
#[tauri::command]
pub fn talking_portrait_status() -> crate::modules::talking_portrait::TalkingPortraitStatus {
    crate::modules::talking_portrait::status()
}

/// Loads the models for speaking portraits (progress as `talking-portrait-download`).
#[tauri::command]
pub async fn download_talking_portrait_models(
    app: tauri::AppHandle,
) -> Result<crate::modules::talking_portrait::TalkingPortraitStatus, String> {
    crate::modules::talking_portrait::download_models(app).await
}

#[tauri::command]
pub fn get_talking_portrait_placement(
    character_id: String,
) -> Option<crate::modules::talking_portrait::HeadPlacement> {
    crate::modules::talking_portrait::placement(&character_id)
}

#[tauri::command]
pub fn set_talking_portrait_placement(
    character_id: String,
    placement: Option<crate::modules::talking_portrait::HeadPlacement>,
) -> Result<(), String> {
    crate::modules::talking_portrait::set_placement(&character_id, placement)
}

/// A first guess where the head of a picture is (base64 picture).
#[tauri::command]
pub async fn guess_talking_portrait_placement(
    image: String,
) -> Result<crate::modules::talking_portrait::HeadPlacement, String> {
    let bytes = picture_bytes(&image).await?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::modules::talking_portrait::guess_placement(&bytes)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// The mouth-shape frames of a picture (made once on the CPU, then cached), optionally with the
/// face of an emotion (VRM expression) for pictures without their own emotion picture.
#[tauri::command]
pub async fn prepare_talking_portrait(
    image: String,
    placement: crate::modules::talking_portrait::HeadPlacement,
    emotion: Option<String>,
) -> Result<crate::modules::talking_portrait::TalkingSet, String> {
    let bytes = picture_bytes(&image).await?;
    tauri::async_runtime::spawn_blocking(move || {
        crate::modules::talking_portrait::prepare(&bytes, &placement, emotion.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// A picture: base64 (optionally a data URL) or an https address (hub pictures; the window's
/// content security policy lets it show them but not read their bytes).
async fn picture_bytes(image: &str) -> Result<Vec<u8>, String> {
    if !image.starts_with("https://") {
        return decode_picture(image);
    }
    const MAX_BYTES: usize = 25 * 1024 * 1024;
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
    let bytes = client
        .get(image)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?
        .bytes()
        .await
        .map_err(|e| crate::err!("backend.common.downloadRead", error = e))?;
    if bytes.len() > MAX_BYTES {
        return Err(crate::err!(
            "backend.talkingPortrait.image",
            error = "too large"
        ));
    }
    Ok(bytes.to_vec())
}

/// A picture sent as base64, optionally as data URL.
fn decode_picture(image: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    let data = image.split_once(";base64,").map_or(image, |(_, rest)| rest);
    base64::engine::general_purpose::STANDARD
        .decode(data.trim())
        .map_err(|e| crate::err!("backend.talkingPortrait.image", error = e))
}

/// VRM and Live2D models the hub offers (registry from the data repository).
#[tauri::command]
pub fn get_hub_avatars(lang: String) -> Vec<crate::modules::avatar_hub::HubAvatar> {
    crate::modules::avatar_hub::catalog(&lang)
}

/// Downloads a hub avatar into the user's folder (SHA-256 checked); returns the file to open.
#[tauri::command]
pub async fn download_hub_avatar(
    avatar_id: String,
) -> Result<crate::modules::avatar_hub::HubAvatarInstalled, String> {
    crate::modules::avatar_hub::download_hub_avatar(&avatar_id).await
}

/// Ready-made motion sets for 3D avatars (registry from the data repository).
#[tauri::command]
pub fn get_motion_packs(lang: String) -> Vec<crate::modules::motion_packs::MotionPackItem> {
    crate::modules::motion_packs::catalog(&lang)
}

/// Downloads a motion set into the animations folder (SHA-256 checked) and gives it its uses.
#[tauri::command]
pub async fn download_motion_pack(
    pack_id: String,
) -> Result<Vec<crate::modules::avatar_motions::AvatarMotion>, String> {
    crate::modules::motion_packs::download_motion_pack(&pack_id).await
}

#[tauri::command]
pub async fn download_inochi2d_model(
    model_id: String,
) -> Result<crate::modules::inochi2d::ScannedInochi2d, String> {
    crate::modules::inochi2d::download_inochi2d_model(&model_id).await
}

/// Imports an Inochi2D puppet (`.inp`, `.inx` or a ZIP with one); file access stays off the main thread.
#[tauri::command]
pub async fn import_inochi2d_model(
    source_path: String,
) -> Result<crate::modules::inochi2d::ScannedInochi2d, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::modules::inochi2d::import_inochi2d_model(&source_path)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Hand-made channel and emotion settings of an Inochi2D puppet.
#[tauri::command]
pub fn get_inochi2d_mapping(model_path: String) -> crate::modules::inochi2d::Inochi2dMapping {
    let data_dir = std::path::PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir);
    let key = crate::modules::inochi2d::puppet_key(std::path::Path::new(&model_path));
    crate::modules::inochi2d::mapping_for(&data_dir, &key)
}

#[tauri::command]
pub fn set_inochi2d_mapping(
    model_path: String,
    mapping: crate::modules::inochi2d::Inochi2dMapping,
) -> Result<(), String> {
    let data_dir = std::path::PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir);
    let key = crate::modules::inochi2d::puppet_key(std::path::Path::new(&model_path));
    crate::modules::inochi2d::set_mapping(&data_dir, &key, mapping)
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
/// model by its folder, an Inochi2D puppet by its file below the puppet folders.
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
        AvatarKind::Inochi2d => key_for(path, &crate::modules::inochi2d::inochi2d_roots()),
    }
}

/// Gives an avatar (`kind` = `vrm`, `live2d` or `inochi2d`) an own name; an empty name restores the original.
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
