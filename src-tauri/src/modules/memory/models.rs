//! Records stored in the soul memory database and exchanged with the frontend.

use super::*;
use ts_rs::TS;

pub(super) fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub(super) fn default_role_in_story() -> String {
    "User".to_string()
}

pub(super) fn default_none() -> String {
    crate::modules::content_lang::ContentLang::current()
        .none_marker()
        .to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MemoryBackupInfo {
    pub filename: String,
    pub timestamp: u64,
    pub date_formatted: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MemoryBackupSnapshot {
    pub character_id: String,
    pub created_at: u64,
    pub psychology: PsychologyState,
    pub relationship: Option<RelationshipState>,
    pub episodic_memories: Vec<EpisodicMemory>,
    pub diary_entries: Vec<DiaryEntry>,
    pub healing_logs: Vec<HealingLogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EpisodicMemory {
    pub id: i64,
    pub category: String, // "event", "fact", "location", "secret", "promise"
    pub content: String,
    pub significance: u32, // 1..5
    pub created_at: u64,
    pub last_accessed_at: u64,
    /// Chat the memory was learned from, if any.
    #[serde(default)]
    pub source_chat_id: Option<String>,
    /// Messages of that chat it was learned from.
    #[serde(default)]
    pub source_message_ids: Vec<String>,
    /// `auto` (derived by the model), `manual` (added by the user), `edited` (corrected by the
    /// user, so confirmed) or empty for memories from before sources were kept.
    #[serde(default)]
    pub origin: String,
    /// Always part of the memory context and never changed automatically.
    #[serde(default)]
    pub pinned: bool,
    /// A source message was edited or deleted since; the user should check it.
    #[serde(default)]
    pub needs_review: bool,
}

/// One change of an episodic memory, for its history.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MemoryChange {
    /// `created`, `edited`, `forgotten`, `pinned`, `unpinned`, `confirmed`, `source_changed`.
    pub action: String,
    pub content_before: String,
    pub content_after: String,
    pub at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DiaryEntry {
    pub id: i64,
    pub title: String,
    pub entry_text: String,
    pub mood: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HealingLogEntry {
    pub id: i64,
    pub action: String,
    pub details: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CognitiveOverview {
    pub psychology: PsychologyState,
    pub relationship: RelationshipState,
    pub recent_memories: Vec<EpisodicMemory>,
    pub recent_diary: Vec<DiaryEntry>,
    pub healing_logs: Vec<HealingLogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ChatSession {
    pub id: String,
    pub character_id: String,
    pub title: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub author_note: String,
    pub author_note_depth: u32,
    pub message_count: usize,
    /// Running summary of the messages that no longer fit into the context window.
    pub summary: String,
    /// `order_index` of the last message the summary covers; -1 for none.
    pub summary_until: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct SwipeVariant {
    pub content: String,
    pub thought: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    /// Files the user attached (images, text, PDF).
    #[serde(default)]
    pub attachments: Vec<crate::modules::attachments::Attachment>,
}
