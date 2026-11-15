//! Projektionen fertig ausgewählter Promptdaten, keine Datenbank oder Auswahlpipeline.
use crate::{GroupMember, PromptTemplate, StateVariable};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Context {
    pub char_name: String,
    pub user_name: String,
    pub character: Character,
    /// Nur für den Systemteil passend lokalisierte Karte; Post-History behält die Originalkarte.
    pub system_character: Option<Character>,
    pub active_lore: Vec<LoreEntry>,
    pub active_directives: Vec<LoreEntry>,
    pub state_variables: Vec<StateVariable>,
    pub cognitive: Option<Cognitive>,
    pub memories: Option<PromptMemories>,
    pub reply_language: Option<String>,
    pub allow_reasoning: Option<bool>,
    pub author_note: Option<String>,
    pub author_note_depth: Option<u32>,
    pub chat_summary: Option<String>,
    pub template: Option<PromptTemplate>,
    pub macro_seed: Option<String>,
    pub idle_seconds: Option<u64>,
    pub reply_length: Option<String>,
    pub avoid_phrases: Option<Vec<String>>,
    pub group: Option<Vec<GroupMember>>,
    pub emotion_tags: Option<bool>,
    pub avatar_moods: Option<bool>,
}

/// Die für die Darstellung gebrauchten Kartenfelder, keine Karten-I/O-Logik.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Character {
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    #[serde(alias = "example_messages", alias = "example_dialogs")]
    pub mes_example: String,
    pub system_prompt: Option<String>,
    pub post_history_instructions: Option<String>,
    pub extensions: serde_json::Value,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct LoreEntry {
    pub name: String,
    pub content: String,
    pub injection_behavior: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Memory {
    pub category: String,
    pub content: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Intention {
    pub label: String,
    pub title: String,
    pub details: String,
    pub initiator: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct PromptMemories {
    pub core: Vec<Memory>,
    pub relevant: Vec<Memory>,
    pub intentions: Vec<Intention>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Psychology {
    pub core_identity: Vec<String>,
    pub primary_emotion: String,
    pub intensity: u32,
    pub psychological_tension: String,
    pub active_agenda: String,
    pub immediate_focus: String,
    pub cognitive_dissonance: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Relationship {
    pub role_in_story: String,
    pub known_attributes: String,
    pub trust_level: String,
    pub dynamic_description: String,
    pub unspoken_tension: String,
    pub preferences_habits: Vec<String>,
    pub shared_milestones: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Cognitive {
    pub psychology: Psychology,
    pub relationship: Relationship,
    pub recent_memories: Vec<Memory>,
}
