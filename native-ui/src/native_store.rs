//! Geschützte native Speicherpfade und Schreibsperren.
use crate::profile;
use std::{
    fs::{self, OpenOptions},
    io,
    path::{Path, PathBuf},
};

const ACCESS: &str = "Der native Datenspeicher ist nicht zugänglich.";

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
