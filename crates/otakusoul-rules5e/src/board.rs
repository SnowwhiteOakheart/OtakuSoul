//! Fighting on the battle map: who may stand where, how an attack is set up from a square,
//! movement with opportunity attacks, and turn plans for monsters and companions (move to the
//! best square, then attack).

use super::*;
use crate::Combatant;
use rand::Rng;

/// Squares of the others as allies (passable) and enemies (blocking) of `actor`.
pub fn occupancy(actor: &Combatant, combatants: &[Combatant]) -> Occupancy {
    let mut occupancy = Occupancy::default();
    for other in combatants.iter().filter(|c| c.id != actor.id && is_up(c)) {
        if let Some(pos) = other.position {
            if is_enemy(other) == is_enemy(actor) {
                occupancy.allies.push(pos);
            } else {
                occupancy.enemies.push(pos);
            }
        }
    }
    occupancy
}

fn hostile_adjacent(actor: &Combatant, at: GridPos, combatants: &[Combatant]) -> bool {
    combatants.iter().any(|c| {
        is_up(c)
            && is_enemy(c) != is_enemy(actor)
            && c.position.is_some_and(|p| p.squares_to(at) <= 1)
    })
}

/// How an attack from a square comes out on the board.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AttackSetup {
    /// Long range, or a ranged attack while an enemy stands next to the attacker.
    pub disadvantage: bool,
    /// Cover of the target (walls and pillars, low obstacles, other creatures in the way).
    pub cover: Cover,
    /// Flanking (optional rule): an ally stands right on the other side of the target.
    pub flanked: bool,
}

/// Whether the attack reaches from `from` (`None`: out of range or sight, as before) and how:
/// disadvantage, the target's cover, and – with `flanking` on – advantage from an ally opposite.
pub fn attack_setup(
    map: &BattleMap,
    actor: &Combatant,
    attack: &Attack,
    from: GridPos,
    target: &Combatant,
    combatants: &[Combatant],
    flanking: bool,
) -> Option<AttackSetup> {
    let to = target.position?;
    let mode = attack_reach(map, attack, from, to)?;
    let close_shot = attack.kind != AttackKind::Melee && hostile_adjacent(actor, from, combatants);
    // Other creatures (friend or foe) in the way give half cover; attacker and target never.
    let creatures: Vec<GridPos> = combatants
        .iter()
        .filter(|c| c.id != actor.id && c.id != target.id && is_up(c))
        .filter_map(|c| c.position)
        .collect();
    let opposite = GridPos::new(2 * to.x - from.x, 2 * to.y - from.y);
    let flanked = flanking
        && attack.kind == AttackKind::Melee
        && from.squares_to(to) == 1
        && combatants.iter().any(|c| {
            c.id != actor.id
                && is_enemy(c) == is_enemy(actor)
                && is_up(c)
                && !incapacitated(c)
                && c.position == Some(opposite)
        });
    Some(AttackSetup {
        disadvantage: mode == RollMode::Disadvantage || close_shot,
        cover: map.cover(from, to, &creatures),
        flanked,
    })
}

/// Cover a shooter has on `square` against the nearest enemy (archers like to stand behind something).
fn own_cover(
    map: &BattleMap,
    actor: &Combatant,
    square: GridPos,
    combatants: &[Combatant],
) -> Cover {
    combatants
        .iter()
        .filter(|c| is_up(c) && is_enemy(c) != is_enemy(actor))
        .filter_map(|c| c.position)
        .min_by_key(|p| (p.squares_to(square), *p))
        .map_or(Cover::None, |enemy| map.cover(enemy, square, &[]))
}

/// A turn on the board: an optional move first, then one action.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardPlan {
    pub move_to: Option<GridPos>,
    pub action: TurnDecision,
}

/// The best way to attack `target` with `attack` this turn: a square within the movement budget
/// from which it reaches, preferring no disadvantage, less cover for the target, flanking, then
/// (shooters) cover for oneself, then the cheapest. Returns the square, the setup and the cost of
/// the cheapest square that sets the attack up as well – the weapon choice compares that, so a
/// shooter stepping behind a pillar does not make its bow look dearer than a sword.
pub fn approach(
    map: &BattleMap,
    actor: &Combatant,
    attack: &Attack,
    target: &Combatant,
    combatants: &[Combatant],
    budget_ft: u32,
    flanking: bool,
) -> Option<(GridPos, AttackSetup, u32)> {
    let start = actor.position?;
    let reach = reachable(map, start, budget_ft, &occupancy(actor, combatants));
    let shooter = attack.kind != AttackKind::Melee;
    let options: Vec<(GridPos, AttackSetup, u32)> = reach
        .ends()
        .into_iter()
        .filter_map(|(square, cost)| {
            attack_setup(map, actor, attack, square, target, combatants, flanking)
                .map(|setup| (square, setup, cost))
        })
        .collect();
    let quality = |setup: &AttackSetup| (setup.disadvantage, setup.cover, !setup.flanked);
    let best = options.iter().min_by_key(|(square, setup, cost)| {
        let shelter = if shooter {
            own_cover(map, actor, *square, combatants)
        } else {
            Cover::None
        };
        (quality(setup), std::cmp::Reverse(shelter), *cost, *square)
    })?;
    let cheapest = options
        .iter()
        .filter(|(_, setup, _)| quality(setup) == quality(&best.1))
        .map(|(_, _, cost)| *cost)
        .min()
        .unwrap_or(best.2);
    Some((best.0, best.1, cheapest))
}

/// Every attack the actor can make this turn (after moving if needed), best first:
/// no disadvantage, more expected damage, target `prefer`s lower key.
pub fn attack_plans(
    map: &BattleMap,
    actor: &Combatant,
    combatants: &[Combatant],
    budget_ft: u32,
    flanking: bool,
    prefer: impl Fn(&Combatant) -> i32,
) -> Vec<(BoardPlan, bool)> {
    let Some(stats) = &actor.stats5e else {
        return Vec::new();
    };
    let mut plans = Vec::new();
    for target in combatants
        .iter()
        .filter(|c| is_up(c) && is_enemy(c) != is_enemy(actor))
    {
        for attack in &stats.attacks {
            if let Some((square, setup, cost)) =
                approach(map, actor, attack, target, combatants, budget_ft, flanking)
            {
                let disadvantage = setup.disadvantage;
                let damage = expected_damage(attack) * if disadvantage { 1 } else { 2 };
                let plan = BoardPlan {
                    move_to: (Some(square) != actor.position).then_some(square),
                    action: TurnDecision::Attack {
                        attack_id: attack.id.clone(),
                        target_id: target.id.clone(),
                    },
                };
                plans.push((
                    (disadvantage, setup.cover, -damage, prefer(target), cost),
                    plan,
                    disadvantage,
                ));
            }
        }
    }
    plans.sort_by_key(|plan| plan.0);
    plans
        .into_iter()
        .map(|(_, plan, disadvantage)| (plan, disadvantage))
        .collect()
}

/// When nothing can be attacked: the reachable square closest to the nearest enemy.
pub fn advance(
    map: &BattleMap,
    actor: &Combatant,
    combatants: &[Combatant],
    budget_ft: u32,
) -> Option<GridPos> {
    let start = actor.position?;
    let enemies: Vec<GridPos> = combatants
        .iter()
        .filter(|c| is_up(c) && is_enemy(c) != is_enemy(actor))
        .filter_map(|c| c.position)
        .collect();
    let distance = |p: GridPos| {
        enemies
            .iter()
            .map(|e| p.squares_to(*e))
            .min()
            .unwrap_or(u32::MAX)
    };
    reachable(map, start, budget_ft, &occupancy(actor, combatants))
        .ends()
        .into_iter()
        .min_by_key(|(p, cost)| (distance(*p), *cost))
        .map(|(p, _)| p)
        .filter(|p| *p != start)
}

/// The farthest reachable square from all enemies (to run away).
pub fn retreat(
    map: &BattleMap,
    actor: &Combatant,
    combatants: &[Combatant],
    budget_ft: u32,
) -> Option<GridPos> {
    let start = actor.position?;
    let enemies: Vec<GridPos> = combatants
        .iter()
        .filter(|c| is_up(c) && is_enemy(c) != is_enemy(actor))
        .filter_map(|c| c.position)
        .collect();
    let distance = |p: GridPos| enemies.iter().map(|e| p.squares_to(*e)).min().unwrap_or(0);
    reachable(map, start, budget_ft, &occupancy(actor, combatants))
        .ends()
        .into_iter()
        .max_by_key(|(p, cost)| (distance(*p), std::cmp::Reverse(*cost)))
        .map(|(p, _)| p)
        .filter(|p| *p != start)
}

/// Monster turn on the board: flee when badly hurt, otherwise the best attack it can set up
/// (easiest party member to hit), otherwise move closer.
pub fn monster_board_plan(
    map: &BattleMap,
    actor: &Combatant,
    combatants: &[Combatant],
    budget_ft: u32,
    flanking: bool,
) -> BoardPlan {
    match monster_decision(actor, combatants) {
        TurnDecision::Flee => {
            return BoardPlan {
                move_to: retreat(map, actor, combatants, budget_ft),
                action: TurnDecision::Flee,
            };
        }
        TurnDecision::Dodge => {
            return BoardPlan {
                move_to: retreat(map, actor, combatants, budget_ft),
                action: TurnDecision::Dodge,
            };
        }
        _ => {}
    }
    let lowest_ac = |c: &Combatant| c.stats5e.as_ref().map_or(10, |s| s.armor_class) * 100 + c.hp;
    attack_plans(map, actor, combatants, budget_ft, flanking, lowest_ac)
        .into_iter()
        .next()
        .map(|(plan, _)| plan)
        .unwrap_or(BoardPlan {
            move_to: advance(map, actor, combatants, budget_ft),
            action: TurnDecision::Pass,
        })
}

/// Fallback for heroes on the board: finish off the most hurt enemy it can reach, else close in.
pub fn hero_board_plan(
    map: &BattleMap,
    actor: &Combatant,
    combatants: &[Combatant],
    budget_ft: u32,
    flanking: bool,
) -> BoardPlan {
    attack_plans(map, actor, combatants, budget_ft, flanking, |c| c.hp)
        .into_iter()
        .next()
        .map(|(plan, _)| plan)
        .unwrap_or(BoardPlan {
            move_to: advance(map, actor, combatants, budget_ft),
            action: TurnDecision::Dodge,
        })
}

/// A reaction strike at a moving creature (opportunity attack, readied strike) with the
/// striker's best melee attack; `announce` says which. Uses the striker's reaction.
fn reaction_strike<R: Rng + ?Sized>(
    combatants: &mut [Combatant],
    striker: usize,
    mover_index: usize,
    announce: CombatEvent,
    reactions_used: &mut Vec<String>,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let attacker = combatants[striker].clone();
    let Some(attack) = attacker
        .stats5e
        .as_ref()
        .and_then(|s| {
            s.attacks
                .iter()
                .filter(|a| a.kind == AttackKind::Melee)
                .max_by_key(|a| expected_damage(a))
        })
        .cloned()
    else {
        return Vec::new();
    };
    reactions_used.push(attacker.id.clone());
    let mut events = vec![announce];
    let mover_id = combatants[mover_index].id.clone();
    let situation = AttackSituation {
        target_can_react: !reactions_used.contains(&mover_id),
        ..Default::default()
    };
    let attack_events = resolve_attack_with(
        &attacker,
        &attack,
        &mut combatants[mover_index],
        &situation,
        rng,
    );
    if attack_events
        .iter()
        .any(|e| matches!(e, CombatEvent::Feature { feature, .. } if feature == "shield"))
    {
        reactions_used.push(mover_id);
    }
    events.extend(attack_events);
    events.extend(reveal_hidden(&mut combatants[striker]));
    events
}

/// Walks `path` square by square. Leaving an enemy's reach provokes its opportunity attack
/// (once per round, melee, not after Disengage); a mover who drops stops there.
pub fn walk<R: Rng + ?Sized>(
    combatants: &mut [Combatant],
    mover_index: usize,
    path: &[GridPos],
    disengaged: bool,
    reactions_used: &mut Vec<String>,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let mut walked = Vec::new();
    for &next in path {
        let Some(here) = combatants[mover_index].position else {
            break;
        };
        if !disengaged {
            let mover_side = is_enemy(&combatants[mover_index]);
            let threats: Vec<usize> = (0..combatants.len())
                .filter(|&i| {
                    let c = &combatants[i];
                    i != mover_index
                        && is_up(c)
                        && is_enemy(c) != mover_side
                        && !reactions_used.contains(&c.id)
                        && c.position
                            .is_some_and(|p| p.squares_to(here) <= 1 && p.squares_to(next) > 1)
                        && c.stats5e
                            .as_ref()
                            .is_some_and(|s| s.attacks.iter().any(|a| a.kind == AttackKind::Melee))
                })
                .collect();
            for threat in threats {
                let announce = CombatEvent::OpportunityAttack {
                    attacker_id: combatants[threat].id.clone(),
                    attacker_name: combatants[threat].name.clone(),
                    target_name: combatants[mover_index].name.clone(),
                };
                events.extend(reaction_strike(
                    combatants,
                    threat,
                    mover_index,
                    announce,
                    reactions_used,
                    rng,
                ));
                if !is_up(&combatants[mover_index]) {
                    break;
                }
            }
            if !is_up(&combatants[mover_index]) {
                break;
            }
        }
        combatants[mover_index].position = Some(next);
        walked.push(next);
        // Ready: a foe holding a strike ready hits as the mover steps into its reach (also
        // after Disengage, which only covers leaving reach).
        let mover_side = is_enemy(&combatants[mover_index]);
        let readied: Vec<usize> = (0..combatants.len())
            .filter(|&i| {
                let c = &combatants[i];
                i != mover_index
                    && is_up(c)
                    && !incapacitated(c)
                    && is_enemy(c) != mover_side
                    && has_condition(c, READIED)
                    && !reactions_used.contains(&c.id)
                    && c.position
                        .is_some_and(|p| p.squares_to(next) <= 1 && p.squares_to(here) > 1)
            })
            .collect();
        for striker in readied {
            remove_condition(&mut combatants[striker], READIED);
            let announce = CombatEvent::Maneuver {
                actor_id: combatants[striker].id.clone(),
                actor_name: combatants[striker].name.clone(),
                maneuver: READIED_ATTACK.to_string(),
                target_id: Some(combatants[mover_index].id.clone()),
                target_name: Some(combatants[mover_index].name.clone()),
                total: None,
                against: None,
                success: true,
            };
            events.extend(reaction_strike(
                combatants,
                striker,
                mover_index,
                announce,
                reactions_used,
                rng,
            ));
            if !is_up(&combatants[mover_index]) {
                break;
            }
        }
        if !is_up(&combatants[mover_index]) {
            break;
        }
    }
    if !walked.is_empty() {
        let mover = &combatants[mover_index];
        // The move is reported first; reactions it provoked follow.
        events.insert(
            0,
            CombatEvent::Move {
                actor_id: mover.id.clone(),
                actor_name: mover.name.clone(),
                feet: walked.len() as u32 * SQUARE_FT,
                path: walked,
            },
        );
    }
    events
}

/// A square the current combatant can move to, with its cost.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ReachSquare {
    pub x: i32,
    pub y: i32,
    pub feet: u32,
    /// Route to this square, excluding the starting position.
    #[serde(default)]
    pub path: Vec<GridPos>,
}

/// What the player may do right now (for the UI): squares to move to and actions.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CombatOptions {
    pub actor_id: String,
    pub reachable: Vec<ReachSquare>,
    pub actions: Vec<ActionOption>,
    pub movement_left_ft: u32,
    pub action_used: bool,
    #[serde(default)]
    pub bonus_action_used: bool,
    /// Spells the actor can cast now.
    #[serde(default)]
    pub spells: Vec<SpellOption>,
    /// Class features the actor can use now.
    #[serde(default)]
    pub features: Vec<FeatureOption>,
}

/// A class feature usable right now: what it costs and how many uses are left.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct FeatureOption {
    /// `second_wind`, `action_surge`, `turn_undead`, `cunning_dash`, `cunning_disengage`.
    pub id: String,
    /// `action`, `bonus` or `free`.
    pub cost: String,
    #[serde(default)]
    #[ts(optional)]
    pub uses_left: Option<u32>,
}

/// Attacks the actor can make from where it stands now (board), plus Dodge.
pub fn actions_in_place(
    map: &BattleMap,
    actor: &Combatant,
    combatants: &[Combatant],
    flanking: bool,
) -> Vec<ActionOption> {
    let mut options = Vec::new();
    if let (Some(stats), Some(from)) = (&actor.stats5e, actor.position) {
        for target in combatants
            .iter()
            .filter(|c| is_up(c) && is_enemy(c) != is_enemy(actor))
        {
            for attack in &stats.attacks {
                if let Some(setup) =
                    attack_setup(map, actor, attack, from, target, combatants, flanking)
                {
                    options.push(ActionOption {
                        id: format!("attack:{}:{}", attack.id, target.id),
                        attack_id: Some(attack.id.clone()),
                        target_id: Some(target.id.clone()),
                        disadvantage: setup.disadvantage,
                        cover: setup.cover,
                        flanked: setup.flanked,
                    });
                }
            }
        }
    }
    options.push(ActionOption {
        id: "dodge".to_string(),
        attack_id: None,
        target_id: None,
        disadvantage: false,
        ..Default::default()
    });
    options
}
