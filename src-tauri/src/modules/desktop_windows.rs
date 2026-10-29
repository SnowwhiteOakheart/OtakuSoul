//! Top edges of the visible windows on the desktop, for the desktop pet to stand and walk on.
//!
//! Windows come top to bottom (z-order); a window's top edge counts only where no higher
//! window covers that line. Coordinates are physical screen pixels. The scan itself exists on
//! Windows only (`EnumWindows` + DWM frame bounds); elsewhere the pet keeps to the floor.

use serde::Serialize;

/// A walkable stretch of a window's top edge.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    /// The window it belongs to (stays the same while the window lives).
    pub id: String,
    pub left: i32,
    pub right: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WinRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// Stretches narrower than this are left out (nothing to stand on).
const MIN_PLATFORM: i32 = 60;

/// The uncovered stretches of each window's top edge; `windows` top to bottom.
pub fn visible_edges(windows: &[(String, WinRect)]) -> Vec<Platform> {
    let mut platforms = Vec::new();
    for (index, (id, rect)) in windows.iter().enumerate() {
        let y = rect.top;
        let mut spans = vec![(rect.left, rect.right)];
        for (_, above) in &windows[..index] {
            if above.top > y || above.bottom <= y {
                continue;
            }
            spans = spans
                .into_iter()
                .flat_map(|(left, right)| {
                    let mut rest = Vec::with_capacity(2);
                    if above.left > left {
                        rest.push((left, right.min(above.left)));
                    }
                    if above.right < right {
                        rest.push((left.max(above.right), right));
                    }
                    rest
                })
                .filter(|(left, right)| right > left)
                .collect();
            if spans.is_empty() {
                break;
            }
        }
        platforms.extend(
            spans
                .into_iter()
                .filter(|(left, right)| right - left >= MIN_PLATFORM)
                .map(|(left, right)| Platform {
                    id: id.clone(),
                    left,
                    right,
                    y,
                }),
        );
    }
    platforms
}

/// What the desktop is doing that the pet should step back for.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenState {
    /// The window in front fills its whole monitor (game, video, presentation).
    pub fullscreen: bool,
    /// The session is locked (lock screen, user switch, UAC prompt).
    pub locked: bool,
    /// Handle of the window in front (0: none, the pet itself or the shell) - only to notice
    /// that it changed; nothing of its title or content is read.
    pub focus: isize,
}

#[cfg(windows)]
pub fn screen_state(exclude: isize) -> ScreenState {
    ScreenState {
        fullscreen: win::foreground_fullscreen(exclude),
        locked: win::session_locked(),
        focus: win::foreground_handle(exclude),
    }
}

#[cfg(not(windows))]
pub fn screen_state(_exclude: isize) -> ScreenState {
    ScreenState::default()
}

/// Whether the left mouse button is held (the pet sees the end of a system drag at once);
/// `None` where that cannot be read.
#[cfg(windows)]
pub fn primary_button_down() -> Option<bool> {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    // SAFETY: plain query; the high bit means the button is down now.
    Some(unsafe { GetAsyncKeyState(i32::from(VK_LBUTTON.0)) } < 0)
}

#[cfg(not(windows))]
pub fn primary_button_down() -> Option<bool> {
    None
}

/// The platforms of all visible windows except `exclude` (the pet's own window handle).
#[cfg(windows)]
pub fn scan(exclude: isize) -> Vec<Platform> {
    visible_edges(&win::visible_windows(exclude))
}

#[cfg(not(windows))]
pub fn scan(_exclude: isize) -> Vec<Platform> {
    Vec::new()
}

#[cfg(windows)]
mod win {
    use super::WinRect;
    use windows::Win32::Foundation::{HWND, LPARAM, RECT};
    use windows::Win32::Graphics::Dwm::{
        DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GWL_EXSTYLE, GetClassNameW, GetWindowLongPtrW, GetWindowRect,
        GetWindowTextLengthW, IsIconic, IsWindowVisible, WS_EX_NOACTIVATE, WS_EX_TOOLWINDOW,
        WS_EX_TRANSPARENT,
    };

    /// Desktop, taskbars and similar shell windows: never something to stand on.
    const SHELL_CLASSES: &[&str] = &[
        "Progman",
        "WorkerW",
        "Shell_TrayWnd",
        "Shell_SecondaryTrayWnd",
    ];
    /// Tool palettes, and click-through overlays (screen recorders, GPU and app overlays often
    /// lie over the whole screen invisibly): neither is something to stand on or covers anything.
    const SKIPPED_EX_STYLES: u32 = WS_EX_TOOLWINDOW.0 | WS_EX_TRANSPARENT.0 | WS_EX_NOACTIVATE.0;
    /// Smaller windows (tooltips, tiny popups) are skipped.
    const MIN_WIDTH: i32 = 120;
    const MIN_HEIGHT: i32 = 60;

    struct Scan {
        exclude: isize,
        windows: Vec<(String, WinRect)>,
    }

    fn class_name(hwnd: HWND) -> String {
        let mut buffer = [0u16; 64];
        // SAFETY: the buffer outlives the call and its length is passed with it.
        let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
        String::from_utf16_lossy(&buffer[..len.max(0) as usize])
    }

    fn frame(hwnd: HWND) -> Option<WinRect> {
        let mut rect = RECT::default();
        // SAFETY: `rect` is a RECT and its size is passed; on failure the plain window rect is used.
        let dwm = unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_EXTENDED_FRAME_BOUNDS,
                (&mut rect as *mut RECT).cast(),
                std::mem::size_of::<RECT>() as u32,
            )
        };
        // SAFETY: as above.
        if dwm.is_err() && unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
            return None;
        }
        Some(WinRect {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
        })
    }

    fn cloaked(hwnd: HWND) -> bool {
        let mut value = 0u32;
        // SAFETY: `value` is the u32 the attribute is documented to write.
        let ok = unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED,
                (&mut value as *mut u32).cast(),
                std::mem::size_of::<u32>() as u32,
            )
        };
        ok.is_ok() && value != 0
    }

    unsafe extern "system" fn visit(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
        // SAFETY: `lparam` is the `Scan` handed to `EnumWindows` below, alive for the whole call.
        let scan = unsafe { &mut *(lparam.0 as *mut Scan) };
        if hwnd.0 as isize == scan.exclude {
            return true.into();
        }
        // SAFETY: plain queries on a window handle from `EnumWindows`.
        let shown = unsafe { IsWindowVisible(hwnd).as_bool() && !IsIconic(hwnd).as_bool() };
        if !shown || cloaked(hwnd) {
            return true.into();
        }
        // SAFETY: as above.
        let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
        // SAFETY: as above.
        let titled = unsafe { GetWindowTextLengthW(hwnd) } > 0;
        if ex_style & SKIPPED_EX_STYLES != 0
            || !titled
            || SHELL_CLASSES.contains(&class_name(hwnd).as_str())
        {
            return true.into();
        }
        if let Some(rect) = frame(hwnd)
            && rect.right - rect.left >= MIN_WIDTH
            && rect.bottom - rect.top >= MIN_HEIGHT
        {
            scan.windows.push((format!("{:x}", hwnd.0 as usize), rect));
        }
        true.into()
    }

    /// The foreground window covers its whole monitor (taskbar included); a maximised window
    /// leaves the taskbar free and does not count. The desktop itself never counts.
    pub fn foreground_handle(exclude: isize) -> isize {
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        // SAFETY: plain query without arguments.
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_invalid()
            || hwnd.0 as isize == exclude
            || SHELL_CLASSES.contains(&class_name(hwnd).as_str())
        {
            return 0;
        }
        hwnd.0 as isize
    }

    pub fn foreground_fullscreen(exclude: isize) -> bool {
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MONITOR_DEFAULTTONEAREST, MONITORINFO, MonitorFromWindow,
        };
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        // SAFETY: plain query without arguments.
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.is_invalid()
            || hwnd.0 as isize == exclude
            || SHELL_CLASSES.contains(&class_name(hwnd).as_str())
        {
            return false;
        }
        let Some(rect) = frame(hwnd) else {
            return false;
        };
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        // SAFETY: `info` is a MONITORINFO with its size set, as the call requires.
        let found = unsafe {
            let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            GetMonitorInfoW(monitor, &mut info).as_bool()
        };
        let screen = info.rcMonitor;
        found
            && rect.left <= screen.left
            && rect.top <= screen.top
            && rect.right >= screen.right
            && rect.bottom >= screen.bottom
    }

    /// The input desktop cannot be opened while the session is locked (secure desktop).
    pub fn session_locked() -> bool {
        use windows::Win32::System::StationsAndDesktops::{
            CloseDesktop, DESKTOP_CONTROL_FLAGS, DESKTOP_SWITCHDESKTOP, OpenInputDesktop,
        };
        // SAFETY: the handle is closed right away; nothing else uses it.
        unsafe {
            match OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_SWITCHDESKTOP) {
                Ok(desktop) => {
                    let _ = CloseDesktop(desktop);
                    false
                }
                Err(_) => true,
            }
        }
    }

    /// Visible, normal top-level windows, top to bottom.
    pub fn visible_windows(exclude: isize) -> Vec<(String, WinRect)> {
        let mut scan = Scan {
            exclude,
            windows: Vec::new(),
        };
        // SAFETY: `visit` only touches `scan` through the pointer, during this call.
        let _ = unsafe { EnumWindows(Some(visit), LPARAM(&mut scan as *mut Scan as isize)) };
        scan.windows
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(left: i32, top: i32, right: i32, bottom: i32) -> WinRect {
        WinRect {
            left,
            top,
            right,
            bottom,
        }
    }

    #[test]
    fn a_free_window_is_one_platform() {
        let edges = visible_edges(&[("a".into(), rect(100, 200, 900, 700))]);
        assert_eq!(
            edges,
            vec![Platform {
                id: "a".into(),
                left: 100,
                right: 900,
                y: 200
            }]
        );
    }

    #[test]
    fn a_higher_window_cuts_the_edge_below() {
        let edges = visible_edges(&[
            ("top".into(), rect(400, 100, 600, 500)),
            ("below".into(), rect(100, 200, 900, 700)),
        ]);
        let below: Vec<_> = edges.iter().filter(|p| p.id == "below").collect();
        assert_eq!(below.len(), 2);
        assert_eq!((below[0].left, below[0].right), (100, 400));
        assert_eq!((below[1].left, below[1].right), (600, 900));
    }

    #[test]
    fn a_window_that_only_touches_the_line_does_not_cover_it() {
        let edges = visible_edges(&[
            ("above".into(), rect(100, 0, 900, 200)),
            ("below".into(), rect(100, 200, 900, 700)),
        ]);
        assert!(
            edges
                .iter()
                .any(|p| p.id == "below" && p.left == 100 && p.right == 900)
        );
    }

    #[test]
    fn a_fully_covered_or_narrow_edge_is_left_out() {
        let edges = visible_edges(&[
            ("cover".into(), rect(0, 0, 1000, 1000)),
            ("hidden".into(), rect(100, 200, 900, 700)),
        ]);
        assert!(edges.iter().all(|p| p.id != "hidden"));
        let narrow = visible_edges(&[
            ("top".into(), rect(130, 100, 900, 500)),
            ("below".into(), rect(100, 200, 900, 700)),
        ]);
        assert!(narrow.iter().all(|p| p.id != "below"));
    }
}

#[cfg(all(test, windows))]
mod live {
    /// Prints what the scan sees on this machine (`cargo test scan_prints -- --ignored --nocapture`).
    #[test]
    #[ignore]
    fn scan_prints_the_desktop() {
        for window in super::win::visible_windows(0) {
            println!("{window:?}");
        }
        for platform in super::scan(0) {
            println!("{platform:?}");
        }
    }
}
