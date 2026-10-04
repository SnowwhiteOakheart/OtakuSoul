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
    pub fn add_episodic_memory(
        &self,
        char_id: &str,
        category: &str,
        content: &str,
        significance: u32,
    ) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock();
        Self::add_episodic_memory_on(&conn, char_id, category, content, significance)
    }

    pub(super) fn add_episodic_memory_on(
        conn: &Connection,
        char_id: &str,
        category: &str,
        content: &str,
        significance: u32,
    ) -> Result<i64, rusqlite::Error> {
        let now = current_timestamp();

        // 1. Duplicate check (case-insensitive normalized exact or substring match)
        let trimmed = content.trim();
        let mut check_stmt = conn.prepare(
            "SELECT id, significance FROM soul_episodic_memory WHERE character_id = ?1 AND LOWER(content) = LOWER(?2)",
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
            "INSERT INTO soul_episodic_memory (character_id, category, content, significance, created_at, last_accessed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![char_id, category, trimmed, significance, now, now],
        )?;

        Ok(conn.last_insert_rowid())
    }

    pub fn get_episodic_memories(
        &self,
        char_id: &str,
        limit: usize,
    ) -> Result<Vec<EpisodicMemory>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, category, content, significance, created_at, last_accessed_at
             FROM soul_episodic_memory WHERE character_id = ?1 ORDER BY significance DESC, created_at DESC, id DESC LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![char_id, limit as i64], |row| {
            Ok(EpisodicMemory {
                id: row.get(0)?,
                category: row.get(1)?,
                content: row.get(2)?,
                significance: row.get(3)?,
                created_at: row.get(4)?,
                last_accessed_at: row.get(5)?,
            })
        })?;

        let mut memories = Vec::new();
        for r in rows {
            memories.push(r?);
        }
        Ok(memories)
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
