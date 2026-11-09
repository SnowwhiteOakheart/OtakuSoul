//! Eigene Stage-Definitionen in einem getrennten, atomar ersetzten Katalog.
use crate::{
    file_export, profile,
    stage_draft::valid_folder_name,
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
const VERSION: u64 = 2;
const MAX_SCENES: usize = 256;
const MAX_FOLDERS: usize = 512;
const MAX_BYTES: usize = 32 * 1024 * 1024;
const ACCESS: &str = "Der native Szenenspeicher ist nicht zugänglich.";
const INVALID: &str = "Der native Szenenkatalog ist ungültig oder hat eine unbekannte Version.";
const CAPACITY: &str = "Der native Szenenkatalog ist voll.";

#[derive(Debug, Clone, Default)]
pub struct Library {
    pub scenes: Vec<Scene>,
    pub folders: Vec<String>,
}

#[derive(Debug, Clone)]
pub enum FolderChange {
    Create(String),
    Delete(String),
}

pub fn list(root: &Path) -> Result<Library, String> {
    match store_root(root)? {
        Some(root) => read(&root),
        None => Ok(Library::default()),
    }
}

pub fn save(root: &Path, scene: &Scene, previous: Option<&Value>) -> Result<Vec<String>, String> {
    modify(root, |library| {
        let scenes = &mut library.scenes;
        match (scenes.iter().position(|known| known.id == scene.id), previous) {
            (Some(index), Some(previous)) if &scenes[index].definition() == previous => {
                scenes[index] = scene.clone();
            }
            (None, None) if scenes.len() < MAX_SCENES => scenes.push(scene.clone()),
            (None, None) => return Err(CAPACITY.into()),
            (Some(_), None) => return Err("Diese Szenenkennung ist bereits gespeichert.".into()),
            _ => return Err("Die gespeicherte Szene wurde inzwischen geändert. Öffne sie nach einem Neustart erneut.".into()),
        }
        if let Some(name) = scene.folder().filter(|name| valid_folder_name(name)) {
            remember_folder(&mut library.folders, name);
        }
        Ok(())
    }).map(|library| library.folders)
}

pub fn change_folder(root: &Path, change: &FolderChange) -> Result<Library, String> {
    modify(root, |library| {
        match change {
            FolderChange::Create(name) => {
                let name = name.trim();
                if name.is_empty() || !valid_folder_name(name) {
                    return Err(crate::ui_text::text("gallery.native.folderInvalid").into());
                }
                remember_folder(&mut library.folders, name);
            }
            FolderChange::Delete(name) => {
                let key = name.to_lowercase();
                library.folders.retain(|known| known.to_lowercase() != key);
                for scene in &mut library.scenes {
                    if scene
                        .folder()
                        .is_some_and(|name| name.to_lowercase() == key)
                    {
                        let mut definition = scene.definition();
                        definition["folder"] = "".into();
                        *scene = stage_preview::parse(definition)?;
                    }
                }
            }
        }
        Ok(())
    })
}

fn remember_folder(folders: &mut Vec<String>, name: &str) {
    let key = name.to_lowercase();
    if !folders.iter().any(|known| known.to_lowercase() == key) {
        folders.push(name.into());
    }
}

fn modify(
    root: &Path,
    edit: impl FnOnce(&mut Library) -> Result<(), String>,
) -> Result<Library, String> {
    with_write_lock(root, "scenes.lock", |root| {
        let mut library = read(root)?;
        edit(&mut library)?;
        if library.folders.len() > MAX_FOLDERS {
            return Err(CAPACITY.into());
        }
        let definitions: Vec<_> = library.scenes.iter().map(Scene::definition).collect();
        let bytes = serde_json::to_vec(&json!({
            "version": VERSION, "scenes": definitions, "folders": library.folders
        }))
        .map_err(|_| INVALID)?;
        if bytes.len() > MAX_BYTES {
            return Err(CAPACITY.into());
        }
        file_export::write_bytes(&root.join(FILE_NAME), &bytes, None)?;
        Ok(library)
    })
}

pub(super) fn with_write_lock<T>(
    root: &Path,
    lock_name: &str,
    write: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    profile::validate_native_store(root)?;
    fs::create_dir_all(root).map_err(|_| ACCESS)?;
    let root = store_root(root)?.ok_or(ACCESS)?;
    let lock_path = root.join(lock_name);
    regular_file(&lock_path)?;
    let lock = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(false)
        .open(lock_path)
        .map_err(|_| ACCESS)?;
    lock.lock().map_err(|_| ACCESS)?;
    write(&root)
}

fn read(root: &Path) -> Result<Library, String> {
    let path = root.join(FILE_NAME);
    if !regular_file(&path)? {
        return Ok(Library::default());
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
    let version = match catalog["version"].as_u64() {
        Some(version @ (1 | VERSION)) => version,
        _ => return Err(INVALID.into()),
    };
    let Value::Array(definitions) = catalog["scenes"].take() else {
        return Err(INVALID.into());
    };
    if definitions.len() > MAX_SCENES {
        return Err(CAPACITY.into());
    }
    let mut ids = HashSet::new();
    let scenes: Vec<Scene> = definitions
        .into_iter()
        .map(|definition| {
            let scene = stage_preview::parse(definition).map_err(|_| INVALID)?;
            if !ids.insert(scene.id.clone()) {
                return Err(INVALID.into());
            }
            Ok(scene)
        })
        .collect::<Result<_, String>>()?;
    let mut folders = Vec::new();
    if version == VERSION {
        let names = catalog["folders"].as_array().ok_or(INVALID)?;
        if names.len() > MAX_FOLDERS {
            return Err(CAPACITY.into());
        }
        for name in names {
            let name = name
                .as_str()
                .filter(|name| !name.is_empty() && name.trim() == *name && valid_folder_name(name))
                .ok_or(INVALID)?;
            remember_folder(&mut folders, name);
        }
    } else {
        for name in scenes
            .iter()
            .filter_map(Scene::folder)
            .filter(|name| valid_folder_name(name))
        {
            remember_folder(&mut folders, name);
        }
    }
    Ok(Library { scenes, folders })
}

pub(super) fn store_root(root: &Path) -> Result<Option<PathBuf>, String> {
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

pub(super) fn regular_file(path: &Path) -> Result<bool, String> {
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
        assert!(list(&root).unwrap().scenes.is_empty());
        assert!(!root.exists());
        let first = scene("world/1", "Erste Szene");
        let second = scene("world/2", "Zweite Szene");
        std::thread::scope(|scope| {
            let task = scope.spawn(|| save(&root, &first, None));
            save(&root, &second, None).unwrap();
            task.join().unwrap().unwrap();
        });
        assert_eq!(list(&root).unwrap().scenes.len(), 2);
        assert!(save(&root, &first, None).is_err());

        let updated = scene(&first.id, "Bearbeitete Szene");
        let previous = first.definition();
        save(&root, &updated, Some(&previous)).unwrap();
        assert!(save(&root, &first, Some(&previous)).is_err());
        let stored = list(&root).unwrap().scenes;
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
    fn stage_store_migrates_folders_and_keeps_scenes_when_a_folder_is_deleted() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(FILE_NAME);
        let mut first = scene("a", "Erste Szene").definition();
        first["folder"] = "Kampagne".into();
        let mut second = scene("b", "Zweite Szene").definition();
        second["folder"] = "KAMPAGNE".into();
        let other = scene("c", "Dritte Szene").definition();
        let legacy = json!({"version": 1, "scenes": [&first, &second, &other]});
        fs::write(&path, serde_json::to_vec(&legacy).unwrap()).unwrap();
        assert_eq!(list(root.path()).unwrap().folders, ["Kampagne"]);
        assert_eq!(
            serde_json::from_slice::<Value>(&fs::read(&path).unwrap()).unwrap(),
            legacy
        );

        change_folder(root.path(), &FolderChange::Create("  Leer  ".into())).unwrap();
        change_folder(root.path(), &FolderChange::Create("leer".into())).unwrap();
        assert_eq!(list(root.path()).unwrap().folders, ["Kampagne", "Leer"]);
        let deleted = change_folder(root.path(), &FolderChange::Delete("kampagne".into())).unwrap();
        assert_eq!(deleted.folders, ["Leer"]);
        assert_eq!(deleted.scenes.len(), 3);
        first["folder"] = "".into();
        second["folder"] = "".into();
        let restored = list(root.path()).unwrap();
        assert_eq!(
            restored
                .scenes
                .iter()
                .map(Scene::definition)
                .collect::<Vec<_>>(),
            [first, second, other]
        );
        assert_eq!(restored.folders, ["Leer"]);
    }

    #[test]
    fn stage_store_preserves_unreadable_catalogs() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(FILE_NAME);
        let unknown = br#"{"version":3,"scenes":[]}"#;
        fs::write(&path, unknown).unwrap();
        assert!(list(root.path()).is_err());
        assert!(save(root.path(), &scene("new", "Neue Szene"), None).is_err());
        assert_eq!(fs::read(path).unwrap(), unknown);
    }
}
