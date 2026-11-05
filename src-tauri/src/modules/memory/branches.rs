//! Memory branches ("what if …?"): a chat branched off with its own memory keeps it under the
//! memory id `<character>@branch-<id>` (`chat_sessions.memory_branch`). Every memory table is
//! keyed by that id, so reading and writing need no changes; the frontend picks the id from the
//! chat it works for. A branch starts as a copy of the memory as it was at the branch point.

use super::*;
use rusqlite::ToSql;
use std::collections::HashMap;

/// Separates the character from the branch in a memory id.
pub const BRANCH_MARK: &str = "@branch-";

/// The memory id of `char_id` in `branch` ('' = the shared main line).
pub fn memory_id(char_id: &str, branch: &str) -> String {
    if branch.is_empty() {
        char_id.to_string()
    } else {
        format!("{char_id}{BRANCH_MARK}{branch}")
    }
}

/// The character a memory id belongs to (without a branch).
pub fn base_character_id(id: &str) -> &str {
    id.split_once(BRANCH_MARK).map_or(id, |(base, _)| base)
}

/// Where a branch leaves its chat.
pub(super) struct BranchCut<'a> {
    /// `created_at` of the last copied message: later diary entries, plans and memories from
    /// elsewhere are not part of the branch yet.
    pub at: u64,
    pub source_chat: &'a str,
    pub new_chat: &'a str,
    /// Old → new id of every copied message.
    pub messages: &'a HashMap<String, String>,
}

/// Tables that hold a character's memory (keyed by `character_id`).
const MEMORY_TABLES: &[&str] = &[
    "soul_psychology",
    "soul_relationship",
    "soul_episodic_memory",
    "soul_memory_history",
    "soul_diary",
    "soul_healing_log",
    "soul_intentions",
];

fn columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let names = stmt.query_map([], |row| row.get::<_, String>(1))?;
    names.collect()
}

/// Copies the rows of `table` matching `filter` (placeholders `?1` … for `filter_params`), with
/// the columns in `set` replaced; an `id` column gets new values. Copies every column, so later
/// migrations need no change here. Returns the new ids in the order of the old ones.
fn copy_rows(
    conn: &Connection,
    table: &str,
    filter: &str,
    filter_params: &[&dyn ToSql],
    set: &[(&str, &dyn ToSql)],
) -> rusqlite::Result<Vec<i64>> {
    let all = columns(conn, table)?;
    let has_id = all.iter().any(|c| c == "id");
    let cols: Vec<&String> = all.iter().filter(|c| c.as_str() != "id").collect();
    let values: Vec<String> = cols
        .iter()
        .map(|c| {
            set.iter().position(|(name, _)| name == c).map_or_else(
                || (*c).clone(),
                |i| format!("?{}", filter_params.len() + i + 1),
            )
        })
        .collect();
    let names: Vec<&str> = cols.iter().map(|c| c.as_str()).collect();
    let order = if has_id { "ORDER BY id" } else { "" };
    let sql = format!(
        "INSERT INTO {table} ({}) SELECT {} FROM {table} WHERE {filter} {order}",
        names.join(", "),
        values.join(", ")
    );
    let mut bound: Vec<&dyn ToSql> = filter_params.to_vec();
    bound.extend(set.iter().map(|(_, v)| *v));
    if !has_id {
        conn.execute(&sql, bound.as_slice())?;
        return Ok(Vec::new());
    }
    let before: i64 = conn.query_row(
        &format!("SELECT COALESCE(MAX(id), 0) FROM {table}"),
        [],
        |r| r.get(0),
    )?;
    conn.execute(&sql, bound.as_slice())?;
    let mut stmt = conn.prepare(&format!("SELECT id FROM {table} WHERE id > ?1 ORDER BY id"))?;
    let ids = stmt.query_map(params![before], |r| r.get(0))?;
    ids.collect()
}

impl MemoryDb {
    /// Copies the memory `from` into the new branch memory `to` as it was at `cut`: mood and
    /// relationship as they are now (they keep no history); memories learned from messages after
    /// the cut, and diary entries, plans and other memories that came later, stay behind. Plans
    /// resolved after the cut are open again, memories superseded after it active again.
    pub(super) fn copy_memory_scope_on(
        conn: &Connection,
        from: &str,
        to: &str,
        cut: &BranchCut<'_>,
    ) -> rusqlite::Result<()> {
        let at = cut.at as i64;
        let to_char: [(&str, &dyn ToSql); 1] = [("character_id", &to)];
        copy_rows(
            conn,
            "soul_psychology",
            "character_id = ?1",
            &[&from],
            &to_char,
        )?;
        copy_rows(
            conn,
            "soul_relationship",
            "character_id = ?1",
            &[&from],
            &to_char,
        )?;
        let time_filter = "character_id = ?1 AND created_at <= ?2";
        copy_rows(conn, "soul_diary", time_filter, &[&from, &at], &to_char)?;
        copy_rows(
            conn,
            "soul_healing_log",
            time_filter,
            &[&from, &at],
            &to_char,
        )?;

        // Memories: which are part of the branch, and their new ids.
        type Row = (i64, u64, Option<String>, String, Option<u64>);
        let rows: Vec<Row> = conn
            .prepare(
                "SELECT id, created_at, source_chat_id, source_message_ids, superseded_at
                 FROM soul_episodic_memory WHERE character_id = ?1 ORDER BY id",
            )?
            .query_map(params![from], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })?
            .collect::<Result<_, _>>()?;
        let mut new_ids: HashMap<i64, i64> = HashMap::new();
        let mut still_superseded: Vec<(i64, i64)> = Vec::new();
        for (old, created_at, chat, sources, superseded_at) in rows {
            let sources: Vec<String> = serde_json::from_str(&sources).unwrap_or_default();
            let from_this_chat = chat.as_deref() == Some(cut.source_chat) && !sources.is_empty();
            // Learned in this chat: part of the branch if a copied message taught it.
            let mapped: Vec<String> = sources
                .iter()
                .filter_map(|s| cut.messages.get(s).cloned())
                .collect();
            let keep = if from_this_chat {
                !mapped.is_empty()
            } else {
                created_at <= cut.at
            };
            if !keep {
                continue;
            }
            let id = *copy_rows(conn, "soul_episodic_memory", "id = ?1", &[&old], &to_char)?
                .first()
                .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
            new_ids.insert(old, id);
            if from_this_chat {
                conn.execute(
                    "UPDATE soul_episodic_memory SET source_chat_id = ?1, source_message_ids = ?2 WHERE id = ?3",
                    params![
                        cut.new_chat,
                        serde_json::to_string(&mapped).unwrap_or_else(|_| "[]".into()),
                        id
                    ],
                )?;
            }
            match superseded_at {
                // Outdated only later: at the branch point it was still true.
                Some(t) if t > cut.at => {
                    conn.execute(
                        "UPDATE soul_episodic_memory SET superseded_at = NULL, superseded_by = NULL,
                             supersede_reason = '' WHERE id = ?1",
                        params![id],
                    )?;
                }
                Some(_) => still_superseded.push((old, id)),
                None => {}
            }
            copy_rows(
                conn,
                "soul_memory_history",
                "memory_id = ?1",
                &[&old],
                &[("memory_id", &id), ("character_id", &to)],
            )?;
        }
        for (old, id) in still_superseded {
            let by: Option<i64> = conn.query_row(
                "SELECT superseded_by FROM soul_episodic_memory WHERE id = ?1",
                params![old],
                |r| r.get(0),
            )?;
            conn.execute(
                "UPDATE soul_episodic_memory SET superseded_by = ?1 WHERE id = ?2",
                params![by.and_then(|b| new_ids.get(&b).copied()), id],
            )?;
        }

        // Plans made by then; resolved only later = still open at the branch point.
        type Plan = (i64, Option<u64>, Option<i64>, Option<String>);
        let plans: Vec<Plan> = conn
            .prepare(
                "SELECT id, resolved_at, memory_id, source_chat_id FROM soul_intentions
                 WHERE character_id = ?1 AND created_at <= ?2 ORDER BY id",
            )?
            .query_map(params![from, at], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?))
            })?
            .collect::<Result<_, _>>()?;
        for (old, resolved_at, memory, chat) in plans {
            let Some(&id) =
                copy_rows(conn, "soul_intentions", "id = ?1", &[&old], &to_char)?.first()
            else {
                continue;
            };
            if resolved_at.is_some_and(|t| t > cut.at) {
                conn.execute(
                    "UPDATE soul_intentions SET status = 'pending', resolved_at = NULL, memory_id = NULL WHERE id = ?1",
                    params![id],
                )?;
            } else {
                conn.execute(
                    "UPDATE soul_intentions SET memory_id = ?1 WHERE id = ?2",
                    params![memory.and_then(|m| new_ids.get(&m).copied()), id],
                )?;
            }
            if chat.as_deref() == Some(cut.source_chat) {
                conn.execute(
                    "UPDATE soul_intentions SET source_chat_id = ?1 WHERE id = ?2",
                    params![cut.new_chat, id],
                )?;
            }
        }
        Ok(())
    }

    /// Removes all memory of a branch id (its last chat was deleted). Never the main line.
    pub(super) fn delete_memory_scope_on(conn: &Connection, id: &str) -> rusqlite::Result<()> {
        if !id.contains(BRANCH_MARK) {
            return Ok(());
        }
        for table in MEMORY_TABLES {
            conn.execute(
                &format!("DELETE FROM {table} WHERE character_id = ?1"),
                params![id],
            )?;
        }
        Ok(())
    }
}
