//! Stage music: tracks per mood in `<data>/music/<mood>/` that the Stage cross-fades between as
//! the scene's mood changes (the game master's pick, a fight, a boss). Users drop their own files
//! there; music packs from the data repository (`music_registry.json`) are downloaded from their
//! source and checked (SHA-256), never bundled.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

/// The moods the Stage plays music for, also the folder names under `<data>/music/`.
pub const MOODS: [&str; 9] = [
    "calm",
    "tavern",
    "adventure",
    "tension",
    "mystery",
    "combat",
    "boss",
    "romance",
    "sorrow",
];

/// Formats every webview plays (WebView2, WebKitGTK with GStreamer, WKWebView).
const EXTENSIONS: [&str; 5] = ["ogg", "opus", "mp3", "wav", "flac"];

const BUNDLED_REGISTRY: &str = include_str!("../../../presets/music_registry.json");
const REGISTRY_FILE: &str = "music_registry.json";

/// A music file the Stage can play.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageMusicTrack {
    pub mood: String,
    /// File name without folder.
    pub name: String,
    /// Absolute path (played through the asset protocol).
    pub path: String,
}

/// A music pack of the registry as the settings list it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MusicPackInfo {
    pub id: String,
    pub name: String,
    pub author: String,
    pub license: String,
    pub license_url: String,
    pub description: String,
    pub track_count: u32,
    pub installed_count: u32,
    pub size_mb: f64,
    /// Moods the pack has tracks for.
    pub moods: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct RegistryTrack {
    mood: String,
    /// File name it is stored under in `<data>/music/<mood>/`.
    file: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    author: String,
    url: String,
    sha256: String,
    size_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct RegistryPack {
    id: String,
    name: String,
    #[serde(default)]
    author: String,
    license: String,
    #[serde(default)]
    license_url: String,
    /// Short description per language code.
    #[serde(default)]
    description: HashMap<String, String>,
    tracks: Vec<RegistryTrack>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct Registry {
    version: u32,
    #[serde(default)]
    packs: Vec<RegistryPack>,
}

pub fn music_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("music")
}

fn is_music_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| EXTENSIONS.iter().any(|ok| e.eq_ignore_ascii_case(ok)))
}

/// A plain file name: no folders, not hidden, a playable format.
fn plain_music_name(name: &str) -> bool {
    !name.is_empty()
        && !name.contains(['/', '\\'])
        && !name.starts_with('.')
        && is_music_file(Path::new(name))
}

/// All music files below `dir`, per mood folder, sorted by name.
fn tracks_in(dir: &Path) -> Vec<StageMusicTrack> {
    let mut tracks = Vec::new();
    for mood in MOODS {
        let Ok(entries) = fs::read_dir(dir.join(mood)) else {
            continue;
        };
        let mut files: Vec<PathBuf> = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| {
                path.is_file()
                    && path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .is_some_and(plain_music_name)
            })
            .collect();
        files.sort();
        tracks.extend(files.into_iter().map(|path| {
            StageMusicTrack {
                mood: mood.to_string(),
                name: path
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default(),
                path: path.to_string_lossy().into_owned(),
            }
        }));
    }
    tracks
}

/// The user's music files for the Stage.
pub fn list_tracks() -> Vec<StageMusicTrack> {
    tracks_in(&music_dir(Path::new(&resolve_app_paths().data_dir)))
}

/// Creates the music folder with one subfolder per mood (for "open folder").
pub fn prepare_dir() -> Result<PathBuf, String> {
    let dir = music_dir(Path::new(&resolve_app_paths().data_dir));
    for mood in MOODS {
        fs::create_dir_all(dir.join(mood))
            .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    }
    Ok(dir)
}

fn valid_track(t: &RegistryTrack) -> bool {
    MOODS.contains(&t.mood.as_str())
        && plain_music_name(&t.file)
        && t.url.starts_with("https://")
        && t.sha256.len() == 64
        && t.sha256
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        && t.size_bytes > 0
}

fn valid_pack_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

/// Parses a registry and drops invalid tracks and packs without any left.
fn parse_registry(text: &str) -> Option<Registry> {
    let mut registry: Registry = serde_json::from_str(text).ok()?;
    for pack in &mut registry.packs {
        pack.tracks.retain(valid_track);
    }
    registry.packs.retain(|p| {
        valid_pack_id(&p.id)
            && !p.name.trim().is_empty()
            && !p.license.trim().is_empty()
            && !p.tracks.is_empty()
    });
    Some(registry)
}

/// The registry in use: the downloaded copy if it is newer than the shipped one.
fn registry(data_dir: &Path) -> Registry {
    let bundled = parse_registry(BUNDLED_REGISTRY).unwrap_or_default();
    fs::read_to_string(data_dir.join(REGISTRY_FILE))
        .ok()
        .and_then(|text| parse_registry(&text))
        .filter(|downloaded| downloaded.version > bundled.version)
        .unwrap_or(bundled)
}

/// Fetches the registry from the data repository (at start and on "reload" in the hub).
pub async fn refresh_registry() {
    let fetch = async {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?;
        let text = client
            .get(crate::modules::hub::hub_url(REGISTRY_FILE))
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        parse_registry(&text).ok_or("keine gültige Registry")?;
        let data_dir = PathBuf::from(resolve_app_paths().data_dir);
        fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
        fs::write(data_dir.join(REGISTRY_FILE), text).map_err(|e| e.to_string())
    };
    if let Err(e) = fetch.await {
        tracing::debug!("Musik-Registry nicht geladen: {e}");
    }
}

fn describe_in(pack: &RegistryPack, lang: &str) -> String {
    [lang, "en", "de"]
        .iter()
        .find_map(|code| pack.description.get(*code))
        .or_else(|| pack.description.values().next())
        .cloned()
        .unwrap_or_default()
}

fn pack_info(pack: &RegistryPack, dir: &Path, lang: &str) -> MusicPackInfo {
    let installed = pack
        .tracks
        .iter()
        .filter(|t| dir.join(&t.mood).join(&t.file).is_file())
        .count();
    let mut moods: Vec<String> = Vec::new();
    for mood in MOODS {
        if pack.tracks.iter().any(|t| t.mood == mood) {
            moods.push(mood.to_string());
        }
    }
    let bytes: u64 = pack.tracks.iter().map(|t| t.size_bytes).sum();
    MusicPackInfo {
        id: pack.id.clone(),
        name: pack.name.clone(),
        author: pack.author.clone(),
        license: pack.license.clone(),
        license_url: pack.license_url.clone(),
        description: describe_in(pack, lang),
        track_count: pack.tracks.len() as u32,
        installed_count: installed as u32,
        size_mb: (bytes as f64 / 1_048_576.0 * 10.0).round() / 10.0,
        moods,
    }
}

/// The music packs of the registry with how many of their tracks are there.
pub fn catalog(lang: &str) -> Vec<MusicPackInfo> {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let dir = music_dir(&data_dir);
    registry(&data_dir)
        .packs
        .iter()
        .map(|pack| pack_info(pack, &dir, lang))
        .collect()
}

/// Text file next to the music naming each track's source and licence (CC BY needs it).
fn licence_text(pack: &RegistryPack) -> String {
    let mut text = format!("{}\n", pack.name);
    if !pack.author.is_empty() {
        text.push_str(&format!("{}\n", pack.author));
    }
    text.push_str(&format!("{} {}\n\n", pack.license, pack.license_url));
    for t in &pack.tracks {
        let title = if t.title.is_empty() {
            &t.file
        } else {
            &t.title
        };
        let author = if t.author.is_empty() {
            &pack.author
        } else {
            &t.author
        };
        text.push_str(&format!(
            "{}/{}: \"{}\" – {} ({})\n",
            t.mood, t.file, title, author, t.url
        ));
    }
    text
}

/// Downloads the missing tracks of a pack into the mood folders (SHA-256 checked). Returns how
/// many tracks were fetched.
pub async fn download_pack(pack_id: &str) -> Result<u32, String> {
    use futures_util::StreamExt;
    use sha2::{Digest, Sha256};
    use std::io::Write;

    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let pack = registry(&data_dir)
        .packs
        .into_iter()
        .find(|p| p.id == pack_id)
        .ok_or_else(|| crate::err!("backend.music.unknownPack", name = pack_id))?;
    let dir = music_dir(&data_dir);
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
    let mut fetched = 0;
    for track in &pack.tracks {
        let mood_dir = dir.join(&track.mood);
        let target = mood_dir.join(&track.file);
        if target.is_file() {
            continue;
        }
        fs::create_dir_all(&mood_dir)
            .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
        info!("Lade Musik herunter: {} von {}", track.file, track.url);
        let resp = client
            .get(&track.url)
            .send()
            .await
            .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;
        if !resp.status().is_success() {
            return Err(crate::err!(
                "backend.common.downloadStatus",
                status = resp.status()
            ));
        }
        let partial = mood_dir.join(format!("{}.part", track.file));
        let mut out = fs::File::create(&partial)
            .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;
        let mut hasher = Sha256::new();
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| crate::err!("backend.common.downloadRead", error = e))?;
            hasher.update(&chunk);
            out.write_all(&chunk)
                .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        }
        drop(out);
        let digest: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if digest != track.sha256 {
            let _ = fs::remove_file(&partial);
            return Err(crate::err!("backend.music.checksum", name = track.file));
        }
        fs::rename(&partial, &target)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        fetched += 1;
    }
    fs::write(
        dir.join(format!("{}-lizenz.txt", pack.id)),
        licence_text(&pack),
    )
    .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    Ok(fetched)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHA: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn shipped_registry_parses() {
        assert!(parse_registry(BUNDLED_REGISTRY).is_some());
    }

    #[test]
    fn registry_drops_unsafe_tracks_and_empty_packs() {
        let text = format!(
            r#"{{"version": 2, "packs": [
                {{"id": "rpg", "name": "RPG", "license": "CC0", "tracks": [
                    {{"mood": "combat", "file": "fight.ogg", "url": "https://x/f.ogg", "sha256": "{SHA}", "size_bytes": 10}},
                    {{"mood": "party", "file": "a.ogg", "url": "https://x/a.ogg", "sha256": "{SHA}", "size_bytes": 10}},
                    {{"mood": "calm", "file": "../evil.ogg", "url": "https://x/e.ogg", "sha256": "{SHA}", "size_bytes": 10}},
                    {{"mood": "calm", "file": "plain.ogg", "url": "http://x/p.ogg", "sha256": "{SHA}", "size_bytes": 10}},
                    {{"mood": "calm", "file": "song.exe", "url": "https://x/s.exe", "sha256": "{SHA}", "size_bytes": 10}}
                ]}},
                {{"id": "Bad Id", "name": "X", "license": "CC0", "tracks": [
                    {{"mood": "calm", "file": "b.ogg", "url": "https://x/b.ogg", "sha256": "{SHA}", "size_bytes": 10}}
                ]}}
            ]}}"#
        );
        let registry = parse_registry(&text).unwrap();
        assert_eq!(registry.packs.len(), 1);
        assert_eq!(registry.packs[0].tracks.len(), 1);
        assert_eq!(registry.packs[0].tracks[0].file, "fight.ogg");
    }

    #[test]
    fn lists_music_per_mood_folder() {
        let dir = std::env::temp_dir().join(format!("otakusoul-music-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("combat")).unwrap();
        fs::create_dir_all(dir.join("unknown")).unwrap();
        fs::write(dir.join("combat").join("b.mp3"), b"x").unwrap();
        fs::write(dir.join("combat").join("a.OGG"), b"x").unwrap();
        fs::write(dir.join("combat").join("notes.txt"), b"x").unwrap();
        fs::write(dir.join("combat").join("c.ogg.part"), b"x").unwrap();
        fs::write(dir.join("unknown").join("d.ogg"), b"x").unwrap();
        let names: Vec<(String, String)> = tracks_in(&dir)
            .into_iter()
            .map(|t| (t.mood, t.name))
            .collect();
        assert_eq!(
            names,
            vec![
                ("combat".to_string(), "a.OGG".to_string()),
                ("combat".to_string(), "b.mp3".to_string())
            ]
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
