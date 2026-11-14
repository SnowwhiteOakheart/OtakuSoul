//! The Song Studio's own files: where the user's songs go (`<config>/songs.json`, by default the
//! system's music folder plus `OtakuSoul`), safe file names from a song title, and the song list
//! with the request each song was made from (`<song>.mp3.json` next to it).
//!
//! The folder is kept outside `settings.json` on purpose: it is a path of this very device and
//! the frontend writes `settings.json` as a whole.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

/// What the Song Studio asks ACE-Step for (one request, `versions` songs).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, TS)]
#[serde(default)]
#[ts(export)]
pub struct SongRequest {
    /// Song title (also the file name); empty = date and time.
    pub title: String,
    /// Style, mood and instruments (ACE-Step's caption).
    pub caption: String,
    /// Lyrics with structure tags; empty = the language model writes them,
    /// `[Instrumental]` = no vocals.
    pub lyrics: String,
    /// Language of the vocals (`de`, `en`, …); empty = the language model decides.
    pub vocal_language: String,
    /// Length in seconds (10–600).
    pub duration: u32,
    /// `None` = the language model picks the tempo.
    pub bpm: Option<u32>,
    /// E.g. `C major`; empty = the language model picks.
    pub keyscale: String,
    /// Beats per bar (`3`, `4`, …); empty = the language model picks.
    pub timesignature: String,
    /// `None` = random.
    pub seed: Option<i64>,
    /// Diffusion steps; `None` = the model set's default.
    pub steps: Option<u32>,
    /// Language model temperature (freedom of the composition); `None` = 0.85.
    pub lm_temperature: Option<f32>,
    /// How many versions to make (1–10).
    pub versions: u32,
    pub model_id: String,
}

/// A finished song in the song folder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct SongEntry {
    pub file_name: String,
    pub path: String,
    pub title: String,
    pub size_bytes: u64,
    /// UNIX seconds of the last change.
    pub modified: u64,
    /// The request it was made from (only for songs of the Song Studio).
    pub request: Option<SongRequest>,
    /// Lyrics as sung (also those the language model wrote).
    pub lyrics: String,
    pub seed: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct SongConfig {
    output_dir: String,
}

fn config_path() -> PathBuf {
    PathBuf::from(resolve_app_paths().config_dir).join("songs.json")
}

fn load_config() -> SongConfig {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// The system's music folder plus `OtakuSoul`; without one (Linux without XDG folders)
/// `<data>/songs`.
pub fn default_dir() -> PathBuf {
    directories::UserDirs::new()
        .and_then(|dirs| dirs.audio_dir().map(|d| d.join("OtakuSoul")))
        .unwrap_or_else(|| PathBuf::from(resolve_app_paths().data_dir).join("songs"))
}

/// The folder new songs go to.
pub fn output_dir() -> PathBuf {
    let configured = load_config().output_dir;
    if configured.trim().is_empty() {
        default_dir()
    } else {
        PathBuf::from(configured)
    }
}

/// The song folder as the Song Studio shows it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct SongFolder {
    pub path: String,
    pub is_default: bool,
}

pub fn folder() -> SongFolder {
    let configured = !load_config().output_dir.trim().is_empty();
    SongFolder {
        path: output_dir().to_string_lossy().into_owned(),
        is_default: !configured,
    }
}

/// Sets the song folder (`None` or empty: back to the default). The folder must be creatable.
pub fn set_output_dir(dir: Option<&str>) -> Result<SongFolder, String> {
    let dir = dir.map(str::trim).unwrap_or_default();
    if !dir.is_empty() {
        let path = Path::new(dir);
        if !path.is_absolute() {
            return Err(crate::err!("backend.music.folderInvalid", path = dir));
        }
        std::fs::create_dir_all(path)
            .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    }
    let config = SongConfig {
        output_dir: dir.to_string(),
    };
    let path = config_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&serde_json::json!({ "output_dir": config.output_dir }))
            .unwrap_or_default(),
    )
    .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    Ok(folder())
}

/// The song folder, created if needed.
pub fn prepare_dir() -> Result<PathBuf, String> {
    let dir = output_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    Ok(dir)
}

/// Windows refuses these names for files, whatever the extension.
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];
const MAX_NAME_CHARS: usize = 80;

/// A file name (without extension) every system accepts: no path or reserved characters, no
/// reserved device names, no trailing dots or spaces, at most 80 characters.
pub fn safe_file_stem(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    let mut stem = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(MAX_NAME_CHARS)
        .collect::<String>();
    stem = stem.trim_end_matches(['.', ' ']).trim_start().to_string();
    let base = stem
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    if RESERVED.contains(&base.as_str()) {
        stem = format!("{stem}_");
    }
    stem
}

/// The title a song is saved under: the given one, else date and time.
pub fn song_title(title: &str) -> String {
    let stem = safe_file_stem(title);
    if stem.is_empty() {
        format!("Song {}", chrono::Local::now().format("%Y-%m-%d %H-%M"))
    } else {
        stem
    }
}

/// `<stem>.mp3`, or `<stem> (2).mp3` … when the name is taken (a song is never overwritten).
pub fn unique_file_name(dir: &Path, stem: &str) -> String {
    (1..)
        .map(|n| {
            if n == 1 {
                format!("{stem}.mp3")
            } else {
                format!("{stem} ({n}).mp3")
            }
        })
        .find(|name| !dir.join(name).exists() && !dir.join(format!("{name}.json")).exists())
        .unwrap_or_else(|| format!("{stem}.mp3"))
}

/// What is written next to a song: its request and what the language model made of it.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct SongOrigin {
    pub title: String,
    pub request: Option<SongRequest>,
    pub lyrics: String,
    pub seed: Option<i64>,
    pub generator: String,
    pub model: String,
    pub lm_model: String,
    pub generated: String,
    pub license: String,
}

/// Songs in the song folder (MP3, WAV, FLAC, OGG), newest first.
pub fn list() -> Vec<SongEntry> {
    let dir = output_dir();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut songs: Vec<SongEntry> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let ext = path.extension()?.to_str()?.to_ascii_lowercase();
            if !["mp3", "wav", "flac", "ogg"].contains(&ext.as_str()) || !path.is_file() {
                return None;
            }
            let file_name = path.file_name()?.to_string_lossy().into_owned();
            let meta = entry.metadata().ok()?;
            let origin: Option<SongOrigin> =
                std::fs::read_to_string(dir.join(format!("{file_name}.json")))
                    .ok()
                    .and_then(|text| serde_json::from_str(&text).ok());
            let stem = path.file_stem()?.to_string_lossy().into_owned();
            Some(SongEntry {
                path: path.to_string_lossy().into_owned(),
                title: origin
                    .as_ref()
                    .map(|o| o.title.clone())
                    .filter(|t| !t.is_empty())
                    .unwrap_or(stem),
                size_bytes: meta.len(),
                modified: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_secs()),
                request: origin.as_ref().and_then(|o| o.request.clone()),
                lyrics: origin
                    .as_ref()
                    .map(|o| o.lyrics.clone())
                    .unwrap_or_default(),
                seed: origin.as_ref().and_then(|o| o.seed),
                file_name,
            })
        })
        .collect();
    songs.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then(a.file_name.cmp(&b.file_name))
    });
    songs
}

/// Deletes a song of the song folder and its origin file.
pub fn delete(file_name: &str) -> Result<(), String> {
    let name = Path::new(file_name)
        .file_name()
        .filter(|n| n.to_string_lossy() == file_name)
        .ok_or_else(|| crate::err!("backend.music.folderInvalid", path = file_name))?;
    let dir = output_dir();
    std::fs::remove_file(dir.join(name))
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    let _ = std::fs::remove_file(dir.join(format!("{file_name}.json")));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_are_safe_everywhere() {
        assert_eq!(safe_file_stem("Neon / Nacht: Teil 2?"), "Neon Nacht Teil 2");
        assert_eq!(safe_file_stem("  Ende...  "), "Ende");
        assert_eq!(safe_file_stem("con"), "con_");
        assert_eq!(safe_file_stem("Nul.txt"), "Nul.txt_");
        assert_eq!(safe_file_stem("Console"), "Console");
        assert_eq!(safe_file_stem("a\tb\nc"), "a b c");
        assert_eq!(
            safe_file_stem(&"x".repeat(200)).chars().count(),
            MAX_NAME_CHARS
        );
        assert_eq!(safe_file_stem("さくらの歌"), "さくらの歌");
        assert!(song_title("???").starts_with("Song "));
    }

    #[test]
    fn songs_are_never_overwritten() {
        let dir = std::env::temp_dir().join(format!("otakusoul-songs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_file_name(&dir, "Lied"), "Lied.mp3");
        std::fs::write(dir.join("Lied.mp3"), b"x").unwrap();
        assert_eq!(unique_file_name(&dir, "Lied"), "Lied (2).mp3");
        std::fs::write(dir.join("Lied (2).mp3.json"), b"{}").unwrap();
        assert_eq!(unique_file_name(&dir, "Lied"), "Lied (3).mp3");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn old_requests_still_read() {
        let request: SongRequest = serde_json::from_str(r#"{"caption":"lofi"}"#).unwrap();
        assert_eq!(request.caption, "lofi");
        assert_eq!(request.versions, 0);
    }
}
