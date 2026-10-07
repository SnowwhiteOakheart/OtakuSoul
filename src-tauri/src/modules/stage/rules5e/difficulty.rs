//! How hard a fight is. Monster XP by challenge rating comes from the SRD 5.1; the party's
//! budget is OtakuSoul's own rule of thumb (the SRD has no encounter-building table): per hero
//! 40 XP × level for a medium fight, half for easy, 1.6× for hard, 2.4× for deadly. Groups
//! count more: +25 % per extra monster, at most 2.5×.

use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum Difficulty {
    Trivial,
    Easy,
    Medium,
    Hard,
    Deadly,
}

/// Experience points of a monster by challenge rating (SRD 5.1).
pub fn xp_for_cr(cr: f32) -> u32 {
    const TABLE: [(f32, u32); 13] = [
        (0.0, 10),
        (0.125, 25),
        (0.25, 50),
        (0.5, 100),
        (1.0, 200),
        (2.0, 450),
        (3.0, 700),
        (4.0, 1100),
        (5.0, 1800),
        (6.0, 2300),
        (7.0, 2900),
        (8.0, 3900),
        (9.0, 5000),
    ];
    TABLE
        .iter()
        .rev()
        .find(|(rating, _)| cr >= *rating - f32::EPSILON)
        .map_or(10, |(_, xp)| *xp)
}

/// XP budget thresholds of a party for easy, medium, hard and deadly fights.
pub fn party_budget(levels: &[u32]) -> [u32; 4] {
    let base: u32 = levels.iter().map(|level| 40 * level.max(&1)).sum();
    [base / 2, base, base * 8 / 5, base * 12 / 5]
}

/// A group's XP with the group multiplier.
pub fn encounter_xp(monsters: &[&MonsterData]) -> u32 {
    let raw: u32 = monsters.iter().map(|m| xp_for_cr(m.cr)).sum();
    let count = monsters.len().max(1) as f32;
    let multiplier = (1.0 + 0.25 * (count - 1.0)).min(2.5);
    (raw as f32 * multiplier).round() as u32
}

pub fn rate(xp: u32, budget: [u32; 4]) -> Difficulty {
    match budget.iter().rposition(|&threshold| xp >= threshold) {
        None => Difficulty::Trivial,
        Some(0) => Difficulty::Easy,
        Some(1) => Difficulty::Medium,
        Some(2) => Difficulty::Hard,
        Some(_) => Difficulty::Deadly,
    }
}

/// Drops monsters from the end until the group fits the deadly threshold (one always stays).
pub fn trim_to_budget(mut monsters: Vec<&MonsterData>, budget: [u32; 4]) -> Vec<&MonsterData> {
    // Beyond "deadly" means more than half again over the deadly line.
    let cap = budget[3] + budget[3] / 2;
    while monsters.len() > 1 && encounter_xp(&monsters) > cap {
        monsters.pop();
    }
    monsters
}
