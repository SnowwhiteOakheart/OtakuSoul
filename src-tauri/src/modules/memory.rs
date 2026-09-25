use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsychologyState {
    pub primary_emotion: String,
    pub intensity: u32, // 1..5
    pub psychological_tension: String,
    pub emotional_decay_counter: u32,
    pub active_agenda: String,
    pub immediate_focus: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipState {
    pub user_name: String,
    pub trust_level: String, // "Distrustful", "Wary", "Neutral", "Developing Trust", "Deeply Bound", "Unstable"
    pub unspoken_tension: String,
    pub preferences_habits: Vec<String>,
    pub shared_milestones: Vec<String>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodicMemory {
    pub id: i64,
    pub category: String, // "event", "fact", "location", "secret", "promise"
    pub content: String,
    pub significance: u32, // 1..5
    pub created_at: u64,
    pub last_accessed_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryEntry {
    pub id: i64,
    pub title: String,
    pub entry_text: String,
    pub mood: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealingLogEntry {
    pub id: i64,
    pub action: String,
    pub details: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveOverview {
    pub psychology: PsychologyState,
    pub relationship: RelationshipState,
    pub recent_memories: Vec<EpisodicMemory>,
    pub recent_diary: Vec<DiaryEntry>,
    pub healing_logs: Vec<HealingLogEntry>,
}

pub struct MemoryDb {
    conn: Arc<Mutex<Connection>>,
}

impl MemoryDb {
    pub fn new(path: &Path) -> Result<Self, rusqlite::Error> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(path)?;
        Self::init_with_connection(conn)
    }

    pub fn new_in_memory() -> Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        Self::init_with_connection(conn)
    }

    fn init_with_connection(conn: Connection) -> Result<Self, rusqlite::Error> {
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;

            CREATE TABLE IF NOT EXISTS soul_psychology (
                character_id TEXT PRIMARY KEY,
                primary_emotion TEXT NOT NULL DEFAULT 'Calm',
                intensity INTEGER NOT NULL DEFAULT 3,
                psychological_tension TEXT NOT NULL DEFAULT 'Keine.',
                emotional_decay_counter INTEGER NOT NULL DEFAULT 0,
                active_agenda TEXT NOT NULL DEFAULT 'Beobachten und Antworten.',
                immediate_focus TEXT NOT NULL DEFAULT 'Das aktuelle Gespräch.',
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS soul_relationship (
                character_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                trust_level TEXT NOT NULL DEFAULT 'Neutral',
                unspoken_tension TEXT NOT NULL DEFAULT 'Keine.',
                preferences_habits TEXT NOT NULL DEFAULT '[]',
                shared_milestones TEXT NOT NULL DEFAULT '[]',
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (character_id, user_name)
            );

            CREATE TABLE IF NOT EXISTS soul_episodic_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'fact',
                content TEXT NOT NULL,
                significance INTEGER NOT NULL DEFAULT 3,
                created_at INTEGER NOT NULL,
                last_accessed_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mem_char ON soul_episodic_memory(character_id);

            CREATE TABLE IF NOT EXISTS soul_diary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT NOT NULL,
                title TEXT NOT NULL,
                entry_text TEXT NOT NULL,
                mood TEXT NOT NULL DEFAULT 'Neutral',
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_diary_char ON soul_diary(character_id);

            CREATE TABLE IF NOT EXISTS soul_healing_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_id TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            "#,
        )?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn default_path() -> PathBuf {
        let base_dir = directories::ProjectDirs::from("com", "snowwhite", "otakusoul")
            .map(|dirs| dirs.data_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("./data"));
        base_dir.join("otakusoul.db")
    }

    // --- Psychology ---
    pub fn get_or_create_psychology(&self, char_id: &str) -> Result<PsychologyState, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT primary_emotion, intensity, psychological_tension, emotional_decay_counter, active_agenda, immediate_focus, updated_at
             FROM soul_psychology WHERE character_id = ?1",
        )?;

        let mut rows = stmt.query(params![char_id])?;
        if let Some(row) = rows.next()? {
            Ok(PsychologyState {
                primary_emotion: row.get(0)?,
                intensity: row.get(1)?,
                psychological_tension: row.get(2)?,
                emotional_decay_counter: row.get(3)?,
                active_agenda: row.get(4)?,
                immediate_focus: row.get(5)?,
                updated_at: row.get(6)?,
            })
        } else {
            let now = current_timestamp();
            conn.execute(
                "INSERT INTO soul_psychology (character_id, primary_emotion, intensity, psychological_tension, emotional_decay_counter, active_agenda, immediate_focus, updated_at)
                 VALUES (?1, 'Calm', 3, 'Keine.', 0, 'Beobachten und Antworten.', 'Das aktuelle Gespräch.', ?2)",
                params![char_id, now],
            )?;

            Ok(PsychologyState {
                primary_emotion: "Calm".to_string(),
                intensity: 3,
                psychological_tension: "Keine.".to_string(),
                emotional_decay_counter: 0,
                active_agenda: "Beobachten und Antworten.".to_string(),
                immediate_focus: "Das aktuelle Gespräch.".to_string(),
                updated_at: now,
            })
        }
    }

    pub fn update_psychology(&self, char_id: &str, state: &PsychologyState) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();
        conn.execute(
            "INSERT INTO soul_psychology (character_id, primary_emotion, intensity, psychological_tension, emotional_decay_counter, active_agenda, immediate_focus, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(character_id) DO UPDATE SET
                primary_emotion = excluded.primary_emotion,
                intensity = excluded.intensity,
                psychological_tension = excluded.psychological_tension,
                emotional_decay_counter = excluded.emotional_decay_counter,
                active_agenda = excluded.active_agenda,
                immediate_focus = excluded.immediate_focus,
                updated_at = excluded.updated_at",
            params![
                char_id,
                state.primary_emotion,
                state.intensity,
                state.psychological_tension,
                state.emotional_decay_counter,
                state.active_agenda,
                state.immediate_focus,
                now
            ],
        )?;
        Ok(())
    }

    // --- Relationship ---
    pub fn get_or_create_relationship(&self, char_id: &str, user_name: &str) -> Result<RelationshipState, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT trust_level, unspoken_tension, preferences_habits, shared_milestones, updated_at
             FROM soul_relationship WHERE character_id = ?1 AND user_name = ?2",
        )?;

        let mut rows = stmt.query(params![char_id, user_name])?;
        if let Some(row) = rows.next()? {
            let pref_str: String = row.get(2)?;
            let mile_str: String = row.get(3)?;

            let preferences_habits: Vec<String> = serde_json::from_str(&pref_str).unwrap_or_default();
            let shared_milestones: Vec<String> = serde_json::from_str(&mile_str).unwrap_or_default();

            Ok(RelationshipState {
                user_name: user_name.to_string(),
                trust_level: row.get(0)?,
                unspoken_tension: row.get(1)?,
                preferences_habits,
                shared_milestones,
                updated_at: row.get(4)?,
            })
        } else {
            let now = current_timestamp();
            conn.execute(
                "INSERT INTO soul_relationship (character_id, user_name, trust_level, unspoken_tension, preferences_habits, shared_milestones, updated_at)
                 VALUES (?1, ?2, 'Neutral', 'Keine.', '[]', '[]', ?3)",
                params![char_id, user_name, now],
            )?;

            Ok(RelationshipState {
                user_name: user_name.to_string(),
                trust_level: "Neutral".to_string(),
                unspoken_tension: "Keine.".to_string(),
                preferences_habits: Vec::new(),
                shared_milestones: Vec::new(),
                updated_at: now,
            })
        }
    }

    pub fn update_relationship(&self, char_id: &str, state: &RelationshipState) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();
        let pref_str = serde_json::to_string(&state.preferences_habits).unwrap_or_else(|_| "[]".to_string());
        let mile_str = serde_json::to_string(&state.shared_milestones).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO soul_relationship (character_id, user_name, trust_level, unspoken_tension, preferences_habits, shared_milestones, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(character_id, user_name) DO UPDATE SET
                trust_level = excluded.trust_level,
                unspoken_tension = excluded.unspoken_tension,
                preferences_habits = excluded.preferences_habits,
                shared_milestones = excluded.shared_milestones,
                updated_at = excluded.updated_at",
            params![
                char_id,
                state.user_name,
                state.trust_level,
                state.unspoken_tension,
                pref_str,
                mile_str,
                now
            ],
        )?;
        Ok(())
    }

    // --- Episodic Memory ---
    pub fn add_episodic_memory(&self, char_id: &str, category: &str, content: &str, significance: u32) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
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

    pub fn get_episodic_memories(&self, char_id: &str, limit: usize) -> Result<Vec<EpisodicMemory>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
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
    pub fn add_diary_entry(&self, char_id: &str, title: &str, entry_text: &str, mood: &str) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();
        conn.execute(
            "INSERT INTO soul_diary (character_id, title, entry_text, mood, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![char_id, title.trim(), entry_text.trim(), mood, now],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_diary_entries(&self, char_id: &str, limit: usize) -> Result<Vec<DiaryEntry>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
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
    pub fn log_healing(&self, char_id: &str, action: &str, details: &str) -> Result<i64, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();
        conn.execute(
            "INSERT INTO soul_healing_log (character_id, action, details, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![char_id, action, details, now],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_healing_logs(&self, char_id: &str, limit: usize) -> Result<Vec<HealingLogEntry>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
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

    pub fn get_cognitive_overview(&self, char_id: &str, user_name: &str) -> Result<CognitiveOverview, rusqlite::Error> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_psychology_crud() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let mut psych = db.get_or_create_psychology("ayu").unwrap();
        assert_eq!(psych.primary_emotion, "Calm");
        assert_eq!(psych.intensity, 3);

        psych.primary_emotion = "Excited".to_string();
        psych.intensity = 5;
        psych.psychological_tension = "Will Hiroki beeindrucken.".to_string();
        db.update_psychology("ayu", &psych).unwrap();

        let loaded = db.get_or_create_psychology("ayu").unwrap();
        assert_eq!(loaded.primary_emotion, "Excited");
        assert_eq!(loaded.intensity, 5);
        assert_eq!(loaded.psychological_tension, "Will Hiroki beeindrucken.");
    }

    #[test]
    fn test_relationship_crud() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let mut rel = db.get_or_create_relationship("ayu", "Hiroki").unwrap();
        assert_eq!(rel.trust_level, "Neutral");
        assert!(rel.preferences_habits.is_empty());

        rel.trust_level = "Deeply Bound".to_string();
        rel.preferences_habits.push("Trinkt gerne Grüntee".to_string());
        rel.shared_milestones.push("Gemeinsames Picknick im Park".to_string());
        db.update_relationship("ayu", &rel).unwrap();

        let loaded = db.get_or_create_relationship("ayu", "Hiroki").unwrap();
        assert_eq!(loaded.trust_level, "Deeply Bound");
        assert_eq!(loaded.preferences_habits.len(), 1);
        assert_eq!(loaded.preferences_habits[0], "Trinkt gerne Grüntee");
        assert_eq!(loaded.shared_milestones[0], "Gemeinsames Picknick im Park");
    }

    #[test]
    fn test_episodic_memory_deduplication_and_priority() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let id1 = db.add_episodic_memory("ayu", "fact", "Hiroki mag Matcha Latte", 2).unwrap();
        let id2 = db.add_episodic_memory("ayu", "fact", "Hiroki mag Matcha Latte", 4).unwrap();
        // Duplicates should reuse id and elevate significance
        assert_eq!(id1, id2);

        let id3 = db.add_episodic_memory("ayu", "secret", "Hat Angst vor Gewitter", 5).unwrap();
        assert_ne!(id1, id3);

        let memories = db.get_episodic_memories("ayu", 10).unwrap();
        assert_eq!(memories.len(), 2);
        // Sorted by significance DESC: 5 first, then 4
        assert_eq!(memories[0].significance, 5);
        assert_eq!(memories[0].content, "Hat Angst vor Gewitter");
        assert_eq!(memories[1].significance, 4);
    }

    #[test]
    fn test_diary_entries() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        db.add_diary_entry("ayu", "Erster Tag", "Heute habe ich Hiroki getroffen...", "Happy").unwrap();
        db.add_diary_entry("ayu", "Später Abend", "Ich konnte kaum schlafen.", "Thoughtful").unwrap();

        let entries = db.get_diary_entries("ayu", 10).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].title, "Später Abend"); // LIFO
        assert_eq!(entries[1].title, "Erster Tag");
    }

    #[test]
    fn test_emotional_decay() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let mut psych = db.get_or_create_psychology("ayu").unwrap();
        psych.intensity = 5;
        db.update_psychology("ayu", &psych).unwrap();

        // Turn 1: decay counter 0 -> 1, intensity stays 5
        let decay1 = db.apply_emotional_decay("ayu").unwrap();
        assert!(decay1.is_none());
        let p1 = db.get_or_create_psychology("ayu").unwrap();
        assert_eq!(p1.intensity, 5);
        assert_eq!(p1.emotional_decay_counter, 1);

        // Turn 2: decay counter reaches 2 -> intensity drops to 4, counter resets
        let decay2 = db.apply_emotional_decay("ayu").unwrap();
        assert!(decay2.is_some());
        let p2 = db.get_or_create_psychology("ayu").unwrap();
        assert_eq!(p2.intensity, 4);
        assert_eq!(p2.emotional_decay_counter, 0);

        // Healing log check
        let logs = db.get_healing_logs("ayu", 5).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].action, "decay_applied");
    }

    #[test]
    fn test_cognitive_overview() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        db.add_episodic_memory("ayu", "fact", "Hiroki mag Matcha Latte", 3).unwrap();
        db.add_diary_entry("ayu", "Tagebucheintrag", "Ein schöner Tag.", "Calm").unwrap();

        let overview = db.get_cognitive_overview("ayu", "Hiroki").unwrap();
        assert_eq!(overview.psychology.primary_emotion, "Calm");
        assert_eq!(overview.relationship.user_name, "Hiroki");
        assert_eq!(overview.recent_memories.len(), 1);
        assert_eq!(overview.recent_diary.len(), 1);
    }
}
