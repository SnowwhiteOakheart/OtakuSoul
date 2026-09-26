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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub character_id: String,
    pub title: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub author_note: String,
    pub author_note_depth: u32,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SwipeVariant {
    pub content: String,
    pub thought: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredChatMessage {
    pub id: String,
    pub chat_id: String,
    pub role: String, // "user" | "assistant" | "system"
    pub content: String,
    pub thought: Option<String>,
    pub order_index: i32,
    pub swipe_index: usize,
    pub swipes: Vec<SwipeVariant>,
    pub created_at: u64,
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

            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                character_id TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                author_note TEXT NOT NULL DEFAULT '',
                author_note_depth INTEGER NOT NULL DEFAULT 2
            );
            CREATE INDEX IF NOT EXISTS idx_chat_char ON chat_sessions(character_id);

            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                chat_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                thought TEXT,
                order_index INTEGER NOT NULL,
                swipe_index INTEGER NOT NULL DEFAULT 0,
                swipes_json TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL,
                FOREIGN KEY(chat_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_msg_chat ON chat_messages(chat_id, order_index);
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

    // --- Chat Sessions & Messages (Phase 9) ---

    pub fn create_chat_session(&self, character_id: &str, title: &str) -> Result<ChatSession, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();
        let id = format!("chat_{}_{:08x}", now, rand::random::<u32>());
        let effective_title = if title.trim().is_empty() {
            "Neuer Chat".to_string()
        } else {
            title.trim().to_string()
        };

        conn.execute(
            "INSERT INTO chat_sessions (id, character_id, title, created_at, updated_at, author_note, author_note_depth)
             VALUES (?1, ?2, ?3, ?4, ?4, '', 2)",
            params![id, character_id, effective_title, now],
        )?;

        Ok(ChatSession {
            id,
            character_id: character_id.to_string(),
            title: effective_title,
            created_at: now,
            updated_at: now,
            author_note: String::new(),
            author_note_depth: 2,
            message_count: 0,
        })
    }

    pub fn list_chat_sessions(&self, character_id: &str) -> Result<Vec<ChatSession>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.character_id, s.title, s.created_at, s.updated_at, s.author_note, s.author_note_depth,
                    (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = s.id) AS msg_count
             FROM chat_sessions s
             WHERE s.character_id = ?1
             ORDER BY s.updated_at DESC",
        )?;

        let rows = stmt.query_map(params![character_id], |row| {
            let count: i64 = row.get(7)?;
            Ok(ChatSession {
                id: row.get(0)?,
                character_id: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                author_note: row.get(5)?,
                author_note_depth: row.get(6)?,
                message_count: count as usize,
            })
        })?;

        let mut sessions = Vec::new();
        for r in rows {
            sessions.push(r?);
        }
        Ok(sessions)
    }

    pub fn get_chat_session(&self, chat_id: &str) -> Result<Option<ChatSession>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.character_id, s.title, s.created_at, s.updated_at, s.author_note, s.author_note_depth,
                    (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = s.id) AS msg_count
             FROM chat_sessions s
             WHERE s.id = ?1",
        )?;

        let mut rows = stmt.query(params![chat_id])?;
        if let Some(row) = rows.next()? {
            let count: i64 = row.get(7)?;
            Ok(Some(ChatSession {
                id: row.get(0)?,
                character_id: row.get(1)?,
                title: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                author_note: row.get(5)?,
                author_note_depth: row.get(6)?,
                message_count: count as usize,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn delete_chat_session(&self, chat_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM chat_messages WHERE chat_id = ?1", params![chat_id])?;
        conn.execute("DELETE FROM chat_sessions WHERE id = ?1", params![chat_id])?;
        Ok(())
    }

    pub fn rename_chat_session(&self, chat_id: &str, new_title: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();
        conn.execute(
            "UPDATE chat_sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_title, now, chat_id],
        )?;
        Ok(())
    }

    pub fn update_chat_author_note(&self, chat_id: &str, author_note: &str, author_note_depth: u32) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();
        conn.execute(
            "UPDATE chat_sessions SET author_note = ?1, author_note_depth = ?2, updated_at = ?3 WHERE id = ?4",
            params![author_note, author_note_depth, now, chat_id],
        )?;
        Ok(())
    }

    pub fn get_chat_messages(&self, chat_id: &str) -> Result<Vec<StoredChatMessage>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, chat_id, role, content, thought, order_index, swipe_index, swipes_json, created_at
             FROM chat_messages
             WHERE chat_id = ?1
             ORDER BY order_index ASC",
        )?;

        let rows = stmt.query_map(params![chat_id], |row| {
            let content: String = row.get(3)?;
            let thought: Option<String> = row.get(4)?;
            let swipe_idx: i64 = row.get(6)?;
            let swipes_json: String = row.get(7)?;

            let swipes: Vec<SwipeVariant> = serde_json::from_str(&swipes_json).unwrap_or_else(|_| {
                vec![SwipeVariant {
                    content: content.clone(),
                    thought: thought.clone(),
                }]
            });

            Ok(StoredChatMessage {
                id: row.get(0)?,
                chat_id: row.get(1)?,
                role: row.get(2)?,
                content,
                thought,
                order_index: row.get(5)?,
                swipe_index: swipe_idx as usize,
                swipes,
                created_at: row.get(8)?,
            })
        })?;

        let mut messages = Vec::new();
        for r in rows {
            messages.push(r?);
        }
        Ok(messages)
    }

    pub fn add_chat_message(
        &self,
        chat_id: &str,
        role: &str,
        content: &str,
        thought: Option<&str>,
    ) -> Result<StoredChatMessage, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();
        let id = format!("msg_{}_{:08x}", now, rand::random::<u32>());

        let mut stmt = conn.prepare("SELECT COALESCE(MAX(order_index) + 1, 0) FROM chat_messages WHERE chat_id = ?1")?;
        let next_order: i32 = stmt.query_row(params![chat_id], |row| row.get(0))?;

        let swipes = vec![SwipeVariant {
            content: content.to_string(),
            thought: thought.map(|s| s.to_string()),
        }];
        let swipes_json = serde_json::to_string(&swipes).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "INSERT INTO chat_messages (id, chat_id, role, content, thought, order_index, swipe_index, swipes_json, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)",
            params![id, chat_id, role, content, thought, next_order, swipes_json, now],
        )?;

        conn.execute(
            "UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2",
            params![now, chat_id],
        )?;

        Ok(StoredChatMessage {
            id,
            chat_id: chat_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            thought: thought.map(|s| s.to_string()),
            order_index: next_order,
            swipe_index: 0,
            swipes,
            created_at: now,
        })
    }

    pub fn update_chat_message(
        &self,
        msg_id: &str,
        content: &str,
        thought: Option<&str>,
    ) -> Result<StoredChatMessage, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();

        let mut stmt = conn.prepare(
            "SELECT chat_id, role, order_index, swipe_index, swipes_json, created_at FROM chat_messages WHERE id = ?1",
        )?;
        let (chat_id, role, order_index, swipe_idx, swipes_json, created_at): (String, String, i32, i64, String, u64) =
            stmt.query_row(params![msg_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })?;

        let mut swipes: Vec<SwipeVariant> = serde_json::from_str(&swipes_json).unwrap_or_default();
        let cur_index = swipe_idx as usize;
        let new_variant = SwipeVariant {
            content: content.to_string(),
            thought: thought.map(|s| s.to_string()),
        };

        if cur_index < swipes.len() {
            swipes[cur_index] = new_variant;
        } else {
            swipes.push(new_variant);
        }

        let new_swipes_json = serde_json::to_string(&swipes).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "UPDATE chat_messages SET content = ?1, thought = ?2, swipes_json = ?3 WHERE id = ?4",
            params![content, thought, new_swipes_json, msg_id],
        )?;

        conn.execute(
            "UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2",
            params![now, chat_id],
        )?;

        Ok(StoredChatMessage {
            id: msg_id.to_string(),
            chat_id,
            role,
            content: content.to_string(),
            thought: thought.map(|s| s.to_string()),
            order_index,
            swipe_index: cur_index,
            swipes,
            created_at,
        })
    }

    pub fn add_message_swipe(
        &self,
        msg_id: &str,
        content: &str,
        thought: Option<&str>,
    ) -> Result<StoredChatMessage, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = current_timestamp();

        let mut stmt = conn.prepare(
            "SELECT chat_id, role, order_index, swipes_json, created_at FROM chat_messages WHERE id = ?1",
        )?;
        let (chat_id, role, order_index, swipes_json, created_at): (String, String, i32, String, u64) =
            stmt.query_row(params![msg_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })?;

        let mut swipes: Vec<SwipeVariant> = serde_json::from_str(&swipes_json).unwrap_or_default();
        swipes.push(SwipeVariant {
            content: content.to_string(),
            thought: thought.map(|s| s.to_string()),
        });
        let new_swipe_idx = swipes.len() - 1;
        let new_swipes_json = serde_json::to_string(&swipes).unwrap_or_else(|_| "[]".to_string());

        conn.execute(
            "UPDATE chat_messages SET content = ?1, thought = ?2, swipe_index = ?3, swipes_json = ?4 WHERE id = ?5",
            params![content, thought, new_swipe_idx as i64, new_swipes_json, msg_id],
        )?;

        conn.execute(
            "UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2",
            params![now, chat_id],
        )?;

        Ok(StoredChatMessage {
            id: msg_id.to_string(),
            chat_id,
            role,
            content: content.to_string(),
            thought: thought.map(|s| s.to_string()),
            order_index,
            swipe_index: new_swipe_idx,
            swipes,
            created_at,
        })
    }

    pub fn switch_message_swipe(
        &self,
        msg_id: &str,
        new_swipe_index: usize,
    ) -> Result<StoredChatMessage, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT chat_id, role, order_index, swipes_json, created_at FROM chat_messages WHERE id = ?1",
        )?;
        let (chat_id, role, order_index, swipes_json, created_at): (String, String, i32, String, u64) =
            stmt.query_row(params![msg_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })?;

        let swipes: Vec<SwipeVariant> = serde_json::from_str(&swipes_json).unwrap_or_default();
        if new_swipe_index >= swipes.len() {
            return Err(rusqlite::Error::InvalidQuery);
        }

        let variant = &swipes[new_swipe_index];
        conn.execute(
            "UPDATE chat_messages SET content = ?1, thought = ?2, swipe_index = ?3 WHERE id = ?4",
            params![variant.content, variant.thought, new_swipe_index as i64, msg_id],
        )?;

        Ok(StoredChatMessage {
            id: msg_id.to_string(),
            chat_id,
            role,
            content: variant.content.clone(),
            thought: variant.thought.clone(),
            order_index,
            swipe_index: new_swipe_index,
            swipes,
            created_at,
        })
    }

    pub fn delete_chat_message(&self, msg_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM chat_messages WHERE id = ?1", params![msg_id])?;
        Ok(())
    }

    pub fn delete_messages_after(&self, chat_id: &str, order_index: i32) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM chat_messages WHERE chat_id = ?1 AND order_index >= ?2",
            params![chat_id, order_index],
        )?;
        Ok(())
    }

    pub fn export_chat_jsonl(&self, chat_id: &str, char_name: &str, user_name: &str) -> Result<String, rusqlite::Error> {
        let session = match self.get_chat_session(chat_id)? {
            Some(s) => s,
            None => return Err(rusqlite::Error::QueryReturnedNoRows),
        };
        let messages = self.get_chat_messages(chat_id)?;

        let mut lines = Vec::new();

        // 1. SillyTavern Header Line
        let header = serde_json::json!({
            "user_name": user_name,
            "character_name": char_name,
            "create_date": session.created_at * 1000,
            "chat_metadata": {
                "title": session.title,
                "author_note": session.author_note,
                "author_note_depth": session.author_note_depth
            }
        });
        lines.push(header.to_string());

        // 2. Messages
        for msg in messages {
            let is_user = msg.role == "user";
            let is_system = msg.role == "system";
            let name = if is_user { user_name } else { char_name };

            let swipe_texts: Vec<String> = msg.swipes.iter().map(|s| s.content.clone()).collect();
            let swipe_variants: Vec<serde_json::Value> = msg.swipes.iter().map(|s| {
                serde_json::json!({
                    "content": s.content,
                    "thought": s.thought
                })
            }).collect();

            let msg_obj = serde_json::json!({
                "name": name,
                "role": msg.role,
                "is_user": is_user,
                "is_system": is_system,
                "send_date": msg.created_at * 1000,
                "mes": msg.content,
                "extra": {
                    "thought": msg.thought
                },
                "swipes": swipe_texts,
                "swipe_variants": swipe_variants,
                "swipe_id": msg.swipe_index
            });
            lines.push(msg_obj.to_string());
        }

        Ok(lines.join("\n"))
    }

    pub fn import_chat_jsonl(
        &self,
        character_id: &str,
        jsonl_content: &str,
        title_override: Option<&str>,
    ) -> Result<ChatSession, rusqlite::Error> {
        let raw_lines: Vec<&str> = jsonl_content.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
        if raw_lines.is_empty() {
            return self.create_chat_session(character_id, title_override.unwrap_or("Importierter Chat"));
        }

        let mut initial_title = title_override.map(|s| s.to_string());
        let mut author_note = String::new();
        let mut author_note_depth: u32 = 2;
        let mut start_idx = 0;

        // Try parsing first line as header
        if let Ok(first_val) = serde_json::from_str::<serde_json::Value>(raw_lines[0]) {
            if first_val.get("mes").is_none() && (first_val.get("character_name").is_some() || first_val.get("chat_metadata").is_some()) {
                start_idx = 1;
                if initial_title.is_none() {
                    if let Some(t) = first_val.pointer("/chat_metadata/title").and_then(|v| v.as_str()) {
                        initial_title = Some(t.to_string());
                    }
                }
                if let Some(an) = first_val.pointer("/chat_metadata/author_note").and_then(|v| v.as_str()) {
                    author_note = an.to_string();
                }
                if let Some(d) = first_val.pointer("/chat_metadata/author_note_depth").and_then(|v| v.as_u64()) {
                    author_note_depth = d as u32;
                }
            }
        }

        let title = initial_title.unwrap_or_else(|| "Importierter Chat".to_string());
        let session = self.create_chat_session(character_id, &title)?;

        if !author_note.is_empty() || author_note_depth != 2 {
            self.update_chat_author_note(&session.id, &author_note, author_note_depth)?;
        }

        for line in &raw_lines[start_idx..] {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                let content = v.get("mes")
                    .or_else(|| v.get("content"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string();

                if content.is_empty() {
                    continue;
                }

                let role = if let Some(r) = v.get("role").and_then(|s| s.as_str()) {
                    r.to_string()
                } else if v.get("is_user").and_then(|b| b.as_bool()).unwrap_or(false) {
                    "user".to_string()
                } else if v.get("is_system").and_then(|b| b.as_bool()).unwrap_or(false) {
                    "system".to_string()
                } else {
                    "assistant".to_string()
                };

                let thought = v.pointer("/extra/thought")
                    .or_else(|| v.get("thought"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());

                // Read swipes
                let mut parsed_swipes = Vec::new();
                if let Some(arr) = v.get("swipe_variants").and_then(|a| a.as_array()) {
                    for it in arr {
                        if let Some(c) = it.get("content").and_then(|s| s.as_str()) {
                            let th = it.get("thought").and_then(|s| s.as_str()).map(|s| s.to_string());
                            parsed_swipes.push(SwipeVariant {
                                content: c.to_string(),
                                thought: th,
                            });
                        }
                    }
                } else if let Some(arr) = v.get("swipes").and_then(|a| a.as_array()) {
                    for it in arr {
                        if let Some(c) = it.as_str() {
                            parsed_swipes.push(SwipeVariant {
                                content: c.to_string(),
                                thought: None,
                            });
                        }
                    }
                }

                let swipe_idx = v.get("swipe_id")
                    .or_else(|| v.get("swipe_index"))
                    .and_then(|n| n.as_u64())
                    .unwrap_or(0) as usize;

                // Add message
                let added = self.add_chat_message(&session.id, &role, &content, thought.as_deref())?;

                if !parsed_swipes.is_empty() {
                    let conn = self.conn.lock().unwrap();
                    let safe_idx = if swipe_idx < parsed_swipes.len() { swipe_idx } else { 0 };
                    let active_variant = &parsed_swipes[safe_idx];
                    let swipes_json = serde_json::to_string(&parsed_swipes).unwrap_or_else(|_| "[]".to_string());
                    conn.execute(
                        "UPDATE chat_messages SET content = ?1, thought = ?2, swipe_index = ?3, swipes_json = ?4 WHERE id = ?5",
                        params![active_variant.content, active_variant.thought, safe_idx as i64, swipes_json, added.id],
                    )?;
                }
            }
        }

        // Return updated session with message count
        self.get_chat_session(&session.id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
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

    #[test]
    fn test_chat_sessions_crud() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let session = db.create_chat_session("ayu", "Erstes Treffen").unwrap();
        assert_eq!(session.title, "Erstes Treffen");
        assert_eq!(session.character_id, "ayu");
        assert_eq!(session.message_count, 0);

        let list = db.list_chat_sessions("ayu").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, session.id);

        db.rename_chat_session(&session.id, "Umbenannter Chat").unwrap();
        let loaded = db.get_chat_session(&session.id).unwrap().unwrap();
        assert_eq!(loaded.title, "Umbenannter Chat");

        db.update_chat_author_note(&session.id, "[Ayu ist schüchtern]", 3).unwrap();
        let loaded2 = db.get_chat_session(&session.id).unwrap().unwrap();
        assert_eq!(loaded2.author_note, "[Ayu ist schüchtern]");
        assert_eq!(loaded2.author_note_depth, 3);

        db.delete_chat_session(&session.id).unwrap();
        let list_empty = db.list_chat_sessions("ayu").unwrap();
        assert_eq!(list_empty.len(), 0);
    }

    #[test]
    fn test_chat_messages_and_swipes() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let session = db.create_chat_session("ayu", "Test Chat").unwrap();

        // 1. Add user message
        let user_msg = db.add_chat_message(&session.id, "user", "Hallo Ayu!", None).unwrap();
        assert_eq!(user_msg.role, "user");
        assert_eq!(user_msg.content, "Hallo Ayu!");
        assert_eq!(user_msg.order_index, 0);
        assert_eq!(user_msg.swipes.len(), 1);

        // 2. Add assistant response
        let asst_msg = db.add_chat_message(
            &session.id,
            "assistant",
            "*lächelt* Hallo Hiroki!",
            Some("Erfreut über die Begrüßung"),
        ).unwrap();
        assert_eq!(asst_msg.role, "assistant");
        assert_eq!(asst_msg.order_index, 1);
        assert_eq!(asst_msg.swipe_index, 0);
        assert_eq!(asst_msg.swipes.len(), 1);

        // 3. Add swipe variant to assistant message
        let swiped = db.add_message_swipe(
            &asst_msg.id,
            "*winkt fröhlich* Hey Hiroki, schön dich zu sehen!",
            Some("Sehr enthusiastisch"),
        ).unwrap();
        assert_eq!(swiped.swipes.len(), 2);
        assert_eq!(swiped.swipe_index, 1);
        assert_eq!(swiped.content, "*winkt fröhlich* Hey Hiroki, schön dich zu sehen!");
        assert_eq!(swiped.thought.as_deref(), Some("Sehr enthusiastisch"));

        // 4. Switch back to swipe 0
        let switched = db.switch_message_swipe(&asst_msg.id, 0).unwrap();
        assert_eq!(switched.swipe_index, 0);
        assert_eq!(switched.content, "*lächelt* Hallo Hiroki!");

        // 5. Update active swipe inline
        let updated = db.update_chat_message(&asst_msg.id, "*lächelt sanft* Hallo Hiroki!", None).unwrap();
        assert_eq!(updated.content, "*lächelt sanft* Hallo Hiroki!");
        assert_eq!(updated.swipes[0].content, "*lächelt sanft* Hallo Hiroki!");
        assert_eq!(updated.swipes.len(), 2);

        // 6. Check messages list
        let msgs = db.get_chat_messages(&session.id).unwrap();
        assert_eq!(msgs.len(), 2);

        // 7. Check message count in session
        let updated_sess = db.get_chat_session(&session.id).unwrap().unwrap();
        assert_eq!(updated_sess.message_count, 2);

        // 8. Delete message
        db.delete_chat_message(&asst_msg.id).unwrap();
        let msgs_after = db.get_chat_messages(&session.id).unwrap();
        assert_eq!(msgs_after.len(), 1);
    }

    #[test]
    fn test_chat_jsonl_export_and_import() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let session = db.create_chat_session("ayu", "Reise nach Kyoto").unwrap();
        db.update_chat_author_note(&session.id, "[Wetter ist sonnig]", 2).unwrap();

        db.add_chat_message(&session.id, "user", "Kommst du mit zum Schrein?", None).unwrap();
        let asst = db.add_chat_message(&session.id, "assistant", "*nickt* Sehr gern!", Some("Aufgeregt")).unwrap();
        db.add_message_swipe(&asst.id, "*hüpft auf* Na klar doch!", Some("Voller Energie")).unwrap();

        let jsonl = db.export_chat_jsonl(&session.id, "Ayu", "Hiroki").unwrap();
        assert!(jsonl.contains("Reise nach Kyoto"));
        assert!(jsonl.contains("[Wetter ist sonnig]"));
        assert!(jsonl.contains("Kommst du mit zum Schrein?"));
        assert!(jsonl.contains("Sehr gern!"));
        assert!(jsonl.contains("Na klar doch!"));

        // Now import into new session
        let imported = db.import_chat_jsonl("ayu", &jsonl, None).unwrap();
        assert_eq!(imported.title, "Reise nach Kyoto");
        assert_eq!(imported.author_note, "[Wetter ist sonnig]");
        assert_eq!(imported.message_count, 2);

        let imp_msgs = db.get_chat_messages(&imported.id).unwrap();
        assert_eq!(imp_msgs.len(), 2);
        assert_eq!(imp_msgs[0].role, "user");
        assert_eq!(imp_msgs[1].role, "assistant");
        assert_eq!(imp_msgs[1].swipes.len(), 2);
        assert_eq!(imp_msgs[1].swipe_index, 1);
        assert_eq!(imp_msgs[1].content, "*hüpft auf* Na klar doch!");
    }
}

