use super::*;
use crate::*;
use rand::Rng;

/// What starting a fight did, for the app's log.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct EncounterStart {
    /// The fight started (at least one known monster).
    pub started: bool,
    /// Monster ids that are not in the SRD data (skipped).
    pub unknown: Vec<String>,
    /// The group was trimmed to the XP budget: (before, after).
    pub trimmed: Option<(usize, usize)>,
}

/// After a fight only the party stays; the next fight rolls initiative anew.
pub fn remove_enemies(combat: &mut EncounterState) {
    combat
        .combatants
        .retain(|c| c.role == "player" || c.role == "companion");
    for combatant in &mut combat.combatants {
        combatant.initiative = 0;
    }
}

/// Sets up a fight with SRD monsters (names in `language_code`), placed on `zone` of the map.
/// With `limit` (fights the game master makes up) a group far beyond deadly for the party is
/// trimmed; prepared encounters of an adventure stay as written. `stamp` makes the enemies'
/// ids unique (the desktop passes the time in milliseconds). The party must already be set up
/// (heroes with their [`Stats5e`]).
pub fn start_encounter_at<R: Rng + ?Sized>(
    t: &mut Table,
    enemies: &[EnemyRequest],
    language_code: &str,
    zone: &str,
    limit: bool,
    stamp: i64,
    rng: &mut R,
) -> EncounterStart {
    let mut report = EncounterStart::default();
    let mut fresh = Vec::new();
    for request in enemies {
        let id = request.monster.as_str();
        let Some(data) = monster(id) else {
            report.unknown.push(id.to_string());
            continue;
        };
        let count = request.count.unwrap_or(1).clamp(1, 8) as usize;
        for _ in 0..count {
            if fresh.len() >= MAX_ENEMIES {
                break;
            }
            fresh.push(data);
        }
    }
    if fresh.is_empty() {
        return report;
    }
    let budget = party_budget(&party_levels(t.combat));
    if limit {
        let before = fresh.len();
        fresh = trim_to_budget(fresh, budget);
        if fresh.len() < before {
            report.trimmed = Some((before, fresh.len()));
        }
    }
    let difficulty = rate(encounter_xp(&fresh), budget);
    remove_enemies(t.combat);
    for (index, data) in fresh.iter().enumerate() {
        let base = data.name.get(language_code).to_string();
        let same_kind = fresh.iter().filter(|other| other.id == data.id).count();
        let number = fresh[..=index]
            .iter()
            .filter(|other| other.id == data.id)
            .count();
        let (stats, hp) = monster_stats(data);
        t.combat.combatants.push(Combatant {
            id: format!("enemy_{stamp}_{index}"),
            name: if same_kind > 1 {
                format!("{base} {number}")
            } else {
                base
            },
            role: "enemy".to_string(),
            hp,
            max_hp: hp,
            stress: 0,
            max_stress: 0,
            initiative: 0,
            conditions: Vec::new(),
            skills: std::collections::HashMap::new(),
            stats5e: Some(stats),
            position: None,
        });
    }
    for combatant in &mut t.combat.combatants {
        combatant
            .conditions
            .retain(|c| c.name != DODGING && c.name != FLED);
    }
    place_on_map(t, zone);
    let initiative = roll_initiative(&mut t.combat.combatants, rng);
    t.combat.is_active = true;
    t.combat.difficulty = Some(difficulty);
    t.combat.round = 1;
    t.combat.current_turn_index = 0;
    t.combat.reactions_used.clear();
    t.combat.events = vec![initiative];
    // The first in the order may be down already (a hero from an earlier fight).
    if !is_up(&t.combat.combatants[0]) {
        advance_turn(t.combat);
    }
    let start = begin_turn(t);
    t.combat.events.push(start);
    report.started = true;
    report
}

/// Places the fighters. While the party explores a map they keep their squares (and the map
/// its fog, doors and traps) and only the enemies arrive on `zone`; otherwise the scene's
/// map is set up fresh with the party on its start zone. Without a map nobody has a position.
pub fn place_on_map(t: &mut Table, zone: &str) {
    let exploring = t.map.as_ref().is_some_and(|m| !m.revealed.is_empty())
        && t.combat
            .combatants
            .iter()
            .filter(|c| is_party(c))
            .all(|c| c.position.is_some());
    if exploring {
        let map = t.map.as_ref().expect("checked above");
        let combatants = &mut t.combat.combatants;
        let mut taken: Vec<GridPos> = combatants
            .iter()
            .filter(|c| is_party(c))
            .filter_map(|c| c.position)
            .collect();
        let enemies: Vec<usize> = (0..combatants.len())
            .filter(|&i| !is_party(&combatants[i]))
            .collect();
        let zone = if map.zone_cells(zone).is_empty() {
            "spawn"
        } else {
            zone
        };
        let spots = map.placements(zone, enemies.len(), &taken);
        for (slot, index) in enemies.into_iter().enumerate() {
            let spot = spots.get(slot).copied();
            combatants[index].position = spot;
            taken.extend(spot);
        }
        return;
    }
    *t.map = t
        .rules
        .and_then(|r| r.map_id.as_deref())
        .and_then(battle_map)
        .cloned();
    let Some(map) = t.map.as_ref() else {
        for combatant in &mut t.combat.combatants {
            combatant.position = None;
        }
        return;
    };
    let combatants = &mut t.combat.combatants;
    let mut taken = Vec::new();
    for (zone, party) in [("party", true), (zone, false)] {
        let indices: Vec<usize> = (0..combatants.len())
            .filter(|&i| is_party(&combatants[i]) == party)
            .collect();
        let spots = map.placements(zone, indices.len(), &taken);
        for (slot, index) in indices.into_iter().enumerate() {
            let spot = spots.get(slot).copied();
            combatants[index].position = spot;
            taken.extend(spot);
        }
    }
}

/// Starts the current combatant's turn: effects "until your next turn" end, its reaction
/// comes back, and it gets its movement (on a board) and one action.
pub fn begin_turn(t: &mut Table) -> CombatEvent {
    let index = t.combat.current_turn_index;
    let round = t.combat.round;
    let actor = &mut t.combat.combatants[index];
    let actor_id = actor.id.clone();
    let event = start_turn(actor, round);
    // Speed after conditions (grappled, restrained, slowed …).
    let speed = speed_ft(actor);
    t.combat.reactions_used.retain(|id| *id != actor_id);
    t.combat.turn = TurnBudget {
        movement_left_ft: if t.map.is_some() { speed } else { 0 },
        action_used: false,
        bonus_action_used: false,
        disengaged: false,
        sneak_used: false,
    };
    event
}

/// Ends the fight: enemies leave, fight-only effects end (Dodge, Bless, Sleep, Hold …);
/// heroes who went down wake with 1 hit point – except the dead (only with heroic death).
pub fn end_encounter(t: &mut Table) {
    t.combat.is_active = false;
    if let Some(map) = t.map.as_mut() {
        map.active_encounter = None;
    }
    t.combat.effects.clear();
    for combatant in t.combat.combatants.iter_mut().filter(|c| is_party(c)) {
        let dead = combatant
            .stats5e
            .as_ref()
            .is_some_and(|s| s.death_saves.dead);
        if let Some(stats) = combatant.stats5e.as_mut() {
            stats.concentration = None;
            if !dead {
                stats.death_saves = DeathSaves::default();
            }
        }
        if !dead {
            combatant.hp = combatant.hp.max(1);
            remove_condition(combatant, UNCONSCIOUS);
        }
    }
    // Conditions that only make sense within a fight; long-lasting buffs (Mage Armor, Aid)
    // and narrative conditions stay.
    const FIGHT_ONLY: [&str; 10] = [
        DODGING,
        FLED,
        BLESSED,
        SHIELD_OF_FAITH,
        ASLEEP,
        PARALYZED,
        SLOWED,
        GUIDED,
        NO_HEAL,
        PRONE,
    ];
    for combatant in &mut t.combat.combatants {
        combatant
            .conditions
            .retain(|c| !FIGHT_ONLY.contains(&c.name.as_str()));
    }
    remove_enemies(t.combat);
}
