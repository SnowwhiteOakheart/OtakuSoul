use std::path::{Path, PathBuf};
use crate::modules::paths::resolve_app_paths;

#[tauri::command]
pub async fn run_legacy_migration(source_path: String) -> Result<String, String> {
    let source = Path::new(&source_path);
    if !source.is_dir() {
        return Err("backend.common.dirNotFound".to_string());
    }

    let dest = resolve_app_paths();
    let mut copied_files = 0;
    let mut errors = Vec::new();

    let copy_dir = |src_dir: PathBuf, dest_dir: PathBuf, ext: Option<&str>| -> Result<usize, std::io::Error> {
        let mut count = 0;
        if src_dir.is_dir() {
            std::fs::create_dir_all(&dest_dir)?;
            for entry in std::fs::read_dir(src_dir)? {
                let entry = entry?;
                if entry.file_type()?.is_file() {
                    let path = entry.path();
                    if let Some(e) = ext {
                        if path.extension().and_then(|s| s.to_str()) != Some(e) {
                            continue;
                        }
                    }
                    let dest_file = dest_dir.join(entry.file_name());
                    if !dest_file.exists() {
                        if let Err(err) = std::fs::copy(&path, &dest_file) {
                            tracing::error!("Failed to copy {:?}: {}", path, err);
                        } else {
                            count += 1;
                        }
                    }
                }
            }
        }
        Ok(count)
    };

    // Copy characters (json and png)
    match copy_dir(source.join("characters"), Path::new(&dest.characters_dir).to_path_buf(), None) {
        Ok(c) => copied_files += c,
        Err(e) => errors.push(format!("Characters: {}", e)),
    }

    // Copy lorebooks (json)
    match copy_dir(source.join("lorebooks"), Path::new(&dest.lorebooks_dir).to_path_buf(), Some("json")) {
        Ok(c) => copied_files += c,
        Err(e) => errors.push(format!("Lorebooks: {}", e)),
    }

    // Copy avatars (png)
    match copy_dir(source.join("avatars"), Path::new(&dest.user_avatars_dir).to_path_buf(), None) {
        Ok(c) => copied_files += c,
        Err(e) => errors.push(format!("Avatars: {}", e)),
    }

    if !errors.is_empty() && copied_files == 0 {
        return Err(format!("Fehler bei der Migration: {}", errors.join(", ")));
    }

    Ok(format!("Migration erfolgreich. {} Dateien wurden kopiert.", copied_files))
}
