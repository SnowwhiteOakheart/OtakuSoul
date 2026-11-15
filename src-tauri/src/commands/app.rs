//! Paths, settings, logs, updates and file helpers.

/// Reads a file for the webview as raw bytes (an `ArrayBuffer` there). Avatars and motions run to
/// tens of MB; as a JSON number list they took seconds to send and parse.
/// A VRoid Hub model (`vroid:<id>`) comes decrypted from its encrypted store.
#[tauri::command]
pub async fn read_file_binary(file_path: String) -> Result<tauri::ipc::Response, String> {
    if file_path.starts_with(crate::modules::vroid_hub::PATH_PREFIX) {
        return crate::modules::vroid_hub::model_bytes(&file_path)
            .await
            .map(tauri::ipc::Response::new);
    }
    let path = file_path.clone();
    tokio::task::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|e| {
            crate::err!(
                "backend.common.fileReadPath",
                path = format!("{:?}", file_path),
                error = e
            )
        })?
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

/// Copies a language file chosen by the user into the language folder; returns its id.
#[tauri::command(async)]
pub fn import_ui_language(path: String) -> Result<String, String> {
    crate::modules::ui_locales::import_file(std::path::Path::new(&path))
}

/// Removes the user's own file for a language (into the trash folder).
#[tauri::command]
pub fn remove_ui_language(id: String) -> Result<(), String> {
    crate::modules::ui_locales::remove_user_file(&id)
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

/// Free disk space where models are downloaded to.
#[tauri::command]
pub async fn disk_space() -> crate::modules::hardware::DiskSpace {
    tokio::task::spawn_blocking(crate::modules::hardware::disk_space)
        .await
        .unwrap_or(crate::modules::hardware::DiskSpace {
            models_mb: None,
            data_mb: None,
        })
}

#[tauri::command(async)]
pub fn scan_vision_projectors() -> Vec<crate::modules::paths::ScannedModel> {
    crate::modules::paths::scan_vision_projectors()
}

#[tauri::command(async)]
pub fn scan_loras() -> Vec<crate::modules::paths::ScannedModel> {
    crate::modules::paths::scan_loras()
}

#[tauri::command(async)]
pub fn scan_vrm_models() -> Vec<crate::modules::paths::ScannedVrm> {
    crate::modules::paths::scan_available_vrm_models()
}

#[tauri::command(async)]
pub fn import_vrm_model(source_path: String) -> Result<crate::modules::paths::ScannedVrm, String> {
    crate::modules::paths::import_vrm_model(&source_path)
}

#[tauri::command(async)]
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

#[tauri::command(async)]
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

/// Event for the main window when a chat notification was clicked: `{ charId, chatId }`.
pub const NOTIFICATION_OPEN_CHAT_EVENT: &str = "notification-open-chat";

/// Brings the main window back (also from the tray) and, with a chat target, asks it to open
/// that chat.
#[cfg(any(
    windows,
    all(
        unix,
        not(any(target_os = "macos", target_os = "android", target_os = "ios"))
    )
))]
fn open_chat_from_notification(app: &tauri::AppHandle, target: Option<serde_json::Value>) {
    use tauri::{Emitter, Manager};
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    if let Some(target) = target {
        let _ = app.emit_to("main", NOTIFICATION_OPEN_CHAT_EVENT, target);
    }
}

/// The chat a clicked notification belongs to, from the `extra` fields `notify_chat` sets.
#[cfg_attr(
    not(all(
        unix,
        not(any(target_os = "macos", target_os = "android", target_os = "ios"))
    )),
    allow(dead_code)
)]
fn chat_target(
    extra: &std::collections::HashMap<String, serde_json::Value>,
) -> Option<serde_json::Value> {
    let char_id = extra.get("charId")?.as_str()?;
    let chat_id = extra.get("chatId")?.as_str()?;
    Some(serde_json::json!({ "charId": char_id, "chatId": chat_id }))
}

/// Linux and the BSDs: the notification plugin reports a click over D-Bus once a handler exists.
/// A click on a chat notification opens that chat, on any other one the main window comes back.
/// Called once from `setup`.
#[cfg(all(
    unix,
    not(any(target_os = "macos", target_os = "android", target_os = "ios"))
))]
pub fn register_notification_click(app: &tauri::AppHandle) {
    use tauri_plugin_notification::NotificationExt;
    let handle = app.clone();
    let _ = app.notification().on_action(move |performed| {
        if performed.action_id() != "tap" {
            return;
        }
        let target = performed
            .notification()
            .and_then(|n| chat_target(n.extra()));
        // The handler runs on the plugin's signal thread; window calls belong on the main thread.
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || open_chat_from_notification(&app, target));
    });
}

/// Shows a desktop notification for a message in a chat; a click on it brings the main window
/// back (also from the tray) and opens that chat. Windows shows a toast of its own, Linux and the
/// BSDs go through the notification plugin, whose click `register_notification_click` receives.
/// On macOS, and when the notification cannot be shown, `false` lets the webview fall back to the
/// plugin without a click action.
#[tauri::command]
pub fn notify_chat(
    app: tauri::AppHandle,
    title: String,
    body: String,
    char_id: String,
    chat_id: String,
) -> bool {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::Toast;
        let target = serde_json::json!({ "charId": char_id, "chatId": chat_id });
        let handle = app.clone();
        let shown = Toast::new(&notification_app_id(&app))
            .title(&title)
            .text1(&body)
            .on_activated(move |_| {
                open_chat_from_notification(&handle, Some(target.clone()));
                Ok(())
            })
            .show();
        if let Err(e) = &shown {
            tracing::warn!("Benachrichtigung nicht angezeigt: {e}");
        }
        shown.is_ok()
    }
    #[cfg(all(
        unix,
        not(any(target_os = "macos", target_os = "android", target_os = "ios"))
    ))]
    {
        use tauri_plugin_notification::NotificationExt;
        let shown = app
            .notification()
            .builder()
            .title(title)
            .body(body)
            .extra("charId", char_id)
            .extra("chatId", chat_id)
            .show();
        if let Err(e) = &shown {
            tracing::warn!("Benachrichtigung nicht angezeigt: {e}");
        }
        shown.is_ok()
    }
    #[cfg(not(any(
        windows,
        all(
            unix,
            not(any(target_os = "macos", target_os = "android", target_os = "ios"))
        )
    )))]
    {
        let _ = (app, title, body, char_id, chat_id);
        false
    }
}

#[cfg(test)]
mod notification_tests {
    use super::chat_target;
    use std::collections::HashMap;

    #[test]
    fn chat_target_needs_both_ids() {
        let mut extra = HashMap::new();
        extra.insert("charId".to_string(), serde_json::json!("c1"));
        assert_eq!(chat_target(&extra), None);
        extra.insert("chatId".to_string(), serde_json::json!("chat-7"));
        assert_eq!(
            chat_target(&extra),
            Some(serde_json::json!({ "charId": "c1", "chatId": "chat-7" }))
        );
        extra.insert("chatId".to_string(), serde_json::json!(7));
        assert_eq!(chat_target(&extra), None);
    }
}

/// App ID of the toasts: the installed app's own (its Start menu entry carries it), while
/// running from `target/debug|release` the PowerShell one – as `tauri-plugin-notification` does,
/// since Windows drops toasts of an ID without a Start menu entry.
#[cfg(windows)]
fn notification_app_id(app: &tauri::AppHandle) -> String {
    let dev = std::env::current_exe().ok().and_then(|exe| {
        let dir = exe.parent()?.to_path_buf();
        Some(dir.ends_with("target/debug") || dir.ends_with("target/release"))
    });
    if dev.unwrap_or(false) {
        tauri_winrt_notification::Toast::POWERSHELL_APP_ID.to_string()
    } else {
        app.config().identifier.clone()
    }
}

/// Quits the app from the close dialog ("Beenden" instead of keeping it in the tray).
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
