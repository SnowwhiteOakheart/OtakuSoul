//! Ready-made sets of body motions (VRMA) for 3D avatars and the desktop pet, offered in the
//! avatar settings. Never bundled: each file is loaded from the data repository and checked
//! (SHA-256); the registry ships with the app and is refreshed from the hub at start, like the
//! Inochi2D example puppets.

use crate::modules::avatar_motions;
use crate::modules::paths::resolve_app_paths;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;
use ts_rs::TS;

const BUNDLED_REGISTRY: &str = include_str!("../../../presets/motion_packs_registry.json");
const REGISTRY_FILE: &str = "motion_packs_registry.json";

#[derive(Debug, Clone, Deserialize)]
struct Registry {
    version: u32,
    packs: Vec<RegistryPack>,
}

#[derive(Debug, Clone, Deserialize)]
struct RegistryPack {
    id: String,
    name: String,
    author: String,
    license: String,
    #[serde(default)]
    license_url: String,
    #[serde(default)]
    source_url: String,
    #[serde(default)]
    description: BTreeMap<String, String>,
    files: Vec<RegistryFile>,
}

#[derive(Debug, Clone, Deserialize)]
struct RegistryFile {
    file: String,
    url: String,
    sha256: String,
    size_bytes: u64,
    /// The use the motion gets on install (one of `avatar_motions::ROLES`).
    #[serde(default)]
    role: String,
}

/// A pack as the settings show it.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct MotionPackItem {
    pub id: String,
    pub name: String,
    pub author: String,
    pub license: String,
    pub license_url: String,
    pub source_url: String,
    pub description: String,
    #[ts(type = "number")]
    pub size_bytes: u64,
    /// Its motions, by use (for the list in the settings).
    pub roles: Vec<String>,
    /// All its files are in the animations folder.
    pub installed: bool,
}

/// A plain `.vrma` file name, an https source, a checksum and a known use.
fn valid_file(f: &RegistryFile) -> bool {
    let name = Path::new(&f.file);
    !f.file.contains(['/', '\\'])
        && !f.file.starts_with('.')
        && name
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("vrma"))
        && f.url.starts_with("https://")
        && f.sha256.len() == 64
        && f.sha256
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        && f.size_bytes > 0
        && (f.role.is_empty() || avatar_motions::ROLES.contains(&f.role.as_str()))
}

/// Parses a registry and drops invalid files and empty packs; `None` if nothing is left.
fn parse_registry(text: &str) -> Option<Registry> {
    let mut registry: Registry = serde_json::from_str(text).ok()?;
    for pack in &mut registry.packs {
        pack.files.retain(valid_file);
    }
    registry
        .packs
        .retain(|p| !p.files.is_empty() && !p.id.trim().is_empty() && !p.name.trim().is_empty());
    (!registry.packs.is_empty()).then_some(registry)
}

/// The registry in use: the downloaded copy if it is newer than the shipped one.
fn registry(data_dir: &Path) -> Registry {
    let bundled = parse_registry(BUNDLED_REGISTRY).expect("shipped motion pack registry is valid");
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
        tracing::debug!("Bewegungspaket-Registry nicht geladen: {e}");
    }
}

fn describe(pack: &RegistryPack, lang: &str, dir: &Path) -> MotionPackItem {
    let description = [lang, "en", "de"]
        .iter()
        .find_map(|l| pack.description.get(*l))
        .or_else(|| pack.description.values().next())
        .cloned()
        .unwrap_or_default();
    let mut roles: Vec<String> = pack
        .files
        .iter()
        .filter(|f| !f.role.is_empty())
        .map(|f| f.role.clone())
        .collect();
    roles.dedup();
    MotionPackItem {
        id: pack.id.clone(),
        name: pack.name.clone(),
        author: pack.author.clone(),
        license: pack.license.clone(),
        license_url: pack.license_url.clone(),
        source_url: pack.source_url.clone(),
        description,
        size_bytes: pack.files.iter().map(|f| f.size_bytes).sum(),
        roles,
        installed: pack.files.iter().all(|f| dir.join(&f.file).is_file()),
    }
}

fn catalog_in(registry: &Registry, lang: &str, dir: &Path) -> Vec<MotionPackItem> {
    registry
        .packs
        .iter()
        .map(|p| describe(p, lang, dir))
        .collect()
}

/// The offered packs and whether they are installed.
pub fn catalog(lang: &str) -> Vec<MotionPackItem> {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    catalog_in(&registry(&data_dir), lang, &avatar_motions::motions_dir())
}

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Gives each file of the pack its use, unless the user already chose one for it.
fn assign_roles(pack: &RegistryPack, dir: &Path) -> Result<(), String> {
    let chosen = avatar_motions::read_roles(dir);
    for file in &pack.files {
        if !file.role.is_empty() && !chosen.contains_key(&file.file) {
            avatar_motions::set_role_in(dir, &file.file, &file.role)?;
        }
    }
    Ok(())
}

/// Downloads the files of a pack into the animations folder (each checked against its
/// SHA-256; present files are kept) and gives them their uses.
pub async fn download_motion_pack(pack_id: &str) -> Result<Vec<avatar_motions::AvatarMotion>, String> {
    let data_dir = PathBuf::from(resolve_app_paths().data_dir);
    let pack = registry(&data_dir)
        .packs
        .into_iter()
        .find(|p| p.id == pack_id)
        .ok_or_else(|| crate::err!("backend.motionPack.unknown", name = pack_id))?;
    let dir = avatar_motions::motions_dir();
    fs::create_dir_all(&dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
    for file in &pack.files {
        let target = dir.join(&file.file);
        if target.is_file() {
            continue;
        }
        info!("Lade Bewegung herunter: {} von {}", file.file, file.url);
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
            return Err(crate::err!("backend.motionPack.checksum", name = file.file));
        }
        let partial = dir.join(format!("{}.part", file.file));
        fs::write(&partial, &bytes).map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        fs::rename(&partial, &target).map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    assign_roles(&pack, &dir)?;
    Ok(avatar_motions::scan_avatar_motions())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_shipped_registry_is_valid_and_complete() {
        let registry = parse_registry(BUNDLED_REGISTRY).unwrap();
        let pack = &registry.packs[0];
        assert!(pack.files.len() >= 6);
        assert!(pack.files.iter().all(valid_file));
        assert!(pack.files.iter().any(|f| f.role == "idle"));
        assert!(pack.files.iter().any(|f| f.role == "walk"));
    }

    #[test]
    fn invalid_files_and_empty_packs_are_dropped() {
        let text = r#"{"version":1,"packs":[
            {"id":"a","name":"A","author":"x","license":"CC0","files":[
                {"file":"../evil.vrma","url":"https://x/e","sha256":"00","size_bytes":1,"role":"idle"},
                {"file":"ok.vrma","url":"http://x/ok","sha256":"0000000000000000000000000000000000000000000000000000000000000000","size_bytes":1}]},
            {"id":"b","name":"B","author":"x","license":"CC0","files":[
                {"file":"b.vrma","url":"https://x/b","sha256":"0000000000000000000000000000000000000000000000000000000000000000","size_bytes":3,"role":"dance"}]}]}"#;
        let registry = parse_registry(text).unwrap();
        assert_eq!(registry.packs.len(), 1);
        assert_eq!(registry.packs[0].id, "b");
    }

    #[test]
    fn installed_needs_every_file_and_roles_keep_the_users_choice() {
        let dir = std::env::temp_dir().join(format!("otakusoul-motion-packs-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let registry = parse_registry(BUNDLED_REGISTRY).unwrap();
        let pack = &registry.packs[0];
        assert!(!describe(pack, "de", &dir).installed);
        for f in &pack.files {
            fs::write(dir.join(&f.file), b"x").unwrap();
        }
        assert!(describe(pack, "de", &dir).installed);
        let first = &pack.files[0];
        avatar_motions::set_role_in(&dir, &first.file, "").unwrap();
        assign_roles(pack, &dir).unwrap();
        let roles = avatar_motions::read_roles(&dir);
        assert_eq!(roles.get(&first.file).map(String::as_str), Some(""));
        assert_eq!(roles.get(&pack.files[1].file), Some(&pack.files[1].role));
        let _ = fs::remove_dir_all(&dir);
    }
}
