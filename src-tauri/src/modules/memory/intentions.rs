//! Intentions and promises (plans with a time basis): kept apart from the episodic memories
//! while open, turned into one when resolved, so the memory recall still finds them.

use super::*;
use chrono::{DateTime, Datelike, Local, NaiveDate, NaiveDateTime, TimeZone};

/// Open intentions in one prompt at most.
const MAX_PROMPT_INTENTIONS: usize = 5;
/// After the due time an intention with a time of day stays open this long.
const GRACE_WITH_TIME: u64 = 6 * 3600;
/// An intention for a whole day stays open until the end of the next day.
const GRACE_WHOLE_DAY: u64 = 48 * 3600;

const COLUMNS: &str = "id, character_id, user_name, title, details, initiator, time_basis, status,
    due_at, due_has_time, origin, source_chat_id, created_at, resolved_at, memory_id";

fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<IntentionEntry> {
    Ok(IntentionEntry {
        id: row.get(0)?,
        character_id: row.get(1)?,
        user_name: row.get(2)?,
        title: row.get(3)?,
        details: row.get(4)?,
        initiator: row.get(5)?,
        time_basis: row.get(6)?,
        status: row.get(7)?,
        due_at: row.get(8)?,
        due_has_time: row.get(9)?,
        origin: row.get(10)?,
        source_chat_id: row.get(11)?,
        created_at: row.get(12)?,
        resolved_at: row.get(13)?,
        memory_id: row.get(14)?,
    })
}

/// What one reflection decided about intentions (written by `apply_reflection`).
pub struct IntentionChanges<'a> {
    pub user_name: &'a str,
    pub create: Vec<IntentionDraft>,
    /// Ids and new status; only open intentions of this character and user are changed.
    pub resolve: Vec<(i64, String)>,
    pub source_chat_id: Option<&'a str>,
    pub now: DateTime<Local>,
}

/// A due date as the model writes it (`2026-10-20` or `2026-10-20T18:00`, local time) in
/// UNIX seconds, and whether it has a time of day. `None` when it cannot be read or has passed.
pub fn parse_due(text: &str, now: DateTime<Local>) -> Option<(u64, bool)> {
    let text = text.trim();
    for format in [
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
    ] {
        if let Ok(naive) = NaiveDateTime::parse_from_str(text, format) {
            let at = Local.from_local_datetime(&naive).earliest()?;
            return (at >= now).then(|| (at.timestamp() as u64, true));
        }
    }
    let date = NaiveDate::parse_from_str(text, "%Y-%m-%d").ok()?;
    if date < now.date_naive() {
        return None;
    }
    let midnight = Local
        .from_local_datetime(&date.and_hms_opt(0, 0, 0)?)
        .earliest()?;
    Some((midnight.timestamp() as u64, false))
}

fn normalized(value: &str, allowed: &[&str], default: &str) -> String {
    let value = value.trim().to_lowercase();
    if allowed.contains(&value.as_str()) {
        value
    } else {
        default.to_string()
    }
}

/// The intention's due moment after which it counts as missed.
fn missed_after(due_at: u64, has_time: bool) -> u64 {
    due_at
        + if has_time {
            GRACE_WITH_TIME
        } else {
            GRACE_WHOLE_DAY
        }
}

/// When an open intention is due, for the prompt (English like the rest of the instructions).
pub(super) fn due_label(entry: &IntentionEntry, now: DateTime<Local>) -> String {
    let Some(due) = entry
        .due_at
        .filter(|_| entry.time_basis == "real")
        .and_then(|due| Local.timestamp_opt(due as i64, 0).single())
    else {
        return if entry.time_basis == "real" {
            "open".into()
        } else {
            "open in the story".into()
        };
    };
    let days = (due.date_naive() - now.date_naive()).num_days();
    let time = if entry.due_has_time {
        format!(" at {}", due.format("%H:%M"))
    } else {
        String::new()
    };
    match days {
        0 if entry.due_has_time && due < now => format!("overdue since today{time}"),
        0 => format!("due today{time}"),
        1 => format!("due tomorrow{time}"),
        -1 => "overdue since yesterday".into(),
        d if d < 0 => format!("overdue since {}", due.format("%Y-%m-%d")),
        d if d < 7 => format!("due on {}{time}", weekday(due.weekday())),
        _ => format!("due on {}{time}", due.format("%Y-%m-%d")),
    }
}

fn weekday(day: chrono::Weekday) -> &'static str {
    match day {
        chrono::Weekday::Mon => "Monday",
        chrono::Weekday::Tue => "Tuesday",
        chrono::Weekday::Wed => "Wednesday",
        chrono::Weekday::Thu => "Thursday",
        chrono::Weekday::Fri => "Friday",
        chrono::Weekday::Sat => "Saturday",
        chrono::Weekday::Sun => "Sunday",
    }
}

impl MemoryDb {
    pub(super) fn list_intentions_on(
        conn: &Connection,
        char_id: &str,
        user_name: &str,
        include_resolved: bool,
    ) -> Result<Vec<IntentionEntry>, rusqlite::Error> {
        let mut stmt = conn.prepare(&format!(
            "SELECT {COLUMNS} FROM soul_intentions
             WHERE character_id = ?1 AND user_name = ?2 AND (?3 OR status = 'pending')
             ORDER BY status != 'pending', due_at IS NULL, due_at, id DESC"
        ))?;
        let rows = stmt.query_map(params![char_id, user_name, include_resolved], from_row)?;
        rows.collect()
    }

    /// Intentions of a character towards one user, open ones first (missed ones expire first).
    pub fn get_intentions(
        &self,
        char_id: &str,
        user_name: &str,
        include_resolved: bool,
    ) -> Result<Vec<IntentionEntry>, rusqlite::Error> {
        let conn = self.conn.lock();
        Self::expire_intentions_on(&conn, char_id, user_name, Local::now())?;
        Self::list_intentions_on(&conn, char_id, user_name, include_resolved)
    }

    /// Adds an intention; an open one with the same title is not added twice (its id is
    /// returned instead). `story` intentions never get a due date.
    pub(super) fn add_intention_on(
        conn: &Connection,
        char_id: &str,
        user_name: &str,
        draft: &IntentionDraft,
        origin: &str,
        source_chat_id: Option<&str>,
    ) -> Result<Option<i64>, rusqlite::Error> {
        let title = draft.title.trim();
        if title.is_empty() {
            return Ok(None);
        }
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM soul_intentions WHERE character_id = ?1 AND user_name = ?2
                 AND status = 'pending' AND LOWER(TRIM(title)) = LOWER(?3)",
                params![char_id, user_name, title],
                |row| row.get(0),
            )
            .optional()?;
        if existing.is_some() {
            return Ok(existing);
        }
        let time_basis = normalized(&draft.time_basis, &["real", "story"], "story");
        let due_at = draft.due_at.filter(|_| time_basis == "real");
        conn.execute(
            "INSERT INTO soul_intentions (character_id, user_name, title, details, initiator, time_basis,
                 due_at, due_has_time, origin, source_chat_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                char_id,
                user_name,
                title,
                draft.details.trim(),
                normalized(&draft.initiator, &["character", "user", "both"], "both"),
                time_basis,
                due_at,
                due_at.is_some() && draft.due_has_time,
                origin,
                source_chat_id,
                current_timestamp(),
            ],
        )?;
        Ok(Some(conn.last_insert_rowid()))
    }

    pub fn add_intention(
        &self,
        char_id: &str,
        user_name: &str,
        draft: &IntentionDraft,
    ) -> Result<Option<i64>, rusqlite::Error> {
        let conn = self.conn.lock();
        Self::add_intention_on(&conn, char_id, user_name, draft, "manual", None)
    }

    /// The user changes an intention (title, details, who, time basis, due date).
    pub fn update_intention(
        &self,
        char_id: &str,
        id: i64,
        draft: &IntentionDraft,
    ) -> Result<(), rusqlite::Error> {
        let time_basis = normalized(&draft.time_basis, &["real", "story"], "story");
        let due_at = draft.due_at.filter(|_| time_basis == "real");
        self.conn.lock().execute(
            "UPDATE soul_intentions SET title = ?1, details = ?2, initiator = ?3, time_basis = ?4,
                 due_at = ?5, due_has_time = ?6
             WHERE id = ?7 AND character_id = ?8 AND TRIM(?1) != ''",
            params![
                draft.title.trim(),
                draft.details.trim(),
                normalized(&draft.initiator, &["character", "user", "both"], "both"),
                time_basis,
                due_at,
                due_at.is_some() && draft.due_has_time,
                id,
                char_id,
            ],
        )?;
        Ok(())
    }

    /// Resolves an open intention (`fulfilled`, `expired`, `abandoned`); it becomes an episodic
    /// memory. Returns whether it was open.
    pub(super) fn resolve_intention_on(
        conn: &Connection,
        char_id: &str,
        user_name: Option<&str>,
        id: i64,
        status: &str,
    ) -> Result<bool, rusqlite::Error> {
        let status = normalized(status, &["fulfilled", "expired", "abandoned"], "");
        if status.is_empty() {
            return Ok(false);
        }
        let entry = conn
            .query_row(
                &format!(
                    "SELECT {COLUMNS} FROM soul_intentions
                     WHERE id = ?1 AND character_id = ?2 AND status = 'pending'"
                ),
                params![id, char_id],
                from_row,
            )
            .optional()?;
        let Some(entry) = entry.filter(|e| user_name.is_none_or(|u| u == e.user_name)) else {
            return Ok(false);
        };
        let lang = crate::modules::content_lang::ContentLang::current();
        let template = match status.as_str() {
            "fulfilled" => "Promise kept: {}",
            "expired" => "Promise not kept: {}",
            _ => "Plan dropped: {}",
        };
        let mut text = lang.fill_t(template, &[&entry.title]);
        if !entry.details.is_empty() {
            text.push_str(&format!(" ({})", entry.details));
        }
        let no_messages: Vec<String> = Vec::new();
        let source = MemorySource {
            origin: if entry.origin == "manual" {
                "manual"
            } else {
                "auto"
            },
            chat_id: entry.source_chat_id.as_deref(),
            message_ids: &no_messages,
        };
        let memory_id =
            Self::add_episodic_memory_sourced_on(conn, char_id, "promise", &text, 3, &source)?;
        conn.execute(
            "UPDATE soul_intentions SET status = ?1, resolved_at = ?2, memory_id = ?3 WHERE id = ?4",
            params![status, current_timestamp(), memory_id, id],
        )?;
        Ok(true)
    }

    /// The user marks an intention as fulfilled or abandoned.
    pub fn set_intention_status(
        &self,
        char_id: &str,
        id: i64,
        status: &str,
    ) -> Result<bool, rusqlite::Error> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        let changed = Self::resolve_intention_on(&tx, char_id, None, id, status)?;
        tx.commit()?;
        Ok(changed)
    }

    pub fn delete_intention(&self, char_id: &str, id: i64) -> Result<(), rusqlite::Error> {
        self.conn.lock().execute(
            "DELETE FROM soul_intentions WHERE id = ?1 AND character_id = ?2",
            params![id, char_id],
        )?;
        Ok(())
    }

    /// Open `real` intentions whose due time has passed (with grace) become `expired`.
    pub(super) fn expire_intentions_on(
        conn: &Connection,
        char_id: &str,
        user_name: &str,
        now: DateTime<Local>,
    ) -> Result<usize, rusqlite::Error> {
        let now = now.timestamp().max(0) as u64;
        let missed: Vec<i64> = Self::list_intentions_on(conn, char_id, user_name, false)?
            .into_iter()
            .filter(|e| e.time_basis == "real")
            .filter(|e| {
                e.due_at
                    .is_some_and(|due| missed_after(due, e.due_has_time) < now)
            })
            .map(|e| e.id)
            .collect();
        for id in &missed {
            Self::resolve_intention_on(conn, char_id, Some(user_name), *id, "expired")?;
        }
        Ok(missed.len())
    }

    /// Open intentions for a prompt, due soonest first, `story` ones after them.
    pub fn prompt_intentions(
        &self,
        char_id: &str,
        user_name: &str,
        now: DateTime<Local>,
    ) -> Result<Vec<IntentionPrompt>, rusqlite::Error> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        Self::expire_intentions_on(&tx, char_id, user_name, now)?;
        let open = Self::list_intentions_on(&tx, char_id, user_name, false)?;
        tx.commit()?;
        Ok(open
            .iter()
            .take(MAX_PROMPT_INTENTIONS)
            .map(|e| IntentionPrompt {
                label: due_label(e, now),
                title: e.title.clone(),
                details: e.details.clone(),
                initiator: e.initiator.clone(),
            })
            .collect())
    }

    /// Writes a reflection's intentions; runs inside `apply_reflection`'s transaction.
    pub(super) fn apply_intention_changes_on(
        conn: &Connection,
        char_id: &str,
        changes: &IntentionChanges<'_>,
    ) -> Result<(), rusqlite::Error> {
        Self::expire_intentions_on(conn, char_id, changes.user_name, changes.now)?;
        for draft in &changes.create {
            Self::add_intention_on(
                conn,
                char_id,
                changes.user_name,
                draft,
                "auto",
                changes.source_chat_id,
            )?;
        }
        for (id, status) in &changes.resolve {
            Self::resolve_intention_on(conn, char_id, Some(changes.user_name), *id, status)?;
        }
        Ok(())
    }
}
