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
    /// Left mouse button held (Windows); the pet ends a drag and throws on release.
    button: Option<bool>,
    /// Global pointer position (physical px) and when it was read (ms on this thread's
    /// clock): the speed of a throw, measured here rather than from late window events.
    gx: f64,
    gy: f64,
    t: f64,
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
        let clock = std::time::Instant::now();
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
                button: crate::modules::desktop_windows::primary_button_down(),
                gx: cursor.x,
                gy: cursor.y,
                t: clock.elapsed().as_secs_f64() * 1000.0,
            };
            let moved = last.is_none_or(|prev| {
                (prev.x - next.x).abs() > 0.5
                    || (prev.y - next.y).abs() > 0.5
                    || prev.inside != next.inside
                    || prev.button != next.button
                    // While the window is dragged the pointer keeps its place in it.
                    || (prev.gx - next.gx).abs() > 0.5
                    || (prev.gy - next.gy).abs() > 0.5
            });
            if moved {
                let _ = window.emit_to(PET_LABEL, "pet:cursor", next);
                last = Some(next);
            }
        }
    });
}

/// Window edges are read this often: often enough that a pet riding on a dragged window keeps
/// up smoothly (a scan takes about a millisecond, and only changes are sent).
#[cfg(windows)]
const PLATFORM_INTERVAL: std::time::Duration = std::time::Duration::from_millis(100);

/// Sends the top edges of the other windows (`pet:platforms`) and whether a fullscreen window or
/// the lock screen is in front (`pet:screen`) whenever they change.
#[cfg(windows)]
fn spawn_platform_watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<Vec<crate::modules::desktop_windows::Platform>> = None;
        let mut last_screen = crate::modules::desktop_windows::ScreenState::default();
        loop {
            std::thread::sleep(PLATFORM_INTERVAL);
            let Some(window) = app.get_webview_window(PET_LABEL) else {
                break;
            };
            if !window.is_visible().unwrap_or(false) {
                last = None;
                continue;
            }
            let own = window.hwnd().map(|h| h.0 as isize).unwrap_or_default();
            let screen = crate::modules::desktop_windows::screen_state(own);
            if screen != last_screen {
                let _ = window.emit_to(PET_LABEL, "pet:screen", screen);
                last_screen = screen;
            }
            let platforms = crate::modules::desktop_windows::scan(own);
            if last.as_ref() != Some(&platforms) {
                let _ = window.emit_to(PET_LABEL, "pet:platforms", &platforms);
                last = Some(platforms);
            }
        }
    });
}

/// Reads the loudness of the default output while the pet is shown and tells it whether music
/// plays (`pet:music`, bool) and when a beat falls (`pet:beat`).
#[cfg(windows)]
fn spawn_music_watch(app: AppHandle) {
    use crate::modules::desktop_audio::{BeatDetector, Meter};
    std::thread::spawn(move || {
        let mut meter: Option<Meter> = None;
        let mut detector = BeatDetector::default();
        let mut music = false;
        loop {
            let Some(window) = app.get_webview_window(PET_LABEL) else {
                break;
            };
            if !window.is_visible().unwrap_or(false) {
                meter = None;
                std::thread::sleep(std::time::Duration::from_millis(500));
                continue;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
            if meter.is_none() {
                meter = Meter::open();
                if meter.is_none() {
                    // No output device (or none readable): look again later.
                    std::thread::sleep(std::time::Duration::from_secs(5));
                    continue;
                }
            }
            let Some(peak) = meter.as_ref().and_then(Meter::peak) else {
                meter = None;
                continue;
            };
            let sample = detector.push(peak, std::time::Instant::now());
            if let Some(playing) = sample.music {
                music = playing;
                let _ = window.emit_to(PET_LABEL, "pet:music", playing);
            }
            if sample.beat && music {
                let _ = window.emit_to(PET_LABEL, "pet:beat", ());
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
        #[cfg(windows)]
        spawn_platform_watch(app.clone());
        #[cfg(windows)]
        spawn_music_watch(app.clone());
    }
    state.companion_engine.set_overlay_active(enable);
    notify_open(&app, enable);
    Ok(enable)
}

/// Global shortcut for the pet: Ctrl+Alt+Shift+P (Cmd on macOS). Unusual on purpose – a global
/// shortcut takes the keys from every other program, and AltGr+P (= Ctrl+Alt) stays free.
#[cfg(desktop)]
pub const PET_SHORTCUT: &str = "CommandOrControl+Alt+Shift+P";

/// Tray menu or shortcut: the main window toggles the pet, so its remembered state ("open at
/// start") stays in one place.
pub fn request_toggle(app: &AppHandle) {
    let _ = app.emit_to("main", "pet:toggle", ());
}

/// Is the pet window open and shown?
fn pet_shown(app: &AppHandle) -> bool {
    app.get_webview_window(PET_LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

/// "Komm her" from the tray (menu or double click): the open pet comes to the pointer.
pub fn request_come(app: &AppHandle) {
    if pet_shown(app) {
        let _ = app.emit_to(PET_LABEL, "pet:come", ());
    }
}

/// Windows' default double-click time; a single tray click waits this long while the pet is open.
const DOUBLE_CLICK: std::time::Duration = std::time::Duration::from_millis(500);
/// Counts tray clicks: a waiting single click only acts if no other click came meanwhile.
static TRAY_CLICKS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static LAST_DOUBLE_CLICK: std::sync::Mutex<Option<std::time::Instant>> =
    std::sync::Mutex::new(None);

/// Left click on the tray icon (released): brings the main window back. While the pet is open
/// it waits for a possible double click first, so calling the pet does not also pop up the app.
pub fn tray_click(app: &AppHandle) {
    use std::sync::atomic::Ordering;
    let click = TRAY_CLICKS.fetch_add(1, Ordering::SeqCst) + 1;
    // The release that belongs to a double click.
    let after_double = LAST_DOUBLE_CLICK
        .lock()
        .ok()
        .and_then(|last| *last)
        .is_some_and(|at| at.elapsed() < DOUBLE_CLICK);
    if after_double {
        return;
    }
    if !pet_shown(app) {
        show_main_window(app.clone());
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(DOUBLE_CLICK);
        if TRAY_CLICKS.load(Ordering::SeqCst) == click {
            show_main_window(app);
        }
    });
}

/// Double click on the tray icon (Windows): the open pet comes to the pointer.
pub fn tray_double_click(app: &AppHandle) {
    TRAY_CLICKS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    if let Ok(mut last) = LAST_DOUBLE_CLICK.lock() {
        *last = Some(std::time::Instant::now());
    }
    request_come(app);
}

/// File in the config folder with the shortcut the user chose (absent = `PET_SHORTCUT`).
#[cfg(desktop)]
fn shortcut_file() -> std::path::PathBuf {
    crate::modules::paths::base_dirs().0.join("pet_shortcut.txt")
}

/// The shortcut in use: the chosen one, else the default.
#[cfg(desktop)]
fn chosen_shortcut() -> String {
    std::fs::read_to_string(shortcut_file())
        .map(|text| text.trim().to_string())
        .ok()
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| PET_SHORTCUT.to_string())
}

/// A shortcut another program holds already is no reason to fail the start.
#[cfg(desktop)]
pub fn register_shortcut(app: &AppHandle) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let shortcut = chosen_shortcut();
    if let Err(e) = app.global_shortcut().register(shortcut.as_str()) {
        tracing::warn!("Tastenkürzel {shortcut} für das Desktop-Pet nicht belegt: {e}");
    }
}

/// The pet's shortcut for the settings tab.
#[derive(serde::Serialize)]
pub struct PetShortcut {
    pub shortcut: String,
    pub default: String,
    /// Whether the system accepted it at the start (false: another program holds it).
    pub registered: bool,
}

#[cfg(desktop)]
fn shortcut_info(app: &AppHandle) -> PetShortcut {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let shortcut = chosen_shortcut();
    let registered = shortcut
        .parse::<tauri_plugin_global_shortcut::Shortcut>()
        .map(|parsed| app.global_shortcut().is_registered(parsed))
        .unwrap_or(false);
    PetShortcut {
        shortcut,
        default: PET_SHORTCUT.to_string(),
        registered,
    }
}

#[cfg(not(desktop))]
fn shortcut_info(_app: &AppHandle) -> PetShortcut {
    PetShortcut {
        shortcut: String::new(),
        default: String::new(),
        registered: false,
    }
}

#[tauri::command]
pub fn get_pet_shortcut(app: AppHandle) -> PetShortcut {
    shortcut_info(&app)
}

/// Chooses a new shortcut (empty = the default). A combination another program holds, or one
/// that does not parse, is refused and the old one stays.
#[tauri::command]
pub fn set_pet_shortcut(app: AppHandle, shortcut: String) -> Result<PetShortcut, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
        let wanted = match shortcut.trim() {
            "" => PET_SHORTCUT.to_string(),
            text => text.to_string(),
        };
        let parsed: Shortcut = wanted.parse().map_err(|e| format!("{e}"))?;
        let old = chosen_shortcut();
        if old != wanted {
            let manager = app.global_shortcut();
            if let Ok(previous) = old.parse::<Shortcut>() {
                let _ = manager.unregister(previous);
            }
            if let Err(e) = manager.register(parsed) {
                // Back to the old one, which was free a moment ago.
                if let Ok(previous) = old.parse::<Shortcut>() {
                    let _ = manager.register(previous);
                }
                return Err(format!("{e}"));
            }
            let file = shortcut_file();
            if wanted == PET_SHORTCUT {
                let _ = std::fs::remove_file(&file);
            } else {
                if let Some(dir) = file.parent() {
                    let _ = std::fs::create_dir_all(dir);
                }
                std::fs::write(&file, &wanted).map_err(|e| format!("{e}"))?;
            }
        }
    }
    #[cfg(not(desktop))]
    let _ = &shortcut;
    Ok(shortcut_info(&app))
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
