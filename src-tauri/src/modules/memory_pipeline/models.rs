use crate::modules::memory::{DiaryEntry, PsychologyState, RelationshipState};
use crate::modules::providers::LlmProviderType;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SoulMemoryPipelineRequest {
    pub character_id: String,
    pub user_name: String,
    #[serde(default)]
    pub chat_id: Option<String>,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<LlmProviderType>,
    #[serde(default)]
    pub recent_turn_count: Option<usize>,
    #[serde(default)]
    pub include_diary: Option<bool>,
    /// Already formatted dialogue to learn from instead of the chat (e.g. a Soul Stage scene,
    /// filtered to what this character witnessed).
    #[serde(default)]
    #[ts(optional)]
    pub transcript: Option<String>,
    /// Group chat: names by speaker ID ('' = the chat's own character). The transcript then
    /// says who spoke instead of "user"/"assistant".
    #[serde(default)]
    #[ts(optional)]
    pub speaker_names: Option<std::collections::HashMap<String, String>>,
}

pub type MemoryPipelineRequest = SoulMemoryPipelineRequest;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SoulMemoryPipelineResult {
    pub no_change: bool,
    pub character_id: String,
    pub psychology: PsychologyState,
    pub relationship: RelationshipState,
    pub topics_processed: Vec<String>,
    pub diary_entry: Option<DiaryEntry>,
    pub healing_entries: Vec<String>,
    /// Memories found contradicted: retired, or flagged for review when protected.
    #[serde(default)]
    pub contradicted_memories: usize,
}

pub type MemoryPipelineResult = SoulMemoryPipelineResult;

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterInternalStatePatch {
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub primary_emotion: Option<String>,
    #[serde(default, deserialize_with = "super::json::lenient::opt_u32")]
    pub intensity: Option<u32>,
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub psychological_tension: Option<String>,
    #[serde(default, deserialize_with = "super::json::lenient::opt_bool")]
    pub emotion_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterCognitiveDrivePatch {
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub active_agenda: Option<String>,
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub immediate_focus: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterCharacterMemoryPatch {
    #[serde(default, deserialize_with = "super::json::lenient::text_list")]
    pub core_identity_add: Vec<String>,
    #[serde(default, deserialize_with = "super::json::lenient::text_list")]
    pub core_identity_remove: Vec<String>,
    pub internal_state: Option<RouterInternalStatePatch>,
    pub cognitive_drive: Option<RouterCognitiveDrivePatch>,
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub cognitive_dissonance: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterUserIdentityPatch {
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub role_in_story: Option<String>,
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub known_attributes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterRelationshipMetadataPatch {
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub trust_level: Option<String>,
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub dynamic_description: Option<String>,
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub unspoken_tension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterUserMemoryPatch {
    pub user_identity_status: Option<RouterUserIdentityPatch>,
    pub relationship_metadata: Option<RouterRelationshipMetadataPatch>,
    #[serde(default, deserialize_with = "super::json::lenient::text_list")]
    pub preferences_habits_add: Vec<String>,
    #[serde(default, deserialize_with = "super::json::lenient::text_list")]
    pub preferences_habits_remove: Vec<String>,
    /// The whole list, merged; only accepted when the router was asked to consolidate.
    #[serde(default, deserialize_with = "super::json::lenient::text_list")]
    pub preferences_habits_replace: Vec<String>,
    #[serde(default, deserialize_with = "super::json::lenient::text_list")]
    pub shared_milestones_promises_add: Vec<String>,
    #[serde(default, deserialize_with = "super::json::lenient::text_list")]
    pub shared_milestones_promises_remove: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TopicAction {
    #[serde(default, deserialize_with = "super::json::lenient::text")]
    pub action: String, // "create" | "update"
    #[serde(default, deserialize_with = "super::json::lenient::text")]
    pub filename: String,
    #[serde(default, deserialize_with = "super::json::lenient::text")]
    pub summary: String,
    /// 1..5, how much the topic matters for who someone is; missing → previous or default.
    #[serde(default, deserialize_with = "super::json::lenient::opt_u32")]
    pub significance: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct TopicPlan {
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub reasoning: Option<String>,
    #[serde(default)]
    pub actions: Vec<TopicAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterResponse {
    #[serde(default, deserialize_with = "super::json::lenient::opt_bool")]
    pub no_significant_change: Option<bool>,
    pub character_memory_patch: Option<RouterCharacterMemoryPatch>,
    pub user_memory_patch: Option<RouterUserMemoryPatch>,
    #[serde(default, deserialize_with = "super::json::lenient::text_list")]
    pub healing_log_add: Vec<String>,
    pub topic_plan: Option<TopicPlan>,
    #[serde(default)]
    pub memory_supersede: Vec<RouterMemorySupersede>,
    pub intentions_patch: Option<RouterIntentionsPatch>,
}

/// New and resolved intentions as the router writes them.
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterIntentionsPatch {
    #[serde(default)]
    pub create: Vec<RouterIntentionCreate>,
    #[serde(default)]
    pub resolve: Vec<RouterIntentionResolve>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterIntentionCreate {
    #[serde(default, deserialize_with = "super::json::lenient::text")]
    pub title: String,
    #[serde(default, deserialize_with = "super::json::lenient::text")]
    pub details: String,
    #[serde(default, deserialize_with = "super::json::lenient::text")]
    pub initiator: String,
    #[serde(default, deserialize_with = "super::json::lenient::text")]
    pub time_basis: String,
    /// `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (local time).
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub due: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterIntentionResolve {
    #[serde(default, deserialize_with = "super::json::lenient::id")]
    pub id: i64,
    #[serde(default, deserialize_with = "super::json::lenient::text")]
    pub status: String,
}

/// A memory the router found outdated.
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterMemorySupersede {
    #[serde(default, deserialize_with = "super::json::lenient::id")]
    pub id: i64,
    #[serde(default, deserialize_with = "super::json::lenient::text")]
    pub reason: String,
    #[serde(default, deserialize_with = "super::json::lenient::opt_text")]
    pub replaced_by_topic: Option<String>,
}
