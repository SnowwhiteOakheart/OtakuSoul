use chrono::Utc;
use rand::Rng;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::PathBuf;
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
    pub max: u32, // e.g. 4, 6, 8
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneState {
    pub definition: SceneDefinition,
    pub world: WorldState,
    pub clocks: Vec<CampaignClock>,
    pub combat: EncounterState,
    pub arcs: Vec<StoryArc>,
    pub inventory: Vec<InventoryItem>,
    pub chat_log: Vec<SceneTurnMessage>,
    pub pending_choices: Vec<TaggedChoice>,
    pub current_turn_actor: String,
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
    pub hp_delta: i32,
    pub stress_delta: i32,
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
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) {
        if start < end {
            let candidate = &text[start..=end];
            // Remove trailing commas before closing braces/brackets
            let re_commas = Regex::new(r",\s*([\]\}])").unwrap();
            let cleaned = re_commas.replace_all(candidate, "$1");

            if let Ok(plan) = serde_json::from_str::<GmPlan>(&cleaned) {
                return plan;
            }
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
          TaggedChoice { text: "Die Umgebung untersuchen".to_string(), badge: Some("Wahrnehmung".to_string()), action_type: "do".to_string() },
          TaggedChoice { text: "Mit der Gruppe sprechen".to_string(), badge: None, action_type: "say".to_string() },
          TaggedChoice { text: "Vorsichtig weitergehen".to_string(), badge: None, action_type: "do".to_string() },
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

        let mut encounter = EncounterState::default();
        encounter.combatants = initial_combatants;

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
                description: "Finde heraus, warum die Bibliothek einst versiegelt wurde.".to_string(),
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
                },
                InventoryItem {
                    id: "item_2".to_string(),
                    name: "Messing-Schlüssel".to_string(),
                    description: "Ein verzierter Schlüssel mit Sonnensymbol.".to_string(),
                    quantity: 1,
                    item_type: "key".to_string(),
                },
            ],
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
        st.combat.is_active = true;
        st.combat.round = 1;
        st.combat.current_turn_index = 0;
        st.combat.combatants.sort_by(|a, b| b.initiative.cmp(&a.initiative));
        let active_name = st
            .combat
            .combatants
            .first()
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "Niemand".to_string());
        st.combat
            .combat_log
            .push(format!("Kampf gestartet! Runde 1 – {} ist am Zug.", active_name));
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

    pub fn apply_combatant_delta(
        &self,
        combatant_id: &str,
        hp_delta: i32,
        stress_delta: i32,
    ) {
        let mut st = self.state.write().unwrap();
        let log_msg = if let Some(c) = st.combat.combatants.iter_mut().find(|c| c.id == combatant_id) {
            c.hp = (c.hp + hp_delta).clamp(0, c.max_hp);
            c.stress = (c.stress + stress_delta).clamp(0, c.max_stress);

            let msg = if hp_delta < 0 {
                format!("{} erleidet {} Schaden (HP: {}/{})", c.name, hp_delta.abs(), c.hp, c.max_hp)
            } else if hp_delta > 0 {
                format!("{} wird um {} HP geheilt (HP: {}/{})", c.name, hp_delta, c.hp, c.max_hp)
            } else {
                format!("{} Stress verändert um {} (Stress: {}/{})", c.name, stress_delta, c.stress, c.max_stress)
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
        let log_msg = if let Some(c) = st.combat.combatants.iter_mut().find(|c| c.id == combatant_id) {
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

    // --- Snapshot & Undo ---
    pub fn push_snapshot(&self, scene_id: &str, state: SceneState) {
        let mut snaps = self.snapshots.write().unwrap();
        let queue = snaps.entry(scene_id.to_string()).or_insert_with(VecDeque::new);
        queue.push_back(state);
        if queue.len() > 10 {
            queue.pop_front();
        }
    }

    pub fn undo_turn(&self, scene_id: &str) -> Result<SceneState, String> {
        let mut snaps = self.snapshots.write().unwrap();
        if let Some(queue) = snaps.get_mut(scene_id) {
            if let Some(previous_state) = queue.pop_back() {
                self.set_state(previous_state.clone());
                let _ = save_scene_state(&previous_state);
                return Ok(previous_state);
            }
        }
        Err("Kein früherer Zustand zum Wiederherstellen vorhanden.".to_string())
    }
}

// ==========================================
// 6. Dice Parser Implementation
// ==========================================

pub fn roll_dice(formula_raw: &str, target_dc: Option<i32>) -> Result<DiceRollResult, String> {
    let clean = formula_raw.trim().replace(' ', "");
    if clean.is_empty() {
        return Err("Würfelformel darf nicht leer sein.".to_string());
    }

    let (base_part, modifier) = if let Some(pos) = clean.find('+') {
        let (b, m) = clean.split_at(pos);
        let mod_val: i32 = m[1..].parse().map_err(|_| "Ungültiger positiver Modifikator")?;
        (b, mod_val)
    } else if let Some(pos) = clean.rfind('-') {
        let (b, m) = clean.split_at(pos);
        let mod_val: i32 = m[1..].parse().map_err(|_| "Ungültiger negativer Modifikator")?;
        (b, -mod_val)
    } else {
        (clean.as_str(), 0)
    };

    let parts: Vec<&str> = base_part.split(|c| c == 'd' || c == 'D').collect();
    if parts.len() != 2 {
        return Err(format!("Ungültiges Würfelformat: '{}'. Erwartet XdY z.B. 1d20 oder 2d6+3", clean));
    }

    let dice_count: u32 = if parts[0].is_empty() {
        1
    } else {
        parts[0].parse().map_err(|_| "Ungültige Anzahl der Würfel")?
    };

    let die_faces: u32 = parts[1].parse().map_err(|_| "Ungültige Seitenzahl des Würfels")?;

    if dice_count == 0 || dice_count > 100 {
        return Err("Würfelanzahl muss zwischen 1 und 100 liegen.".to_string());
    }
    if die_faces < 2 || die_faces > 1000 {
        return Err("Seitenzahl muss zwischen 2 und 1000 liegen.".to_string());
    }

    let mut rng = rand::thread_rng();
    let mut individual_rolls = Vec::with_capacity(dice_count as usize);
    let mut rolls_sum: i32 = 0;

    for _ in 0..dice_count {
        let roll: u32 = rng.gen_range(1..=die_faces);
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

pub fn scan_available_scenes() -> Vec<ScenePreview> {
    let mut results = Vec::new();
    let paths = resolve_app_paths();

    // 1. User scenes in data_dir/scenes
    let user_scenes_dir = PathBuf::from(&paths.scenes_dir);
    if user_scenes_dir.exists() {
        if let Ok(entries) = fs::read_dir(&user_scenes_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() && p.extension().map_or(false, |ext| ext == "json") {
                    if let Ok(content) = fs::read_to_string(&p) {
                        if let Ok(state) = serde_json::from_str::<SceneState>(&content) {
                            results.push(ScenePreview {
                                id: state.definition.id.clone(),
                                title: state.definition.title.clone(),
                                description: state.definition.description.clone(),
                                party: state.definition.party.clone(),
                                location: state.world.location.clone(),
                                time_of_day: state.world.time_of_day.clone(),
                                gm_tone: state.definition.gm_tone.clone(),
                                folder: "Eigene Szenen".to_string(),
                                is_preset: false,
                                starting_bg: state.definition.starting_bg.clone(),
                                last_played: state.definition.last_played.clone(),
                            });
                        }
                    }
                }
            }
        }
    }

    // 2. Presets from presets/sakura-succubus-3/scenes and presets/no-game-no-life/scenes
    let search_roots = [
        PathBuf::from("presets"),
        PathBuf::from("../presets"),
        PathBuf::from("assets/presets"),
        PathBuf::from("/home/deathtrap/development/OtakuSoul/presets"),
    ];

    let preset_folders = [
        ("sakura-succubus-3", "Sakura Succubus 3"),
        ("no-game-no-life", "No Game No Life"),
    ];

    for root in &search_roots {
        for (folder_key, folder_label) in &preset_folders {
            let scene_dir = root.join(folder_key).join("scenes");
            if scene_dir.exists() {
                if let Ok(entries) = fs::read_dir(&scene_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() && p.extension().map_or(false, |ext| ext == "json") {
                            if let Ok(content) = fs::read_to_string(&p) {
                                if let Ok(def) = serde_json::from_str::<SceneDefinition>(&content) {
                                    let id = format!("{}_{}", folder_key, p.file_stem().unwrap().to_string_lossy());
                                    if !results.iter().any(|r| r.id == id || r.title == def.title) {
                                        results.push(ScenePreview {
                                            id,
                                            title: def.title.clone(),
                                            description: def.description.clone(),
                                            party: def.party.clone(),
                                            location: def.starting_location.clone(),
                                            time_of_day: def.time_of_day.clone(),
                                            gm_tone: def.gm_tone.clone(),
                                            folder: folder_label.to_string(),
                                            is_preset: true,
                                            starting_bg: def.starting_bg.clone(),
                                            last_played: def.last_played.clone(),
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    results.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    results
}

pub fn load_scene_by_id(scene_id: &str) -> Result<SceneState, String> {
    let paths = resolve_app_paths();
    let user_scene_file = PathBuf::from(&paths.scenes_dir).join(format!("{}.json", scene_id));

    // If active user state exists, load it
    if user_scene_file.exists() {
        let content = fs::read_to_string(&user_scene_file)
            .map_err(|e| format!("Fehler beim Lesen der Szene: {}", e))?;
        let state: SceneState = serde_json::from_str(&content)
            .map_err(|e| format!("Fehler beim Parsen der Szene: {}", e))?;
        return Ok(state);
    }

    // Otherwise find in presets
    let search_roots = [
        PathBuf::from("presets"),
        PathBuf::from("../presets"),
        PathBuf::from("/home/deathtrap/development/OtakuSoul/presets"),
    ];

    for root in &search_roots {
        for folder in &["sakura-succubus-3", "no-game-no-life"] {
            let scene_dir = root.join(folder).join("scenes");
            if scene_dir.exists() {
                if let Ok(entries) = fs::read_dir(&scene_dir) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        let stem = p.file_stem().unwrap_or_default().to_string_lossy().to_string();
                        let expected_id = format!("{}_{}", folder, stem);
                        if expected_id == scene_id || stem == scene_id {
                            let content = fs::read_to_string(&p)
                                .map_err(|e| format!("Fehler beim Lesen der Preset-Szene: {}", e))?;
                            let mut def: SceneDefinition = serde_json::from_str(&content)
                                .map_err(|e| format!("Fehler beim Parsen der Preset-Szene: {}", e))?;
                            def.id = scene_id.to_string();

                            // Build fresh initial state from definition
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
                                location: def.starting_location.clone(),
                                time_of_day: def.time_of_day.clone(),
                                weather: "Klar".to_string(),
                                danger_level: 2,
                                active_quest: def.description.clone(),
                                key_facts: HashMap::new(),
                            };

                            let state = SceneState {
                                definition: def,
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
                            };

                            let _ = save_scene_state(&state);
                            return Ok(state);
                        }
                    }
                }
            }
        }
    }

    Err(format!("Szene '{}' nicht gefunden.", scene_id))
}

pub fn save_scene_state(state: &SceneState) -> Result<(), String> {
    let paths = resolve_app_paths();
    let scenes_dir = PathBuf::from(&paths.scenes_dir);
    let _ = fs::create_dir_all(&scenes_dir);

    let target_file = scenes_dir.join(format!("{}.json", state.definition.id));
    let json_data = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Fehler beim Serialisieren der Szene: {}", e))?;

    fs::write(&target_file, json_data)
        .map_err(|e| format!("Fehler beim Speichern der Szene in {:?}: {}", target_file, e))?;

    Ok(())
}

pub fn create_custom_scene(mut def: SceneDefinition) -> Result<SceneState, String> {
    if def.id.trim().is_empty() {
        def.id = format!("custom_scene_{}", Utc::now().timestamp_millis());
    }
    def.created_at = Utc::now().to_rfc3339();
    def.last_played = Some(Utc::now().to_rfc3339());

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

    let state = SceneState {
        definition: def.clone(),
        world: WorldState {
            location: def.starting_location.clone(),
            time_of_day: def.time_of_day.clone(),
            weather: "Klar".to_string(),
            danger_level: 2,
            active_quest: def.description.clone(),
            key_facts: HashMap::new(),
        },
        clocks: vec![CampaignClock {
            id: "clock_tension".to_string(),
            name: "Dramatischer Fortschritt".to_string(),
            current: 0,
            max: 6,
            clock_type: "progress".to_string(),
        }],
        combat: EncounterState::default(),
        arcs: Vec::new(),
        inventory: Vec::new(),
        chat_log: vec![initial_msg],
        pending_choices: vec![
            TaggedChoice {
                text: "Umschauen und orientieren".to_string(),
                badge: None,
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: "Das Wort an die Gruppe richten".to_string(),
                badge: None,
                action_type: "say".to_string(),
            },
        ],
        current_turn_actor: "PLAYER".to_string(),
    };

    save_scene_state(&state)?;
    Ok(state)
}

pub fn delete_scene(scene_id: &str) -> Result<(), String> {
    let paths = resolve_app_paths();
    let target_file = PathBuf::from(&paths.scenes_dir).join(format!("{}.json", scene_id));
    if target_file.exists() {
        fs::remove_file(target_file).map_err(|e| format!("Fehler beim Löschen: {}", e))?;
    }
    Ok(())
}

pub fn export_scene_to_markdown(scene_id: &str) -> Result<String, String> {
    let state = load_scene_by_id(scene_id)?;
    let mut md = format!("# {}\n\n", state.definition.title);
    md.push_str(&format!("**Ort:** {} | **Zeit:** {} | **Spielleiter-Ton:** {}\n\n", 
        state.world.location, state.world.time_of_day, state.definition.gm_tone));
    md.push_str(&format!("*{}*\n\n---\n\n", state.definition.description));

    for msg in &state.chat_log {
        let timestamp_str = chrono::DateTime::from_timestamp(msg.timestamp as i64, 0)
            .map(|dt| dt.format("%H:%M").to_string())
            .unwrap_or_default();

        match msg.sender_role.as_str() {
            "gm" => {
                md.push_str(&format!("### 🎲 Game Master ({})\n\n{}\n\n", timestamp_str, msg.content));
            }
            "player" => {
                let mode_icon = match msg.turn_mode.as_str() {
                    "say" => "💬",
                    "do" => "⚔️",
                    "think" => "💭",
                    "whisper" => "🤫",
                    _ => "🎬",
                };
                md.push_str(&format!("**{} {}** ({})  \n{}\n\n", mode_icon, msg.sender_name, timestamp_str, msg.content));
            }
            "companion" => {
                md.push_str(&format!("**🌸 {}** ({})  \n{}\n\n", msg.sender_name, timestamp_str, msg.content));
            }
            _ => {
                md.push_str(&format!("**{}** ({})  \n{}\n\n", msg.sender_name, timestamp_str, msg.content));
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
    pub player_input: String,
    #[serde(default = "default_turn_mode")]
    pub turn_mode: String, // "say" | "do" | "think" | "direct" | "whisper"
    #[serde(default)]
    pub target_actor: Option<String>,
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
            if settings.cloud_api_key.is_empty() { None } else { Some(settings.cloud_api_key.clone()) },
            if settings.cloud_model.is_empty() { None } else { Some(settings.cloud_model.clone()) },
            Some(crate::modules::providers::ProviderRegistry::detect_provider(
                &settings.cloud_endpoint,
                None,
            )),
        )
    } else {
        (
            format!("http://127.0.0.1:{}/v1/chat/completions", settings.server_config.port),
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
    let clean_input = req.player_input.trim();
    if !clean_input.is_empty() {
        let player_msg = SceneTurnMessage {
            id: format!("msg_{}", Utc::now().timestamp_millis()),
            sender_id: "player".to_string(),
            sender_name: user_name.clone(),
            sender_role: "player".to_string(),
            avatar_url: None,
            content: clean_input.to_string(),
            turn_mode: req.turn_mode.clone(),
            whisper_target: req.target_actor.clone(),
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

    let recent_history: Vec<String> = state
        .chat_log
        .iter()
        .rev()
        .take(6)
        .rev()
        .map(|m| format!("{}: {}", m.sender_name, m.content))
        .collect();

    let planner_system_prompt = format!(
        r#"[SOUL STAGE — GAME MASTER PLANNER]
Du bist der Spielleiter (Game Master) für ein immersives Tabletop-RPG im Genre/Ton "{tone}".
Narrator-Stil: {narrator_style}
Szenen-Kontext: {world_context}
Aktueller Ort: {location} ({time_of_day}, Wetter: {weather})
Gruppe: {party}
Spieler: {user_name}

AUFGABE:
Analysiere die jüngste Aktion des Spielers und plane den nächsten dramatischen Beat.
Antworte AUSSCHLIESSLICH mit einem einzigen, gültigen JSON-Objekt im folgenden Format:
{{
  "narration_plan": "Kurze Regie-Anweisung, was jetzt geschieht und enthüllt wird",
  "location": null,
  "time_of_day": null,
  "weather": null,
  "next_actor": "{first_party_or_player}",
  "dice_check": null,
  "campaign_clock_updates": [],
  "resource_delta": null,
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
- Antworte NUR als reines JSON ohne Erklärungen oder Markdown davor/danach!"#,
        tone = state.definition.gm_tone,
        narrator_style = state.definition.narrator_style,
        world_context = state.definition.world_context,
        location = state.world.location,
        time_of_day = state.world.time_of_day,
        weather = state.world.weather,
        party = party_list,
        user_name = user_name,
        first_party_or_player = state.definition.party.first().cloned().unwrap_or_else(|| "PLAYER".to_string())
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

    let plan_raw = inference.generate_direct(plan_req).await.unwrap_or_default();
    let gm_plan = repair_and_parse_gm_plan(&plan_raw);

    // 3. Resolve Mechanics (Dice, Clocks, Resources)
    let mut dice_outcome_text = String::new();
    let mut dice_event_card = None;

    if let Some(check) = &gm_plan.dice_check {
        if state.definition.dice_rolls_enabled {
            if let Ok(roll) = roll_dice(&check.formula, Some(check.dc)) {
                let passed = roll.dc_check.as_ref().map_or(false, |d| d.passed);
                dice_outcome_text = format!(
                    "\n[WÜRFELPROBE {}: Formel {}, Wurf={}, Summe={}. DC={}. Ergebnis: {}]",
                    check.skill_name.to_uppercase(),
                    roll.formula,
                    roll.individual_rolls.iter().map(|r| r.to_string()).collect::<Vec<_>>().join("+"),
                    roll.sum,
                    check.dc,
                    if passed { "ERFOLGREICH" } else { "FEHLGESCHLAGEN" }
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
        }
    }

    // Apply World updates from Plan
    if let Some(loc) = gm_plan.location {
        if !loc.trim().is_empty() {
            state.world.location = loc;
        }
    }
    if let Some(tod) = gm_plan.time_of_day {
        if !tod.trim().is_empty() {
            state.world.time_of_day = tod;
        }
    }
    if let Some(wth) = gm_plan.weather {
        if !wth.trim().is_empty() {
            state.world.weather = wth;
        }
    }

    // Apply Clock updates
    for clk_up in &gm_plan.campaign_clock_updates {
        if let Some(c) = state.clocks.iter_mut().find(|c| c.id == clk_up.id) {
            let new_val = (c.current as i32 + clk_up.delta).clamp(0, c.max as i32) as u32;
            c.current = new_val;
        }
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
            content: format!("Beschreibe das Geschehen basierend auf der Aktion: '{}'", clean_input),
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

    let narration_content = inference.generate_direct(exec_req).await.unwrap_or_else(|_| gm_plan.narration_plan.clone());

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

    // 5. Next Actor Turn (Party Member reaction if selected)
    let next_actor = gm_plan.next_actor.as_deref().unwrap_or("PLAYER");
    if next_actor != "PLAYER" && state.definition.party.contains(&next_actor.to_string()) {
        let all_chars = scan_available_characters();
        let matched_char = all_chars.iter().find(|c| c.card.data.name.to_lowercase() == next_actor.to_lowercase());

        let companion_system = if let Some(ch) = matched_char {
            format!(
                r#"Du bist {name}.
Persönlichkeit: {personality}
Hintergrund: {description}
Szenen-Kontext: {world_context}

Reagiere nun aus der Ich-Perspektive auf das, was der Spielleiter und {user_name} soeben getan/gesagt haben.
Bleibe absolut in deiner Rolle, nutze deine eigene Stimme und drücke deine echten Gefühle aus."#,
                name = ch.card.data.name,
                personality = ch.card.data.personality,
                description = ch.card.data.description,
                world_context = state.definition.world_context,
                user_name = user_name
            )
        } else {
            format!(
                "Du bist {}. Reagiere aus deiner Sicht auf das Geschehen.",
                next_actor
            )
        };

        let companion_messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: companion_system,
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!(
                    "Was der Spielleiter schilderte:\n\"{}\"\n\nReagiere als {}:",
                    narration_content,
                    next_actor
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
                id: format!("msg_{}", Utc::now().timestamp_millis()),
                sender_id: next_actor.to_string(),
                sender_name: next_actor.to_string(),
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
        (40, 30, "Lange Rast vollendet: Die Gruppe hat ein sicheres Lager aufgeschlagen, neue Kräfte gesammelt und die Ausrüstung gewartet.")
    } else {
        (15, 10, "Kurze Rast: Ein Moment des Durchatmens am Lagerfeuer lindert die Erschöpfung.")
    };

    // Heal combatants
    for c in state.combat.combatants.iter_mut() {
        if c.role == "player" || c.role == "companion" {
            c.hp = (c.hp + hp_rec).min(c.max_hp);
            c.stress = (c.stress - stress_rec).max(0);
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
        let json = r#"{"narration_plan": "The corridor opens into a hall.", "next_actor": "PLAYER"}"#;
        let plan = repair_and_parse_gm_plan(json);
        assert_eq!(plan.narration_plan, "The corridor opens into a hall.");
        assert_eq!(plan.next_actor.as_deref(), Some("PLAYER"));
    }

    #[test]
    fn test_json_repair_fences_and_trailing_commas() {
        let raw = "```json\n{\n  \"narration_plan\": \"Test Beat\",\n  \"next_actor\": \"Ayu\",\n}\n```";
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

        // Damage calculation
        engine.apply_combatant_delta("comb_enemy_1", -10, 5);
        let dmg_st = engine.get_state();
        let enemy = dmg_st.combat.combatants.iter().find(|c| c.id == "comb_enemy_1").unwrap();
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
}
