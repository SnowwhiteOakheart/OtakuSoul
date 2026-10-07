//! 5e-compatible rules (SRD 5.1, CC-BY-4.0) for Stage scenes with `ruleset: "5e"`. The engine
//! decides every number – rolls, hits, damage and monster turns; the language model only
//! narrates the resulting [`CombatEvent`]s. Everything here is pure (no files, no network) and
//! takes its randomness from the caller, so tests can use a fixed seed.

pub mod ai;
pub mod board;
pub mod combat;
pub mod conditions;
pub mod data;
pub mod explore;
pub mod map;
pub mod roll;
pub mod skills;
pub mod spells;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub use ai::*;
pub use board::*;
pub use combat::*;
pub use conditions::*;
pub use data::*;
pub use explore::*;
pub use map::*;
pub use roll::*;
pub use skills::*;
pub use spells::*;

/// The six abilities, in the usual order (STR DEX CON INT WIS CHA).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Ability {
    #[default]
    Str,
    Dex,
    Con,
    Int,
    Wis,
    Cha,
}

impl Ability {
    pub const ALL: [Ability; 6] = [
        Ability::Str,
        Ability::Dex,
        Ability::Con,
        Ability::Int,
        Ability::Wis,
        Ability::Cha,
    ];

    pub fn index(self) -> usize {
        self as usize
    }
}

/// ⌊(score − 10) / 2⌋.
pub fn ability_modifier(score: u8) -> i32 {
    (i32::from(score) - 10).div_euclid(2)
}

/// +2 at levels 1–4, +3 at 5–8 … +6 at 17–20.
pub fn proficiency_bonus(level: u32) -> i32 {
    2 + (level.clamp(1, 20) as i32 - 1) / 4
}

/// A name in the three app languages.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LocalizedName {
    pub de: String,
    pub en: String,
    pub ru: String,
}

impl LocalizedName {
    pub fn get(&self, language_code: &str) -> &str {
        let name = match language_code {
            "de" => &self.de,
            "ru" => &self.ru,
            _ => &self.en,
        };
        if name.is_empty() { &self.en } else { name }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum AttackKind {
    Melee,
    Ranged,
    Spell,
}

/// A ready-to-use attack: bonus and damage are final (monsters list them, heroes get them
/// computed from their abilities when the stats are built).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Attack {
    pub id: String,
    pub name: LocalizedName,
    pub kind: AttackKind,
    pub to_hit: i32,
    /// Dice formula including the modifier, e.g. `1d6+2`.
    pub damage: String,
    pub damage_type: String,
    /// Normal and long range in feet (ranged and spell attacks); melee reach is 5 ft.
    #[serde(default)]
    pub range_ft: u32,
    #[serde(default)]
    pub long_range_ft: u32,
}

/// Rules values of one combatant. Only base values are stored; modifiers, proficiency bonus
/// and the like are computed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Stats5e {
    pub level: u32,
    /// Class template ("fighter" …) for heroes, empty for monsters.
    #[serde(default)]
    pub class_id: String,
    /// SRD monster id for monsters, empty for heroes.
    #[serde(default)]
    pub monster_id: String,
    /// STR DEX CON INT WIS CHA.
    pub abilities: [u8; 6],
    pub armor_class: i32,
    pub speed_ft: u32,
    #[serde(default)]
    pub save_proficiencies: Vec<Ability>,
    #[serde(default)]
    pub skill_proficiencies: Vec<String>,
    pub attacks: Vec<Attack>,
    /// Hit die size (d8 → 8) and dice left for short rests.
    pub hit_die: u32,
    pub hit_dice_left: u32,
    #[serde(default)]
    pub vulnerabilities: Vec<String>,
    #[serde(default)]
    pub resistances: Vec<String>,
    #[serde(default)]
    pub immunities: Vec<String>,
    /// Monsters that fight to the end (undead, orcs …) instead of fleeing when badly hurt.
    #[serde(default)]
    pub never_flees: bool,
    /// `humanoid`, `beast`, `undead` … (heroes are humanoid).
    #[serde(default = "humanoid")]
    pub creature_type: String,
    /// Spells and slots of casters.
    #[serde(default)]
    #[ts(optional)]
    pub spellcasting: Option<Spellcasting>,
    /// Death saving throws of a hero at 0 hit points.
    #[serde(default)]
    pub death_saves: DeathSaves,
    /// The concentration spell this creature keeps up.
    #[serde(default)]
    #[ts(optional)]
    pub concentration: Option<String>,
}

fn humanoid() -> String {
    "humanoid".to_string()
}

/// A caster's spells and slots (slot levels 1–9 as index 0–8).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Spellcasting {
    pub ability: Ability,
    pub spells: Vec<String>,
    pub slots_max: [u8; 9],
    pub slots_used: [u8; 9],
}

impl Spellcasting {
    pub fn slots_left(&self, level: u8) -> u8 {
        let index = usize::from(level.clamp(1, 9) - 1);
        self.slots_max[index].saturating_sub(self.slots_used[index])
    }
}

/// Spell slots of a full caster (wizard, cleric) by class level (SRD table).
pub fn full_caster_slots(level: u32) -> [u8; 9] {
    const TABLE: [[u8; 9]; 20] = [
        [2, 0, 0, 0, 0, 0, 0, 0, 0],
        [3, 0, 0, 0, 0, 0, 0, 0, 0],
        [4, 2, 0, 0, 0, 0, 0, 0, 0],
        [4, 3, 0, 0, 0, 0, 0, 0, 0],
        [4, 3, 2, 0, 0, 0, 0, 0, 0],
        [4, 3, 3, 0, 0, 0, 0, 0, 0],
        [4, 3, 3, 1, 0, 0, 0, 0, 0],
        [4, 3, 3, 2, 0, 0, 0, 0, 0],
        [4, 3, 3, 3, 1, 0, 0, 0, 0],
        [4, 3, 3, 3, 2, 0, 0, 0, 0],
        [4, 3, 3, 3, 2, 1, 0, 0, 0],
        [4, 3, 3, 3, 2, 1, 0, 0, 0],
        [4, 3, 3, 3, 2, 1, 1, 0, 0],
        [4, 3, 3, 3, 2, 1, 1, 0, 0],
        [4, 3, 3, 3, 2, 1, 1, 1, 0],
        [4, 3, 3, 3, 2, 1, 1, 1, 0],
        [4, 3, 3, 3, 2, 1, 1, 1, 1],
        [4, 3, 3, 3, 3, 1, 1, 1, 1],
        [4, 3, 3, 3, 3, 2, 1, 1, 1],
        [4, 3, 3, 3, 3, 2, 2, 1, 1],
    ];
    TABLE[(level.clamp(1, 20) - 1) as usize]
}

/// Death saving throws: three successes stabilize, three failures kill (or, without heroic
/// death, knock the hero out of the fight).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DeathSaves {
    pub successes: u8,
    pub failures: u8,
    pub stable: bool,
    pub dead: bool,
}

impl Stats5e {
    pub fn score(&self, ability: Ability) -> u8 {
        self.abilities[ability.index()]
    }

    pub fn modifier(&self, ability: Ability) -> i32 {
        ability_modifier(self.score(ability))
    }

    pub fn proficiency(&self) -> i32 {
        proficiency_bonus(self.level)
    }

    pub fn initiative_bonus(&self) -> i32 {
        self.modifier(Ability::Dex)
    }

    /// 10 + WIS modifier (+ proficiency when trained in Perception).
    pub fn passive_perception(&self) -> i32 {
        let trained = self.skill_proficiencies.iter().any(|s| s == "perception");
        10 + self.modifier(Ability::Wis) + if trained { self.proficiency() } else { 0 }
    }

    pub fn saving_throw_bonus(&self, ability: Ability) -> i32 {
        self.modifier(ability)
            + if self.save_proficiencies.contains(&ability) {
                self.proficiency()
            } else {
                0
            }
    }

    pub fn attack(&self, id: &str) -> Option<&Attack> {
        self.attacks.iter().find(|attack| attack.id == id)
    }
}

/// How hurt someone looks; shown for enemies instead of numbers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum HealthTier {
    Unhurt,
    Wounded,
    BadlyWounded,
    Down,
}

pub fn health_tier(hp: i32, max_hp: i32) -> HealthTier {
    if hp <= 0 {
        HealthTier::Down
    } else if hp >= max_hp {
        HealthTier::Unhurt
    } else if hp * 2 > max_hp {
        HealthTier::Wounded
    } else {
        HealthTier::BadlyWounded
    }
}

#[cfg(test)]
mod tests;
