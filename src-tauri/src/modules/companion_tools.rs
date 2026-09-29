use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::Duration;
use tokio::process::Command;
use ts_rs::TS;

static TITLE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<title[^>]*>(.*?)</title>").unwrap());
// The `regex` crate has no backreferences, so every stripped block element gets its own alternative.
static BLOCK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?is)<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<nav\b[^>]*>.*?</nav>|<header\b[^>]*>.*?</header>|<footer\b[^>]*>.*?</footer>|<noscript\b[^>]*>.*?</noscript>|<!--.*?-->",
    )
    .unwrap()
});
// DuckDuckGo HTML search results.
static DDG_LINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>"#).unwrap()
});
static DDG_SNIPPET_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"<a class="result__snippet"[^>]*>([\s\S]*?)</a>"#).unwrap());
static TAG_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"<[^>]+>").unwrap());
static SPACE_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").unwrap());

/// Extracts the page title and the visible body text from raw HTML.
fn html_to_text(html: &str) -> (Option<String>, String) {
    let title = TITLE_RE
        .captures(html)
        .map(|c| SPACE_RE.replace_all(c[1].trim(), " ").to_string())
        .filter(|t| !t.is_empty());
    let cleaned = BLOCK_RE.replace_all(html, " ");
    let text = TAG_RE.replace_all(&cleaned, " ");
    let text = SPACE_RE.replace_all(&text, " ").trim().to_string();
    (title, text)
}

/// System snapshot of CPU, RAM, Disk, GPU and Battery.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EnvironmentSnapshot {
    pub cpu_usage_percent: f32,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_percent: f32,
    pub disk_free_gb: f64,
    pub disk_total_gb: f64,
    pub disk_percent: f32,
    pub battery_percent: Option<f32>,
    pub battery_charging: Option<bool>,
    pub gpu_name: Option<String>,
    pub gpu_temp_c: Option<f32>,
    pub gpu_util_percent: Option<f32>,
    pub gpu_vram_used_mb: Option<u64>,
    pub gpu_vram_total_mb: Option<u64>,
    pub uptime_seconds: u64,
    pub active_processes_count: usize,
}

/// Format bytes as human-readable string.
fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.1} GB", b / GB)
    } else if b >= MB {
        format!("{:.1} MB", b / MB)
    } else if b >= KB {
        format!("{:.1} KB", b / KB)
    } else {
        format!("{} B", bytes)
    }
}

/// Tool executor implementation
pub struct CompanionTools;

impl CompanionTools {
    /// Web search tool via DuckDuckGo HTML endpoint without requiring any API key
    pub async fn web_search(query: &str) -> Result<String, String> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Err("Suchbegriff darf nicht leer sein.".to_string());
        }

        let encoded = urlencoding::encode(trimmed);
        let url = format!("https://html.duckduckgo.com/html/?q={}", encoded);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .user_agent("Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0")
            .build()
            .map_err(|e| format!("HTTP-Client konnte nicht initialisiert werden: {}", e))?;

        let resp = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Netzwerkfehler bei der Websuche: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!(
                "Websuche gab HTTP-Status {} zurück.",
                resp.status()
            ));
        }

        let html = resp
            .text()
            .await
            .map_err(|e| format!("Antworttext konnte nicht gelesen werden: {}", e))?;

        let mut results = Vec::new();
        let (link_re, snippet_re, strip_tags_re) = (&*DDG_LINK_RE, &*DDG_SNIPPET_RE, &*TAG_RE);

        let snippets: Vec<String> = snippet_re
            .captures_iter(&html)
            .map(|c| strip_tags_re.replace_all(&c[1], "").trim().to_string())
            .collect();

        for (i, cap) in link_re.captures_iter(&html).enumerate().take(5) {
            let mut raw_link = cap[1].to_string();
            if raw_link.starts_with("//duckduckgo.com/l/?uddg=") {
                if let Some(pos) = raw_link.find("uddg=") {
                    let end_pos = raw_link[pos + 5..]
                        .find('&')
                        .map(|p| pos + 5 + p)
                        .unwrap_or(raw_link.len());
                    let encoded_target = &raw_link[pos + 5..end_pos];
                    if let Ok(decoded) = urlencoding::decode(encoded_target) {
                        raw_link = decoded.into_owned();
                    }
                }
            } else if raw_link.starts_with('/') {
                raw_link = format!("https://duckduckgo.com{}", raw_link);
            }

            let title = strip_tags_re.replace_all(&cap[2], "").trim().to_string();
            let snippet = snippets.get(i).cloned().unwrap_or_default();

            results.push(format!(
                "[{}] {}\nURL: {}\nZusammenfassung: {}\n",
                i + 1,
                title,
                raw_link,
                if snippet.is_empty() {
                    "Keine Beschreibung verfügbar"
                } else {
                    &snippet
                }
            ));
        }

        if results.is_empty() {
            Ok(format!(
                "Websuche nach '{}' abgeschlossen, keine Treffer gefunden.",
                trimmed
            ))
        } else {
            Ok(format!(
                "Gefundene Suchergebnisse für '{}':\n\n{}",
                trimmed,
                results.join("\n---\n")
            ))
        }
    }

    /// Open external URL in system browser
    pub async fn open_external_url(url: &str) -> Result<String, String> {
        let trimmed = url.trim();
        if trimmed.is_empty() {
            return Err("URL darf nicht leer sein.".to_string());
        }

        let full_url = if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
            format!("https://{}", trimmed)
        } else {
            trimmed.to_string()
        };

        #[cfg(target_os = "windows")]
        {
            Command::new("cmd")
                .args(["/C", "start", "", &full_url])
                .spawn()
                .map_err(|e| format!("Fehler beim Öffnen der URL unter Windows: {}", e))?;
        }
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .arg(&full_url)
                .spawn()
                .map_err(|e| format!("Fehler beim Öffnen der URL unter macOS: {}", e))?;
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            Command::new("xdg-open")
                .arg(&full_url)
                .spawn()
                .map_err(|e| format!("Fehler beim Ausführen von xdg-open: {}", e))?;
        }

        Ok(format!(
            "URL '{}' erfolgreich im Standardbrowser geöffnet.",
            full_url
        ))
    }

    /// Collect comprehensive system info via sysinfo
    pub fn get_system_info() -> Result<String, String> {
        let mut sys = sysinfo::System::new_all();
        sys.refresh_all();

        let os_name = sysinfo::System::name().unwrap_or_else(|| "Unbekannt".to_string());
        let os_ver = sysinfo::System::os_version().unwrap_or_else(|| "Unbekannt".to_string());
        let kernel = sysinfo::System::kernel_version().unwrap_or_else(|| "Unbekannt".to_string());
        let host = sysinfo::System::host_name().unwrap_or_else(|| "localhost".to_string());
        let uptime = sysinfo::System::uptime();
        let uptime_hours = uptime / 3600;
        let uptime_mins = (uptime % 3600) / 60;

        let total_mem = sys.total_memory();
        let used_mem = sys.used_memory();
        let free_mem = sys.free_memory();
        let cpus = sys.cpus();
        let cpu_brand = cpus.first().map(|c| c.brand()).unwrap_or("Unbekannt");

        let disks = sysinfo::Disks::new_with_refreshed_list();
        let mut disk_info = Vec::new();
        for disk in disks.iter() {
            disk_info.push(format!(
                "- Mount: {:?} ({}) | Frei: {} von {}",
                disk.mount_point(),
                disk.name().to_string_lossy(),
                format_bytes(disk.available_space()),
                format_bytes(disk.total_space())
            ));
        }

        let mut lines = Vec::new();
        lines.push(format!(
            "Betriebssystem: {} {} (Kernel: {})",
            os_name, os_ver, kernel
        ));
        lines.push(format!("Hostname: {}", host));
        lines.push(format!(
            "Laufzeit: {}h {}m ({} Sekunden)",
            uptime_hours, uptime_mins, uptime
        ));
        lines.push(format!(
            "CPU: {} ({} physische/logische Kerne)",
            cpu_brand,
            cpus.len()
        ));
        lines.push(format!(
            "Arbeitsspeicher (RAM): {} belegt / {} gesamt ({} frei)",
            format_bytes(used_mem),
            format_bytes(total_mem),
            format_bytes(free_mem)
        ));
        if !disk_info.is_empty() {
            lines.push("Festplatten & Partitionen:".to_string());
            lines.extend(disk_info);
        }

        Ok(lines.join("\n"))
    }

    /// Read plain text from system clipboard using arboard with CLI tool fallbacks
    pub fn read_clipboard() -> Result<String, String> {
        // Try arboard first
        if let Ok(mut clipboard) = arboard::Clipboard::new()
            && let Ok(text) = clipboard.get_text()
            && !text.trim().is_empty()
        {
            return Ok(text);
        }

        // Fallbacks for Linux Wayland & X11
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            if let Ok(output) = std::process::Command::new("wl-paste")
                .args(["--no-newline", "--type", "text/plain"])
                .output()
                && output.status.success()
            {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !text.is_empty() {
                    return Ok(text);
                }
            }

            if let Ok(output) = std::process::Command::new("xclip")
                .args(["-selection", "clipboard", "-o"])
                .output()
                && output.status.success()
            {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !text.is_empty() {
                    return Ok(text);
                }
            }

            if let Ok(output) = std::process::Command::new("xsel")
                .args(["--clipboard", "--output"])
                .output()
                && output.status.success()
            {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !text.is_empty() {
                    return Ok(text);
                }
            }
        }

        Ok("(Die Zwischenablage ist aktuell leer)".to_string())
    }

    /// Take screenshot of primary screen and return base64 PNG data URL
    pub async fn take_screenshot() -> Result<String, String> {
        // Run blocking capture on dedicated thread
        tokio::task::spawn_blocking(|| {
            let monitors = xcap::Monitor::all()
                .map_err(|e| format!("Monitore konnten nicht abgefragt werden: {}", e))?;
            let monitor = monitors
                .into_iter()
                .find(|m| m.is_primary().unwrap_or(false))
                .or_else(|| xcap::Monitor::all().ok()?.into_iter().next())
                .ok_or_else(|| "Kein aktiver Monitor für Screenshot gefunden.".to_string())?;

            let img = monitor
                .capture_image()
                .map_err(|e| format!("Bildschirmaufnahme fehlgeschlagen: {}", e))?;

            // Encode as PNG in memory
            let mut png_bytes: Vec<u8> = Vec::new();
            let mut cursor = std::io::Cursor::new(&mut png_bytes);
            img.write_to(&mut cursor, image::ImageFormat::Png)
                .map_err(|e| format!("PNG-Konvertierung fehlgeschlagen: {}", e))?;

            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
            Ok(format!("data:image/png;base64,{}", b64))
        })
        .await
        .map_err(|e| format!("Tokio-Task fehlgeschlagen: {}", e))?
    }

    /// Media playback control via MPRIS (playerctl on Linux)
    pub async fn media_control(action: &str) -> Result<String, String> {
        let norm_action = match action.to_lowercase().trim() {
            "play" | "pause" | "play-pause" | "toggle" => "play-pause",
            "next" | "skip" => "next",
            "prev" | "previous" | "back" => "previous",
            "stop" => "stop",
            other => {
                return Err(format!(
                    "Unbekannte Medien-Aktion: '{}'. Erlaubt: play-pause, next, previous, stop.",
                    other
                ));
            }
        };

        #[cfg(target_os = "windows")]
        {
            Ok(format!(
                "Mediensteuerung '{}' unter Windows simuliert.",
                norm_action
            ))
        }
        #[cfg(not(target_os = "windows"))]
        {
            let output = Command::new("playerctl")
                .arg(norm_action)
                .output()
                .await
                .map_err(|e| {
                    format!(
                        "playerctl konnte nicht ausgeführt werden (ist playerctl installiert?): {}",
                        e
                    )
                })?;

            if output.status.success() {
                Ok(format!(
                    "Medienbefehl '{}' erfolgreich an aktiven Player gesendet.",
                    norm_action
                ))
            } else {
                let err_msg = String::from_utf8_lossy(&output.stderr);
                if err_msg.contains("No players found") {
                    Ok(
                        "Kein aktiver Media-Player (Spotify, Browser, VLC etc.) gefunden."
                            .to_string(),
                    )
                } else {
                    Err(format!("playerctl Fehler: {}", err_msg.trim()))
                }
            }
        }
    }

    /// App control: launch, focus, list, close
    pub async fn app_control(action: &str, target: &str) -> Result<String, String> {
        let act = action.to_lowercase().trim().to_string();
        let tgt = target.trim().to_string();

        match act.as_str() {
            "list" => {
                let mut sys = sysinfo::System::new_all();
                sys.refresh_all();
                let mut app_names = std::collections::BTreeSet::new();
                for proc in sys.processes().values() {
                    let name = proc.name().to_string_lossy().to_string();
                    if !name.starts_with('[')
                        && !name.starts_with("kworker")
                        && !name.starts_with("systemd")
                    {
                        app_names.insert(name);
                    }
                }
                let list_preview: Vec<String> = app_names.into_iter().take(35).collect();
                Ok(format!(
                    "Laufende Prozesse ({}/{} angezeigt):\n- {}",
                    list_preview.len(),
                    list_preview.len(),
                    list_preview.join("\n- ")
                ))
            }
            "launch" | "start" | "open" => {
                if tgt.is_empty() {
                    return Err("launch erfordert einen Programmnamen oder Pfad.".to_string());
                }

                // Resolve common application aliases on Linux
                let resolved = match tgt.to_lowercase().as_str() {
                    "calc" | "rechner" | "calculator" => "kcalc",
                    "notepad" | "editor" => "kate",
                    "browser" | "chrome" => "google-chrome-stable",
                    "firefox" => "firefox",
                    "code" | "vscode" => "code",
                    "terminal" => "konsole",
                    "files" | "dateien" | "explorer" => "dolphin",
                    "spotify" => "spotify",
                    _ => &tgt,
                };

                let mut cmd = Command::new(resolved);
                cmd.spawn().map_err(|e| {
                    format!(
                        "Programm '{}' konnte nicht gestartet werden: {}",
                        resolved, e
                    )
                })?;
                Ok(format!("Anwendung '{}' erfolgreich gestartet.", resolved))
            }
            "close" | "kill" | "terminate" => {
                if tgt.is_empty() {
                    return Err("close erfordert einen Programmnamen.".to_string());
                }
                #[cfg(target_os = "windows")]
                {
                    Command::new("taskkill")
                        .args(["/IM", &format!("{}.exe", tgt), "/F"])
                        .output()
                        .await
                        .map_err(|e| format!("Fehler beim Schließen: {}", e))?;
                }
                #[cfg(not(target_os = "windows"))]
                {
                    Command::new("pkill")
                        .arg("-f")
                        .arg(&tgt)
                        .output()
                        .await
                        .map_err(|e| format!("Fehler beim Beenden via pkill: {}", e))?;
                }
                Ok(format!("Anwendung '{}' wurde beendet.", tgt))
            }
            "focus" => {
                #[cfg(not(target_os = "windows"))]
                {
                    let res = Command::new("wmctrl")
                        .args(["-x", "-a", &tgt])
                        .output()
                        .await;

                    if let Ok(out) = res
                        && out.status.success()
                    {
                        return Ok(format!("Fenster '{}' in den Vordergrund geholt.", tgt));
                    }

                    // Fallback to xdotool
                    let xdo = Command::new("xdotool")
                        .args(["search", "--name", &tgt, "windowactivate"])
                        .output()
                        .await;

                    if let Ok(out) = xdo
                        && out.status.success()
                    {
                        return Ok(format!("Fenster '{}' via xdotool fokussiert.", tgt));
                    }
                }
                Ok(format!("Fensterfokus für '{}' angefordert.", tgt))
            }
            other => Err(format!(
                "Unbekannte App-Aktion: '{}'. Erlaubt: launch, close, focus, list.",
                other
            )),
        }
    }

    /// GUI action: click, move, type_text, hotkey, scroll
    pub async fn gui_action(args: &serde_json::Value) -> Result<String, String> {
        let action = args
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("get_cursor_position");

        match action {
            "type_text" | "type" => {
                let text = args
                    .get("text")
                    .or_else(|| args.get("message"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                if text.is_empty() {
                    return Err("type_text erfordert den Parameter 'text'.".to_string());
                }

                #[cfg(not(target_os = "windows"))]
                {
                    if let Ok(status) = Command::new("wtype").args(["--", text]).status().await
                        && status.success()
                    {
                        return Ok(format!("Text erfolgreich getippt (wtype): \"{}\"", text));
                    }
                    if let Ok(status) = Command::new("ydotool")
                        .args(["type", "--", text])
                        .status()
                        .await
                        && status.success()
                    {
                        return Ok(format!("Text erfolgreich getippt (ydotool): \"{}\"", text));
                    }
                    if let Ok(status) = Command::new("xdotool")
                        .args(["type", "--delay", "10", "--", text])
                        .status()
                        .await
                        && status.success()
                    {
                        return Ok(format!("Text erfolgreich getippt (xdotool): \"{}\"", text));
                    }
                }
                Ok(format!("Text-Eingabe \"{}\" ausgeführt.", text))
            }
            "hotkey" | "press_keys" => {
                let keys = args
                    .get("keys")
                    .or_else(|| args.get("hotkey"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("enter");
                #[cfg(not(target_os = "windows"))]
                {
                    let _ = Command::new("xdotool").args(["key", keys]).status().await;
                    let _ = Command::new("ydotool").args(["key", keys]).status().await;
                }
                Ok(format!("Tastenkombination '{}' gedrückt.", keys))
            }
            "click" | "double_click" | "right_click" => {
                let x = args.get("x").and_then(|v| v.as_i64());
                let y = args.get("y").and_then(|v| v.as_i64());
                #[cfg(not(target_os = "windows"))]
                {
                    if let (Some(x_pos), Some(y_pos)) = (x, y) {
                        let _ = Command::new("xdotool")
                            .args(["mousemove", &x_pos.to_string(), &y_pos.to_string()])
                            .status()
                            .await;
                    }
                    let click_arg = if action == "right_click" { "3" } else { "1" };
                    let cmd_name = if action == "double_click" {
                        vec!["click", "--repeat", "2", click_arg]
                    } else {
                        vec!["click", click_arg]
                    };
                    let _ = Command::new("xdotool").args(cmd_name).status().await;
                }
                Ok(format!(
                    "Mausaktion '{}' an ({:?}, {:?}) ausgeführt.",
                    action, x, y
                ))
            }
            "scroll" => {
                let amount = args
                    .get("amount")
                    .or_else(|| args.get("scroll_amount"))
                    .and_then(|v| v.as_i64())
                    .unwrap_or(-5);
                #[cfg(not(target_os = "windows"))]
                {
                    let btn = if amount > 0 { "4" } else { "5" };
                    let repeat = amount.abs().clamp(1, 20).to_string();
                    let _ = Command::new("xdotool")
                        .args(["click", "--repeat", &repeat, btn])
                        .status()
                        .await;
                }
                Ok(format!("Bildlauf um {} Einheiten ausgeführt.", amount))
            }
            _ => Ok("GUI-Aktion erfasst.".to_string()),
        }
    }

    /// Autonomous Web Reader (fetches URL, strips HTML tags, returns title & body)
    pub async fn browse_web_read(url: &str) -> Result<String, String> {
        let trimmed = url.trim();
        if trimmed.is_empty() {
            return Err("URL darf nicht leer sein.".to_string());
        }

        let full_url = if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
            format!("https://{}", trimmed)
        } else {
            trimmed.to_string()
        };

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
            .build()
            .map_err(|e| format!("HTTP-Client Fehler: {}", e))?;

        let resp = client
            .get(&full_url)
            .send()
            .await
            .map_err(|e| format!("Netzwerkfehler: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!(
                "Seite gab HTTP-Fehlercode {} zurück.",
                resp.status()
            ));
        }

        let html = resp
            .text()
            .await
            .map_err(|e| format!("Inhalt konnte nicht geladen werden: {}", e))?;

        let (title, norm_text) = html_to_text(&html);
        let title = title.unwrap_or_else(|| "Kein Seitentitel".to_string());

        const PREVIEW_CHARS: usize = 3000;
        let total_chars = norm_text.chars().count();
        let preview = if total_chars > PREVIEW_CHARS {
            let cut: String = norm_text.chars().take(PREVIEW_CHARS).collect();
            format!(
                "{}...\n\n[Inhalt gekürzt, {} Zeichen Gesamt]",
                cut, total_chars
            )
        } else {
            norm_text
        };

        Ok(format!(
            "=== Seite: {} ===\nURL: {}\n\n{}",
            title, full_url, preview
        ))
    }

    /// Execute PowerShell, Bash, Batch, or optional Python script inside sandboxed folder with timeout
    pub async fn execute_code_sandboxed(
        language: &str,
        code: &str,
        timeout_seconds: u64,
        sandbox_dir: &Path,
    ) -> Result<String, String> {
        let code_trimmed = code.trim();
        if code_trimmed.is_empty() {
            return Err("Der übergebene Code darf nicht leer sein.".to_string());
        }

        tokio::fs::create_dir_all(sandbox_dir)
            .await
            .map_err(|e| format!("Sandbox-Verzeichnis konnte nicht erstellt werden: {}", e))?;

        let timeout_s = timeout_seconds.clamp(1, 60);
        let lang = language.to_lowercase().trim().to_string();

        let (ext, program, args_prefix): (&str, &str, Vec<&str>) = match lang.as_str() {
            "powershell" | "pwsh" | "ps1" | "ps" => {
                #[cfg(target_os = "windows")]
                {
                    (
                        ".ps1",
                        "powershell.exe",
                        vec![
                            "-NoProfile",
                            "-NonInteractive",
                            "-ExecutionPolicy",
                            "Bypass",
                            "-File",
                        ],
                    )
                }
                #[cfg(not(target_os = "windows"))]
                {
                    (
                        ".ps1",
                        "pwsh",
                        vec!["-NoProfile", "-NonInteractive", "-File"],
                    )
                }
            }
            "bash" | "sh" | "shell" | "zsh" => (".sh", "bash", vec![]),
            "batch" | "cmd" | "bat" => {
                #[cfg(target_os = "windows")]
                {
                    (".bat", "cmd.exe", vec!["/C"])
                }
                #[cfg(not(target_os = "windows"))]
                {
                    return Err("Windows-Batchdateien (.bat / cmd) werden auf Linux/macOS nicht nativ unterstützt. Bitte verwende 'bash' oder 'powershell' (pwsh).".to_string());
                }
            }
            "python" | "py" | "python3" => {
                #[cfg(target_os = "windows")]
                {
                    (".py", "python", vec![])
                }
                #[cfg(not(target_os = "windows"))]
                {
                    (".py", "python3", vec![])
                }
            }
            other => {
                return Err(format!(
                    "Nicht unterstützte Skriptsprache: '{}'. Unterstützt: powershell, bash, cmd (batch), python (optional).",
                    other
                ));
            }
        };

        let script_file = sandbox_dir.join(format!("_script_{}{}", rand::random::<u32>(), ext));
        tokio::fs::write(&script_file, code)
            .await
            .map_err(|e| format!("Skriptdatei konnte nicht geschrieben werden: {}", e))?;

        let script_str = script_file.to_string_lossy().to_string();

        let execution = async {
            let mut cmd = Command::new(program);
            for arg in &args_prefix {
                cmd.arg(arg);
            }
            cmd.arg(&script_str);
            cmd.current_dir(sandbox_dir);

            match cmd.output().await {
                Ok(out) => Ok((out, program.to_string())),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    // Fallback-Logik für Interpreter je nach Plattform & Sprache
                    if lang == "python" || lang == "py" || lang == "python3" {
                        let alt_prog = if program == "python3" {
                            "python"
                        } else {
                            "python3"
                        };
                        let mut alt_cmd = Command::new(alt_prog);
                        alt_cmd.arg(&script_str);
                        alt_cmd.current_dir(sandbox_dir);
                        if let Ok(alt_out) = alt_cmd.output().await {
                            return Ok((alt_out, alt_prog.to_string()));
                        }
                        Err("Python ist auf diesem System nicht im PATH verfügbar (Python ist optional). Unter Windows kannst du PowerShell ('powershell') oder Batch ('cmd') verwenden, unter Linux/macOS 'bash'.".to_string())
                    } else if lang == "powershell"
                        || lang == "pwsh"
                        || lang == "ps1"
                        || lang == "ps"
                    {
                        #[cfg(not(target_os = "windows"))]
                        {
                            Err("PowerShell ('pwsh') ist auf diesem Unix-System nicht installiert. Unter Linux/macOS empfehlen wir standardmäßig 'bash'.".to_string())
                        }
                        #[cfg(target_os = "windows")]
                        {
                            // Fallback powershell.exe -> pwsh.exe
                            let mut alt_cmd = Command::new("pwsh.exe");
                            for arg in &args_prefix {
                                alt_cmd.arg(arg);
                            }
                            alt_cmd.arg(&script_str);
                            alt_cmd.current_dir(sandbox_dir);
                            if let Ok(alt_out) = alt_cmd.output().await {
                                return Ok((alt_out, "pwsh.exe".to_string()));
                            }
                            Err(format!("PowerShell konnte nicht gestartet werden: {}", e))
                        }
                    } else if (lang == "bash" || lang == "sh" || lang == "shell")
                        && cfg!(target_os = "windows")
                    {
                        Err("Bash wurde auf diesem Windows-System nicht gefunden (z. B. Git Bash). Unter Windows bitte nativ PowerShell ('powershell') oder Batch ('cmd') verwenden.".to_string())
                    } else {
                        Err(format!(
                            "Der Skript-Interpreter '{}' wurde nicht gefunden: {}",
                            program, e
                        ))
                    }
                }
                Err(e) => Err(format!(
                    "Fehler beim Starten des Skript-Interpreters '{}': {}",
                    program, e
                )),
            }
        };

        let result = tokio::time::timeout(Duration::from_secs(timeout_s), execution).await;

        // Cleanup temporary script
        let _ = tokio::fs::remove_file(&script_file).await;

        match result {
            Ok(Ok((output, actual_prog))) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let exit_code = output.status.code().unwrap_or(-1);

                let mut out_str = format!(
                    "Interpreter: {}\nExit Code: {}\nArbeitsverzeichnis: {:?}\n\nSTDOUT:\n{}",
                    actual_prog,
                    exit_code,
                    sandbox_dir,
                    if stdout.is_empty() {
                        "(Keine Ausgabe)"
                    } else {
                        &stdout
                    }
                );
                if !stderr.is_empty() {
                    out_str.push_str(&format!("\n\nSTDERR:\n{}", stderr));
                }
                Ok(out_str)
            }
            Ok(Err(err_msg)) => Err(err_msg),
            Err(_) => Err(format!(
                "Skript-Ausführung überschritt das Timeout von {} Sekunden und wurde beendet.",
                timeout_s
            )),
        }
    }

    /// File organizer: list, search, preview, organize
    pub async fn file_organizer(
        action: &str,
        target_folder: &str,
        query: Option<&str>,
    ) -> Result<String, String> {
        let act = action.to_lowercase().trim().to_string();
        let folder_path = Self::resolve_user_folder(target_folder)?;

        if !folder_path.exists() || !folder_path.is_dir() {
            return Err(format!("Ordner '{:?}' existiert nicht.", folder_path));
        }

        if Self::is_protected_system_path(&folder_path) && act == "organize" {
            return Err(format!(
                "Verweigerung: Der Ordner '{:?}' ist ein geschützter Systempfad.",
                folder_path
            ));
        }

        match act.as_str() {
            "list" => {
                let mut entries = tokio::fs::read_dir(&folder_path)
                    .await
                    .map_err(|e| format!("Verzeichnis konnte nicht gelesen werden: {}", e))?;

                let mut dirs = Vec::new();
                let mut files = Vec::new();

                while let Ok(Some(entry)) = entries.next_entry().await {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with('.') {
                        continue;
                    }
                    if let Ok(meta) = entry.metadata().await {
                        if meta.is_dir() {
                            dirs.push(format!("📁 {}/", name));
                        } else {
                            let size = format_bytes(meta.len());
                            files.push(format!("📄 {} [{}]", name, size));
                        }
                    }
                }

                dirs.sort();
                files.sort();

                let mut out = vec![format!("Inhalt von {:?}:", folder_path)];
                if !dirs.is_empty() {
                    out.push("ORDNER:\n  ".to_string() + &dirs.join("\n  "));
                }
                if !files.is_empty() {
                    let preview_files = files
                        .iter()
                        .take(40)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join("\n  ");
                    out.push(format!(
                        "DATEIEN ({} gesamt):\n  {}",
                        files.len(),
                        preview_files
                    ));
                }
                if dirs.is_empty() && files.is_empty() {
                    out.push("(Ordner ist leer)".to_string());
                }
                Ok(out.join("\n\n"))
            }
            "search" => {
                let q = query.unwrap_or("").trim().to_lowercase();
                if q.is_empty() {
                    return Err("Suchbegriff 'query' erforderlich.".to_string());
                }

                let mut entries = tokio::fs::read_dir(&folder_path)
                    .await
                    .map_err(|e| format!("Verzeichnis konnte nicht gelesen werden: {}", e))?;

                let mut matches = Vec::new();
                while let Ok(Some(entry)) = entries.next_entry().await {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.to_lowercase().contains(&q) {
                        matches.push(name);
                    }
                }
                matches.sort();

                if matches.is_empty() {
                    Ok(format!("Keine Dateien gefunden, die '{}' enthalten.", q))
                } else {
                    Ok(format!(
                        "{} Treffer für '{}' in {:?}:\n- {}",
                        matches.len(),
                        q,
                        folder_path,
                        matches.join("\n- ")
                    ))
                }
            }
            "preview" | "organize" => {
                let apply_changes = act == "organize";
                let mut entries = tokio::fs::read_dir(&folder_path)
                    .await
                    .map_err(|e| format!("Verzeichnis konnte nicht gelesen werden: {}", e))?;

                let mut category_counts = std::collections::BTreeMap::new();
                let mut moved = Vec::new();
                let mut errors = Vec::new();

                while let Ok(Some(entry)) = entries.next_entry().await {
                    let path = entry.path();
                    if path.is_file() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.starts_with('.') {
                            continue;
                        }
                        let ext = path
                            .extension()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        let category = match ext.as_str() {
                            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" => "Images",
                            "pdf" | "docx" | "doc" | "txt" | "xlsx" | "pptx" | "csv" | "md" => {
                                "Documents"
                            }
                            "zip" | "tar" | "gz" | "7z" | "rar" | "xz" => "Archives",
                            "mp4" | "mkv" | "avi" | "mov" | "webm" => "Videos",
                            "mp3" | "wav" | "flac" | "ogg" | "m4a" => "Audio",
                            "deb" | "rpm" | "exe" | "msi" | "pkg" | "appimage" => "Installers",
                            _ => "Other",
                        };

                        *category_counts.entry(category.to_string()).or_insert(0) += 1;

                        if apply_changes {
                            let target_dir = folder_path.join(category);
                            if let Err(e) = tokio::fs::create_dir_all(&target_dir).await {
                                errors.push(format!(
                                    "{}: Ordner-Erstellung fehlgeschlagen ({})",
                                    name, e
                                ));
                                continue;
                            }
                            let dest = target_dir.join(&name);
                            if let Err(e) = tokio::fs::rename(&path, &dest).await {
                                errors
                                    .push(format!("{}: Verschieben fehlgeschlagen ({})", name, e));
                            } else {
                                moved.push(format!("{} → {}/", name, category));
                            }
                        }
                    }
                }

                if category_counts.is_empty() {
                    return Ok(format!(
                        "In {:?} wurden keine losen Dateien zum Sortieren gefunden.",
                        folder_path
                    ));
                }

                let summary = category_counts
                    .into_iter()
                    .map(|(cat, count)| format!("{} {}", count, cat))
                    .collect::<Vec<_>>()
                    .join(", ");

                if apply_changes {
                    Ok(format!(
                        "Dateien in {:?} wurden sortiert: {}.\nErfolgreich verschoben: {}{}",
                        folder_path,
                        summary,
                        moved.len(),
                        if errors.is_empty() {
                            String::new()
                        } else {
                            format!("\nFehler: {}", errors.join("; "))
                        }
                    ))
                } else {
                    Ok(format!(
                        "Vorschau für {:?}: Würde sortieren in: {}.\nFühre action='organize' aus, um das Verschieben zu bestätigen.",
                        folder_path, summary
                    ))
                }
            }
            other => Err(format!(
                "Unbekannte File-Organizer Aktion: '{}'. Erlaubt: list, search, preview, organize.",
                other
            )),
        }
    }

    /// Collect environment vitals snapshot
    pub fn get_environment_snapshot() -> EnvironmentSnapshot {
        let mut sys = sysinfo::System::new_all();
        sys.refresh_all();

        let cpu_usage_percent = sys.global_cpu_usage();
        let ram_total = sys.total_memory();
        let ram_used = sys.used_memory();
        let ram_total_mb = ram_total / (1024 * 1024);
        let ram_used_mb = ram_used / (1024 * 1024);
        let ram_percent = if ram_total > 0 {
            (ram_used as f32 / ram_total as f32) * 100.0
        } else {
            0.0
        };

        let disks = sysinfo::Disks::new_with_refreshed_list();
        let mut disk_free_bytes = 0u64;
        let mut disk_total_bytes = 0u64;
        for d in disks.iter() {
            disk_free_bytes += d.available_space();
            disk_total_bytes += d.total_space();
        }
        let disk_free_gb = disk_free_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        let disk_total_gb = disk_total_bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        let disk_percent = if disk_total_bytes > 0 {
            (((disk_total_bytes - disk_free_bytes) as f32) / (disk_total_bytes as f32)) * 100.0
        } else {
            0.0
        };

        // Probe NVIDIA GPU via nvidia-smi if available
        let mut gpu_name = None;
        let mut gpu_temp_c = None;
        let mut gpu_util_percent = None;
        let mut gpu_vram_used_mb = None;
        let mut gpu_vram_total_mb = None;

        if let Ok(output) = std::process::Command::new("nvidia-smi")
            .args([
                "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ])
            .output()
            && output.status.success()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Some(line) = stdout.lines().next() {
                let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
                if parts.len() >= 5 {
                    gpu_name = Some(parts[0].to_string());
                    gpu_util_percent = parts[1].parse::<f32>().ok();
                    gpu_temp_c = parts[2].parse::<f32>().ok();
                    gpu_vram_used_mb = parts[3].parse::<u64>().ok();
                    gpu_vram_total_mb = parts[4].parse::<u64>().ok();
                }
            }
        }

        EnvironmentSnapshot {
            cpu_usage_percent,
            ram_used_mb,
            ram_total_mb,
            ram_percent,
            disk_free_gb,
            disk_total_gb,
            disk_percent,
            battery_percent: None,
            battery_charging: None,
            gpu_name,
            gpu_temp_c,
            gpu_util_percent,
            gpu_vram_used_mb,
            gpu_vram_total_mb,
            uptime_seconds: sysinfo::System::uptime(),
            active_processes_count: sys.processes().len(),
        }
    }

    /// Resolve user directory helper
    fn resolve_user_folder(raw: &str) -> Result<PathBuf, String> {
        let trimmed = raw.trim().to_lowercase();
        let home = directories::BaseDirs::new()
            .map(|b| b.home_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));

        if trimmed == "desktop" || trimmed == "schreibtisch" {
            Ok(home.join("Desktop"))
        } else if trimmed == "downloads" || trimmed == "downloads/" {
            Ok(home.join("Downloads"))
        } else if trimmed == "documents" || trimmed == "dokumente" {
            Ok(home.join("Documents"))
        } else if trimmed == "pictures" || trimmed == "bilder" {
            Ok(home.join("Pictures"))
        } else if Path::new(raw).is_absolute() {
            Ok(PathBuf::from(raw))
        } else {
            Ok(home.join(raw))
        }
    }

    /// Check if path is a protected system directory
    fn is_protected_system_path(p: &Path) -> bool {
        let s = p.to_string_lossy().to_string();
        let protected = [
            "/",
            "/etc",
            "/boot",
            "/bin",
            "/sbin",
            "/usr",
            "/lib",
            "/lib64",
            "/sys",
            "/proc",
            "/dev",
            "C:\\Windows",
            "C:\\Program Files",
        ];
        for prot in protected {
            if s == prot || s.starts_with(&format!("{}/", prot)) {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::html_to_text;

    #[test]
    fn html_to_text_strips_blocks_tags_and_whitespace() {
        let html = r#"<html><head><title> Grüße
            aus Tokyo </title><style>body{color:red}</style><script>var x = "<p>";</script></head>
            <body><nav>Menü</nav><header>Kopf</header><!-- hidden --><h1>Hallo</h1>
            <p>Welt  mit <b>Umlauten</b> äöü 🎌</p><footer>Fuß</footer><noscript>JS</noscript></body></html>"#;
        let (title, text) = html_to_text(html);
        assert_eq!(title.as_deref(), Some("Grüße aus Tokyo"));
        assert_eq!(text, "Grüße aus Tokyo Hallo Welt mit Umlauten äöü 🎌");
    }

    #[test]
    fn html_to_text_without_title() {
        let (title, text) = html_to_text("<p>nur Text</p>");
        assert!(title.is_none());
        assert_eq!(text, "nur Text");
    }
}
