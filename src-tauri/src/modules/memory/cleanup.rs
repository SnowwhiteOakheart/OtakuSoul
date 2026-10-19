//! Tidying up the memory on request: groups of overlapping memories become one summary. The
//! old ones are superseded, not deleted, so every merge can be taken back.

use super::soul::{EPISODIC_COLUMNS, episodic_from_row};
use super::*;
use crate::modules::context_window::estimate_tokens;
use ts_rs::TS;

/// Memory text one cleanup proposal may look at.
pub const CLEANUP_TOKENS: usize = 6000;

/// Memories that become one, as proposed by the model and confirmed (or edited) by the user.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CleanupGroup {
    pub memory_ids: Vec<i64>,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub title: String,
    pub summary: String,
}

/// A cleanup proposal: the groups and the memories they merge.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CleanupProposal {
    pub groups: Vec<CleanupGroup>,
    pub sources: Vec<EpisodicMemory>,
}

fn protected(memory: &EpisodicMemory) -> bool {
    memory.pinned || memory.origin == "manual" || memory.origin == "edited"
}

impl MemoryDb {
    /// Active memories a cleanup may merge (never pinned or user-made ones), newest first,
    /// within about `budget_tokens`.
    pub fn cleanup_candidates(
        &self,
        char_id: &str,
        budget_tokens: usize,
    ) -> Result<Vec<EpisodicMemory>, rusqlite::Error> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(&format!(
            "SELECT {EPISODIC_COLUMNS} FROM soul_episodic_memory
             WHERE character_id = ?1 AND superseded_at IS NULL
             ORDER BY created_at DESC, id DESC"
        ))?;
        let all: Vec<EpisodicMemory> = stmt
            .query_map(params![char_id], episodic_from_row)?
            .collect::<Result<_, _>>()?;
        let mut used = 0;
        let mut picked = Vec::new();
        for memory in all.into_iter().filter(|m| !protected(m)) {
            let cost = estimate_tokens(&memory.content) + 8;
            if used + cost > budget_tokens {
                break;
            }
            used += cost;
            picked.push(memory);
        }
        Ok(picked)
    }

    /// Writes confirmed groups in one transaction: one new memory per group, the merged ones
    /// superseded by it. Ids that are not active, foreign or protected are skipped; a group
    /// with fewer than two left changes nothing. Returns the number of merged groups.
    pub fn apply_memory_cleanup(
        &self,
        char_id: &str,
        groups: &[CleanupGroup],
    ) -> Result<usize, rusqlite::Error> {
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        let lang = crate::modules::content_lang::ContentLang::current();
        let mut merged = 0;
        let mut used = std::collections::HashSet::new();
        for group in groups {
            let summary = group.summary.trim();
            if summary.is_empty() {
                continue;
            }
            let mut sources = Vec::new();
            for id in &group.memory_ids {
                if !used.insert(*id) {
                    continue;
                }
                let memory = tx
                    .query_row(
                        &format!(
                            "SELECT {EPISODIC_COLUMNS} FROM soul_episodic_memory
                             WHERE id = ?1 AND character_id = ?2 AND superseded_at IS NULL"
                        ),
                        params![id, char_id],
                        episodic_from_row,
                    )
                    .optional()?;
                if let Some(memory) = memory.filter(|m| !protected(m)) {
                    sources.push(memory);
                }
            }
            if sources.len() < 2 {
                continue;
            }
            let category = match group.category.trim() {
                "" => sources[0].category.clone(),
                category => category.to_lowercase(),
            };
            let topic_key = (category == "topic")
                .then(|| normalize_topic_key(&group.title))
                .flatten();
            let text = match &topic_key {
                Some(_) => format!("[{}: {}]\n{}", lang.t("Topic"), group.title.trim(), summary),
                None => summary.to_string(),
            };
            let significance = sources.iter().map(|m| m.significance).max().unwrap_or(3);
            let id = Self::add_episodic_memory_sourced_on(
                &tx,
                char_id,
                &category,
                &text,
                significance,
                &MemorySource::auto(),
            )?;
            if topic_key.is_some() {
                tx.execute(
                    "UPDATE soul_episodic_memory SET topic_key = ?1 WHERE id = ?2",
                    params![topic_key, id],
                )?;
            }
            for source in sources.iter().filter(|m| m.id != id) {
                Self::supersede_memory_on(&tx, char_id, source.id, Some(id), "")?;
            }
            merged += 1;
        }
        tx.commit()?;
        Ok(merged)
    }
}

/// Keeps the groups of a model's answer that merge at least two known memories, each memory
/// in one group only.
pub fn valid_cleanup_groups(groups: Vec<CleanupGroup>, known: &[i64]) -> Vec<CleanupGroup> {
    let mut used = std::collections::HashSet::new();
    groups
        .into_iter()
        .filter_map(|mut group| {
            let mut ids = Vec::new();
            for id in group.memory_ids {
                if known.contains(&id) && !used.contains(&id) && !ids.contains(&id) {
                    ids.push(id);
                }
            }
            group.summary = group.summary.trim().to_string();
            group.title = group.title.trim().to_string();
            if ids.len() < 2 || group.summary.is_empty() {
                return None;
            }
            used.extend(ids.iter().copied());
            group.memory_ids = ids;
            Some(group)
        })
        .collect()
}
