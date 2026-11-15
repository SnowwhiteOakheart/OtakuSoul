//! E2E runs in the background (`OTAKUSOUL_E2E_BACKGROUND=1`, set by `e2e/harness.mjs`): the app's
//! windows open behind the others and without taking the focus, so a test suite does not keep
//! popping up over what the user is doing. Under Windows, WebView2 would otherwise treat a
//! covered window as hidden and pause it (no animation frames, timers slowed down), so these runs
//! also switch off its occlusion tracking. Every window of one run gets the same arguments: all
//! webviews of a process share one WebView2 environment and must ask for the same options.

/// Whether this run keeps its windows in the background.
pub fn background() -> bool {
    std::env::var_os("OTAKUSOUL_E2E_BACKGROUND").is_some_and(|v| v == "1")
}

/// WebView2 arguments of a background run: wry's defaults plus no occlusion tracking and no
/// throttling of covered windows.
#[cfg(windows)]
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion \
     --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling";

/// A window of a background run opens without focus (and, under Windows, keeps running while covered).
pub fn prepare<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
) -> tauri::WebviewWindowBuilder<'a, R, M> {
    if !background() {
        return builder;
    }
    // Hidden until `show` puts it behind the others; pets lose their "always on top".
    let builder = builder.focused(false).visible(false).always_on_top(false);
    #[cfg(windows)]
    let builder = builder.additional_browser_args(BROWSER_ARGS);
    builder
}

/// Shows a window; in a background run behind all others and without activating it.
pub fn show<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    #[cfg(windows)]
    if background() {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            HWND_BOTTOM, SW_SHOWNOACTIVATE, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SetWindowPos,
            ShowWindow,
        };
        if let Ok(handle) = window.hwnd() {
            let hwnd = HWND(handle.0);
            // SAFETY: the handle belongs to this live window; both calls only show and reorder it.
            unsafe {
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_BOTTOM),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
                );
            }
            return;
        }
    }
    let _ = window.show();
}
