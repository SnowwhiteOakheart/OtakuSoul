//! 5e-compatible rules (SRD 5.1, CC-BY-4.0) for Stage scenes with `ruleset: "5e"`. The engine
//! decides every number – rolls, hits, damage and monster turns; the language model only
//! narrates the resulting [`CombatEvent`]s. Everything here is pure (no files, no network) and
//! takes its randomness from the caller, so tests can use a fixed seed.

pub mod ai;
pub mod combat;
pub mod data;
pub mod map;
pub mod roll;

use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub use ai::*;
pub use combat::*;
pub use data::*;
pub use map::*;
pub use roll::*;

/// The six abilities, in the usual order (STR DEX CON INT WIS CHA).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum Ability {
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
