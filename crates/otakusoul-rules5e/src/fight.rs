//! The deterministic fight flow of a 5e scene on a [`Table`]: starting and ending encounters,
//! turns, the player's actions, the engine's turns for monsters and companions, rests. The
//! language model is not part of it: where a companion may choose (on the desktop the model
//! picks), [`engine_plan`] hands out a [`CompanionChoice`] with the legal options and the
//! engine's fallback. Randomness, the language of monster names and the stamp for new ids come
//! from the caller.
//!
//! A round as the desktop plays it: the player's input ([`parse_player_action`] →
//! [`apply_player_action`], when the turn is over [`next_turn`]), then
//! [`play_until_player`] (or step by step [`engine_turn_prelude`] → [`engine_plan`] →
//! [`play_turn`] → [`next_turn`]), then [`record_round`]; the app ends a decided fight with
//! [`end_encounter`].

use super::*;
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

/// The player decides for this combatant (always for the player, for companions when the
/// scene says so).
pub fn player_controls(rules: Option<&SceneRules>, combatant: &Combatant) -> bool {
    combatant.role == "player"
        || (combatant.role == "companion" && rules.is_some_and(|r| r.control_companions))
}

/// What the current combatant may still spend on a spell.
pub fn cast_budget(combat: &EncounterState) -> CastBudget {
    CastBudget {
        action: !combat.turn.action_used,
        bonus_action: !combat.turn.bonus_action_used,
    }
}

/// Casts a spell for the current combatant if it is (still) valid; spends the action or the
/// bonus action it takes.
fn cast<R: Rng + ?Sized>(t: &mut Table, request_id: &str, rng: &mut R) -> Vec<CombatEvent> {
    let index = t.combat.current_turn_index;
    let Some(request) = CastRequest::parse(request_id) else {
        return Vec::new();
    };
    let caster = t.combat.combatants[index].clone();
    let Ok(spell) = check_cast(
        t.map.as_ref(),
        &caster,
        &t.combat.combatants,
        &request,
        cast_budget(t.combat),
    ) else {
        return vec![CombatEvent::Pass {
            actor_id: caster.id,
            actor_name: caster.name,
        }];
    };
    match spell.casting {
        CastingTime::Action => t.combat.turn.action_used = true,
        CastingTime::Bonus => t.combat.turn.bonus_action_used = true,
        CastingTime::Reaction => {}
    }
    let heroic = t.heroic_death();
    let mut events = cast_spell(
        t.map.as_ref(),
        &mut t.combat.combatants,
        index,
        spell,
        &request,
        &mut t.combat.effects,
        heroic,
        rng,
    );
    events.extend(settle(t.combat));
    events
}

/// Undead enemies the current combatant could turn (within 30 ft on a board).
fn undead_in_reach(combat: &EncounterState) -> Vec<usize> {
    let actor = &combat.combatants[combat.current_turn_index];
    (0..combat.combatants.len())
        .filter(|&i| {
            let c = &combat.combatants[i];
            is_enemy(c) != is_enemy(actor)
                && is_up(c)
                && c.stats5e
                    .as_ref()
                    .is_some_and(|s| s.creature_type == "undead")
                && !has_condition(c, TURNED)
                && match (actor.position, c.position) {
                    (Some(a), Some(b)) => a.feet_to(b) <= TURN_UNDEAD_FT,
                    _ => true,
                }
        })
        .collect()
}

/// Class features the current combatant can use now.
pub fn feature_options(combat: &EncounterState, map: Option<&BattleMap>) -> Vec<FeatureOption> {
    let actor = &combat.combatants[combat.current_turn_index];
    let Some(stats) = actor.stats5e.as_ref() else {
        return Vec::new();
    };
    let turn = &combat.turn;
    let option = |id: &str, cost: &str, uses: Option<u32>| FeatureOption {
        id: id.to_string(),
        cost: cost.to_string(),
        uses_left: uses,
    };
    let mut options = Vec::new();
    let left = |feature: &str| uses_left(stats, feature);
    if left(SECOND_WIND) > 0 && !turn.bonus_action_used && actor.hp < actor.max_hp {
        options.push(option(SECOND_WIND, "bonus", Some(left(SECOND_WIND))));
    }
    if left(ACTION_SURGE) > 0 && turn.action_used {
        options.push(option(ACTION_SURGE, "free", Some(left(ACTION_SURGE))));
    }
    if left(TURN_UNDEAD) > 0 && !turn.action_used && !undead_in_reach(combat).is_empty() {
        options.push(option(TURN_UNDEAD, "action", Some(left(TURN_UNDEAD))));
    }
    if has_feature(stats, CUNNING_ACTION) && !turn.bonus_action_used && map.is_some() {
        options.push(option("cunning_dash", "bonus", None));
        options.push(option("cunning_disengage", "bonus", None));
    }
    options
}

/// Uses a class feature of the current combatant (checked against [`feature_options`]).
pub fn use_feature<R: Rng + ?Sized>(t: &mut Table, id: &str, rng: &mut R) -> Vec<CombatEvent> {
    if !feature_options(t.combat, t.map.as_ref())
        .iter()
        .any(|o| o.id == id)
    {
        return Vec::new();
    }
    let combat = &mut *t.combat;
    let index = combat.current_turn_index;
    let actor = &mut combat.combatants[index];
    let feature = |actor: &Combatant, feature: &str| CombatEvent::Feature {
        actor_id: actor.id.clone(),
        actor_name: actor.name.clone(),
        feature: feature.to_string(),
    };
    let mut events = vec![feature(actor, id)];
    let Some(stats) = actor.stats5e.as_mut() else {
        return Vec::new();
    };
    match id {
        SECOND_WIND => {
            spend(stats, id);
            let amount = rng.random_range(1..=10) + stats.level as i32;
            combat.turn.bonus_action_used = true;
            events.extend(heal(actor, amount));
        }
        ACTION_SURGE => {
            spend(stats, id);
            combat.turn.action_used = false;
        }
        "cunning_dash" => {
            let speed = speed_ft(actor);
            combat.turn.bonus_action_used = true;
            combat.turn.movement_left_ft += speed;
        }
        "cunning_disengage" => {
            combat.turn.bonus_action_used = true;
            combat.turn.disengaged = true;
        }
        TURN_UNDEAD => {
            spend(stats, id);
            let dc = spell_save_dc(stats);
            combat.turn.action_used = true;
            for target in undead_in_reach(combat) {
                let undead = &mut combat.combatants[target];
                let save = saving_throw(undead, Ability::Wis, dc, rng);
                let saved = matches!(save, CombatEvent::Save { success: true, .. });
                events.push(save);
                if !saved {
                    add_condition(undead, TURNED, ONE_MINUTE);
                    events.push(CombatEvent::ConditionStart {
                        target_id: undead.id.clone(),
                        target_name: undead.name.clone(),
                        condition: TURNED.to_string(),
                    });
                }
            }
        }
        _ => return Vec::new(),
    }
    events
}

/// Sneak Attack (once per turn, not with disadvantage): with advantage on the attack, or an
/// ally standing next to the target. Without a board an ally still standing is enough.
fn sneak_attack_allowed(
    actor: &Combatant,
    target: &Combatant,
    allies: &[(Option<GridPos>, bool)],
    distance_ft: Option<u32>,
    disadvantage: bool,
    used: bool,
) -> bool {
    if used
        || disadvantage
        || actor
            .stats5e
            .as_ref()
            .is_none_or(|s| sneak_attack_dice(s) == 0)
    {
        return false;
    }
    let (mode, _) = attack_conditions(actor, target, distance_ft);
    if mode == RollMode::Disadvantage {
        return false;
    }
    mode == RollMode::Advantage
        || allies.iter().any(|(pos, ready)| {
            *ready
                && match (pos, target.position) {
                    (Some(a), Some(t)) => a.squares_to(t) == 1,
                    _ => true,
                }
        })
}

/// Carries out a decision of the current combatant (uses its action; spells may use the
/// bonus action instead).
pub fn act<R: Rng + ?Sized>(
    t: &mut Table,
    decision: TurnDecision,
    rng: &mut R,
) -> Vec<CombatEvent> {
    if let TurnDecision::Cast(request) = &decision {
        return cast(t, request, rng);
    }
    if let TurnDecision::Feature(id) = &decision {
        return use_feature(t, id, rng);
    }
    t.combat.turn.action_used = true;
    let heroic_death = t.heroic_death();
    let map = t.map.as_ref();
    let combat = &mut *t.combat;
    let index = combat.current_turn_index;
    match decision {
        TurnDecision::Cast(_) | TurnDecision::Feature(_) => unreachable!("handled above"),
        TurnDecision::Attack {
            attack_id,
            target_id,
        } => {
            let actor = combat.combatants[index].clone();
            let attack = actor
                .stats5e
                .as_ref()
                .and_then(|s| s.attack(&attack_id))
                .cloned();
            let disadvantage = match (map, &attack, actor.position) {
                (Some(map), Some(attack), Some(from)) => combat
                    .combatants
                    .iter()
                    .find(|c| c.id == target_id)
                    .and_then(|target| {
                        attack_setup(map, &actor, attack, from, target, &combat.combatants)
                    })
                    .unwrap_or(false),
                _ => false,
            };
            // Allies of the attacker who stand ready (for Sneak Attack).
            let allies: Vec<(Option<GridPos>, bool)> = combat
                .combatants
                .iter()
                .filter(|c| c.id != actor.id && is_enemy(c) == is_enemy(&actor))
                .map(|c| (c.position, is_up(c) && !incapacitated(c)))
                .collect();
            let sneak_used = combat.turn.sneak_used;
            let target_can_react = !combat.reactions_used.contains(&target_id);
            let target = combat.combatants.iter_mut().find(|c| c.id == target_id);
            match (attack, target) {
                (Some(attack), Some(target)) => {
                    let distance_ft = actor
                        .position
                        .zip(target.position)
                        .map(|(a, b)| a.feet_to(b));
                    let stats = actor.stats5e.as_ref();
                    let sneak_dice = if sneak_attack_allowed(
                        &actor,
                        target,
                        &allies,
                        distance_ft,
                        disadvantage,
                        sneak_used,
                    ) {
                        stats.map_or(0, sneak_attack_dice)
                    } else {
                        0
                    };
                    let situation = AttackSituation {
                        disadvantage,
                        distance_ft,
                        heroic_death,
                        sneak_dice,
                        critical_from: stats.map_or(20, critical_from),
                        target_can_react,
                    };
                    let events = resolve_attack_with(&actor, &attack, target, &situation, rng);
                    if events.iter().any(|e| matches!(e, CombatEvent::Feature { feature, .. } if feature == SNEAK_ATTACK)) {
                        combat.turn.sneak_used = true;
                    }
                    if events.iter().any(|e| matches!(e, CombatEvent::Feature { feature, actor_id, .. } if feature == "shield" && *actor_id == target_id)) {
                        combat.reactions_used.push(target_id.clone());
                    }
                    events
                }
                _ => vec![CombatEvent::Pass {
                    actor_id: actor.id.clone(),
                    actor_name: actor.name.clone(),
                }],
            }
        }
        TurnDecision::Dodge => vec![take_dodge(&mut combat.combatants[index])],
        TurnDecision::Flee => vec![flee(&mut combat.combatants[index])],
        TurnDecision::Pass => {
            let actor = &combat.combatants[index];
            vec![CombatEvent::Pass {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
    }
}

/// Ends the current combatant's turn (short spell riders end, repeated saves) and starts
/// the next one. Dying heroes roll their death save, incapacitated creatures lose their turn,
/// both without waiting for anyone. Empty when nobody can act.
pub fn next_turn<R: Rng + ?Sized>(t: &mut Table, rng: &mut R) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let heroic = t.heroic_death();
    for _ in 0..t.combat.combatants.len() * 2 + 2 {
        let index = t.combat.current_turn_index;
        end_of_turn_conditions(&mut t.combat.combatants[index]);
        events.extend(repeat_saves(
            &mut t.combat.combatants,
            index,
            &mut t.combat.effects,
            rng,
        ));
        events.extend(settle(t.combat));
        if combat_outcome(&t.combat.combatants).is_some() || !advance_turn(t.combat) {
            break;
        }
        events.push(begin_turn(t));
        let index = t.combat.current_turn_index;
        let actor = &mut t.combat.combatants[index];
        if is_dying(actor) {
            events.push(death_save(actor, heroic, rng));
            continue;
        }
        if incapacitated(actor) {
            events.push(CombatEvent::Pass {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            });
            continue;
        }
        break;
    }
    events
}

/// After anything that can hurt: effects whose caster lost concentration end.
pub fn settle(combat: &mut EncounterState) -> Vec<CombatEvent> {
    sync_concentration(&mut combat.combatants, &mut combat.effects)
}

/// Moves the current combatant along the path to `target` (opportunity attacks included)
/// and spends the movement.
pub fn move_current<R: Rng + ?Sized>(
    t: &mut Table,
    target: GridPos,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let Some(map) = t.map.as_ref() else {
        return Vec::new();
    };
    let combat = &mut *t.combat;
    let index = combat.current_turn_index;
    let actor = &combat.combatants[index];
    let Some(start) = actor.position else {
        return Vec::new();
    };
    let reach = reachable(
        map,
        start,
        combat.turn.movement_left_ft,
        &occupancy(actor, &combat.combatants),
    );
    let Some(cost) = reach.cost(target) else {
        return Vec::new();
    };
    let path = reach.path(target);
    combat.turn.movement_left_ft -= cost;
    let disengaged = combat.turn.disengaged;
    let events = walk(
        &mut combat.combatants,
        index,
        &path,
        disengaged,
        &mut combat.reactions_used,
        rng,
    );
    // Doors on the way open as the mover passes (up to where it stopped).
    let end = combat.combatants[index].position;
    let walked = end
        .and_then(|e| path.iter().position(|p| *p == e))
        .map_or(0, |i| i + 1);
    if let Some(map) = t.map.as_mut() {
        map.open_doors_on(&path[..walked]);
    }
    events
}

/// What the current combatant may do now, for the UI (and to check the player's action).
pub fn combat_options(combat: &EncounterState, map: Option<&BattleMap>) -> CombatOptions {
    if !combat.is_active {
        return CombatOptions::default();
    }
    let actor = &combat.combatants[combat.current_turn_index];
    let combatants = &combat.combatants;
    let turn = &combat.turn;
    let (reachable, mut actions) = match (map, actor.position) {
        (Some(map), Some(start)) => {
            let reach = reachable(
                map,
                start,
                turn.movement_left_ft,
                &occupancy(actor, combatants),
            );
            let squares = reach
                .ends()
                .into_iter()
                .filter(|(pos, _)| *pos != start)
                .map(|(pos, feet)| ReachSquare {
                    x: pos.x,
                    y: pos.y,
                    feet,
                })
                .collect();
            (squares, actions_in_place(map, actor, combatants))
        }
        _ => (Vec::new(), legal_actions(actor, combatants)),
    };
    if turn.action_used {
        actions.clear();
    }
    CombatOptions {
        actor_id: actor.id.clone(),
        reachable,
        actions,
        movement_left_ft: turn.movement_left_ft,
        action_used: turn.action_used,
        bonus_action_used: turn.bonus_action_used,
        spells: spell_options(map, actor, combatants, cast_budget(combat)),
        features: feature_options(combat, map),
    }
}

/// The player's input for the current combatant.
#[derive(Debug, Clone, PartialEq)]
pub enum PlayerAction {
    Move(GridPos),
    Act(TurnDecision),
    Dash,
    Disengage,
    EndTurn,
}

/// Reads the player's action text (`move:x:y`, `attack:…`, `cast:…`, `feature:…`, `dodge`,
/// `dash`, `disengage`, `end_turn`) and checks it against [`combat_options`]; `None` when it
/// is not allowed now.
pub fn parse_player_action(
    combat: &EncounterState,
    map: Option<&BattleMap>,
    action: &str,
) -> Option<PlayerAction> {
    let options = combat_options(combat, map);
    let on_board = map.is_some();
    let action = action.trim();
    if action == "end_turn" {
        return on_board.then_some(PlayerAction::EndTurn);
    }
    if let Some(rest) = action.strip_prefix("move:") {
        let (x, y) = rest.split_once(':')?;
        let target = GridPos::new(x.parse().ok()?, y.parse().ok()?);
        return options
            .reachable
            .iter()
            .any(|s| s.x == target.x && s.y == target.y)
            .then_some(PlayerAction::Move(target));
    }
    if let Some(id) = action.strip_prefix("feature:") {
        return options
            .features
            .iter()
            .any(|o| o.id == id)
            .then(|| PlayerAction::Act(TurnDecision::Feature(id.to_string())));
    }
    if action.starts_with("cast:") {
        let request = CastRequest::parse(action)?;
        let caster = &combat.combatants[combat.current_turn_index];
        return check_cast(
            map,
            caster,
            &combat.combatants,
            &request,
            cast_budget(combat),
        )
        .ok()
        .map(|_| PlayerAction::Act(TurnDecision::Cast(action.to_string())));
    }
    if !on_board || options.action_used {
        return parse_action(action, &options.actions).map(PlayerAction::Act);
    }
    match action {
        "dash" => Some(PlayerAction::Dash),
        "disengage" => Some(PlayerAction::Disengage),
        _ => parse_action(action, &options.actions).map(PlayerAction::Act),
    }
}

/// Carries out the player's input; returns the events and whether the turn is over.
pub fn apply_player_action<R: Rng + ?Sized>(
    t: &mut Table,
    action: PlayerAction,
    rng: &mut R,
) -> (Vec<CombatEvent>, bool) {
    let index = t.combat.current_turn_index;
    let events = match action {
        PlayerAction::Move(target) => move_current(t, target, rng),
        PlayerAction::Act(decision) => act(t, decision, rng),
        PlayerAction::Dash => {
            let actor = &t.combat.combatants[index];
            t.combat.turn.movement_left_ft += speed_ft(actor);
            t.combat.turn.action_used = true;
            vec![CombatEvent::Dash {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
        PlayerAction::Disengage => {
            let actor = &t.combat.combatants[index];
            t.combat.turn.disengaged = true;
            t.combat.turn.action_used = true;
            vec![CombatEvent::Disengage {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
        PlayerAction::EndTurn => return (Vec::new(), true),
    };
    let turn = &t.combat.turn;
    // A bonus-action spell leaves the action (and without a board the turn) open.
    let over = !is_up(&t.combat.combatants[index])
        || (turn.action_used && (t.map.is_none() || turn.movement_left_ft == 0));
    (events, over)
}

/// A whole engine turn on the board: move to the planned square, then act.
pub fn play_board_plan<R: Rng + ?Sized>(
    t: &mut Table,
    plan: BoardPlan,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    if let Some(target) = plan.move_to {
        events.extend(move_current(t, target, rng));
    }
    if is_up(&t.combat.combatants[t.combat.current_turn_index]) {
        events.extend(act(t, plan.action, rng));
    }
    events
}

/// Up to three sensible casts (and Turn Undead) as options for a companion's choice.
pub fn cast_options(
    combat: &EncounterState,
    map: Option<&BattleMap>,
    actor: &Combatant,
) -> Vec<ActionOption> {
    let mut plans = spell_plans(map, actor, &combat.combatants, cast_budget(combat));
    plans.sort_by_key(|(_, score)| -score);
    plans
        .into_iter()
        .filter(|(_, score)| *score > 0)
        .take(3)
        .map(|(request, _)| ActionOption {
            id: request.id(),
            attack_id: None,
            target_id: None,
            disadvantage: false,
        })
        .chain(
            // Channel Divinity against undead is an action the model may pick.
            feature_options(combat, map)
                .into_iter()
                .filter(|o| o.id == TURN_UNDEAD)
                .map(|o| ActionOption {
                    id: format!("feature:{}", o.id),
                    attack_id: None,
                    target_id: None,
                    disadvantage: false,
                }),
        )
        .collect()
}

/// The decision behind a companion's option id that is not an attack.
fn extra_decision(id: &str) -> TurnDecision {
    match id.strip_prefix("feature:") {
        Some(feature) => TurnDecision::Feature(feature.to_string()),
        None => TurnDecision::Cast(id.to_string()),
    }
}

/// A companion with someone dying in reach of a healing spell casts it without asking.
pub fn urgent_cast(
    combat: &EncounterState,
    map: Option<&BattleMap>,
    actor: &Combatant,
) -> Option<String> {
    spell_plans(map, actor, &combat.combatants, cast_budget(combat))
        .into_iter()
        .filter(|(_, score)| *score >= URGENT_CAST)
        .max_by_key(|(_, score)| *score)
        .map(|(request, _)| request.id())
}

/// A planned engine turn: a decision where the combatant stands (fights without a board) or
/// a board plan (move, then act).
#[derive(Debug, Clone, PartialEq)]
pub enum PlannedTurn {
    InPlace(TurnDecision),
    Board(BoardPlan),
}

/// A companion's choice among legal options (the desktop asks the language model). What
/// [`CompanionChoice::pick`] returns for an unknown id or `None` is the engine's fallback.
#[derive(Debug, Clone, PartialEq)]
pub struct CompanionChoice {
    /// Option ids with what they mean (attacks, casts, Turn Undead, Dodge).
    pub options: Vec<ActionOption>,
    /// On a board: the plan behind each option (same order).
    plans: Option<Vec<BoardPlan>>,
    /// What the engine does without a (valid) choice.
    pub fallback: PlannedTurn,
}

impl CompanionChoice {
    /// The turn behind the chosen option id; the fallback for `None` or an unknown id.
    pub fn pick(self, id: Option<&str>) -> PlannedTurn {
        let chosen = id.and_then(|id| match self.plans {
            Some(plans) => self
                .options
                .iter()
                .zip(plans)
                .find(|(o, _)| o.id == id)
                .map(|(_, plan)| PlannedTurn::Board(plan)),
            None => if id.starts_with("cast:") || id.starts_with("feature:") {
                self.options
                    .iter()
                    .any(|o| o.id == id)
                    .then(|| extra_decision(id))
            } else {
                parse_action(id, &self.options)
            }
            .map(PlannedTurn::InPlace),
        });
        chosen.unwrap_or(self.fallback)
    }
}

/// How the engine plays the current combatant's turn.
#[derive(Debug, Clone, PartialEq)]
pub enum EnginePlan {
    /// No choice to make: monsters (engine AI), urgent healing, nothing to attack.
    Decided(PlannedTurn),
    /// A companion chooses among legal options.
    Choice(CompanionChoice),
}

/// Plans the turn of a monster or a companion (call after [`engine_turn_prelude`]). Monsters
/// follow the engine's AI; a companion heals the dying without asking, otherwise chooses among
/// the attacks it can set up this turn (moving there first), up to three casts and Dodge.
pub fn engine_plan(combat: &EncounterState, map: Option<&BattleMap>) -> EnginePlan {
    let actor = &combat.combatants[combat.current_turn_index];
    let combatants = &combat.combatants;
    let budget = combat.turn.movement_left_ft;
    let Some(map) = map else {
        return if is_enemy(actor) {
            EnginePlan::Decided(PlannedTurn::InPlace(monster_decision(actor, combatants)))
        } else if let Some(id) = urgent_cast(combat, None, actor) {
            EnginePlan::Decided(PlannedTurn::InPlace(TurnDecision::Cast(id)))
        } else {
            let mut options = legal_actions(actor, combatants);
            options.extend(cast_options(combat, None, actor));
            EnginePlan::Choice(CompanionChoice {
                options,
                plans: None,
                fallback: PlannedTurn::InPlace(hero_fallback_decision(actor, combatants)),
            })
        };
    };
    if is_enemy(actor) {
        return EnginePlan::Decided(PlannedTurn::Board(monster_board_plan(
            map, actor, combatants, budget,
        )));
    }
    if let Some(id) = urgent_cast(combat, Some(map), actor) {
        return EnginePlan::Decided(PlannedTurn::Board(BoardPlan {
            move_to: None,
            action: TurnDecision::Cast(id),
        }));
    }
    let mut plans: Vec<(ActionOption, BoardPlan)> = Vec::new();
    for (plan, disadvantage) in attack_plans(map, actor, combatants, budget, |c| c.hp) {
        if let TurnDecision::Attack {
            attack_id,
            target_id,
        } = &plan.action
        {
            let id = format!("attack:{attack_id}:{target_id}");
            if !plans.iter().any(|(o, _)| o.id == id) {
                let option = ActionOption {
                    id,
                    attack_id: Some(attack_id.clone()),
                    target_id: Some(target_id.clone()),
                    disadvantage,
                };
                plans.push((option, plan));
            }
        }
    }
    // Casts happen from where the companion stands.
    for option in cast_options(combat, Some(map), actor) {
        let action = extra_decision(&option.id);
        plans.push((
            option,
            BoardPlan {
                move_to: None,
                action,
            },
        ));
    }
    let fallback = || hero_board_plan(map, actor, combatants, budget);
    if plans.is_empty() {
        // Nothing to attack this turn: no choice to make, the companion closes in.
        return EnginePlan::Decided(PlannedTurn::Board(fallback()));
    }
    plans.push((
        ActionOption {
            id: "dodge".into(),
            attack_id: None,
            target_id: None,
            disadvantage: false,
        },
        BoardPlan {
            move_to: None,
            action: TurnDecision::Dodge,
        },
    ));
    let (options, plans) = plans.into_iter().unzip();
    EnginePlan::Choice(CompanionChoice {
        options,
        plans: Some(plans),
        fallback: PlannedTurn::Board(fallback()),
    })
}

/// Before an engine turn is planned: a badly hurt hero catches their Second Wind (bonus
/// action).
pub fn engine_turn_prelude<R: Rng + ?Sized>(t: &mut Table, rng: &mut R) -> Vec<CombatEvent> {
    let actor = &t.combat.combatants[t.combat.current_turn_index];
    if !is_enemy(actor)
        && actor.hp * 2 < actor.max_hp
        && feature_options(t.combat, t.map.as_ref())
            .iter()
            .any(|o| o.id == SECOND_WIND)
    {
        return use_feature(t, SECOND_WIND, rng);
    }
    Vec::new()
}

/// Carries out a planned engine turn.
pub fn play_turn<R: Rng + ?Sized>(
    t: &mut Table,
    turn: PlannedTurn,
    rng: &mut R,
) -> Vec<CombatEvent> {
    match turn {
        PlannedTurn::InPlace(decision) => act(t, decision, rng),
        PlannedTurn::Board(plan) => play_board_plan(t, plan, rng),
    }
}

/// The whole turn of a monster or a companion; `choose` answers a companion's choice with an
/// option id (`None` = the engine's fallback).
pub fn engine_turn<R: Rng + ?Sized>(
    t: &mut Table,
    rng: &mut R,
    choose: impl FnOnce(&Combatant, &CompanionChoice) -> Option<String>,
) -> Vec<CombatEvent> {
    let mut events = engine_turn_prelude(t, rng);
    let turn = match engine_plan(t.combat, t.map.as_ref()) {
        EnginePlan::Decided(turn) => turn,
        EnginePlan::Choice(choice) => {
            let actor = &t.combat.combatants[t.combat.current_turn_index];
            let id = choose(actor, &choice);
            choice.pick(id.as_deref())
        }
    };
    events.extend(play_turn(t, turn, rng));
    events
}

/// Plays monsters and companions until the player is to act or the fight is decided (at most
/// [`MAX_TURNS_PER_CALL`] turns), like the desktop after the player's turn.
pub fn play_until_player<R: Rng + ?Sized>(
    t: &mut Table,
    rng: &mut R,
    mut choose: impl FnMut(&Combatant, &CompanionChoice) -> Option<String>,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let mut turns = 0;
    while combat_outcome(&t.combat.combatants).is_none() && turns < MAX_TURNS_PER_CALL {
        let actor = &t.combat.combatants[t.combat.current_turn_index];
        if player_controls(t.rules, actor) {
            break;
        }
        events.extend(engine_turn(t, rng, &mut choose));
        turns += 1;
        if combat_outcome(&t.combat.combatants).is_some() {
            break;
        }
        let next = next_turn(t, rng);
        if next.is_empty() {
            break;
        }
        events.extend(next);
    }
    events
}

/// After a round: adds the end of a decided fight to `events` and keeps them in the fight log
/// (at most [`MAX_COMBAT_EVENTS`]). Returns the outcome; the app then ends the fight with
/// [`end_encounter`] (after a victory over a prepared encounter first counting it).
pub fn record_round(
    combat: &mut EncounterState,
    events: &mut Vec<CombatEvent>,
) -> Option<CombatOutcome> {
    let outcome = combat_outcome(&combat.combatants);
    if let Some(outcome) = outcome {
        events.push(CombatEvent::CombatEnd { outcome });
    }
    combat.events.extend(events.iter().cloned());
    let overflow = combat.events.len().saturating_sub(MAX_COMBAT_EVENTS);
    combat.events.drain(..overflow);
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::{SeedableRng, rngs::StdRng};

    fn hero(id: &str, name: &str, role: &str) -> Combatant {
        Combatant {
            id: id.into(),
            name: name.into(),
            role: role.into(),
            hp: 10,
            max_hp: 10,
            stress: 0,
            max_stress: 0,
            initiative: 0,
            conditions: Vec::new(),
            skills: std::collections::HashMap::new(),
            stats5e: None,
            position: None,
        }
    }

    pub(crate) fn table_with_party(map_id: Option<&str>) -> TableState {
        let mut state = TableState {
            rules: Some(SceneRules {
                ruleset: "5e".into(),
                map_id: map_id.map(str::to_string),
                ..Default::default()
            }),
            party: vec!["Lyra".into(), "Finn".into()],
            ..Default::default()
        };
        state.combat.combatants = vec![
            hero("player", "Hiroki", "player"),
            hero("companion_0", "Lyra", "companion"),
            hero("companion_1", "Finn", "companion"),
        ];
        ensure_party_stats(&mut state.table(), |_| None);
        state
    }

    fn goblins(count: u32) -> Vec<EnemyRequest> {
        vec![EnemyRequest {
            monster: "goblin".into(),
            count: Some(count),
        }]
    }

    fn class_of(state: &TableState, name: &str) -> String {
        state
            .combat
            .combatants
            .iter()
            .find(|c| c.name == name)
            .and_then(|c| c.stats5e.as_ref())
            .map(|s| s.class_id.clone())
            .unwrap()
    }

    #[test]
    fn heroes_get_classes_from_the_scene_the_card_or_their_place() {
        let mut state = table_with_party(None);
        assert_eq!(class_of(&state, "Hiroki"), "fighter");
        assert_eq!(class_of(&state, "Lyra"), "cleric");
        assert_eq!(class_of(&state, "Finn"), "rogue");
        // A hero keeps the class they joined with; the scene's choice wins.
        state
            .rules
            .as_mut()
            .unwrap()
            .hero_classes
            .insert("finn".into(), "wizard".into());
        ensure_party_stats(&mut state.table(), |_| Some("fighter".into()));
        assert_eq!(class_of(&state, "Finn"), "wizard");
        assert_eq!(class_of(&state, "Lyra"), "cleric");
        // The card is asked only for a companion without a class.
        let mut fresh = table_with_party(None);
        fresh.combat.combatants[2].stats5e = None;
        ensure_party_stats(&mut fresh.table(), |name| {
            (name == "Finn").then(|| "wizard".to_string())
        });
        assert_eq!(class_of(&fresh, "Finn"), "wizard");
        assert_eq!(
            card_class(&serde_json::json!({"otakusoul_5e": {"class": "rogue"}})).as_deref(),
            Some("rogue")
        );
        assert_eq!(
            card_class(&serde_json::json!({"otakusoul_5e": {"class": "bard"}})),
            None
        );
    }

    #[test]
    fn starting_reports_unknown_monsters_and_trims_made_up_groups() {
        let mut state = table_with_party(None);
        let mut rng = StdRng::seed_from_u64(1);
        let mut enemies = goblins(8);
        enemies.insert(
            0,
            EnemyRequest {
                monster: "dragon".into(),
                count: None,
            },
        );
        let report = start_encounter_at(
            &mut state.table(),
            &enemies,
            "de",
            "spawn",
            true,
            42,
            &mut rng,
        );
        assert!(report.started);
        assert_eq!(report.unknown, ["dragon"]);
        let (before, after) = report.trimmed.expect("eight goblins are far too many");
        assert_eq!(before, 8);
        let foes: Vec<_> = state
            .combat
            .combatants
            .iter()
            .filter(|c| is_enemy(c))
            .collect();
        assert_eq!(foes.len(), after);
        assert!(foes.iter().all(|c| c.id.starts_with("enemy_42_")));
        assert!(matches!(
            state.combat.events.as_slice(),
            [
                CombatEvent::Initiative { .. },
                CombatEvent::TurnStart { .. }
            ]
        ));
        let none = start_encounter_at(
            &mut state.table(),
            &[EnemyRequest {
                monster: "dragon".into(),
                count: None,
            }],
            "de",
            "spawn",
            true,
            43,
            &mut rng,
        );
        assert!(!none.started);
    }

    /// A fight without a board: the player attacks the first enemy, the engine plays the rest
    /// (companions with their fallback) until the fight is decided.
    fn fight_without_board(seed: u64) -> (Vec<CombatEvent>, TableState) {
        let mut state = table_with_party(None);
        let mut rng = StdRng::seed_from_u64(seed);
        assert!(
            start_encounter_at(
                &mut state.table(),
                &goblins(2),
                "en",
                "spawn",
                false,
                7,
                &mut rng
            )
            .started
        );
        let mut log = state.combat.events.clone();
        for _ in 0..200 {
            let mut t = state.table();
            let mut events = play_until_player(&mut t, &mut rng, |_, _| None);
            if combat_outcome(&t.combat.combatants).is_none() {
                let options = combat_options(t.combat, t.map.as_ref());
                let pick = options
                    .actions
                    .iter()
                    .find(|a| a.id.starts_with("attack:"))
                    .map_or("dodge".to_string(), |a| a.id.clone());
                let action = parse_player_action(t.combat, t.map.as_ref(), &pick)
                    .expect("offered actions are valid");
                let (done, over) = apply_player_action(&mut t, action, &mut rng);
                events.extend(done);
                assert!(over, "without a board the action ends the turn");
                if combat_outcome(&t.combat.combatants).is_none() {
                    events.extend(next_turn(&mut t, &mut rng));
                }
            }
            let outcome = record_round(t.combat, &mut events);
            log.extend(events);
            if outcome.is_some() {
                end_encounter(&mut t);
                break;
            }
        }
        (log, state)
    }

    #[test]
    fn a_fight_plays_to_its_end_the_same_way_for_the_same_seed() {
        let (log, state) = fight_without_board(5);
        assert!(matches!(log.last(), Some(CombatEvent::CombatEnd { .. })));
        assert!(log.iter().any(|e| matches!(e, CombatEvent::Attack { .. })));
        assert!(!state.combat.is_active);
        assert!(state.combat.combatants.iter().all(is_party));
        let (again, _) = fight_without_board(5);
        assert_eq!(log, again);
    }

    #[test]
    fn a_companion_choice_falls_back_to_the_engine() {
        let mut state = table_with_party(None);
        let mut rng = StdRng::seed_from_u64(3);
        start_encounter_at(
            &mut state.table(),
            &goblins(1),
            "en",
            "spawn",
            false,
            1,
            &mut rng,
        );
        state.combat.current_turn_index = state
            .combat
            .combatants
            .iter()
            .position(|c| c.name == "Finn")
            .unwrap();
        begin_turn(&mut state.table());
        let EnginePlan::Choice(choice) = engine_plan(&state.combat, state.map.as_ref()) else {
            panic!("a companion chooses");
        };
        let fallback = choice.fallback.clone();
        assert!(choice.options.iter().any(|o| o.id == "dodge"));
        assert_eq!(
            choice.clone().pick(Some("dodge")),
            PlannedTurn::InPlace(TurnDecision::Dodge)
        );
        assert_eq!(choice.clone().pick(Some("fly away")), fallback);
        assert_eq!(choice.pick(None), fallback);
        // Monsters never ask.
        let goblin = state.combat.combatants.iter().position(is_enemy).unwrap();
        state.combat.current_turn_index = goblin;
        assert!(matches!(
            engine_plan(&state.combat, state.map.as_ref()),
            EnginePlan::Decided(PlannedTurn::InPlace(_))
        ));
    }

    #[test]
    fn on_a_board_fighters_are_placed_and_move() {
        let mut state = table_with_party(Some("crypt_hall"));
        let mut rng = StdRng::seed_from_u64(9);
        assert!(
            start_encounter_at(
                &mut state.table(),
                &goblins(2),
                "en",
                "spawn",
                false,
                1,
                &mut rng
            )
            .started
        );
        let map = state.map.clone().expect("the scene's map is loaded");
        for c in &state.combat.combatants {
            let zone = map.cell(c.position.unwrap()).unwrap().zone.clone();
            let wanted = if is_party(c) { "party" } else { "spawn" };
            assert_eq!(zone.as_deref(), Some(wanted), "{}", c.name);
        }
        let player = state
            .combat
            .combatants
            .iter()
            .position(|c| c.role == "player")
            .unwrap();
        state.combat.current_turn_index = player;
        begin_turn(&mut state.table());
        let options = combat_options(&state.combat, state.map.as_ref());
        let square = options.reachable.first().expect("room to move");
        let text = format!("move:{}:{}", square.x, square.y);
        let action = parse_player_action(&state.combat, state.map.as_ref(), &text).unwrap();
        let (events, over) = apply_player_action(&mut state.table(), action, &mut rng);
        assert!(!over && matches!(events.first(), Some(CombatEvent::Move { .. })));
        assert_eq!(
            state.combat.turn.movement_left_ft,
            options.movement_left_ft - square.feet
        );
        assert_eq!(
            parse_player_action(&state.combat, state.map.as_ref(), "end_turn"),
            Some(PlayerAction::EndTurn)
        );
    }

    #[test]
    fn a_companion_choice_on_a_board_plays_the_chosen_attack() {
        let mut state = table_with_party(Some("crypt_hall"));
        let mut rng = StdRng::seed_from_u64(11);
        start_encounter_at(
            &mut state.table(),
            &goblins(1),
            "en",
            "spawn",
            false,
            1,
            &mut rng,
        );
        let finn = state
            .combat
            .combatants
            .iter()
            .position(|c| c.name == "Finn")
            .unwrap();
        let goblin = state.combat.combatants.iter().position(is_enemy).unwrap();
        // The goblin stands right next to Finn.
        let at = state.combat.combatants[finn].position.unwrap();
        let map = state.map.clone().unwrap();
        let taken: Vec<GridPos> = state
            .combat
            .combatants
            .iter()
            .filter_map(|c| c.position)
            .collect();
        let next = [
            (1, 0),
            (-1, 0),
            (0, 1),
            (0, -1),
            (1, 1),
            (-1, -1),
            (1, -1),
            (-1, 1),
        ]
        .into_iter()
        .map(|(dx, dy)| GridPos::new(at.x + dx, at.y + dy))
        .find(|p| map.walkable(*p) && !taken.contains(p))
        .expect("a free square next to Finn");
        state.combat.combatants[goblin].position = Some(next);
        state.combat.current_turn_index = finn;
        begin_turn(&mut state.table());
        let EnginePlan::Choice(choice) = engine_plan(&state.combat, state.map.as_ref()) else {
            panic!("Finn chooses how to attack");
        };
        let option = choice
            .options
            .iter()
            .find(|o| o.id.starts_with("attack:"))
            .expect("an attack on the goblin")
            .clone();
        let PlannedTurn::Board(plan) = choice.clone().pick(Some(&option.id)) else {
            panic!("a board plan");
        };
        assert_eq!(
            plan.action,
            TurnDecision::Attack {
                attack_id: option.attack_id.clone().unwrap(),
                target_id: option.target_id.clone().unwrap(),
            }
        );
        assert_eq!(choice.clone().pick(Some("nothing")), choice.fallback);
        let events = play_turn(&mut state.table(), PlannedTurn::Board(plan), &mut rng);
        assert!(
            events
                .iter()
                .any(|e| matches!(e, CombatEvent::Attack { .. }))
        );
    }

    #[test]
    fn the_fight_log_keeps_the_newest_events() {
        let mut combat = EncounterState {
            events: (0..MAX_COMBAT_EVENTS)
                .map(|i| CombatEvent::Pass {
                    actor_id: i.to_string(),
                    actor_name: String::new(),
                })
                .collect(),
            ..Default::default()
        };
        let mut events = vec![CombatEvent::Pass {
            actor_id: "new".into(),
            actor_name: String::new(),
        }];
        // Nobody against the party any more: the fight is won and says so.
        assert_eq!(
            record_round(&mut combat, &mut events),
            Some(CombatOutcome::Victory)
        );
        assert_eq!(events.len(), 2);
        assert_eq!(combat.events.len(), MAX_COMBAT_EVENTS);
        assert!(matches!(&combat.events[0], CombatEvent::Pass { actor_id, .. } if actor_id == "2"));
        assert!(matches!(
            combat.events.last(),
            Some(CombatEvent::CombatEnd {
                outcome: CombatOutcome::Victory
            })
        ));
    }
}
