//! Records stored in the soul memory database and exchanged with the frontend.

use super::*;

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
    "Keine.".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryBackupInfo {
    pub filename: String,
    pub timestamp: u64,
    pub date_formatted: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryBackupSnapshot {
    pub character_id: String,
    pub created_at: u64,
    pub psychology: PsychologyState,
    pub relationship: Option<RelationshipState>,
    pub episodic_memories: Vec<EpisodicMemory>,
    pub diary_entries: Vec<DiaryEntry>,
    pub healing_logs: Vec<HealingLogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpisodicMemory {
    pub id: i64,
    pub category: String, // "event", "fact", "location", "secret", "promise"
    pub content: String,
    pub significance: u32, // 1..5
    pub created_at: u64,
    pub last_accessed_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryEntry {
    pub id: i64,
    pub title: String,
    pub entry_text: String,
    pub mood: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealingLogEntry {
    pub id: i64,
    pub action: String,
    pub details: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveOverview {
    pub psychology: PsychologyState,
    pub relationship: RelationshipState,
    pub recent_memories: Vec<EpisodicMemory>,
    pub recent_diary: Vec<DiaryEntry>,
    pub healing_logs: Vec<HealingLogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub character_id: String,
    pub title: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub author_note: String,
    pub author_note_depth: u32,
    pub message_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SwipeVariant {
    pub content: String,
    pub thought: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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
}
