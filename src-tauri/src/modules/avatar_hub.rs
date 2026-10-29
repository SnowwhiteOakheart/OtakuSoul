//! Avatars in the hub: VRM and Live2D models from the data repository (or straight from their
//! source), each file checked by SHA-256, and models that may only be downloaded on their own
//! page (VRoid Hub), offered as a link. The registry ships with the app and is refreshed from
//! the hub at start; Inochi2D puppets keep their own registry (`inochi2d.rs`).

use crate::modules::paths::resolve_app_paths;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tracing::info;
use ts_rs::TS;

const BUNDLED_REGISTRY: &str = include_str!("../../../presets/avatars_registry.json");
const REGISTRY_FILE: &str = "avatars_registry.json";

#[derive(Debug, Clone, Deserialize)]
struct Registry {
    version: u32,
    avatars: Vec<RegistryAvatar>,
}

#[derive(Debug, Clone, Deserialize)]
struct RegistryAvatar {
    id: String,
    kind: String,
    name: String,
    author: String,
    license: String,
    #[serde(default)]
    license_url: String,
    /// Notice the licence asks to show (Live2D sample data).
    #[serde(default)]
    license_note: String,
    #[serde(default)]
    source_url: String,
    /// Where the model can be downloaded by hand when it may not be passed on.
    #[serde(default)]
    page_url: String,
    #[serde(default)]
    nsfw: bool,
    /// The file the app opens (VRM file, Live2D `.model3.json`), relative like `files[].path`.
    #[serde(default)]
    entry: String,
    #[serde(default)]
    files: Vec<RegistryFile>,
    #[serde(default)]
    description: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
struct RegistryFile {
    /// Path below the model folder of its kind (`Seed-san.vrm`, `mao_pro/mao_pro.moc3`).
    path: String,
    url: String,
    sha256: String,
    size_bytes: u64,
}

/// An avatar as the hub shows it.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct HubAvatar {
    pub id: String,
    /// `vrm` or `live2d`.
    pub kind: String,
    pub name: String,
    pub author: String,
    pub license: String,
    pub license_url: String,
    pub license_note: String,
    pub source_url: String,
    /// Page to download it by hand (only when it cannot be loaded here).
    pub page_url: String,
    pub description: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
    /// The app can load it itself.
    pub downloadable: bool,
    /// Already in the user's folder.
    pub installed: bool,
    pub nsfw: bool,
}

/// A relative path without `..`, roots or backslashes.
fn safe_relative(path: &str) -> bool {
    !path.is_empty()
        && !path.contains('\\')
        && Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(_)))
}

fn valid_sha(sha: &str) -> bool {
    sha.len() == 64
        && sha
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

fn valid_avatar(a: &RegistryAvatar) -> bool {
    let id_ok = !a.id.is_empty()
        && a.id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    let files_ok = a.files.iter().all(|f| {
        safe_relative(&f.path)
            && f.url.starts_with("https://")
            && valid_sha(&f.sha256)
            && f.size_bytes > 0
    });
    let loadable = !a.files.is_empty() && a.files.iter().any(|f| f.path == a.entry);
    let linked = a.files.is_empty() && a.page_url.starts_with("https://");
    id_ok
        && matches!(a.kind.as_str(), "vrm" | "live2d")
        && !a.name.trim().is_empty()
        && files_ok
        && (loadable || linked)
}

/// Parses a registry and drops invalid entries; `None` if nothing usable is left.
fn parse_registry(text: &str) -> Option<Registry> {
    let mut registry: Registry = serde_json::from_str(text).ok()?;
    registry.avatars.retain(valid_avatar);
    (!registry.avatars.is_empty()).then_some(registry)
}

/// The registry in use: the downloaded copy if it is newer than the shipped one.
fn registry(data_dir: &Path) -> Registry {
    let bundled = parse_registry(BUNDLED_REGISTRY).expect("shipped avatar registry is valid");
    fs::read_to_string(data_dir.join(REGISTRY_FILE))
        .ok()
        .and_then(|text| parse_registry(&text))
        .filter(|downloaded| downloaded.version > bundled.version)
        .unwrap_or(bundled)
}

/// Fetches the registry from the data repository at start (kept for the next catalog request).
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
        tracing::debug!("Avatar-Registry nicht geladen: {e}");
    }
}

/// `dir` joined with a registry path (`mao_pro/mao_pro.moc3`) part by part, so the result uses the
/// platform's separators like the paths the model scanners report.
fn join_relative(dir: &Path, path: &str) -> PathBuf {
    path.split('/')
        .fold(dir.to_path_buf(), |acc, part| acc.join(part))
}

/// The user's folder for models of this kind (where imports go as well).
fn kind_dir(data_dir: &Path, kind: &str) -> PathBuf {
    match kind {
        "live2d" => data_dir.join("live2d"),
        _ => data_dir.join("avatars"),
    }
}

fn describe(a: &RegistryAvatar, lang: &str, data_dir: &Path) -> HubAvatar {
    let description = [lang, "en", "de"]
        .iter()
        .find_map(|l| a.description.get(*l))
        .or_else(|| a.description.values().next())
        .cloned()
        .unwrap_or_default();
    let dir = kind_dir(data_dir, &a.kind);
    let downloadable = !a.files.is_empty();
    HubAvatar {
        id: a.id.clone(),
        kind: a.kind.clone(),
        name: a.name.clone(),
        author: a.author.clone(),
        license: a.license.clone(),
        license_url: a.license_url.clone(),
        license_note: a.license_note.clone(),
        source_url: a.source_url.clone(),
        page_url: a.page_url.clone(),
        description,
        size_bytes: a.files.iter().map(|f| f.size_bytes).sum(),
        downloadable,
        installed: downloadable
            && a.files
                .iter()
                .all(|f| join_relative(&dir, &f.path).is_file()),
        nsfw: a.nsfw,
    }
}

fn catalog_in(registry: &Registry, lang: &str, data_dir: &Path, adult: bool) -> Vec<HubAvatar> {
    registry
        .avatars
        .iter()
        .filter(|a| adult || !a.nsfw)
        .map(|a| describe(a, lang, data_dir))
        .collect()
}

/// The avatars the hub offers (18+ entries only with the adult setting).
pub fn catalog(lang: &str) -> Vec<HubAvatar> {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    catalog_in(
        &registry(&data_dir),
        lang,
        &data_dir,
        crate::modules::nsfw::allowed(),
    )
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// What was loaded: the model's kind and the file the app opens.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct HubAvatarInstalled {
    pub kind: String,
    pub path: String,
}

/// Downloads an avatar's files into the user's folder of its kind (each checked by SHA-256,
/// files already there are kept) and returns the file to open.
pub async fn download_hub_avatar(avatar_id: &str) -> Result<HubAvatarInstalled, String> {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let adult = crate::modules::nsfw::allowed();
    let avatar = registry(&data_dir)
        .avatars
        .into_iter()
        .find(|a| a.id == avatar_id && (adult || !a.nsfw) && !a.files.is_empty())
        .ok_or_else(|| crate::err!("backend.avatarHub.unknown", name = avatar_id))?;
    let dir = kind_dir(&data_dir, &avatar.kind);
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
    for file in &avatar.files {
        let target = join_relative(&dir, &file.path);
        if target.is_file() {
            continue;
        }
        info!("Lade Avatar-Datei herunter: {} von {}", file.path, file.url);
        let resp = client
            .get(&file.url)
            .send()
            .await
            .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;
        if !resp.status().is_success() {
            return Err(crate::err!(
                "backend.common.downloadStatus",
                status = resp.status()
            ));
        }
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| crate::err!("backend.common.downloadRead", error = e))?;
        if sha256_hex(&bytes) != file.sha256 {
            return Err(crate::err!("backend.avatarHub.checksum", name = file.path));
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
        }
        let partial = target.with_extension("part");
        fs::write(&partial, &bytes)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        fs::rename(&partial, &target)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    Ok(HubAvatarInstalled {
        kind: avatar.kind.clone(),
        path: join_relative(&dir, &avatar.entry)
            .to_string_lossy()
            .into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_paths_use_the_platform_separator() {
        let joined = join_relative(Path::new("base"), "mao_pro/mao_pro.model3.json");
        assert_eq!(
            joined,
            Path::new("base")
                .join("mao_pro")
                .join("mao_pro.model3.json")
        );
    }

    #[test]
    fn the_shipped_registry_is_valid() {
        let registry = parse_registry(BUNDLED_REGISTRY).unwrap();
        assert!(
            registry
                .avatars
                .iter()
                .any(|a| a.kind == "live2d" && !a.files.is_empty())
        );
        assert!(
            registry
                .avatars
                .iter()
                .any(|a| a.kind == "vrm" && !a.files.is_empty())
        );
        assert!(
            registry
                .avatars
                .iter()
                .any(|a| a.files.is_empty() && !a.page_url.is_empty())
        );
    }

    #[test]
    fn unsafe_paths_and_incomplete_entries_are_dropped() {
        let sha = "0".repeat(64);
        let text = format!(
            r#"{{"version":1,"avatars":[
            {{"id":"bad-path","kind":"vrm","name":"A","author":"x","license":"CC0","entry":"../a.vrm",
              "files":[{{"path":"../a.vrm","url":"https://x/a","sha256":"{sha}","size_bytes":1}}]}},
            {{"id":"no-entry","kind":"live2d","name":"B","author":"x","license":"CC0","entry":"b/c.model3.json",
              "files":[{{"path":"b/d.moc3","url":"https://x/d","sha256":"{sha}","size_bytes":1}}]}},
            {{"id":"no-page","kind":"vrm","name":"C","author":"x","license":"x","page_url":"http://x"}},
            {{"id":"ok","kind":"live2d","name":"D","author":"x","license":"x","entry":"d/d.model3.json",
              "files":[{{"path":"d/d.model3.json","url":"https://x/d","sha256":"{sha}","size_bytes":2}}]}}]}}"#
        );
        let registry = parse_registry(&text).unwrap();
        assert_eq!(
            registry
                .avatars
                .iter()
                .map(|a| a.id.as_str())
                .collect::<Vec<_>>(),
            ["ok"]
        );
    }

    #[test]
    fn installed_needs_every_file_and_adult_entries_stay_hidden() {
        let dir = std::env::temp_dir().join(format!("otakusoul-avatar-hub-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let mut registry = parse_registry(BUNDLED_REGISTRY).unwrap();
        let live2d = registry
            .avatars
            .iter()
            .find(|a| a.kind == "live2d")
            .unwrap()
            .clone();
        assert!(!describe(&live2d, "de", &dir).installed);
        for f in &live2d.files {
            let target = join_relative(&kind_dir(&dir, "live2d"), &f.path);
            fs::create_dir_all(target.parent().unwrap()).unwrap();
            fs::write(target, b"x").unwrap();
        }
        assert!(describe(&live2d, "de", &dir).installed);
        registry.avatars[0].nsfw = true;
        let hidden = registry.avatars[0].id.clone();
        assert!(
            !catalog_in(&registry, "de", &dir, false)
                .iter()
                .any(|a| a.id == hidden)
        );
        assert!(
            catalog_in(&registry, "de", &dir, true)
                .iter()
                .any(|a| a.id == hidden)
        );
        let _ = fs::remove_dir_all(&dir);
    }
}
