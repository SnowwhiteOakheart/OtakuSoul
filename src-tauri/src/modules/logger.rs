use chrono::Local;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

static LOG_BUFFER: Mutex<Vec<LogEntry>> = Mutex::new(Vec::new());
const MAX_BUFFER_SIZE: usize = 1000;

fn get_log_file_path() -> PathBuf {
    let paths = crate::modules::paths::resolve_app_paths();
    let log_dir = PathBuf::from(&paths.data_dir).join("logs");
    let _ = fs::create_dir_all(&log_dir);
    log_dir.join("otakusoul.log")
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

    // 2. Append to file
    let path = get_log_file_path();
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
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
    let path = get_log_file_path();
    if let Ok(file) = fs::File::open(&path) {
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
    let path = get_log_file_path();
    if path.exists() {
        fs::write(&path, "").map_err(|e| crate::err!("backend.logs.clear", error = e))?;
    }
    log_event("INFO", "logger", "Logdatei wurde geleert.");
    Ok(())
}

pub fn export_app_logs() -> Result<String, String> {
    let path = get_log_file_path();
    if path.exists() {
        fs::read_to_string(&path).map_err(|e| crate::err!("backend.logs.read", error = e))
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
