//! Desktop pet: the active 3D avatar in its own transparent, borderless window on the desktop.
//!
//! The window loads `index.html?pet=true`. A click-through window gets no mouse events, so it
//! could not tell when the pointer is back over the avatar; a background thread therefore sends
//! the global pointer position (`pet:cursor`), and the pet decides per frame whether the pixel
//! under it belongs to the avatar.

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

pub const PET_LABEL: &str = "desktop_pet";

/// Pointer polling rate: smooth enough for head tracking, cheap for the main thread.
const CURSOR_INTERVAL: std::time::Duration = std::time::Duration::from_millis(33);

/// Where the pet window last stood and how large it was (remembered by the interface).
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PetPlacement {
    /// Physical screen position of the window's top-left corner.
    pub x: Option<i32>,
    pub y: Option<i32>,
    /// Logical window size.
    pub width: f64,
    pub height: f64,
}

/// Pointer relative to the pet window, in logical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
struct PetCursor {
    x: f64,
    y: f64,
    inside: bool,
}

fn notify_open(app: &AppHandle, open: bool) {
    let _ = app.emit_to("main", "pet:visibility", open);
}

/// Bottom right of the primary work area (above the taskbar / dock).
fn default_position(app: &AppHandle, width: f64, height: f64) -> Option<(i32, i32)> {
    let monitor = app.primary_monitor().ok().flatten()?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let (w, h) = ((width * scale) as i32, (height * scale) as i32);
    let margin = (24.0 * scale) as i32;
    Some((
        area.position.x + area.size.width as i32 - w - margin,
        area.position.y + area.size.height as i32 - h,
    ))
}

/// A remembered position counts only while its top-left part is still on a monitor.
fn position_on_screen(app: &AppHandle, x: i32, y: i32) -> bool {
    let Ok(monitors) = app.available_monitors() else {
        return false;
    };
    monitors.iter().any(|m| {
        let (pos, size) = (m.position(), m.size());
        x + 40 >= pos.x
            && y + 40 >= pos.y
            && x + 40 <= pos.x + size.width as i32
            && y + 40 <= pos.y + size.height as i32
    })
}

fn spawn_cursor_watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<PetCursor> = None;
        loop {
            std::thread::sleep(CURSOR_INTERVAL);
            let Some(window) = app.get_webview_window(PET_LABEL) else {
                break;
            };
            if !window.is_visible().unwrap_or(false) {
                last = None;
                continue;
            }
            let (Ok(cursor), Ok(origin), Ok(size), Ok(scale)) = (
                app.cursor_position(),
                window.inner_position(),
                window.inner_size(),
                window.scale_factor(),
            ) else {
                continue;
            };
            let x = (cursor.x - origin.x as f64) / scale;
            let y = (cursor.y - origin.y as f64) / scale;
            let (w, h) = (size.width as f64 / scale, size.height as f64 / scale);
            let next = PetCursor {
                x,
                y,
                inside: x >= 0.0 && y >= 0.0 && x < w && y < h,
            };
            let moved = last.is_none_or(|prev| {
                (prev.x - next.x).abs() > 0.5
                    || (prev.y - next.y).abs() > 0.5
                    || prev.inside != next.inside
            });
            if moved {
                let _ = window.emit_to(PET_LABEL, "pet:cursor", next);
                last = Some(next);
            }
        }
    });
}

#[tauri::command]
pub async fn toggle_desktop_pet(
    app: AppHandle,
    state: State<'_, AppState>,
    enable: bool,
    placement: Option<PetPlacement>,
) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window(PET_LABEL) {
        if enable {
            let _ = window.show();
        } else {
            // Closed, not hidden: a hidden pet would keep its webview and the model in VRAM.
            let _ = window.destroy();
        }
    } else if enable {
        let (width, height) = placement
            .map(|p| (p.width.clamp(160.0, 900.0), p.height.clamp(220.0, 1200.0)))
            .unwrap_or((300.0, 440.0));
        let remembered = placement
            .and_then(|p| p.x.zip(p.y))
            .filter(|&(x, y)| position_on_screen(&app, x, y));

        let mut builder = tauri::WebviewWindowBuilder::new(
            &app,
            PET_LABEL,
            tauri::WebviewUrl::App("index.html?pet=true".into()),
        )
        .title("OtakuSoul Pet")
        .inner_size(width, height)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .shadow(false)
        // Opening the pet must not take the keyboard from the window the user works in.
        .focused(false);
        // All webviews of one process share the data folder (WebView2 refuses a second one).
        if let Some(home) = crate::modules::paths::isolated_home() {
            builder = builder.data_directory(home.join("webview"));
        }

        let window = builder
            .build()
            .map_err(|e| crate::err!("backend.companion.overlayWindow", error = e))?;
        if let Some((x, y)) = remembered.or_else(|| default_position(&app, width, height)) {
            let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
        }
        let handle = app.clone();
        window.on_window_event(move |event| {
            if let tauri::WindowEvent::Destroyed = event {
                handle
                    .state::<AppState>()
                    .companion_engine
                    .set_overlay_active(false);
                notify_open(&handle, false);
            }
        });
        spawn_cursor_watch(app.clone());
    }
    state.companion_engine.set_overlay_active(enable);
    notify_open(&app, enable);
    Ok(enable)
}

/// "Back to OtakuSoul" from the pet's menu: also brings the main window back from the tray.
#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}
