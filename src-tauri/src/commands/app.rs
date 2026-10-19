//! Paths, settings, logs, updates and file helpers.

/// Reads a file for the webview as raw bytes (an `ArrayBuffer` there). Avatars and motions run to
/// tens of MB; as a JSON number list they took seconds to send and parse.
#[tauri::command]
pub fn read_file_binary(file_path: String) -> Result<tauri::ipc::Response, String> {
    std::fs::read(&file_path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| {
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

/// Interface languages found in the shipped and the user folder (see `ui_locales`).
#[tauri::command]
pub fn list_ui_languages() -> Vec<crate::modules::ui_locales::UiLanguage> {
    crate::modules::ui_locales::available_languages()
}

/// All texts of one interface language; missing keys fall back in the frontend.
#[tauri::command]
pub fn load_ui_language(id: String) -> Result<std::collections::HashMap<String, String>, String> {
    crate::modules::ui_locales::load_language(&id)
        .ok_or_else(|| crate::err!("backend.uiLanguage.notFound", id = id))
}

/// Opens the folder for own translations, with a fresh template to copy, in the file manager.
#[tauri::command]
pub fn open_ui_locales_folder(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let dir = crate::modules::ui_locales::prepare_user_dir()?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| crate::err!("backend.common.openFolder", error = e))
}

#[tauri::command]
pub async fn scan_models() -> Vec<crate::modules::paths::ScannedModel> {
    tokio::task::spawn_blocking(crate::modules::paths::scan_available_models)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub fn scan_vision_projectors() -> Vec<crate::modules::paths::ScannedModel> {
    crate::modules::paths::scan_vision_projectors()
}

#[tauri::command]
pub fn scan_loras() -> Vec<crate::modules::paths::ScannedModel> {
    crate::modules::paths::scan_loras()
}

#[tauri::command]
pub fn scan_vrm_models() -> Vec<crate::modules::paths::ScannedVrm> {
    crate::modules::paths::scan_available_vrm_models()
}

#[tauri::command]
pub fn import_vrm_model(source_path: String) -> Result<crate::modules::paths::ScannedVrm, String> {
    crate::modules::paths::import_vrm_model(&source_path)
}

#[tauri::command]
pub fn list_avatar_model_files(model_path: String) -> Result<Vec<String>, String> {
    crate::modules::avatar_models::list_model_files(
        &model_path,
        &crate::modules::paths::avatar_roots(),
    )
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

/// Writes a warning or error from the frontend (console, uncaught errors) into the app log.
#[tauri::command]
pub fn log_frontend(level: String, message: String) {
    // Cap the size so a runaway object dump cannot bloat the log file.
    let message: String = message.chars().take(4_000).collect();
    match level.as_str() {
        "error" => tracing::error!(target: "frontend", "{}", message),
        _ => tracing::warn!(target: "frontend", "{}", message),
    }
}

/// Hides the main window into the tray (after the first-close hint was confirmed).
#[tauri::command]
pub fn hide_main_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .hide()
        .map_err(|e| crate::err!("backend.app.hideWindow", error = e))
}
