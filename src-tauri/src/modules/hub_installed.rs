//! Which hub contents are installed in which revision (`<Daten>/hub_installed.json`), so the hub
//! can offer updates. Each record also keeps a hash of the stored file: a lorebook whose file no
//! longer matches it was edited by the user and is kept as a copy when it is updated.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct InstalledHubItem {
    /// `character`, `lorebook` or `scene`.
    pub kind: String,
    /// Id of the entry in the registry (characters and lorebooks: their name).
    pub hub_id: String,
    /// Id of the installed copy (character id, lorebook id, scene id).
    pub local_id: String,
    pub revision: u32,
    /// Date of the installed revision as the registry gives it.
    #[serde(default)]
    pub updated: String,
    /// SHA-256 of the stored file right after installing (empty when not tracked).
    #[serde(default)]
    pub local_sha256: String,
    pub installed_at: String,
}

fn index_path() -> PathBuf {
    PathBuf::from(resolve_app_paths().data_dir).join("hub_installed.json")
}

fn load_from(path: &Path) -> Vec<InstalledHubItem> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn record_in(path: &Path, item: InstalledHubItem) -> Result<(), String> {
    let mut items = load_from(path);
    items.retain(|other| !(other.kind == item.kind && other.hub_id == item.hub_id));
    items.push(item);
    items.sort_by(|a, b| (&a.kind, &a.hub_id).cmp(&(&b.kind, &b.hub_id)));
    let json = serde_json::to_string_pretty(&items)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    }
    std::fs::write(path, json).map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

/// Every installed hub item.
pub fn list() -> Vec<InstalledHubItem> {
    load_from(&index_path())
}

/// The installed copy of a registry entry, if any.
pub fn find(kind: &str, hub_id: &str) -> Option<InstalledHubItem> {
    list()
        .into_iter()
        .find(|item| item.kind == kind && item.hub_id == hub_id)
}

/// Remembers (or replaces) the installed copy of a registry entry.
pub fn record(
    kind: &str,
    hub_id: &str,
    local_id: &str,
    revision: u32,
    updated: &str,
    stored_file: Option<&Path>,
) -> Result<(), String> {
    record_in(
        &index_path(),
        InstalledHubItem {
            kind: kind.to_string(),
            hub_id: hub_id.to_string(),
            local_id: local_id.to_string(),
            revision,
            updated: updated.to_string(),
            local_sha256: stored_file.and_then(file_sha256).unwrap_or_default(),
            installed_at: chrono::Utc::now().to_rfc3339(),
        },
    )
}

/// SHA-256 of a file as hex, `None` when it cannot be read.
pub fn file_sha256(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(
        Sha256::digest(&bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect(),
    )
}

/// Whether an existing file is the user's own work: not installed from the hub, or changed since.
pub fn is_modified(existing: &Path, installed: Option<&InstalledHubItem>) -> bool {
    match installed {
        Some(item) if !item.local_sha256.is_empty() => {
            file_sha256(existing).as_deref() != Some(item.local_sha256.as_str())
        }
        // Installed before hashes were kept: treat as unchanged rather than nag on every update.
        Some(_) => false,
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_replace_earlier_revisions_and_detect_edits() {
        let dir =
            std::env::temp_dir().join(format!("otakusoul-hub-installed-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let index = dir.join("hub_installed.json");
        let book = dir.join("book.json");
        std::fs::write(&book, "v1").unwrap();
        let item = |revision: u32| InstalledHubItem {
            kind: "lorebook".into(),
            hub_id: "Welt".into(),
            local_id: "welt".into(),
            revision,
            updated: String::new(),
            local_sha256: file_sha256(&book).unwrap(),
            installed_at: String::new(),
        };
        record_in(&index, item(1)).unwrap();
        record_in(&index, item(2)).unwrap();
        let items = load_from(&index);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].revision, 2);

        assert!(!is_modified(&book, Some(&items[0])));
        std::fs::write(&book, "eigene Änderung").unwrap();
        assert!(is_modified(&book, Some(&items[0])));
        assert!(
            is_modified(&book, None),
            "files not from the hub are the user's own"
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
