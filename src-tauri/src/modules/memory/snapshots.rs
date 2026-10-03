//! Database snapshots and the Soul of Waifu memory import.

use super::*;

impl MemoryDb {
    // --- Backups & Snapshots ---

    pub fn backup_dir_for_character(char_id: &str) -> PathBuf {
        let base_dir = crate::modules::paths::base_dirs().1;
        base_dir.join("characters").join(char_id).join("backups")
    }

    pub fn backup_memory_state(
        &self,
        char_id: &str,
        user_name: Option<&str>,
        custom_backup_dir: Option<&Path>,
    ) -> Result<MemoryBackupInfo, String> {
        let target_dir = match custom_backup_dir {
            Some(d) => d.to_path_buf(),
            None => Self::backup_dir_for_character(char_id),
        };
        std::fs::create_dir_all(&target_dir)
            .map_err(|e| crate::err!("backend.memory.backupDir", error = e))?;

        let psychology = self
            .get_or_create_psychology(char_id)
            .map_err(|e| e.to_string())?;
        let user = user_name.unwrap_or("User");
        let relationship = self.get_or_create_relationship(char_id, user).ok();
        let episodic_memories = self.get_episodic_memories(char_id, 100).unwrap_or_default();
        let diary_entries = self.get_diary_entries(char_id, 50).unwrap_or_default();
        let healing_logs = self.get_healing_logs(char_id, 50).unwrap_or_default();

        let now = current_timestamp();
        let snapshot = MemoryBackupSnapshot {
            character_id: char_id.to_string(),
            created_at: now,
            psychology,
            relationship,
            episodic_memories,
            diary_entries,
            healing_logs,
        };

        let json_str = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
        let filename = format!("backup_{}_{}.json", char_id, now);
        let file_path = target_dir.join(&filename);
        std::fs::write(&file_path, &json_str)
            .map_err(|e| crate::err!("backend.memory.backupWrite", error = e))?;

        let date_formatted = chrono::DateTime::from_timestamp(now as i64, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| format!("{}", now));

        let size_bytes = json_str.len() as u64;

        // Cleanup: keep at most 20 recent backups
        if let Ok(mut entries) = self.list_memory_backups(char_id, Some(&target_dir))
            && entries.len() > 20
        {
            entries.sort_by_key(|b| b.timestamp);
            for old in entries.iter().take(entries.len() - 20) {
                let old_path = target_dir.join(&old.filename);
                let _ = std::fs::remove_file(old_path);
            }
        }

        Ok(MemoryBackupInfo {
            filename,
            timestamp: now,
            date_formatted,
            size_bytes,
        })
    }

    pub fn list_memory_backups(
        &self,
        char_id: &str,
        custom_backup_dir: Option<&Path>,
    ) -> Result<Vec<MemoryBackupInfo>, String> {
        let target_dir = match custom_backup_dir {
            Some(d) => d.to_path_buf(),
            None => Self::backup_dir_for_character(char_id),
        };

        let read_dir = match std::fs::read_dir(&target_dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e.to_string()),
        };
        let mut backups = Vec::new();
        for entry in read_dir {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name();
            let Some(file_name) = name.to_str() else {
                continue;
            };
            if !file_name.ends_with(".json")
                || !file_name.starts_with(&format!("backup_{}_", char_id))
            {
                continue;
            }
            let meta = std::fs::metadata(entry.path()).map_err(|e| e.to_string())?;
            if !meta.is_file() {
                continue;
            }
            let ts = file_name
                .trim_start_matches(&format!("backup_{}_", char_id))
                .trim_end_matches(".json")
                .parse::<u64>()
                .unwrap_or(0);
            let date_formatted = chrono::DateTime::from_timestamp(ts as i64, 0)
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_else(|| format!("{}", ts));
            backups.push(MemoryBackupInfo {
                filename: file_name.to_string(),
                timestamp: ts,
                date_formatted,
                size_bytes: meta.len(),
            });
        }

        backups.sort_by_key(|b| std::cmp::Reverse(b.timestamp));
        Ok(backups)
    }

    pub fn restore_memory_backup(&self, backup_file_path: &Path) -> Result<(), String> {
        if !backup_file_path.exists() {
            return Err(crate::err!(
                "backend.memory.backupMissing",
                path = backup_file_path.display()
            ));
        }

        let content = std::fs::read_to_string(backup_file_path).map_err(|e| e.to_string())?;
        let snapshot: MemoryBackupSnapshot =
            serde_json::from_str(&content).map_err(|e| e.to_string())?;

        let char_id = &snapshot.character_id;
        self.update_psychology(char_id, &snapshot.psychology)
            .map_err(|e| e.to_string())?;

        if let Some(rel) = &snapshot.relationship {
            self.update_relationship(char_id, rel)
                .map_err(|e| e.to_string())?;
        }

        for mem in &snapshot.episodic_memories {
            let _ =
                self.add_episodic_memory(char_id, &mem.category, &mem.content, mem.significance);
        }

        for d in &snapshot.diary_entries {
            let _ = self.add_diary_entry(char_id, &d.title, &d.entry_text, &d.mood);
        }

        for h in &snapshot.healing_logs {
            let _ = self.log_healing(char_id, &h.action, &h.details);
        }

        let _ = self.log_healing(
            char_id,
            "backup_restored",
            &format!(
                "Backup wiederhergestellt von Snapshot {}",
                snapshot.created_at
            ),
        );

        Ok(())
    }

    // --- SoW Memory Folder Import ---

    pub fn import_sow_memory_folder(
        &self,
        char_id: &str,
        folder: &Path,
        user_name: &str,
    ) -> Result<usize, String> {
        if !folder.exists() || !folder.is_dir() {
            return Err(crate::err!(
                "backend.memory.importMissing",
                path = folder.display()
            ));
        }

        let mut count = 0;

        // 1. MEMORY.md
        let mem_file = folder.join("MEMORY.md");
        if mem_file.exists()
            && let Ok(content) = std::fs::read_to_string(&mem_file)
            && !content.trim().is_empty()
        {
            self.parse_and_sync_character_markdown(char_id, &content)?;
            count += 1;
        }

        // 2. USER.md
        let user_file = folder.join("USER.md");
        if user_file.exists()
            && let Ok(content) = std::fs::read_to_string(&user_file)
            && !content.trim().is_empty()
        {
            self.parse_and_sync_user_markdown(char_id, user_name, &content)?;
            count += 1;
        }

        // 3. topics/ folder
        let topics_dir = folder.join("topics");
        if topics_dir.exists()
            && topics_dir.is_dir()
            && let Ok(entries) = std::fs::read_dir(&topics_dir)
        {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file()
                    && path.extension().and_then(|s| s.to_str()) == Some("md")
                    && let Ok(topic_content) = std::fs::read_to_string(&path)
                    && !topic_content.trim().is_empty()
                {
                    let topic_name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("topic");
                    let formatted = format!("[Topic: {}]\n{}", topic_name, topic_content.trim());
                    let _ = self.add_episodic_memory(char_id, "topic", &formatted, 3);
                    count += 1;
                }
            }
        }

        // 4. DIARY.md if present
        let diary_file = folder.join("DIARY.md");
        if diary_file.exists()
            && let Ok(content) = std::fs::read_to_string(&diary_file)
            && !content.trim().is_empty()
        {
            let _ = self.add_diary_entry(char_id, "Importiertes Tagebuch", &content, "Reflective");
            count += 1;
        }

        let _ = self.log_healing(
            char_id,
            "sow_memory_imported",
            &format!("{} Einträge aus SoW-Ordner importiert", count),
        );

        Ok(count)
    }
}
