//! Versioned schema migrations (`PRAGMA user_version`).

use super::*;

/// Schema migrations in order: after step `i` the database has `PRAGMA user_version = i + 1`.
/// Append new steps for schema changes; never edit a step that has shipped.
pub(super) const MIGRATIONS: &[fn(&Connection) -> rusqlite::Result<()>] = &[migrate_v1_baseline];

/// Brings the database to the latest schema, one transaction per step. A database written by a
/// newer OtakuSoul is left untouched.
pub(super) fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
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
pub(super) fn migrate_v1_baseline(conn: &Connection) -> rusqlite::Result<()> {
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

pub(super) fn has_column(conn: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut names = stmt.query_map([], |row| row.get::<_, String>(1))?;
    names.try_fold(false, |found, name| Ok(found || name? == column))
}
