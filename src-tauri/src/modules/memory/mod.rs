//! Soul memory: per-character psychology, relationships, memories, diary and chats in SQLite.

use parking_lot::Mutex;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::LazyLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, warn};

mod chats;
mod markdown;
mod models;
mod schema;
mod snapshots;
mod soul;
#[cfg(test)]
mod tests;

pub use models::*;
use schema::migrate;

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
        let base_dir = crate::modules::paths::base_dirs().1;
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
}
