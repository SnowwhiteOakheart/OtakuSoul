//! Lorebooks: files, import/export and activation.

#[tauri::command]
pub fn list_all_lorebooks() -> Result<Vec<crate::modules::lorebook::Lorebook>, String> {
    let paths = crate::modules::paths::resolve_app_paths();
    let books = crate::modules::lorebook::list_all_lorebooks(
        std::path::Path::new(&paths.lorebooks_dir),
        std::path::Path::new(&paths.bundled_presets_dir),
    );
    Ok(books)
}

#[tauri::command]
pub fn save_lorebook(mut lorebook: crate::modules::lorebook::Lorebook) -> Result<String, String> {
    let paths = crate::modules::paths::resolve_app_paths();
    let target_path = if let Some(fp) = &lorebook.file_path {
        if !fp.trim().is_empty() {
            std::path::PathBuf::from(fp)
        } else {
            let slug = if !lorebook.id.trim().is_empty() {
                lorebook.id.clone()
            } else {
                lorebook
                    .name
                    .trim()
                    .to_lowercase()
                    .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
            };
            std::path::PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug))
        }
    } else {
        let slug = if !lorebook.id.trim().is_empty() {
            lorebook.id.clone()
        } else {
            lorebook
                .name
                .trim()
                .to_lowercase()
                .replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_")
        };
        std::path::PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug))
    };

    lorebook.file_path = Some(target_path.to_string_lossy().to_string());
    if lorebook.id.is_empty() {
        lorebook.id = target_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("lorebook")
            .to_string();
    }

    lorebook.save_to_file(&target_path)?;
    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn delete_lorebook(file_path: String) -> Result<(), String> {
    let p = std::path::Path::new(&file_path);
    if p.exists() {
        std::fs::remove_file(p).map_err(|e| crate::err!("backend.lorebook.delete", error = e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn import_lorebook_file(
    source_path: String,
) -> Result<crate::modules::lorebook::Lorebook, String> {
    let p = std::path::Path::new(&source_path);
    let mut book = crate::modules::lorebook::Lorebook::load_from_file(p)?;
    let paths = crate::modules::paths::resolve_app_paths();

    let slug = p
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported_lorebook");
    let target = std::path::PathBuf::from(&paths.lorebooks_dir).join(format!("{}.json", slug));
    book.file_path = Some(target.to_string_lossy().to_string());
    book.id = slug.to_string();
    let _ = book.save_to_file(&target);
    Ok(book)
}

#[tauri::command]
pub fn export_lorebook_file(
    lorebook: crate::modules::lorebook::Lorebook,
    target_path: String,
) -> Result<(), String> {
    lorebook.save_to_file(std::path::Path::new(&target_path))
}

#[tauri::command]
pub fn evaluate_lorebook_context(
    lorebook: crate::modules::lorebook::Lorebook,
    context: String,
) -> Vec<crate::modules::lorebook::LorebookEntry> {
    lorebook.scan_and_activate(&context)
}

#[tauri::command]
pub fn evaluate_multi_lorebooks(
    lorebooks: Vec<crate::modules::lorebook::Lorebook>,
    context: String,
    current_tension: u32,
) -> Result<crate::modules::lorebook::EvaluatedLoreResult, String> {
    Ok(crate::modules::lorebook::evaluate_lorebooks(
        &lorebooks,
        &context,
        current_tension,
    ))
}
