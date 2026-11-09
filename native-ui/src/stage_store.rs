//! Eigene Stage-Definitionen in einem getrennten, atomar ersetzten Katalog.
use crate::{
    file_export, profile,
    stage_preview::{self, Scene},
};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{self, Read},
    path::{Path, PathBuf},
};

const FILE_NAME: &str = "scenes.json";
const VERSION: u64 = 1;
const MAX_SCENES: usize = 256;
const MAX_BYTES: usize = 32 * 1024 * 1024;
const ACCESS: &str = "Der native Szenenspeicher ist nicht zugänglich.";
const INVALID: &str = "Der native Szenenkatalog ist ungültig oder hat eine unbekannte Version.";
const CAPACITY: &str = "Der native Szenenkatalog ist voll.";

pub fn list(root: &Path) -> Result<Vec<Scene>, String> {
    match store_root(root)? {
        Some(root) => read(&root),
        None => Ok(Vec::new()),
    }
}

pub fn save(root: &Path, scene: &Scene, previous: Option<&Value>) -> Result<(), String> {
    profile::validate_native_store(root)?;
    fs::create_dir_all(root).map_err(|_| ACCESS)?;
    let root = store_root(root)?.ok_or(ACCESS)?;
    let lock_path = root.join("scenes.lock");
    regular_file(&lock_path)?;
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(lock_path)
        .map_err(|_| ACCESS)?;
    lock.lock().map_err(|_| ACCESS)?;
    let mut scenes = read(&root)?;
    match (scenes.iter().position(|known| known.id == scene.id), previous) {
        (Some(index), Some(previous)) if &scenes[index].definition() == previous => {
            scenes[index] = scene.clone();
        }
        (None, None) if scenes.len() < MAX_SCENES => scenes.push(scene.clone()),
        (None, None) => return Err(CAPACITY.into()),
        (Some(_), None) => return Err("Diese Szenenkennung ist bereits gespeichert.".into()),
        _ => return Err("Die gespeicherte Szene wurde inzwischen geändert. Öffne sie nach einem Neustart erneut.".into()),
    }
    let definitions: Vec<_> = scenes.iter().map(Scene::definition).collect();
    let bytes = serde_json::to_vec(&json!({"version": VERSION, "scenes": definitions}))
        .map_err(|_| INVALID)?;
    if bytes.len() > MAX_BYTES {
        return Err(CAPACITY.into());
    }
    file_export::write_bytes(&root.join(FILE_NAME), &bytes, None)
}

fn read(root: &Path) -> Result<Vec<Scene>, String> {
    let path = root.join(FILE_NAME);
    if !regular_file(&path)? {
        return Ok(Vec::new());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| ACCESS)?
        .take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ACCESS)?;
    if bytes.len() > MAX_BYTES {
        return Err(CAPACITY.into());
    }
    let mut catalog: Value = serde_json::from_slice(&bytes).map_err(|_| INVALID)?;
    if catalog["version"].as_u64() != Some(VERSION) {
        return Err(INVALID.into());
    }
    let Value::Array(definitions) = catalog["scenes"].take() else {
        return Err(INVALID.into());
    };
    if definitions.len() > MAX_SCENES {
        return Err(CAPACITY.into());
    }
    let mut ids = HashSet::new();
    definitions
        .into_iter()
        .map(|definition| {
            let scene = stage_preview::parse(definition).map_err(|_| INVALID)?;
            if !ids.insert(scene.id.clone()) {
                return Err(INVALID.into());
            }
            Ok(scene)
        })
        .collect()
}

fn store_root(root: &Path) -> Result<Option<PathBuf>, String> {
    profile::validate_native_store(root)?;
    match fs::symlink_metadata(root) {
        Ok(metadata) if metadata.is_dir() && !profile::is_link(&metadata) => {
            let root = root.canonicalize().map_err(|_| ACCESS)?;
            profile::validate_native_store(&root)?;
            Ok(Some(root))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        _ => Err(ACCESS.into()),
    }
}

fn regular_file(path: &Path) -> Result<bool, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !profile::is_link(&metadata) => Ok(true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        _ => Err(ACCESS.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scene(id: &str, title: &str) -> Scene {
        stage_preview::parse(json!({
            "id": id,
            "title": title,
            "description": "Ein Auftakt",
            "rules": {"ruleset": "5e"},
            "extensions": {"custom": {"enabled": true}}
        }))
        .unwrap()
    }

    #[test]
    fn stage_store_merges_concurrent_additions_and_rejects_stale_edits() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("stage");
        assert!(list(&root).unwrap().is_empty());
        assert!(!root.exists());
        let first = scene("world/1", "Erste Szene");
        let second = scene("world/2", "Zweite Szene");
        std::thread::scope(|scope| {
            let task = scope.spawn(|| save(&root, &first, None));
            save(&root, &second, None).unwrap();
            task.join().unwrap().unwrap();
        });
        assert_eq!(list(&root).unwrap().len(), 2);
        assert!(save(&root, &first, None).is_err());

        let updated = scene(&first.id, "Bearbeitete Szene");
        let previous = first.definition();
        save(&root, &updated, Some(&previous)).unwrap();
        assert!(save(&root, &first, Some(&previous)).is_err());
        let stored = list(&root).unwrap();
        assert_eq!(
            stored
                .iter()
                .find(|scene| scene.id == first.id)
                .unwrap()
                .definition(),
            updated.definition()
        );
        assert_eq!(
            stored
                .iter()
                .find(|scene| scene.id == second.id)
                .unwrap()
                .definition(),
            second.definition()
        );
    }

    #[test]
    fn stage_store_preserves_unreadable_catalogs() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(FILE_NAME);
        let unknown = br#"{"version":2,"scenes":[]}"#;
        fs::write(&path, unknown).unwrap();
        assert!(list(root.path()).is_err());
        assert!(save(root.path(), &scene("new", "Neue Szene"), None).is_err());
        assert_eq!(fs::read(path).unwrap(), unknown);
    }
}
