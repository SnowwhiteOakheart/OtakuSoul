//! Dice for the rules engine: d20 tests with advantage/disadvantage and damage formulas.

use rand::{Rng, RngExt};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum RollMode {
    #[default]
    Normal,
    Advantage,
    Disadvantage,
}

impl RollMode {
    /// Advantage and disadvantage cancel each other out, however many sources there are.
    pub fn combine(advantage: bool, disadvantage: bool) -> RollMode {
        match (advantage, disadvantage) {
            (true, false) => RollMode::Advantage,
            (false, true) => RollMode::Disadvantage,
            _ => RollMode::Normal,
        }
    }
}

/// One d20 test: both dice with advantage/disadvantage, the one that counts as `natural`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct D20Roll {
    pub mode: RollMode,
    pub rolls: Vec<u32>,
    pub natural: u32,
}

pub fn roll_d20<R: Rng + ?Sized>(rng: &mut R, mode: RollMode) -> D20Roll {
    let first = rng.random_range(1..=20);
    let (rolls, natural) = match mode {
        RollMode::Normal => (vec![first], first),
        RollMode::Advantage | RollMode::Disadvantage => {
            let second = rng.random_range(1..=20);
            let natural = if mode == RollMode::Advantage {
                first.max(second)
            } else {
                first.min(second)
            };
            (vec![first, second], natural)
        }
    };
    D20Roll {
        mode,
        rolls,
        natural,
    }
}

/// `NdM`, `NdM+K` or `NdM-K` (also a plain number).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiceFormula {
    pub count: u32,
    pub sides: u32,
    pub modifier: i32,
}

impl DiceFormula {
    pub fn parse(text: &str) -> Option<DiceFormula> {
        let clean: String = text.chars().filter(|c| !c.is_whitespace()).collect();
        let (dice, modifier) = match clean.find(['+', '-']) {
            Some(position) => {
                let modifier: i32 = clean[position..].parse().ok()?;
                (&clean[..position], modifier)
            }
            None => (clean.as_str(), 0),
        };
        if let Ok(flat) = dice.parse::<i32>() {
            return Some(DiceFormula {
                count: 0,
                sides: 0,
                modifier: flat + modifier,
            });
        }
        let (count, sides) = dice.split_once(['d', 'D'])?;
        let count = if count.is_empty() {
            1
        } else {
            count.parse().ok()?
        };
        let sides = sides.parse().ok()?;
        ((1..=100).contains(&count) && (2..=100).contains(&sides)).then_some(DiceFormula {
            count,
            sides,
            modifier,
        })
    }

    /// Average result, rounded down (the SRD hit points of monsters).
    pub fn average(&self) -> i32 {
        (self.count * (self.sides + 1)) as i32 / 2 + self.modifier
    }
}

/// A damage roll: the dice (doubled on a critical hit) plus the modifier, at least 0.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DamageRoll {
    pub rolls: Vec<u32>,
    pub modifier: i32,
    pub total: i32,
}

pub fn roll_damage<R: Rng + ?Sized>(
    rng: &mut R,
    formula: &DiceFormula,
    critical: bool,
) -> DamageRoll {
    let count = formula.count * if critical { 2 } else { 1 };
    let rolls: Vec<u32> = (0..count)
        .map(|_| rng.random_range(1..=formula.sides))
        .collect();
    let total = (rolls.iter().sum::<u32>() as i32 + formula.modifier).max(0);
    DamageRoll {
        rolls,
        modifier: formula.modifier,
        total,
    }
}
