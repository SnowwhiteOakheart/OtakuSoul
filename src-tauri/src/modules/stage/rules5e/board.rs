//! Fighting on the battle map: who may stand where, how an attack is set up from a square,
//! movement with opportunity attacks, and turn plans for monsters and companions (move to the
//! best square, then attack).

use super::*;
use crate::modules::stage::Combatant;
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

/// Whether the attack reaches from `from`, and with a disadvantage from the situation: long
/// range, or a ranged attack while an enemy stands next to the attacker.
pub fn attack_setup(
    map: &BattleMap,
    actor: &Combatant,
    attack: &Attack,
    from: GridPos,
    target: &Combatant,
    combatants: &[Combatant],
) -> Option<bool> {
    let to = target.position?;
    let mode = attack_reach(map, attack, from, to)?;
    let close_shot = attack.kind != AttackKind::Melee && hostile_adjacent(actor, from, combatants);
    Some(mode == RollMode::Disadvantage || close_shot)
}

/// A turn on the board: an optional move first, then one action.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardPlan {
    pub move_to: Option<GridPos>,
    pub action: TurnDecision,
}

/// The best way to attack `target` with `attack` this turn: the cheapest square within the
/// movement budget from which it reaches, preferring squares without disadvantage. Returns
/// the square, the disadvantage flag and the movement cost.
pub fn approach(
    map: &BattleMap,
    actor: &Combatant,
    attack: &Attack,
    target: &Combatant,
    combatants: &[Combatant],
    budget_ft: u32,
) -> Option<(GridPos, bool, u32)> {
    let start = actor.position?;
    let reach = reachable(map, start, budget_ft, &occupancy(actor, combatants));
    reach
        .ends()
        .into_iter()
        .filter_map(|(square, cost)| {
            attack_setup(map, actor, attack, square, target, combatants)
                .map(|disadvantage| (square, disadvantage, cost))
        })
        .min_by_key(|(square, disadvantage, cost)| (*disadvantage, *cost, *square))
}

/// Every attack the actor can make this turn (after moving if needed), best first:
/// no disadvantage, more expected damage, target `prefer`s lower key.
pub fn attack_plans(
    map: &BattleMap,
    actor: &Combatant,
    combatants: &[Combatant],
    budget_ft: u32,
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
            if let Some((square, disadvantage, cost)) =
                approach(map, actor, attack, target, combatants, budget_ft)
            {
                let damage = expected_damage(attack) * if disadvantage { 1 } else { 2 };
                let plan = BoardPlan {
                    move_to: (Some(square) != actor.position).then_some(square),
                    action: TurnDecision::Attack {
                        attack_id: attack.id.clone(),
                        target_id: target.id.clone(),
                    },
                };
                plans.push((
                    (disadvantage, -damage, prefer(target), cost),
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
    attack_plans(map, actor, combatants, budget_ft, lowest_ac)
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
) -> BoardPlan {
    attack_plans(map, actor, combatants, budget_ft, |c| c.hp)
        .into_iter()
        .next()
        .map(|(plan, _)| plan)
        .unwrap_or(BoardPlan {
            move_to: advance(map, actor, combatants, budget_ft),
            action: TurnDecision::Dodge,
        })
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
                let attacker = combatants[threat].clone();
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
                    continue;
                };
                reactions_used.push(attacker.id.clone());
                events.push(CombatEvent::OpportunityAttack {
                    attacker_id: attacker.id.clone(),
                    attacker_name: attacker.name.clone(),
                    target_name: combatants[mover_index].name.clone(),
                });
                events.extend(resolve_attack(
                    &attacker,
                    &attack,
                    &mut combatants[mover_index],
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
) -> Vec<ActionOption> {
    let mut options = Vec::new();
    if let (Some(stats), Some(from)) = (&actor.stats5e, actor.position) {
        for target in combatants
            .iter()
            .filter(|c| is_up(c) && is_enemy(c) != is_enemy(actor))
        {
            for attack in &stats.attacks {
                if let Some(disadvantage) =
                    attack_setup(map, actor, attack, from, target, combatants)
                {
                    options.push(ActionOption {
                        id: format!("attack:{}:{}", attack.id, target.id),
                        attack_id: Some(attack.id.clone()),
                        target_id: Some(target.id.clone()),
                        disadvantage,
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
    });
    options
}
