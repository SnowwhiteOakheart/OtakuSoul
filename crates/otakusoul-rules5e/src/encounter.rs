//! Kampfteilnehmer und Begegnungszustand – früher in `stage/models.rs`, jetzt Teil des
//! gemeinsamen 5e-Kerns, damit Desktop und Android dieselben Strukturen nutzen.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

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
    pub stats5e: Option<crate::Stats5e>,
    /// Square on the battle map (5e scenes with a map).
    #[serde(default)]
    #[ts(optional)]
    pub position: Option<crate::GridPos>,
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
    pub events: Vec<crate::CombatEvent>,
    /// What the current combatant has left this turn (5e).
    #[serde(default)]
    pub turn: crate::TurnBudget,
    /// Combatants who used their reaction since their last turn.
    #[serde(default)]
    pub reactions_used: Vec<String>,
    /// Ongoing spell effects (concentration, repeated saves).
    #[serde(default)]
    pub effects: Vec<crate::ActiveEffect>,
    /// How hard the fight is for the party (5e, XP budget).
    #[serde(default)]
    #[ts(optional)]
    pub difficulty: Option<crate::Difficulty>,
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
            turn: Default::default(),
            reactions_used: Vec::new(),
            effects: Vec::new(),
            difficulty: None,
        }
    }
}
