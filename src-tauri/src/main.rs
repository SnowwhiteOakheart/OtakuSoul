// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK compatibility on Linux / NVIDIA
        if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            // SAFETY: runs first thing in main, before Tauri or tokio spawn any threads.
            unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
        }
        // Fallback to XWayland to prevent GDK protocol error 71 with WebKitGTK
        if std::env::var("WAYLAND_DISPLAY").is_ok() && std::env::var("GDK_BACKEND").is_err() {
            // SAFETY: see above, still single-threaded.
            unsafe { std::env::set_var("GDK_BACKEND", "x11") };
        }
    }
    otakusoul_lib::modules::content_lang::load_locales();

    otakusoul_lib::run()
}
