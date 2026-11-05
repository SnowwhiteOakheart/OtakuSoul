//! Relationship atlas: the memory of a character as a graph. Beliefs (identity, habits,
//! milestones, trust, tension, agenda) are linked to the experiences that fit them; experiences
//! to diary entries and plans. Stored links (a plan that became a memory, a newer version of a
//! memory) are facts; the others come from the full-text index and are marked as inferred.

use super::recall::query_terms;
use super::soul::{EPISODIC_COLUMNS, episodic_from_row};
use super::*;
use ts_rs::TS;

/// Memories shown at most (pinned and most significant first).
const ATLAS_MAX_MEMORIES: usize = 150;
/// Diary entries shown at most (newest first).
const ATLAS_MAX_DIARY: usize = 60;
/// Inferred experiences per belief, diary entry and plan.
const LINKS_PER_BELIEF: usize = 3;
const LINKS_PER_DIARY: usize = 2;
const LINKS_PER_INTENTION: usize = 2;
/// Text of a long diary entry looked at for its links.
const QUERY_CHARS: usize = 400;

/// One point of the atlas.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AtlasNode {
    /// Unique in the atlas: `identity:0`, `memory:12`, `diary:3`, `intention:4` …
    pub id: String,
    /// `identity`, `habit`, `milestone`, `trust`, `tension`, `agenda` (beliefs),
    /// `memory`, `diary` or `intention`.
    pub kind: String,
    pub text: String,
    /// Memory category, diary mood or intention status.
    pub tag: String,
    /// When it happened (memories, diary entries, plans), UNIX seconds.
    pub at: Option<u64>,
    /// 1–5: the significance of a memory, 3 otherwise.
    pub weight: u32,
    pub pinned: bool,
    /// An outdated memory (only with `include_superseded`).
    pub superseded: bool,
    /// The memory id behind a `memory` node.
    pub memory_id: Option<i64>,
    /// Chat and last message a memory was learned from (to jump there or branch off).
    pub chat_id: Option<String>,
    pub message_id: Option<String>,
}

/// A link between two points; `from` is the earlier/causing one.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AtlasEdge {
    pub from: String,
    pub to: String,
    /// `shaped` (experience → belief), `reflects` (experience → diary), `about`
    /// (experience → plan), `became` (plan → its memory), `replaced` (old → new version).
    pub kind: String,
    /// Found by matching words, not stored.
    pub inferred: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MemoryAtlas {
    pub nodes: Vec<AtlasNode>,
    pub edges: Vec<AtlasEdge>,
    /// Memories left out because of `ATLAS_MAX_MEMORIES`.
    pub hidden_memories: usize,
}

/// Placeholder texts the memory uses for "nothing" (all content languages).
fn is_blank(text: &str, none: &str) -> bool {
    let t = text.trim().trim_end_matches('.').trim().to_lowercase();
    t.is_empty()
        || t == none.trim().trim_end_matches('.').to_lowercase()
        || matches!(t.as_str(), "keine" | "none" | "нет" | "なし" | "-" | "[]")
}

fn belief(kind: &str, index: usize, text: &str) -> AtlasNode {
    AtlasNode {
        id: format!("{kind}:{index}"),
        kind: kind.to_string(),
        text: text.trim().to_string(),
        tag: String::new(),
        at: None,
        weight: 3,
        pinned: false,
        superseded: false,
        memory_id: None,
        chat_id: None,
        message_id: None,
    }
}

impl MemoryDb {
    /// The memory of `char_id` towards `user_name` as a graph (memory drawer, "Atlas").
    pub fn get_memory_atlas(
        &self,
        char_id: &str,
        user_name: &str,
        include_superseded: bool,
    ) -> Result<MemoryAtlas, rusqlite::Error> {
        let conn = self.conn.lock();
        let none = crate::modules::content_lang::ContentLang::current().none_marker();
        let psychology = Self::get_or_create_psychology_on(&conn, char_id)?;
        let relationship = Self::get_or_create_relationship_on(&conn, char_id, user_name)?;

        let mut nodes = Vec::new();
        let mut beliefs: Vec<(String, String)> = Vec::new();
        let mut add_belief = |kind: &str, index: usize, text: &str| {
            if !is_blank(text, &none) {
                let node = belief(kind, index, text);
                beliefs.push((node.id.clone(), node.text.clone()));
                nodes.push(node);
            }
        };
        for (i, text) in psychology.core_identity.iter().enumerate() {
            add_belief("identity", i, text);
        }
        for (i, text) in relationship.preferences_habits.iter().enumerate() {
            add_belief("habit", i, text);
        }
        for (i, text) in relationship.shared_milestones.iter().enumerate() {
            add_belief("milestone", i, text);
        }
        let trust = if is_blank(&relationship.dynamic_description, &none) {
            relationship.trust_level.clone()
        } else {
            format!(
                "{}: {}",
                relationship.trust_level.trim(),
                relationship.dynamic_description.trim()
            )
        };
        add_belief("trust", 0, &trust);
        add_belief("tension", 0, &relationship.unspoken_tension);
        add_belief("agenda", 0, &psychology.active_agenda);

        // Experiences: pinned and most significant first, so a long memory keeps what matters.
        let memories: Vec<EpisodicMemory> = conn
            .prepare(&format!(
                "SELECT {EPISODIC_COLUMNS} FROM soul_episodic_memory
                 WHERE character_id = ?1 AND (?2 OR superseded_at IS NULL)
                 ORDER BY pinned DESC, significance DESC, created_at DESC, id DESC LIMIT ?3"
            ))?
            .query_map(
                params![char_id, include_superseded, ATLAS_MAX_MEMORIES as i64],
                episodic_from_row,
            )?
            .collect::<Result<_, _>>()?;
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM soul_episodic_memory
             WHERE character_id = ?1 AND (?2 OR superseded_at IS NULL)",
            params![char_id, include_superseded],
            |row| row.get(0),
        )?;
        let shown: std::collections::HashMap<i64, &EpisodicMemory> =
            memories.iter().map(|m| (m.id, m)).collect();
        for m in &memories {
            nodes.push(AtlasNode {
                id: format!("memory:{}", m.id),
                kind: "memory".into(),
                text: m.content.clone(),
                tag: m.category.clone(),
                at: Some(m.created_at),
                weight: m.significance.clamp(1, 5),
                pinned: m.pinned,
                superseded: m.superseded_at.is_some(),
                memory_id: Some(m.id),
                chat_id: m.source_chat_id.clone(),
                message_id: m.source_message_ids.last().cloned(),
            });
        }

        let diary: Vec<DiaryEntry> = conn
            .prepare(
                "SELECT id, title, entry_text, mood, created_at FROM soul_diary
                 WHERE character_id = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2",
            )?
            .query_map(params![char_id, ATLAS_MAX_DIARY as i64], |row| {
                Ok(DiaryEntry {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    entry_text: row.get(2)?,
                    mood: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        for d in &diary {
            nodes.push(AtlasNode {
                id: format!("diary:{}", d.id),
                kind: "diary".into(),
                text: format!("{}\n{}", d.title.trim(), d.entry_text.trim()),
                tag: d.mood.clone(),
                at: Some(d.created_at),
                weight: 3,
                pinned: false,
                superseded: false,
                memory_id: None,
                chat_id: None,
                message_id: None,
            });
        }

        let intentions = Self::list_intentions_on(&conn, char_id, user_name, true)?;
        for i in &intentions {
            nodes.push(AtlasNode {
                id: format!("intention:{}", i.id),
                kind: "intention".into(),
                text: if i.details.trim().is_empty() {
                    i.title.clone()
                } else {
                    format!("{} – {}", i.title.trim(), i.details.trim())
                },
                tag: i.status.clone(),
                at: Some(i.created_at),
                weight: 3,
                pinned: false,
                superseded: false,
                memory_id: None,
                chat_id: i.source_chat_id.clone(),
                message_id: None,
            });
        }

        let mut edges = Vec::new();
        // Inferred: the shown active experiences whose words fit `text` best.
        let fitting = |text: &str, limit: usize| -> Result<Vec<i64>, rusqlite::Error> {
            let text: String = text.chars().take(QUERY_CHARS).collect();
            let terms = query_terms(&text);
            // One shared word is a coincidence in a long text, not in a short belief.
            let needed = if terms.len() <= 3 { 1 } else { 2 };
            Ok(
                Self::search_episodic_memories_on(&conn, char_id, &text, limit * 3)?
                    .into_iter()
                    .filter(|(m, _)| shown.contains_key(&m.id))
                    .filter(|(m, _)| {
                        let content = m.content.to_lowercase();
                        terms
                            .iter()
                            .filter(|t| content.contains(t.as_str()))
                            .count()
                            >= needed
                    })
                    .map(|(m, _)| m.id)
                    .take(limit)
                    .collect(),
            )
        };
        for (id, text) in &beliefs {
            for memory in fitting(text, LINKS_PER_BELIEF)? {
                edges.push(AtlasEdge {
                    from: format!("memory:{memory}"),
                    to: id.clone(),
                    kind: "shaped".into(),
                    inferred: true,
                });
            }
        }
        for d in &diary {
            for memory in fitting(&d.entry_text, LINKS_PER_DIARY)? {
                edges.push(AtlasEdge {
                    from: format!("memory:{memory}"),
                    to: format!("diary:{}", d.id),
                    kind: "reflects".into(),
                    inferred: true,
                });
            }
        }
        for i in &intentions {
            if let Some(memory) = i.memory_id.filter(|m| shown.contains_key(m)) {
                edges.push(AtlasEdge {
                    from: format!("intention:{}", i.id),
                    to: format!("memory:{memory}"),
                    kind: "became".into(),
                    inferred: false,
                });
            }
            let text = format!("{} {}", i.title, i.details);
            for memory in fitting(&text, LINKS_PER_INTENTION)? {
                if Some(memory) == i.memory_id {
                    continue;
                }
                edges.push(AtlasEdge {
                    from: format!("memory:{memory}"),
                    to: format!("intention:{}", i.id),
                    kind: "about".into(),
                    inferred: true,
                });
            }
        }
        for m in &memories {
            if let Some(by) = m.superseded_by.filter(|by| shown.contains_key(by)) {
                edges.push(AtlasEdge {
                    from: format!("memory:{}", m.id),
                    to: format!("memory:{by}"),
                    kind: "replaced".into(),
                    inferred: false,
                });
            }
        }

        Ok(MemoryAtlas {
            nodes,
            edges,
            hidden_memories: (total.max(0) as usize).saturating_sub(memories.len()),
        })
    }
}
