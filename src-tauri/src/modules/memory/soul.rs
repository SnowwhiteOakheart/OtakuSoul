//! Psychology, relationship, episodic memories, diary and emotional decay of a character.

use super::*;

impl MemoryDb {
    // --- Psychology ---
    pub fn get_or_create_psychology(
        &self,
        char_id: &str,
    ) -> Result<PsychologyState, rusqlite::Error> {
        let conn = self.conn.lock();
        Self::get_or_create_psychology_on(&conn, char_id)
    }

    pub(super) fn get_or_create_psychology_on(
        conn: &Connection,
        char_id: &str,
    ) -> Result<PsychologyState, rusqlite::Error> {
        let lang = crate::modules::content_lang::ContentLang::current();
        let none = lang.none_marker();
        let mut stmt = conn.prepare(
            "SELECT primary_emotion, intensity, psychological_tension, emotional_decay_counter, active_agenda, immediate_focus, updated_at, core_identity, cognitive_dissonance
             FROM soul_psychology WHERE character_id = ?1",
        )?;

        let mut rows = stmt.query(params![char_id])?;
        if let Some(row) = rows.next()? {
            let core_id_str: String = row.get(7).unwrap_or_else(|_| "[]".to_string());
            let core_identity: Vec<String> = serde_json::from_str(&core_id_str).unwrap_or_default();
            let cognitive_dissonance: String = row.get(8).unwrap_or_else(|_| none.to_string());
            Ok(PsychologyState {
                primary_emotion: row.get(0)?,
                intensity: row.get(1)?,
                psychological_tension: row.get(2)?,
                emotional_decay_counter: row.get(3)?,
                active_agenda: row.get(4)?,
                immediate_focus: row.get(5)?,
                core_identity,
                cognitive_dissonance,
                updated_at: row.get(6)?,
            })
        } else {
            let now = current_timestamp();
            let agenda = lang.t("Observe and respond.");
            let focus = lang.t("The current conversation.");
            conn.execute(
                "INSERT INTO soul_psychology (character_id, primary_emotion, intensity, psychological_tension, emotional_decay_counter, active_agenda, immediate_focus, core_identity, cognitive_dissonance, updated_at)
                 VALUES (?1, 'Calm', 3, ?3, 0, ?4, ?5, '[]', ?3, ?2)",
                params![char_id, now, none, agenda, focus],
            )?;

            Ok(PsychologyState {
                primary_emotion: "Calm".to_string(),
                intensity: 3,
                psychological_tension: none.to_string(),
                emotional_decay_counter: 0,
                active_agenda: agenda.to_string(),
                immediate_focus: focus.to_string(),
                core_identity: Vec::new(),
                cognitive_dissonance: none.to_string(),
                updated_at: now,
            })
        }
    }

    pub fn update_psychology(
        &self,
        char_id: &str,
        state: &PsychologyState,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        Self::update_psychology_on(&conn, char_id, state)
    }

    pub(super) fn update_psychology_on(
        conn: &Connection,
        char_id: &str,
        state: &PsychologyState,
    ) -> Result<(), rusqlite::Error> {
        let now = current_timestamp();
        let core_id_str =
            serde_json::to_string(&state.core_identity).unwrap_or_else(|_| "[]".to_string());
        conn.execute(
            "INSERT INTO soul_psychology (character_id, primary_emotion, intensity, psychological_tension, emotional_decay_counter, active_agenda, immediate_focus, core_identity, cognitive_dissonance, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(character_id) DO UPDATE SET
                primary_emotion = excluded.primary_emotion,
                intensity = excluded.intensity,
                psychological_tension = excluded.psychological_tension,
                emotional_decay_counter = excluded.emotional_decay_counter,
                active_agenda = excluded.active_agenda,
                immediate_focus = excluded.immediate_focus,
                core_identity = excluded.core_identity,
                cognitive_dissonance = excluded.cognitive_dissonance,
                updated_at = excluded.updated_at",
            params![
                char_id,
                state.primary_emotion,
                state.intensity,
                state.psychological_tension,
                state.emotional_decay_counter,
                state.active_agenda,
                state.immediate_focus,
                core_id_str,
                state.cognitive_dissonance,
                now
            ],
        )?;
        Ok(())
    }

    // --- Relationship ---
    pub fn get_or_create_relationship(
        &self,
        char_id: &str,
        user_name: &str,
    ) -> Result<RelationshipState, rusqlite::Error> {
        let conn = self.conn.lock();
        Self::get_or_create_relationship_on(&conn, char_id, user_name)
    }

    pub(super) fn get_or_create_relationship_on(
        conn: &Connection,
        char_id: &str,
        user_name: &str,
    ) -> Result<RelationshipState, rusqlite::Error> {
        let none = crate::modules::content_lang::ContentLang::current().none_marker();
        let mut stmt = conn.prepare(
            "SELECT trust_level, unspoken_tension, preferences_habits, shared_milestones, updated_at, role_in_story, known_attributes, dynamic_description
             FROM soul_relationship WHERE character_id = ?1 AND user_name = ?2",
        )?;

        let mut rows = stmt.query(params![char_id, user_name])?;
        if let Some(row) = rows.next()? {
            let pref_str: String = row.get(2)?;
            let mile_str: String = row.get(3)?;

            let preferences_habits: Vec<String> =
                serde_json::from_str(&pref_str).unwrap_or_default();
            let shared_milestones: Vec<String> =
                serde_json::from_str(&mile_str).unwrap_or_default();
            let role_in_story: String = row.get(5).unwrap_or_else(|_| "User".to_string());
            let known_attributes: String = row.get(6).unwrap_or_else(|_| none.to_string());
            let dynamic_description: String = row.get(7).unwrap_or_else(|_| none.to_string());

            Ok(RelationshipState {
                user_name: user_name.to_string(),
                role_in_story,
                known_attributes,
                trust_level: row.get(0)?,
                dynamic_description,
                unspoken_tension: row.get(1)?,
                preferences_habits,
                shared_milestones,
                updated_at: row.get(4)?,
            })
        } else {
            let now = current_timestamp();
            conn.execute(
                "INSERT INTO soul_relationship (character_id, user_name, trust_level, unspoken_tension, preferences_habits, shared_milestones, role_in_story, known_attributes, dynamic_description, updated_at)
                 VALUES (?1, ?2, 'Neutral', ?4, '[]', '[]', 'User', ?4, ?4, ?3)",
                params![char_id, user_name, now, none],
            )?;

            Ok(RelationshipState {
                user_name: user_name.to_string(),
                role_in_story: "User".to_string(),
                known_attributes: none.to_string(),
                trust_level: "Neutral".to_string(),
                dynamic_description: none.to_string(),
                unspoken_tension: none.to_string(),
                preferences_habits: Vec::new(),
                shared_milestones: Vec::new(),
                updated_at: now,
            })
        }
    }

    pub fn update_relationship(
        &self,
        char_id: &str,
        state: &RelationshipState,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        Self::update_relationship_on(&conn, char_id, state)
    }

    pub(super) fn update_relationship_on(
        conn: &Connection,
        char_id: &str,
        state: &RelationshipState,
    ) -> Result<(), rusqlite::Error> {
        let now = current_timestamp();
        let pref_str =
            serde_json::to_string(&state.preferences_habits).unwrap_or_else(|_| "[]".to_string());
        let mile_str =
            serde_json::to_string(&state.shared_milestones).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO soul_relationship (character_id, user_name, role_in_story, known_attributes, trust_level, dynamic_description, unspoken_tension, preferences_habits, shared_milestones, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(character_id, user_name) DO UPDATE SET
                role_in_story = excluded.role_in_story,
                known_attributes = excluded.known_attributes,
                trust_level = excluded.trust_level,
                dynamic_description = excluded.dynamic_description,
                unspoken_tension = excluded.unspoken_tension,
                preferences_habits = excluded.preferences_habits,
                shared_milestones = excluded.shared_milestones,
                updated_at = excluded.updated_at",
            params![
                char_id,
                state.user_name,
                state.role_in_story,
                state.known_attributes,
                state.trust_level,
                state.dynamic_description,
                state.unspoken_tension,
                pref_str,
                mile_str,
                now
            ],
        )?;
        Ok(())
    }

    // --- Episodic Memory ---
    /// Adds a memory derived by the model (no source). See [`Self::add_episodic_memory_from`].
    pub fn add_episodic_memory(
        &self,
        char_id: &str,
        category: &str,
        content: &str,
        significance: u32,
    ) -> Result<i64, rusqlite::Error> {
        self.add_episodic_memory_from(
            char_id,
            category,
            content,
            significance,
            &MemorySource::auto(),
        )
    }

    /// Adds a memory with where it comes from. The same text again only raises its significance.
    pub fn add_episodic_memory_from(
        &self,
        char_id: &str,
        category: &str,
        content: &str,
        significance: u32,
        source: &MemorySource<'_>,
    ) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock();
        Self::add_episodic_memory_sourced_on(
            &conn,
            char_id,
            category,
            content,
            significance,
            source,
        )
    }

    /// Restores a memory from a snapshot with its origin, sources, pin, review flag, topic and
    /// whether it is outdated. Returns its id in this database; `superseded_by` still names the
    /// snapshot's id and is mapped by the caller.
    pub(super) fn restore_episodic_memory_on(
        conn: &Connection,
        char_id: &str,
        memory: &EpisodicMemory,
    ) -> Result<i64, rusqlite::Error> {
        if let Some(superseded_at) = memory.superseded_at {
            // An outdated version must not merge into an active memory with the same text.
            let existing: Option<i64> = conn
                .query_row(
                    "SELECT id FROM soul_episodic_memory
                     WHERE character_id = ?1 AND LOWER(content) = LOWER(?2) AND superseded_at IS NOT NULL",
                    params![char_id, memory.content.trim()],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(id) = existing {
                return Ok(id);
            }
            conn.execute(
                "INSERT INTO soul_episodic_memory (character_id, category, content, significance, created_at,
                     last_accessed_at, source_chat_id, source_message_ids, origin, pinned, needs_review,
                     topic_key, superseded_at, supersede_reason)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                params![
                    char_id,
                    memory.category,
                    memory.content.trim(),
                    memory.significance,
                    current_timestamp(),
                    memory.source_chat_id,
                    serde_json::to_string(&memory.source_message_ids)
                        .unwrap_or_else(|_| "[]".into()),
                    memory.origin,
                    memory.pinned,
                    memory.needs_review,
                    memory.topic_key,
                    superseded_at,
                    memory.supersede_reason,
                ],
            )?;
            return Ok(conn.last_insert_rowid());
        }
        let source = MemorySource {
            origin: &memory.origin,
            chat_id: memory.source_chat_id.as_deref(),
            message_ids: &memory.source_message_ids,
        };
        let id = Self::add_episodic_memory_sourced_on(
            conn,
            char_id,
            &memory.category,
            &memory.content,
            memory.significance,
            &source,
        )?;
        // An existing memory with the same text keeps its own flags unless the snapshot pins it.
        conn.execute(
            "UPDATE soul_episodic_memory SET pinned = MAX(pinned, ?1), needs_review = MAX(needs_review, ?2),
                 topic_key = COALESCE(topic_key, ?3)
             WHERE id = ?4",
            params![memory.pinned, memory.needs_review, memory.topic_key, id],
        )?;
        Ok(id)
    }

    /// After a restore: points `superseded_by` of the restored outdated memories to the new ids.
    pub(super) fn relink_restored_memories_on(
        conn: &Connection,
        memories: &[EpisodicMemory],
        new_ids: &std::collections::HashMap<i64, i64>,
    ) -> Result<(), rusqlite::Error> {
        for memory in memories {
            if let (Some(_), Some(old_by), Some(id)) = (
                memory.superseded_at,
                memory.superseded_by,
                new_ids.get(&memory.id),
            ) {
                conn.execute(
                    "UPDATE soul_episodic_memory SET superseded_by = ?1 WHERE id = ?2",
                    params![new_ids.get(&old_by), id],
                )?;
            }
        }
        Ok(())
    }

    pub(super) fn add_episodic_memory_sourced_on(
        conn: &Connection,
        char_id: &str,
        category: &str,
        content: &str,
        significance: u32,
        source: &MemorySource<'_>,
    ) -> Result<i64, rusqlite::Error> {
        let now = current_timestamp();

        // 1. Duplicate check (case-insensitive normalized exact or substring match)
        let trimmed = content.trim();
        let mut check_stmt = conn.prepare(
            "SELECT id, significance FROM soul_episodic_memory
             WHERE character_id = ?1 AND LOWER(content) = LOWER(?2) AND superseded_at IS NULL",
        )?;
        let mut rows = check_stmt.query(params![char_id, trimmed])?;
        if let Some(row) = rows.next()? {
            let id: i64 = row.get(0)?;
            let old_sig: u32 = row.get(1)?;
            let new_sig = old_sig.max(significance);
            conn.execute(
                "UPDATE soul_episodic_memory SET significance = ?1, last_accessed_at = ?2 WHERE id = ?3",
                params![new_sig, now, id],
            )?;
            return Ok(id);
        }

        conn.execute(
            "INSERT INTO soul_episodic_memory (character_id, category, content, significance, created_at, last_accessed_at,
                                               source_chat_id, source_message_ids, origin)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                char_id,
                category,
                trimmed,
                significance,
                now,
                now,
                source.chat_id,
                serde_json::to_string(source.message_ids).unwrap_or_else(|_| "[]".into()),
                source.origin
            ],
        )?;
        let id = conn.last_insert_rowid();
        log_memory_change(conn, id, char_id, "created", "", trimmed)?;
        Ok(id)
    }

    pub fn get_episodic_memories(
        &self,
        char_id: &str,
        limit: usize,
    ) -> Result<Vec<EpisodicMemory>, rusqlite::Error> {
        let conn = self.conn.lock();
        // Pinned memories always come first, so they are in every memory context.
        let mut stmt = conn.prepare(&format!(
            "SELECT {EPISODIC_COLUMNS} FROM soul_episodic_memory
             WHERE character_id = ?1 AND superseded_at IS NULL
             ORDER BY pinned DESC, significance DESC, created_at DESC, id DESC LIMIT ?2"
        ))?;
        let rows = stmt.query_map(params![char_id, limit as i64], episodic_from_row)?;
        rows.collect()
    }

    /// Every memory of a character, oldest first (for snapshots).
    pub fn get_all_episodic_memories(
        &self,
        char_id: &str,
    ) -> Result<Vec<EpisodicMemory>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(&format!(
            "SELECT {EPISODIC_COLUMNS} FROM soul_episodic_memory WHERE character_id = ?1 ORDER BY id ASC"
        ))?;
        let rows = stmt.query_map(params![char_id], episodic_from_row)?;
        rows.collect()
    }

    /// The user corrects a memory: it counts as confirmed from now on.
    pub fn update_episodic_memory(
        &self,
        char_id: &str,
        id: i64,
        category: &str,
        content: &str,
        significance: u32,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        let before = memory_content(&conn, char_id, id)?;
        conn.execute(
            "UPDATE soul_episodic_memory SET category = ?1, content = ?2, significance = ?3, origin = 'edited', needs_review = 0,
                 supersede_reason = '' WHERE id = ?4 AND character_id = ?5",
            params![category, content.trim(), significance, id, char_id],
        )?;
        log_memory_change(&conn, id, char_id, "edited", &before, content.trim())
    }

    /// The character forgets this memory; the history keeps what it was.
    pub fn forget_episodic_memory(&self, char_id: &str, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        let before = memory_content(&conn, char_id, id)?;
        conn.execute(
            "DELETE FROM soul_episodic_memory WHERE id = ?1 AND character_id = ?2",
            params![id, char_id],
        )?;
        // Versions it replaced stay outdated, but no longer point to it.
        conn.execute(
            "UPDATE soul_episodic_memory SET superseded_by = NULL WHERE superseded_by = ?1 AND character_id = ?2",
            params![id, char_id],
        )?;
        log_memory_change(&conn, id, char_id, "forgotten", &before, "")
    }

    pub fn set_episodic_memory_pinned(
        &self,
        char_id: &str,
        id: i64,
        pinned: bool,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        let content = memory_content(&conn, char_id, id)?;
        conn.execute(
            "UPDATE soul_episodic_memory SET pinned = ?1 WHERE id = ?2 AND character_id = ?3",
            params![pinned, id, char_id],
        )?;
        log_memory_change(
            &conn,
            id,
            char_id,
            if pinned { "pinned" } else { "unpinned" },
            &content,
            &content,
        )
    }

    /// The user checked a memory whose source changed and keeps it as it is.
    pub fn confirm_episodic_memory(&self, char_id: &str, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        let content = memory_content(&conn, char_id, id)?;
        conn.execute(
            "UPDATE soul_episodic_memory SET needs_review = 0, supersede_reason = '' WHERE id = ?1 AND character_id = ?2",
            params![id, char_id],
        )?;
        log_memory_change(&conn, id, char_id, "confirmed", &content, &content)
    }

    /// Outdated memories of a character, most recently superseded first.
    pub fn get_superseded_memories(
        &self,
        char_id: &str,
        limit: usize,
    ) -> Result<Vec<EpisodicMemory>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(&format!(
            "SELECT {EPISODIC_COLUMNS} FROM soul_episodic_memory
             WHERE character_id = ?1 AND superseded_at IS NOT NULL
             ORDER BY superseded_at DESC, id DESC LIMIT ?2"
        ))?;
        let rows = stmt.query_map(params![char_id, limit as i64], episodic_from_row)?;
        rows.collect()
    }

    /// The user takes an outdated memory back: it is active again.
    pub fn restore_superseded_memory(&self, char_id: &str, id: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        let content = memory_content(&conn, char_id, id)?;
        conn.execute(
            "UPDATE soul_episodic_memory SET superseded_by = NULL, superseded_at = NULL, supersede_reason = ''
             WHERE id = ?1 AND character_id = ?2",
            params![id, char_id],
        )?;
        log_memory_change(&conn, id, char_id, "restored", &content, &content)
    }

    /// Marks an active memory as outdated. A pinned or user-made memory is never changed
    /// automatically: it is only flagged for review, with the reason.
    pub(super) fn supersede_memory_on(
        conn: &Connection,
        char_id: &str,
        id: i64,
        by: Option<i64>,
        reason: &str,
    ) -> Result<Superseded, rusqlite::Error> {
        let found: Option<(bool, String, String)> = conn
            .query_row(
                "SELECT pinned, origin, content FROM soul_episodic_memory
                 WHERE id = ?1 AND character_id = ?2 AND superseded_at IS NULL",
                params![id, char_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let Some((pinned, origin, content)) = found else {
            return Ok(Superseded::Missing);
        };
        if pinned || origin == "manual" || origin == "edited" {
            // An active memory keeps the reason only while it waits for review.
            conn.execute(
                "UPDATE soul_episodic_memory SET needs_review = 1, supersede_reason = ?1 WHERE id = ?2",
                params![reason.trim(), id],
            )?;
            log_memory_change(conn, id, char_id, "contradicted", &content, reason.trim())?;
            return Ok(Superseded::Flagged);
        }
        conn.execute(
            "UPDATE soul_episodic_memory SET superseded_by = ?1, superseded_at = ?2, supersede_reason = ?3
             WHERE id = ?4",
            params![by, current_timestamp(), reason.trim(), id],
        )?;
        log_memory_change(conn, id, char_id, "superseded", &content, reason.trim())?;
        Ok(Superseded::Yes)
    }

    /// The active memory of an archivist topic, if there is one (newest first).
    pub fn active_topic_memory(
        &self,
        char_id: &str,
        topic_key: &str,
    ) -> Result<Option<EpisodicMemory>, rusqlite::Error> {
        let conn = self.conn.lock();
        Self::active_topic_memory_on(&conn, char_id, topic_key)
    }

    pub(super) fn active_topic_memory_on(
        conn: &Connection,
        char_id: &str,
        topic_key: &str,
    ) -> Result<Option<EpisodicMemory>, rusqlite::Error> {
        conn.query_row(
            &format!(
                "SELECT {EPISODIC_COLUMNS} FROM soul_episodic_memory
                 WHERE character_id = ?1 AND topic_key = ?2 AND superseded_at IS NULL
                 ORDER BY id DESC LIMIT 1"
            ),
            params![char_id, topic_key],
            episodic_from_row,
        )
        .optional()
    }

    /// Changes of one memory, oldest first.
    pub fn get_memory_history(
        &self,
        char_id: &str,
        id: i64,
    ) -> Result<Vec<MemoryChange>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT action, content_before, content_after, at FROM soul_memory_history
             WHERE memory_id = ?1 AND character_id = ?2 ORDER BY id ASC",
        )?;
        let rows = stmt.query_map(params![id, char_id], |row| {
            Ok(MemoryChange {
                action: row.get(0)?,
                content_before: row.get(1)?,
                content_after: row.get(2)?,
                at: row.get(3)?,
            })
        })?;
        rows.collect()
    }

    /// Number of memories learned from this message (for the hint after changing it).
    pub fn count_memories_from_message(
        &self,
        chat_id: &str,
        message_id: &str,
    ) -> Result<usize, rusqlite::Error> {
        let conn = self.conn.lock();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM soul_episodic_memory WHERE source_chat_id = ?1 AND source_message_ids LIKE ?2",
            params![chat_id, format!("%\"{message_id}\"%")],
            |row| row.get(0),
        )?;
        Ok(count as usize)
    }

    // --- Diary ---
    pub fn add_diary_entry(
        &self,
        char_id: &str,
        title: &str,
        entry_text: &str,
        mood: &str,
    ) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock();
        Self::add_diary_entry_on(&conn, char_id, title, entry_text, mood)
    }

    pub(super) fn add_diary_entry_on(
        conn: &Connection,
        char_id: &str,
        title: &str,
        entry_text: &str,
        mood: &str,
    ) -> Result<i64, rusqlite::Error> {
        let now = current_timestamp();
        conn.execute(
            "INSERT INTO soul_diary (character_id, title, entry_text, mood, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![char_id, title.trim(), entry_text.trim(), mood, now],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_diary_entries(
        &self,
        char_id: &str,
        limit: usize,
    ) -> Result<Vec<DiaryEntry>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, title, entry_text, mood, created_at FROM soul_diary WHERE character_id = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![char_id, limit as i64], |row| {
            Ok(DiaryEntry {
                id: row.get(0)?,
                title: row.get(1)?,
                entry_text: row.get(2)?,
                mood: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        let mut entries = Vec::new();
        for r in rows {
            entries.push(r?);
        }
        Ok(entries)
    }

    /// Writes everything one memory reflection decided, in one transaction: a failure leaves
    /// the memory as it was. Returns the id of the diary entry, if one was written.
    pub fn apply_reflection(
        &self,
        char_id: &str,
        changes: &ReflectionChanges<'_>,
    ) -> Result<ReflectionOutcome, rusqlite::Error> {
        let conn = self.conn.lock();
        let tx = conn.unchecked_transaction()?;
        if let Some(psychology) = changes.psychology {
            Self::update_psychology_on(&tx, char_id, psychology)?;
        }
        if let Some(relationship) = changes.relationship {
            Self::update_relationship_on(&tx, char_id, relationship)?;
        }
        for entry in changes.healing {
            Self::log_healing_on(&tx, char_id, "contradiction_resolved", entry)?;
        }
        // A new version of a topic supersedes the active one (a protected one is flagged).
        let mut topic_ids = std::collections::HashMap::new();
        for topic in changes.topics {
            let previous = match &topic.key {
                Some(key) => Self::active_topic_memory_on(&tx, char_id, key)?,
                None => None,
            };
            let id = Self::add_episodic_memory_sourced_on(
                &tx,
                char_id,
                "topic",
                &topic.text,
                4,
                &changes.source,
            )?;
            if let Some(key) = &topic.key {
                tx.execute(
                    "UPDATE soul_episodic_memory SET topic_key = ?1 WHERE id = ?2",
                    params![key, id],
                )?;
                topic_ids.insert(key.clone(), id);
                if let Some(previous) = previous.filter(|p| p.id != id) {
                    Self::supersede_memory_on(&tx, char_id, previous.id, Some(id), "")?;
                }
            }
        }
        let mut contradictions = 0;
        for outdated in changes.supersede {
            let by = outdated
                .replaced_by_topic
                .as_deref()
                .and_then(normalize_topic_key)
                .and_then(|key| topic_ids.get(&key).copied());
            if by != Some(outdated.id)
                && Self::supersede_memory_on(&tx, char_id, outdated.id, by, &outdated.reason)?
                    != Superseded::Missing
            {
                contradictions += 1;
            }
        }
        if let Some(intentions) = changes.intentions {
            Self::apply_intention_changes_on(&tx, char_id, intentions)?;
        }
        let diary = match changes.diary {
            Some((title, text, mood)) => {
                Some(Self::add_diary_entry_on(&tx, char_id, title, text, mood)?)
            }
            None => None,
        };
        tx.commit()?;
        Ok(ReflectionOutcome {
            diary,
            contradictions,
        })
    }

    // --- Healing & Emotional Decay ---
    pub fn log_healing(
        &self,
        char_id: &str,
        action: &str,
        details: &str,
    ) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock();
        Self::log_healing_on(&conn, char_id, action, details)
    }

    pub(super) fn log_healing_on(
        conn: &Connection,
        char_id: &str,
        action: &str,
        details: &str,
    ) -> Result<i64, rusqlite::Error> {
        let now = current_timestamp();
        conn.execute(
            "INSERT INTO soul_healing_log (character_id, action, details, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![char_id, action, details, now],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_healing_logs(
        &self,
        char_id: &str,
        limit: usize,
    ) -> Result<Vec<HealingLogEntry>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, action, details, created_at FROM soul_healing_log WHERE character_id = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![char_id, limit as i64], |row| {
            Ok(HealingLogEntry {
                id: row.get(0)?,
                action: row.get(1)?,
                details: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        let mut logs = Vec::new();
        for r in rows {
            logs.push(r?);
        }
        Ok(logs)
    }

    /// Emotional Decay: Gradually cools down emotional intensity spikes towards baseline 3
    pub fn apply_emotional_decay(&self, char_id: &str) -> Result<Option<String>, rusqlite::Error> {
        let mut psych = self.get_or_create_psychology(char_id)?;

        let mut decay_msg = None;
        if psych.intensity > 3 {
            psych.emotional_decay_counter += 1;
            if psych.emotional_decay_counter >= 2 {
                psych.intensity -= 1;
                psych.emotional_decay_counter = 0;
                let msg = format!(
                    "Emotional Decay angewandt: Intensität von {} auf {} abgekühlt.",
                    psych.intensity + 1,
                    psych.intensity
                );
                decay_msg = Some(msg.clone());
                self.log_healing(char_id, "decay_applied", &msg)?;
            }
        } else if psych.intensity < 3 {
            psych.intensity += 1;
        }

        self.update_psychology(char_id, &psych)?;
        Ok(decay_msg)
    }

    pub fn get_cognitive_overview(
        &self,
        char_id: &str,
        user_name: &str,
    ) -> Result<CognitiveOverview, rusqlite::Error> {
        let psychology = self.get_or_create_psychology(char_id)?;
        let relationship = self.get_or_create_relationship(char_id, user_name)?;
        let recent_memories = self.get_episodic_memories(char_id, 15)?;
        let recent_diary = self.get_diary_entries(char_id, 5)?;
        let healing_logs = self.get_healing_logs(char_id, 10)?;

        Ok(CognitiveOverview {
            psychology,
            relationship,
            recent_memories,
            recent_diary,
            healing_logs,
        })
    }
}

/// Where a new episodic memory comes from.
pub struct MemorySource<'a> {
    /// `auto` (derived by the model) or `manual` (added by the user).
    pub origin: &'a str,
    pub chat_id: Option<&'a str>,
    pub message_ids: &'a [String],
}

impl MemorySource<'_> {
    pub fn auto() -> Self {
        MemorySource {
            origin: "auto",
            chat_id: None,
            message_ids: &[],
        }
    }

    pub fn manual() -> Self {
        MemorySource {
            origin: "manual",
            ..Self::auto()
        }
    }
}

fn memory_content(conn: &Connection, char_id: &str, id: i64) -> Result<String, rusqlite::Error> {
    conn.query_row(
        "SELECT content FROM soul_episodic_memory WHERE id = ?1 AND character_id = ?2",
        params![id, char_id],
        |row| row.get(0),
    )
}

fn log_memory_change(
    conn: &Connection,
    memory_id: i64,
    char_id: &str,
    action: &str,
    before: &str,
    after: &str,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO soul_memory_history (memory_id, character_id, action, content_before, content_after, at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![memory_id, char_id, action, before, after, current_timestamp()],
    )?;
    Ok(())
}

/// A source message changed (edit, other variant, deleted): memories learned from it are
/// flagged for the user to check, and the change goes into their history.
pub(super) fn flag_memories_from_messages(
    conn: &Connection,
    chat_id: &str,
    message_ids: &[String],
) -> Result<(), rusqlite::Error> {
    for message_id in message_ids {
        let pattern = format!("%\"{message_id}\"%");
        let affected: Vec<(i64, String, String)> = {
            let mut stmt = conn.prepare(
                "SELECT id, character_id, content FROM soul_episodic_memory
                 WHERE source_chat_id = ?1 AND source_message_ids LIKE ?2 AND needs_review = 0",
            )?;
            stmt.query_map(params![chat_id, pattern], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<Result<_, _>>()?
        };
        for (id, char_id, content) in affected {
            conn.execute(
                "UPDATE soul_episodic_memory SET needs_review = 1 WHERE id = ?1",
                params![id],
            )?;
            log_memory_change(conn, id, &char_id, "source_changed", &content, &content)?;
        }
    }
    Ok(())
}

/// What one memory reflection writes (`apply_reflection`).
pub struct ReflectionChanges<'a> {
    pub psychology: Option<&'a PsychologyState>,
    pub relationship: Option<&'a RelationshipState>,
    pub healing: &'a [String],
    /// Topic memories written by the archivist, with the messages they came from.
    pub topics: &'a [TopicMemory],
    /// Memories the reflection found outdated (ids already checked against what it saw).
    pub supersede: &'a [MemorySupersede],
    /// New and resolved intentions (plans, promises).
    pub intentions: Option<&'a super::IntentionChanges<'a>>,
    pub source: MemorySource<'a>,
    /// Title, text and mood of the diary entry.
    pub diary: Option<(&'a str, &'a str, &'a str)>,
}

/// Columns `episodic_from_row` reads, in this order.
pub(super) const EPISODIC_COLUMNS: &str =
    "id, category, content, significance, created_at, last_accessed_at,
    source_chat_id, source_message_ids, origin, pinned, needs_review,
    topic_key, superseded_by, superseded_at, supersede_reason";
/// Number of columns in `EPISODIC_COLUMNS`.
pub(super) const EPISODIC_COLUMN_COUNT: usize = 15;

pub(super) fn episodic_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EpisodicMemory> {
    Ok(EpisodicMemory {
        id: row.get(0)?,
        category: row.get(1)?,
        content: row.get(2)?,
        significance: row.get(3)?,
        created_at: row.get(4)?,
        last_accessed_at: row.get(5)?,
        source_chat_id: row.get(6)?,
        source_message_ids: serde_json::from_str(&row.get::<_, String>(7)?).unwrap_or_default(),
        origin: row.get(8)?,
        pinned: row.get(9)?,
        needs_review: row.get(10)?,
        topic_key: row.get(11)?,
        superseded_by: row.get(12)?,
        superseded_at: row.get(13)?,
        supersede_reason: row.get(14)?,
    })
}

/// Key of an archivist topic file name: lower case, without `.md`, words joined by `_`.
pub fn normalize_topic_key(name: &str) -> Option<String> {
    let name = name.trim();
    let name = name
        .strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
        .unwrap_or(name);
    let key = name
        .split(|c: char| c.is_whitespace() || c == '-' || c == '_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_")
        .to_lowercase();
    (!key.is_empty()).then_some(key)
}

static TOPIC_HEADER_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"^\[[^:\]]+:\s*([^\]]+)\]").expect("static regex is valid")
});

/// Topic key from a stored topic memory (`[Topic: name]` header, the word is translated).
pub(super) fn topic_key_of_content(content: &str) -> Option<String> {
    let name = TOPIC_HEADER_RE
        .captures(content.trim_start())?
        .get(1)?
        .as_str();
    normalize_topic_key(name)
}

/// The text of a topic memory without its `[Topic: name]` header.
pub fn topic_body(content: &str) -> &str {
    match TOPIC_HEADER_RE.find(content.trim_start()) {
        Some(header) => content.trim_start()[header.end()..].trim_start(),
        None => content,
    }
}

/// A topic file of the archivist as a memory.
pub struct TopicMemory {
    /// `normalize_topic_key` of the file name; `None` keeps no version history.
    pub key: Option<String>,
    pub text: String,
}

/// A memory the reflection found outdated.
pub struct MemorySupersede {
    pub id: i64,
    pub reason: String,
    /// File name of a topic of the same reflection that holds the corrected version.
    pub replaced_by_topic: Option<String>,
}

/// What `supersede_memory_on` did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Superseded {
    Yes,
    /// Protected (pinned or made by the user): flagged for review instead.
    Flagged,
    /// Not an active memory of this character.
    Missing,
}

/// What a reflection wrote.
pub struct ReflectionOutcome {
    /// Id of the diary entry, if one was written.
    pub diary: Option<i64>,
    /// Memories the reflection found contradicted (retired or flagged for review).
    pub contradictions: usize,
}
