//! Class features of levels 1–3 (SRD 5.1) and milestone level-ups. Features with limited uses
//! count them in `Stats5e::resources_used`; short and long rests give them back.

use super::*;
use crate::modules::stage::Combatant;

/// Highest level the starter rules support.
pub const MAX_LEVEL: u32 = 3;

pub const SECOND_WIND: &str = "second_wind";
pub const ACTION_SURGE: &str = "action_surge";
pub const IMPROVED_CRITICAL: &str = "improved_critical";
pub const SNEAK_ATTACK: &str = "sneak_attack";
pub const CUNNING_ACTION: &str = "cunning_action";
pub const DISCIPLE_OF_LIFE: &str = "disciple_of_life";
pub const TURN_UNDEAD: &str = "turn_undead";
pub const ARCANE_RECOVERY: &str = "arcane_recovery";

/// Fighter (Champion), rogue, cleric (Life domain) and wizard features by level.
const FEATURES: [(&str, u32, &str); 8] = [
    ("fighter", 1, SECOND_WIND),
    ("fighter", 2, ACTION_SURGE),
    ("fighter", 3, IMPROVED_CRITICAL),
    ("rogue", 1, SNEAK_ATTACK),
    ("rogue", 2, CUNNING_ACTION),
    ("cleric", 1, DISCIPLE_OF_LIFE),
    ("cleric", 2, TURN_UNDEAD),
    ("wizard", 1, ARCANE_RECOVERY),
];

pub fn class_features(class_id: &str, level: u32) -> Vec<&'static str> {
    FEATURES
        .iter()
        .filter(|(class, from, _)| *class == class_id && *from <= level)
        .map(|(_, _, id)| *id)
        .collect()
}

pub fn has_feature(stats: &Stats5e, feature: &str) -> bool {
    class_features(&stats.class_id, stats.level).contains(&feature)
}

/// Uses per rest of a limited feature (`None` = unlimited or passive).
pub fn feature_uses(feature: &str) -> Option<u32> {
    match feature {
        SECOND_WIND | ACTION_SURGE | TURN_UNDEAD | ARCANE_RECOVERY => Some(1),
        _ => None,
    }
}

/// Uses left of a feature the hero has (0 for features they lack).
pub fn uses_left(stats: &Stats5e, feature: &str) -> u32 {
    if !has_feature(stats, feature) {
        return 0;
    }
    let max = feature_uses(feature).unwrap_or(u32::MAX);
    max.saturating_sub(stats.resources_used.get(feature).copied().unwrap_or(0))
}

pub fn spend(stats: &mut Stats5e, feature: &str) {
    *stats.resources_used.entry(feature.to_string()).or_insert(0) += 1;
}

/// A short rest gives back Second Wind, Action Surge and Channel Divinity; Arcane Recovery
/// only comes back with a long rest.
pub fn short_rest(stats: &mut Stats5e) {
    stats
        .resources_used
        .retain(|feature, _| feature == ARCANE_RECOVERY);
}

pub fn long_rest(stats: &mut Stats5e) {
    stats.resources_used.clear();
}

/// Extra d6 of Sneak Attack: 1 at level 1–2, 2 at level 3–4.
pub fn sneak_attack_dice(stats: &Stats5e) -> u32 {
    if has_feature(stats, SNEAK_ATTACK) {
        stats.level.div_ceil(2)
    } else {
        0
    }
}

/// Lowest natural roll that is a critical hit (Champion: 19).
pub fn critical_from(stats: &Stats5e) -> u32 {
    if has_feature(stats, IMPROVED_CRITICAL) {
        19
    } else {
        20
    }
}

/// Life domain: healing spells of level 1+ heal 2 + the spell's level more.
pub fn healing_bonus(stats: &Stats5e, spell_level: u8) -> i32 {
    if spell_level >= 1 && has_feature(stats, DISCIPLE_OF_LIFE) {
        2 + i32::from(spell_level)
    } else {
        0
    }
}

/// Arcane Recovery on a short rest: spent slots back with a combined level up to half the
/// wizard level (rounded up), highest first; once per long rest. Returns the slot levels.
pub fn arcane_recovery(stats: &mut Stats5e) -> Vec<u8> {
    if uses_left(stats, ARCANE_RECOVERY) == 0 {
        return Vec::new();
    }
    let mut budget = stats.level.div_ceil(2) as u8;
    let mut recovered = Vec::new();
    let Some(casting) = stats.spellcasting.as_mut() else {
        return recovered;
    };
    for level in (1..=5u8).rev() {
        let index = usize::from(level - 1);
        while level <= budget && casting.slots_used[index] > 0 {
            casting.slots_used[index] -= 1;
            budget -= level;
            recovered.push(level);
        }
    }
    if !recovered.is_empty() {
        spend(stats, ARCANE_RECOVERY);
    }
    recovered
}

/// Milestone level-up of a hero to `level` (at most [`MAX_LEVEL`]): the class template's values
/// at that level; hit points, hit dice and spell slots grow, used resources and spent slots
/// stay spent. Returns whether anything changed.
pub fn level_up(hero: &mut Combatant, level: u32) -> bool {
    let level = level.min(MAX_LEVEL);
    let Some(old) = hero.stats5e.clone() else {
        return false;
    };
    if old.level >= level || old.class_id.is_empty() {
        return false;
    }
    let Some(template) = class(&old.class_id) else {
        return false;
    };
    let (mut stats, max_hp) = hero_stats_at(template, level);
    stats.hit_dice_left = old.hit_dice_left + (level - old.level);
    stats.resources_used = old.resources_used;
    stats.death_saves = old.death_saves;
    stats.concentration = old.concentration;
    if let (Some(new), Some(old)) = (stats.spellcasting.as_mut(), old.spellcasting.as_ref()) {
        for (used, (was, max)) in new
            .slots_used
            .iter_mut()
            .zip(old.slots_used.iter().zip(new.slots_max))
        {
            *used = (*was).min(max);
        }
    }
    let gained = max_hp - hero.max_hp;
    hero.max_hp = max_hp;
    if hero.hp > 0 {
        hero.hp = (hero.hp + gained.max(0)).min(max_hp);
    }
    hero.stats5e = Some(stats);
    true
}
