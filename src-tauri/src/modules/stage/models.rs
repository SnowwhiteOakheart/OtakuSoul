#![allow(clippy::collapsible_if)]
//! Data model of a Soul Stage scene: world state, combat, arcs, inventory, messages and scene files.

use super::*;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DcCheckResult {
    pub target_dc: i32,
    pub passed: bool,
    pub margin: i32, // sum - target_dc
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WorldState {
    /// Free text in the reply language, e.g. "Dusk".
    pub time_of_day: String,
    pub weather: String,
    pub location: String,
    pub danger_level: u32, // 1..5
    pub active_quest: String,
    #[serde(default)]
    pub key_facts: HashMap<String, String>,
}

impl Default for WorldState {
    fn default() -> Self {
        let lang = crate::modules::content_lang::ContentLang::current();
        Self {
            time_of_day: lang.t("Dusk").to_string(),
            weather: lang.t("Misty haze").to_string(),
            location: lang.t("The order's old library").to_string(),
            danger_level: 2,
            active_quest: lang
                .t("Examine the ancient grimoire about dimensional rifts.")
                .to_string(),
            key_facts: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CampaignClock {
    pub id: String,
    pub name: String,
    pub current: u32,
    pub max: u32,           // e.g. 4, 6, 8
    pub clock_type: String, // "danger" | "progress" | "mystery"
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CombatCondition {
    pub name: String,
    pub rounds_remaining: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    #[serde(default)]
    pub skills: std::collections::HashMap<String, i32>,
    /// Rules values in 5e scenes (`ruleset: "5e"`); absent in narrative scenes.
    #[serde(default)]
    #[ts(optional)]
    pub stats5e: Option<super::rules5e::Stats5e>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EncounterState {
    pub is_active: bool,
    pub round: u32,
    pub current_turn_index: usize,
    pub combatants: Vec<Combatant>,
    pub combat_log: Vec<String>,
    /// Rules events of the current fight (5e scenes), newest last.
    #[serde(default)]
    pub events: Vec<super::rules5e::CombatEvent>,
}

impl Default for EncounterState {
    fn default() -> Self {
        Self {
            is_active: false,
            round: 1,
            current_turn_index: 0,
            combatants: Vec::new(),
            combat_log: Vec::new(),
            events: Vec::new(),
        }
    }
}

// --- Story Arcs & Inventory ---

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StoryArc {
    pub id: String,
    pub title: String,
    pub description: String,
    pub stage: u32,
    pub max_stage: u32,
    pub is_revealed: bool,
    pub is_resolved: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ConsequenceEntry {
    pub id: String,
    pub text: String,
    pub created_at: String,
}

// --- Scene & Turn Message Models ---

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ClockUpdateData {
    pub clock_id: String,
    pub clock_name: String,
    pub delta: i32,
    pub current: u32,
    pub max: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RestEventData {
    pub rest_type: String, // "short" | "long"
    pub recovered_hp: i32,
    pub recovered_stress: i32,
    pub campfire_note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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

impl SceneDefinition {
    pub fn localized(&self, lang: &str) -> SceneDefinition {
        let Some(translation) = self
            .extensions
            .get(crate::modules::characters::I18N_EXTENSION)
            .and_then(|i18n| i18n.get("translations"))
            .and_then(|t| t.get(lang))
        else {
            return self.clone();
        };
        let mut loc = self.clone();
        for &field in &[
            "title",
            "description",
            "world_context",
            "opening_narration",
            "first_message",
            "gm_tone",
            "narrator_style",
        ] {
            if let Some(val) = translation.get(field).and_then(|v| v.as_str()) {
                if !val.trim().is_empty() {
                    match field {
                        "title" => loc.title = val.to_string(),
                        "description" => loc.description = val.to_string(),
                        "world_context" => loc.world_context = val.to_string(),
                        "opening_narration" => loc.opening_narration = val.to_string(),
                        "first_message" => loc.first_message = val.to_string(),
                        "gm_tone" => loc.gm_tone = val.to_string(),
                        "narrator_style" => loc.narrator_style = val.to_string(),
                        _ => {}
                    }
                }
            }
        }
        loc
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    #[serde(default)]
    pub extensions: serde_json::Value,
    /// Rules of the scene; absent = narrative scene (stress, free checks).
    #[serde(default)]
    pub rules: Option<SceneRules>,
}

/// A scene played with the 5e rules engine (`Roadmap_DND.md`).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SceneRules {
    /// `5e`; other values are treated as a narrative scene.
    pub ruleset: String,
    /// Class template per party member (`player` for the player), e.g. `{"Lyra": "wizard"}`.
    #[serde(default)]
    pub hero_classes: HashMap<String, String>,
    /// The player chooses the companions' combat actions instead of the language model.
    #[serde(default)]
    pub control_companions: bool,
}

impl SceneDefinition {
    /// The scene uses the 5e rules engine.
    pub fn is_5e(&self) -> bool {
        self.rules
            .as_ref()
            .is_some_and(|rules| rules.ruleset == "5e")
    }
}

pub(super) fn default_gm_tone() -> String {
    "Epic Fantasy".to_string()
}

pub(super) fn default_narrator_style() -> String {
    crate::modules::content_lang::ContentLang::current()
        .t("Measured, vivid prose in the present tense.")
        .to_string()
}

pub(super) fn default_actor_depth() -> u32 {
    3
}

pub(super) fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    /// The scene uses the 5e rules engine (badge in the lobby).
    #[serde(default)]
    pub rules_5e: bool,
}

/// A piece of live text during a Stage turn (event `stage-stream`); the message with the same
/// id arrives complete in the turn result.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageStreamEvent {
    pub message_id: String,
    pub sender_name: String,
    /// `gm` or `companion`.
    pub sender_role: String,
    pub avatar_url: Option<String>,
    /// New text since the last event.
    pub text: String,
    /// The message is complete.
    pub done: bool,
}

/// Receives live text during a turn.
pub type StageStream<'a> = &'a (dyn Fn(StageStreamEvent) + Send + Sync);

/// A character's place in this story, on top of their card: what the scene has made of them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterOverlay {
    pub name: String,
    #[serde(default)]
    pub current_role: String,
    #[serde(default)]
    pub arc_stage: String,
    /// Facts that changed for this character (`"injury": "left arm in a sling"`).
    #[serde(default)]
    pub facts: std::collections::BTreeMap<String, String>,
}

/// Scene knowledge that comes into play when its keywords show up.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageLoreCard {
    pub id: String,
    pub title: String,
    pub content: String,
    /// Empty = always relevant.
    #[serde(default)]
    pub keywords: Vec<String>,
    /// `party` (everyone may know it) or `gm` (only the game master).
    #[serde(default = "default_lore_audience")]
    pub audience: String,
}

pub(super) fn default_lore_audience() -> String {
    "party".to_string()
}

/// A resolved story arc, condensed when it ended.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ArchivedArc {
    pub arc_id: String,
    pub title: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
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
    /// Ambient sound playing now (file name); the scene's start value or the planner's pick.
    #[serde(default)]
    pub current_ambient: Option<String>,
    /// Summaries of resolved story arcs; the planner keeps them in mind instead of the open list.
    #[serde(default)]
    pub arc_archive: Vec<ArchivedArc>,
    /// Turns since the last consistency check of the facts.
    #[serde(default)]
    pub turns_since_audit: u32,
    /// How each character currently stands in this story (role, personal arc, changing facts).
    #[serde(default)]
    pub overlays: Vec<CharacterOverlay>,
    /// Scene lore with an audience: the party, or only the game master.
    #[serde(default)]
    pub lore_cards: Vec<StageLoreCard>,
    /// Per character: how much of the log has gone into their Soul Memory.
    #[serde(default)]
    pub memory_sync: HashMap<String, usize>,
    /// What each character was told in private (whispers), by name.
    #[serde(default)]
    pub private_knowledge: HashMap<String, Vec<String>>,
    /// Running summaries are isolated by audience: planner, narrator, character name.
    #[serde(default)]
    pub history_summaries: HashMap<String, StageHistorySummary>,
    #[serde(default)]
    pub npcs: Vec<StageNpc>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageHistorySummary {
    pub text: String,
    /// Number of leading chat messages already folded into the summary.
    pub until: usize,
}

pub(super) fn default_current_turn_actor() -> String {
    "PLAYER".to_string()
}
