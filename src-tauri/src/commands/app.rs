//! Paths, settings, logs, updates and file helpers.

#[tauri::command]
pub fn read_file_binary(file_path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&file_path).map_err(|e| {
        crate::err!(
            "backend.common.fileReadPath",
            path = format!("{:?}", file_path),
            error = e
        )
    })
}

#[tauri::command]
pub fn get_app_paths() -> crate::modules::paths::AppPaths {
    crate::modules::paths::resolve_app_paths()
}

/// Opens the folder for additional VRM avatars (e.g. the release avatar pack) in the file manager.
#[tauri::command]
pub fn open_avatar_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = std::path::PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir)
        .join("avatars");
    std::fs::create_dir_all(&dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| crate::err!("backend.common.openFolder", error = e))
}

#[tauri::command]
pub fn scan_models() -> Vec<crate::modules::paths::ScannedModel> {
    crate::modules::paths::scan_available_models()
}

#[tauri::command]
pub fn scan_vrm_models() -> Vec<crate::modules::paths::ScannedVrm> {
    crate::modules::paths::scan_available_vrm_models()
}

#[tauri::command]
pub fn load_settings() -> crate::modules::settings::AppSettings {
    crate::modules::settings::load_app_settings()
}

#[tauri::command]
pub fn save_settings(settings: crate::modules::settings::AppSettings) -> Result<(), String> {
    crate::modules::settings::save_frontend_settings(settings)
}

#[tauri::command]
pub fn clear_app_logs() -> Result<(), String> {
    crate::modules::logger::clear_app_logs()
}

#[tauri::command]
pub fn export_app_logs() -> Result<String, String> {
    crate::modules::logger::export_app_logs()
}

#[tauri::command]
pub async fn check_for_updates() -> Result<crate::modules::updater::UpdateInfo, String> {
    crate::modules::updater::check_for_app_updates().await
}
