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
    /// Normalized name of the archivist's topic file; a newer version of the same topic
    /// supersedes the older one.
    #[serde(default)]
    pub topic_key: Option<String>,
    /// The memory that replaced this one, if any.
    #[serde(default)]
    pub superseded_by: Option<i64>,
    /// When it was superseded; set = outdated, never part of a prompt.
    #[serde(default)]
    pub superseded_at: Option<u64>,
    /// Why it is outdated (from the reflection; empty for a newer topic version).
    #[serde(default)]
    pub supersede_reason: String,
}

/// One change of an episodic memory, for its history.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MemoryChange {
    /// `created`, `edited`, `forgotten`, `pinned`, `unpinned`, `confirmed`, `source_changed`,
    /// `superseded`, `contradicted` (a protected memory was contradicted), `restored`.
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

/// Something a character or the user means to do: a plan, a promise, an appointment.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IntentionEntry {
    pub id: i64,
    pub character_id: String,
    pub user_name: String,
    pub title: String,
    pub details: String,
    /// `character`, `user` or `both`.
    pub initiator: String,
    /// `real` (bound to the clock) or `story` (time inside the story, never due).
    pub time_basis: String,
    /// `pending`, `fulfilled`, `expired` or `abandoned`.
    pub status: String,
    /// When it is due (`real` only), UNIX seconds; local midnight for a whole day.
    pub due_at: Option<u64>,
    /// `due_at` names a time of day, not only the day.
    pub due_has_time: bool,
    /// `auto` (from a reflection) or `manual`.
    pub origin: String,
    pub source_chat_id: Option<String>,
    pub created_at: u64,
    pub resolved_at: Option<u64>,
    /// The episodic memory it became once resolved.
    pub memory_id: Option<i64>,
}

/// A new or changed intention as the user or a reflection describes it.
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IntentionDraft {
    pub title: String,
    #[serde(default)]
    pub details: String,
    #[serde(default)]
    pub initiator: String,
    #[serde(default)]
    pub time_basis: String,
    #[serde(default)]
    pub due_at: Option<u64>,
    #[serde(default)]
    pub due_has_time: bool,
}

/// An open intention as the prompt shows it; `label` says when it is due, worked out when the
/// prompt is built.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct IntentionPrompt {
    pub label: String,
    pub title: String,
    pub details: String,
    pub initiator: String,
}

/// Memories for one prompt (`select_prompt_memories`).
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct PromptMemories {
    /// Pinned and most significant memories; independent of the conversation.
    pub core: Vec<EpisodicMemory>,
    /// Memories that fit the conversation, filled up with the newest.
    pub relevant: Vec<EpisodicMemory>,
    /// Open intentions and promises, the ones due soonest first.
    #[serde(default)]
    pub intentions: Vec<IntentionPrompt>,
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
    /// Look and sound of this chat; `None` = the app's defaults.
    #[serde(default)]
    #[ts(optional)]
    pub style: Option<ChatStyle>,
    /// Invited characters of a group chat (IDs, without the chat's own character).
    #[serde(default)]
    pub members: Vec<String>,
}

/// Per-chat look and sound. Pictures and sounds come from the Stage library
/// (`list_stage_assets`), so both views share imported files.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, TS)]
#[serde(default)]
#[ts(export)]
pub struct ChatStyle {
    /// Background picture (file name in the Stage backgrounds).
    pub background: Option<String>,
    /// Darkening over the picture for legible text, 0–90 (%).
    pub background_dim: u8,
    /// `small`, `normal` (empty) or `large`.
    pub text_size: String,
    /// Message bubbles: `default` (empty), `subtle` or `contrast`.
    pub bubbles: String,
    /// Looping background sound (file name in the Stage ambient sounds).
    pub ambient: Option<String>,
    /// 0–100 (%).
    pub ambient_volume: u8,
    /// How long replies should be: `short`, `medium`, `long` or empty (as the prompt template says).
    pub reply_length: String,
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
    /// Character that wrote an assistant message in a group chat; empty = the chat's character.
    #[serde(default)]
    pub speaker_id: String,
}
