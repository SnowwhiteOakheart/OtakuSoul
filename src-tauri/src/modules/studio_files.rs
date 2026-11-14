//! Folders and file names of the creative studios (Song Studio, Image Studio): where their files
//! go (`<config>/songs.json` / `<config>/images.json`, by default the system's music or pictures
//! folder plus `OtakuSoul`), names every system accepts, never overwriting, deleting.
//!
//! The folders are kept outside `settings.json` on purpose: they are paths of this very device
//! (no device sync) and the frontend writes `settings.json` as a whole.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

/// Which studio a folder belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum StudioKind {
    Songs,
    Images,
}

impl StudioKind {
    fn config_file(self) -> &'static str {
        match self {
            Self::Songs => "songs.json",
            Self::Images => "images.json",
        }
    }

    /// The system's music or pictures folder plus `OtakuSoul`; without one (Linux without XDG
    /// folders) a folder in the app data.
    pub fn default_dir(self) -> PathBuf {
        let user = directories::UserDirs::new();
        let system = user.as_ref().and_then(|dirs| match self {
            Self::Songs => dirs.audio_dir(),
            Self::Images => dirs.picture_dir(),
        });
        system.map(|d| d.join("OtakuSoul")).unwrap_or_else(|| {
            PathBuf::from(resolve_app_paths().data_dir).join(match self {
                Self::Songs => "songs",
                Self::Images => "pictures",
            })
        })
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct StudioConfig {
    output_dir: String,
}

fn config_path(kind: StudioKind) -> PathBuf {
    PathBuf::from(resolve_app_paths().config_dir).join(kind.config_file())
}

fn configured_dir(kind: StudioKind) -> String {
    std::fs::read_to_string(config_path(kind))
        .ok()
        .and_then(|text| serde_json::from_str::<StudioConfig>(&text).ok())
        .map(|c| c.output_dir.trim().to_string())
        .unwrap_or_default()
}

/// The folder a studio saves to.
pub fn output_dir(kind: StudioKind) -> PathBuf {
    let configured = configured_dir(kind);
    if configured.is_empty() {
        kind.default_dir()
    } else {
        PathBuf::from(configured)
    }
}

/// A studio's folder as the studio shows it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct StudioFolder {
    pub path: String,
    pub is_default: bool,
}

pub fn folder(kind: StudioKind) -> StudioFolder {
    StudioFolder {
        path: output_dir(kind).to_string_lossy().into_owned(),
        is_default: configured_dir(kind).is_empty(),
    }
}

/// Sets a studio's folder (`None` or empty: back to the default). The folder must be creatable.
pub fn set_output_dir(kind: StudioKind, dir: Option<&str>) -> Result<StudioFolder, String> {
    let dir = dir.map(str::trim).unwrap_or_default();
    if !dir.is_empty() {
        let path = Path::new(dir);
        if !path.is_absolute() {
            return Err(crate::err!("backend.studio.folderInvalid", path = dir));
        }
        std::fs::create_dir_all(path)
            .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    }
    let path = config_path(kind);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(
        &path,
        serde_json::to_string_pretty(&StudioConfig {
            output_dir: dir.to_string(),
        })
        .unwrap_or_default(),
    )
    .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    Ok(folder(kind))
}

/// A studio's folder, created if needed.
pub fn prepare_dir(kind: StudioKind) -> Result<PathBuf, String> {
    let dir = output_dir(kind);
    std::fs::create_dir_all(&dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    Ok(dir)
}

/// Windows refuses these names for files, whatever the extension.
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];
pub const MAX_NAME_CHARS: usize = 80;

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

/// The name a file is saved under: the given title, else `<fallback> <date> <time>`.
pub fn file_title(title: &str, fallback: &str) -> String {
    let stem = safe_file_stem(title);
    if stem.is_empty() {
        format!(
            "{fallback} {}",
            chrono::Local::now().format("%Y-%m-%d %H-%M-%S")
        )
    } else {
        stem
    }
}

/// `<stem>.<ext>`, or `<stem> (2).<ext>` … when the name is taken (nothing is overwritten).
pub fn unique_file_name(dir: &Path, stem: &str, ext: &str) -> String {
    (1..)
        .map(|n| {
            if n == 1 {
                format!("{stem}.{ext}")
            } else {
                format!("{stem} ({n}).{ext}")
            }
        })
        .find(|name| !dir.join(name).exists() && !dir.join(format!("{name}.json")).exists())
        .unwrap_or_else(|| format!("{stem}.{ext}"))
}

/// A file of a studio's folder with its origin JSON (`<file>.json`), if any.
pub struct StudioFile<T> {
    pub file_name: String,
    pub path: PathBuf,
    pub size_bytes: u64,
    /// UNIX seconds of the last change.
    pub modified: u64,
    pub origin: Option<T>,
}

/// Files of a studio's folder with one of `extensions`, newest first.
pub fn list_files<T: serde::de::DeserializeOwned>(
    kind: StudioKind,
    extensions: &[&str],
) -> Vec<StudioFile<T>> {
    let dir = output_dir(kind);
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut files: Vec<StudioFile<T>> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let ext = path.extension()?.to_str()?.to_ascii_lowercase();
            if !extensions.contains(&ext.as_str()) || !path.is_file() {
                return None;
            }
            let file_name = path.file_name()?.to_string_lossy().into_owned();
            let meta = entry.metadata().ok()?;
            let origin = std::fs::read_to_string(dir.join(format!("{file_name}.json")))
                .ok()
                .and_then(|text| serde_json::from_str(&text).ok());
            Some(StudioFile {
                size_bytes: meta.len(),
                modified: meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |d| d.as_secs()),
                path,
                file_name,
                origin,
            })
        })
        .collect();
    files.sort_by(|a, b| {
        b.modified
            .cmp(&a.modified)
            .then(a.file_name.cmp(&b.file_name))
    });
    files
}

/// Deletes a file of a studio's folder and its origin file; only plain names in that folder.
pub fn delete(kind: StudioKind, file_name: &str) -> Result<(), String> {
    let name = Path::new(file_name)
        .file_name()
        .filter(|n| n.to_string_lossy() == file_name && !file_name.ends_with(".json"))
        .ok_or_else(|| crate::err!("backend.studio.folderInvalid", path = file_name))?;
    let dir = output_dir(kind);
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
        assert!(file_title("???", "Song").starts_with("Song "));
        assert_eq!(file_title("Abend", "Bild"), "Abend");
    }

    #[test]
    fn files_are_never_overwritten() {
        let dir = std::env::temp_dir().join(format!("otakusoul-studio-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_file_name(&dir, "Lied", "mp3"), "Lied.mp3");
        std::fs::write(dir.join("Lied.mp3"), b"x").unwrap();
        assert_eq!(unique_file_name(&dir, "Lied", "mp3"), "Lied (2).mp3");
        std::fs::write(dir.join("Lied (2).mp3.json"), b"{}").unwrap();
        assert_eq!(unique_file_name(&dir, "Lied", "mp3"), "Lied (3).mp3");
        assert_eq!(unique_file_name(&dir, "Lied", "png"), "Lied.png");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn default_folders_differ_per_studio() {
        assert_ne!(
            StudioKind::Songs.default_dir(),
            StudioKind::Images.default_dir()
        );
        assert!(
            StudioKind::Images.default_dir().ends_with("OtakuSoul")
                || StudioKind::Images.default_dir().ends_with("pictures")
        );
    }
}
