//! Chat sessions, messages, swipes and JSONL import/export.

use super::*;
use rusqlite::OptionalExtension;

/// A message row copied by `branch_chat`: id, role, content, thought, order, swipe index,
/// swipes, created, attachments.
type BranchRow = (
    String,
    String,
    String,
    Option<String>,
    i64,
    i64,
    String,
    u64,
    String,
);

/// A message the running summary already covers changed (edit, swipe, delete): the summary
/// still tells the old version, so it is dropped and rebuilt from the start the next time
/// messages leave the context window. Later messages don't touch it.
fn discard_stale_summary(
    conn: &rusqlite::Connection,
    chat_id: &str,
    order_index: i64,
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "UPDATE chat_sessions SET summary = '', summary_until = -1 WHERE id = ?1 AND summary_until >= ?2",
        params![chat_id, order_index],
    )?;
    Ok(())
}

impl MemoryDb {
    // --- Chat Sessions & Messages (Phase 9) ---

    pub fn create_chat_session(
        &self,
        character_id: &str,
        title: &str,
    ) -> Result<ChatSession, rusqlite::Error> {
        self.create_chat_session_with_greeting(character_id, title, None)
    }

    /// A new chat together with the character's first message, in one transaction: a failure
    /// leaves neither an empty session nor a lone greeting behind.
    pub fn create_chat_session_with_greeting(
        &self,
        character_id: &str,
        title: &str,
        greeting: Option<&str>,
    ) -> Result<ChatSession, rusqlite::Error> {
        let conn = self.conn.lock();
        let tx = conn.unchecked_transaction()?;
        let now = current_timestamp();
        let id = format!("chat_{}_{:08x}", now, rand::random::<u32>());
        let effective_title = if title.trim().is_empty() {
            "Neuer Chat".to_string()
        } else {
            title.trim().to_string()
        };

        tx.execute(
            "INSERT INTO chat_sessions (id, character_id, title, created_at, updated_at, author_note, author_note_depth)
             VALUES (?1, ?2, ?3, ?4, ?4, '', 2)",
            params![id, character_id, effective_title, now],
        )?;
        let greeting = greeting.map(str::trim).filter(|text| !text.is_empty());
        if let Some(text) = greeting {
            let swipes = serde_json::to_string(&[SwipeVariant {
                content: text.to_string(),
                thought: None,
            }])
            .unwrap_or_else(|_| "[]".into());
            tx.execute(
                "INSERT INTO chat_messages (id, chat_id, role, content, thought, order_index, swipe_index, swipes_json, created_at, attachments_json)
                 VALUES (?1, ?2, 'assistant', ?3, NULL, 0, 0, ?4, ?5, '[]')",
                params![format!("msg_{}_{:08x}", now, rand::random::<u32>()), id, text, swipes, now],
            )?;
        }
        tx.commit()?;

        Ok(ChatSession {
            id,
            character_id: character_id.to_string(),
            title: effective_title,
            created_at: now,
            updated_at: now,
            author_note: String::new(),
            author_note_depth: 2,
            message_count: usize::from(greeting.is_some()),
            summary: String::new(),
            summary_until: -1,
        })
    }

    /// Every stored attachment reference (`chat/file`) and every chat id, for cleaning up
    /// attachment files no message uses anymore.
    pub fn attachment_references(
        &self,
    ) -> Result<
        (
            std::collections::HashSet<String>,
            std::collections::HashSet<String>,
        ),
        rusqlite::Error,
    > {
        let conn = self.conn.lock();
        let chats = conn
            .prepare("SELECT id FROM chat_sessions")?
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<_, _>>()?;
        let mut files = std::collections::HashSet::new();
        let mut stmt = conn.prepare(
            "SELECT attachments_json FROM chat_messages WHERE attachments_json NOT IN ('', '[]')",
        )?;
        for json in stmt.query_map([], |row| row.get::<_, String>(0))? {
            let stored: Vec<crate::modules::attachments::Attachment> =
                serde_json::from_str(&json?).unwrap_or_default();
            files.extend(stored.into_iter().map(|attachment| attachment.file));
        }
        Ok((files, chats))
    }

    pub fn list_chat_sessions(
        &self,
        character_id: &str,
    ) -> Result<Vec<ChatSession>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.character_id, s.title, s.created_at, s.updated_at, s.author_note, s.author_note_depth,
                    (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = s.id) AS msg_count,
                    s.summary, s.summary_until
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
                summary: row.get(8)?,
                summary_until: row.get(9)?,
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
                    (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = s.id) AS msg_count,
                    s.summary, s.summary_until
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
                summary: row.get(8)?,
                summary_until: row.get(9)?,
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
        conn.execute(
            "DELETE FROM chat_bookmarks WHERE chat_id = ?1",
            params![chat_id],
        )?;
        conn.execute("DELETE FROM chat_sessions WHERE id = ?1", params![chat_id])?;
        crate::modules::attachments::remove_chat(chat_id);
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

    pub fn update_chat_summary(
        &self,
        chat_id: &str,
        summary: &str,
        summary_until: i64,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE chat_sessions SET summary = ?1, summary_until = ?2 WHERE id = ?3",
            params![summary, summary_until, chat_id],
        )?;
        Ok(())
    }

    /// Continues a chat as a new one: copies the history up to and including `message_id`
    /// (variants, attachments, bookmarks) and the author's note; the running summary only
    /// when it covers nothing after that point. The character's Soul Memory stays shared.
    pub fn branch_chat(
        &self,
        chat_id: &str,
        message_id: &str,
        title: &str,
    ) -> Result<ChatSession, rusqlite::Error> {
        let new_id = {
            let conn = self.conn.lock();
            let tx = conn.unchecked_transaction()?;
            let (character_id, author_note, depth, summary, summary_until): (String, String, i64, String, i64) = tx.query_row(
                "SELECT character_id, author_note, author_note_depth, summary, summary_until FROM chat_sessions WHERE id = ?1",
                params![chat_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )?;
            let up_to: i64 = tx.query_row(
                "SELECT order_index FROM chat_messages WHERE id = ?1 AND chat_id = ?2",
                params![message_id, chat_id],
                |row| row.get(0),
            )?;
            let now = current_timestamp();
            let new_id = format!("chat_{}_{:08x}", now, rand::random::<u32>());
            let (summary, summary_until) = if summary_until <= up_to {
                (summary, summary_until)
            } else {
                (String::new(), -1)
            };
            tx.execute(
                "INSERT INTO chat_sessions (id, character_id, title, created_at, updated_at, author_note, author_note_depth, summary, summary_until)
                 VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6, ?7, ?8)",
                params![new_id, character_id, title.trim(), now, author_note, depth, summary, summary_until],
            )?;

            let bookmarked: std::collections::HashSet<String> = {
                let mut stmt =
                    tx.prepare("SELECT message_id FROM chat_bookmarks WHERE chat_id = ?1")?;
                stmt.query_map(params![chat_id], |row| row.get(0))?
                    .collect::<Result<_, _>>()?
            };
            let rows: Vec<BranchRow> = {
                let mut stmt = tx.prepare(
                    "SELECT id, role, content, thought, order_index, swipe_index, swipes_json, created_at, attachments_json
                     FROM chat_messages WHERE chat_id = ?1 AND order_index <= ?2 ORDER BY order_index ASC",
                )?;
                stmt.query_map(params![chat_id, up_to], |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                        row.get(8)?,
                    ))
                })?
                .collect::<Result<_, _>>()?
            };
            for (
                index,
                (
                    old_id,
                    role,
                    content,
                    thought,
                    order_index,
                    swipe_index,
                    swipes_json,
                    created_at,
                    attachments_json,
                ),
            ) in rows.into_iter().enumerate()
            {
                let id = format!("msg_{}_{:08x}_{index}", now, rand::random::<u32>());
                let attachments: Vec<crate::modules::attachments::Attachment> =
                    serde_json::from_str(&attachments_json).unwrap_or_default();
                let attachments: Vec<_> = attachments
                    .iter()
                    .map(|a| crate::modules::attachments::copy_to_chat(a, &new_id))
                    .collect();
                tx.execute(
                    "INSERT INTO chat_messages (id, chat_id, role, content, thought, order_index, swipe_index, swipes_json, created_at, attachments_json)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        id,
                        new_id,
                        role,
                        content,
                        thought,
                        order_index,
                        swipe_index,
                        swipes_json,
                        created_at,
                        serde_json::to_string(&attachments).unwrap_or_else(|_| "[]".into())
                    ],
                )?;
                if bookmarked.contains(&old_id) {
                    tx.execute(
                        "INSERT INTO chat_bookmarks (message_id, chat_id, created_at) VALUES (?1, ?2, ?3)",
                        params![id, new_id, now],
                    )?;
                }
            }
            tx.commit()?;
            new_id
        };
        self.get_chat_session(&new_id)?
            .ok_or(rusqlite::Error::QueryReturnedNoRows)
    }

    /// Bookmarked messages of a chat, in story order. Bookmarks of deleted messages are skipped.
    pub fn list_chat_bookmarks(&self, chat_id: &str) -> Result<Vec<String>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT b.message_id FROM chat_bookmarks b
             JOIN chat_messages m ON m.id = b.message_id
             WHERE b.chat_id = ?1
             ORDER BY m.order_index ASC",
        )?;
        let ids = stmt
            .query_map(params![chat_id], |row| row.get(0))?
            .collect::<Result<Vec<String>, _>>()?;
        Ok(ids)
    }

    pub fn set_chat_bookmark(
        &self,
        chat_id: &str,
        message_id: &str,
        bookmarked: bool,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        if bookmarked {
            conn.execute(
                "INSERT OR IGNORE INTO chat_bookmarks (message_id, chat_id, created_at) VALUES (?1, ?2, ?3)",
                params![message_id, chat_id, current_timestamp()],
            )?;
        } else {
            conn.execute(
                "DELETE FROM chat_bookmarks WHERE message_id = ?1",
                params![message_id],
            )?;
        }
        Ok(())
    }

    pub fn get_chat_messages(
        &self,
        chat_id: &str,
    ) -> Result<Vec<StoredChatMessage>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, chat_id, role, content, thought, order_index, swipe_index, swipes_json, created_at,
                    attachments_json
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
                attachments: parse_attachments(&row.get::<_, String>(9)?),
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
        attachments: &[crate::modules::attachments::Attachment],
    ) -> Result<StoredChatMessage, rusqlite::Error> {
        let conn = self.conn.lock();
        let now = current_timestamp();
        let id = format!("msg_{}_{:08x}", now, rand::random::<u32>());
        let attachments_json = serde_json::to_string(attachments).unwrap_or_else(|_| "[]".into());

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
            "INSERT INTO chat_messages (id, chat_id, role, content, thought, order_index, swipe_index, swipes_json, created_at, attachments_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9)",
            params![id, chat_id, role, content, thought, next_order, swipes_json, now, attachments_json],
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
            attachments: attachments.to_vec(),
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
        discard_stale_summary(&conn, &chat_id, i64::from(order_index))?;
        super::soul::flag_memories_from_messages(&conn, &chat_id, &[msg_id.to_string()])?;

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
            attachments: stored_attachments(&conn, msg_id),
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
        discard_stale_summary(&conn, &chat_id, i64::from(order_index))?;
        super::soul::flag_memories_from_messages(&conn, &chat_id, &[msg_id.to_string()])?;

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
            attachments: stored_attachments(&conn, msg_id),
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
        discard_stale_summary(&conn, &chat_id, i64::from(order_index))?;
        super::soul::flag_memories_from_messages(&conn, &chat_id, &[msg_id.to_string()])?;

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
            attachments: stored_attachments(&conn, msg_id),
        })
    }

    pub fn delete_chat_message(&self, msg_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        let position: Option<(String, i64)> = conn
            .query_row(
                "SELECT chat_id, order_index FROM chat_messages WHERE id = ?1",
                params![msg_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        conn.execute("DELETE FROM chat_messages WHERE id = ?1", params![msg_id])?;
        if let Some((chat_id, order_index)) = position {
            discard_stale_summary(&conn, &chat_id, order_index)?;
            super::soul::flag_memories_from_messages(&conn, &chat_id, &[msg_id.to_string()])?;
        }
        Ok(())
    }

    pub fn delete_messages_after(
        &self,
        chat_id: &str,
        order_index: i32,
    ) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock();
        let removed: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT id FROM chat_messages WHERE chat_id = ?1 AND order_index >= ?2")?;
            stmt.query_map(params![chat_id, order_index], |row| row.get(0))?
                .collect::<Result<_, _>>()?
        };
        conn.execute(
            "DELETE FROM chat_messages WHERE chat_id = ?1 AND order_index >= ?2",
            params![chat_id, order_index],
        )?;
        super::soul::flag_memories_from_messages(&conn, chat_id, &removed)?;
        discard_stale_summary(&conn, chat_id, i64::from(order_index))?;
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
                    self.add_chat_message(&session.id, &role, &content, thought.as_deref(), &[])?;

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

fn parse_attachments(json: &str) -> Vec<crate::modules::attachments::Attachment> {
    serde_json::from_str(json).unwrap_or_default()
}

fn stored_attachments(
    conn: &rusqlite::Connection,
    msg_id: &str,
) -> Vec<crate::modules::attachments::Attachment> {
    conn.query_row(
        "SELECT attachments_json FROM chat_messages WHERE id = ?1",
        params![msg_id],
        |row| row.get::<_, String>(0),
    )
    .map(|json| parse_attachments(&json))
    .unwrap_or_default()
}
