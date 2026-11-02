//! Sync between devices without an own server: a device uploads a profile backup into a shared
//! folder (Nextcloud, Dropbox, Syncthing, OneDrive …) or onto a WebDAV server, the others see it
//! there and restore it (with the usual safety snapshot). Whole states, no merging.
//!
//! Layout at the target: `OtakuSoul-Sync/<device id>/<backup>.zip` plus `<backup>.json` with the
//! [`SyncSnapshot`] (written after the ZIP, so a listed snapshot is always complete).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tracing::{info, warn};
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;
use crate::modules::profile_backup::{BackupGroupSelection, ProfileBackupManager};

/// Folder at the target that holds the devices.
pub const SYNC_ROOT: &str = "OtakuSoul-Sync";
const CONFIG_FILE: &str = "sync.json";
const SECRET_ACCOUNT: &str = "sync_webdav_password";
const DEFAULT_KEEP: u32 = 5;
const MAX_KEEP: u32 = 50;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum SyncTargetKind {
    #[default]
    Off,
    Folder,
    Webdav,
}

fn default_keep() -> u32 {
    DEFAULT_KEEP
}

/// Everything but the settings: those hold paths, GPUs and models of this very device.
fn default_groups() -> BackupGroupSelection {
    BackupGroupSelection {
        settings: false,
        ..BackupGroupSelection::default()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SyncConfig {
    #[serde(default)]
    pub kind: SyncTargetKind,
    /// Shared folder (`Folder`).
    #[serde(default)]
    pub folder: String,
    /// WebDAV folder URL, e.g. `https://cloud.example.org/remote.php/dav/files/me/`.
    #[serde(default)]
    pub webdav_url: String,
    #[serde(default)]
    pub webdav_user: String,
    /// Kept in the OS credential store; the file holds it only without one.
    #[serde(default)]
    pub webdav_password: String,
    /// Fixed per installation; names this device's folder at the target.
    #[serde(default)]
    pub device_id: String,
    #[serde(default)]
    pub device_name: String,
    /// Uploads of this device kept at the target (older ones are deleted).
    #[serde(default = "default_keep")]
    pub keep: u32,
    #[serde(default = "default_groups")]
    pub groups: BackupGroupSelection,
    /// `created_at` of the newest state this device uploaded or restored.
    #[serde(default)]
    pub last_sync_at: Option<String>,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            kind: SyncTargetKind::Off,
            folder: String::new(),
            webdav_url: String::new(),
            webdav_user: String::new(),
            webdav_password: String::new(),
            device_id: String::new(),
            device_name: String::new(),
            keep: DEFAULT_KEEP,
            groups: default_groups(),
            last_sync_at: None,
        }
    }
}

/// One uploaded state at the target (the `.json` next to its ZIP).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SyncSnapshot {
    pub device_id: String,
    pub device_name: String,
    pub filename: String,
    pub created_at: String,
    pub size_bytes: u64,
    pub app_version: String,
    pub groups: BackupGroupSelection,
    pub description: Option<String>,
    /// Uploaded by this device (set when listing).
    #[serde(default)]
    pub own: bool,
}

fn config_path() -> PathBuf {
    PathBuf::from(resolve_app_paths().config_dir).join(CONFIG_FILE)
}

fn new_device_id() -> String {
    format!("{:016x}", rand::random::<u64>())
}

fn host_name() -> String {
    sysinfo::System::host_name()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "OtakuSoul".to_string())
}

/// Fills what a fresh config lacks (device id and name) and keeps values in range.
fn complete(mut config: SyncConfig) -> SyncConfig {
    if !valid_device_id(&config.device_id) {
        config.device_id = new_device_id();
    }
    if config.device_name.trim().is_empty() {
        config.device_name = host_name();
    }
    config.device_name = config.device_name.trim().chars().take(64).collect();
    config.keep = config.keep.clamp(1, MAX_KEEP);
    config
}

pub fn load_config() -> SyncConfig {
    let path = config_path();
    let stored = std::fs::read_to_string(&path)
        .ok()
        .and_then(|text| serde_json::from_str::<SyncConfig>(&text).ok());
    let fresh = stored.is_none();
    let mut config = complete(stored.unwrap_or_default());
    let plaintext = crate::modules::secrets::hydrate(SECRET_ACCOUNT, &mut config.webdav_password);
    // A new device id must stay the same from now on; a plaintext password moves to the keyring.
    if fresh || plaintext {
        let _ = save_config(&config);
    }
    config
}

pub fn save_config(config: &SyncConfig) -> Result<SyncConfig, String> {
    let config = complete(config.clone());
    let mut stored = config.clone();
    crate::modules::secrets::externalize(SECRET_ACCOUNT, &mut stored.webdav_password);
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| crate::err!("backend.sync.save", error = e))?;
    }
    let json = serde_json::to_string_pretty(&stored)
        .map_err(|e| crate::err!("backend.sync.save", error = e))?;
    std::fs::write(&path, json).map_err(|e| crate::err!("backend.sync.save", error = e))?;
    Ok(config)
}

fn valid_device_id(id: &str) -> bool {
    (8..=32).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}

/// A backup name as the target may hold it: one plain file name, ZIP.
fn valid_filename(name: &str) -> bool {
    name.len() <= 160
        && name.ends_with(".zip")
        && !name.starts_with('.')
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-' || b == b'.')
}

// ---------------------------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------------------------

enum Target {
    Folder(PathBuf),
    Webdav {
        base: String,
        user: String,
        password: String,
        client: reqwest::Client,
    },
}

/// A WebDAV entry of a folder listing.
#[derive(Debug, PartialEq)]
struct DavEntry {
    name: String,
    is_dir: bool,
}

impl Target {
    fn from_config(config: &SyncConfig) -> Result<Self, String> {
        match config.kind {
            SyncTargetKind::Off => Err(crate::err!("backend.sync.off")),
            SyncTargetKind::Folder => {
                let folder = config.folder.trim();
                if folder.is_empty() || !Path::new(folder).is_dir() {
                    return Err(crate::err!("backend.sync.folderMissing", path = folder));
                }
                Ok(Target::Folder(PathBuf::from(folder)))
            }
            SyncTargetKind::Webdav => {
                let url = config.webdav_url.trim().trim_end_matches('/');
                if !(url.starts_with("https://") || url.starts_with("http://")) {
                    return Err(crate::err!("backend.sync.urlInvalid", url = url));
                }
                let client = reqwest::Client::builder()
                    .connect_timeout(Duration::from_secs(15))
                    .build()
                    .map_err(|e| crate::err!("backend.sync.network", error = e))?;
                Ok(Target::Webdav {
                    base: url.to_string(),
                    user: config.webdav_user.trim().to_string(),
                    password: config.webdav_password.clone(),
                    client,
                })
            }
        }
    }

    fn url(base: &str, parts: &[&str], dir: bool) -> String {
        let mut url = base.to_string();
        for part in parts {
            url.push('/');
            url.push_str(&urlencoding::encode(part));
        }
        if dir {
            url.push('/');
        }
        url
    }

    fn request(&self, method: &str, url: &str) -> reqwest::RequestBuilder {
        let Target::Webdav {
            user,
            password,
            client,
            ..
        } = self
        else {
            unreachable!("only WebDAV targets send requests")
        };
        let method = reqwest::Method::from_bytes(method.as_bytes()).expect("valid HTTP method");
        let request = client.request(method, url);
        if user.is_empty() {
            request
        } else {
            request.basic_auth(user, Some(password))
        }
    }

    async fn send(
        &self,
        request: reqwest::RequestBuilder,
        timeout: Duration,
    ) -> Result<reqwest::Response, String> {
        let response = request
            .timeout(timeout)
            .send()
            .await
            .map_err(|e| crate::err!("backend.sync.network", error = e))?;
        match response.status().as_u16() {
            401 | 403 => Err(crate::err!("backend.sync.auth")),
            _ => Ok(response),
        }
    }

    /// Creates `SYNC_ROOT/<parts…>` (existing folders are fine).
    async fn ensure_dir(&self, parts: &[&str]) -> Result<(), String> {
        match self {
            Target::Folder(root) => {
                let mut dir = root.clone();
                for part in parts {
                    dir.push(part);
                }
                tokio::fs::create_dir_all(&dir)
                    .await
                    .map_err(|e| crate::err!("backend.sync.write", error = e))
            }
            Target::Webdav { base, .. } => {
                for depth in 1..=parts.len() {
                    let url = Self::url(base, &parts[..depth], true);
                    let response = self
                        .send(self.request("MKCOL", &url), Duration::from_secs(30))
                        .await?;
                    // 405: exists already.
                    let status = response.status();
                    if !(status.is_success() || status.as_u16() == 405) {
                        return Err(crate::err!(
                            "backend.sync.http",
                            status = status.as_u16(),
                            url = url
                        ));
                    }
                }
                Ok(())
            }
        }
    }

    /// Copies a local file to `parts` (via a temporary name, so nobody sees half a file).
    async fn put_file(&self, parts: &[&str], source: &Path) -> Result<(), String> {
        match self {
            Target::Folder(root) => {
                let target = parts.iter().fold(root.clone(), |dir, part| dir.join(part));
                let name = target
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let partial = target.with_file_name(format!(".{name}.part"));
                tokio::fs::copy(source, &partial)
                    .await
                    .map_err(|e| crate::err!("backend.sync.write", error = e))?;
                tokio::fs::rename(&partial, &target)
                    .await
                    .map_err(|e| crate::err!("backend.sync.write", error = e))
            }
            Target::Webdav { base, .. } => {
                let file = tokio::fs::File::open(source)
                    .await
                    .map_err(|e| crate::err!("backend.sync.write", error = e))?;
                let size = file.metadata().await.map(|m| m.len()).unwrap_or(0);
                let url = Self::url(base, parts, false);
                let request = self
                    .request("PUT", &url)
                    .header(reqwest::header::CONTENT_LENGTH, size)
                    .body(reqwest::Body::from(file));
                let response = self.send(request, Duration::from_secs(60 * 60)).await?;
                if !response.status().is_success() {
                    return Err(crate::err!(
                        "backend.sync.http",
                        status = response.status().as_u16(),
                        url = url
                    ));
                }
                Ok(())
            }
        }
    }

    async fn put_bytes(&self, parts: &[&str], bytes: Vec<u8>) -> Result<(), String> {
        match self {
            Target::Folder(root) => {
                let target = parts.iter().fold(root.clone(), |dir, part| dir.join(part));
                let name = target
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                let partial = target.with_file_name(format!(".{name}.part"));
                tokio::fs::write(&partial, bytes)
                    .await
                    .map_err(|e| crate::err!("backend.sync.write", error = e))?;
                tokio::fs::rename(&partial, &target)
                    .await
                    .map_err(|e| crate::err!("backend.sync.write", error = e))
            }
            Target::Webdav { base, .. } => {
                let url = Self::url(base, parts, false);
                let response = self
                    .send(
                        self.request("PUT", &url).body(bytes),
                        Duration::from_secs(60),
                    )
                    .await?;
                if !response.status().is_success() {
                    return Err(crate::err!(
                        "backend.sync.http",
                        status = response.status().as_u16(),
                        url = url
                    ));
                }
                Ok(())
            }
        }
    }

    async fn get_bytes(&self, parts: &[&str]) -> Result<Vec<u8>, String> {
        match self {
            Target::Folder(root) => {
                let path = parts.iter().fold(root.clone(), |dir, part| dir.join(part));
                tokio::fs::read(&path)
                    .await
                    .map_err(|e| crate::err!("backend.sync.read", error = e))
            }
            Target::Webdav { base, .. } => {
                let url = Self::url(base, parts, false);
                let response = self
                    .send(self.request("GET", &url), Duration::from_secs(60))
                    .await?;
                if !response.status().is_success() {
                    return Err(crate::err!(
                        "backend.sync.http",
                        status = response.status().as_u16(),
                        url = url
                    ));
                }
                Ok(response
                    .bytes()
                    .await
                    .map_err(|e| crate::err!("backend.sync.network", error = e))?
                    .to_vec())
            }
        }
    }

    async fn get_file(&self, parts: &[&str], target: &Path) -> Result<(), String> {
        match self {
            Target::Folder(root) => {
                let path = parts.iter().fold(root.clone(), |dir, part| dir.join(part));
                tokio::fs::copy(&path, target)
                    .await
                    .map(|_| ())
                    .map_err(|e| crate::err!("backend.sync.read", error = e))
            }
            Target::Webdav { base, .. } => {
                use tokio::io::AsyncWriteExt;
                let url = Self::url(base, parts, false);
                let mut response = self
                    .send(self.request("GET", &url), Duration::from_secs(60 * 60))
                    .await?;
                if !response.status().is_success() {
                    return Err(crate::err!(
                        "backend.sync.http",
                        status = response.status().as_u16(),
                        url = url
                    ));
                }
                let mut file = tokio::fs::File::create(target)
                    .await
                    .map_err(|e| crate::err!("backend.sync.write", error = e))?;
                while let Some(chunk) = response
                    .chunk()
                    .await
                    .map_err(|e| crate::err!("backend.sync.network", error = e))?
                {
                    file.write_all(&chunk)
                        .await
                        .map_err(|e| crate::err!("backend.sync.write", error = e))?;
                }
                file.flush()
                    .await
                    .map_err(|e| crate::err!("backend.sync.write", error = e))
            }
        }
    }

    async fn delete(&self, parts: &[&str]) -> Result<(), String> {
        match self {
            Target::Folder(root) => {
                let path = parts.iter().fold(root.clone(), |dir, part| dir.join(part));
                match tokio::fs::remove_file(&path).await {
                    Ok(()) => Ok(()),
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                    Err(e) => Err(crate::err!("backend.sync.write", error = e)),
                }
            }
            Target::Webdav { base, .. } => {
                let url = Self::url(base, parts, false);
                let response = self
                    .send(self.request("DELETE", &url), Duration::from_secs(60))
                    .await?;
                let status = response.status();
                if status.is_success() || status.as_u16() == 404 {
                    Ok(())
                } else {
                    Err(crate::err!(
                        "backend.sync.http",
                        status = status.as_u16(),
                        url = url
                    ))
                }
            }
        }
    }

    /// Entries of a folder; a missing folder is empty.
    async fn list(&self, parts: &[&str]) -> Result<Vec<DavEntry>, String> {
        match self {
            Target::Folder(root) => {
                let dir = parts.iter().fold(root.clone(), |dir, part| dir.join(part));
                let mut entries = Vec::new();
                let Ok(mut read) = tokio::fs::read_dir(&dir).await else {
                    return Ok(entries);
                };
                while let Ok(Some(entry)) = read.next_entry().await {
                    let is_dir = entry.file_type().await.is_ok_and(|t| t.is_dir());
                    entries.push(DavEntry {
                        name: entry.file_name().to_string_lossy().to_string(),
                        is_dir,
                    });
                }
                Ok(entries)
            }
            Target::Webdav { base, .. } => {
                let url = Self::url(base, parts, true);
                let body = r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>"#;
                let request = self
                    .request("PROPFIND", &url)
                    .header("Depth", "1")
                    .header(
                        reqwest::header::CONTENT_TYPE,
                        "application/xml; charset=utf-8",
                    )
                    .body(body);
                let response = self.send(request, Duration::from_secs(60)).await?;
                let status = response.status();
                if status.as_u16() == 404 {
                    return Ok(Vec::new());
                }
                if !status.is_success() {
                    return Err(crate::err!(
                        "backend.sync.http",
                        status = status.as_u16(),
                        url = url
                    ));
                }
                let xml = response
                    .text()
                    .await
                    .map_err(|e| crate::err!("backend.sync.network", error = e))?;
                Ok(parse_propfind(
                    &xml,
                    parts.last().copied().unwrap_or_default(),
                ))
            }
        }
    }
}

/// Children of a Depth-1 PROPFIND answer (any namespace prefix); the folder itself is left out.
fn parse_propfind(xml: &str, folder: &str) -> Vec<DavEntry> {
    let response_start =
        regex::Regex::new(r"<(?:[A-Za-z][\w.-]*:)?response[\s>]").expect("valid regex");
    let href =
        regex::Regex::new(r"<(?:[A-Za-z][\w.-]*:)?href[^>]*>([^<]*)</").expect("valid regex");
    let collection =
        regex::Regex::new(r"<(?:[A-Za-z][\w.-]*:)?collection\s*/?>").expect("valid regex");
    let starts: Vec<usize> = response_start.find_iter(xml).map(|m| m.start()).collect();
    let mut entries = Vec::new();
    for (index, start) in starts.iter().enumerate() {
        let end = starts.get(index + 1).copied().unwrap_or(xml.len());
        let chunk = &xml[*start..end];
        let Some(raw) = href.captures(chunk).and_then(|c| c.get(1)) else {
            continue;
        };
        let path = raw.as_str().replace("&amp;", "&");
        let decoded = urlencoding::decode(&path)
            .map(|p| p.into_owned())
            .unwrap_or(path);
        let name = decoded
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or_default()
            .to_string();
        let is_dir = collection.is_match(chunk);
        // The first answer is the folder that was asked for.
        if index == 0 && is_dir && (name == folder || folder.is_empty()) {
            continue;
        }
        if !name.is_empty() {
            entries.push(DavEntry { name, is_dir });
        }
    }
    entries
}

// ---------------------------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------------------------

/// Snapshots of all devices at the target, newest first.
async fn list_on(target: &Target, own_device: &str) -> Result<Vec<SyncSnapshot>, String> {
    let mut snapshots = Vec::new();
    for device in target.list(&[SYNC_ROOT]).await? {
        if !device.is_dir || !valid_device_id(&device.name) {
            continue;
        }
        for entry in target.list(&[SYNC_ROOT, &device.name]).await? {
            let Some(stem) = entry.name.strip_suffix(".json") else {
                continue;
            };
            if entry.is_dir || !valid_filename(&format!("{stem}.zip")) {
                continue;
            }
            let bytes = match target
                .get_bytes(&[SYNC_ROOT, &device.name, &entry.name])
                .await
            {
                Ok(bytes) => bytes,
                Err(e) => {
                    warn!("Sync-Eintrag {} nicht lesbar: {}", entry.name, e);
                    continue;
                }
            };
            let Ok(mut snapshot) = serde_json::from_slice::<SyncSnapshot>(&bytes) else {
                continue;
            };
            // The folder decides, not what a file claims.
            if snapshot.filename != format!("{stem}.zip") {
                continue;
            }
            snapshot.device_id = device.name.clone();
            snapshot.own = device.name == own_device;
            snapshots.push(snapshot);
        }
    }
    snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(snapshots)
}

/// The newest state of another device that this device hasn't seen yet.
fn newer_from_others(
    snapshots: &[SyncSnapshot],
    last_sync_at: Option<&str>,
) -> Option<SyncSnapshot> {
    snapshots
        .iter()
        .filter(|s| !s.own)
        .max_by(|a, b| a.created_at.cmp(&b.created_at))
        .filter(|s| last_sync_at.is_none_or(|seen| s.created_at.as_str() > seen))
        .cloned()
}

/// Uploads the backup `zip` as a snapshot of this device and keeps its newest `keep`.
async fn upload_on(
    target: &Target,
    config: &SyncConfig,
    zip: &Path,
    snapshot: &SyncSnapshot,
) -> Result<(), String> {
    let device = config.device_id.as_str();
    target.ensure_dir(&[SYNC_ROOT, device]).await?;
    target
        .put_file(&[SYNC_ROOT, device, &snapshot.filename], zip)
        .await?;
    let json = serde_json::to_vec_pretty(snapshot)
        .map_err(|e| crate::err!("backend.sync.save", error = e))?;
    let sidecar = snapshot.filename.replace(".zip", ".json");
    target
        .put_bytes(&[SYNC_ROOT, device, &sidecar], json)
        .await?;

    let mut own: Vec<SyncSnapshot> = list_on(target, device)
        .await?
        .into_iter()
        .filter(|s| s.own)
        .collect();
    own.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    for old in own.iter().skip(config.keep.max(1) as usize) {
        // The description goes first: without it the ZIP is no longer listed.
        target
            .delete(&[SYNC_ROOT, device, &old.filename.replace(".zip", ".json")])
            .await?;
        target.delete(&[SYNC_ROOT, device, &old.filename]).await?;
    }
    Ok(())
}

/// Checks the target: reachable and writable; returns the number of snapshots there.
pub async fn test(config: &SyncConfig) -> Result<usize, String> {
    let config = complete(config.clone());
    let target = Target::from_config(&config)?;
    target.ensure_dir(&[SYNC_ROOT]).await?;
    let probe = format!(".probe-{}", config.device_id);
    target
        .put_bytes(&[SYNC_ROOT, &probe], b"ok".to_vec())
        .await?;
    target.delete(&[SYNC_ROOT, &probe]).await?;
    Ok(list_on(&target, &config.device_id).await?.len())
}

pub async fn list(config: &SyncConfig) -> Result<Vec<SyncSnapshot>, String> {
    let target = Target::from_config(config)?;
    list_on(&target, &config.device_id).await
}

/// The newest state of another device not seen here yet (`None` while sync is off).
pub async fn check(config: &SyncConfig) -> Result<Option<SyncSnapshot>, String> {
    if config.kind == SyncTargetKind::Off {
        return Ok(None);
    }
    let snapshots = list(config).await?;
    Ok(newer_from_others(
        &snapshots,
        config.last_sync_at.as_deref(),
    ))
}

/// Creates a backup of the chosen groups and uploads it as this device's newest state.
pub async fn upload() -> Result<SyncSnapshot, String> {
    let config = load_config();
    let target = Target::from_config(&config)?;
    let groups = config.groups.clone();
    let description = format!("Sync: {}", config.device_name);
    let entry = tokio::task::spawn_blocking(move || {
        ProfileBackupManager::create_backup(groups, Some(description), false)
    })
    .await
    .map_err(|e| crate::err!("backend.sync.save", error = e))??;
    let zip = PathBuf::from(&entry.file_path);
    let manifest = entry.manifest.clone();
    let snapshot = SyncSnapshot {
        device_id: config.device_id.clone(),
        device_name: config.device_name.clone(),
        filename: entry.filename.clone(),
        created_at: entry.created_at.clone(),
        size_bytes: entry.size_bytes,
        app_version: manifest
            .as_ref()
            .map(|m| m.app_version.clone())
            .unwrap_or_default(),
        groups: manifest
            .map(|m| m.groups)
            .unwrap_or_else(|| config.groups.clone()),
        description: Some(format!("Sync: {}", config.device_name)),
        own: true,
    };
    let result = upload_on(&target, &config, &zip, &snapshot).await;
    // The target keeps the state; a local copy of every upload would only fill the disk.
    let _ = tokio::fs::remove_file(&zip).await;
    result?;
    let mut updated = config;
    updated.last_sync_at = Some(snapshot.created_at.clone());
    save_config(&updated)?;
    info!("Sync: Stand {} hochgeladen", snapshot.filename);
    Ok(snapshot)
}

/// Downloads a snapshot and restores it (a safety snapshot of this device comes first).
pub async fn restore(
    device_id: &str,
    filename: &str,
    groups: Option<BackupGroupSelection>,
) -> Result<String, String> {
    if !valid_device_id(device_id) || !valid_filename(filename) {
        return Err(crate::err!("backend.sync.nameInvalid", name = filename));
    }
    let config = load_config();
    let target = Target::from_config(&config)?;
    let snapshot = list_on(&target, &config.device_id)
        .await?
        .into_iter()
        .find(|s| s.device_id == device_id && s.filename == filename)
        .ok_or_else(|| crate::err!("backend.sync.missing", name = filename))?;
    let local_name = format!("sync_{device_id}_{filename}");
    let local = ProfileBackupManager::get_backups_dir().join(&local_name);
    let downloaded = target
        .get_file(&[SYNC_ROOT, device_id, filename], &local)
        .await;
    let result = match downloaded {
        Ok(()) => {
            let name = local_name.clone();
            tokio::task::spawn_blocking(move || ProfileBackupManager::restore_backup(&name, groups))
                .await
                .map_err(|e| crate::err!("backend.sync.save", error = e))?
        }
        Err(e) => Err(e),
    };
    let _ = tokio::fs::remove_file(&local).await;
    let message = result?;
    // The sync config lives outside every backup group, so the restore left it alone.
    let mut updated = load_config();
    if updated
        .last_sync_at
        .as_deref()
        .is_none_or(|seen| snapshot.created_at.as_str() > seen)
    {
        updated.last_sync_at = Some(snapshot.created_at);
    }
    save_config(&updated)?;
    Ok(message)
}

/// Removes a snapshot from the target (also another device's).
pub async fn delete(device_id: &str, filename: &str) -> Result<(), String> {
    if !valid_device_id(device_id) || !valid_filename(filename) {
        return Err(crate::err!("backend.sync.nameInvalid", name = filename));
    }
    let config = load_config();
    let target = Target::from_config(&config)?;
    target
        .delete(&[SYNC_ROOT, device_id, &filename.replace(".zip", ".json")])
        .await?;
    target.delete(&[SYNC_ROOT, device_id, filename]).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::sync::{Arc, Mutex};

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("otakusoul_sync_{name}_{:x}", rand::random::<u64>()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn snapshot(device: &str, filename: &str, created_at: &str) -> SyncSnapshot {
        SyncSnapshot {
            device_id: device.into(),
            device_name: format!("Gerät {device}"),
            filename: filename.into(),
            created_at: created_at.into(),
            size_bytes: 4,
            app_version: "0.7.1".into(),
            groups: default_groups(),
            description: None,
            own: false,
        }
    }

    fn config(kind: SyncTargetKind, device: &str, keep: u32) -> SyncConfig {
        complete(SyncConfig {
            kind,
            device_id: device.into(),
            keep,
            ..SyncConfig::default()
        })
    }

    #[test]
    fn names_from_the_target_are_checked() {
        assert!(valid_filename(
            "otakusoul_backup_20261102_101010_1_00ff.zip"
        ));
        for bad in [
            "../x.zip",
            "a/b.zip",
            ".hidden.zip",
            "x.json",
            "x y.zip",
            "x\\y.zip",
        ] {
            assert!(!valid_filename(bad), "{bad}");
        }
        assert!(valid_device_id("0123456789abcdef"));
        assert!(!valid_device_id("../../etc"));
        assert!(!valid_device_id("ABCDEF0123456789"));
    }

    #[test]
    fn a_fresh_config_gets_a_device_and_keeps_settings_local() {
        let config = complete(SyncConfig::default());
        assert!(valid_device_id(&config.device_id));
        assert!(!config.device_name.is_empty());
        assert!(!config.groups.settings && config.groups.memory && config.groups.characters);
        assert_eq!(
            complete(SyncConfig {
                keep: 999,
                ..config.clone()
            })
            .keep,
            MAX_KEEP
        );
        let old: SyncConfig = serde_json::from_str(r#"{"kind":"folder","folder":"/x"}"#).unwrap();
        assert_eq!(old.kind, SyncTargetKind::Folder);
        assert_eq!(old.keep, DEFAULT_KEEP);
    }

    #[test]
    fn only_newer_states_of_other_devices_count() {
        let mut own = snapshot("aaaaaaaaaaaaaaaa", "a.zip", "2026-11-02T12:00:00Z");
        own.own = true;
        let other = snapshot("bbbbbbbbbbbbbbbb", "b.zip", "2026-11-02T10:00:00Z");
        let list = vec![own, other.clone()];
        assert_eq!(newer_from_others(&list, None), Some(other.clone()));
        assert_eq!(
            newer_from_others(&list, Some("2026-11-02T09:00:00Z")),
            Some(other)
        );
        assert_eq!(newer_from_others(&list, Some("2026-11-02T10:00:00Z")), None);
        assert_eq!(newer_from_others(&list[..1], None), None);
    }

    #[test]
    fn reads_propfind_answers_of_common_servers() {
        let nextcloud = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
 <d:response><d:href>/remote.php/dav/files/me/OtakuSoul-Sync/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/files/me/OtakuSoul-Sync/0123456789abcdef/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/files/me/OtakuSoul-Sync/notes%20%26%20more.txt</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response>
</d:multistatus>"#;
        assert_eq!(
            parse_propfind(nextcloud, SYNC_ROOT),
            vec![
                DavEntry {
                    name: "0123456789abcdef".into(),
                    is_dir: true
                },
                DavEntry {
                    name: "notes & more.txt".into(),
                    is_dir: false
                },
            ]
        );
        let apache = r#"<D:multistatus xmlns:D="DAV:"><D:response xmlns:lp1="DAV:"><D:href>https://h/dav/OtakuSoul-Sync/</D:href><D:propstat><D:prop><lp1:resourcetype><D:collection/></lp1:resourcetype></D:prop></D:propstat></D:response><D:response><D:href>https://h/dav/OtakuSoul-Sync/x.json</D:href><D:propstat><D:prop><lp1:resourcetype/></D:prop></D:propstat></D:response></D:multistatus>"#;
        assert_eq!(
            parse_propfind(apache, SYNC_ROOT),
            vec![DavEntry {
                name: "x.json".into(),
                is_dir: false
            }]
        );
    }

    /// Upload twice with `keep = 1`, list it as another device, check the rotation.
    async fn round_trip(make: impl Fn(&str) -> SyncConfig) {
        let laptop = make("aaaaaaaaaaaaaaaa");
        let desktop = make("bbbbbbbbbbbbbbbb");
        let target = Target::from_config(&laptop).unwrap();
        let work = temp_dir("zip");
        for (index, created) in ["2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z"]
            .iter()
            .enumerate()
        {
            let zip = work.join(format!("backup_{index}.zip"));
            std::fs::write(&zip, format!("zip {index}")).unwrap();
            let snap = snapshot(&laptop.device_id, &format!("backup_{index}.zip"), created);
            upload_on(&target, &laptop, &zip, &snap).await.unwrap();
        }
        let other = Target::from_config(&desktop).unwrap();
        let seen = list_on(&other, &desktop.device_id).await.unwrap();
        assert_eq!(seen.len(), 1, "keep = 1 removes the older upload");
        assert_eq!(seen[0].filename, "backup_1.zip");
        assert!(!seen[0].own);
        assert_eq!(
            newer_from_others(&seen, None).unwrap().filename,
            "backup_1.zip"
        );

        let local = work.join("down.zip");
        other
            .get_file(&[SYNC_ROOT, &laptop.device_id, "backup_1.zip"], &local)
            .await
            .unwrap();
        assert_eq!(std::fs::read_to_string(&local).unwrap(), "zip 1");
        assert!(list_on(&target, &laptop.device_id).await.unwrap()[0].own);
        std::fs::remove_dir_all(&work).ok();
    }

    #[tokio::test]
    async fn folder_target_round_trip() {
        let shared = temp_dir("folder");
        let make = |device: &str| SyncConfig {
            folder: shared.to_string_lossy().to_string(),
            ..config(SyncTargetKind::Folder, device, 1)
        };
        round_trip(make).await;
        // No half files stay behind.
        let device_dir = shared.join(SYNC_ROOT).join("aaaaaaaaaaaaaaaa");
        let names: Vec<String> = std::fs::read_dir(device_dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert!(names.iter().all(|n| !n.ends_with(".part")), "{names:?}");
        std::fs::remove_dir_all(&shared).ok();
    }

    #[tokio::test]
    async fn missing_folder_is_reported() {
        let error = Target::from_config(&SyncConfig {
            folder: "/does/not/exist/otakusoul".into(),
            ..config(SyncTargetKind::Folder, "aaaaaaaaaaaaaaaa", 1)
        })
        .err()
        .unwrap();
        assert!(error.contains("backend.sync.folderMissing"));
    }

    /// A small in-memory WebDAV server (MKCOL, PUT, GET, DELETE, PROPFIND Depth 1, Basic auth).
    async fn webdav_server() -> (String, Arc<Mutex<BTreeMap<String, Option<Vec<u8>>>>>) {
        use axum::body::Bytes;
        use axum::http::{HeaderMap, Method, StatusCode, Uri};
        use axum::response::IntoResponse;

        let store: Arc<Mutex<BTreeMap<String, Option<Vec<u8>>>>> = Arc::default();
        store.lock().unwrap().insert("/dav/".into(), None);
        let shared = store.clone();
        let handler = move |method: Method, uri: Uri, headers: HeaderMap, body: Bytes| {
            let store = shared.clone();
            async move {
                // "me:secret"
                if headers.get("authorization").and_then(|v| v.to_str().ok())
                    != Some("Basic bWU6c2VjcmV0")
                {
                    return StatusCode::UNAUTHORIZED.into_response();
                }
                let path = uri.path().to_string();
                let mut files = store.lock().unwrap();
                let parent_ok = |files: &BTreeMap<String, Option<Vec<u8>>>, path: &str| {
                    let trimmed = path.trim_end_matches('/');
                    let parent = &trimmed[..=trimmed.rfind('/').unwrap()];
                    files.contains_key(parent)
                };
                match method.as_str() {
                    "MKCOL" => {
                        if files.contains_key(&path) {
                            StatusCode::METHOD_NOT_ALLOWED.into_response()
                        } else if !parent_ok(&files, &path) {
                            StatusCode::CONFLICT.into_response()
                        } else {
                            files.insert(path, None);
                            StatusCode::CREATED.into_response()
                        }
                    }
                    "PUT" => {
                        if !parent_ok(&files, &path) {
                            return StatusCode::CONFLICT.into_response();
                        }
                        files.insert(path, Some(body.to_vec()));
                        StatusCode::CREATED.into_response()
                    }
                    "GET" => match files.get(&path) {
                        Some(Some(data)) => data.clone().into_response(),
                        _ => StatusCode::NOT_FOUND.into_response(),
                    },
                    "DELETE" => match files.remove(&path) {
                        Some(_) => StatusCode::NO_CONTENT.into_response(),
                        None => StatusCode::NOT_FOUND.into_response(),
                    },
                    "PROPFIND" => {
                        if !files.contains_key(&path) {
                            return StatusCode::NOT_FOUND.into_response();
                        }
                        let mut xml =
                            String::from(r#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">"#);
                        let mut push = |href: &str, dir: bool| {
                            let kind = if dir { "<d:collection/>" } else { "" };
                            xml.push_str(&format!(
                                "<d:response><d:href>{href}</d:href><d:propstat><d:prop><d:resourcetype>{kind}</d:resourcetype></d:prop></d:propstat></d:response>"
                            ));
                        };
                        push(&path, true);
                        for (key, value) in files.iter() {
                            if let Some(rest) = key.strip_prefix(&path)
                                && !rest.is_empty()
                                && !rest.trim_end_matches('/').contains('/')
                            {
                                push(key, value.is_none());
                            }
                        }
                        xml.push_str("</d:multistatus>");
                        (StatusCode::MULTI_STATUS, xml).into_response()
                    }
                    _ => StatusCode::METHOD_NOT_ALLOWED.into_response(),
                }
            }
        };
        let app = axum::Router::new().fallback(handler);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        (format!("http://{address}/dav/"), store)
    }

    #[tokio::test]
    async fn webdav_target_round_trip() {
        let (url, store) = webdav_server().await;
        let make = |device: &str| SyncConfig {
            webdav_url: url.clone(),
            webdav_user: "me".into(),
            webdav_password: "secret".into(),
            ..config(SyncTargetKind::Webdav, device, 1)
        };
        round_trip(make).await;
        let keys: Vec<String> = store.lock().unwrap().keys().cloned().collect();
        assert!(
            keys.contains(&"/dav/OtakuSoul-Sync/aaaaaaaaaaaaaaaa/backup_1.zip".to_string()),
            "{keys:?}"
        );
        assert!(!keys.iter().any(|k| k.contains("backup_0")), "{keys:?}");
    }

    /// Against a real server: `OTAKUSOUL_TEST_WEBDAV_URL` (+ `_USER`, `_PASSWORD`), e.g. Nextcloud
    /// or `wsgidav`. Leaves `OtakuSoul-Sync/aaaa…` and `bbbb…` there.
    #[tokio::test]
    #[ignore = "needs a WebDAV server"]
    async fn real_webdav_server() {
        let url = std::env::var("OTAKUSOUL_TEST_WEBDAV_URL").expect("OTAKUSOUL_TEST_WEBDAV_URL");
        let make = |device: &str| SyncConfig {
            webdav_url: url.clone(),
            webdav_user: std::env::var("OTAKUSOUL_TEST_WEBDAV_USER").unwrap_or_default(),
            webdav_password: std::env::var("OTAKUSOUL_TEST_WEBDAV_PASSWORD").unwrap_or_default(),
            ..config(SyncTargetKind::Webdav, device, 1)
        };
        assert!(test(&make("aaaaaaaaaaaaaaaa")).await.is_ok());
        round_trip(make).await;
    }

    #[tokio::test]
    async fn webdav_reports_a_wrong_password() {
        let (url, _) = webdav_server().await;
        let wrong = SyncConfig {
            webdav_url: url,
            webdav_user: "me".into(),
            webdav_password: "nope".into(),
            ..config(SyncTargetKind::Webdav, "aaaaaaaaaaaaaaaa", 1)
        };
        let target = Target::from_config(&wrong).unwrap();
        let error = target.ensure_dir(&[SYNC_ROOT]).await.unwrap_err();
        assert!(error.contains("backend.sync.auth"), "{error}");
    }
}
