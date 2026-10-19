//! Recalling episodic memories that fit the conversation (full-text index, no model call).

use super::soul::{EPISODIC_COLUMN_COUNT, EPISODIC_COLUMNS, episodic_from_row};
use super::*;
use crate::modules::context_window::estimate_tokens;

/// How much memory text a prompt may hold.
#[derive(Debug, Clone, Copy)]
pub struct MemoryBudget {
    pub tokens: usize,
    /// Characters of each memory the prompt shows (the router shortens long ones).
    pub shown_chars: usize,
}

/// Memories in a chat prompt (shown in full).
pub const PROMPT_MEMORY_BUDGET: MemoryBudget = MemoryBudget {
    tokens: 1500,
    shown_chars: usize::MAX,
};
/// Search terms taken from one text at most.
const MAX_QUERY_TERMS: usize = 24;
/// Memories in the stable part besides the pinned ones.
const CORE_UNPINNED: usize = 5;
/// Memories in the part that follows the conversation.
const MAX_RELEVANT: usize = 10;

/// Frequent words that say nothing about a topic (German, English, Russian; three letters or more).
const STOPWORDS: &[&str] = &[
    // German
    "und",
    "oder",
    "aber",
    "nicht",
    "kein",
    "keine",
    "der",
    "die",
    "das",
    "den",
    "dem",
    "des",
    "ein",
    "eine",
    "einen",
    "einem",
    "einer",
    "ich",
    "mich",
    "mir",
    "dich",
    "dir",
    "sie",
    "ihr",
    "wir",
    "uns",
    "euch",
    "ist",
    "bin",
    "bist",
    "sind",
    "war",
    "hat",
    "habe",
    "hast",
    "haben",
    "wird",
    "werden",
    "auch",
    "noch",
    "schon",
    "nur",
    "mit",
    "von",
    "für",
    "auf",
    "aus",
    "bei",
    "nach",
    "zum",
    "zur",
    "wie",
    "was",
    "wer",
    "wann",
    "warum",
    "dass",
    "wenn",
    "dann",
    "denn",
    "doch",
    "mal",
    "ganz",
    "sehr",
    "hier",
    "dort",
    "jetzt",
    "also",
    "kann",
    "will",
    "soll",
    "muss",
    "mein",
    "meine",
    "dein",
    "deine",
    "sein",
    "seine",
    "ihre",
    "diese",
    "dieser",
    "dieses",
    "etwas",
    "einfach",
    "gerne",
    "gern",
    "okay",
    "naja",
    "nein",
    // English
    "the",
    "and",
    "but",
    "not",
    "you",
    "your",
    "are",
    "was",
    "were",
    "have",
    "has",
    "had",
    "that",
    "this",
    "with",
    "for",
    "from",
    "what",
    "who",
    "how",
    "why",
    "when",
    "where",
    "can",
    "will",
    "would",
    "just",
    "really",
    "very",
    "she",
    "her",
    "his",
    "him",
    "they",
    "them",
    "our",
    "out",
    "about",
    "there",
    "then",
    "than",
    "yes",
    "okay",
    // Russian
    "это",
    "что",
    "как",
    "так",
    "его",
    "она",
    "они",
    "мне",
    "меня",
    "тебя",
    "тебе",
    "мой",
    "моя",
    "твой",
    "твоя",
    "все",
    "всё",
    "еще",
    "ещё",
    "уже",
    "для",
    "или",
    "нет",
    "был",
    "была",
    "было",
    "есть",
    "только",
    "очень",
    "тоже",
    "когда",
    "где",
    "почему",
    "который",
    "которая",
];

/// Turns free text into a safe FTS5 query: distinct words of three letters or more without
/// filler words, each quoted, joined with OR. `None` when nothing searchable is left.
pub(crate) fn fts_query(text: &str) -> Option<String> {
    let mut terms: Vec<String> = Vec::new();
    for word in text.split(|c: char| !c.is_alphanumeric()) {
        let word = word.to_lowercase();
        if word.chars().count() < 3 || STOPWORDS.contains(&word.as_str()) || terms.contains(&word) {
            continue;
        }
        terms.push(word);
        if terms.len() == MAX_QUERY_TERMS {
            break;
        }
    }
    if terms.is_empty() {
        return None;
    }
    // Words hold only letters and digits, so quoting needs no escaping.
    Some(
        terms
            .iter()
            .map(|t| format!("\"{t}\""))
            .collect::<Vec<_>>()
            .join(" OR "),
    )
}

fn prefixed_columns() -> String {
    EPISODIC_COLUMNS
        .split(',')
        .map(|c| format!("m.{}", c.trim()))
        .collect::<Vec<_>>()
        .join(", ")
}

impl MemoryDb {
    /// Memories that fit `text` best, best first, with their BM25 score (lower is better).
    pub(super) fn search_episodic_memories_on(
        conn: &Connection,
        char_id: &str,
        text: &str,
        limit: usize,
    ) -> Result<Vec<(EpisodicMemory, f64)>, rusqlite::Error> {
        let Some(query) = fts_query(text) else {
            return Ok(Vec::new());
        };
        let mut stmt = conn.prepare(&format!(
            "SELECT {}, bm25(soul_episodic_memory_fts) AS score
             FROM soul_episodic_memory_fts JOIN soul_episodic_memory m ON m.id = soul_episodic_memory_fts.rowid
             WHERE soul_episodic_memory_fts MATCH ?1 AND m.character_id = ?2 AND m.superseded_at IS NULL
             ORDER BY score LIMIT ?3",
            prefixed_columns()
        ))?;
        let rows = stmt.query_map(params![query, char_id, limit as i64], |row| {
            Ok((
                episodic_from_row(row)?,
                row.get::<_, f64>(EPISODIC_COLUMN_COUNT)?,
            ))
        })?;
        rows.collect()
    }

    /// Full-text search in the memories of a character (memory drawer).
    pub fn search_episodic_memories(
        &self,
        char_id: &str,
        text: &str,
        limit: usize,
    ) -> Result<Vec<EpisodicMemory>, rusqlite::Error> {
        let conn = self.conn.lock();
        Ok(
            Self::search_episodic_memories_on(&conn, char_id, text, limit)?
                .into_iter()
                .map(|(memory, _)| memory)
                .collect(),
        )
    }

    /// The memories for a prompt within about `budget.tokens`: a stable core (all pinned ones
    /// and the most significant) and the ones that fit `text`, filled up with the newest.
    pub fn select_prompt_memories(
        &self,
        char_id: &str,
        text: &str,
        budget: MemoryBudget,
    ) -> Result<PromptMemories, rusqlite::Error> {
        let conn = self.conn.lock();
        let budget_tokens = budget.tokens;
        let cost = |m: &EpisodicMemory| {
            let shown: String = m.content.chars().take(budget.shown_chars).collect();
            estimate_tokens(&shown) + 4
        };
        let mut used = 0;

        // 1. Core: independent of the conversation, so the system prompt stays the same.
        let mut stmt = conn.prepare(&format!(
            "SELECT {EPISODIC_COLUMNS} FROM soul_episodic_memory
             WHERE character_id = ?1 AND superseded_at IS NULL
             ORDER BY pinned DESC, significance DESC, created_at DESC, id DESC"
        ))?;
        let ranked: Vec<EpisodicMemory> = stmt
            .query_map(params![char_id], episodic_from_row)?
            .collect::<Result<_, _>>()?;
        let mut core = Vec::new();
        let mut unpinned = 0;
        for memory in &ranked {
            if memory.pinned {
                used += cost(memory);
                core.push(memory.clone());
            } else if unpinned < CORE_UNPINNED && used + cost(memory) <= budget_tokens / 2 {
                used += cost(memory);
                unpinned += 1;
                core.push(memory.clone());
            }
        }

        // 2. Fitting the conversation; slightly prefer significant memories.
        let mut hits = Self::search_episodic_memories_on(&conn, char_id, text, MAX_RELEVANT * 3)?;
        hits.retain(|(m, _)| !core.iter().any(|c| c.id == m.id));
        let weigh = |(m, score): &(EpisodicMemory, f64)| {
            if m.significance >= 4 {
                score * 1.15
            } else {
                *score
            }
        };
        hits.sort_by(|a, b| weigh(a).total_cmp(&weigh(b)));
        let mut relevant = Vec::new();
        for (memory, _) in hits {
            if relevant.len() == MAX_RELEVANT {
                break;
            }
            if used + cost(&memory) <= budget_tokens {
                used += cost(&memory);
                relevant.push(memory);
            }
        }
        let now = current_timestamp();
        for memory in &relevant {
            conn.execute(
                "UPDATE soul_episodic_memory SET last_accessed_at = ?1 WHERE id = ?2",
                params![now, memory.id],
            )?;
        }

        // 3. Fill up with the newest.
        let mut newest: Vec<&EpisodicMemory> = ranked.iter().collect();
        newest.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
        for memory in newest {
            if relevant.len() == MAX_RELEVANT {
                break;
            }
            let taken = core.iter().chain(&relevant).any(|m| m.id == memory.id);
            if !taken && used + cost(memory) <= budget_tokens {
                used += cost(memory);
                relevant.push(memory.clone());
            }
        }

        Ok(PromptMemories {
            core,
            relevant,
            intentions: Vec::new(),
        })
    }
}
