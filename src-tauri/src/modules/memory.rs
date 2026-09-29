use parking_lot::Mutex;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

/// Parsers for the MEMORY.md / USER.md sections, compiled once.
static MD_HEADER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^#{1,3}\s+(.+)$").expect("static regex is valid"));
static MD_EMOTION_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r"(?i)-\s*\*\*Primary Emotion\*\*:\s*([^(]+?)(?:\s*\(Intensity:\s*(\d+)(?:/5)?\))?$",
    )
    .expect("static regex is valid")
});
static MD_TENSION_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Psychological Tension\*\*:\s*(.+)$")
        .expect("static regex is valid")
});
static MD_DECAY_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Emotional Decay Counter\*\*:\s*(\d+)")
        .expect("static regex is valid")
});
static MD_AGENDA_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Active Agenda\*\*:\s*(.+)$").expect("static regex is valid")
});
static MD_FOCUS_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Immediate Focus\*\*:\s*(.+)$").expect("static regex is valid")
});
static MD_ROLE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Role in Story\*\*:\s*(.+)$").expect("static regex is valid")
});
static MD_ATTR_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Known Attributes\*\*:\s*(.+)$").expect("static regex is valid")
});
static MD_TRUST_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Trust Level\*\*:\s*(.+)$").expect("static regex is valid")
});
static MD_DYN_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*(?:Dynamic Description|Current Dynamic)\*\*:\s*(.+)$")
        .expect("static regex is valid")
});
static MD_TENSION_RE_2: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Unspoken Tension\*\*:\s*(.+)$").expect("static regex is valid")
});

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn default_role_in_story() -> String {
    "User".to_string()
}

fn default_none() -> String {
    "Keine.".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PsychologyState {
    pub primary_emotion: String,
    pub intensity: u32, // 1..5
    pub psychological_tension: String,
    pub emotional_decay_counter: u32,
    pub active_agenda: String,
    pub immediate_focus: String,
    #[serde(default)]
    pub core_identity: Vec<String>,
    #[serde(default = "default_none")]
    pub cognitive_dissonance: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipState {
    pub user_name: String,
    #[serde(default = "default_role_in_story")]
    pub role_in_story: String,
    #[serde(default = "default_none")]
    pub known_attributes: String,
    pub trust_level: String, // "Distrustful", "Wary", "Neutral", "Developing Trust", "Deeply Bound", "Unstable"
    #[serde(default = "default_none")]
    pub dynamic_description: String,
    pub unspoken_tension: String,
    pub preferences_habits: Vec<String>,
    pub shared_milestones: Vec<String>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryBackupInfo {
    pub filename: String,
    pub timestamp: u64,
    pub date_formatted: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryBackupSnapshot {
    pub character_id: String,
    pub created_at: u64,
    pub psychology: PsychologyState,
    pub relationship: Option<RelationshipState>,
    pub episodic_memories: Vec<EpisodicMemory>,
    pub diary_entries: Vec<DiaryEntry>,
    pub healing_logs: Vec<HealingLogEntry>,
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

/// Schema migrations in order: after step `i` the database has `PRAGMA user_version = i + 1`.
/// Append new steps for schema changes; never edit a step that has shipped.
const MIGRATIONS: &[fn(&Connection) -> rusqlite::Result<()>] = &[migrate_v1_baseline];

/// Brings the database to the latest schema, one transaction per step. A database written by a
/// newer OtakuSoul is left untouched.
fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let current = usize::try_from(current).unwrap_or(0);
    if current > MIGRATIONS.len() {
        warn!(
            "Datenbank-Schema v{} ist neuer als diese Version (v{}); keine Migration.",
            current,
            MIGRATIONS.len()
        );
        return Ok(());
    }
    for (index, step) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.transaction()?;
        step(&tx)?;
        tx.pragma_update(None, "user_version", (index + 1) as i64)?;
        tx.commit()?;
        info!("Datenbank-Schema auf v{} migriert.", index + 1);
    }
    Ok(())
}

/// v1: the schema as it was when versioning was introduced. Databases from before that have
/// no version yet and may lack columns that were added over time, so those are added if missing.
fn migrate_v1_baseline(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS soul_psychology (
            character_id TEXT PRIMARY KEY,
            primary_emotion TEXT NOT NULL DEFAULT 'Calm',
            intensity INTEGER NOT NULL DEFAULT 3,
            psychological_tension TEXT NOT NULL DEFAULT 'Keine.',
            emotional_decay_counter INTEGER NOT NULL DEFAULT 0,
            active_agenda TEXT NOT NULL DEFAULT 'Beobachten und Antworten.',
            immediate_focus TEXT NOT NULL DEFAULT 'Das aktuelle Gespräch.',
            core_identity TEXT NOT NULL DEFAULT '[]',
            cognitive_dissonance TEXT NOT NULL DEFAULT 'Keine.',
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS soul_relationship (
            character_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            role_in_story TEXT NOT NULL DEFAULT 'User',
            known_attributes TEXT NOT NULL DEFAULT 'Keine.',
            trust_level TEXT NOT NULL DEFAULT 'Neutral',
            dynamic_description TEXT NOT NULL DEFAULT 'Keine.',
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

    for (table, column, definition) in [
        (
            "soul_psychology",
            "core_identity",
            "TEXT NOT NULL DEFAULT '[]'",
        ),
        (
            "soul_psychology",
            "cognitive_dissonance",
            "TEXT NOT NULL DEFAULT 'Keine.'",
        ),
        (
            "soul_relationship",
            "role_in_story",
            "TEXT NOT NULL DEFAULT 'User'",
        ),
        (
            "soul_relationship",
            "known_attributes",
            "TEXT NOT NULL DEFAULT 'Keine.'",
        ),
        (
            "soul_relationship",
            "dynamic_description",
            "TEXT NOT NULL DEFAULT 'Keine.'",
        ),
    ] {
        if !has_column(conn, table, column)? {
            conn.execute(
                &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
                [],
            )?;
        }
    }
    Ok(())
}

fn has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut names = stmt.query_map([], |row| row.get::<_, String>(1))?;
    names.try_fold(false, |found, name| Ok(found || name? == column))
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

    fn init_with_connection(mut conn: Connection) -> Result<Self, rusqlite::Error> {
        // Journal settings cannot change inside a transaction, so they are set before migrating.
        conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")?;
        migrate(&mut conn)?;
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

    /// Where a restored database waits until the next start, because the live file is open.
    pub fn pending_restore_path() -> PathBuf {
        Self::default_path().with_extension("db.restore")
    }

    /// Swaps in a database restored from a profile backup. Must run before the DB is opened.
    pub fn apply_pending_restore(db_path: &Path) {
        let pending = db_path.with_extension("db.restore");
        if !pending.exists() {
            return;
        }
        for suffix in ["-wal", "-shm"] {
            let _ = std::fs::remove_file(format!("{}{}", db_path.display(), suffix));
        }
        match std::fs::rename(&pending, db_path) {
            Ok(()) => tracing::info!("Soul-Memory-Datenbank aus Backup übernommen: {:?}", db_path),
            Err(e) => tracing::warn!(
                "Wiederhergestellte Datenbank konnte nicht übernommen werden: {}",
                e
            ),
        }
    }

    // --- Psychology ---
    pub fn get_or_create_psychology(
        &self,
        char_id: &str,
    ) -> Result<PsychologyState, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT primary_emotion, intensity, psychological_tension, emotional_decay_counter, active_agenda, immediate_focus, updated_at, core_identity, cognitive_dissonance
             FROM soul_psychology WHERE character_id = ?1",
        )?;

        let mut rows = stmt.query(params![char_id])?;
        if let Some(row) = rows.next()? {
            let core_id_str: String = row.get(7).unwrap_or_else(|_| "[]".to_string());
            let core_identity: Vec<String> = serde_json::from_str(&core_id_str).unwrap_or_default();
            let cognitive_dissonance: String = row.get(8).unwrap_or_else(|_| "Keine.".to_string());
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
            conn.execute(
                "INSERT INTO soul_psychology (character_id, primary_emotion, intensity, psychological_tension, emotional_decay_counter, active_agenda, immediate_focus, core_identity, cognitive_dissonance, updated_at)
                 VALUES (?1, 'Calm', 3, 'Keine.', 0, 'Beobachten und Antworten.', 'Das aktuelle Gespräch.', '[]', 'Keine.', ?2)",
                params![char_id, now],
            )?;

            Ok(PsychologyState {
                primary_emotion: "Calm".to_string(),
                intensity: 3,
                psychological_tension: "Keine.".to_string(),
                emotional_decay_counter: 0,
                active_agenda: "Beobachten und Antworten.".to_string(),
                immediate_focus: "Das aktuelle Gespräch.".to_string(),
                core_identity: Vec::new(),
                cognitive_dissonance: "Keine.".to_string(),
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
            let known_attributes: String = row.get(6).unwrap_or_else(|_| "Keine.".to_string());
            let dynamic_description: String = row.get(7).unwrap_or_else(|_| "Keine.".to_string());

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
                 VALUES (?1, ?2, 'Neutral', 'Keine.', '[]', '[]', 'User', 'Keine.', 'Keine.', ?3)",
                params![char_id, user_name, now],
            )?;

            Ok(RelationshipState {
                user_name: user_name.to_string(),
                role_in_story: "User".to_string(),
                known_attributes: "Keine.".to_string(),
                trust_level: "Neutral".to_string(),
                dynamic_description: "Keine.".to_string(),
                unspoken_tension: "Keine.".to_string(),
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

    // --- Markdown Rendering & Bidirectional Sync ---

    pub fn render_character_markdown(&self, char_id: &str) -> Result<String, rusqlite::Error> {
        let psych = self.get_or_create_psychology(char_id)?;
        let healing = self.get_healing_logs(char_id, 15)?;

        let mut lines = Vec::new();
        lines.push(format!("# SOUL CACHE: {}", char_id.to_uppercase()));
        lines.push("".to_string());
        lines.push("## CORE IDENTITY & UNBREAKABLE BELIEFS".to_string());
        for belief in &psych.core_identity {
            if !belief.trim().is_empty() {
                lines.push(format!("- {}", belief.trim()));
            }
        }

        lines.push("".to_string());
        lines.push("## INTERNAL STATE & PSYCHOLOGICAL MOMENTUM".to_string());
        lines.push(format!(
            "- **Primary Emotion**: {} (Intensity: {}/5)",
            psych.primary_emotion, psych.intensity
        ));
        lines.push(format!(
            "- **Psychological Tension**: {}",
            psych.psychological_tension
        ));
        lines.push(format!(
            "- **Emotional Decay Counter**: {}/3",
            psych.emotional_decay_counter
        ));

        lines.push("".to_string());
        lines.push("## COGNITIVE DRIVE & ACTIVE AGENDA".to_string());
        lines.push(format!("- **Active Agenda**: {}", psych.active_agenda));
        lines.push(format!("- **Immediate Focus**: {}", psych.immediate_focus));

        lines.push("".to_string());
        lines.push("## UNRESOLVED COGNITIVE DISSONANCE".to_string());
        lines.push(psych.cognitive_dissonance.clone());

        if !healing.is_empty() {
            lines.push("".to_string());
            lines.push("## RESOLVED CONTRADICTIONS (HEALING LOG)".to_string());
            for log in healing {
                lines.push(format!(
                    "- [{}] {}: {}",
                    log.created_at, log.action, log.details
                ));
            }
        }

        Ok(lines.join("\n"))
    }

    pub fn render_user_markdown(
        &self,
        char_id: &str,
        user_name: &str,
    ) -> Result<String, rusqlite::Error> {
        let rel = self.get_or_create_relationship(char_id, user_name)?;

        let mut lines = Vec::new();
        lines.push(format!(
            "# USER PROFILE & RELATIONSHIP MEMORY: {}",
            user_name.to_uppercase()
        ));
        lines.push("".to_string());
        lines.push("## USER IDENTITY & STATUS".to_string());
        lines.push(format!("- **Role in Story**: {}", rel.role_in_story));
        lines.push(format!("- **Known Attributes**: {}", rel.known_attributes));

        lines.push("".to_string());
        lines.push("## RELATIONSHIP METADATA".to_string());
        lines.push(format!("- **Trust Level**: {}", rel.trust_level));
        lines.push(format!(
            "- **Dynamic Description**: {}",
            rel.dynamic_description
        ));
        lines.push(format!("- **Unspoken Tension**: {}", rel.unspoken_tension));

        lines.push("".to_string());
        lines.push("## PREFERENCES & HABITS".to_string());
        for pref in &rel.preferences_habits {
            if !pref.trim().is_empty() {
                lines.push(format!("- {}", pref.trim()));
            }
        }

        lines.push("".to_string());
        lines.push("## SHARED MILESTONES & PROMISES".to_string());
        for m in &rel.shared_milestones {
            if !m.trim().is_empty() {
                lines.push(format!("- {}", m.trim()));
            }
        }

        Ok(lines.join("\n"))
    }

    pub fn parse_and_sync_character_markdown(&self, char_id: &str, md: &str) -> Result<(), String> {
        let mut psych = self
            .get_or_create_psychology(char_id)
            .map_err(|e| e.to_string())?;

        let mut section: Option<&str> = None;
        let mut core_identity = Vec::new();
        let mut cognitive_dissonance_lines = Vec::new();

        let header_re = &*MD_HEADER_RE;
        let emotion_re = &*MD_EMOTION_RE;
        let tension_re = &*MD_TENSION_RE;
        let decay_re = &*MD_DECAY_RE;
        let agenda_re = &*MD_AGENDA_RE;
        let focus_re = &*MD_FOCUS_RE;

        for raw_line in md.lines() {
            let line = raw_line.trim();
            if let Some(caps) = header_re.captures(line) {
                let title = caps[1].to_uppercase();
                if title.contains("CORE IDENTITY") || title.contains("BELIEFS") {
                    section = Some("identity");
                } else if title.contains("INTERNAL STATE") {
                    section = Some("state");
                } else if title.contains("COGNITIVE DRIVE") || title.contains("ACTIVE AGENDA") {
                    section = Some("drive");
                } else if title.contains("UNRESOLVED COGNITIVE") || title.contains("DISSONANCE") {
                    section = Some("dissonance");
                } else if title.contains("RESOLVED CONTRADICTIONS") || title.contains("HEALING") {
                    section = Some("healing");
                } else {
                    section = None;
                }
                continue;
            }

            if line.is_empty() {
                continue;
            }

            match section {
                Some("identity") => {
                    if line.starts_with('-') || line.starts_with('*') {
                        let item = line.trim_start_matches(['-', '*', ' ']).trim();
                        if !item.is_empty() {
                            core_identity.push(item.to_string());
                        }
                    }
                }
                Some("state") => {
                    if let Some(caps) = emotion_re.captures(line) {
                        let em = caps[1].trim();
                        if !em.is_empty() {
                            psych.primary_emotion = em.to_string();
                        }
                        if let Some(int_m) = caps.get(2)
                            && let Ok(v) = int_m.as_str().parse::<u32>()
                        {
                            psych.intensity = v.clamp(1, 5);
                        }
                    } else if let Some(caps) = tension_re.captures(line) {
                        psych.psychological_tension = caps[1].trim().to_string();
                    } else if let Some(caps) = decay_re.captures(line)
                        && let Ok(v) = caps[1].parse::<u32>()
                    {
                        psych.emotional_decay_counter = v;
                    }
                }
                Some("drive") => {
                    if let Some(caps) = agenda_re.captures(line) {
                        psych.active_agenda = caps[1].trim().to_string();
                    } else if let Some(caps) = focus_re.captures(line) {
                        psych.immediate_focus = caps[1].trim().to_string();
                    }
                }
                Some("dissonance") => {
                    let cleaned = line.trim_start_matches(['-', '*', ' ']).trim();
                    if !cleaned.is_empty() {
                        cognitive_dissonance_lines.push(cleaned.to_string());
                    }
                }
                _ => {}
            }
        }

        if !core_identity.is_empty() {
            psych.core_identity = core_identity;
        }
        if !cognitive_dissonance_lines.is_empty() {
            psych.cognitive_dissonance = cognitive_dissonance_lines.join("\n");
        }

        self.update_psychology(char_id, &psych)
            .map_err(|e| e.to_string())
    }

    pub fn parse_and_sync_user_markdown(
        &self,
        char_id: &str,
        user_name: &str,
        md: &str,
    ) -> Result<(), String> {
        let mut rel = self
            .get_or_create_relationship(char_id, user_name)
            .map_err(|e| e.to_string())?;

        let mut section: Option<&str> = None;
        let mut prefs = Vec::new();
        let mut milestones = Vec::new();

        let header_re = &*MD_HEADER_RE;
        let role_re = &*MD_ROLE_RE;
        let attr_re = &*MD_ATTR_RE;
        let trust_re = &*MD_TRUST_RE;
        let dyn_re = &*MD_DYN_RE;
        let tension_re = &*MD_TENSION_RE_2;

        for raw_line in md.lines() {
            let line = raw_line.trim();
            if let Some(caps) = header_re.captures(line) {
                let title = caps[1].to_uppercase();
                if title.contains("USER IDENTITY") {
                    section = Some("identity");
                } else if title.contains("RELATIONSHIP") {
                    section = Some("relationship");
                } else if title.contains("PREFERENCES") || title.contains("HABITS") {
                    section = Some("prefs");
                } else if title.contains("MILESTONES") || title.contains("PROMISES") {
                    section = Some("milestones");
                } else {
                    section = None;
                }
                continue;
            }

            if line.is_empty() {
                continue;
            }

            match section {
                Some("identity") => {
                    if let Some(caps) = role_re.captures(line) {
                        rel.role_in_story = caps[1].trim().to_string();
                    } else if let Some(caps) = attr_re.captures(line) {
                        rel.known_attributes = caps[1].trim().to_string();
                    }
                }
                Some("relationship") => {
                    if let Some(caps) = trust_re.captures(line) {
                        rel.trust_level = caps[1].trim().to_string();
                    } else if let Some(caps) = dyn_re.captures(line) {
                        rel.dynamic_description = caps[1].trim().to_string();
                    } else if let Some(caps) = tension_re.captures(line) {
                        rel.unspoken_tension = caps[1].trim().to_string();
                    }
                }
                Some("prefs") => {
                    if line.starts_with('-') || line.starts_with('*') {
                        let item = line.trim_start_matches(['-', '*', ' ']).trim();
                        if !item.is_empty() {
                            prefs.push(item.to_string());
                        }
                    }
                }
                Some("milestones") if (line.starts_with('-') || line.starts_with('*')) => {
                    let item = line.trim_start_matches(['-', '*', ' ']).trim();
                    if !item.is_empty() {
                        milestones.push(item.to_string());
                    }
                }
                _ => {}
            }
        }

        if !prefs.is_empty() {
            rel.preferences_habits = prefs;
        }
        if !milestones.is_empty() {
            rel.shared_milestones = milestones;
        }

        self.update_relationship(char_id, &rel)
            .map_err(|e| e.to_string())
    }

    // --- Backups & Snapshots ---

    pub fn backup_dir_for_character(char_id: &str) -> PathBuf {
        let base_dir = directories::ProjectDirs::from("com", "snowwhite", "otakusoul")
            .map(|dirs| dirs.data_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("./data"));
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

        if !target_dir.exists() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        let read_dir = std::fs::read_dir(&target_dir).map_err(|e| e.to_string())?;

        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_file()
                && path.extension().and_then(|s| s.to_str()) == Some("json")
                && let Some(file_name) = path.file_name().and_then(|s| s.to_str())
                && file_name.starts_with(&format!("backup_{}_", char_id))
            {
                let meta = entry.metadata().ok();
                let size_bytes = meta.map(|m| m.len()).unwrap_or(0);

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
                    size_bytes,
                });
            }
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

    // --- Chat Sessions & Messages (Phase 9) ---

    pub fn create_chat_session(
        &self,
        character_id: &str,
        title: &str,
    ) -> Result<ChatSession, rusqlite::Error> {
        let conn = self.conn.lock();
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

    pub fn list_chat_sessions(
        &self,
        character_id: &str,
    ) -> Result<Vec<ChatSession>, rusqlite::Error> {
        let conn = self.conn.lock();
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
        let conn = self.conn.lock();
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
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM chat_messages WHERE chat_id = ?1",
            params![chat_id],
        )?;
        conn.execute("DELETE FROM chat_sessions WHERE id = ?1", params![chat_id])?;
        Ok(())
    }

    pub fn rename_chat_session(
        &self,
        chat_id: &str,
        new_title: &str,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        let now = current_timestamp();
        conn.execute(
            "UPDATE chat_sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_title, now, chat_id],
        )?;
        Ok(())
    }

    pub fn update_chat_author_note(
        &self,
        chat_id: &str,
        author_note: &str,
        author_note_depth: u32,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        let now = current_timestamp();
        conn.execute(
            "UPDATE chat_sessions SET author_note = ?1, author_note_depth = ?2, updated_at = ?3 WHERE id = ?4",
            params![author_note, author_note_depth, now, chat_id],
        )?;
        Ok(())
    }

    pub fn get_chat_messages(
        &self,
        chat_id: &str,
    ) -> Result<Vec<StoredChatMessage>, rusqlite::Error> {
        let conn = self.conn.lock();
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

            let swipes: Vec<SwipeVariant> =
                serde_json::from_str(&swipes_json).unwrap_or_else(|_| {
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
        let conn = self.conn.lock();
        let now = current_timestamp();
        let id = format!("msg_{}_{:08x}", now, rand::random::<u32>());

        let mut stmt = conn.prepare(
            "SELECT COALESCE(MAX(order_index) + 1, 0) FROM chat_messages WHERE chat_id = ?1",
        )?;
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
        let conn = self.conn.lock();
        let now = current_timestamp();

        let mut stmt = conn.prepare(
            "SELECT chat_id, role, order_index, swipe_index, swipes_json, created_at FROM chat_messages WHERE id = ?1",
        )?;
        let (chat_id, role, order_index, swipe_idx, swipes_json, created_at): (
            String,
            String,
            i32,
            i64,
            String,
            u64,
        ) = stmt.query_row(params![msg_id], |row| {
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
        let conn = self.conn.lock();
        let now = current_timestamp();

        let mut stmt = conn.prepare(
            "SELECT chat_id, role, order_index, swipes_json, created_at FROM chat_messages WHERE id = ?1",
        )?;
        let (chat_id, role, order_index, swipes_json, created_at): (
            String,
            String,
            i32,
            String,
            u64,
        ) = stmt.query_row(params![msg_id], |row| {
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
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT chat_id, role, order_index, swipes_json, created_at FROM chat_messages WHERE id = ?1",
        )?;
        let (chat_id, role, order_index, swipes_json, created_at): (
            String,
            String,
            i32,
            String,
            u64,
        ) = stmt.query_row(params![msg_id], |row| {
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
            params![
                variant.content,
                variant.thought,
                new_swipe_index as i64,
                msg_id
            ],
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
        let conn = self.conn.lock();
        conn.execute("DELETE FROM chat_messages WHERE id = ?1", params![msg_id])?;
        Ok(())
    }

    pub fn delete_messages_after(
        &self,
        chat_id: &str,
        order_index: i32,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        conn.execute(
            "DELETE FROM chat_messages WHERE chat_id = ?1 AND order_index >= ?2",
            params![chat_id, order_index],
        )?;
        Ok(())
    }

    pub fn export_chat_jsonl(
        &self,
        chat_id: &str,
        char_name: &str,
        user_name: &str,
    ) -> Result<String, rusqlite::Error> {
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
            let swipe_variants: Vec<serde_json::Value> = msg
                .swipes
                .iter()
                .map(|s| {
                    serde_json::json!({
                        "content": s.content,
                        "thought": s.thought
                    })
                })
                .collect();

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
        let raw_lines: Vec<&str> = jsonl_content
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .collect();
        if raw_lines.is_empty() {
            return self
                .create_chat_session(character_id, title_override.unwrap_or("Importierter Chat"));
        }

        let mut initial_title = title_override.map(|s| s.to_string());
        let mut author_note = String::new();
        let mut author_note_depth: u32 = 2;
        let mut start_idx = 0;

        // Try parsing first line as header
        if let Ok(first_val) = serde_json::from_str::<serde_json::Value>(raw_lines[0])
            && first_val.get("mes").is_none()
            && (first_val.get("character_name").is_some()
                || first_val.get("chat_metadata").is_some())
        {
            start_idx = 1;
            if initial_title.is_none()
                && let Some(t) = first_val
                    .pointer("/chat_metadata/title")
                    .and_then(|v| v.as_str())
            {
                initial_title = Some(t.to_string());
            }
            if let Some(an) = first_val
                .pointer("/chat_metadata/author_note")
                .and_then(|v| v.as_str())
            {
                author_note = an.to_string();
            }
            if let Some(d) = first_val
                .pointer("/chat_metadata/author_note_depth")
                .and_then(|v| v.as_u64())
            {
                author_note_depth = d as u32;
            }
        }

        let title = initial_title.unwrap_or_else(|| "Importierter Chat".to_string());
        let session = self.create_chat_session(character_id, &title)?;

        if !author_note.is_empty() || author_note_depth != 2 {
            self.update_chat_author_note(&session.id, &author_note, author_note_depth)?;
        }

        for line in &raw_lines[start_idx..] {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                let content = v
                    .get("mes")
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
                } else if v
                    .get("is_system")
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false)
                {
                    "system".to_string()
                } else {
                    "assistant".to_string()
                };

                let thought = v
                    .pointer("/extra/thought")
                    .or_else(|| v.get("thought"))
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());

                // Read swipes
                let mut parsed_swipes = Vec::new();
                if let Some(arr) = v.get("swipe_variants").and_then(|a| a.as_array()) {
                    for it in arr {
                        if let Some(c) = it.get("content").and_then(|s| s.as_str()) {
                            let th = it
                                .get("thought")
                                .and_then(|s| s.as_str())
                                .map(|s| s.to_string());
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

                let swipe_idx = v
                    .get("swipe_id")
                    .or_else(|| v.get("swipe_index"))
                    .and_then(|n| n.as_u64())
                    .unwrap_or(0) as usize;

                // Add message
                let added =
                    self.add_chat_message(&session.id, &role, &content, thought.as_deref())?;

                if !parsed_swipes.is_empty() {
                    let conn = self.conn.lock();
                    let safe_idx = if swipe_idx < parsed_swipes.len() {
                        swipe_idx
                    } else {
                        0
                    };
                    let active_variant = &parsed_swipes[safe_idx];
                    let swipes_json =
                        serde_json::to_string(&parsed_swipes).unwrap_or_else(|_| "[]".to_string());
                    conn.execute(
                        "UPDATE chat_messages SET content = ?1, thought = ?2, swipe_index = ?3, swipes_json = ?4 WHERE id = ?5",
                        params![active_variant.content, active_variant.thought, safe_idx as i64, swipes_json, added.id],
                    )?;
                }
            }
        }

        // Return updated session with message count
        self.get_chat_session(&session.id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }
}

#[cfg(test)]
mod tests {
    fn schema_version(conn: &Connection) -> i64 {
        conn.query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap()
    }

    #[test]
    fn fresh_database_gets_latest_schema() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrate(&mut conn).unwrap();
        assert_eq!(schema_version(&conn), MIGRATIONS.len() as i64);
        assert!(has_column(&conn, "soul_relationship", "dynamic_description").unwrap());

        // Running again (next start) is a no-op.
        migrate(&mut conn).unwrap();
        assert_eq!(schema_version(&conn), MIGRATIONS.len() as i64);
    }

    #[test]
    fn legacy_database_is_upgraded_without_losing_data() {
        let mut conn = Connection::open_in_memory().unwrap();
        // A database from before versioning: v0 and without the later columns.
        conn.execute_batch(
            "CREATE TABLE soul_psychology (
                character_id TEXT PRIMARY KEY,
                primary_emotion TEXT NOT NULL DEFAULT 'Calm',
                intensity INTEGER NOT NULL DEFAULT 3,
                psychological_tension TEXT NOT NULL DEFAULT 'Keine.',
                emotional_decay_counter INTEGER NOT NULL DEFAULT 0,
                active_agenda TEXT NOT NULL DEFAULT '',
                immediate_focus TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL
            );
            INSERT INTO soul_psychology (character_id, primary_emotion, updated_at) VALUES ('ayu', 'Joy', 1);",
        )
        .unwrap();

        migrate(&mut conn).unwrap();

        assert_eq!(schema_version(&conn), MIGRATIONS.len() as i64);
        assert!(has_column(&conn, "soul_psychology", "core_identity").unwrap());
        let (emotion, identity): (String, String) = conn
            .query_row(
                "SELECT primary_emotion, core_identity FROM soul_psychology WHERE character_id = 'ayu'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(emotion, "Joy");
        assert_eq!(identity, "[]");
        assert!(has_column(&conn, "chat_messages", "swipes_json").unwrap());
    }

    #[test]
    fn database_from_newer_version_is_left_alone() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", 999).unwrap();
        migrate(&mut conn).unwrap();
        assert_eq!(schema_version(&conn), 999);
        assert!(!has_column(&conn, "soul_psychology", "core_identity").unwrap());
    }

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
        rel.preferences_habits
            .push("Trinkt gerne Grüntee".to_string());
        rel.shared_milestones
            .push("Gemeinsames Picknick im Park".to_string());
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
        let id1 = db
            .add_episodic_memory("ayu", "fact", "Hiroki mag Matcha Latte", 2)
            .unwrap();
        let id2 = db
            .add_episodic_memory("ayu", "fact", "Hiroki mag Matcha Latte", 4)
            .unwrap();
        // Duplicates should reuse id and elevate significance
        assert_eq!(id1, id2);

        let id3 = db
            .add_episodic_memory("ayu", "secret", "Hat Angst vor Gewitter", 5)
            .unwrap();
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
        db.add_diary_entry(
            "ayu",
            "Erster Tag",
            "Heute habe ich Hiroki getroffen...",
            "Happy",
        )
        .unwrap();
        db.add_diary_entry(
            "ayu",
            "Später Abend",
            "Ich konnte kaum schlafen.",
            "Thoughtful",
        )
        .unwrap();

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
        db.add_episodic_memory("ayu", "fact", "Hiroki mag Matcha Latte", 3)
            .unwrap();
        db.add_diary_entry("ayu", "Tagebucheintrag", "Ein schöner Tag.", "Calm")
            .unwrap();

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

        db.rename_chat_session(&session.id, "Umbenannter Chat")
            .unwrap();
        let loaded = db.get_chat_session(&session.id).unwrap().unwrap();
        assert_eq!(loaded.title, "Umbenannter Chat");

        db.update_chat_author_note(&session.id, "[Ayu ist schüchtern]", 3)
            .unwrap();
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
        let user_msg = db
            .add_chat_message(&session.id, "user", "Hallo Ayu!", None)
            .unwrap();
        assert_eq!(user_msg.role, "user");
        assert_eq!(user_msg.content, "Hallo Ayu!");
        assert_eq!(user_msg.order_index, 0);
        assert_eq!(user_msg.swipes.len(), 1);

        // 2. Add assistant response
        let asst_msg = db
            .add_chat_message(
                &session.id,
                "assistant",
                "*lächelt* Hallo Hiroki!",
                Some("Erfreut über die Begrüßung"),
            )
            .unwrap();
        assert_eq!(asst_msg.role, "assistant");
        assert_eq!(asst_msg.order_index, 1);
        assert_eq!(asst_msg.swipe_index, 0);
        assert_eq!(asst_msg.swipes.len(), 1);

        // 3. Add swipe variant to assistant message
        let swiped = db
            .add_message_swipe(
                &asst_msg.id,
                "*winkt fröhlich* Hey Hiroki, schön dich zu sehen!",
                Some("Sehr enthusiastisch"),
            )
            .unwrap();
        assert_eq!(swiped.swipes.len(), 2);
        assert_eq!(swiped.swipe_index, 1);
        assert_eq!(
            swiped.content,
            "*winkt fröhlich* Hey Hiroki, schön dich zu sehen!"
        );
        assert_eq!(swiped.thought.as_deref(), Some("Sehr enthusiastisch"));

        // 4. Switch back to swipe 0
        let switched = db.switch_message_swipe(&asst_msg.id, 0).unwrap();
        assert_eq!(switched.swipe_index, 0);
        assert_eq!(switched.content, "*lächelt* Hallo Hiroki!");

        // 5. Update active swipe inline
        let updated = db
            .update_chat_message(&asst_msg.id, "*lächelt sanft* Hallo Hiroki!", None)
            .unwrap();
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
        db.update_chat_author_note(&session.id, "[Wetter ist sonnig]", 2)
            .unwrap();

        db.add_chat_message(&session.id, "user", "Kommst du mit zum Schrein?", None)
            .unwrap();
        let asst = db
            .add_chat_message(
                &session.id,
                "assistant",
                "*nickt* Sehr gern!",
                Some("Aufgeregt"),
            )
            .unwrap();
        db.add_message_swipe(
            &asst.id,
            "*hüpft auf* Na klar doch!",
            Some("Voller Energie"),
        )
        .unwrap();

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

    #[test]
    fn test_markdown_roundtrip() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let mut psych = db.get_or_create_psychology("vivy").unwrap();
        psych.core_identity = vec![
            "Meine Mission ist es, den Menschen Freude mit meinem Gesang zu bringen.".to_string(),
            "Ich werde mich niemals selbst aufgeben.".to_string(),
        ];
        psych.primary_emotion = "Determined".to_string();
        psych.intensity = 4;
        psych.psychological_tension = "Ungewissheit über die Zukunft der KI.".to_string();
        psych.active_agenda = "Matsumoto von ihrem Plan überzeugen.".to_string();
        psych.immediate_focus = "Das nächste Lied einstudieren.".to_string();
        psych.cognitive_dissonance = "Fühlt sich mehr menschlich als synthetisch.".to_string();
        db.update_psychology("vivy", &psych).unwrap();

        let char_md = db.render_character_markdown("vivy").unwrap();
        assert!(char_md.contains("# SOUL CACHE: VIVY"));
        assert!(char_md.contains("## CORE IDENTITY & UNBREAKABLE BELIEFS"));
        assert!(
            char_md.contains(
                "Meine Mission ist es, den Menschen Freude mit meinem Gesang zu bringen."
            )
        );
        assert!(char_md.contains("- **Primary Emotion**: Determined (Intensity: 4/5)"));

        // Parse modified markdown back
        let modified_md = r#"# SOUL CACHE: VIVY

## CORE IDENTITY & UNBREAKABLE BELIEFS
- Gesang ist die größte Kraft des Universums.

## INTERNAL STATE & PSYCHOLOGICAL MOMENTUM
- **Primary Emotion**: Euphoric (Intensity: 5/5)
- **Psychological Tension**: Vollständige Gelassenheit.
- **Emotional Decay Counter**: 1/3

## COGNITIVE DRIVE & ACTIVE AGENDA
- **Active Agenda**: Welt-Konzert vorbereiten.
- **Immediate Focus**: Das große Finale.

## UNRESOLVED COGNITIVE DISSONANCE
Keine Dissonanz mehr.
"#;
        db.parse_and_sync_character_markdown("vivy", modified_md)
            .unwrap();
        let updated_psych = db.get_or_create_psychology("vivy").unwrap();
        assert_eq!(updated_psych.primary_emotion, "Euphoric");
        assert_eq!(updated_psych.intensity, 5);
        assert_eq!(
            updated_psych.psychological_tension,
            "Vollständige Gelassenheit."
        );
        assert_eq!(updated_psych.active_agenda, "Welt-Konzert vorbereiten.");
        assert_eq!(updated_psych.immediate_focus, "Das große Finale.");
        assert_eq!(updated_psych.core_identity.len(), 1);
        assert_eq!(
            updated_psych.core_identity[0],
            "Gesang ist die größte Kraft des Universums."
        );
        assert_eq!(updated_psych.cognitive_dissonance, "Keine Dissonanz mehr.");

        // User Markdown test
        let mut rel = db.get_or_create_relationship("vivy", "Matsumoto").unwrap();
        rel.role_in_story = "Partner aus der Zukunft".to_string();
        rel.known_attributes = "Ein weißer KI-Teddybär".to_string();
        rel.trust_level = "Developing Trust".to_string();
        rel.dynamic_description = "Zweckgemeinschaft mit wachsender Verbundenheit".to_string();
        rel.preferences_habits = vec!["Erklärt Dinge gerne überhastet".to_string()];
        rel.shared_milestones = vec!["Erste Zeitlinien-Korrektur erfolgreich".to_string()];
        db.update_relationship("vivy", &rel).unwrap();

        let user_md = db.render_user_markdown("vivy", "Matsumoto").unwrap();
        assert!(user_md.contains("# USER PROFILE & RELATIONSHIP MEMORY: MATSUMOTO"));
        assert!(user_md.contains("- **Role in Story**: Partner aus der Zukunft"));
        assert!(user_md.contains("- **Trust Level**: Developing Trust"));

        let mod_user_md = r#"# USER PROFILE & RELATIONSHIP MEMORY: MATSUMOTO

## USER IDENTITY & STATUS
- **Role in Story**: Beschützer und Freund
- **Known Attributes**: Extrem scharfsinnig

## RELATIONSHIP METADATA
- **Trust Level**: Deeply Bound
- **Dynamic Description**: Blindes Vertrauen
- **Unspoken Tension**: Keine Geheimnisse

## PREFERENCES & HABITS
- Verliert sich in langen Berechnungen

## SHARED MILESTONES & PROMISES
- Die Zukunft gemeinsam gerettet
"#;
        db.parse_and_sync_user_markdown("vivy", "Matsumoto", mod_user_md)
            .unwrap();
        let updated_rel = db.get_or_create_relationship("vivy", "Matsumoto").unwrap();
        assert_eq!(updated_rel.role_in_story, "Beschützer und Freund");
        assert_eq!(updated_rel.trust_level, "Deeply Bound");
        assert_eq!(
            updated_rel.preferences_habits[0],
            "Verliert sich in langen Berechnungen"
        );
        assert_eq!(
            updated_rel.shared_milestones[0],
            "Die Zukunft gemeinsam gerettet"
        );
    }

    #[test]
    fn test_backup_and_restore() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let temp_dir =
            std::env::temp_dir().join(format!("otakusoul_test_backup_{}", rand::random::<u32>()));
        std::fs::create_dir_all(&temp_dir).unwrap();

        let mut psych = db.get_or_create_psychology("akane").unwrap();
        psych.primary_emotion = "Confident".to_string();
        psych.core_identity = vec!["Gerechtigkeit ist unantastbar.".to_string()];
        db.update_psychology("akane", &psych).unwrap();

        let backup = db
            .backup_memory_state("akane", Some("Kogami"), Some(&temp_dir))
            .unwrap();
        assert!(backup.filename.starts_with("backup_akane_"));

        let backups = db.list_memory_backups("akane", Some(&temp_dir)).unwrap();
        assert_eq!(backups.len(), 1);

        // Modify state in DB
        psych.primary_emotion = "Broken".to_string();
        psych.core_identity = vec![];
        db.update_psychology("akane", &psych).unwrap();
        assert_eq!(
            db.get_or_create_psychology("akane")
                .unwrap()
                .primary_emotion,
            "Broken"
        );

        // Restore
        let backup_path = temp_dir.join(&backup.filename);
        db.restore_memory_backup(&backup_path).unwrap();

        let restored = db.get_or_create_psychology("akane").unwrap();
        assert_eq!(restored.primary_emotion, "Confident");
        assert_eq!(restored.core_identity[0], "Gerechtigkeit ist unantastbar.");

        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_sow_import() {
        let db = MemoryDb::new_in_memory().expect("in-memory db failed");
        let temp_dir =
            std::env::temp_dir().join(format!("otakusoul_test_sow_{}", rand::random::<u32>()));
        let topics_dir = temp_dir.join("topics");
        std::fs::create_dir_all(&topics_dir).unwrap();

        let mem_content = r#"# SOUL CACHE: ASUNA

## CORE IDENTITY & UNBREAKABLE BELIEFS
- Ich beschütze meine Freunde mit meinem Leben.

## INTERNAL STATE & PSYCHOLOGICAL MOMENTUM
- **Primary Emotion**: Loving (Intensity: 5/5)
- **Psychological Tension**: Sorge um die reale Welt.
- **Emotional Decay Counter**: 0/3

## COGNITIVE DRIVE & ACTIVE AGENDA
- **Active Agenda**: Ein gemütliches Abendessen kochen.
- **Immediate Focus**: Zutaten sammeln.

## UNRESOLVED COGNITIVE DISSONANCE
Keine.
"#;
        std::fs::write(temp_dir.join("MEMORY.md"), mem_content).unwrap();

        let user_content = r#"# USER PROFILE & RELATIONSHIP MEMORY: KIRITO

## USER IDENTITY & STATUS
- **Role in Story**: Schwarzer Schwertkämpfer
- **Known Attributes**: Schnelle Reflexe, introvertiert

## RELATIONSHIP METADATA
- **Trust Level**: Deeply Bound
- **Dynamic Description**: Unzertrennliches Paar
- **Unspoken Tension**: Keine.

## PREFERENCES & HABITS
- Liebt Ragout-Kaninchen

## SHARED MILESTONES & PROMISES
- Haus auf Ebene 22 gekauft
"#;
        std::fs::write(temp_dir.join("USER.md"), user_content).unwrap();

        let topic_content =
            "# Sword Art Online\nEin tödliches VRMMO, aus dem es kein Entkommen gab.";
        std::fs::write(topics_dir.join("sao_world.md"), topic_content).unwrap();

        let diary_content = "Heute war ein ruhiger Tag. Kirito und ich haben am See gesessen.";
        std::fs::write(temp_dir.join("DIARY.md"), diary_content).unwrap();

        let count = db
            .import_sow_memory_folder("asuna", &temp_dir, "Kirito")
            .unwrap();
        assert_eq!(count, 4);

        let psych = db.get_or_create_psychology("asuna").unwrap();
        assert_eq!(psych.primary_emotion, "Loving");
        assert_eq!(
            psych.core_identity[0],
            "Ich beschütze meine Freunde mit meinem Leben."
        );

        let rel = db.get_or_create_relationship("asuna", "Kirito").unwrap();
        assert_eq!(rel.role_in_story, "Schwarzer Schwertkämpfer");
        assert_eq!(rel.trust_level, "Deeply Bound");
        assert_eq!(rel.preferences_habits[0], "Liebt Ragout-Kaninchen");

        let memories = db.get_episodic_memories("asuna", 10).unwrap();
        assert_eq!(memories.len(), 1);
        assert!(memories[0].content.contains("Sword Art Online"));

        let diaries = db.get_diary_entries("asuna", 10).unwrap();
        assert_eq!(diaries.len(), 1);
        assert!(diaries[0].entry_text.contains("Heute war ein ruhiger Tag"));

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}

