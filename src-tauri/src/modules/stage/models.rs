//! Data model of a Soul Stage scene: world state, combat, arcs, inventory, messages and scene files.

use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DcCheckResult {
    pub target_dc: i32,
    pub passed: bool,
    pub margin: i32, // sum - target_dc
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiceRollResult {
    pub formula: String,
    pub dice_count: u32,
    pub die_faces: u32,
    pub modifier: i32,
    pub individual_rolls: Vec<u32>,
    pub sum: i32,
    pub is_critical_success: bool,
    pub is_critical_failure: bool,
    pub dc_check: Option<DcCheckResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldState {
    pub time_of_day: String, // "Morgen", "Mittag", "Dämmerung", "Mitternacht"
    pub weather: String,     // "Klar", "Stürmisch", "Dichter Nebel", "Blutmond"
    pub location: String,    // "Kathedrale der Dämmerung", "Palastgarten"
    pub danger_level: u32,   // 1..5
    pub active_quest: String,
    #[serde(default)]
    pub key_facts: HashMap<String, String>,
}

impl Default for WorldState {
    fn default() -> Self {
        Self {
            time_of_day: "Dämmerung".to_string(),
            weather: "Nebliger Dunst".to_string(),
            location: "Alte Bibliothek des Ordens".to_string(),
            danger_level: 2,
            active_quest: "Untersuche das uralte Grimoire über Dimensionsrisse.".to_string(),
            key_facts: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampaignClock {
    pub id: String,
    pub name: String,
    pub current: u32,
    pub max: u32,           // e.g. 4, 6, 8
    pub clock_type: String, // "danger" | "progress" | "mystery"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatCondition {
    pub name: String,
    pub rounds_remaining: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Combatant {
    pub id: String,
    pub name: String,
    pub role: String, // "player" | "companion" | "enemy" | "boss"
    pub hp: i32,
    pub max_hp: i32,
    pub stress: i32,
    pub max_stress: i32,
    pub initiative: i32,
    pub conditions: Vec<CombatCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncounterState {
    pub is_active: bool,
    pub round: u32,
    pub current_turn_index: usize,
    pub combatants: Vec<Combatant>,
    pub combat_log: Vec<String>,
}

impl Default for EncounterState {
    fn default() -> Self {
        Self {
            is_active: false,
            round: 1,
            current_turn_index: 0,
            combatants: Vec::new(),
            combat_log: Vec::new(),
        }
    }
}

// --- Story Arcs & Inventory ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoryArc {
    pub id: String,
    pub title: String,
    pub description: String,
    pub stage: u32,
    pub max_stage: u32,
    pub is_revealed: bool,
    pub is_resolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub quantity: u32,
    pub item_type: String, // "consumable" | "key" | "equipment"
    #[serde(default)]
    pub hp_restore: i32,
    #[serde(default)]
    pub stress_restore: i32,
    #[serde(default)]
    pub clears_condition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampaignObjective {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub current: u32,
    #[serde(default = "default_objective_max")]
    pub max: u32,
    #[serde(default = "default_objective_status")]
    pub status: String,
}

pub(super) fn default_objective_max() -> u32 {
    1
}
pub(super) fn default_objective_status() -> String {
    "active".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageRelationship {
    pub subject: String,
    pub target: String,
    #[serde(default)]
    pub affinity: i32,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub role_view: String,
    #[serde(default)]
    pub last_shift_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsequenceEntry {
    pub id: String,
    pub text: String,
    pub created_at: String,
}

// --- Scene & Turn Message Models ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiceEventData {
    pub formula: String,
    pub rolls: Vec<u32>,
    pub modifier: i32,
    pub total: i32,
    pub target_dc: Option<i32>,
    pub passed: Option<bool>,
    pub is_crit_success: bool,
    pub is_crit_fail: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClockUpdateData {
    pub clock_id: String,
    pub clock_name: String,
    pub delta: i32,
    pub current: u32,
    pub max: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestEventData {
    pub rest_type: String, // "short" | "long"
    pub recovered_hp: i32,
    pub recovered_stress: i32,
    pub campfire_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum StageEventCard {
    #[serde(rename = "dice_roll")]
    DiceRoll(DiceEventData),
    #[serde(rename = "clock_update")]
    ClockUpdate(ClockUpdateData),
    #[serde(rename = "rest")]
    Rest(RestEventData),
    #[serde(rename = "discovery")]
    Discovery { text: String },
    #[serde(rename = "consequence")]
    Consequence { text: String },
    #[serde(rename = "item_use")]
    ItemUse {
        item_name: String,
        hp_recovered: i32,
        stress_recovered: i32,
        cleared_condition: Option<String>,
    },
    #[serde(rename = "bond_milestone")]
    BondMilestone {
        companion: String,
        affinity: i32,
        milestone: i32,
    },
    #[serde(rename = "combat")]
    Combat { action: String, text: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaggedChoice {
    pub text: String,
    #[serde(default)]
    pub badge: Option<String>,
    #[serde(default = "default_action_type")]
    pub action_type: String, // "say" | "do" | "think" | "direct" | "custom"
}

pub(super) fn default_action_type() -> String {
    "do".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneTurnMessage {
    pub id: String,
    pub sender_id: String,
    pub sender_name: String,
    pub sender_role: String, // "gm" | "player" | "companion" | "npc"
    #[serde(default)]
    pub avatar_url: Option<String>,
    pub content: String,
    #[serde(default = "default_turn_mode")]
    pub turn_mode: String, // "say" | "do" | "think" | "direct" | "whisper"
    #[serde(default)]
    pub whisper_target: Option<String>,
    #[serde(default)]
    pub event_card: Option<StageEventCard>,
    pub timestamp: u64,
}

pub(super) fn default_turn_mode() -> String {
    "do".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneDefinition {
    #[serde(default)]
    pub id: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub world_context: String,
    #[serde(default)]
    pub starting_location: String,
    #[serde(default)]
    pub time_of_day: String,
    #[serde(default)]
    pub opening_narration: String,
    #[serde(default)]
    pub first_message: String,
    #[serde(default)]
    pub party: Vec<String>,
    #[serde(default = "default_gm_tone")]
    pub gm_tone: String,
    #[serde(default = "default_narrator_style")]
    pub narrator_style: String,
    #[serde(default)]
    pub persona: String,
    #[serde(default)]
    pub lorebook: Vec<String>,
    #[serde(default)]
    pub solo_mode: bool,
    #[serde(default = "default_actor_depth")]
    pub max_actor_depth: u32,
    #[serde(default = "default_true")]
    pub dice_rolls_enabled: bool,
    #[serde(default)]
    pub starting_bg: String,
    #[serde(default)]
    pub starting_ambient: String,
    #[serde(default)]
    pub lock_bg: bool,
    #[serde(default)]
    pub disable_ambient: bool,
    #[serde(default)]
    pub folder: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub last_played: Option<String>,
}

pub(super) fn default_gm_tone() -> String {
    "Epic Fantasy".to_string()
}

pub(super) fn default_narrator_style() -> String {
    "Getragene, bildstarke Prosa im Präsens.".to_string()
}

pub(super) fn default_actor_depth() -> u32 {
    3
}

pub(super) fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenePreview {
    pub id: String,
    pub title: String,
    pub description: String,
    pub party: Vec<String>,
    pub location: String,
    pub time_of_day: String,
    pub gm_tone: String,
    pub folder: String,
    pub is_preset: bool,
    pub starting_bg: String,
    pub last_played: Option<String>,
    #[serde(default)]
    pub has_progress: bool,
    #[serde(default)]
    pub turn_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneState {
    pub definition: SceneDefinition,
    pub world: WorldState,
    #[serde(default)]
    pub clocks: Vec<CampaignClock>,
    pub combat: EncounterState,
    #[serde(default)]
    pub arcs: Vec<StoryArc>,
    #[serde(default)]
    pub inventory: Vec<InventoryItem>,
    #[serde(default)]
    pub objectives: Vec<CampaignObjective>,
    #[serde(default)]
    pub relationships: Vec<StageRelationship>,
    #[serde(default)]
    pub consequence_ledger: Vec<ConsequenceEntry>,
    #[serde(default)]
    pub chat_log: Vec<SceneTurnMessage>,
    #[serde(default)]
    pub pending_choices: Vec<TaggedChoice>,
    #[serde(default = "default_current_turn_actor")]
    pub current_turn_actor: String,
    #[serde(default)]
    pub current_bg: Option<String>,
}

pub(super) fn default_current_turn_actor() -> String {
    "PLAYER".to_string()
}
