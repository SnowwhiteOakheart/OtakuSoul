//! Standard actions besides attacking and casting (SRD 5.1): Help, Hide, Ready, grappling and
//! shoving, escaping a grapple, standing up, two-weapon fighting and a healing potion. Each is
//! offered as an [`ActionOption`] (its id names the action and its target) and carried out by
//! [`perform`], which checks it against the options again.

use crate::*;
use rand::Rng;

pub const HELP: &str = "help";
pub const HIDE: &str = "hide";
pub const READY: &str = "ready";
/// The readied strike goes off (event only).
pub const READIED_ATTACK: &str = "readied_attack";
pub const GRAPPLE: &str = "grapple";
pub const SHOVE_PRONE: &str = "shove_prone";
pub const SHOVE_PUSH: &str = "shove_push";
pub const ESCAPE: &str = "escape";
pub const STAND_UP: &str = "stand_up";
pub const OFFHAND: &str = "offhand";
pub const POTION: &str = "potion";
/// The Rogue's Cunning Action: Hide as a bonus action.
pub const CUNNING_HIDE: &str = "cunning_hide";

fn option(id: String, target: Option<&Combatant>) -> ActionOption {
    ActionOption {
        id,
        target_id: target.map(|t| t.id.clone()),
        ..Default::default()
    }
}

/// Within 5 ft; without a board everyone counts as close.
fn close(a: &Combatant, b: &Combatant) -> bool {
    match (a.position, b.position) {
        (Some(x), Some(y)) => x.squares_to(y) <= 1,
        _ => true,
    }
}

fn foes<'a>(
    actor: &'a Combatant,
    combatants: &'a [Combatant],
) -> impl Iterator<Item = &'a Combatant> {
    combatants
        .iter()
        .filter(move |c| c.id != actor.id && is_up(c) && is_enemy(c) != is_enemy(actor))
}

fn capable(c: &Combatant) -> bool {
    is_up(c) && !incapacitated(c)
}

fn skill_bonus(c: &Combatant, skill: &str) -> i32 {
    c.stats5e
        .as_ref()
        .and_then(|s| check_bonus(s, skill))
        .unwrap_or(0)
}

/// Passive Wisdom (Perception): 10 + the Perception bonus.
pub fn passive_perception(c: &Combatant) -> i32 {
    10 + skill_bonus(c, "perception")
}

/// A shove's or grapple's defence: the better of Athletics and Acrobatics.
fn defence_bonus(c: &Combatant) -> i32 {
    skill_bonus(c, "athletics").max(skill_bonus(c, "acrobatics"))
}

/// The square a shove pushes `target` to: one step straight away from the shover.
fn push_square(from: GridPos, to: GridPos) -> GridPos {
    GridPos::new(
        to.x + (to.x - from.x).signum(),
        to.y + (to.y - from.y).signum(),
    )
}

fn free_square(map: &BattleMap, square: GridPos, combatants: &[Combatant]) -> bool {
    map.walkable(square)
        && !combatants
            .iter()
            .any(|c| is_up(c) && c.position == Some(square))
}

/// Hiding works on a board, out of every foe's reach, where each foe that could see the
/// creature has it behind (at least half) cover.
pub fn can_hide(map: Option<&BattleMap>, actor: &Combatant, combatants: &[Combatant]) -> bool {
    let (Some(map), Some(at)) = (map, actor.position) else {
        return false;
    };
    if has_condition(actor, HIDDEN) {
        return false;
    }
    foes(actor, combatants).all(|foe| {
        let Some(from) = foe.position else {
            return true;
        };
        if from.squares_to(at) <= 1 {
            return false;
        }
        let creatures: Vec<GridPos> = combatants
            .iter()
            .filter(|c| c.id != actor.id && c.id != foe.id && is_up(c))
            .filter_map(|c| c.position)
            .collect();
        !map.line_of_sight(from, at) || !map.cover(from, at, &creatures).is_none()
    })
}

/// Light melee weapons the actor wears (for two-weapon fighting).
fn light_weapons(actor: &Combatant) -> Vec<&'static ItemData> {
    actor.stats5e.as_ref().map_or_else(Vec::new, |stats| {
        stats
            .equipped
            .iter()
            .filter_map(|id| item(id))
            .filter(|i| {
                i.weapon
                    .as_ref()
                    .is_some_and(|w| w.light && !w.ranged && !w.thrown_only)
            })
            .collect()
    })
}

/// Whether an attack id is a light melee weapon (its strike opens the off-hand attack).
pub fn is_light_melee(attack_id: &str) -> bool {
    item(attack_id)
        .and_then(|i| i.weapon.as_ref())
        .is_some_and(|w| w.light && !w.ranged && !w.thrown_only)
}

/// The off-hand strike: the weapon's attack without a positive ability modifier on the damage.
fn offhand_attack(actor: &Combatant, weapon_id: &str) -> Option<Attack> {
    let stats = actor.stats5e.as_ref()?;
    let item = item(weapon_id)?;
    let mut attack = weapon_attacks(stats, item).into_iter().next()?;
    let weapon = item.weapon.as_ref()?;
    let modifier = DiceFormula::parse(&attack.damage).map_or(0, |f| f.modifier);
    if modifier > 0 {
        attack.damage = weapon.damage.clone();
    }
    Some(attack)
}

/// The standard actions the current combatant may take now: with the action still unused
/// Help, Hide, Ready, grappling, shoving and escaping; standing up (half the movement) and the
/// off-hand strike (bonus action) also afterwards. Potions need the inventory: [`item_options`].
pub fn maneuver_options(combat: &EncounterState, map: Option<&BattleMap>) -> Vec<ActionOption> {
    let mut options = Vec::new();
    let Some(actor) = combat.combatants.get(combat.current_turn_index) else {
        return options;
    };
    if !capable(actor) || actor.stats5e.is_none() {
        return options;
    }
    let combatants = &combat.combatants;
    let turn = &combat.turn;
    if !turn.action_used {
        let has_ally = combatants
            .iter()
            .any(|c| c.id != actor.id && capable(c) && is_enemy(c) == is_enemy(actor));
        for foe in foes(actor, combatants).filter(|f| close(actor, f)) {
            if has_ally {
                options.push(option(format!("{HELP}:{}", foe.id), Some(foe)));
            }
            if !has_condition(foe, GRAPPLED) {
                options.push(option(format!("{GRAPPLE}:{}", foe.id), Some(foe)));
            }
            if !has_condition(foe, PRONE) {
                options.push(option(format!("{SHOVE_PRONE}:{}", foe.id), Some(foe)));
            }
            if let (Some(map), Some(from), Some(to)) = (map, actor.position, foe.position)
                && free_square(map, push_square(from, to), combatants)
            {
                options.push(option(format!("{SHOVE_PUSH}:{}", foe.id), Some(foe)));
            }
        }
        if has_condition(actor, GRAPPLED) {
            options.push(option(ESCAPE.to_string(), None));
        }
        if can_hide(map, actor, combatants) {
            options.push(option(HIDE.to_string(), None));
        }
        let melee = actor
            .stats5e
            .as_ref()
            .is_some_and(|s| s.attacks.iter().any(|a| a.kind == AttackKind::Melee));
        if map.is_some() && melee && !has_condition(actor, READIED) {
            options.push(option(READY.to_string(), None));
        }
    }
    if has_condition(actor, PRONE) {
        let speed = speed_ft(actor);
        if map.is_none() || (speed > 0 && turn.movement_left_ft >= speed / 2) {
            options.push(option(STAND_UP.to_string(), None));
        }
    }
    if map.is_some()
        && turn.action_used
        && !turn.bonus_action_used
        && let Some(main) = &turn.offhand_from
    {
        for weapon in light_weapons(actor).into_iter().filter(|w| w.id != *main) {
            for foe in foes(actor, combatants).filter(|f| close(actor, f)) {
                options.push(ActionOption {
                    id: format!("{OFFHAND}:{}:{}", weapon.id, foe.id),
                    attack_id: Some(weapon.id.clone()),
                    target_id: Some(foe.id.clone()),
                    ..Default::default()
                });
            }
        }
    }
    options
}

/// Healing a potion gives: the SRD item's dice, else the item's fixed amount.
fn potion_heal(item: &InventoryItem) -> Option<String> {
    let srd = item.srd_id.as_deref().and_then(equipment::item);
    match srd.and_then(|i| i.heal.clone()) {
        Some(dice) => Some(dice),
        None if item.item_type == "consumable" && item.hp_restore > 0 => {
            Some(item.hp_restore.to_string())
        }
        None => None,
    }
}

/// Drinking a healing potion or giving it to a hurt or dying ally within reach (party only,
/// with the action): `potion:<inventory id>:<target id>`. `_map` is there for the call's shape
/// (reach comes from the positions, which work without a board too).
pub fn item_options(
    combat: &EncounterState,
    _map: Option<&BattleMap>,
    inventory: &[InventoryItem],
) -> Vec<ActionOption> {
    let Some(actor) = combat.combatants.get(combat.current_turn_index) else {
        return Vec::new();
    };
    if combat.turn.action_used || !capable(actor) || !is_party(actor) {
        return Vec::new();
    }
    let Some(potion) = inventory
        .iter()
        .find(|i| i.quantity > 0 && potion_heal(i).is_some())
    else {
        return Vec::new();
    };
    combat
        .combatants
        .iter()
        .filter(|c| {
            is_party(c)
                && c.hp < c.max_hp
                && (is_up(c)
                    || is_dying(c)
                    || c.stats5e
                        .as_ref()
                        .is_some_and(|s| s.death_saves.stable && !s.death_saves.dead))
                && !has_condition(c, FLED)
                && close(actor, c)
        })
        .map(|c| option(format!("{POTION}:{}:{}", potion.id, c.id), Some(c)))
        .collect()
}

fn event(actor: &Combatant, maneuver: &str, target: Option<&Combatant>) -> CombatEvent {
    CombatEvent::Maneuver {
        actor_id: actor.id.clone(),
        actor_name: actor.name.clone(),
        maneuver: maneuver.to_string(),
        target_id: target.map(|t| t.id.clone()),
        target_name: target.map(|t| t.name.clone()),
        total: None,
        against: None,
        success: true,
    }
}

/// A check's event: the actor's total against what it had to beat (`None`: lost outright).
fn check_event(
    actor: &Combatant,
    maneuver: &str,
    target: Option<&Combatant>,
    total: Option<i32>,
    against: Option<i32>,
    success: bool,
) -> CombatEvent {
    let CombatEvent::Maneuver {
        actor_id,
        actor_name,
        maneuver,
        target_id,
        target_name,
        ..
    } = event(actor, maneuver, target)
    else {
        unreachable!("event() builds a maneuver");
    };
    CombatEvent::Maneuver {
        actor_id,
        actor_name,
        maneuver,
        target_id,
        target_name,
        total,
        against,
        success,
    }
}

fn condition_start(target: &Combatant, condition: &str) -> CombatEvent {
    CombatEvent::ConditionStart {
        target_id: target.id.clone(),
        target_name: target.name.clone(),
        condition: condition.to_string(),
    }
}

fn condition_end(target: &Combatant, condition: &str) -> CombatEvent {
    CombatEvent::ConditionEnd {
        target_id: target.id.clone(),
        target_name: target.name.clone(),
        condition: condition.to_string(),
    }
}

/// A hidden creature that attacks or casts shows itself.
pub fn reveal_hidden(actor: &mut Combatant) -> Option<CombatEvent> {
    remove_condition(actor, HIDDEN).then(|| condition_end(actor, HIDDEN))
}

/// d20 + `bonus`; a creature that fails STR and DEX saves (paralyzed, stunned …) loses
/// contests outright (`None`).
fn check<R: Rng + ?Sized>(c: &Combatant, bonus: i32, rng: &mut R) -> Option<i32> {
    if auto_fails(c, Ability::Str) {
        return None;
    }
    Some(roll_d20(rng, RollMode::Normal).natural as i32 + bonus)
}

/// The Hide check of the combatant at `index`: Stealth against the best passive Perception of
/// its foes.
pub fn hide<R: Rng + ?Sized>(
    combat: &mut EncounterState,
    index: usize,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let against = foes(&combat.combatants[index], &combat.combatants)
        .map(passive_perception)
        .max()
        .unwrap_or(10);
    let actor = &mut combat.combatants[index];
    let total = roll_d20(rng, RollMode::Normal).natural as i32 + skill_bonus(actor, "stealth");
    let success = total >= against;
    let mut events = vec![check_event(
        actor,
        HIDE,
        None,
        Some(total),
        Some(against),
        success,
    )];
    if success {
        add_condition(actor, HIDDEN, 0);
        events.push(condition_start(actor, HIDDEN));
    }
    events
}

/// A contest of the actor against `target`: the actor's total and the target's (`None` = lost
/// outright).
fn contest<R: Rng + ?Sized>(
    actor: &Combatant,
    actor_bonus: i32,
    target: &Combatant,
    target_bonus: i32,
    rng: &mut R,
) -> (Option<i32>, Option<i32>, bool) {
    let mine = check(actor, actor_bonus, rng);
    let theirs = check(target, target_bonus, rng);
    let success = match (mine, theirs) {
        (Some(a), Some(b)) => a >= b,
        (Some(_), None) => true,
        _ => false,
    };
    (mine, theirs, success)
}

/// Carries out a standard action of the current combatant (an id from [`maneuver_options`] or
/// [`item_options`]); spends the action, the bonus action or movement it takes. Empty when the
/// action is not allowed now.
pub fn perform<R: Rng + ?Sized>(t: &mut Table, id: &str, rng: &mut R) -> Vec<CombatEvent> {
    let allowed = maneuver_options(t.combat, t.map.as_ref())
        .iter()
        .chain(item_options(t.combat, t.map.as_ref(), t.inventory).iter())
        .any(|o| o.id == id);
    if !allowed {
        return Vec::new();
    }
    let index = t.combat.current_turn_index;
    let mut parts = id.split(':');
    let kind = parts.next().unwrap_or_default();
    let first = parts.next().unwrap_or_default().to_string();
    let second = parts.next().unwrap_or_default().to_string();
    let target_index = |combat: &EncounterState, target_id: &str| {
        combat.combatants.iter().position(|c| c.id == target_id)
    };
    let combat = &mut *t.combat;
    let mut events = Vec::new();
    match kind {
        HELP => {
            let Some(target) = target_index(combat, &first) else {
                return events;
            };
            combat.turn.action_used = true;
            add_condition(&mut combat.combatants[target], HELPED, 2);
            events.push(event(
                &combat.combatants[index],
                HELP,
                Some(&combat.combatants[target]),
            ));
        }
        HIDE => {
            combat.turn.action_used = true;
            events.extend(hide(combat, index, rng));
        }
        READY => {
            combat.turn.action_used = true;
            let actor = &mut combat.combatants[index];
            add_condition(actor, READIED, 1);
            events.push(event(actor, READY, None));
        }
        GRAPPLE | SHOVE_PRONE | SHOVE_PUSH => {
            let Some(target) = target_index(combat, &first) else {
                return events;
            };
            combat.turn.action_used = true;
            let actor = combat.combatants[index].clone();
            let (total, against, success) = contest(
                &actor,
                skill_bonus(&actor, "athletics"),
                &combat.combatants[target],
                defence_bonus(&combat.combatants[target]),
                rng,
            );
            events.push(check_event(
                &actor,
                kind,
                Some(&combat.combatants[target]),
                total,
                against,
                success,
            ));
            if success {
                let foe = &mut combat.combatants[target];
                match kind {
                    GRAPPLE => {
                        add_condition(foe, GRAPPLED, 0);
                        events.push(condition_start(foe, GRAPPLED));
                    }
                    SHOVE_PRONE => {
                        add_condition(foe, PRONE, 0);
                        events.push(condition_start(foe, PRONE));
                    }
                    _ => {
                        if let (Some(from), Some(to)) = (actor.position, foe.position) {
                            // Forced movement: no opportunity attacks.
                            foe.position = Some(push_square(from, to));
                        }
                    }
                }
            }
        }
        ESCAPE => {
            combat.turn.action_used = true;
            let actor = combat.combatants[index].clone();
            let holder = foes(&actor, &combat.combatants)
                .filter(|f| capable(f) && close(&actor, f))
                .max_by_key(|f| skill_bonus(f, "athletics"))
                .cloned();
            let (total, against, success) = match &holder {
                Some(holder) => contest(
                    &actor,
                    defence_bonus(&actor),
                    holder,
                    skill_bonus(holder, "athletics"),
                    rng,
                ),
                None => (None, None, true),
            };
            events.push(check_event(
                &actor,
                ESCAPE,
                holder.as_ref(),
                total,
                against,
                success,
            ));
            if success {
                let actor = &mut combat.combatants[index];
                remove_condition(actor, GRAPPLED);
                events.push(condition_end(actor, GRAPPLED));
            }
        }
        STAND_UP => {
            let actor = &mut combat.combatants[index];
            if t.map.is_some() {
                combat.turn.movement_left_ft -= speed_ft(actor) / 2;
            }
            remove_condition(actor, PRONE);
            events.push(event(actor, STAND_UP, None));
        }
        OFFHAND => {
            let Some(target) = target_index(combat, &second) else {
                return events;
            };
            let actor = combat.combatants[index].clone();
            let Some(attack) = offhand_attack(&actor, &first) else {
                return events;
            };
            combat.turn.bonus_action_used = true;
            let setup = match (t.map.as_ref(), actor.position) {
                (Some(map), Some(from)) => attack_setup(
                    map,
                    &actor,
                    &attack,
                    from,
                    &combat.combatants[target],
                    &combat.combatants,
                    combat.flanking,
                )
                .unwrap_or_default(),
                _ => AttackSetup::default(),
            };
            let target_id = combat.combatants[target].id.clone();
            let situation = AttackSituation {
                disadvantage: setup.disadvantage,
                distance_ft: actor
                    .position
                    .zip(combat.combatants[target].position)
                    .map(|(a, b)| a.feet_to(b)),
                heroic_death: t.rules.is_some_and(|r| r.heroic_death),
                critical_from: actor.stats5e.as_ref().map_or(20, critical_from),
                target_can_react: !combat.reactions_used.contains(&target_id),
                cover: setup.cover,
                flanked: setup.flanked,
                ..Default::default()
            };
            let attack_events = resolve_attack_with(
                &actor,
                &attack,
                &mut combat.combatants[target],
                &situation,
                rng,
            );
            if attack_events.iter().any(|e| matches!(e, CombatEvent::Feature { feature, actor_id, .. } if feature == "shield" && *actor_id == target_id)) {
                combat.reactions_used.push(target_id);
            }
            events.extend(attack_events);
            events.extend(reveal_hidden(&mut combat.combatants[index]));
        }
        POTION => {
            let Some(target) = target_index(combat, &second) else {
                return events;
            };
            let Some(slot) = t.inventory.iter().position(|i| i.id == first) else {
                return events;
            };
            let Some(dice) = potion_heal(&t.inventory[slot]) else {
                return events;
            };
            combat.turn.action_used = true;
            if t.inventory[slot].quantity > 1 {
                t.inventory[slot].quantity -= 1;
            } else {
                t.inventory.remove(slot);
            }
            let amount = match DiceFormula::parse(&dice) {
                Some(formula) => roll_damage(rng, &formula, false).total,
                None => dice.parse().unwrap_or(0),
            };
            events.push(event(
                &combat.combatants[index],
                POTION,
                Some(&combat.combatants[target]),
            ));
            // Healing brings a dying or stable hero back (`heal` resets the death saves).
            events.extend(heal(&mut combat.combatants[target], amount));
        }
        _ => {}
    }
    events
}

/// At the start of a grappled creature's turn: the grapple ends when no capable foe holds it
/// any more (none left within 5 ft on a board, none left at all without one).
pub fn release_grapple(combat: &mut EncounterState) -> Option<CombatEvent> {
    let index = combat.current_turn_index;
    let actor = combat.combatants.get(index)?;
    if !has_condition(actor, GRAPPLED) {
        return None;
    }
    let held = foes(actor, &combat.combatants).any(|f| capable(f) && close(actor, f));
    if held {
        return None;
    }
    let actor = &mut combat.combatants[index];
    remove_condition(actor, GRAPPLED);
    Some(condition_end(actor, GRAPPLED))
}

/// Before an engine turn: a prone monster or companion stands up when it can (half its
/// movement); a companion gives a healing potion to a dying ally within reach.
pub fn engine_maneuvers<R: Rng + ?Sized>(t: &mut Table, rng: &mut R) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    if maneuver_options(t.combat, t.map.as_ref())
        .iter()
        .any(|o| o.id == STAND_UP)
    {
        events.extend(perform(t, STAND_UP, rng));
    }
    let actor = &t.combat.combatants[t.combat.current_turn_index];
    if is_enemy(actor) {
        return events;
    }
    let dying: Vec<String> = t
        .combat
        .combatants
        .iter()
        .filter(|c| is_dying(c))
        .map(|c| c.id.clone())
        .collect();
    // A healing spell does it better (the turn plan casts it).
    if urgent_cast(t.combat, t.map.as_ref(), actor).is_some() {
        return events;
    }
    let feed = item_options(t.combat, t.map.as_ref(), t.inventory)
        .into_iter()
        .find(|o| o.target_id.as_ref().is_some_and(|id| dying.contains(id)));
    if let Some(feed) = feed {
        events.extend(perform(t, &feed.id, rng));
    }
    events
}
