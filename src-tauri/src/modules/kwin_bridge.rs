//! KDE Wayland: what the desktop pet cannot see itself, read by a KWin script (`kwin_pet.js`).
//!
//! Under Wayland the pet (an XWayland window) sees neither the pointer over other programs nor
//! the other windows, and KWin's X11 view of the active window is stale. While the pet is open
//! the app loads a small script into KWin; it reports pointer, active window and window
//! geometry back to a D-Bus service of this process. Only calls from KWin itself are taken.
//! KWin reports logical pixels; they are handed out in the pet window's physical pixels
//! (times its scale factor, `set_scale`), like the rest of the pet physics.

use crate::modules::desktop_windows::WinRect;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Without a message for this long the script counts as gone (it says something every 2 s).
const ALIVE: Duration = Duration::from_secs(5);

#[derive(Default)]
struct Seen {
    cursor: Option<(f64, f64)>,
    fullscreen: bool,
    focus: String,
    windows: Vec<(String, WinRect)>,
    at: Option<Instant>,
}

static SEEN: Mutex<Option<Seen>> = Mutex::new(None);

/// Scale factor of the pet window (as f64 bits), kept current by the pointer watch.
static SCALE: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0x3FF0_0000_0000_0000);

pub fn set_scale(scale: f64) {
    if scale.is_finite() && scale > 0.0 {
        SCALE.store(scale.to_bits(), std::sync::atomic::Ordering::Relaxed);
    }
}

fn scale() -> f64 {
    f64::from_bits(SCALE.load(std::sync::atomic::Ordering::Relaxed))
}

fn update(change: impl FnOnce(&mut Seen)) {
    if let Ok(mut guard) = SEEN.lock() {
        let seen = guard.get_or_insert_with(Seen::default);
        change(seen);
        seen.at = Some(Instant::now());
    }
}

fn read<T>(get: impl FnOnce(&Seen) -> T) -> Option<T> {
    let guard = SEEN.lock().ok()?;
    let seen = guard.as_ref()?;
    seen.at
        .is_some_and(|at| at.elapsed() < ALIVE)
        .then(|| get(seen))
}

/// The script runs and reports.
pub fn alive() -> bool {
    read(|_| ()).is_some()
}

/// Global pointer in physical pixels.
pub fn cursor() -> Option<(f64, f64)> {
    let factor = scale();
    read(|seen| seen.cursor)
        .flatten()
        .map(|(x, y)| (x * factor, y * factor))
}

/// Active window fullscreen, and an id for it (changes when another window comes to the front).
pub fn screen() -> Option<(bool, isize)> {
    read(|seen| {
        use std::hash::{Hash, Hasher};
        if seen.focus.is_empty() {
            return (seen.fullscreen, 0);
        }
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        seen.focus.hash(&mut hasher);
        (seen.fullscreen, (hasher.finish() as isize) | 1)
    })
}

/// Normal windows top to bottom, in physical pixels.
pub fn windows() -> Option<Vec<(String, WinRect)>> {
    let factor = scale();
    let at = |value: i32| (f64::from(value) * factor).round() as i32;
    read(|seen| {
        seen.windows
            .iter()
            .map(|(id, rect)| {
                (
                    id.clone(),
                    WinRect {
                        left: at(rect.left),
                        top: at(rect.top),
                        right: at(rect.right),
                        bottom: at(rect.bottom),
                    },
                )
            })
            .collect()
    })
}

/// Receives the script's calls; each argument is JSON (numbers from KWin's JavaScript would
/// otherwise arrive as doubles or ints, depending on the value).
struct Sink {
    /// Unique bus name of KWin: calls from anyone else are dropped.
    kwin: String,
}

impl Sink {
    fn sent_by_kwin(&self, header: &zbus::message::Header<'_>) -> bool {
        header
            .sender()
            .is_some_and(|sender| sender.as_str() == self.kwin)
    }
}

#[zbus::interface(name = "org.otakusoul.Pet")]
impl Sink {
    fn cursor(&self, #[zbus(header)] header: zbus::message::Header<'_>, json: String) {
        if !self.sent_by_kwin(&header) {
            return;
        }
        if let Ok([x, y]) = serde_json::from_str::<[f64; 2]>(&json) {
            update(|seen| seen.cursor = Some((x, y)));
        }
    }

    fn screen(&self, #[zbus(header)] header: zbus::message::Header<'_>, json: String) {
        if !self.sent_by_kwin(&header) {
            return;
        }
        if let Ok((fullscreen, focus)) = serde_json::from_str::<(bool, String)>(&json) {
            update(|seen| {
                seen.fullscreen = fullscreen;
                seen.focus = focus;
            });
        }
    }

    fn windows(&self, #[zbus(header)] header: zbus::message::Header<'_>, json: String) {
        if !self.sent_by_kwin(&header) {
            return;
        }
        let Ok(list) = serde_json::from_str::<Vec<(String, i32, i32, i32, i32)>>(&json) else {
            return;
        };
        let windows = list
            .into_iter()
            .map(|(id, x, y, w, h)| {
                (
                    id,
                    WinRect {
                        left: x,
                        top: y,
                        right: x + w,
                        bottom: y + h,
                    },
                )
            })
            .collect();
        update(|seen| seen.windows = windows);
    }
}

const KWIN: &str = "org.kde.KWin";

/// D-Bus name of this app instance (an E2E run and the real app may run side by side).
fn service() -> String {
    format!("org.otakusoul.Pet.p{}", std::process::id())
}

fn plugin_name() -> String {
    format!("otakusoul_pet_{}", std::process::id())
}

/// The connection that serves `Sink`; opened once, kept for the life of the process.
static BUS: OnceLock<Option<zbus::blocking::Connection>> = OnceLock::new();

fn bus() -> Option<&'static zbus::blocking::Connection> {
    BUS.get_or_init(|| {
        let probe = zbus::blocking::Connection::session().ok()?;
        let kwin = zbus::blocking::fdo::DBusProxy::new(&probe)
            .ok()?
            .get_name_owner(KWIN.try_into().ok()?)
            .ok()?
            .to_string();
        let connection = zbus::blocking::connection::Builder::session()
            .ok()?
            .name(service())
            .ok()?
            .serve_at("/Pet", Sink { kwin })
            .ok()?
            .build();
        match connection {
            Ok(connection) => Some(connection),
            Err(e) => {
                tracing::warn!("D-Bus-Dienst für das Desktop-Pet nicht verfügbar: {e}");
                None
            }
        }
    })
    .as_ref()
}

fn scripting(
    bus: &zbus::blocking::Connection,
    path: &str,
    interface: &str,
    method: &str,
    body: &(impl serde::Serialize + zbus::zvariant::DynamicType),
) -> zbus::Result<zbus::Message> {
    bus.call_method(Some(KWIN), path, Some(interface), method, body)
}

/// Loads and starts the script in KWin (KDE Wayland only). False: not available here.
pub fn start() -> bool {
    if !crate::modules::desktop_windows::wayland_session() {
        return false;
    }
    let Some(bus) = bus() else {
        return false;
    };
    let file = crate::modules::paths::base_dirs()
        .1
        .join("kwin")
        .join("otakusoul_pet.js");
    let script = include_str!("kwin_pet.js")
        .replace("%SERVICE%", &service())
        .replace("%PID%", &std::process::id().to_string())
        .replace("%PLUGIN%", &plugin_name());
    if let Some(dir) = file.parent()
        && std::fs::create_dir_all(dir).is_err()
    {
        return false;
    }
    if std::fs::write(&file, script).is_err() {
        return false;
    }
    let name = plugin_name();
    // A script left over from an earlier open of this process.
    let _ = scripting(
        bus,
        "/Scripting",
        "org.kde.kwin.Scripting",
        "unloadScript",
        &name,
    );
    let loaded = scripting(
        bus,
        "/Scripting",
        "org.kde.kwin.Scripting",
        "loadScript",
        &(file.to_string_lossy().as_ref(), name.as_str()),
    )
    .and_then(|reply| reply.body().deserialize::<i32>());
    let id = match loaded {
        Ok(id) if id >= 0 => id,
        Ok(_) | Err(_) => {
            tracing::warn!("KWin-Skript für das Desktop-Pet nicht geladen: {loaded:?}");
            return false;
        }
    };
    let run = scripting(
        bus,
        &format!("/Scripting/Script{id}"),
        "org.kde.kwin.Script",
        "run",
        &(),
    );
    if let Err(e) = run {
        tracing::warn!("KWin-Skript für das Desktop-Pet startet nicht: {e}");
        return false;
    }
    true
}

/// Unloads the script (the pet closed); what it reported no longer counts.
pub fn stop() {
    if let Some(Some(bus)) = BUS.get() {
        let _ = scripting(
            bus,
            "/Scripting",
            "org.kde.kwin.Scripting",
            "unloadScript",
            &plugin_name(),
        );
    }
    if let Ok(mut guard) = SEEN.lock() {
        *guard = None;
    }
}
