use crate::*;
use rand::{Rng, RngExt};

/// Fight events kept in the scene (log in the UI).
pub const MAX_COMBAT_EVENTS: usize = 300;
/// Enemies per fight; the language model cannot flood the scene.
pub const MAX_ENEMIES: usize = 12;
/// Engine turns per call before it stops (safety net; a fight never needs that many).
pub const MAX_TURNS_PER_CALL: usize = 60;
/// Range of Turn Undead.
pub const TURN_UNDEAD_FT: u32 = 30;
/// Score from which a cast (stabilizing or healing the dying) is done without asking.
pub const URGENT_CAST: i32 = 45;

/// Class template when the scene names none: the player fights, companions take the other
/// roles in turn.
pub fn default_class(role: &str, companion_index: usize) -> &'static str {
    if role == "player" {
        "fighter"
    } else {
        ["cleric", "rogue", "wizard", "fighter"][companion_index % 4]
    }
}

/// The 5e class a character card names (`extensions.otakusoul_5e.class`).
pub fn card_class(extensions: &serde_json::Value) -> Option<String> {
    extensions
        .get("otakusoul_5e")?
        .get("class")?
        .as_str()
        .filter(|id| class(id).is_some())
        .map(str::to_string)
}

/// Gives player and companions their rules values from the class templates (call it for 5e
/// scenes only). A changed class rebuilds the values; otherwise hit points stay as they are.
/// Order: the scene's choice, the class on the character card (`card_class_of`, asked only
/// for companions without a class), the default by place in the party.
pub fn ensure_party_stats(t: &mut Table, card_class_of: impl Fn(&str) -> Option<String>) {
    let rules = t.rules.cloned().unwrap_or_default();
    let class_for = |key: &str| {
        rules
            .hero_classes
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(key))
            .map(|(_, class)| class.clone())
    };
    let party = t.party;
    for combatant in t.combat.combatants.iter_mut().filter(|c| is_party(c)) {
        let key = if combatant.role == "player" {
            "player"
        } else {
            combatant.name.as_str()
        };
        // Without a choice the place in the scene's party decides (stable across saves).
        let companion_index = party
            .iter()
            .position(|name| name.eq_ignore_ascii_case(&combatant.name))
            .unwrap_or(party.len());
        let chosen = class_for(key).filter(|id| class(id).is_some());
        let wanted = match (chosen, &combatant.stats5e) {
            (Some(id), _) => id,
            // No choice in the scene: a hero keeps the class they joined with.
            (None, Some(stats)) if class(&stats.class_id).is_some() => stats.class_id.clone(),
            (None, _) => (combatant.role == "companion")
                .then(|| card_class_of(&combatant.name))
                .flatten()
                .unwrap_or_else(|| default_class(&combatant.role, companion_index).to_string()),
        };
        if combatant
            .stats5e
            .as_ref()
            .is_some_and(|s| s.class_id == wanted)
        {
            combatant.hp = combatant.hp.min(combatant.max_hp);
            continue;
        }
        let Some(template) = class(&wanted) else {
            continue;
        };
        let (stats, max_hp) = hero_stats(template);
        combatant.stats5e = Some(stats);
        combatant.max_hp = max_hp;
        combatant.hp = max_hp;
    }
}

/// Levels of the party members still standing (for the XP budget).
pub fn party_levels(combat: &EncounterState) -> Vec<u32> {
    combat
        .combatants
        .iter()
        .filter(|c| is_party(c) && is_up(c))
        .map(|c| c.stats5e.as_ref().map_or(1, |s| s.level))
        .collect()
}

/// A 5e rest for the party. Short: each hero spends hit dice (d + CON) while below three
/// quarters of their hit points. Long: full hit points, all spell slots, half the hit dice
/// back, death saves and fight conditions cleared, Aid ends. Returns one line per hero for
/// the chronicle (English; the narrator retells it).
pub fn rest_party<R: Rng + ?Sized>(t: &mut Table, long: bool, rng: &mut R) -> Vec<String> {
    let mut lines = Vec::new();
    for c in t.combat.combatants.iter_mut().filter(|c| is_party(c)) {
        let Some(stats) = c.stats5e.as_mut() else {
            continue;
        };
        if stats.death_saves.dead {
            continue;
        }
        let before = c.hp;
        if long {
            if c.conditions.iter().any(|x| x.name == AID) {
                c.max_hp = (c.max_hp - 5).max(1);
            }
            c.hp = c.max_hp;
            stats.hit_dice_left = (stats.hit_dice_left + (stats.level / 2).max(1)).min(stats.level);
            if let Some(casting) = stats.spellcasting.as_mut() {
                casting.slots_used = [0; 9];
            }
            long_rest(stats);
            stats.death_saves = DeathSaves::default();
            stats.concentration = None;
            c.conditions.clear();
        } else {
            let con = stats.modifier(Ability::Con);
            while stats.hit_dice_left > 0 && c.hp * 4 < c.max_hp * 3 {
                stats.hit_dice_left -= 1;
                let roll = rng.random_range(1..=stats.hit_die) as i32;
                c.hp = (c.hp + (roll + con).max(1)).min(c.max_hp);
            }
            if c.hp > 0 {
                stats.death_saves = DeathSaves::default();
                c.conditions.retain(|x| x.name != UNCONSCIOUS);
            }
            short_rest(stats);
            let recovered = arcane_recovery(stats);
            if !recovered.is_empty() {
                lines.push(format!(
                    "{}: Arcane Recovery restores spell slots of level {:?}",
                    c.name, recovered
                ));
            }
        }
        lines.push(format!("{}: {} → {} HP", c.name, before, c.hp));
    }
    lines
}
