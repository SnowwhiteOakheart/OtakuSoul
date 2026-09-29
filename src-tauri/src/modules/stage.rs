use base64::prelude::*;
use chrono::Utc;
use rand::RngExt;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

use crate::modules::inference::{ChatMessage, ChatRequest, InferenceClient, SamplingParams};
use crate::modules::paths::{resolve_app_paths, scan_available_characters};
use crate::modules::settings::load_app_settings;

// ==========================================
// 1. Core Mechanics & Dice Models
// ==========================================

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

// ==========================================
// 2. Story Arcs & Inventory
// ==========================================

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

fn default_objective_max() -> u32 {
    1
}
fn default_objective_status() -> String {
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

// ==========================================
// 3. Scene & Turn Message Models
// ==========================================

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

fn default_action_type() -> String {
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

fn default_turn_mode() -> String {
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

fn default_gm_tone() -> String {
    "Epic Fantasy".to_string()
}

fn default_narrator_style() -> String {
    "Getragene, bildstarke Prosa im Präsens.".to_string()
}

fn default_actor_depth() -> u32 {
    3
}

fn default_true() -> bool {
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

fn default_current_turn_actor() -> String {
    "PLAYER".to_string()
}

// ==========================================
// 4. GM Planner Schema & JSON Repair
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanDiceCheck {
    pub formula: String,
    pub dc: i32,
    pub skill_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanClockUpdate {
    pub id: String,
    pub delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanResourceDelta {
    pub target: String,
    #[serde(default)]
    pub hp_delta: i32,
    #[serde(default)]
    pub stress_delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanArcUpdate {
    pub id: String,
    #[serde(default)]
    pub stage_delta: i32,
    #[serde(default)]
    pub reveal: bool,
    #[serde(default)]
    pub resolve: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanObjectiveUpdate {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub progress_delta: i32,
    #[serde(default)]
    pub max: Option<u32>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanInventoryAdd {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_inventory_quantity")]
    pub quantity: u32,
    #[serde(default = "default_inventory_type")]
    pub item_type: String,
    #[serde(default)]
    pub hp_restore: i32,
    #[serde(default)]
    pub stress_restore: i32,
    #[serde(default)]
    pub clears_condition: Option<String>,
}

fn default_inventory_quantity() -> u32 {
    1
}
fn default_inventory_type() -> String {
    "key".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanCombatant {
    pub name: String,
    #[serde(default = "default_enemy_hp")]
    pub hp: i32,
    #[serde(default = "default_enemy_role")]
    pub role: String,
}

fn default_enemy_hp() -> i32 {
    10
}
fn default_enemy_role() -> String {
    "enemy".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanCombatDelta {
    pub target: String,
    pub hp_delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanEncounterUpdate {
    pub action: String,
    #[serde(default)]
    pub enemies: Vec<PlanCombatant>,
    #[serde(default)]
    pub hp_updates: Vec<PlanCombatDelta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GmPlan {
    pub narration_plan: String,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub time_of_day: Option<String>,
    #[serde(default)]
    pub weather: Option<String>,
    #[serde(default)]
    pub bg_image: Option<String>,
    #[serde(default)]
    pub ambient_audio: Option<String>,
    #[serde(default)]
    pub next_actor: Option<String>,
    #[serde(default)]
    pub dice_check: Option<PlanDiceCheck>,
    #[serde(default)]
    pub campaign_clock_updates: Vec<PlanClockUpdate>,
    #[serde(default)]
    pub resource_delta: Option<PlanResourceDelta>,
    #[serde(default)]
    pub story_arc_updates: Vec<PlanArcUpdate>,
    #[serde(default)]
    pub objective_updates: Vec<PlanObjectiveUpdate>,
    #[serde(default)]
    pub inventory_add: Vec<PlanInventoryAdd>,
    #[serde(default)]
    pub inventory_remove: Vec<String>,
    #[serde(default)]
    pub encounter: Option<PlanEncounterUpdate>,
    #[serde(default)]
    pub player_choices: Vec<TaggedChoice>,
    #[serde(default)]
    pub lasting_consequence: Option<String>,
    #[serde(default)]
    pub discovery: Option<String>,
}

/// Robust JSON repair function that extracts and parses GM JSON plans
pub fn repair_and_parse_gm_plan(raw: &str) -> GmPlan {
    let mut text = raw.trim();

    // Strip markdown fences
    if text.starts_with("```") {
        if let Some(pos) = text.find('\n') {
            text = &text[pos + 1..];
        }
        if let Some(end) = text.rfind("```") {
            text = &text[..end];
        }
        text = text.trim();
    }

    // Try direct parse
    if let Ok(plan) = serde_json::from_str::<GmPlan>(text) {
        return plan;
    }

    // Extract outer curly braces
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}'))
        && start < end
    {
        let candidate = &text[start..=end];
        // Remove trailing commas before closing braces/brackets
        let re_commas = Regex::new(r",\s*([\]\}])").unwrap();
        let cleaned = re_commas.replace_all(candidate, "$1");

        if let Ok(plan) = serde_json::from_str::<GmPlan>(&cleaned) {
            return plan;
        }
    }

    // Attempt token repair: count unbalanced braces
    let mut balanced = text.to_string();
    let mut open_braces = 0i32;
    let mut open_brackets = 0i32;
    for c in balanced.chars() {
        match c {
            '{' => open_braces += 1,
            '}' => open_braces -= 1,
            '[' => open_brackets += 1,
            ']' => open_brackets -= 1,
            _ => {}
        }
    }
    while open_brackets > 0 {
        balanced.push(']');
        open_brackets -= 1;
    }
    while open_braces > 0 {
        balanced.push('}');
        open_braces -= 1;
    }
    if let Ok(plan) = serde_json::from_str::<GmPlan>(&balanced) {
        return plan;
    }

    // Fallback default plan
    GmPlan {
        narration_plan: text.to_string(),
        next_actor: Some("PLAYER".to_string()),
        player_choices: vec![
            TaggedChoice {
                text: "Die Umgebung untersuchen".to_string(),
                badge: Some("Wahrnehmung".to_string()),
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: "Mit der Gruppe sprechen".to_string(),
                badge: None,
                action_type: "say".to_string(),
            },
            TaggedChoice {
                text: "Vorsichtig weitergehen".to_string(),
                badge: None,
                action_type: "do".to_string(),
            },
        ],
        ..Default::default()
    }
}

// ==========================================
// 5. Stage Engine Implementation
// ==========================================

pub struct StageEngine {
    state: RwLock<SceneState>,
    snapshots: RwLock<HashMap<String, VecDeque<SceneState>>>,
}

impl Default for StageEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl StageEngine {
    pub fn new() -> Self {
        let initial_clocks = vec![
            CampaignClock {
                id: "clock_1".to_string(),
                name: "Aufmerksamkeit der Wachen".to_string(),
                current: 2,
                max: 6,
                clock_type: "danger".to_string(),
            },
            CampaignClock {
                id: "clock_2".to_string(),
                name: "Ritual-Vollendung".to_string(),
                current: 1,
                max: 4,
                clock_type: "mystery".to_string(),
            },
        ];

        let initial_combatants = vec![
            Combatant {
                id: "comb_player".to_string(),
                name: "Hiroki".to_string(),
                role: "player".to_string(),
                hp: 45,
                max_hp: 50,
                stress: 20,
                max_stress: 100,
                initiative: 16,
                conditions: Vec::new(),
            },
            Combatant {
                id: "comb_companion".to_string(),
                name: "Ayu Ikue".to_string(),
                role: "companion".to_string(),
                hp: 38,
                max_hp: 40,
                stress: 15,
                max_stress: 100,
                initiative: 19,
                conditions: vec![CombatCondition {
                    name: "Verführerische Aura".to_string(),
                    rounds_remaining: 3,
                }],
            },
            Combatant {
                id: "comb_enemy_1".to_string(),
                name: "Schattenpirscher".to_string(),
                role: "enemy".to_string(),
                hp: 28,
                max_hp: 28,
                stress: 0,
                max_stress: 50,
                initiative: 12,
                conditions: Vec::new(),
            },
        ];

        let encounter = EncounterState {
            combatants: initial_combatants,
            ..Default::default()
        };

        let initial_def = SceneDefinition {
            id: "default_scene".to_string(),
            title: "Die verlassene Zuflucht".to_string(),
            description: "Ein altes Sanktum voller arkaner Relikte und verborgener Gefahren.".to_string(),
            world_context: "In den Tiefen einer vergessenen Bastion sucht ihr nach Antworten.".to_string(),
            starting_location: "Alte Bibliothek des Ordens".to_string(),
            time_of_day: "Dämmerung".to_string(),
            opening_narration: "Das Portal schließt sich leise hinter euch. Staub tanzt in den verblassenden Lichtstrahlen. Vor euch erstrecken sich endlose Regale uralter Schriften.".to_string(),
            first_message: "".to_string(),
            party: vec!["Ayu Ikue".to_string()],
            gm_tone: "Epic Fantasy".to_string(),
            narrator_style: "Atmosphärisch und detailliert.".to_string(),
            persona: "Hiroki".to_string(),
            lorebook: Vec::new(),
            folder: "Eigene Szenen".to_string(),
            lock_bg: false,
            disable_ambient: false,
            solo_mode: false,
            max_actor_depth: 3,
            dice_rolls_enabled: true,
            starting_bg: "".to_string(),
            starting_ambient: "None".to_string(),
            created_at: Utc::now().to_rfc3339(),
            last_played: Some(Utc::now().to_rfc3339()),
        };

        let initial_msg = SceneTurnMessage {
            id: "msg_init".to_string(),
            sender_id: "gm".to_string(),
            sender_name: "Game Master".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content: initial_def.opening_narration.clone(),
            turn_mode: "do".to_string(),
            whisper_target: None,
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
        };

        let state = SceneState {
            definition: initial_def,
            world: WorldState::default(),
            clocks: initial_clocks,
            combat: encounter,
            arcs: vec![StoryArc {
                id: "arc_1".to_string(),
                title: "Das Geheimnis des Ordens".to_string(),
                description: "Finde heraus, warum die Bibliothek einst versiegelt wurde."
                    .to_string(),
                stage: 1,
                max_stage: 3,
                is_revealed: true,
                is_resolved: false,
            }],
            inventory: vec![
                InventoryItem {
                    id: "item_1".to_string(),
                    name: "Heiltrank".to_string(),
                    description: "Stellt 25 HP wieder her.".to_string(),
                    quantity: 2,
                    item_type: "consumable".to_string(),
                    hp_restore: 25,
                    stress_restore: 0,
                    clears_condition: None,
                },
                InventoryItem {
                    id: "item_2".to_string(),
                    name: "Messing-Schlüssel".to_string(),
                    description: "Ein verzierter Schlüssel mit Sonnensymbol.".to_string(),
                    quantity: 1,
                    item_type: "key".to_string(),
                    hp_restore: 0,
                    stress_restore: 0,
                    clears_condition: None,
                },
            ],
            objectives: vec![CampaignObjective {
                id: "objective_1".to_string(),
                title: "Das Grimoire untersuchen".to_string(),
                description: "Finde heraus, was die Dimensionsrisse verursacht.".to_string(),
                current: 0,
                max: 3,
                status: "active".to_string(),
            }],
            relationships: vec![StageRelationship {
                subject: "Ayu Ikue".to_string(),
                target: "Hiroki".to_string(),
                affinity: 10,
                tags: vec!["Gefährtin".to_string()],
                role_view: "Vertrauter Verbündeter".to_string(),
                last_shift_reason: String::new(),
            }],
            consequence_ledger: Vec::new(),
            chat_log: vec![initial_msg],
            pending_choices: vec![
                TaggedChoice {
                    text: "Das leuchtende Buch auf dem Lesepult untersuchen".to_string(),
                    badge: Some("Wahrnehmung (DC 13)".to_string()),
                    action_type: "do".to_string(),
                },
                TaggedChoice {
                    text: "Ayu fragen, ob sie diese Schriftzeichen entziffern kann".to_string(),
                    badge: None,
                    action_type: "say".to_string(),
                },
                TaggedChoice {
                    text: "Die Tür im hinteren Bereich leise überprüfen".to_string(),
                    badge: Some("Heimlichkeit".to_string()),
                    action_type: "do".to_string(),
                },
            ],
            current_turn_actor: "PLAYER".to_string(),
            current_bg: None,
        };

        Self {
            state: RwLock::new(state),
            snapshots: RwLock::new(HashMap::new()),
        }
    }

    pub fn get_state(&self) -> SceneState {
        self.state.read().unwrap().clone()
    }

    pub fn set_state(&self, new_state: SceneState) {
        let mut st = self.state.write().unwrap();
        *st = new_state;
    }

    pub fn update_world(&self, new_world: WorldState) {
        let mut st = self.state.write().unwrap();
        st.world = new_world;
    }

    pub fn set_clock_progress(&self, clock_id: &str, progress: u32) {
        let mut st = self.state.write().unwrap();
        if let Some(clock) = st.clocks.iter_mut().find(|c| c.id == clock_id) {
            clock.current = progress.min(clock.max);
        }
    }

    pub fn add_clock(&self, clock: CampaignClock) {
        let mut st = self.state.write().unwrap();
        st.clocks.retain(|c| c.id != clock.id);
        st.clocks.push(clock);
    }

    pub fn delete_clock(&self, clock_id: &str) {
        let mut st = self.state.write().unwrap();
        st.clocks.retain(|c| c.id != clock_id);
    }

    // --- Encounter Lifecycle ---
    pub fn start_encounter(&self) {
        let mut st = self.state.write().unwrap();
        if st.combat.combatants.is_empty() {
            let mut rng = rand::rng();
            let player_name = if st.definition.persona.trim().is_empty() {
                "Spieler".to_string()
            } else {
                st.definition.persona.clone()
            };
            st.combat.combatants.push(Combatant {
                id: "player".to_string(),
                name: player_name,
                role: "player".to_string(),
                hp: 50,
                max_hp: 50,
                stress: 0,
                max_stress: 100,
                initiative: rng.random_range(1..=20),
                conditions: Vec::new(),
            });
            let party = st.definition.party.clone();
            for (index, name) in party.into_iter().enumerate() {
                st.combat.combatants.push(Combatant {
                    id: format!("companion_{}", index),
                    name,
                    role: "companion".to_string(),
                    hp: 40,
                    max_hp: 40,
                    stress: 0,
                    max_stress: 100,
                    initiative: rng.random_range(1..=20),
                    conditions: Vec::new(),
                });
            }
            st.combat.combatants.push(Combatant {
                id: "enemy_1".to_string(),
                name: "Unbekannter Gegner".to_string(),
                role: "enemy".to_string(),
                hp: 20,
                max_hp: 20,
                stress: 0,
                max_stress: 0,
                initiative: rng.random_range(1..=20),
                conditions: Vec::new(),
            });
        }
        st.combat.is_active = true;
        st.combat.round = 1;
        st.combat.current_turn_index = 0;
        st.combat
            .combatants
            .sort_by_key(|c| std::cmp::Reverse(c.initiative));
        let active_name = st
            .combat
            .combatants
            .first()
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "Niemand".to_string());
        st.combat.combat_log.push(format!(
            "Kampf gestartet! Runde 1 – {} ist am Zug.",
            active_name
        ));
    }

    pub fn end_encounter(&self) {
        let mut st = self.state.write().unwrap();
        st.combat.is_active = false;
        st.combat
            .combat_log
            .push("Kampf beendet. Alle Einheiten entspannen sich.".to_string());
    }

    pub fn next_turn(&self) {
        let mut st = self.state.write().unwrap();
        if !st.combat.is_active || st.combat.combatants.is_empty() {
            return;
        }

        let num_combatants = st.combat.combatants.len();
        st.combat.current_turn_index += 1;

        if st.combat.current_turn_index >= num_combatants {
            st.combat.current_turn_index = 0;
            st.combat.round += 1;

            // Tick down conditions
            for c in st.combat.combatants.iter_mut() {
                c.conditions.retain_mut(|cond| {
                    if cond.rounds_remaining > 0 {
                        cond.rounds_remaining -= 1;
                    }
                    cond.rounds_remaining > 0
                });
            }

            let round_num = st.combat.round;
            st.combat
                .combat_log
                .push(format!("--- Neue Runde: Runde {} ---", round_num));
        }

        let active_name = st.combat.combatants[st.combat.current_turn_index]
            .name
            .clone();
        st.combat
            .combat_log
            .push(format!("{} ist am Zug.", active_name));
    }

    pub fn apply_combatant_delta(&self, combatant_id: &str, hp_delta: i32, stress_delta: i32) {
        let mut st = self.state.write().unwrap();
        let log_msg = if let Some(c) = st
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.id == combatant_id)
        {
            c.hp = (c.hp + hp_delta).clamp(0, c.max_hp);
            c.stress = (c.stress + stress_delta).clamp(0, c.max_stress);

            let msg = if hp_delta < 0 {
                format!(
                    "{} erleidet {} Schaden (HP: {}/{})",
                    c.name,
                    hp_delta.abs(),
                    c.hp,
                    c.max_hp
                )
            } else if hp_delta > 0 {
                format!(
                    "{} wird um {} HP geheilt (HP: {}/{})",
                    c.name, hp_delta, c.hp, c.max_hp
                )
            } else {
                format!(
                    "{} Stress verändert um {} (Stress: {}/{})",
                    c.name, stress_delta, c.stress, c.max_stress
                )
            };
            Some(msg)
        } else {
            None
        };

        if let Some(msg) = log_msg {
            st.combat.combat_log.push(msg);
        }
    }

    pub fn add_condition(&self, combatant_id: &str, condition: CombatCondition) {
        let mut st = self.state.write().unwrap();
        let log_msg = if let Some(c) = st
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.id == combatant_id)
        {
            let name = condition.name.clone();
            let rounds = condition.rounds_remaining;
            let c_name = c.name.clone();
            c.conditions.retain(|cond| cond.name != name);
            c.conditions.push(condition);
            Some(format!(
                "{} erhält Zustand: {} ({} Runden)",
                c_name, name, rounds
            ))
        } else {
            None
        };

        if let Some(msg) = log_msg {
            st.combat.combat_log.push(msg);
        }
    }

    pub fn delay_turn(&self) -> Result<SceneState, String> {
        let mut st = self.state.write().unwrap();
        if !st.combat.is_active || st.combat.combatants.len() < 2 {
            return Err(crate::err!("backend.stage.noEncounter"));
        }
        let index = st.combat.current_turn_index;
        if index >= st.combat.combatants.len() || st.combat.combatants[index].role != "player" {
            return Err(crate::err!("backend.stage.delayOwnTurn"));
        }
        if index + 1 >= st.combat.combatants.len() {
            return Err(crate::err!("backend.stage.delayLastTurn"));
        }
        let player_name = st.combat.combatants[index].name.clone();
        st.combat.combatants.swap(index, index + 1);
        let next_name = st.combat.combatants[index].name.clone();
        st.current_turn_actor = next_name.clone();
        st.combat.combat_log.push(format!(
            "{} verschiebt den Zug. {} handelt zuerst.",
            player_name, next_name
        ));
        Ok(st.clone())
    }

    pub fn use_inventory_item(&self, scene_id: &str, item_id: &str) -> Result<SceneState, String> {
        let current = self.get_state();
        let mut st = if current.definition.id == scene_id {
            current
        } else {
            load_scene_by_id(scene_id)?
        };
        self.push_snapshot(scene_id, st.clone());

        let item_index = st
            .inventory
            .iter()
            .position(|item| item.id == item_id)
            .ok_or_else(|| crate::err!("backend.stage.itemMissing"))?;
        let item = st.inventory[item_index].clone();
        if item.item_type != "consumable" {
            return Err(crate::err!("backend.stage.itemNotConsumable"));
        }

        let fallback_name = item.name.to_lowercase();
        let hp_restore = if item.hp_restore != 0 {
            item.hp_restore
        } else if fallback_name.contains("heil") || fallback_name.contains("trank") {
            25
        } else if fallback_name.contains("bandage") {
            10
        } else {
            0
        };
        let stress_restore = if item.stress_restore != 0 {
            item.stress_restore
        } else if fallback_name.contains("brot") || fallback_name.contains("tee") {
            10
        } else {
            0
        };

        let player = st
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.role == "player")
            .ok_or_else(|| {
                "Kein Spielerstatus für die Gegenstandswirkung vorhanden.".to_string()
            })?;
        let hp_before = player.hp;
        let stress_before = player.stress;
        player.hp = (player.hp + hp_restore).clamp(0, player.max_hp);
        player.stress = (player.stress - stress_restore).clamp(0, player.max_stress);
        let hp_recovered = player.hp - hp_before;
        let stress_recovered = stress_before - player.stress;
        let cleared_condition = item.clears_condition.as_ref().and_then(|condition| {
            let before = player.conditions.len();
            player
                .conditions
                .retain(|entry| !entry.name.eq_ignore_ascii_case(condition));
            (player.conditions.len() < before).then(|| condition.clone())
        });

        if st.inventory[item_index].quantity > 1 {
            st.inventory[item_index].quantity -= 1;
        } else {
            st.inventory.remove(item_index);
        }

        st.chat_log.push(SceneTurnMessage {
            id: format!("msg_{}", Utc::now().timestamp_millis()),
            sender_id: "system".to_string(),
            sender_name: "Inventar".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content: format!("{} wurde benutzt.", item.name),
            turn_mode: "do".to_string(),
            whisper_target: None,
            event_card: Some(StageEventCard::ItemUse {
                item_name: item.name,
                hp_recovered,
                stress_recovered,
                cleared_condition,
            }),
            timestamp: Utc::now().timestamp() as u64,
        });

        self.set_state(st.clone());
        save_scene_state(&st)?;
        Ok(st)
    }

    // --- Snapshot & Undo ---
    pub fn push_snapshot(&self, scene_id: &str, state: SceneState) {
        let mut snaps = self.snapshots.write().unwrap();
        let queue = snaps.entry(scene_id.to_string()).or_default();
        queue.push_back(state);
        if queue.len() > 10 {
            queue.pop_front();
        }
    }

    pub fn undo_turn(&self, scene_id: &str) -> Result<SceneState, String> {
        let mut snaps = self.snapshots.write().unwrap();
        if let Some(queue) = snaps.get_mut(scene_id)
            && let Some(previous_state) = queue.pop_back()
        {
            self.set_state(previous_state.clone());
            let _ = save_scene_state(&previous_state);
            return Ok(previous_state);
        }
        Err(crate::err!("backend.stage.nothingToUndo"))
    }
}

// ==========================================
// 6. Dice Parser Implementation
// ==========================================

pub fn roll_dice(formula_raw: &str, target_dc: Option<i32>) -> Result<DiceRollResult, String> {
    let clean = formula_raw.trim().replace(' ', "");
    if clean.is_empty() {
        return Err(crate::err!("backend.stage.diceEmpty"));
    }

    let (base_part, modifier) = if let Some(pos) = clean.find('+') {
        let (b, m) = clean.split_at(pos);
        let mod_val: i32 = m[1..]
            .parse()
            .map_err(|_| "Ungültiger positiver Modifikator")?;
        (b, mod_val)
    } else if let Some(pos) = clean.rfind('-') {
        let (b, m) = clean.split_at(pos);
        let mod_val: i32 = m[1..]
            .parse()
            .map_err(|_| "Ungültiger negativer Modifikator")?;
        (b, -mod_val)
    } else {
        (clean.as_str(), 0)
    };

    let parts: Vec<&str> = base_part.split(['d', 'D']).collect();
    if parts.len() != 2 {
        return Err(crate::err!("backend.stage.diceFormat", formula = clean));
    }

    let dice_count: u32 = if parts[0].is_empty() {
        1
    } else {
        parts[0]
            .parse()
            .map_err(|_| "Ungültige Anzahl der Würfel")?
    };

    let die_faces: u32 = parts[1]
        .parse()
        .map_err(|_| "Ungültige Seitenzahl des Würfels")?;

    if dice_count == 0 || dice_count > 100 {
        return Err(crate::err!("backend.stage.diceCount"));
    }
    if !(2..=1000).contains(&die_faces) {
        return Err(crate::err!("backend.stage.diceSides"));
    }

    let mut rng = rand::rng();
    let mut individual_rolls = Vec::with_capacity(dice_count as usize);
    let mut rolls_sum: i32 = 0;

    for _ in 0..dice_count {
        let roll: u32 = rng.random_range(1..=die_faces);
        rolls_sum += roll as i32;
        individual_rolls.push(roll);
    }

    let total_sum = rolls_sum + modifier;

    let is_critical_success = if dice_count == 1 && die_faces == 20 {
        individual_rolls[0] == 20
    } else if dice_count == 1 && die_faces == 100 {
        individual_rolls[0] <= 5
    } else if dice_count == 2 && die_faces == 6 {
        rolls_sum == 12
    } else {
        false
    };

    let is_critical_failure = if dice_count == 1 && die_faces == 20 {
        individual_rolls[0] == 1
    } else if dice_count == 1 && die_faces == 100 {
        individual_rolls[0] >= 96
    } else if dice_count == 2 && die_faces == 6 {
        rolls_sum == 2
    } else {
        false
    };

    let dc_check = target_dc.map(|dc| DcCheckResult {
        target_dc: dc,
        passed: if is_critical_success {
            true
        } else if is_critical_failure {
            false
        } else {
            total_sum >= dc
        },
        margin: total_sum - dc,
    });

    Ok(DiceRollResult {
        formula: clean,
        dice_count,
        die_faces,
        modifier,
        individual_rolls,
        sum: total_sum,
        is_critical_success,
        is_critical_failure,
        dc_check,
    })
}

// ==========================================
// 7. Scene Scanner & Persistence
// ==========================================

pub fn build_initial_scene_state(def: &SceneDefinition) -> SceneState {
    let initial_msg = SceneTurnMessage {
        id: format!("msg_{}", Utc::now().timestamp_millis()),
        sender_id: "gm".to_string(),
        sender_name: "Game Master".to_string(),
        sender_role: "gm".to_string(),
        avatar_url: None,
        content: if !def.opening_narration.is_empty() {
            def.opening_narration.clone()
        } else {
            def.description.clone()
        },
        turn_mode: "do".to_string(),
        whisper_target: None,
        event_card: None,
        timestamp: Utc::now().timestamp() as u64,
    };

    let world = WorldState {
        location: if !def.starting_location.is_empty() {
            def.starting_location.clone()
        } else {
            "Alte Zuflucht".to_string()
        },
        time_of_day: if !def.time_of_day.is_empty() {
            def.time_of_day.clone()
        } else {
            "Dämmerung".to_string()
        },
        weather: "Klar".to_string(),
        danger_level: 2,
        active_quest: def.description.clone(),
        key_facts: HashMap::new(),
    };

    let persona_name = if def.persona.is_empty() {
        "Spieler".to_string()
    } else {
        def.persona.clone()
    };

    SceneState {
        definition: def.clone(),
        world,
        clocks: vec![CampaignClock {
            id: "clock_tension".to_string(),
            name: "Dramatische Spannung".to_string(),
            current: 1,
            max: 6,
            clock_type: "danger".to_string(),
        }],
        combat: EncounterState::default(),
        arcs: Vec::new(),
        inventory: Vec::new(),
        objectives: vec![CampaignObjective {
            id: "objective_main".to_string(),
            title: if !def.title.is_empty() {
                def.title.clone()
            } else {
                "Abenteuer beginnen".to_string()
            },
            description: def.description.clone(),
            current: 0,
            max: 1,
            status: "active".to_string(),
        }],
        relationships: def
            .party
            .iter()
            .map(|name| StageRelationship {
                subject: name.clone(),
                target: persona_name.clone(),
                affinity: 0,
                tags: vec!["Gefährte".to_string()],
                role_view: "Gefährte".to_string(),
                last_shift_reason: String::new(),
            })
            .collect(),
        consequence_ledger: Vec::new(),
        chat_log: vec![initial_msg],
        pending_choices: vec![
            TaggedChoice {
                text: "Die Umgebung genau mustern".to_string(),
                badge: Some("Wahrnehmung".to_string()),
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: "Einen Schritt vorwärts wagen".to_string(),
                badge: None,
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: "Mit den Gefährten beraten".to_string(),
                badge: None,
                action_type: "say".to_string(),
            },
        ],
        current_turn_actor: "PLAYER".to_string(),
        current_bg: if !def.starting_bg.is_empty() {
            Some(def.starting_bg.clone())
        } else {
            None
        },
    }
}

pub fn ensure_default_scene_folders() {
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let _ = fs::create_dir_all(&scenes_dir);

    let search_roots = [
        PathBuf::from(&paths.bundled_presets_dir),
        PathBuf::from("presets"),
        PathBuf::from("../presets"),
    ];

    // 1. Ensure "No Game No Life" folder exists in scenes_dir with all 12 chapters
    let ngnl_dir = scenes_dir.join("No Game No Life");
    let needs_ngnl_copy = !ngnl_dir.exists()
        || fs::read_dir(&ngnl_dir)
            .map(|d| {
                d.flatten()
                    .filter(|e| e.path().extension().is_some_and(|ext| ext == "json"))
                    .count()
                    < 12
            })
            .unwrap_or(true);

    if needs_ngnl_copy {
        let _ = fs::create_dir_all(&ngnl_dir);
        for root in &search_roots {
            let src_scenes = root.join("no-game-no-life").join("scenes");
            if src_scenes.exists() {
                if let Ok(entries) = fs::read_dir(&src_scenes) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() && p.extension().is_some_and(|ext| ext == "json") {
                            let stem = p
                                .file_stem()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string();
                            let target_p = ngnl_dir.join(format!("{}.json", stem));
                            if let Ok(content) = fs::read_to_string(&p)
                                && let Ok(mut def) =
                                    serde_json::from_str::<SceneDefinition>(&content)
                            {
                                def.id = stem.clone();
                                def.folder = "No Game No Life".to_string();
                                let state = build_initial_scene_state(&def);
                                if let Ok(json_str) = serde_json::to_string_pretty(&state) {
                                    let _ = fs::write(&target_p, json_str);
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }

    // 2. Ensure No Game No Life Lorebooks are copied to lorebooks_dir
    let lorebooks_dir = PathBuf::from(&paths.lorebooks_dir);
    let _ = fs::create_dir_all(&lorebooks_dir);
    for root in &search_roots {
        let src_lb = root.join("no-game-no-life").join("lorebooks");
        if src_lb.exists() {
            if let Ok(entries) = fs::read_dir(&src_lb) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file()
                        && p.extension().is_some_and(|ext| ext == "json")
                        && let Some(filename) = p.file_name()
                    {
                        let target_lb = lorebooks_dir.join(filename);
                        if !target_lb.exists() {
                            let _ = fs::copy(&p, &target_lb);
                        }
                    }
                }
            }
            break;
        }
    }

    // 3. Ensure Sakura Succubus 3 folder exists with presets
    let ss3_dir = scenes_dir.join("Sakura Succubus 3");
    if !ss3_dir.exists() {
        for root in &search_roots {
            let src_scenes = root.join("sakura-succubus-3").join("scenes");
            if src_scenes.exists() {
                let _ = fs::create_dir_all(&ss3_dir);
                if let Ok(entries) = fs::read_dir(&src_scenes) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() && p.extension().is_some_and(|ext| ext == "json") {
                            let stem = p
                                .file_stem()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string();
                            let target_p = ss3_dir.join(format!("{}.json", stem));
                            if let Ok(content) = fs::read_to_string(&p)
                                && let Ok(mut def) =
                                    serde_json::from_str::<SceneDefinition>(&content)
                            {
                                def.id = stem.clone();
                                def.folder = "Sakura Succubus 3".to_string();
                                let state = build_initial_scene_state(&def);
                                if let Ok(json_str) = serde_json::to_string_pretty(&state) {
                                    let _ = fs::write(&target_p, json_str);
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }
}

pub fn find_scene_path(scene_id: &str) -> Option<PathBuf> {
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);

    // 1. Direct file: scenes/{scene_id}.json
    let direct = scenes_dir.join(format!("{}.json", scene_id));
    if direct.exists() {
        return Some(direct);
    }

    // 2. Subdirectories in scenes/
    if let Ok(entries) = fs::read_dir(&scenes_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let candidate = p.join(format!("{}.json", scene_id));
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    // 3. Search in presets
    let search_roots = [
        PathBuf::from(&paths.bundled_presets_dir),
        PathBuf::from("presets"),
        PathBuf::from("../presets"),
    ];

    for root in &search_roots {
        for folder in &["no-game-no-life", "sakura-succubus-3"] {
            let scene_dir = root.join(folder).join("scenes");
            if scene_dir.exists() {
                let candidate = scene_dir.join(format!("{}.json", scene_id));
                if candidate.exists() {
                    return Some(candidate);
                }
                if let Ok(entries) = fs::read_dir(&scene_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        let stem = p.file_stem().unwrap_or_default().to_string_lossy();
                        if stem == scene_id || format!("{}_{}", folder, stem) == scene_id {
                            return Some(p);
                        }
                    }
                }
            }
        }
    }

    None
}

fn parse_scene_file_preview(p: &Path, folder_label: &str, is_preset: bool) -> Option<ScenePreview> {
    let content = fs::read_to_string(p).ok()?;
    if let Ok(state) = serde_json::from_str::<SceneState>(&content) {
        let has_progress = state.chat_log.len() > 1;
        let turn_count = state.chat_log.len();
        return Some(ScenePreview {
            id: state.definition.id.clone(),
            title: state.definition.title.clone(),
            description: state.definition.description.clone(),
            party: state.definition.party.clone(),
            location: state.world.location.clone(),
            time_of_day: state.world.time_of_day.clone(),
            gm_tone: state.definition.gm_tone.clone(),
            folder: if !state.definition.folder.is_empty() {
                state.definition.folder.clone()
            } else {
                folder_label.to_string()
            },
            is_preset,
            starting_bg: state
                .current_bg
                .clone()
                .unwrap_or_else(|| state.definition.starting_bg.clone()),
            last_played: state.definition.last_played.clone(),
            has_progress,
            turn_count,
        });
    }

    if let Ok(def) = serde_json::from_str::<SceneDefinition>(&content) {
        let stem = p
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let id = if def.id.is_empty() {
            stem
        } else {
            def.id.clone()
        };
        return Some(ScenePreview {
            id,
            title: def.title.clone(),
            description: def.description.clone(),
            party: def.party.clone(),
            location: def.starting_location.clone(),
            time_of_day: def.time_of_day.clone(),
            gm_tone: def.gm_tone.clone(),
            folder: if !def.folder.is_empty() {
                def.folder.clone()
            } else {
                folder_label.to_string()
            },
            is_preset,
            starting_bg: def.starting_bg.clone(),
            last_played: def.last_played.clone(),
            has_progress: false,
            turn_count: 0,
        });
    }

    None
}

fn extract_sort_key(s: &str) -> (u32, String) {
    let lower = s.to_lowercase();
    if let Some(pos) = lower.find("kapitel ") {
        let rest = &lower[pos + 8..];
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(num) = num_str.parse::<u32>() {
            return (num, lower);
        }
    }
    if let Some(pos) = lower.find("episode ") {
        let rest = &lower[pos + 8..];
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(num) = num_str.parse::<u32>() {
            return (num, lower);
        }
    }
    if let Some(pos) = lower.find("episode") {
        let rest = &lower[pos + 7..];
        let num_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(num) = num_str.parse::<u32>() {
            return (num, lower);
        }
    }
    (9999, lower)
}

pub fn scan_available_scenes() -> Vec<ScenePreview> {
    ensure_default_scene_folders();
    let mut results = Vec::new();
    let paths = resolve_app_paths();
    let user_scenes_dir = PathBuf::from(&paths.scenes_dir);

    // 1. User scenes in data_dir/scenes (root & subfolders)
    if user_scenes_dir.exists()
        && let Ok(entries) = fs::read_dir(&user_scenes_dir)
    {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let folder_name = entry.file_name().to_string_lossy().to_string();
                if let Ok(sub_entries) = fs::read_dir(&p) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_p = sub_entry.path();
                        if sub_p.is_file()
                            && sub_p.extension().is_some_and(|ext| ext == "json")
                            && let Some(preview) =
                                parse_scene_file_preview(&sub_p, &folder_name, false)
                            && !results.iter().any(|r: &ScenePreview| r.id == preview.id)
                        {
                            results.push(preview);
                        }
                    }
                }
            } else if p.is_file()
                && p.extension().is_some_and(|ext| ext == "json")
                && let Some(preview) = parse_scene_file_preview(&p, "Eigene Szenen", false)
                && !results.iter().any(|r: &ScenePreview| r.id == preview.id)
            {
                results.push(preview);
            }
        }
    }

    // 2. Bundled presets fallback
    let search_roots = [
        PathBuf::from(&paths.bundled_presets_dir),
        PathBuf::from("presets"),
        PathBuf::from("../presets"),
    ];

    let preset_folders = [
        ("sakura-succubus-3", "Sakura Succubus 3"),
        ("no-game-no-life", "No Game No Life"),
    ];

    for root in &search_roots {
        for (folder_key, folder_label) in &preset_folders {
            let scene_dir = root.join(folder_key).join("scenes");
            if scene_dir.exists()
                && let Ok(entries) = fs::read_dir(&scene_dir)
            {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file()
                        && p.extension().is_some_and(|ext| ext == "json")
                        && let Some(preview) = parse_scene_file_preview(&p, folder_label, true)
                        && !results
                            .iter()
                            .any(|r: &ScenePreview| r.id == preview.id || r.title == preview.title)
                    {
                        results.push(preview);
                    }
                }
            }
        }
    }

    // Sort by folder, then chapter number, then title
    results.sort_by(|a, b| {
        if a.folder != b.folder {
            if a.folder == "No Game No Life" {
                return std::cmp::Ordering::Less;
            }
            if b.folder == "No Game No Life" {
                return std::cmp::Ordering::Greater;
            }
            a.folder.cmp(&b.folder)
        } else {
            let (num_a, name_a) = extract_sort_key(&a.title);
            let (num_b, name_b) = extract_sort_key(&b.title);
            if num_a != num_b {
                num_a.cmp(&num_b)
            } else {
                name_a.cmp(&name_b)
            }
        }
    });

    results
}

pub fn load_scene_by_id(scene_id: &str) -> Result<SceneState, String> {
    if let Some(path) = find_scene_path(scene_id) {
        let content = fs::read_to_string(&path)
            .map_err(|e| crate::err!("backend.stage.sceneRead", error = e))?;
        if let Ok(state) = serde_json::from_str::<SceneState>(&content) {
            return Ok(state);
        }
        if let Ok(def) = serde_json::from_str::<SceneDefinition>(&content) {
            let state = build_initial_scene_state(&def);
            let _ = save_scene_state(&state);
            return Ok(state);
        }
    }
    Err(crate::err!("backend.stage.sceneMissing", id = scene_id))
}

pub fn save_scene_state(state: &SceneState) -> Result<(), String> {
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let _ = fs::create_dir_all(&scenes_dir);

    let target_file = if let Some(existing_path) = find_scene_path(&state.definition.id) {
        if existing_path.starts_with(&scenes_dir) {
            existing_path
        } else {
            let folder_dir = if !state.definition.folder.is_empty()
                && state.definition.folder != "Eigene Szenen"
            {
                scenes_dir.join(&state.definition.folder)
            } else {
                scenes_dir.clone()
            };
            let _ = fs::create_dir_all(&folder_dir);
            folder_dir.join(format!("{}.json", state.definition.id))
        }
    } else {
        let folder_dir =
            if !state.definition.folder.is_empty() && state.definition.folder != "Eigene Szenen" {
                scenes_dir.join(&state.definition.folder)
            } else {
                scenes_dir.clone()
            };
        let _ = fs::create_dir_all(&folder_dir);
        folder_dir.join(format!("{}.json", state.definition.id))
    };

    if target_file.exists() {
        let bak_file = target_file.with_extension("json.bak");
        let _ = fs::copy(&target_file, &bak_file);
    }

    let json_data = serde_json::to_string_pretty(state)
        .map_err(|e| crate::err!("backend.stage.sceneSerialize", error = e))?;

    fs::write(&target_file, json_data).map_err(|e| {
        format!(
            "Fehler beim Speichern der Szene in {:?}: {}",
            target_file, e
        )
    })?;

    Ok(())
}

pub fn reset_stage_scene(scene_id: &str) -> Result<SceneState, String> {
    let current_state = load_scene_by_id(scene_id)?;
    let fresh_state = build_initial_scene_state(&current_state.definition);
    save_scene_state(&fresh_state)?;
    Ok(fresh_state)
}

pub fn list_stage_folders() -> Result<Vec<String>, String> {
    ensure_default_scene_folders();
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let mut folders = Vec::new();

    folders.push("No Game No Life".to_string());
    folders.push("Sakura Succubus 3".to_string());
    folders.push("Eigene Szenen".to_string());

    if let Ok(entries) = fs::read_dir(&scenes_dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !folders.iter().any(|f| f.eq_ignore_ascii_case(&name)) {
                    folders.push(name);
                }
            }
        }
    }

    folders.sort();
    Ok(folders)
}

pub fn create_stage_folder(folder_name: &str) -> Result<(), String> {
    let clean = folder_name.trim();
    if clean.is_empty() || clean.contains('/') || clean.contains('\\') || clean.contains("..") {
        return Err(crate::err!("backend.stage.folderNameInvalid"));
    }
    let paths = resolve_app_paths();
    let target = PathBuf::from(&paths.scenes_dir).join(clean);
    fs::create_dir_all(&target).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    Ok(())
}

pub fn move_stage_scene_to_folder(
    scene_id: &str,
    target_folder: &str,
) -> Result<SceneState, String> {
    let mut state = load_scene_by_id(scene_id)?;
    let old_path = find_scene_path(scene_id);
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);

    let clean_folder = target_folder.trim();
    let target_dir = if clean_folder.is_empty() || clean_folder == "Eigene Szenen" {
        scenes_dir.clone()
    } else {
        scenes_dir.join(clean_folder)
    };
    fs::create_dir_all(&target_dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;

    state.definition.folder = if clean_folder.is_empty() {
        "Eigene Szenen".to_string()
    } else {
        clean_folder.to_string()
    };

    let new_path = target_dir.join(format!("{}.json", scene_id));
    let json_data = serde_json::to_string_pretty(&state)
        .map_err(|e| crate::err!("backend.stage.sceneSerialize", error = e))?;
    fs::write(&new_path, json_data).map_err(|e| {
        crate::err!(
            "backend.common.fileWritePath",
            path = format!("{:?}", new_path),
            error = e
        )
    })?;

    if let Some(old) = old_path
        && old != new_path
        && old.starts_with(&scenes_dir)
    {
        let _ = fs::remove_file(&old);
        let old_bak = old.with_extension("json.bak");
        if old_bak.exists() {
            let _ = fs::remove_file(old_bak);
        }
    }

    Ok(state)
}

pub fn delete_stage_folder(folder_name: &str) -> Result<(), String> {
    let clean = folder_name.trim();
    if clean == "No Game No Life" || clean == "Eigene Szenen" {
        return Err(crate::err!("backend.stage.folderBuiltin"));
    }
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let folder_path = scenes_dir.join(clean);
    if !folder_path.exists() {
        return Err(crate::err!("backend.stage.folderMissing"));
    }

    // Move any contained scenes to root scenes_dir
    if let Ok(entries) = fs::read_dir(&folder_path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file()
                && p.extension().is_some_and(|ext| ext == "json")
                && let Some(name) = p.file_name()
            {
                let dest = scenes_dir.join(name);
                let _ = fs::rename(&p, &dest);
            }
        }
    }
    let _ = fs::remove_dir_all(&folder_path);
    Ok(())
}

pub fn import_stage_scene_json(
    json_content: &str,
    target_folder: Option<&str>,
) -> Result<SceneState, String> {
    let clean_folder = target_folder.unwrap_or("Eigene Szenen");
    if let Ok(mut state) = serde_json::from_str::<SceneState>(json_content) {
        if state.definition.id.trim().is_empty() {
            state.definition.id = format!("scene_{}", Utc::now().timestamp_millis());
        }
        state.definition.folder = clean_folder.to_string();
        save_scene_state(&state)?;
        return Ok(state);
    }

    if let Ok(mut def) = serde_json::from_str::<SceneDefinition>(json_content) {
        if def.id.trim().is_empty() {
            def.id = format!("scene_{}", Utc::now().timestamp_millis());
        }
        def.folder = clean_folder.to_string();
        let state = build_initial_scene_state(&def);
        save_scene_state(&state)?;
        return Ok(state);
    }

    Err(crate::err!("backend.stage.invalidSceneFile"))
}

pub fn export_stage_scene_json(scene_id: &str) -> Result<String, String> {
    let state = load_scene_by_id(scene_id)?;
    serde_json::to_string_pretty(&state).map_err(|e| crate::err!("backend.stage.export", error = e))
}

pub fn create_custom_scene(mut def: SceneDefinition) -> Result<SceneState, String> {
    if def.id.trim().is_empty() {
        def.id = format!("custom_scene_{}", Utc::now().timestamp_millis());
    }
    def.created_at = Utc::now().to_rfc3339();
    def.last_played = Some(Utc::now().to_rfc3339());
    let state = build_initial_scene_state(&def);
    save_scene_state(&state)?;
    Ok(state)
}

pub fn delete_scene(scene_id: &str) -> Result<(), String> {
    if let Some(target_file) = find_scene_path(scene_id) {
        let paths = resolve_app_paths();
        let scenes_dir = PathBuf::from(&paths.scenes_dir);
        if target_file.starts_with(&scenes_dir) {
            let bak_file = target_file.with_extension("json.bak");
            if bak_file.exists() {
                let _ = fs::remove_file(bak_file);
            }
            fs::remove_file(target_file)
                .map_err(|e| crate::err!("backend.common.delete", error = e))?;
        }
    }
    Ok(())
}

pub fn edit_stage_turn_message(
    engine: &StageEngine,
    scene_id: &str,
    message_id: &str,
    new_content: &str,
) -> Result<SceneState, String> {
    edit_stage_turn_message_with_saver(engine, scene_id, message_id, new_content, save_scene_state)
}

fn edit_stage_turn_message_with_saver(
    engine: &StageEngine,
    scene_id: &str,
    message_id: &str,
    new_content: &str,
    save: impl FnOnce(&SceneState) -> Result<(), String>,
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }
    engine.push_snapshot(scene_id, state.clone());

    if let Some(msg) = state.chat_log.iter_mut().find(|m| m.id == message_id) {
        msg.content = new_content.to_string();
        save(&state)?;
        engine.set_state(state.clone());
        Ok(state)
    } else {
        Err(crate::err!("backend.stage.messageMissing", id = message_id))
    }
}

pub fn delete_stage_turn_message(
    engine: &StageEngine,
    scene_id: &str,
    message_id: &str,
) -> Result<SceneState, String> {
    delete_stage_turn_message_with_saver(engine, scene_id, message_id, save_scene_state)
}

fn delete_stage_turn_message_with_saver(
    engine: &StageEngine,
    scene_id: &str,
    message_id: &str,
    save: impl FnOnce(&SceneState) -> Result<(), String>,
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }
    engine.push_snapshot(scene_id, state.clone());

    state.chat_log.retain(|m| m.id != message_id);
    save(&state)?;
    engine.set_state(state.clone());
    Ok(state)
}

pub async fn regenerate_stage_turn(
    engine: &StageEngine,
    inference: &InferenceClient,
    scene_id: &str,
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }

    let player_idx = state
        .chat_log
        .iter()
        .rposition(|m| m.sender_role == "player");

    if let Some(idx) = player_idx {
        let player_msg = state.chat_log[idx].clone();
        state.chat_log.truncate(idx);
        save_scene_state(&state)?;
        engine.set_state(state);

        execute_stage_turn(
            engine,
            inference,
            StageTurnRequest {
                scene_id: scene_id.to_string(),
                user_input: player_msg.content,
                turn_mode: player_msg.turn_mode,
                whisper_target: player_msg.whisper_target,
                force_next_actor: None,
            },
        )
        .await
    } else {
        let fresh = reset_stage_scene(scene_id)?;
        engine.set_state(fresh.clone());
        Ok(fresh)
    }
}

pub fn get_stage_background_image(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("none") {
        return Ok(String::new());
    }
    if trimmed.starts_with("data:image/")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
    {
        return Ok(trimmed.to_string());
    }

    let paths = resolve_app_paths();
    let search_dirs = [
        PathBuf::from(&paths.bundled_presets_dir)
            .join("no-game-no-life")
            .join("backgrounds"),
        PathBuf::from(&paths.bundled_presets_dir)
            .join("sakura-succubus-3")
            .join("backgrounds"),
        PathBuf::from("presets/no-game-no-life/backgrounds"),
        PathBuf::from("presets/sakura-succubus-3/backgrounds"),
        PathBuf::from(&paths.data_dir).join("backgrounds"),
        PathBuf::from("assets/backgrounds"),
        PathBuf::from("../assets/backgrounds"),
    ];

    let candidates = [
        trimmed.to_string(),
        format!("{}.png", trimmed),
        format!("{}.jpg", trimmed),
        format!("{}.jpeg", trimmed),
        format!("{}.webp", trimmed),
    ];

    for dir in &search_dirs {
        for candidate in &candidates {
            let file_path = dir.join(candidate);
            if file_path.exists()
                && file_path.is_file()
                && let Ok(bytes) = fs::read(&file_path)
            {
                let ext = file_path
                    .extension()
                    .map_or("png", |e| e.to_str().unwrap_or("png"))
                    .to_lowercase();
                let mime = match ext.as_str() {
                    "jpg" | "jpeg" => "image/jpeg",
                    "webp" => "image/webp",
                    _ => "image/png",
                };
                return Ok(format!(
                    "data:{};base64,{}",
                    mime,
                    BASE64_STANDARD.encode(&bytes)
                ));
            }
        }
    }

    Err(crate::err!(
        "backend.stage.backgroundMissing",
        name = trimmed
    ))
}

pub fn export_scene_to_markdown(scene_id: &str) -> Result<String, String> {
    let state = load_scene_by_id(scene_id)?;
    let mut md = format!("# {}\n\n", state.definition.title);
    md.push_str(&format!(
        "**Ort:** {} | **Zeit:** {} | **Spielleiter-Ton:** {}\n\n",
        state.world.location, state.world.time_of_day, state.definition.gm_tone
    ));
    md.push_str(&format!("*{}*\n\n---\n\n", state.definition.description));

    if !state.objectives.is_empty() {
        md.push_str("## Kampagnenziele\n\n");
        for objective in &state.objectives {
            md.push_str(&format!(
                "- [{}] **{}** — {}/{}: {}\n",
                if objective.status == "completed" {
                    "x"
                } else {
                    " "
                },
                objective.title,
                objective.current,
                objective.max,
                objective.description
            ));
        }
        md.push('\n');
    }
    if !state.inventory.is_empty() {
        md.push_str("## Inventar\n\n");
        for item in &state.inventory {
            md.push_str(&format!(
                "- **{}** ×{} — {}\n",
                item.name, item.quantity, item.description
            ));
        }
        md.push('\n');
    }
    if !state.consequence_ledger.is_empty() {
        md.push_str("## Dauerhafte Konsequenzen\n\n");
        for entry in &state.consequence_ledger {
            md.push_str(&format!("- {}\n", entry.text));
        }
        md.push('\n');
    }
    md.push_str("## Abenteuer-Protokoll\n\n");

    for msg in &state.chat_log {
        let timestamp_str = chrono::DateTime::from_timestamp(msg.timestamp as i64, 0)
            .map(|dt| dt.format("%H:%M").to_string())
            .unwrap_or_default();

        match msg.sender_role.as_str() {
            "gm" => {
                md.push_str(&format!(
                    "### 🎲 Game Master ({})\n\n{}\n\n",
                    timestamp_str, msg.content
                ));
            }
            "player" => {
                let mode_icon = match msg.turn_mode.as_str() {
                    "say" => "💬",
                    "do" => "⚔️",
                    "think" => "💭",
                    "whisper" => "🤫",
                    _ => "🎬",
                };
                md.push_str(&format!(
                    "**{} {}** ({})  \n{}\n\n",
                    mode_icon, msg.sender_name, timestamp_str, msg.content
                ));
            }
            "companion" => {
                md.push_str(&format!(
                    "**🌸 {}** ({})  \n{}\n\n",
                    msg.sender_name, timestamp_str, msg.content
                ));
            }
            _ => {
                md.push_str(&format!(
                    "**{}** ({})  \n{}\n\n",
                    msg.sender_name, timestamp_str, msg.content
                ));
            }
        }
    }

    Ok(md)
}

// ==========================================
// 8. Turn Orchestrator Execution
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageTurnRequest {
    pub scene_id: String,
    #[serde(alias = "player_input")]
    pub user_input: String,
    #[serde(default = "default_turn_mode")]
    pub turn_mode: String, // "say" | "do" | "think" | "direct" | "whisper"
    #[serde(default, alias = "target_actor")]
    pub whisper_target: Option<String>,
    #[serde(default)]
    pub force_next_actor: Option<String>,
}

pub async fn execute_stage_turn(
    engine: &StageEngine,
    inference: &InferenceClient,
    req: StageTurnRequest,
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != req.scene_id {
        state = load_scene_by_id(&req.scene_id)?;
    }

    // 0. Snapshot for Undo
    engine.push_snapshot(&state.definition.id, state.clone());

    let settings = load_app_settings();
    let (endpoint_url, api_key, model_name, provider) = if settings.selected_backend == "cloud" {
        (
            settings.cloud_endpoint.clone(),
            if settings.cloud_api_key.is_empty() {
                None
            } else {
                Some(settings.cloud_api_key.clone())
            },
            if settings.cloud_model.is_empty() {
                None
            } else {
                Some(settings.cloud_model.clone())
            },
            Some(
                crate::modules::providers::ProviderRegistry::detect_provider(
                    &settings.cloud_endpoint,
                    None,
                ),
            ),
        )
    } else {
        (
            format!(
                "http://127.0.0.1:{}/v1/chat/completions",
                settings.server_config.port
            ),
            None,
            None,
            Some(crate::modules::providers::LlmProviderType::LocalLlama),
        )
    };

    let user_name = if !state.definition.persona.is_empty() {
        state.definition.persona.clone()
    } else {
        "Spieler".to_string()
    };

    // 1. Append Player Turn Message if non-empty
    let clean_input = req.user_input.trim();
    if !clean_input.is_empty() {
        let player_msg = SceneTurnMessage {
            id: format!("msg_{}", Utc::now().timestamp_millis()),
            sender_id: "player".to_string(),
            sender_name: user_name.clone(),
            sender_role: "player".to_string(),
            avatar_url: None,
            content: clean_input.to_string(),
            turn_mode: req.turn_mode.clone(),
            whisper_target: req.whisper_target.clone(),
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
        };
        state.chat_log.push(player_msg);
    }

    // 2. Build Planner Context & Call LLM for GmPlan
    let party_list = if state.definition.party.is_empty() {
        "Keine".to_string()
    } else {
        state.definition.party.join(", ")
    };

    let clock_context = state
        .clocks
        .iter()
        .map(|clock| {
            format!(
                "{} [{}]: {}/{}",
                clock.name, clock.id, clock.current, clock.max
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    let objective_context = state
        .objectives
        .iter()
        .map(|objective| {
            format!(
                "{} [{}]: {}/{} ({})",
                objective.title, objective.id, objective.current, objective.max, objective.status
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    let arc_context = state
        .arcs
        .iter()
        .map(|arc| {
            format!(
                "{} [{}]: {}/{}{}",
                arc.title,
                arc.id,
                arc.stage,
                arc.max_stage,
                if arc.is_revealed {
                    " sichtbar"
                } else {
                    " verborgen"
                }
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    let inventory_context = state
        .inventory
        .iter()
        .map(|item| format!("{} x{} [{}]", item.name, item.quantity, item.id))
        .collect::<Vec<_>>()
        .join("; ");
    let combat_context = if state.combat.is_active {
        state
            .combat
            .combatants
            .iter()
            .map(|combatant| {
                format!(
                    "{} [{}]: {}/{} HP",
                    combatant.name, combatant.role, combatant.hp, combatant.max_hp
                )
            })
            .collect::<Vec<_>>()
            .join("; ")
    } else {
        "kein aktiver Kampf".to_string()
    };

    let recent_history: Vec<String> = state
        .chat_log
        .iter()
        .rev()
        .take(6)
        .rev()
        .map(|m| format!("{}: {}", m.sender_name, m.content))
        .collect();

    // Scan bound lorebooks for Stage-Lore
    let mut active_lore_snippets = Vec::new();
    if !state.definition.lorebook.is_empty() {
        let all_lorebooks = crate::modules::lorebook::scan_available_lorebooks();
        let text_to_scan = format!("{}\n{}", clean_input, recent_history.join("\n"));
        for lb_name in &state.definition.lorebook {
            if let Some(lb) = all_lorebooks.iter().find(|l| {
                l.name.eq_ignore_ascii_case(lb_name) || l.id.eq_ignore_ascii_case(lb_name)
            }) {
                let triggered = crate::modules::lorebook::evaluate_lorebooks(
                    std::slice::from_ref(lb),
                    &text_to_scan,
                    0,
                );
                for entry in triggered
                    .passive_entries
                    .iter()
                    .chain(triggered.active_entries.iter())
                {
                    if !active_lore_snippets
                        .iter()
                        .any(|s: &String| s.contains(&entry.name))
                    {
                        active_lore_snippets
                            .push(format!("[LORE: {}] {}", entry.name, entry.content));
                    }
                }
            }
        }
    }
    let lore_context = if active_lore_snippets.is_empty() {
        "keine".to_string()
    } else {
        active_lore_snippets.join("\n")
    };

    let planner_system_prompt = format!(
        r#"[SOUL STAGE — GAME MASTER PLANNER]
Du bist der Spielleiter (Game Master) für ein immersives Tabletop-RPG im Genre/Ton "{tone}".
Narrator-Stil: {narrator_style}
Szenen-Kontext: {world_context}
Stage-Lore / Weltwissen:
{lore_context}
Aktueller Ort: {location} ({time_of_day}, Wetter: {weather})
Gruppe: {party}
Spieler: {user_name}
Kampagnen-Uhren: {clocks}
Ziele: {objectives}
Story-Arcs: {arcs}
Inventar: {inventory}
Kampf: {combat}

AUFGABE:
Analysiere die jüngste Aktion des Spielers und plane den nächsten dramatischen Beat.
Antworte AUSSCHLIESSLICH mit einem einzigen, gültigen JSON-Objekt im folgenden Format:
{{
  "narration_plan": "Kurze Regie-Anweisung, was jetzt geschieht und enthüllt wird",
  "location": null,
  "time_of_day": null,
  "weather": null,
  "bg_image": null,
  "ambient_audio": null,
  "next_actor": "{first_party_or_player}",
  "dice_check": null,
  "campaign_clock_updates": [],
  "resource_delta": null,
  "story_arc_updates": [],
  "objective_updates": [],
  "inventory_add": [],
  "inventory_remove": [],
  "encounter": null,
  "player_choices": [
    {{"text": "Aktion 1", "badge": "Wahrnehmung (DC 14)", "action_type": "do"}},
    {{"text": "Aktion 2", "badge": null, "action_type": "say"}},
    {{"text": "Aktion 3", "badge": null, "action_type": "do"}}
  ],
  "lasting_consequence": null,
  "discovery": null
}}

REGELN:
- dice_check: Wenn eine anspruchsvolle Probe nötig ist, gib z.B. {{"formula": "1d20+3", "dc": 14, "skill_name": "Wahrnehmung"}} an, sonst null.
- next_actor: Wer soll nach der Spielleiter-Schilderung sprechen? Ein Gruppenmitglied aus [{party}] oder "PLAYER".
- bg_image: Optional Name eines neuen passenden Hintergrundbildes (z.B. "Horizontal Elkia Grand Library.png") oder null.
- resource_delta: Optional {{"target":"PLAYER oder Name", "hp_delta":-5, "stress_delta":10}}.
- story_arc_updates: Optional {{"id":"arc-id", "stage_delta":1, "reveal":true, "resolve":false}}.
- objective_updates: Optional {{"id":"objective-id", "title":"", "description":"", "progress_delta":1, "max":3, "status":"active|completed|failed"}}.
- inventory_add: Optional Gegenstände mit name, description, quantity, item_type und optional hp_restore/stress_restore/clears_condition. inventory_remove enthält IDs oder Namen.
- encounter: Nur bei Kampfänderungen: {{"action":"start|update|end", "enemies":[{{"name":"Gegner", "hp":12, "role":"enemy"}}], "hp_updates":[{{"target":"Name", "hp_delta":-4}}]}}.
- Antworte NUR als reines JSON ohne Erklärungen oder Markdown davor/danach!"#,
        tone = state.definition.gm_tone,
        narrator_style = state.definition.narrator_style,
        world_context = state.definition.world_context,
        lore_context = lore_context,
        location = state.world.location,
        time_of_day = state.world.time_of_day,
        weather = state.world.weather,
        party = party_list,
        user_name = user_name,
        clocks = if clock_context.is_empty() {
            "keine"
        } else {
            &clock_context
        },
        objectives = if objective_context.is_empty() {
            "keine"
        } else {
            &objective_context
        },
        arcs = if arc_context.is_empty() {
            "keine"
        } else {
            &arc_context
        },
        inventory = if inventory_context.is_empty() {
            "leer"
        } else {
            &inventory_context
        },
        combat = combat_context,
        first_party_or_player = state
            .definition
            .party
            .first()
            .cloned()
            .unwrap_or_else(|| "PLAYER".to_string())
    );

    let planner_user_prompt = format!(
        "=== LETZTER VERLAUF ===\n{}\n\n=== AKTUELLE AKTION VON {} ===\nModus: {}\nInhalt: {}\n\nPlane den nächsten Beat als JSON:",
        recent_history.join("\n"),
        user_name,
        req.turn_mode,
        clean_input
    );

    let planner_messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: planner_system_prompt,
        },
        ChatMessage {
            role: "user".to_string(),
            content: planner_user_prompt,
        },
    ];

    let plan_req = ChatRequest {
        endpoint_url: endpoint_url.clone(),
        api_key: api_key.clone(),
        model: model_name.clone(),
        messages: planner_messages,
        sampling: Some(SamplingParams {
            temperature: Some(0.15),
            top_p: Some(0.9),
            max_tokens: Some(1000),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: provider.clone(),
    };

    let plan_raw = inference
        .generate_direct(plan_req)
        .await
        .unwrap_or_default();
    let gm_plan = repair_and_parse_gm_plan(&plan_raw);

    // 3. Resolve Mechanics (Dice, Clocks, Resources)
    let mut dice_outcome_text = String::new();
    let mut dice_event_card = None;
    let mut secondary_event_cards: Vec<(String, StageEventCard)> = Vec::new();

    if let Some(check) = &gm_plan.dice_check
        && state.definition.dice_rolls_enabled
        && let Ok(roll) = roll_dice(&check.formula, Some(check.dc))
    {
        let passed = roll.dc_check.as_ref().is_some_and(|d| d.passed);
        dice_outcome_text = format!(
            "\n[WÜRFELPROBE {}: Formel {}, Wurf={}, Summe={}. DC={}. Ergebnis: {}]",
            check.skill_name.to_uppercase(),
            roll.formula,
            roll.individual_rolls
                .iter()
                .map(|r| r.to_string())
                .collect::<Vec<_>>()
                .join("+"),
            roll.sum,
            check.dc,
            if passed {
                "ERFOLGREICH"
            } else {
                "FEHLGESCHLAGEN"
            }
        );

        dice_event_card = Some(StageEventCard::DiceRoll(DiceEventData {
            formula: roll.formula,
            rolls: roll.individual_rolls,
            modifier: roll.modifier,
            total: roll.sum,
            target_dc: Some(check.dc),
            passed: Some(passed),
            is_crit_success: roll.is_critical_success,
            is_crit_fail: roll.is_critical_failure,
        }));
    }

    // Apply World updates from Plan
    if let Some(loc) = &gm_plan.location
        && !loc.trim().is_empty()
    {
        state.world.location = loc.clone();
    }
    if let Some(tod) = &gm_plan.time_of_day
        && !tod.trim().is_empty()
    {
        state.world.time_of_day = tod.clone();
    }
    if let Some(wth) = &gm_plan.weather
        && !wth.trim().is_empty()
    {
        state.world.weather = wth.clone();
    }
    if let Some(bg) = &gm_plan.bg_image
        && !bg.trim().is_empty()
        && !state.definition.lock_bg
    {
        state.definition.starting_bg = bg.clone();
        state.current_bg = Some(bg.clone());
    }

    // Apply Clock updates
    for clk_up in &gm_plan.campaign_clock_updates {
        if let Some(c) = state.clocks.iter_mut().find(|c| c.id == clk_up.id) {
            let new_val = (c.current as i32 + clk_up.delta).clamp(0, c.max as i32) as u32;
            c.current = new_val;
            secondary_event_cards.push((
                format!("Die Kampagnen-Uhr „{}“ verändert sich.", c.name),
                StageEventCard::ClockUpdate(ClockUpdateData {
                    clock_id: c.id.clone(),
                    clock_name: c.name.clone(),
                    delta: clk_up.delta,
                    current: c.current,
                    max: c.max,
                }),
            ));
        }
    }

    if let Some(delta) = &gm_plan.resource_delta {
        let target = delta.target.trim();
        if let Some(combatant) = state.combat.combatants.iter_mut().find(|combatant| {
            (target.eq_ignore_ascii_case("PLAYER") && combatant.role == "player")
                || combatant.name.eq_ignore_ascii_case(target)
                || combatant.id.eq_ignore_ascii_case(target)
        }) {
            combatant.hp = (combatant.hp + delta.hp_delta).clamp(0, combatant.max_hp);
            combatant.stress =
                (combatant.stress + delta.stress_delta).clamp(0, combatant.max_stress);
            state.combat.combat_log.push(format!(
                "{}: HP {:+}, Stress {:+}",
                combatant.name, delta.hp_delta, delta.stress_delta
            ));
        }
    }

    for update in &gm_plan.story_arc_updates {
        if let Some(arc) = state.arcs.iter_mut().find(|arc| arc.id == update.id) {
            arc.stage =
                (arc.stage as i32 + update.stage_delta).clamp(0, arc.max_stage as i32) as u32;
            arc.is_revealed |= update.reveal;
            arc.is_resolved |= update.resolve || arc.stage >= arc.max_stage;
            if update.reveal || update.resolve || update.stage_delta != 0 {
                secondary_event_cards.push((
                    format!("Story-Arc aktualisiert: {}", arc.title),
                    StageEventCard::Discovery {
                        text: format!(
                            "{} — Fortschritt {}/{}{}",
                            arc.title,
                            arc.stage,
                            arc.max_stage,
                            if arc.is_resolved {
                                " (abgeschlossen)"
                            } else {
                                ""
                            }
                        ),
                    },
                ));
            }
        }
    }

    for update in &gm_plan.objective_updates {
        if let Some(objective) = state
            .objectives
            .iter_mut()
            .find(|objective| objective.id == update.id)
        {
            if !update.title.trim().is_empty() {
                objective.title = update.title.clone();
            }
            if !update.description.trim().is_empty() {
                objective.description = update.description.clone();
            }
            if let Some(maximum) = update.max {
                objective.max = maximum.max(1);
            }
            objective.current = (objective.current as i32 + update.progress_delta)
                .clamp(0, objective.max as i32) as u32;
            if let Some(status) = &update.status {
                objective.status = status.clone();
            }
            if objective.current >= objective.max && objective.status == "active" {
                objective.status = "completed".to_string();
            }
        } else if !update.title.trim().is_empty() {
            let maximum = update.max.unwrap_or(1).max(1);
            state.objectives.push(CampaignObjective {
                id: update.id.clone(),
                title: update.title.clone(),
                description: update.description.clone(),
                current: update.progress_delta.max(0).min(maximum as i32) as u32,
                max: maximum,
                status: update
                    .status
                    .clone()
                    .unwrap_or_else(default_objective_status),
            });
        }
    }

    for addition in &gm_plan.inventory_add {
        if let Some(existing) = state
            .inventory
            .iter_mut()
            .find(|item| item.name.eq_ignore_ascii_case(&addition.name))
        {
            existing.quantity = existing.quantity.saturating_add(addition.quantity.max(1));
        } else if !addition.name.trim().is_empty() {
            state.inventory.push(InventoryItem {
                id: format!("item_{}", Utc::now().timestamp_micros()),
                name: addition.name.clone(),
                description: addition.description.clone(),
                quantity: addition.quantity.max(1),
                item_type: addition.item_type.clone(),
                hp_restore: addition.hp_restore,
                stress_restore: addition.stress_restore,
                clears_condition: addition.clears_condition.clone(),
            });
        }
    }
    for removal in &gm_plan.inventory_remove {
        if let Some(index) = state.inventory.iter().position(|item| {
            item.id.eq_ignore_ascii_case(removal) || item.name.eq_ignore_ascii_case(removal)
        }) {
            if state.inventory[index].quantity > 1 {
                state.inventory[index].quantity -= 1;
            } else {
                state.inventory.remove(index);
            }
        }
    }

    if let Some(encounter) = &gm_plan.encounter {
        match encounter.action.as_str() {
            "start" => {
                state.combat.is_active = true;
                state.combat.round = 1;
                state.combat.current_turn_index = 0;
                state.combat.combatants.retain(|combatant| {
                    combatant.role == "player" || combatant.role == "companion"
                });
                if !state
                    .combat
                    .combatants
                    .iter()
                    .any(|combatant| combatant.role == "player")
                {
                    state.combat.combatants.push(Combatant {
                        id: "player".to_string(),
                        name: user_name.clone(),
                        role: "player".to_string(),
                        hp: 50,
                        max_hp: 50,
                        stress: 0,
                        max_stress: 100,
                        initiative: rand::rng().random_range(1..=20),
                        conditions: Vec::new(),
                    });
                }
                for (index, enemy) in encounter.enemies.iter().enumerate() {
                    state.combat.combatants.push(Combatant {
                        id: format!("enemy_{}_{}", Utc::now().timestamp_millis(), index),
                        name: enemy.name.clone(),
                        role: enemy.role.clone(),
                        hp: enemy.hp.max(1),
                        max_hp: enemy.hp.max(1),
                        stress: 0,
                        max_stress: 0,
                        initiative: rand::rng().random_range(1..=20),
                        conditions: Vec::new(),
                    });
                }
                state
                    .combat
                    .combatants
                    .sort_by_key(|c| std::cmp::Reverse(c.initiative));
                secondary_event_cards.push((
                    "Eine Kampfbegegnung beginnt.".to_string(),
                    StageEventCard::Combat {
                        action: "started".to_string(),
                        text: "Initiative wird gewürfelt — der Kampf beginnt!".to_string(),
                    },
                ));
            }
            "end" => {
                state.combat.is_active = false;
                secondary_event_cards.push((
                    "Die Kampfbegegnung endet.".to_string(),
                    StageEventCard::Combat {
                        action: "ended".to_string(),
                        text: "Der Kampf ist beendet.".to_string(),
                    },
                ));
            }
            _ => {}
        }
        for update in &encounter.hp_updates {
            if let Some(target) = state.combat.combatants.iter_mut().find(|combatant| {
                combatant.name.eq_ignore_ascii_case(&update.target) || combatant.id == update.target
            }) {
                target.hp = (target.hp + update.hp_delta).clamp(0, target.max_hp);
            }
        }
        if state.combat.is_active
            && state
                .combat
                .combatants
                .iter()
                .filter(|combatant| combatant.role == "enemy" || combatant.role == "boss")
                .all(|combatant| combatant.hp == 0)
        {
            state.combat.is_active = false;
        }
    }

    if let Some(discovery) = &gm_plan.discovery
        && !discovery.trim().is_empty()
    {
        secondary_event_cards.push((
            discovery.clone(),
            StageEventCard::Discovery {
                text: discovery.clone(),
            },
        ));
    }
    if let Some(consequence) = &gm_plan.lasting_consequence
        && !consequence.trim().is_empty()
    {
        state.consequence_ledger.push(ConsequenceEntry {
            id: format!("consequence_{}", Utc::now().timestamp_millis()),
            text: consequence.clone(),
            created_at: Utc::now().to_rfc3339(),
        });
        secondary_event_cards.push((
            consequence.clone(),
            StageEventCard::Consequence {
                text: consequence.clone(),
            },
        ));
    }

    // 4. GM Executor: Generate Narrative prose
    let executor_system_prompt = format!(
        r#"[SOUL STAGE — GAME MASTER NARRATOR]
Du bist der Game Master im Genre "{tone}".
Schreibe die Schilderung dessen, was geschieht, im folgenden Stil:
{narrator_style}

Szenenort: {location} ({time_of_day}, {weather})
Gruppe: {party}
Spieler: {user_name}

Anweisung des Plans:
{narration_plan}
{dice_outcome}

REGELN:
- Verfasse packende, atmosphärische Schilderung auf Deutsch im Präsens.
- Falls eine Würfelprobe vorliegt, flechte deren Ausgang logisch und dramatisch ein.
- Antworte NUR mit der Schilderung, ohne Meta-Kommentare oder Anreden."#,
        tone = state.definition.gm_tone,
        narrator_style = state.definition.narrator_style,
        location = state.world.location,
        time_of_day = state.world.time_of_day,
        weather = state.world.weather,
        party = party_list,
        user_name = user_name,
        narration_plan = gm_plan.narration_plan,
        dice_outcome = dice_outcome_text
    );

    let executor_messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: executor_system_prompt,
        },
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                "Beschreibe das Geschehen basierend auf der Aktion: '{}'",
                clean_input
            ),
        },
    ];

    let exec_req = ChatRequest {
        endpoint_url: endpoint_url.clone(),
        api_key: api_key.clone(),
        model: model_name.clone(),
        messages: executor_messages,
        sampling: Some(SamplingParams {
            temperature: Some(0.7),
            top_p: Some(0.9),
            max_tokens: Some(1500),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: provider.clone(),
    };

    let narration_content = inference
        .generate_direct(exec_req)
        .await
        .unwrap_or_else(|_| gm_plan.narration_plan.clone());

    let gm_turn_msg = SceneTurnMessage {
        id: format!("msg_{}", Utc::now().timestamp_millis()),
        sender_id: "gm".to_string(),
        sender_name: "Game Master".to_string(),
        sender_role: "gm".to_string(),
        avatar_url: None,
        content: narration_content.clone(),
        turn_mode: "do".to_string(),
        whisper_target: None,
        event_card: dice_event_card,
        timestamp: Utc::now().timestamp() as u64,
    };
    state.chat_log.push(gm_turn_msg);

    for (index, (content, card)) in secondary_event_cards.into_iter().enumerate() {
        state.chat_log.push(SceneTurnMessage {
            id: format!("msg_{}_{}", Utc::now().timestamp_millis(), index),
            sender_id: "system".to_string(),
            sender_name: "Kampagnen-Chronik".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content,
            turn_mode: "direct".to_string(),
            whisper_target: None,
            event_card: Some(card),
            timestamp: Utc::now().timestamp() as u64,
        });
    }

    // 5. Next Actor Turn (Party Member reactions up to max_actor_depth)
    let initial_next = req
        .force_next_actor
        .as_deref()
        .filter(|actor| !actor.trim().is_empty())
        .or(gm_plan.next_actor.as_deref())
        .unwrap_or("PLAYER")
        .to_string();

    let max_depth = state.definition.max_actor_depth.max(1);
    let mut current_actor = initial_next;
    let mut actor_depth = 0;
    let mut spoken_actors = std::collections::HashSet::new();

    while current_actor != "PLAYER" && actor_depth < max_depth {
        actor_depth += 1;
        state.current_turn_actor = current_actor.clone();
        spoken_actors.insert(current_actor.to_lowercase());

        if state.combat.is_active
            && let Some(index) = state.combat.combatants.iter().position(|combatant| {
                (current_actor == "PLAYER" && combatant.role == "player")
                    || combatant.name.eq_ignore_ascii_case(&current_actor)
            })
        {
            if index < state.combat.current_turn_index {
                state.combat.round += 1;
            }
            state.combat.current_turn_index = index;
        }

        if state
            .definition
            .party
            .iter()
            .any(|p| p.eq_ignore_ascii_case(&current_actor))
        {
            let all_chars = scan_available_characters();
            let matched_char = all_chars
                .iter()
                .find(|c| c.card.data.name.eq_ignore_ascii_case(&current_actor));

            let lore_section = if !active_lore_snippets.is_empty() {
                format!(
                    "\n\nAktive Welt- und Szenen-Informationen:\n{}",
                    active_lore_snippets.join("\n---\n")
                )
            } else {
                String::new()
            };

            let companion_system = if let Some(ch) = matched_char {
                format!(
                    r#"Du bist {name}.
Persönlichkeit: {personality}
Hintergrund: {description}
Szenen-Kontext: {world_context}{lore_section}

Reagiere nun aus der Ich-Perspektive auf das, was der Spielleiter, {user_name} und eventuelle Gefährten soeben getan oder gesagt haben.
Bleibe absolut in deiner Rolle, nutze deine eigene Stimme und drücke deine Gefühle lebendig und authentisch aus. Fasse dich prägnant."#,
                    name = ch.card.data.name,
                    personality = ch.card.data.personality,
                    description = ch.card.data.description,
                    world_context = state.definition.world_context,
                    lore_section = lore_section,
                    user_name = user_name
                )
            } else {
                format!(
                    "Du bist {}. Reagiere aus deiner Sicht auf das Geschehen.{lore_section}",
                    current_actor,
                    lore_section = lore_section
                )
            };

            let recent_history_dialogue: Vec<String> = state
                .chat_log
                .iter()
                .rev()
                .take(5)
                .rev()
                .map(|m| format!("{}: {}", m.sender_name, m.content))
                .collect();
            let history_text = recent_history_dialogue.join("\n\n");

            let companion_messages = vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: companion_system,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: format!(
                        "Aktueller Verlauf:\n{}\n\nReagiere als {}:",
                        history_text, current_actor
                    ),
                },
            ];

            let comp_req = ChatRequest {
                endpoint_url: endpoint_url.clone(),
                api_key: api_key.clone(),
                model: model_name.clone(),
                messages: companion_messages,
                sampling: Some(SamplingParams {
                    temperature: Some(0.8),
                    top_p: Some(0.95),
                    max_tokens: Some(800),
                    ..Default::default()
                }),
                reasoning_mode: Some(false),
                provider: provider.clone(),
            };

            if let Ok(comp_text) = inference.generate_direct(comp_req).await {
                let companion_msg = SceneTurnMessage {
                    id: format!("msg_{}_{}", Utc::now().timestamp_millis(), actor_depth),
                    sender_id: current_actor.clone(),
                    sender_name: current_actor.clone(),
                    sender_role: "companion".to_string(),
                    avatar_url: matched_char.and_then(|c| c.avatar_data_url.clone()),
                    content: comp_text,
                    turn_mode: "say".to_string(),
                    whisper_target: None,
                    event_card: None,
                    timestamp: Utc::now().timestamp() as u64,
                };
                state.chat_log.push(companion_msg);
            }
        }

        // Determine if another party member should react
        if actor_depth < max_depth {
            if let Some(next_party_member) = state
                .definition
                .party
                .iter()
                .find(|p| !spoken_actors.contains(&p.to_lowercase()))
            {
                current_actor = next_party_member.clone();
            } else {
                current_actor = "PLAYER".to_string();
            }
        } else {
            current_actor = "PLAYER".to_string();
        }
    }

    // 6. Update pending choices and save
    if !gm_plan.player_choices.is_empty() {
        state.pending_choices = gm_plan.player_choices;
    } else {
        state.pending_choices = vec![
            TaggedChoice {
                text: "Vorsichtig weiter vorrücken".to_string(),
                badge: None,
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: "Die Umgebung absichern und untersuchen".to_string(),
                badge: Some("Wahrnehmung".to_string()),
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: "Mit den Gefährten die nächste Aktion abstimmen".to_string(),
                badge: None,
                action_type: "say".to_string(),
            },
        ];
    }

    state.current_turn_actor = "PLAYER".to_string();
    state.definition.last_played = Some(Utc::now().to_rfc3339());

    engine.set_state(state.clone());
    save_scene_state(&state)?;

    Ok(state)
}

pub async fn execute_stage_rest(
    engine: &StageEngine,
    _inference: &InferenceClient,
    scene_id: &str,
    rest_type: &str,
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }

    engine.push_snapshot(&state.definition.id, state.clone());

    let (hp_rec, stress_rec, note) = if rest_type == "long" {
        state.world.time_of_day = match state.world.time_of_day.as_str() {
            "Morgen" => "Abend".to_string(),
            "Mittag" => "Mitternacht".to_string(),
            _ => "Morgen".to_string(),
        };
        (
            40,
            30,
            "Lange Rast vollendet: Die Gruppe hat ein sicheres Lager aufgeschlagen, neue Kräfte gesammelt und die Ausrüstung gewartet.",
        )
    } else {
        (
            15,
            10,
            "Kurze Rast: Ein Moment des Durchatmens am Lagerfeuer lindert die Erschöpfung.",
        )
    };

    // Heal combatants
    for c in state.combat.combatants.iter_mut() {
        if c.role == "player" || c.role == "companion" {
            c.hp = (c.hp + hp_rec).min(c.max_hp);
            c.stress = (c.stress - stress_rec).max(0);
            if rest_type == "long" {
                c.conditions.clear();
            }
        }
    }

    let player_name = if state.definition.persona.is_empty() {
        "Spieler".to_string()
    } else {
        state.definition.persona.clone()
    };
    let affinity_gain = if rest_type == "long" { 5 } else { 2 };
    let mut bond_milestones = Vec::new();
    for companion in state.definition.party.clone() {
        let relationship_index = if let Some(index) =
            state.relationships.iter().position(|relationship| {
                relationship.subject == companion && relationship.target == player_name
            }) {
            index
        } else {
            state.relationships.push(StageRelationship {
                subject: companion.clone(),
                target: player_name.clone(),
                affinity: 0,
                tags: Vec::new(),
                role_view: "Gefährte".to_string(),
                last_shift_reason: String::new(),
            });
            state.relationships.len() - 1
        };
        let relationship = &mut state.relationships[relationship_index];
        let before = relationship.affinity;
        relationship.affinity = (relationship.affinity + affinity_gain).clamp(-100, 100);
        relationship.last_shift_reason = if rest_type == "long" {
            "Gemeinsames Lagerfeuer".to_string()
        } else {
            "Gemeinsame Rast".to_string()
        };
        for milestone in [25, 50, 75] {
            if before < milestone && relationship.affinity >= milestone {
                bond_milestones.push((companion.clone(), relationship.affinity, milestone));
            }
        }
    }

    let rest_card = StageEventCard::Rest(RestEventData {
        rest_type: rest_type.to_string(),
        recovered_hp: hp_rec,
        recovered_stress: stress_rec,
        campfire_note: note.to_string(),
    });

    let rest_msg = SceneTurnMessage {
        id: format!("msg_{}", Utc::now().timestamp_millis()),
        sender_id: "gm".to_string(),
        sender_name: "Game Master".to_string(),
        sender_role: "gm".to_string(),
        avatar_url: None,
        content: note.to_string(),
        turn_mode: "do".to_string(),
        whisper_target: None,
        event_card: Some(rest_card),
        timestamp: Utc::now().timestamp() as u64,
    };
    state.chat_log.push(rest_msg);

    for (index, (companion, affinity, milestone)) in bond_milestones.into_iter().enumerate() {
        state.chat_log.push(SceneTurnMessage {
            id: format!("msg_bond_{}_{}", Utc::now().timestamp_millis(), index),
            sender_id: "system".to_string(),
            sender_name: "Beziehungs-Meilenstein".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content: format!(
                "Die Bindung zu {} hat Stufe {} erreicht.",
                companion, milestone
            ),
            turn_mode: "direct".to_string(),
            whisper_target: None,
            event_card: Some(StageEventCard::BondMilestone {
                companion,
                affinity,
                milestone,
            }),
            timestamp: Utc::now().timestamp() as u64,
        });
    }

    // Optional short campfire dialogue from companion
    if let Some(companion_name) = state.definition.party.first() {
        let comp_msg = SceneTurnMessage {
            id: format!("msg_{}", Utc::now().timestamp_millis() + 1),
            sender_id: companion_name.clone(),
            sender_name: companion_name.clone(),
            sender_role: "companion".to_string(),
            avatar_url: None,
            content: "Es tut gut, für einen Augenblick innezuhalten. Wir müssen auf der Hut bleiben, aber gemeinsam schaffen wir das.".to_string(),
            turn_mode: "say".to_string(),
            whisper_target: None,
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
        };
        state.chat_log.push(comp_msg);
    }

    engine.set_state(state.clone());
    save_scene_state(&state)?;

    Ok(state)
}

// ==========================================
// 9. Unit Tests
// ==========================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dice_parser_simple() {
        let res = roll_dice("1d20", None).unwrap();
        assert_eq!(res.dice_count, 1);
        assert_eq!(res.die_faces, 20);
        assert_eq!(res.modifier, 0);
        assert_eq!(res.individual_rolls.len(), 1);
        assert!(res.sum >= 1 && res.sum <= 20);
    }

    #[test]
    fn test_dice_parser_with_modifier() {
        let res = roll_dice("2d6+4", None).unwrap();
        assert_eq!(res.dice_count, 2);
        assert_eq!(res.die_faces, 6);
        assert_eq!(res.modifier, 4);
        assert!(res.sum >= 6 && res.sum <= 16);
    }

    #[test]
    fn test_dice_parser_with_negative_modifier() {
        let res = roll_dice("3d8-2", None).unwrap();
        assert_eq!(res.dice_count, 3);
        assert_eq!(res.die_faces, 8);
        assert_eq!(res.modifier, -2);
        assert!(res.sum >= 1 && res.sum <= 22);
    }

    #[test]
    fn test_dc_check() {
        let res = roll_dice("1d20+5", Some(15)).unwrap();
        assert!(res.dc_check.is_some());
        let dc = res.dc_check.unwrap();
        assert_eq!(dc.target_dc, 15);
        assert_eq!(dc.passed, res.sum >= 15 || res.is_critical_success);
    }

    #[test]
    fn test_json_repair_valid() {
        let json =
            r#"{"narration_plan": "The corridor opens into a hall.", "next_actor": "PLAYER"}"#;
        let plan = repair_and_parse_gm_plan(json);
        assert_eq!(plan.narration_plan, "The corridor opens into a hall.");
        assert_eq!(plan.next_actor.as_deref(), Some("PLAYER"));
    }

    #[test]
    fn test_json_repair_fences_and_trailing_commas() {
        let raw =
            "```json\n{\n  \"narration_plan\": \"Test Beat\",\n  \"next_actor\": \"Ayu\",\n}\n```";
        let plan = repair_and_parse_gm_plan(raw);
        assert_eq!(plan.narration_plan, "Test Beat");
        assert_eq!(plan.next_actor.as_deref(), Some("Ayu"));
    }

    #[test]
    fn test_json_repair_unbalanced_braces() {
        let raw = "{\n  \"narration_plan\": \"Truncated plan without closing brace\"";
        let plan = repair_and_parse_gm_plan(raw);
        assert_eq!(plan.narration_plan, "Truncated plan without closing brace");
    }

    #[test]
    fn test_stage_turn_request_accepts_frontend_and_legacy_fields() {
        let frontend: StageTurnRequest = serde_json::from_str(
            r#"{
            "scene_id":"scene", "user_input":"Hallo", "turn_mode":"whisper",
            "whisper_target":"Ayu", "force_next_actor":"Ayu"
        }"#,
        )
        .unwrap();
        assert_eq!(frontend.user_input, "Hallo");
        assert_eq!(frontend.whisper_target.as_deref(), Some("Ayu"));
        assert_eq!(frontend.force_next_actor.as_deref(), Some("Ayu"));

        let legacy: StageTurnRequest = serde_json::from_str(
            r#"{
            "scene_id":"scene", "player_input":"Alt", "target_actor":"NPC"
        }"#,
        )
        .unwrap();
        assert_eq!(legacy.user_input, "Alt");
        assert_eq!(legacy.whisper_target.as_deref(), Some("NPC"));
    }

    #[test]
    fn test_stage_engine_clocks_and_combat() {
        let engine = StageEngine::new();
        let state = engine.get_state();
        assert_eq!(state.clocks.len(), 2);
        assert_eq!(state.combat.combatants.len(), 3);

        // Advance clock
        engine.set_clock_progress("clock_1", 4);
        let updated = engine.get_state();
        let clock = updated.clocks.iter().find(|c| c.id == "clock_1").unwrap();
        assert_eq!(clock.current, 4);

        // Start encounter
        engine.start_encounter();
        let combat_st = engine.get_state();
        assert!(combat_st.combat.is_active);
        // Ayu has highest initiative (19), so she should be first
        assert_eq!(combat_st.combat.combatants[0].name, "Ayu Ikue");

        // Next turn
        engine.next_turn();
        let turn2 = engine.get_state();
        assert_eq!(turn2.combat.current_turn_index, 1);
        assert_eq!(turn2.combat.combatants[1].name, "Hiroki");

        let delayed = engine.delay_turn().unwrap();
        assert_eq!(delayed.combat.combatants[1].name, "Schattenpirscher");
        assert_eq!(delayed.combat.combatants[2].name, "Hiroki");

        // Damage calculation
        engine.apply_combatant_delta("comb_enemy_1", -10, 5);
        let dmg_st = engine.get_state();
        let enemy = dmg_st
            .combat
            .combatants
            .iter()
            .find(|c| c.id == "comb_enemy_1")
            .unwrap();
        assert_eq!(enemy.hp, 18);
        assert_eq!(enemy.stress, 5);
    }

    #[test]
    fn test_undo_snapshot() {
        let engine = StageEngine::new();
        let initial_st = engine.get_state();
        engine.push_snapshot(&initial_st.definition.id, initial_st.clone());

        // Modify world location
        let mut modified = initial_st.clone();
        modified.world.location = "Tiefster Dungeon".to_string();
        engine.set_state(modified);
        assert_eq!(engine.get_state().world.location, "Tiefster Dungeon");

        // Undo
        let reverted = engine.undo_turn(&initial_st.definition.id).unwrap();
        assert_eq!(reverted.world.location, "Alte Bibliothek des Ordens");
    }

    #[test]
    fn test_folders_and_ngnl_default_presence() {
        let folders = list_stage_folders().unwrap();
        assert!(folders.contains(&"No Game No Life".to_string()));
        assert!(folders.contains(&"Sakura Succubus 3".to_string()));

        let scenes = scan_available_scenes();
        let ngnl_scenes: Vec<_> = scenes
            .iter()
            .filter(|s| s.folder == "No Game No Life")
            .collect();
        assert_eq!(
            ngnl_scenes.len(),
            12,
            "Should have 12 No Game No Life episodes/chapters in folder"
        );
        // Check chapter ordering
        assert!(
            ngnl_scenes[0].title.contains("Kapitel 1")
                || ngnl_scenes[0].title.contains("Episode 1")
                || ngnl_scenes[0].id.contains("episode1")
        );
    }

    #[test]
    fn test_edit_and_delete_stage_message() {
        let engine = StageEngine::new();
        let st = engine.get_state();
        let scene_id = &st.definition.id;

        // Edit message
        let edited = edit_stage_turn_message_with_saver(
            &engine,
            scene_id,
            "msg_init",
            "Neuer Text für Begrüßung",
            |_| Ok(()),
        )
        .unwrap();
        assert_eq!(edited.chat_log[0].content, "Neuer Text für Begrüßung");

        // Delete message
        let deleted =
            delete_stage_turn_message_with_saver(&engine, scene_id, "msg_init", |_| Ok(()))
                .unwrap();
        assert!(deleted.chat_log.is_empty());
    }

    #[test]
    fn test_get_stage_background_image() {
        let bg = get_stage_background_image("Horizontal Elkia Grand Library.png");
        assert!(bg.is_ok(), "Should find NGNL background image");
        let data = bg.unwrap();
        assert!(data.starts_with("data:image/"));
    }
}
