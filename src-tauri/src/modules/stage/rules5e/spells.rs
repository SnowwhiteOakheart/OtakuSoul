//! Spells (SRD 5.1, `presets/srd5/spells.json`): what they do, where they reach, and how a
//! cast is resolved – spell attacks, saving throws with half damage, areas on the grid,
//! healing, conditions with concentration, Sleep, buffs, stabilizing and teleporting.

use super::*;
use crate::modules::stage::Combatant;
use rand::{Rng, RngExt};
use std::sync::LazyLock;

const SPELLS_JSON: &str = include_str!("../../../../../presets/srd5/spells.json");

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum CastingTime {
    #[default]
    Action,
    Bonus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum AreaShape {
    /// Radius around a point.
    Sphere,
    /// From the caster towards a point; as wide as it is long at its end.
    Cone,
    /// Next to the caster, towards a point.
    Cube,
    /// From the caster towards a point, 5 ft wide.
    Line,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Area {
    pub shape: AreaShape,
    pub size_ft: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum SpellEffect {
    Attack {
        attack_kind: AttackKind,
        damage: String,
        damage_type: String,
        #[serde(default = "one")]
        rays: u32,
        #[serde(default)]
        #[ts(optional)]
        rider: Option<String>,
    },
    Save {
        save: Ability,
        damage: String,
        damage_type: String,
        #[serde(default)]
        half: bool,
        #[serde(default)]
        #[ts(optional)]
        area: Option<Area>,
    },
    Missiles {
        darts: u32,
        damage: String,
        damage_type: String,
    },
    Heal {
        heal: String,
    },
    Condition {
        save: Ability,
        condition: String,
        #[serde(default)]
        humanoid_only: bool,
    },
    Sleep {
        pool: String,
        area: Area,
    },
    Buff {
        buff: String,
        #[serde(default = "one")]
        targets: u32,
    },
    Stabilize,
    Teleport,
    Cure,
}

fn one() -> u32 {
    1
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SpellData {
    pub id: String,
    pub name: LocalizedName,
    /// 0 = cantrip.
    pub level: u8,
    #[serde(default)]
    pub casting: CastingTime,
    /// 0 = self (areas start at the caster), 5 = touch.
    pub range_ft: u32,
    #[serde(default)]
    pub concentration: bool,
    /// Extra damage/healing dice per slot level above the spell's level.
    #[serde(default)]
    pub upcast_dice: u32,
    pub effect: SpellEffect,
}

impl SpellData {
    /// Needs a point on the board rather than a creature.
    pub fn targets_point(&self) -> bool {
        matches!(
            self.effect,
            SpellEffect::Teleport
                | SpellEffect::Sleep { .. }
                | SpellEffect::Save { area: Some(_), .. }
        )
    }

    /// Meant for allies (healing, buffs …) rather than enemies.
    pub fn helps(&self) -> bool {
        matches!(
            self.effect,
            SpellEffect::Heal { .. }
                | SpellEffect::Buff { .. }
                | SpellEffect::Stabilize
                | SpellEffect::Cure
        )
    }
}

#[derive(serde::Deserialize)]
struct SpellFile {
    spells: Vec<SpellData>,
}

static SPELLS: LazyLock<Vec<SpellData>> = LazyLock::new(|| {
    serde_json::from_str::<SpellFile>(SPELLS_JSON)
        .expect("presets/srd5/spells.json is valid (checked by tests)")
        .spells
});

pub fn spells() -> &'static [SpellData] {
    &SPELLS
}

pub fn spell(id: &str) -> Option<&'static SpellData> {
    SPELLS.iter().find(|s| s.id == id)
}

/// Spell save DC: 8 + proficiency + casting ability modifier.
pub fn spell_save_dc(stats: &Stats5e) -> i32 {
    let ability = stats
        .spellcasting
        .as_ref()
        .map_or(Ability::Int, |c| c.ability);
    8 + stats.proficiency() + stats.modifier(ability)
}

/// Spell attack bonus: proficiency + casting ability modifier.
pub fn spell_attack_bonus(stats: &Stats5e) -> i32 {
    let ability = stats
        .spellcasting
        .as_ref()
        .map_or(Ability::Int, |c| c.ability);
    stats.proficiency() + stats.modifier(ability)
}

/// Dice of a spell's damage or healing: more at higher slots, cantrips grow with the
/// caster's level (5, 11, 17).
fn scaled(formula: &str, spell: &SpellData, slot_level: u8, caster_level: u32) -> DiceFormula {
    let mut dice = DiceFormula::parse(formula).unwrap_or(DiceFormula {
        count: 1,
        sides: 4,
        modifier: 0,
    });
    if spell.level == 0 {
        let tiers = 1
            + u32::from(caster_level >= 5)
            + u32::from(caster_level >= 11)
            + u32::from(caster_level >= 17);
        dice.count *= tiers;
    } else {
        dice.count += spell.upcast_dice * u32::from(slot_level.saturating_sub(spell.level));
    }
    dice
}

/// Squares an area covers. Spheres are centred on `point`; cones, cubes and lines start at
/// the caster and point towards `point`. Squares are counted with the same 5-ft metric as
/// movement (diagonals 5 ft).
pub fn area_squares(area: Area, caster: GridPos, point: GridPos) -> Vec<GridPos> {
    let size = (area.size_ft / map::SQUARE_FT) as i32;
    let (dx, dy) = ((point.x - caster.x) as f64, (point.y - caster.y) as f64);
    let length = (dx * dx + dy * dy).sqrt().max(1e-9);
    let (ux, uy) = (dx / length, dy / length);
    let mut squares = Vec::new();
    let reach = size + 1;
    let centre = match area.shape {
        AreaShape::Sphere => point,
        _ => caster,
    };
    for y in centre.y - reach..=centre.y + reach {
        for x in centre.x - reach..=centre.x + reach {
            let p = GridPos::new(x, y);
            let inside = match area.shape {
                AreaShape::Sphere => p.squares_to(point) as i32 <= size,
                AreaShape::Cone | AreaShape::Line | AreaShape::Cube => {
                    if p == caster {
                        false
                    } else {
                        let (px, py) = (f64::from(p.x - caster.x), f64::from(p.y - caster.y));
                        let along = px * ux + py * uy;
                        let across = (px * uy - py * ux).abs();
                        match area.shape {
                            // Width equals the distance travelled: half-angle ~26.6°.
                            AreaShape::Cone => {
                                along > 0.0
                                    && along <= f64::from(size) + 0.5
                                    && across <= along / 2.0 + 0.5
                            }
                            AreaShape::Line => {
                                along > 0.0 && along <= f64::from(size) + 0.5 && across <= 0.5
                            }
                            _ => {
                                along > 0.0
                                    && along <= f64::from(size) + 0.5
                                    && across <= f64::from(size) / 2.0
                            }
                        }
                    }
                }
            };
            if inside {
                squares.push(p);
            }
        }
    }
    squares
}

/// Where a spell goes: a creature, or a square on the board.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CastTarget {
    Creature(String),
    Point(GridPos),
}

/// A cast to be checked and resolved.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CastRequest {
    pub spell_id: String,
    /// 0 for cantrips, otherwise the slot spent (at least the spell's level).
    pub slot_level: u8,
    pub target: CastTarget,
}

impl CastRequest {
    /// `cast:<spell>:<slot>:<creature id>` or `cast:<spell>:<slot>:@x:y`.
    pub fn id(&self) -> String {
        match &self.target {
            CastTarget::Creature(id) => format!("cast:{}:{}:{id}", self.spell_id, self.slot_level),
            CastTarget::Point(p) => format!(
                "cast:{}:{}:@{}:{}",
                self.spell_id, self.slot_level, p.x, p.y
            ),
        }
    }

    pub fn parse(id: &str) -> Option<CastRequest> {
        let rest = id.trim().strip_prefix("cast:")?;
        let (spell_id, rest) = rest.split_once(':')?;
        let (slot, target) = rest.split_once(':')?;
        let target = match target.strip_prefix('@') {
            Some(point) => {
                let (x, y) = point.split_once(':')?;
                CastTarget::Point(GridPos::new(x.parse().ok()?, y.parse().ok()?))
            }
            None => CastTarget::Creature(target.to_string()),
        };
        Some(CastRequest {
            spell_id: spell_id.to_string(),
            slot_level: slot.parse().ok()?,
            target,
        })
    }
}

/// Why a cast is not possible (for tests and the UI).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CastProblem {
    UnknownSpell,
    NoSlot,
    BudgetUsed,
    OutOfRange,
    WrongTarget,
    Incapacitated,
}

/// What the caster has left this turn.
#[derive(Debug, Clone, Copy, Default)]
pub struct CastBudget {
    pub action: bool,
    pub bonus_action: bool,
}

/// Checks a cast: known spell, a free slot of at least its level, action or bonus action
/// left, a fitting target in range and sight (on a board).
pub fn check_cast(
    map: Option<&BattleMap>,
    caster: &Combatant,
    combatants: &[Combatant],
    request: &CastRequest,
    budget: CastBudget,
) -> Result<&'static SpellData, CastProblem> {
    if incapacitated(caster) {
        return Err(CastProblem::Incapacitated);
    }
    let stats = caster.stats5e.as_ref().ok_or(CastProblem::UnknownSpell)?;
    let casting = stats
        .spellcasting
        .as_ref()
        .ok_or(CastProblem::UnknownSpell)?;
    let spell = spell(&request.spell_id)
        .filter(|s| casting.spells.contains(&s.id))
        .ok_or(CastProblem::UnknownSpell)?;
    if spell.level == 0 {
        if request.slot_level != 0 {
            return Err(CastProblem::NoSlot);
        }
    } else if request.slot_level < spell.level
        || request.slot_level > 9
        || casting.slots_left(request.slot_level) == 0
    {
        return Err(CastProblem::NoSlot);
    }
    let has_time = match spell.casting {
        CastingTime::Action => budget.action,
        CastingTime::Bonus => budget.bonus_action,
    };
    if !has_time {
        return Err(CastProblem::BudgetUsed);
    }
    let from = caster.position;
    match (&request.target, spell.targets_point()) {
        (CastTarget::Point(point), true) => {
            if let (Some(map), Some(from)) = (map, from) {
                let range = if spell.range_ft == 0 {
                    // Self-origin areas: the point only gives the direction, it may be anywhere near.
                    map::SQUARE_FT * 30
                } else {
                    spell.range_ft
                };
                if from.feet_to(*point) > range
                    || !map.contains(*point)
                    || !map.line_of_sight(from, *point)
                {
                    return Err(CastProblem::OutOfRange);
                }
                if matches!(spell.effect, SpellEffect::Teleport)
                    && (!map.walkable(*point)
                        || combatants
                            .iter()
                            .any(|c| is_up(c) && c.position == Some(*point)))
                {
                    return Err(CastProblem::WrongTarget);
                }
            }
            Ok(spell)
        }
        (CastTarget::Creature(id), false) => {
            let target = combatants
                .iter()
                .find(|c| &c.id == id)
                .ok_or(CastProblem::WrongTarget)?;
            let allied = is_enemy(target) == is_enemy(caster);
            let fits = match spell.effect {
                SpellEffect::Stabilize => is_dying(target),
                SpellEffect::Heal { .. } | SpellEffect::Buff { .. } | SpellEffect::Cure => {
                    allied && !target.stats5e.as_ref().is_some_and(|s| s.death_saves.dead)
                }
                SpellEffect::Condition { humanoid_only, .. } => {
                    is_up(target)
                        && !allied
                        && (!humanoid_only
                            || target
                                .stats5e
                                .as_ref()
                                .is_some_and(|s| s.creature_type == "humanoid"))
                }
                _ => is_up(target) && !allied,
            };
            if !fits {
                return Err(CastProblem::WrongTarget);
            }
            if let (Some(map), Some(from), Some(to)) = (map, from, target.position)
                && (from.feet_to(to) > spell.range_ft.max(map::SQUARE_FT)
                    || (from != to && !map.line_of_sight(from, to)))
            {
                return Err(CastProblem::OutOfRange);
            }
            Ok(spell)
        }
        _ => Err(CastProblem::WrongTarget),
    }
}

/// An ongoing spell effect on a creature (for concentration and repeated saves).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ActiveEffect {
    pub spell_id: String,
    pub caster_id: String,
    pub target_id: String,
    pub condition: String,
    pub concentration: bool,
    /// The target repeats this save at the end of each of its turns (Hold Person).
    #[serde(default)]
    #[ts(optional)]
    pub repeat_save: Option<(Ability, i32)>,
}

fn condition_start(target: &Combatant, condition: &str) -> CombatEvent {
    CombatEvent::ConditionStart {
        target_id: target.id.clone(),
        target_name: target.name.clone(),
        condition: condition.to_string(),
    }
}

/// A saving throw against `dc`; paralyzed, stunned and unconscious creatures fail STR/DEX
/// saves, Bless adds a d4, Restrained gives disadvantage on DEX saves.
pub fn saving_throw<R: Rng + ?Sized>(
    target: &Combatant,
    ability: Ability,
    dc: i32,
    rng: &mut R,
) -> CombatEvent {
    let bonus = target
        .stats5e
        .as_ref()
        .map_or(0, |s| s.saving_throw_bonus(ability));
    let mode = RollMode::combine(
        false,
        ability == Ability::Dex && has_condition(target, RESTRAINED),
    );
    let roll = roll_d20(rng, mode);
    let bless = if has_condition(target, BLESSED) {
        rng.random_range(1..=4)
    } else {
        0
    };
    let total = roll.natural as i32 + bonus + bless;
    let success = !auto_fails(target, ability) && total >= dc;
    CombatEvent::Save {
        target_id: target.id.clone(),
        target_name: target.name.clone(),
        ability,
        roll,
        bonus: bonus + bless,
        total,
        dc,
        success,
    }
}

/// Resolves a checked cast: spends the slot, sets concentration, and applies the effect.
#[allow(clippy::too_many_arguments)]
pub fn cast_spell<R: Rng + ?Sized>(
    map: Option<&BattleMap>,
    combatants: &mut [Combatant],
    caster_index: usize,
    spell: &SpellData,
    request: &CastRequest,
    effects: &mut Vec<ActiveEffect>,
    heroic_death: bool,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let caster = combatants[caster_index].clone();
    let Some(stats) = caster.stats5e.clone() else {
        return Vec::new();
    };
    if let Some(casting) = combatants[caster_index]
        .stats5e
        .as_mut()
        .and_then(|s| s.spellcasting.as_mut())
        && spell.level > 0
    {
        casting.slots_used[usize::from(request.slot_level - 1)] += 1;
    }
    let mut events = vec![CombatEvent::SpellCast {
        caster_id: caster.id.clone(),
        caster_name: caster.name.clone(),
        spell_id: spell.id.clone(),
        spell_name: spell.name.clone(),
        slot_level: request.slot_level,
    }];
    if spell.concentration {
        // A new concentration spell ends the old one.
        if let Some(previous) = stats.concentration.clone() {
            events.push(CombatEvent::ConcentrationLost {
                caster_id: caster.id.clone(),
                caster_name: caster.name.clone(),
                spell_id: previous,
            });
        }
        if let Some(s) = combatants[caster_index].stats5e.as_mut() {
            s.concentration = Some(spell.id.clone());
        }
    }
    let dc = spell_save_dc(&stats);
    let index_of = |combatants: &[Combatant], id: &str| combatants.iter().position(|c| c.id == id);
    let target_index = match &request.target {
        CastTarget::Creature(id) => index_of(combatants, id),
        CastTarget::Point(_) => None,
    };
    let damage_context = DamageContext {
        critical: false,
        heroic_death,
    };

    match &spell.effect {
        SpellEffect::Attack {
            attack_kind,
            damage,
            damage_type,
            rays,
            rider,
        } => {
            let Some(target_index) = target_index else {
                return events;
            };
            let rays = rays
                + u32::from(request.slot_level.saturating_sub(spell.level.max(1)))
                    * u32::from(*rays > 1);
            let dice = scaled(damage, spell, request.slot_level, stats.level);
            let attack = Attack {
                id: spell.id.clone(),
                name: spell.name.clone(),
                kind: if *attack_kind == AttackKind::Melee {
                    AttackKind::Melee
                } else {
                    AttackKind::Spell
                },
                to_hit: spell_attack_bonus(&stats),
                damage: format!("{}d{}", dice.count, dice.sides),
                damage_type: damage_type.clone(),
                range_ft: spell.range_ft,
                long_range_ft: 0,
            };
            for _ in 0..rays.max(1) {
                if !is_up(&combatants[target_index]) {
                    break;
                }
                let distance = match (caster.position, combatants[target_index].position) {
                    (Some(a), Some(b)) => Some(a.feet_to(b)),
                    _ => None,
                };
                let situation = AttackSituation {
                    disadvantage: map.zip(caster.position).is_some_and(|(map, from)| {
                        attack_setup(
                            map,
                            &caster,
                            &attack,
                            from,
                            &combatants[target_index],
                            combatants,
                        ) == Some(true)
                    }),
                    distance_ft: distance,
                    heroic_death,
                };
                let attack_events = resolve_attack_with(
                    &caster,
                    &attack,
                    &mut combatants[target_index],
                    &situation,
                    rng,
                );
                let hit = attack_events
                    .iter()
                    .any(|e| matches!(e, CombatEvent::Attack { hit: true, .. }));
                events.extend(attack_events);
                if let (true, Some(rider)) = (hit, rider) {
                    add_condition(&mut combatants[target_index], rider, 0);
                    events.push(condition_start(&combatants[target_index], rider));
                }
            }
        }
        SpellEffect::Save {
            save,
            damage,
            damage_type,
            half,
            area,
        } => {
            let victims: Vec<usize> = match (area, &request.target, caster.position) {
                (Some(area), CastTarget::Point(point), Some(from)) => {
                    let squares = area_squares(*area, from, *point);
                    let origin = if area.shape == AreaShape::Sphere {
                        *point
                    } else {
                        from
                    };
                    (0..combatants.len())
                        .filter(|&i| {
                            i != caster_index
                                && is_up(&combatants[i])
                                && combatants[i].position.is_some_and(|p| {
                                    squares.contains(&p)
                                        && map.is_none_or(|m| {
                                            p == origin || m.line_of_sight(origin, p)
                                        })
                                })
                        })
                        .collect()
                }
                _ => target_index.into_iter().collect(),
            };
            let dice = scaled(damage, spell, request.slot_level, stats.level);
            // One damage roll for everyone in the area, as in the rules.
            let rolled = roll_damage(rng, &dice, false);
            for victim in victims {
                let save_event = saving_throw(&combatants[victim], *save, dc, rng);
                let saved = matches!(save_event, CombatEvent::Save { success: true, .. });
                events.push(save_event);
                if saved && !half {
                    continue;
                }
                let mut roll = rolled.clone();
                if saved {
                    roll.total /= 2;
                }
                let scaling = damage_scaling(&combatants[victim], damage_type);
                events.extend(apply_damage(
                    &mut combatants[victim],
                    roll,
                    damage_type,
                    scaling,
                    &damage_context,
                    rng,
                ));
            }
        }
        SpellEffect::Missiles {
            darts,
            damage,
            damage_type,
        } => {
            let Some(target_index) = target_index else {
                return events;
            };
            let darts = darts + u32::from(request.slot_level.saturating_sub(spell.level));
            let dice = DiceFormula::parse(damage).unwrap_or(DiceFormula {
                count: 1,
                sides: 4,
                modifier: 1,
            });
            for _ in 0..darts {
                let roll = roll_damage(rng, &dice, false);
                let scaling = damage_scaling(&combatants[target_index], damage_type);
                events.extend(apply_damage(
                    &mut combatants[target_index],
                    roll,
                    damage_type,
                    scaling,
                    &damage_context,
                    rng,
                ));
            }
        }
        SpellEffect::Heal { heal: formula } => {
            let Some(target_index) = target_index else {
                return events;
            };
            let dice = scaled(formula, spell, request.slot_level, stats.level);
            let ability = stats
                .spellcasting
                .as_ref()
                .map_or(Ability::Wis, |c| c.ability);
            let amount = roll_damage(rng, &dice, false).total + stats.modifier(ability);
            events.extend(heal(&mut combatants[target_index], amount));
        }
        SpellEffect::Condition {
            save, condition, ..
        } => {
            let Some(target_index) = target_index else {
                return events;
            };
            let save_event = saving_throw(&combatants[target_index], *save, dc, rng);
            let saved = matches!(save_event, CombatEvent::Save { success: true, .. });
            events.push(save_event);
            if !saved {
                add_condition(&mut combatants[target_index], condition, ONE_MINUTE);
                events.push(condition_start(&combatants[target_index], condition));
                effects.push(ActiveEffect {
                    spell_id: spell.id.clone(),
                    caster_id: caster.id.clone(),
                    target_id: combatants[target_index].id.clone(),
                    condition: condition.clone(),
                    concentration: spell.concentration,
                    repeat_save: Some((*save, dc)),
                });
            }
        }
        SpellEffect::Sleep { pool, area } => {
            let (CastTarget::Point(point), Some(from)) = (&request.target, caster.position) else {
                return events;
            };
            let _ = from;
            let squares = area_squares(*area, *point, *point);
            let dice = scaled(pool, spell, request.slot_level, stats.level);
            let mut pool = roll_damage(rng, &dice, false).total;
            let mut sleepers: Vec<usize> = (0..combatants.len())
                .filter(|&i| {
                    let c = &combatants[i];
                    is_up(c)
                        && !has_condition(c, ASLEEP)
                        && c.stats5e
                            .as_ref()
                            .is_some_and(|s| s.creature_type != "undead")
                        && c.position.is_some_and(|p| squares.contains(&p))
                })
                .collect();
            sleepers.sort_by_key(|&i| combatants[i].hp);
            for i in sleepers {
                if combatants[i].hp > pool {
                    break;
                }
                pool -= combatants[i].hp;
                add_condition(&mut combatants[i], ASLEEP, ONE_MINUTE);
                events.push(condition_start(&combatants[i], ASLEEP));
            }
        }
        SpellEffect::Buff { buff, targets } => {
            let Some(primary) = target_index else {
                return events;
            };
            // The chosen ally first, then the nearest others in range.
            let mut chosen = vec![primary];
            let origin = caster.position;
            let mut others: Vec<usize> = (0..combatants.len())
                .filter(|&i| {
                    i != primary
                        && is_up(&combatants[i])
                        && is_enemy(&combatants[i]) == is_enemy(&caster)
                })
                .filter(|&i| match (origin, combatants[i].position) {
                    (Some(a), Some(b)) => a.feet_to(b) <= spell.range_ft,
                    _ => true,
                })
                .collect();
            others.sort_by_key(|&i| {
                (
                    u32::from(i != caster_index),
                    origin
                        .zip(combatants[i].position)
                        .map_or(0, |(a, b)| a.feet_to(b)),
                )
            });
            chosen.extend(others.into_iter().take(targets.saturating_sub(1) as usize));
            let rounds = if spell.concentration {
                ONE_MINUTE
            } else {
                UNTIL_REST
            };
            for i in chosen {
                if buff == AID && !has_condition(&combatants[i], AID) {
                    combatants[i].max_hp += 5;
                    combatants[i].hp += 5;
                }
                add_condition(&mut combatants[i], buff, rounds);
                events.push(condition_start(&combatants[i], buff));
                if spell.concentration {
                    effects.push(ActiveEffect {
                        spell_id: spell.id.clone(),
                        caster_id: caster.id.clone(),
                        target_id: combatants[i].id.clone(),
                        condition: buff.clone(),
                        concentration: true,
                        repeat_save: None,
                    });
                }
            }
        }
        SpellEffect::Stabilize => {
            if let Some(i) = target_index {
                if let Some(s) = combatants[i].stats5e.as_mut() {
                    s.death_saves.stable = true;
                }
                events.push(CombatEvent::DeathSave {
                    actor_id: combatants[i].id.clone(),
                    actor_name: combatants[i].name.clone(),
                    roll: 0,
                    successes: 0,
                    failures: combatants[i]
                        .stats5e
                        .as_ref()
                        .map_or(0, |s| s.death_saves.failures),
                    outcome: DeathSaveOutcome::Stable,
                });
            }
        }
        SpellEffect::Teleport => {
            if let CastTarget::Point(point) = &request.target {
                combatants[caster_index].position = Some(*point);
                events.push(CombatEvent::Teleport {
                    actor_id: caster.id.clone(),
                    actor_name: caster.name.clone(),
                    to: *point,
                });
            }
        }
        SpellEffect::Cure => {
            if let Some(i) = target_index {
                for condition in [PARALYZED, POISONED, BLINDED] {
                    if remove_condition(&mut combatants[i], condition) {
                        events.push(CombatEvent::ConditionEnd {
                            target_id: combatants[i].id.clone(),
                            target_name: combatants[i].name.clone(),
                            condition: condition.to_string(),
                        });
                        effects.retain(|e| {
                            !(e.target_id == combatants[i].id && e.condition == condition)
                        });
                        break;
                    }
                }
            }
        }
    }
    events
}

/// Ends effects whose concentration is gone (caster lost it, went down or cast another
/// concentration spell) and removes their conditions.
pub fn sync_concentration(
    combatants: &mut [Combatant],
    effects: &mut Vec<ActiveEffect>,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    effects.retain(|effect| {
        if !effect.concentration {
            return true;
        }
        let holds = combatants.iter().any(|c| {
            c.id == effect.caster_id
                && is_up(c)
                && c.stats5e.as_ref().and_then(|s| s.concentration.as_deref())
                    == Some(effect.spell_id.as_str())
        });
        if !holds
            && let Some(target) = combatants.iter_mut().find(|c| c.id == effect.target_id)
            && remove_condition(target, &effect.condition)
        {
            events.push(CombatEvent::ConditionEnd {
                target_id: target.id.clone(),
                target_name: target.name.clone(),
                condition: effect.condition.clone(),
            });
        }
        holds
    });
    // A caster without any effect left on anyone keeps no concentration either.
    for caster in combatants.iter_mut() {
        if let Some(stats) = caster.stats5e.as_mut()
            && !caster.hp.is_positive()
        {
            stats.concentration = None;
        }
    }
    events
}

/// End of a creature's turn: it repeats saves against effects that allow it (Hold Person).
pub fn repeat_saves<R: Rng + ?Sized>(
    combatants: &mut [Combatant],
    index: usize,
    effects: &mut Vec<ActiveEffect>,
    rng: &mut R,
) -> Vec<CombatEvent> {
    let mut events = Vec::new();
    let id = combatants[index].id.clone();
    let mut ended = Vec::new();
    for (i, effect) in effects.iter().enumerate() {
        if effect.target_id != id {
            continue;
        }
        if let Some((ability, dc)) = effect.repeat_save {
            let save = saving_throw(&combatants[index], ability, dc, rng);
            let success = matches!(save, CombatEvent::Save { success: true, .. });
            events.push(save);
            if success {
                ended.push(i);
            }
        }
    }
    for i in ended.into_iter().rev() {
        let effect = effects.remove(i);
        if remove_condition(&mut combatants[index], &effect.condition) {
            events.push(CombatEvent::ConditionEnd {
                target_id: id.clone(),
                target_name: combatants[index].name.clone(),
                condition: effect.condition,
            });
        }
    }
    events
}

/// A spell the current combatant can cast now (for the UI): slot levels with slots left,
/// creatures it can target, or a point on the board.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SpellOption {
    pub spell_id: String,
    pub name: LocalizedName,
    pub level: u8,
    pub casting: CastingTime,
    pub range_ft: u32,
    pub slot_levels: Vec<u8>,
    pub targets: Vec<String>,
    pub needs_point: bool,
    #[serde(default)]
    #[ts(optional)]
    pub area: Option<Area>,
}

fn slot_levels(stats: &Stats5e, spell: &SpellData) -> Vec<u8> {
    let Some(casting) = &stats.spellcasting else {
        return Vec::new();
    };
    if spell.level == 0 {
        return vec![0];
    }
    (spell.level..=9)
        .filter(|&level| casting.slots_left(level) > 0)
        .collect()
}

/// Every spell the caster could cast right now, with its valid targets.
pub fn spell_options(
    map: Option<&BattleMap>,
    caster: &Combatant,
    combatants: &[Combatant],
    budget: CastBudget,
) -> Vec<SpellOption> {
    let Some(stats) = &caster.stats5e else {
        return Vec::new();
    };
    let Some(casting) = &stats.spellcasting else {
        return Vec::new();
    };
    let mut options = Vec::new();
    for spell in casting.spells.iter().filter_map(|id| spell(id)) {
        let levels = slot_levels(stats, spell);
        let Some(&lowest) = levels.first() else {
            continue;
        };
        let needs_point = spell.targets_point();
        if needs_point && map.is_none() {
            continue;
        }
        let targets: Vec<String> = if needs_point {
            Vec::new()
        } else {
            combatants
                .iter()
                .filter(|target| {
                    let request = CastRequest {
                        spell_id: spell.id.clone(),
                        slot_level: lowest,
                        target: CastTarget::Creature(target.id.clone()),
                    };
                    check_cast(map, caster, combatants, &request, budget).is_ok()
                })
                .map(|t| t.id.clone())
                .collect()
        };
        let time_ok = match spell.casting {
            CastingTime::Action => budget.action,
            CastingTime::Bonus => budget.bonus_action,
        };
        if !time_ok || (!needs_point && targets.is_empty()) {
            continue;
        }
        let area = match &spell.effect {
            SpellEffect::Save { area, .. } => *area,
            SpellEffect::Sleep { area, .. } => Some(*area),
            _ => None,
        };
        options.push(SpellOption {
            spell_id: spell.id.clone(),
            name: spell.name.clone(),
            level: spell.level,
            casting: spell.casting,
            range_ft: spell.range_ft,
            slot_levels: levels,
            targets,
            needs_point,
            area,
        });
    }
    options
}

fn average(formula: &str) -> i32 {
    DiceFormula::parse(formula).map_or(0, |f| f.average())
}

/// Sensible casts for a companion, best first, with a score: saving the dying first,
/// healing the badly hurt, area spells only when they catch at least two enemies and no ally,
/// otherwise damage and control; spending a slot costs a little so cantrips are preferred
/// for small jobs.
pub fn spell_plans(
    map: Option<&BattleMap>,
    caster: &Combatant,
    combatants: &[Combatant],
    budget: CastBudget,
) -> Vec<(CastRequest, i32)> {
    let mut plans = Vec::new();
    let side = is_enemy(caster);
    for option in spell_options(map, caster, combatants, budget) {
        let Some(spell) = spell(&option.spell_id) else {
            continue;
        };
        let slot = option.slot_levels[0];
        let cost = i32::from(slot) * 3;
        let creature = |id: &str| combatants.iter().find(|c| c.id == id);
        match &spell.effect {
            SpellEffect::Heal { heal } => {
                for id in &option.targets {
                    let Some(t) = creature(id) else { continue };
                    let score = if is_dying(t) {
                        100
                    } else if t.hp * 2 < t.max_hp {
                        40 + average(heal)
                    } else {
                        continue;
                    };
                    plans.push((
                        CastRequest {
                            spell_id: spell.id.clone(),
                            slot_level: slot,
                            target: CastTarget::Creature(id.clone()),
                        },
                        score - cost,
                    ));
                }
            }
            SpellEffect::Stabilize => {
                for id in &option.targets {
                    plans.push((
                        CastRequest {
                            spell_id: spell.id.clone(),
                            slot_level: slot,
                            target: CastTarget::Creature(id.clone()),
                        },
                        45,
                    ));
                }
            }
            SpellEffect::Attack { damage, rays, .. } => {
                for id in &option.targets {
                    let score = average(damage) * (*rays as i32) * 2;
                    plans.push((
                        CastRequest {
                            spell_id: spell.id.clone(),
                            slot_level: slot,
                            target: CastTarget::Creature(id.clone()),
                        },
                        score - cost,
                    ));
                }
            }
            SpellEffect::Missiles { darts, damage, .. } => {
                for id in &option.targets {
                    let score = average(damage) * (*darts as i32) * 2;
                    plans.push((
                        CastRequest {
                            spell_id: spell.id.clone(),
                            slot_level: slot,
                            target: CastTarget::Creature(id.clone()),
                        },
                        score - cost,
                    ));
                }
            }
            SpellEffect::Save {
                damage, area: None, ..
            } => {
                for id in &option.targets {
                    plans.push((
                        CastRequest {
                            spell_id: spell.id.clone(),
                            slot_level: slot,
                            target: CastTarget::Creature(id.clone()),
                        },
                        average(damage) - cost,
                    ));
                }
            }
            SpellEffect::Save {
                damage,
                area: Some(area),
                ..
            }
            | SpellEffect::Sleep { pool: damage, area } => {
                let (Some(map), Some(from)) = (map, caster.position) else {
                    continue;
                };
                // Aim at each enemy and count who would be caught.
                for aim in combatants
                    .iter()
                    .filter(|c| is_up(c) && is_enemy(c) != side)
                    .filter_map(|c| c.position)
                {
                    let squares = area_squares(*area, from, aim);
                    let caught = |want_enemies: bool| {
                        combatants
                            .iter()
                            .filter(|c| {
                                c.id != caster.id
                                    && is_up(c)
                                    && (is_enemy(c) != side) == want_enemies
                            })
                            .filter(|c| c.position.is_some_and(|p| squares.contains(&p)))
                            .count() as i32
                    };
                    let (enemies, allies) = (caught(true), caught(false));
                    let request = CastRequest {
                        spell_id: spell.id.clone(),
                        slot_level: slot,
                        target: CastTarget::Point(aim),
                    };
                    if enemies >= 2
                        && allies == 0
                        && check_cast(Some(map), caster, combatants, &request, budget).is_ok()
                    {
                        plans.push((request, enemies * average(damage) - cost));
                    }
                }
            }
            SpellEffect::Condition { .. } => {
                for id in &option.targets {
                    if creature(id).is_some_and(|t| t.hp * 2 > t.max_hp) {
                        plans.push((
                            CastRequest {
                                spell_id: spell.id.clone(),
                                slot_level: slot,
                                target: CastTarget::Creature(id.clone()),
                            },
                            30 - cost,
                        ));
                    }
                }
            }
            SpellEffect::Buff { buff, .. } if buff == BLESSED => {
                let blessed = combatants.iter().any(|c| has_condition(c, BLESSED));
                let allies = combatants
                    .iter()
                    .filter(|c| is_up(c) && is_enemy(c) == side)
                    .count();
                if !blessed
                    && allies >= 2
                    && caster
                        .stats5e
                        .as_ref()
                        .is_some_and(|s| s.concentration.is_none())
                {
                    plans.push((
                        CastRequest {
                            spell_id: spell.id.clone(),
                            slot_level: slot,
                            target: CastTarget::Creature(caster.id.clone()),
                        },
                        25 - cost,
                    ));
                }
            }
            SpellEffect::Cure => {
                for id in &option.targets {
                    if creature(id).is_some_and(|t| {
                        [PARALYZED, POISONED, BLINDED]
                            .iter()
                            .any(|c| has_condition(t, c))
                    }) {
                        plans.push((
                            CastRequest {
                                spell_id: spell.id.clone(),
                                slot_level: slot,
                                target: CastTarget::Creature(id.clone()),
                            },
                            40 - cost,
                        ));
                    }
                }
            }
            _ => {}
        }
    }
    plans.sort_by_key(|(request, score)| (std::cmp::Reverse(*score), request.id()));
    plans
}
