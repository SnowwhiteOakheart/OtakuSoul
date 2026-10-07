//! Conditions (SRD 5.1) and what they do in the engine: advantage and disadvantage, automatic
//! critical hits, losing actions and speed, failed saves, armor class from spells. Conditions
//! live on the combatant as `CombatCondition` with English ids; names the game master uses in
//! other languages are mapped onto them.

use super::*;
use crate::modules::stage::{CombatCondition, Combatant};

pub const BLINDED: &str = "blinded";
pub const CHARMED: &str = "charmed";
pub const FRIGHTENED: &str = "frightened";
pub const GRAPPLED: &str = "grappled";
pub const INCAPACITATED: &str = "incapacitated";
pub const PARALYZED: &str = "paralyzed";
pub const POISONED: &str = "poisoned";
pub const PRONE: &str = "prone";
pub const RESTRAINED: &str = "restrained";
pub const STUNNED: &str = "stunned";
pub const UNCONSCIOUS: &str = "unconscious";
/// Magical sleep: like unconscious, but damage wakes the sleeper.
pub const ASLEEP: &str = "asleep";
/// Spell effects with a mechanical meaning.
pub const BLESSED: &str = "blessed";
pub const SHIELD_OF_FAITH: &str = "shield_of_faith";
pub const MAGE_ARMOR: &str = "mage_armor";
pub const AID: &str = "aid";
/// Ray of Frost: −10 ft speed until the caster's next turn.
pub const SLOWED: &str = "slowed";
/// Guiding Bolt: the next attack against the target has advantage.
pub const GUIDED: &str = "guided";
/// Chill Touch: the target cannot regain hit points.
pub const NO_HEAL: &str = "no_heal";
/// Turn Undead: the creature flees from the cleric until it takes damage.
pub const TURNED: &str = "turned";
/// Shield: +5 AC until the start of the caster's next turn.
pub const SHIELDED: &str = "shielded";

/// Rounds a condition lasts when a spell gives no other number (1 minute = 10 rounds).
pub const ONE_MINUTE: u32 = 10;
/// "Hours" outside combat: only a long rest ends them.
pub const UNTIL_REST: u32 = 9999;

const NO_ACTIONS: [&str; 5] = [INCAPACITATED, PARALYZED, STUNNED, UNCONSCIOUS, ASLEEP];
const ATTACKED_WITH_ADVANTAGE: [&str; 6] =
    [BLINDED, PARALYZED, RESTRAINED, STUNNED, UNCONSCIOUS, ASLEEP];
const ATTACKS_WITH_DISADVANTAGE: [&str; 5] = [BLINDED, FRIGHTENED, POISONED, PRONE, RESTRAINED];
const FAILS_STR_DEX: [&str; 4] = [PARALYZED, STUNNED, UNCONSCIOUS, ASLEEP];
const NO_SPEED: [&str; 7] = [
    GRAPPLED,
    RESTRAINED,
    PARALYZED,
    STUNNED,
    UNCONSCIOUS,
    ASLEEP,
    INCAPACITATED,
];

fn any(combatant: &Combatant, names: &[&str]) -> bool {
    combatant
        .conditions
        .iter()
        .any(|c| names.contains(&c.name.as_str()))
}

/// Cannot take actions or reactions.
pub fn incapacitated(combatant: &Combatant) -> bool {
    any(combatant, &NO_ACTIONS)
}

pub fn speed_ft(combatant: &Combatant) -> u32 {
    if any(combatant, &NO_SPEED) {
        return 0;
    }
    let base = combatant.stats5e.as_ref().map_or(30, |s| s.speed_ft);
    if has_condition(combatant, SLOWED) {
        base.saturating_sub(10)
    } else {
        base
    }
}

pub fn auto_fails(combatant: &Combatant, ability: Ability) -> bool {
    matches!(ability, Ability::Str | Ability::Dex) && any(combatant, &FAILS_STR_DEX)
}

/// Armor class with spell effects: Mage Armor (13 + DEX unless the armor is better) and
/// Shield of Faith (+2).
pub fn armor_class(combatant: &Combatant) -> i32 {
    let Some(stats) = &combatant.stats5e else {
        return 10;
    };
    let mut ac = stats.armor_class;
    if has_condition(combatant, MAGE_ARMOR) {
        ac = ac.max(13 + stats.modifier(Ability::Dex));
    }
    if has_condition(combatant, SHIELD_OF_FAITH) {
        ac += 2;
    }
    if has_condition(combatant, SHIELDED) {
        ac += 5;
    }
    ac
}

/// Advantage/disadvantage of an attack from the conditions on both sides, and whether a hit
/// is automatically critical (paralyzed or unconscious target within 5 ft). `distance_ft` is
/// `None` without a board: attackers then count as close.
pub fn attack_conditions(
    attacker: &Combatant,
    target: &Combatant,
    distance_ft: Option<u32>,
) -> (RollMode, bool) {
    let close = distance_ft.is_none_or(|d| d <= map::SQUARE_FT);
    let prone_target = has_condition(target, PRONE);
    let advantage = any(target, &ATTACKED_WITH_ADVANTAGE)
        || has_condition(target, GUIDED)
        || (prone_target && close);
    let disadvantage = any(attacker, &ATTACKS_WITH_DISADVANTAGE)
        || has_condition(target, DODGING) && !incapacitated(target)
        || (prone_target && !close);
    let auto_crit = close && any(target, &[PARALYZED, UNCONSCIOUS, ASLEEP]);
    (RollMode::combine(advantage, disadvantage), auto_crit)
}

/// Adds or refreshes a condition.
pub fn add_condition(combatant: &mut Combatant, name: &str, rounds: u32) {
    combatant.conditions.retain(|c| c.name != name);
    combatant.conditions.push(CombatCondition {
        name: name.to_string(),
        rounds_remaining: rounds,
    });
}

pub fn remove_condition(combatant: &mut Combatant, name: &str) -> bool {
    let before = combatant.conditions.len();
    combatant.conditions.retain(|c| c.name != name);
    before != combatant.conditions.len()
}

/// Condition ids for names the game master may use (English, German, Russian); unknown
/// names stay as narrative conditions without a mechanical effect.
pub fn normalize_condition(name: &str) -> Option<&'static str> {
    let name = name.trim().to_lowercase();
    let table: [(&str, &[&str]); 11] = [
        (
            BLINDED,
            &["blinded", "blind", "geblendet", "ослеплён", "ослеплен"],
        ),
        (CHARMED, &["charmed", "bezaubert", "очарован"]),
        (
            FRIGHTENED,
            &[
                "frightened",
                "afraid",
                "verängstigt",
                "ängstlich",
                "испуган",
            ],
        ),
        (GRAPPLED, &["grappled", "gepackt", "ergriffen", "схвачен"]),
        (
            INCAPACITATED,
            &[
                "incapacitated",
                "kampfunfähig",
                "handlungsunfähig",
                "недееспособен",
            ],
        ),
        (
            PARALYZED,
            &["paralyzed", "paralysed", "gelähmt", "парализован"],
        ),
        (POISONED, &["poisoned", "vergiftet", "отравлен"]),
        (
            PRONE,
            &[
                "prone",
                "liegend",
                "am boden liegend",
                "сбит с ног",
                "лежит",
            ],
        ),
        (
            RESTRAINED,
            &["restrained", "festgesetzt", "gefesselt", "опутан", "связан"],
        ),
        (STUNNED, &["stunned", "betäubt", "ошеломлён", "ошеломлен"]),
        (UNCONSCIOUS, &["unconscious", "bewusstlos", "без сознания"]),
    ];
    table
        .iter()
        .find(|(_, names)| names.contains(&name.as_str()))
        .map(|(id, _)| *id)
}

/// Start of a combatant's own turn: Dodge ends, conditions with a duration count down.
/// Returns the conditions that ended.
pub fn tick_conditions(combatant: &mut Combatant) -> Vec<String> {
    let mut ended = Vec::new();
    combatant.conditions.retain_mut(|c| {
        if c.name == DODGING {
            return false;
        }
        if c.rounds_remaining > 0 && c.rounds_remaining < UNTIL_REST {
            c.rounds_remaining -= 1;
            if c.rounds_remaining == 0 {
                ended.push(c.name.clone());
                return false;
            }
        }
        true
    });
    ended
}

/// End of a combatant's turn: short spell riders (Slowed, Guided, No healing) that had to
/// last through this turn end now.
pub fn end_of_turn_conditions(combatant: &mut Combatant) -> Vec<String> {
    let mut ended = Vec::new();
    combatant.conditions.retain(|c| {
        let short = matches!(c.name.as_str(), SLOWED | GUIDED | NO_HEAL);
        if short {
            ended.push(c.name.clone());
        }
        !short
    });
    ended
}
