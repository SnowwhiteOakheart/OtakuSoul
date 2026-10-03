use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tracing::info;
use ts_rs::TS;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

use crate::modules::memory::MemoryDb;
use crate::modules::paths::{AppPaths, resolve_app_paths};

const SCHEMA_VERSION: u32 = 1;
const SAFETY_ROTATION_KEEP: usize = 5;
const MEMORY_DB_ENTRY: &str = "memory/otakusoul.db";

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BackupGroupSelection {
    pub characters: bool,
    pub lorebooks: bool,
    pub personas: bool,
    pub soul_memory: bool,
    pub soul_stage: bool,
    pub companion: bool,
    pub settings: bool,
}

impl Default for BackupGroupSelection {
    fn default() -> Self {
        Self {
            characters: true,
            lorebooks: true,
            personas: true,
            soul_memory: true,
            soul_stage: true,
            companion: true,
            settings: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BackupManifest {
    pub schema_version: u32,
    pub app_version: String,
    pub created_at: String,
    pub groups: BackupGroupSelection,
    pub files_count: usize,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BackupEntryInfo {
    pub id: String,
    pub filename: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub created_at: String,
    pub is_safety_snapshot: bool,
    pub manifest: Option<BackupManifest>,
}

pub struct ProfileBackupManager;

struct RemoveFileOnDrop(PathBuf);

impl Drop for RemoveFileOnDrop {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

/// Where backups read from and write to. Production uses the app directories; tests point
/// this at a temporary folder so they never touch real user data.
struct BackupLocations {
    paths: AppPaths,
    backups_dir: PathBuf,
    memory_db: PathBuf,
}

impl BackupLocations {
    fn current() -> Self {
        Self {
            paths: resolve_app_paths(),
            backups_dir: ProfileBackupManager::get_backups_dir(),
            memory_db: MemoryDb::default_path(),
        }
    }
}

impl ProfileBackupManager {
    pub fn get_backups_dir() -> PathBuf {
        let paths = resolve_app_paths();
        let dir = PathBuf::from(&paths.data_dir).join("backups");
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
        }
        dir
    }

    fn add_dir_to_zip_archive<W: Write + std::io::Seek>(
        zip: &mut ZipWriter<W>,
        options: SimpleFileOptions,
        source_dir: &Path,
        zip_prefix: &str,
        added_files: &mut usize,
    ) -> Result<(), String> {
        if !source_dir.exists() {
            return Ok(());
        }
        let walker = walkdir(source_dir)?;
        for entry_path in walker {
            if entry_path.is_file() {
                let rel_path = entry_path
                    .strip_prefix(source_dir)
                    .map_err(|e| e.to_string())?;
                let zip_entry_name = format!(
                    "{}/{}",
                    zip_prefix,
                    rel_path.to_string_lossy().replace('\\', "/")
                );

                Self::add_file_to_zip_archive(
                    zip,
                    options,
                    &entry_path,
                    &zip_entry_name,
                    added_files,
                )?;
            }
        }
        Ok(())
    }

    fn add_file_to_zip_archive<W: Write + std::io::Seek>(
        zip: &mut ZipWriter<W>,
        options: SimpleFileOptions,
        source_file: &Path,
        zip_entry_name: &str,
        added_files: &mut usize,
    ) -> Result<(), String> {
        if !source_file.exists() {
            return Ok(());
        }
        let mut src_file = File::open(source_file)
            .map_err(|e| format!("Cannot open backup source {}: {e}", source_file.display()))?;
        zip.start_file(zip_entry_name, options)
            .map_err(|e| format!("Cannot add {zip_entry_name} to backup: {e}"))?;
        io::copy(&mut src_file, zip)
            .map_err(|e| format!("Cannot copy {} into backup: {e}", source_file.display()))?;
        *added_files += 1;
        Ok(())
    }

    /// Creates a ZIP profile backup with the given group selections.
    pub fn create_backup(
        selection: BackupGroupSelection,
        description: Option<String>,
        is_safety: bool,
    ) -> Result<BackupEntryInfo, String> {
        Self::create_backup_at(
            &BackupLocations::current(),
            selection,
            description,
            is_safety,
        )
    }

    fn create_backup_at(
        loc: &BackupLocations,
        selection: BackupGroupSelection,
        description: Option<String>,
        is_safety: bool,
    ) -> Result<BackupEntryInfo, String> {
        let backups_dir = &loc.backups_dir;
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S_%f").to_string();
        let prefix = if is_safety {
            "pre_restore_"
        } else {
            "otakusoul_backup_"
        };
        let filename = format!("{}{}_{:016x}.zip", prefix, timestamp, rand::random::<u64>());
        let backup_path = backups_dir.join(&filename);
        let temporary_path = backups_dir.join(format!(".{filename}.tmp"));

        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
            .map_err(|e| crate::err!("backend.backup.create", error = e))?;
        let _temporary_guard = RemoveFileOnDrop(temporary_path.clone());
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o755);

        let paths = &loc.paths;
        let mut added_files = 0usize;

        let data_dir = PathBuf::from(&paths.data_dir);
        let characters_dir = PathBuf::from(&paths.characters_dir);
        let lorebooks_dir = PathBuf::from(&paths.lorebooks_dir);
        let personas_dir = PathBuf::from(&paths.personas_dir);
        let scenes_dir = PathBuf::from(&paths.scenes_dir);

        // 1. Characters
        if selection.characters {
            Self::add_dir_to_zip_archive(
                &mut zip,
                options,
                &characters_dir,
                "characters",
                &mut added_files,
            )?;
        }

        // 2. Lorebooks
        if selection.lorebooks {
            Self::add_dir_to_zip_archive(
                &mut zip,
                options,
                &lorebooks_dir,
                "lorebooks",
                &mut added_files,
            )?;
        }

        // 3. Personas
        if selection.personas {
            Self::add_dir_to_zip_archive(
                &mut zip,
                options,
                &personas_dir,
                "personas",
                &mut added_files,
            )?;
        }

        // 4. Soul Stage Scenes & Folders
        if selection.soul_stage {
            Self::add_dir_to_zip_archive(
                &mut zip,
                options,
                &scenes_dir,
                "scenes",
                &mut added_files,
            )?;
        }

        // 5. Soul Memory (SQLite database with chats, memories and relationships)
        if selection.soul_memory {
            let db_path = &loc.memory_db;
            if db_path.exists() {
                // VACUUM INTO yields a consistent snapshot even while the app holds the DB open.
                let snapshot = backups_dir.join(format!(".{filename}.db.tmp"));
                let _snapshot_guard = RemoveFileOnDrop(snapshot.clone());
                let snapshot_result = rusqlite::Connection::open(db_path).and_then(|conn| {
                    conn.execute("VACUUM INTO ?1", [snapshot.to_string_lossy().as_ref()])
                });
                match snapshot_result {
                    Ok(_) => Self::add_file_to_zip_archive(
                        &mut zip,
                        options,
                        &snapshot,
                        MEMORY_DB_ENTRY,
                        &mut added_files,
                    )?,
                    Err(e) => {
                        return Err(format!(
                            "Datenbank-Snapshot für das Backup fehlgeschlagen: {e}"
                        ));
                    }
                }
            }
        }

        // 6. Soul Companion (scratchpad, goals, plugins, mcp_servers)
        if selection.companion {
            let comp_dir = data_dir.join("companion");
            Self::add_dir_to_zip_archive(
                &mut zip,
                options,
                &comp_dir,
                "companion",
                &mut added_files,
            )?;
        }

        // 7. Settings, presets & voice configs (API keys live in the OS keyring and are not included)
        if selection.settings {
            let config_dir = PathBuf::from(&paths.config_dir);
            Self::add_file_to_zip_archive(
                &mut zip,
                options,
                &config_dir.join("settings.json"),
                "settings/settings.json",
                &mut added_files,
            )?;
            Self::add_file_to_zip_archive(
                &mut zip,
                options,
                &config_dir.join("llm_presets.json"),
                "settings/llm_presets.json",
                &mut added_files,
            )?;
            Self::add_dir_to_zip_archive(
                &mut zip,
                options,
                &config_dir.join("voice_configs"),
                "settings/voice_configs",
                &mut added_files,
            )?;
        }

        // Write manifest
        let manifest = BackupManifest {
            schema_version: SCHEMA_VERSION,
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            created_at: Utc::now().to_rfc3339(),
            groups: selection.clone(),
            files_count: added_files,
            description,
        };

        let manifest_bytes = serde_json::to_vec_pretty(&manifest)
            .map_err(|e| crate::err!("backend.backup.manifest", error = e))?;
        zip.start_file("manifest.json", options)
            .map_err(|e| crate::err!("backend.backup.manifest", error = e))?;
        zip.write_all(&manifest_bytes)
            .map_err(|e| crate::err!("backend.backup.manifest", error = e))?;

        let completed_file = zip
            .finish()
            .map_err(|e| crate::err!("backend.backup.finish", error = e))?;
        completed_file
            .sync_all()
            .map_err(|e| crate::err!("backend.backup.finish", error = e))?;
        fs::rename(&temporary_path, &backup_path)
            .map_err(|e| crate::err!("backend.backup.finish", error = e))?;

        info!(
            "Backup erfolgreich erstellt: {:?} mit {} Dateien",
            backup_path, added_files
        );

        // If it's a safety snapshot, maintain rotation (keep last 5)
        if is_safety {
            Self::rotate_safety_backups(backups_dir);
        }

        let metadata = fs::metadata(&backup_path).map_err(|e| e.to_string())?;

        Ok(BackupEntryInfo {
            id: filename.clone(),
            filename,
            file_path: backup_path.to_string_lossy().to_string(),
            size_bytes: metadata.len(),
            created_at: manifest.created_at.clone(),
            is_safety_snapshot: is_safety,
            manifest: Some(manifest),
        })
    }

    /// Lists all backup ZIP files in the backup directory.
    pub fn list_backups() -> Vec<BackupEntryInfo> {
        let backups_dir = Self::get_backups_dir();
        let mut list = Vec::new();

        if let Ok(entries) = fs::read_dir(&backups_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().is_some_and(|ext| ext == "zip") {
                    let filename = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    let is_safety = filename.starts_with("pre_restore_");
                    let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);

                    // Try to read manifest from ZIP
                    let manifest = Self::read_manifest_from_zip(&path);
                    let created_at = manifest
                        .as_ref()
                        .map(|m| m.created_at.clone())
                        .unwrap_or_else(|| {
                            fs::metadata(&path)
                                .and_then(|m| m.created().or_else(|_| m.modified()))
                                .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
                                .unwrap_or_else(|_| Utc::now().to_rfc3339())
                        });

                    list.push(BackupEntryInfo {
                        id: filename.clone(),
                        filename,
                        file_path: path.to_string_lossy().to_string(),
                        size_bytes,
                        created_at,
                        is_safety_snapshot: is_safety,
                        manifest,
                    });
                }
            }
        }

        // Sort newest first
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        list
    }

    /// Reads manifest.json from a backup ZIP archive if present.
    fn read_manifest_from_zip(zip_path: &Path) -> Option<BackupManifest> {
        let file = File::open(zip_path).ok()?;
        let mut archive = ZipArchive::new(file).ok()?;
        let mut manifest_file = archive.by_name("manifest.json").ok()?;
        let mut content = String::new();
        manifest_file.read_to_string(&mut content).ok()?;
        serde_json::from_str::<BackupManifest>(&content).ok()
    }

    /// Restores data from a backup ZIP file, creating a safety snapshot first.
    pub fn restore_backup(
        filename: &str,
        groups: Option<BackupGroupSelection>,
    ) -> Result<String, String> {
        Self::restore_backup_at(&BackupLocations::current(), filename, groups)
    }

    fn restore_backup_at(
        loc: &BackupLocations,
        filename: &str,
        groups: Option<BackupGroupSelection>,
    ) -> Result<String, String> {
        let backups_dir = &loc.backups_dir;
        if Path::new(filename)
            .file_name()
            .is_none_or(|name| name != filename)
            || !filename.ends_with(".zip")
        {
            return Err("Ungültiger Backup-Dateiname".to_string());
        }
        let backup_path = backups_dir.join(filename);
        if !backup_path.exists() {
            return Err(crate::err!("backend.backup.missing", name = filename));
        }

        info!("Erstelle präventiven Sicherheits-Snapshot vor der Wiederherstellung...");
        Self::create_backup_at(
            loc,
            BackupGroupSelection::default(),
            Some("Pre-restore safety snapshot".into()),
            true,
        )?;

        let file =
            File::open(&backup_path).map_err(|e| crate::err!("backend.backup.open", error = e))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| crate::err!("backend.common.zipInvalid", error = e))?;

        let selection = groups.unwrap_or_default();
        let paths = &loc.paths;

        let mut restored_count = 0usize;
        let mut pending_db_restore = false;

        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| crate::err!("backend.backup.entryRead", index = i, error = e))?;
            let entry_name = match file.enclosed_name() {
                Some(p) => p.to_path_buf(),
                None => continue,
            };

            let entry_str = entry_name.to_string_lossy();
            if entry_str == "manifest.json" {
                continue;
            }

            let data_dir = PathBuf::from(&paths.data_dir);
            let characters_dir = PathBuf::from(&paths.characters_dir);
            let lorebooks_dir = PathBuf::from(&paths.lorebooks_dir);
            let personas_dir = PathBuf::from(&paths.personas_dir);
            let scenes_dir = PathBuf::from(&paths.scenes_dir);

            // Determine destination target based on top-level zip folder
            let target_path: Option<PathBuf> =
                if entry_str.starts_with("characters/") && selection.characters {
                    let sub = entry_str.trim_start_matches("characters/");
                    Some(characters_dir.join(sub))
                } else if entry_str.starts_with("lorebooks/") && selection.lorebooks {
                    let sub = entry_str.trim_start_matches("lorebooks/");
                    Some(lorebooks_dir.join(sub))
                } else if entry_str.starts_with("personas/") && selection.personas {
                    let sub = entry_str.trim_start_matches("personas/");
                    Some(personas_dir.join(sub))
                } else if entry_str.starts_with("scenes/") && selection.soul_stage {
                    let sub = entry_str.trim_start_matches("scenes/");
                    Some(scenes_dir.join(sub))
                } else if entry_str == MEMORY_DB_ENTRY && selection.soul_memory {
                    // The live DB is open; it is swapped in on the next start (see MemoryDb::apply_pending_restore).
                    Some(loc.memory_db.with_extension("db.restore"))
                } else if entry_str.starts_with("companion/") && selection.companion {
                    let sub = entry_str.trim_start_matches("companion/");
                    Some(data_dir.join("companion").join(sub))
                } else if entry_str.starts_with("settings/") && selection.settings {
                    let sub = entry_str.trim_start_matches("settings/");
                    Some(PathBuf::from(&paths.config_dir).join(sub))
                } else {
                    None
                };

            if let Some(dest) = target_path {
                if file.is_dir() {
                    fs::create_dir_all(&dest)
                        .map_err(|e| format!("Cannot create {}: {e}", dest.display()))?;
                } else {
                    if let Some(parent) = dest.parent() {
                        fs::create_dir_all(parent)
                            .map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
                    }
                    let temporary_path = dest.with_file_name(format!(
                        ".{}.restore-{:016x}.tmp",
                        dest.file_name().unwrap_or_default().to_string_lossy(),
                        rand::random::<u64>()
                    ));
                    let mut out_file = OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&temporary_path)
                        .map_err(|e| format!("Cannot create {}: {e}", temporary_path.display()))?;
                    let _temporary_guard = RemoveFileOnDrop(temporary_path.clone());
                    io::copy(&mut file, &mut out_file)
                        .map_err(|e| format!("Cannot read backup entry {}: {e}", entry_str))?;
                    out_file
                        .sync_all()
                        .map_err(|e| format!("Cannot write {}: {e}", temporary_path.display()))?;
                    drop(out_file);
                    fs::rename(&temporary_path, &dest)
                        .map_err(|e| format!("Cannot replace {}: {e}", dest.display()))?;
                    if entry_str == MEMORY_DB_ENTRY {
                        pending_db_restore = true;
                    }
                    restored_count += 1;
                }
            }
        }

        info!(
            "Backup '{}' erfolgreich wiederhergestellt ({} Dateien).",
            filename, restored_count
        );
        if pending_db_restore {
            // Coded like errors so the frontend shows it in the interface language.
            Ok(crate::err!(
                "backend.backup.restoredRestart",
                count = restored_count
            ))
        } else {
            Ok(crate::err!(
                "backend.backup.restored",
                count = restored_count
            ))
        }
    }

    /// Deletes a backup ZIP file.
    pub fn delete_backup(filename: &str) -> Result<bool, String> {
        if Path::new(filename)
            .file_name()
            .is_none_or(|name| name != filename)
            || !filename.ends_with(".zip")
        {
            return Err("Ungültiger Backup-Dateiname".to_string());
        }
        let backups_dir = Self::get_backups_dir();
        let backup_path = backups_dir.join(filename);
        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|e| crate::err!("backend.backup.delete", error = e))?;
            info!("Backup '{}' gelöscht.", filename);
            Ok(true)
        } else {
            Err(crate::err!("backend.backup.missing", name = filename))
        }
    }

    /// Rotates safety snapshots, keeping only the newest 5.
    fn rotate_safety_backups(backups_dir: &Path) {
        let mut safety_files = Vec::new();

        if let Ok(entries) = fs::read_dir(backups_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let name = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    if name.starts_with("pre_restore_")
                        && name.ends_with(".zip")
                        && let Ok(meta) = fs::metadata(&path)
                    {
                        let mtime = meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                        safety_files.push((path, mtime));
                    }
                }
            }
        }

        // Sort newest first
        safety_files.sort_by_key(|f| std::cmp::Reverse(f.1));

        if safety_files.len() > SAFETY_ROTATION_KEEP {
            for (old_path, _) in &safety_files[SAFETY_ROTATION_KEEP..] {
                let _ = fs::remove_file(old_path);
                info!(
                    "Altes Sicherheits-Snapshot rotiert/gelöscht: {:?}",
                    old_path
                );
            }
        }
    }
}

/// Simple recursive directory crawler
fn walkdir(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    if dir.is_dir() {
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Cannot read backup directory {}: {e}", dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| format!("Cannot read {}: {e}", dir.display()))?;
            let path = entry.path();
            if path.is_dir() {
                let mut sub = walkdir(&path)?;
                files.append(&mut sub);
            } else {
                files.push(path);
            }
        }
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backup_group_selection_defaults() {
        let sel = BackupGroupSelection::default();
        assert!(sel.characters);
        assert!(sel.lorebooks);
        assert!(sel.soul_memory);
        assert!(sel.soul_stage);
        assert!(sel.settings);
    }

    fn temp_locations(name: &str) -> (PathBuf, BackupLocations) {
        let root = std::env::temp_dir().join(format!(
            "otakusoul-backup-test-{}-{}",
            name,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let dir = |sub: &str| {
            let path = root.join(sub);
            fs::create_dir_all(&path).unwrap();
            path.to_string_lossy().to_string()
        };
        let paths = AppPaths {
            config_dir: dir("config"),
            data_dir: dir("data"),
            characters_dir: dir("data/characters"),
            lorebooks_dir: dir("data/lorebooks"),
            personas_dir: dir("data/personas"),
            scenes_dir: dir("data/scenes"),
            trash_dir: dir("data/trash"),
            bundled_presets_dir: String::new(),
            bundled_models_dir: String::new(),
            bundled_vrm_dir: String::new(),
            bundled_bin_dir: String::new(),
            loras_dir: dir("loras"),
        };
        let loc = BackupLocations {
            backups_dir: PathBuf::from(dir("data/backups")),
            memory_db: root.join("data/otakusoul.db"),
            paths,
        };
        (root, loc)
    }

    #[test]
    fn backup_round_trip_restores_files_settings_and_database() {
        let (root, loc) = temp_locations("roundtrip");
        let character = PathBuf::from(&loc.paths.characters_dir).join("ayu/card.json");
        fs::create_dir_all(character.parent().unwrap()).unwrap();
        fs::write(&character, r#"{"name":"Ayu"}"#).unwrap();
        let settings = PathBuf::from(&loc.paths.config_dir).join("settings.json");
        fs::write(&settings, r#"{"theme":"sakura"}"#).unwrap();
        let conn = rusqlite::Connection::open(&loc.memory_db).unwrap();
        conn.execute_batch(
            "CREATE TABLE memories (text TEXT); INSERT INTO memories VALUES ('erster Kuss');",
        )
        .unwrap();
        drop(conn);

        let backup = ProfileBackupManager::create_backup_at(
            &loc,
            BackupGroupSelection::default(),
            None,
            false,
        )
        .unwrap();
        let manifest = backup.manifest.unwrap();
        assert_eq!(manifest.schema_version, SCHEMA_VERSION);
        assert_eq!(manifest.files_count, 3);

        fs::remove_dir_all(character.parent().unwrap()).unwrap();
        fs::write(&settings, r#"{"theme":"obsidian"}"#).unwrap();

        ProfileBackupManager::restore_backup_at(&loc, &backup.filename, None).unwrap();

        assert_eq!(fs::read_to_string(&character).unwrap(), r#"{"name":"Ayu"}"#);
        assert_eq!(
            fs::read_to_string(&settings).unwrap(),
            r#"{"theme":"sakura"}"#
        );
        // The live database is only swapped in on the next start.
        let restored =
            rusqlite::Connection::open(loc.memory_db.with_extension("db.restore")).unwrap();
        let text: String = restored
            .query_row("SELECT text FROM memories", [], |row| row.get(0))
            .unwrap();
        assert_eq!(text, "erster Kuss");
        // A safety snapshot of the pre-restore state was taken.
        assert!(
            fs::read_dir(&loc.backups_dir)
                .unwrap()
                .flatten()
                .any(|e| e.file_name().to_string_lossy().starts_with("pre_restore_"))
        );

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restore_respects_group_selection() {
        let (root, loc) = temp_locations("groups");
        let lorebook = PathBuf::from(&loc.paths.lorebooks_dir).join("welt.json");
        let persona = PathBuf::from(&loc.paths.personas_dir).join("ich.json");
        fs::write(&lorebook, "lore").unwrap();
        fs::write(&persona, "persona").unwrap();
        let backup = ProfileBackupManager::create_backup_at(
            &loc,
            BackupGroupSelection::default(),
            None,
            false,
        )
        .unwrap();
        fs::remove_file(&lorebook).unwrap();
        fs::remove_file(&persona).unwrap();

        let only_lorebooks = BackupGroupSelection {
            characters: false,
            lorebooks: true,
            personas: false,
            soul_memory: false,
            soul_stage: false,
            companion: false,
            settings: false,
        };
        ProfileBackupManager::restore_backup_at(&loc, &backup.filename, Some(only_lorebooks))
            .unwrap();

        assert!(lorebook.exists());
        assert!(!persona.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn safety_snapshots_are_rotated() {
        let (root, loc) = temp_locations("rotation");
        for i in 0..(SAFETY_ROTATION_KEEP + 3) {
            fs::write(loc.backups_dir.join(format!("pre_restore_{i:02}.zip")), b"").unwrap();
        }
        fs::write(loc.backups_dir.join("otakusoul_backup_keep.zip"), b"").unwrap();

        ProfileBackupManager::rotate_safety_backups(&loc.backups_dir);

        let names: Vec<String> = fs::read_dir(&loc.backups_dir)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(
            names
                .iter()
                .filter(|n| n.starts_with("pre_restore_"))
                .count(),
            SAFETY_ROTATION_KEEP
        );
        assert!(names.contains(&"otakusoul_backup_keep.zip".to_string()));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn restore_of_missing_backup_fails() {
        let (root, loc) = temp_locations("missing");
        assert!(ProfileBackupManager::restore_backup_at(&loc, "gibt-es-nicht.zip", None).is_err());
        let _ = fs::remove_dir_all(root);
    }
}
