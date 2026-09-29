use chrono::Local;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tracing::field::{Field, Visit};
use tracing::{Event, Subscriber};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::{Context, Layer, SubscriberExt};
use tracing_subscriber::util::SubscriberInitExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

static LOG_BUFFER: Mutex<Vec<LogEntry>> = Mutex::new(Vec::new());
const MAX_BUFFER_SIZE: usize = 1000;
/// The log file is rotated at this size; `otakusoul.log.1` … `.3` keep the older parts.
const MAX_FILE_BYTES: u64 = 5 * 1024 * 1024;
const ROTATED_FILES: u32 = 3;

/// Set once in [`init_tracing`]; resolving paths while handling a log event could log itself.
static LOG_FILE: OnceLock<PathBuf> = OnceLock::new();

/// Default filter unless `RUST_LOG` is set: OtakuSoul at info, dependencies only warnings.
const DEFAULT_FILTER: &str = "warn,otakusoul=info,otakusoul_lib=info";

/// Sends all `tracing` output to the console, the in-app log viewer and the rotating log file.
pub fn init_tracing() {
    let log_dir = PathBuf::from(&crate::modules::paths::resolve_app_paths().data_dir).join("logs");
    let _ = fs::create_dir_all(&log_dir);
    let _ = LOG_FILE.set(log_dir.join("otakusoul.log"));

    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_FILTER));
    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .with(AppLogLayer)
        .try_init();
}

/// Forwards `tracing` events to [`log_event`].
struct AppLogLayer;

impl<S: Subscriber> Layer<S> for AppLogLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let mut visitor = MessageVisitor::default();
        event.record(&mut visitor);
        let metadata = event.metadata();
        log_event(
            metadata.level().as_str(),
            metadata.target(),
            &visitor.finish(),
        );
    }
}

/// Collects the event message plus any extra fields as `key=value`.
#[derive(Default)]
struct MessageVisitor {
    message: String,
    fields: Vec<String>,
}

impl MessageVisitor {
    fn finish(self) -> String {
        if self.fields.is_empty() {
            self.message
        } else {
            format!("{} {}", self.message, self.fields.join(" "))
        }
    }
}

impl Visit for MessageVisitor {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            self.message = value.to_string();
        } else {
            self.fields.push(format!("{}={}", field.name(), value));
        }
    }

    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.message = format!("{value:?}");
        } else {
            self.fields.push(format!("{}={:?}", field.name(), value));
        }
    }
}

fn get_log_file_path() -> Option<&'static PathBuf> {
    LOG_FILE.get()
}

/// Shifts `otakusoul.log` → `.1` → `.2` … once it exceeds [`MAX_FILE_BYTES`].
fn rotate_if_needed(path: &Path) {
    if fs::metadata(path).map(|m| m.len()).unwrap_or(0) < MAX_FILE_BYTES {
        return;
    }
    let rotated = |n: u32| PathBuf::from(format!("{}.{}", path.display(), n));
    let _ = fs::remove_file(rotated(ROTATED_FILES));
    for n in (1..ROTATED_FILES).rev() {
        let _ = fs::rename(rotated(n), rotated(n + 1));
    }
    let _ = fs::rename(path, rotated(1));
}

pub fn log_event(level: &str, target: &str, message: &str) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
    let entry = LogEntry {
        timestamp: timestamp.clone(),
        level: level.to_uppercase(),
        target: target.to_string(),
        message: message.to_string(),
    };

    // 1. Buffer in memory
    {
        let mut buffer = LOG_BUFFER.lock();
        buffer.push(entry.clone());
        if buffer.len() > MAX_BUFFER_SIZE {
            buffer.remove(0);
        }
    }

    // 2. Append to file (only after init_tracing has chosen the location)
    let Some(path) = get_log_file_path() else {
        return;
    };
    rotate_if_needed(path);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let line = format!(
            "[{}] [{}] [{}] {}\n",
            timestamp, entry.level, entry.target, entry.message
        );
        let _ = file.write_all(line.as_bytes());
    }
}

pub fn get_recent_logs(max_lines: Option<usize>) -> Vec<LogEntry> {
    let limit = max_lines.unwrap_or(200);

    // If memory buffer has logs, return the slice
    {
        let buffer = LOG_BUFFER.lock();
        if !buffer.is_empty() {
            let start = buffer.len().saturating_sub(limit);
            return buffer[start..].to_vec();
        }
    }

    // Fallback: Read from file if memory buffer was empty
    let Some(path) = get_log_file_path() else {
        return Vec::new();
    };
    if let Ok(file) = fs::File::open(path) {
        let reader = BufReader::new(file);
        // map_while stops at the first read error instead of looping forever on it.
        let lines: Vec<String> = reader.lines().map_while(Result::ok).collect();

        let start = if lines.len() > limit {
            lines.len() - limit
        } else {
            0
        };

        lines[start..].iter().map(|l| parse_log_line(l)).collect()
    } else {
        Vec::new()
    }
}

pub fn clear_app_logs() -> Result<(), String> {
    {
        let mut buffer = LOG_BUFFER.lock();
        buffer.clear();
    }
    if let Some(path) = get_log_file_path()
        && path.exists()
    {
        fs::write(path, "").map_err(|e| crate::err!("backend.logs.clear", error = e))?;
    }
    log_event("INFO", "logger", "Logdatei wurde geleert.");
    Ok(())
}

pub fn export_app_logs() -> Result<String, String> {
    if let Some(path) = get_log_file_path()
        && path.exists()
    {
        fs::read_to_string(path).map_err(|e| crate::err!("backend.logs.read", error = e))
    } else {
        Ok(String::new())
    }
}

fn parse_log_line(raw: &str) -> LogEntry {
    // Format: [timestamp] [LEVEL] [target] message
    let mut parts = raw.splitn(4, ']');
    let ts = parts.next().unwrap_or("").trim_start_matches('[').trim();
    let lvl = parts.next().unwrap_or("").trim_start_matches(" [").trim();
    let tgt = parts.next().unwrap_or("").trim_start_matches(" [").trim();
    let msg = parts.next().unwrap_or(raw).trim_start();

    LogEntry {
        timestamp: ts.to_string(),
        level: lvl.to_string(),
        target: tgt.to_string(),
        message: msg.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracing_events_reach_the_log_viewer() {
        let subscriber = tracing_subscriber::registry().with(AppLogLayer);
        tracing::subscriber::with_default(subscriber, || {
            tracing::warn!(model = "ayu", "Test-Meldung für den Log-Viewer");
        });

        let entry = get_recent_logs(Some(MAX_BUFFER_SIZE))
            .into_iter()
            .find(|e| e.message.starts_with("Test-Meldung für den Log-Viewer"))
            .expect("event forwarded to the buffer");
        assert_eq!(entry.level, "WARN");
        assert!(entry.message.ends_with("model=ayu"), "{}", entry.message);
    }

    #[test]
    fn log_file_is_rotated_when_too_large() {
        let dir = std::env::temp_dir().join(format!("otakusoul-log-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let log = dir.join("otakusoul.log");
        fs::write(dir.join("otakusoul.log.1"), "older").unwrap();

        fs::write(&log, "small").unwrap();
        rotate_if_needed(&log);
        assert!(log.exists(), "small files stay in place");

        fs::write(&log, vec![b'x'; MAX_FILE_BYTES as usize]).unwrap();
        rotate_if_needed(&log);
        assert!(!log.exists());
        assert_eq!(
            fs::metadata(dir.join("otakusoul.log.1")).unwrap().len(),
            MAX_FILE_BYTES
        );
        assert_eq!(
            fs::read_to_string(dir.join("otakusoul.log.2")).unwrap(),
            "older"
        );
        let _ = fs::remove_dir_all(dir);
    }
}
