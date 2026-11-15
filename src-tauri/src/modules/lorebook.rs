//! Tauri-Adapter für Lorebook-Dateien und lokalisierte Importfehler.
pub use otakusoul_lore::{EvaluatedLoreResult, Lorebook, LorebookEntry, evaluate_lorebooks};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

pub fn load_from_file(path: &Path) -> Result<Lorebook, String> {
    let content = fs::read_to_string(path).map_err(|e| {
        crate::err!(
            "backend.lorebook.load",
            path = format!("{:?}", path),
            error = e
        )
    })?;

    let mut book = import_from_json_string(&content, path.file_stem().and_then(|s| s.to_str()))?;
    book.file_path = Some(path.to_string_lossy().to_string());
    if book.id.is_empty() {
        book.id = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "lorebook".to_string());
    }
    Ok(book)
}

pub fn save_to_file(book: &Lorebook, path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let json_str = serde_json::to_string_pretty(book)
        .map_err(|e| crate::err!("backend.lorebook.serialize", error = e))?;
    fs::write(path, json_str).map_err(|e| {
        crate::err!(
            "backend.lorebook.write",
            path = format!("{:?}", path),
            error = e
        )
    })
}

pub fn import_from_json_string(
    content: &str,
    fallback_name: Option<&str>,
) -> Result<Lorebook, String> {
    let value = serde_json::from_str(content)
        .map_err(|e| crate::err!("backend.lorebook.invalidJson", error = e))?;
    Ok(Lorebook::from_json_value(&value, fallback_name))
}

/// Discovers all lorebooks from user lorebooks dir and bundled presets
pub fn list_all_lorebooks(user_lorebooks_dir: &Path, presets_dir: &Path) -> Vec<Lorebook> {
    let mut books = Vec::new();
    let mut seen_ids = HashSet::new();

    // 1. Scan user lorebooks directory
    if user_lorebooks_dir.exists()
        && let Ok(entries) = fs::read_dir(user_lorebooks_dir)
    {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json")
                && let Ok(book) = load_from_file(&path)
                && !seen_ids.contains(&book.id)
            {
                seen_ids.insert(book.id.clone());
                books.push(book);
            }
        }
    }

    // 2. Scan bundled presets directory
    if presets_dir.exists()
        && let Ok(preset_dirs) = fs::read_dir(presets_dir)
    {
        for preset_entry in preset_dirs.flatten() {
            let lb_dir = preset_entry.path().join("lorebooks");
            if lb_dir.exists()
                && let Ok(lb_files) = fs::read_dir(lb_dir)
            {
                for file_entry in lb_files.flatten() {
                    let path = file_entry.path();
                    if path.extension().and_then(|s| s.to_str()) == Some("json")
                        && let Ok(book) = load_from_file(&path)
                        && !seen_ids.contains(&book.id)
                    {
                        seen_ids.insert(book.id.clone());
                        books.push(book);
                    }
                }
            }
        }
    }

    books.sort_by(|a, b| a.name.cmp(&b.name));
    // Adult lorebooks stay hidden (not deleted) while adult content is off.
    if !crate::modules::nsfw::allowed() {
        books.retain(|book| !crate::modules::nsfw::is_marked(&book.extensions));
    }
    books
}

pub fn scan_available_lorebooks() -> Vec<Lorebook> {
    let paths = crate::modules::paths::resolve_app_paths();
    list_all_lorebooks(
        Path::new(&paths.lorebooks_dir),
        Path::new(&paths.bundled_presets_dir),
    )
}
