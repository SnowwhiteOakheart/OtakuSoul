//! The game table of a 5e scene: the parts of a scene the fight flow ([`crate::fight`]) and
//! the exploring flow ([`crate::exploration`]) read and change, as a borrowed view. The app keeps its
//! own scene type and lends these fields out (`SceneState::table()` on the desktop); a
//! JSON-in/JSON-out wrapper (Android) can hold them in a plain struct.

use super::*;
use std::collections::HashMap;

/// A scene played with the 5e rules engine.
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
    /// Three failed death saves kill a hero; otherwise the hero is out of the fight and wakes
    /// afterwards with 1 hit point (default, so beloved companions cannot die by a roll).
    #[serde(default)]
    pub heroic_death: bool,
    /// Battle map for fights (`presets/srd5/maps`); without one fights run without a board.
    #[serde(default)]
    #[ts(optional)]
    pub map_id: Option<String>,
    /// Goals of an adventure act that the engine checks off (prepared fights won, exits used).
    #[serde(default)]
    pub goals: Vec<SceneGoal>,
    /// The next act (scene id) once every goal is reached.
    #[serde(default)]
    #[ts(optional)]
    pub next_scene: Option<String>,
}

impl SceneRules {
    /// The scene uses the 5e rules engine.
    pub fn is_5e(&self) -> bool {
        self.ruleset == "5e"
    }
}

/// A goal of an adventure act: winning a prepared encounter of a map (`kind: "encounter"`,
/// `target` = encounter id) or leaving through an exit to a map (`kind: "exit"`, `target` = map id).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SceneGoal {
    pub id: String,
    pub title: LocalizedName,
    pub kind: String,
    pub target: String,
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
    /// SRD equipment id (`longsword`, `potion_of_healing` …) for 5e gear and loot.
    #[serde(default)]
    #[ts(optional)]
    pub srd_id: Option<String>,
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

pub fn default_objective_max() -> u32 {
    1
}

pub fn default_objective_status() -> String {
    "active".to_string()
}

/// Monsters a fight starts with: an SRD monster id and how many (1–8, default 1).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct EnemyRequest {
    pub monster: String,
    #[serde(default)]
    pub count: Option<u32>,
}

/// The parts of a 5e scene the flow works on, borrowed from the app's scene. Between two calls
/// the app keeps all of them (they are plain serde data); nothing else is remembered.
pub struct Table<'a> {
    /// Party and enemies, turn order, turn budget, effects and the fight log.
    pub combat: &'a mut EncounterState,
    /// Battle map of the current or last fight; while exploring with fog of war.
    pub map: &'a mut Option<BattleMap>,
    /// The scene's rules (`None` = narrative scene).
    pub rules: Option<&'a SceneRules>,
    /// Companion names of the scene's party, in order (decides default classes).
    pub party: &'a [String],
    pub inventory: &'a mut Vec<InventoryItem>,
    pub objectives: &'a mut Vec<CampaignObjective>,
    /// What happened while exploring (log in the UI).
    pub exploration: &'a mut Vec<ExploreEvent>,
}

impl Table<'_> {
    /// The scene uses the 5e rules engine.
    pub fn is_5e(&self) -> bool {
        self.rules.is_some_and(SceneRules::is_5e)
    }

    /// Heroes die after three failed death saves (scene setting, off by default).
    pub fn heroic_death(&self) -> bool {
        self.rules.is_some_and(|r| r.heroic_death)
    }
}

/// An owned game table, for apps without their own scene type (e.g. a JSON-in/JSON-out
/// wrapper): keep it between calls and lend it out with [`TableState::table`]. The fields carry
/// the names of the desktop's `SceneState`, but `rules` and `party` sit at the top level here
/// (on the desktop under `definition`), so a `SceneState` JSON does not read as a `TableState`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TableState {
    #[serde(default)]
    pub combat: EncounterState,
    #[serde(default)]
    pub map: Option<BattleMap>,
    #[serde(default)]
    pub rules: Option<SceneRules>,
    #[serde(default)]
    pub party: Vec<String>,
    #[serde(default)]
    pub inventory: Vec<InventoryItem>,
    #[serde(default)]
    pub objectives: Vec<CampaignObjective>,
    #[serde(default)]
    pub exploration: Vec<ExploreEvent>,
}

impl TableState {
    pub fn table(&mut self) -> Table<'_> {
        Table {
            combat: &mut self.combat,
            map: &mut self.map,
            rules: self.rules.as_ref(),
            party: &self.party,
            inventory: &mut self.inventory,
            objectives: &mut self.objectives,
            exploration: &mut self.exploration,
        }
    }
}
