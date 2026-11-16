use super::*;
use crate::{Combatant, EncounterState};
use rand::{SeedableRng, rngs::StdRng};

fn combatant(id: &str, role: &str, stats: (Stats5e, i32)) -> Combatant {
    Combatant {
        id: id.to_string(),
        name: id.to_string(),
        role: role.to_string(),
        hp: stats.1,
        max_hp: stats.1,
        stress: 0,
        max_stress: 0,
        initiative: 0,
        conditions: Vec::new(),
        skills: Default::default(),
        stats5e: Some(stats.0),
        position: None,
    }
}

fn goblin(id: &str) -> Combatant {
    combatant(id, "enemy", monster_stats(monster("goblin").unwrap()))
}

fn hero(id: &str, class_id: &str, role: &str) -> Combatant {
    combatant(id, role, hero_stats(class(class_id).unwrap()))
}

#[test]
fn modifiers_and_proficiency() {
    assert_eq!(
        [1, 8, 9, 10, 11, 15, 20, 30].map(ability_modifier),
        [-5, -1, -1, 0, 0, 2, 5, 10]
    );
    assert_eq!(
        [1, 4, 5, 9, 13, 17, 20].map(proficiency_bonus),
        [2, 2, 3, 4, 5, 6, 6]
    );
}

#[test]
fn srd_data_loads_and_matches_the_stat_blocks() {
    assert_eq!(monsters().len(), 16);
    assert_eq!(classes().len(), 4);
    let (goblin, hp) = monster_stats(monster("Goblin").unwrap());
    assert_eq!(
        (goblin.armor_class, hp, goblin.attacks[0].to_hit),
        (15, 7, 4)
    );
    let (zombie, hp) = monster_stats(monster("zombie").unwrap());
    assert_eq!((zombie.armor_class, hp, zombie.never_flees), (8, 22, true));
    assert!(monster("giant rat").is_some());
    for monster in monsters() {
        assert!(
            !monster.name.de.is_empty() && !monster.name.ru.is_empty(),
            "{}",
            monster.id
        );
        for attack in &monster.attacks {
            assert!(
                DiceFormula::parse(&attack.damage).is_some(),
                "{} {}",
                monster.id,
                attack.id
            );
        }
    }
}

#[test]
fn heroes_get_their_numbers_from_the_class_template() {
    // Fighter: STR 15 (+2), proficiency +2 → longsword +4, 1d8+2; HP 10 + CON 14 (+2).
    let (fighter, hp) = hero_stats(class("fighter").unwrap());
    let longsword = fighter.attack("longsword").unwrap();
    assert_eq!(
        (longsword.to_hit, longsword.damage.as_str(), hp),
        (4, "1d8+2", 12)
    );
    assert_eq!(fighter.saving_throw_bonus(Ability::Con), 4);
    assert_eq!(fighter.passive_perception(), 13);
    // Rogue shortsword is finesse (DEX 15 → +2); wizard Fire Bolt adds no modifier to damage.
    let (rogue, _) = hero_stats(class("rogue").unwrap());
    assert_eq!(rogue.attack("shortsword").unwrap().to_hit, 4);
    let (wizard, _) = hero_stats(class("wizard").unwrap());
    let fire_bolt = wizard.attack("fire_bolt").unwrap();
    assert_eq!((fire_bolt.to_hit, fire_bolt.damage.as_str()), (4, "1d10"));
    assert_eq!(wizard.attack("quarterstaff").unwrap().damage, "1d6-1");
}

#[test]
fn dice_formulas_and_advantage() {
    assert_eq!(
        DiceFormula::parse("2d6+3"),
        Some(DiceFormula {
            count: 2,
            sides: 6,
            modifier: 3
        })
    );
    assert_eq!(DiceFormula::parse("1d6-1").unwrap().modifier, -1);
    assert_eq!(DiceFormula::parse("3d8+9").unwrap().average(), 22);
    assert!(DiceFormula::parse("d").is_none() && DiceFormula::parse("0d6").is_none());
    let mut rng = StdRng::seed_from_u64(7);
    for _ in 0..200 {
        let advantage = roll_d20(&mut rng, RollMode::Advantage);
        assert_eq!(advantage.natural, *advantage.rolls.iter().max().unwrap());
        let disadvantage = roll_d20(&mut rng, RollMode::Disadvantage);
        assert_eq!(
            disadvantage.natural,
            *disadvantage.rolls.iter().min().unwrap()
        );
    }
    assert_eq!(RollMode::combine(true, true), RollMode::Normal);
    // Critical hits double the dice, not the modifier.
    let critical = roll_damage(&mut rng, &DiceFormula::parse("1d6+2").unwrap(), true);
    assert_eq!(critical.rolls.len(), 2);
    assert_eq!(
        critical.total,
        critical.rolls.iter().sum::<u32>() as i32 + 2
    );
}

#[test]
fn attacks_hit_by_ac_and_natural_rolls() {
    let fighter = hero("thorin", "fighter", "player");
    let longsword = fighter
        .stats5e
        .as_ref()
        .unwrap()
        .attack("longsword")
        .unwrap()
        .clone();
    let mut hits = 0;
    let mut seen_crit = false;
    let mut seen_fumble = false;
    for seed in 0..400 {
        let mut target = goblin("g");
        let events = resolve_attack(
            &fighter,
            &longsword,
            &mut target,
            &mut StdRng::seed_from_u64(seed),
        );
        let CombatEvent::Attack {
            roll,
            total,
            hit,
            critical,
            target_ac,
            ..
        } = &events[0]
        else {
            panic!("first event is the attack");
        };
        assert_eq!(*target_ac, 15);
        assert_eq!(
            *hit,
            roll.natural == 20 || (roll.natural != 1 && *total >= 15)
        );
        assert_eq!(*critical, roll.natural == 20);
        seen_crit |= *critical;
        seen_fumble |= roll.natural == 1;
        if *hit {
            hits += 1;
            assert!(matches!(events[1], CombatEvent::Damage { .. }));
            assert!(target.hp < 7);
        } else {
            assert_eq!(events.len(), 1);
            assert_eq!(target.hp, 7);
        }
    }
    // +4 against AC 15 hits on 11+: about half the time.
    assert!((150..250).contains(&hits), "{hits}");
    assert!(seen_crit && seen_fumble);
}

#[test]
fn damage_scaling_and_going_down() {
    let mut skeleton = combatant("s", "enemy", monster_stats(monster("skeleton").unwrap()));
    let roll = DamageRoll {
        rolls: vec![4],
        modifier: 0,
        total: 4,
    };
    let ctx = DamageContext::default();
    let mut rng = StdRng::seed_from_u64(1);
    let events = apply_damage(
        &mut skeleton,
        roll.clone(),
        "bludgeoning",
        DamageScaling::Vulnerable,
        &ctx,
        &mut rng,
    );
    assert!(matches!(events[0], CombatEvent::Damage { amount: 8, .. }));
    assert_eq!(skeleton.hp, 5);
    let events = apply_damage(
        &mut skeleton,
        roll,
        "slashing",
        DamageScaling::Normal,
        &ctx,
        &mut rng,
    );
    assert_eq!(skeleton.hp, 1);
    assert_eq!(events.len(), 1);
    let big = DamageRoll {
        rolls: vec![9],
        modifier: 0,
        total: 9,
    };
    let events = apply_damage(
        &mut skeleton,
        big,
        "slashing",
        DamageScaling::Normal,
        &ctx,
        &mut rng,
    );
    assert_eq!(skeleton.hp, 0);
    assert!(matches!(events[1], CombatEvent::Down { .. }));
    assert_eq!(health_tier(0, 13), HealthTier::Down);
    assert_eq!(health_tier(13, 13), HealthTier::Unhurt);
    assert_eq!(health_tier(7, 13), HealthTier::Wounded);
    assert_eq!(health_tier(6, 13), HealthTier::BadlyWounded);
}

#[test]
fn dodging_gives_attackers_disadvantage_until_the_next_turn() {
    let mut thorin = hero("thorin", "fighter", "player");
    let goblin = goblin("g");
    take_dodge(&mut thorin);
    assert_eq!(attack_mode(&goblin, &thorin), RollMode::Disadvantage);
    start_turn(&mut thorin, 2);
    assert_eq!(attack_mode(&goblin, &thorin), RollMode::Normal);
}

#[test]
fn initiative_order_and_turn_advance() {
    let mut encounter = EncounterState {
        is_active: true,
        flanking: false,
        round: 1,
        current_turn_index: 0,
        combatants: vec![
            hero("thorin", "fighter", "player"),
            goblin("g1"),
            goblin("g2"),
        ],
        combat_log: Vec::new(),
        events: Vec::new(),
        turn: TurnBudget::default(),
        reactions_used: Vec::new(),
        effects: Vec::new(),
        difficulty: None,
    };
    let event = roll_initiative(&mut encounter.combatants, &mut StdRng::seed_from_u64(3));
    let CombatEvent::Initiative { order } = event else {
        panic!()
    };
    assert_eq!(order.len(), 3);
    assert!(order.windows(2).all(|pair| pair[0].total >= pair[1].total));
    // A downed enemy is skipped (a downed hero would still roll death saves); wrapping
    // starts a new round. Put a goblin in the middle of the order and knock it out.
    let goblin_index = encounter
        .combatants
        .iter()
        .position(|c| c.role == "enemy")
        .unwrap();
    encounter.combatants.swap(goblin_index, 1);
    encounter.current_turn_index = 0;
    encounter.combatants[1].hp = 0;
    assert!(advance_turn(&mut encounter));
    assert_eq!((encounter.current_turn_index, encounter.round), (2, 1));
    assert!(advance_turn(&mut encounter));
    assert_eq!((encounter.current_turn_index, encounter.round), (0, 2));
}

#[test]
fn monsters_and_fallback_choose_sensible_actions() {
    let thorin = hero("thorin", "fighter", "player"); // AC 18
    let finn = hero("finn", "rogue", "companion"); // AC 13
    let mut goblin_a = goblin("g1");
    let combatants = vec![thorin.clone(), finn.clone(), goblin_a.clone()];
    // The goblin goes for the rogue (lower AC) with its best attack.
    assert!(matches!(
        monster_decision(&goblin_a, &combatants),
        TurnDecision::Attack { ref target_id, .. } if target_id == "finn"
    ));
    goblin_a.hp = 1;
    assert_eq!(monster_decision(&goblin_a, &combatants), TurnDecision::Flee);
    // Undead never flee.
    let mut zombie = combatant("z", "enemy", monster_stats(monster("zombie").unwrap()));
    zombie.hp = 1;
    assert!(matches!(
        monster_decision(&zombie, &combatants),
        TurnDecision::Attack { .. }
    ));
    // Heroes finish off the most hurt enemy.
    let mut hurt = goblin("g2");
    hurt.hp = 2;
    let fight = vec![thorin.clone(), goblin("g1"), hurt];
    assert!(matches!(
        hero_fallback_decision(&thorin, &fight),
        TurnDecision::Attack { ref target_id, .. } if target_id == "g2"
    ));
}

#[test]
fn legal_actions_and_parsing() {
    let thorin = hero("thorin", "fighter", "player");
    let mut down = goblin("g2");
    down.hp = 0;
    let combatants = vec![thorin.clone(), goblin("g1"), down];
    let options = legal_actions(&thorin, &combatants);
    // Two attacks against the one goblin still up, plus Dodge.
    assert_eq!(options.len(), 3);
    assert_eq!(
        parse_action("attack:longsword:g1", &options),
        Some(TurnDecision::Attack {
            attack_id: "longsword".into(),
            target_id: "g1".into()
        })
    );
    assert_eq!(parse_action(" dodge ", &options), Some(TurnDecision::Dodge));
    assert_eq!(parse_action("attack:longsword:g2", &options), None);
    assert_eq!(parse_action("cast fireball", &options), None);
}

#[test]
fn outcome_of_a_fight() {
    let mut combatants = vec![hero("thorin", "fighter", "player"), goblin("g1")];
    assert_eq!(combat_outcome(&combatants), None);
    combatants[1].hp = 0;
    assert_eq!(combat_outcome(&combatants), Some(CombatOutcome::Victory));
    combatants[1].hp = 3;
    combatants[0].hp = 0;
    assert_eq!(combat_outcome(&combatants), Some(CombatOutcome::Defeat));
}

#[test]
fn a_seeded_fight_runs_to_the_end() {
    let mut rng = StdRng::seed_from_u64(42);
    let mut encounter = EncounterState {
        is_active: true,
        flanking: false,
        round: 1,
        current_turn_index: 0,
        combatants: vec![
            hero("thorin", "fighter", "player"),
            hero("althea", "cleric", "companion"),
            goblin("g1"),
            goblin("g2"),
        ],
        combat_log: Vec::new(),
        events: Vec::new(),
        turn: TurnBudget::default(),
        reactions_used: Vec::new(),
        effects: Vec::new(),
        difficulty: None,
    };
    roll_initiative(&mut encounter.combatants, &mut rng);
    let mut turns = 0;
    while combat_outcome(&encounter.combatants).is_none() && turns < 200 {
        let index = encounter.current_turn_index;
        let actor = encounter.combatants[index].clone();
        let decision = if is_enemy(&actor) {
            monster_decision(&actor, &encounter.combatants)
        } else {
            hero_fallback_decision(&actor, &encounter.combatants)
        };
        match decision {
            TurnDecision::Attack {
                attack_id,
                target_id,
            } => {
                let attack = actor
                    .stats5e
                    .as_ref()
                    .unwrap()
                    .attack(&attack_id)
                    .unwrap()
                    .clone();
                let target = encounter
                    .combatants
                    .iter_mut()
                    .find(|c| c.id == target_id)
                    .unwrap();
                resolve_attack(&actor, &attack, target, &mut rng);
            }
            TurnDecision::Flee => encounter.combatants[index].hp = 0,
            TurnDecision::Dodge
            | TurnDecision::Pass
            | TurnDecision::Cast(_)
            | TurnDecision::Feature(_)
            | TurnDecision::Maneuver(_) => {}
        }
        advance_turn(&mut encounter);
        turns += 1;
    }
    assert!(
        combat_outcome(&encounter.combatants).is_some(),
        "fight ended within {turns} turns"
    );
}

// --- Battle map ---

fn small_map(rows: &[&str]) -> BattleMap {
    let cell = |ground: &str, kind: CellKind, object: Option<&str>, zone: Option<&str>| MapCell {
        ground: ground.into(),
        kind,
        object: object.map(Into::into),
        zone: zone.map(Into::into),
    };
    MapFile {
        id: "test".into(),
        name: LocalizedName::default(),
        tileset: "dungeon".into(),
        rows: rows.iter().map(|r| r.to_string()).collect(),
        legend: [
            ("#", cell("wall_stone", CellKind::Wall, None, None)),
            (".", cell("floor_stone", CellKind::Floor, None, None)),
            (
                "p",
                cell("floor_stone", CellKind::Floor, None, Some("party")),
            ),
            (
                "s",
                cell("floor_stone", CellKind::Floor, None, Some("spawn")),
            ),
            ("~", cell("water_shallow", CellKind::Difficult, None, None)),
            (
                "D",
                cell("floor_stone", CellKind::Floor, Some("door_closed"), None),
            ),
            (
                "O",
                cell("floor_stone", CellKind::Floor, Some("pillar"), None),
            ),
            (
                "C",
                cell("floor_stone", CellKind::Floor, Some("crates"), None),
            ),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect(),
        ..MapFile::default()
    }
    .build()
    .unwrap()
}

#[test]
fn cover_follows_the_grid_rule() {
    let p = GridPos::new;
    // Open floor: none. A pillar between: half (+2). A crate between: at most half.
    let open = small_map(&["#######", "#p....#", "#######"]);
    assert_eq!(open.cover(p(1, 1), p(5, 1), &[]), Cover::None);
    let pillar = small_map(&["#######", "#p.O..#", "#######"]);
    assert_eq!(pillar.cover(p(1, 1), p(5, 1), &[]), Cover::Half);
    assert_eq!(Cover::Half.ac_bonus(), 2);
    let crate_ = small_map(&["#######", "#p.C..#", "#######"]);
    assert_eq!(crate_.cover(p(1, 1), p(5, 1), &[]), Cover::Half);
    // Another creature in the way: half; the attacker and the target themselves never count.
    assert_eq!(open.cover(p(1, 1), p(5, 1), &[p(3, 1)]), Cover::Half);
    assert_eq!(
        open.cover(p(1, 1), p(5, 1), &[p(1, 1), p(5, 1)]),
        Cover::None
    );
    // A line running along a wall face is not blocked by it.
    let corridor = small_map(&["#######", "#p....#", "#.....#"]);
    assert_eq!(corridor.cover(p(1, 1), p(5, 1), &[]), Cover::None);
    // Close behind the corner of a wall, attacked at an angle: three-quarters (+5).
    let corner = small_map(&[
        "#######", "#p..#.#", "#...#.#", "#.....#", "#.....#", "#.....#", "#######",
    ]);
    assert_eq!(corner.cover(p(2, 5), p(5, 1), &[]), Cover::ThreeQuarters);
    assert_eq!(Cover::ThreeQuarters.ac_bonus(), 5);
    // A wall straight in between still ends the attack (sight line), as before.
    let wall = small_map(&["#######", "#p.#..#", "#######"]);
    let goblin = goblin("g");
    let bow = goblin
        .stats5e
        .as_ref()
        .unwrap()
        .attack("shortbow")
        .unwrap()
        .clone();
    assert!(attack_reach(&wall, &bow, p(1, 1), p(5, 1)).is_none());
}

#[test]
fn flanking_needs_the_rule_an_ally_opposite_and_a_melee_attack() {
    let map = open_map();
    let fighter = at(hero("thorin", "fighter", "player"), 4, 2);
    let target = at(goblin("g"), 5, 2);
    let ally = at(hero("finn", "rogue", "companion"), 6, 2);
    let sword = fighter
        .stats5e
        .as_ref()
        .unwrap()
        .attacks
        .iter()
        .find(|a| a.kind == AttackKind::Melee)
        .unwrap()
        .clone();
    let setup = |ally: &Combatant, rule: bool, from: GridPos| {
        let mut attacker = fighter.clone();
        attacker.position = Some(from);
        let all = vec![attacker.clone(), target.clone(), ally.clone()];
        attack_setup(&map, &attacker, &sword, from, &target, &all, rule).unwrap()
    };
    assert!(setup(&ally, true, GridPos::new(4, 2)).flanked, "orthogonal");
    assert!(!setup(&ally, false, GridPos::new(4, 2)).flanked, "rule off");
    // Diagonal: attacker at the top left corner, ally at the bottom right one.
    let diagonal = at(hero("finn", "rogue", "companion"), 6, 3);
    assert!(
        setup(&diagonal, true, GridPos::new(4, 1)).flanked,
        "diagonal"
    );
    // Not opposite, or an ally who cannot act: no flanking.
    let beside = at(hero("finn", "rogue", "companion"), 5, 3);
    assert!(!setup(&beside, true, GridPos::new(4, 2)).flanked);
    let mut stunned = ally.clone();
    add_condition(&mut stunned, STUNNED, 1);
    assert!(!setup(&stunned, true, GridPos::new(4, 2)).flanked);
    // A creature in the way between shooter and target gives half cover.
    let archer = at(goblin("a"), 9, 2);
    let bow = archer
        .stats5e
        .as_ref()
        .unwrap()
        .attack("shortbow")
        .unwrap()
        .clone();
    let hero_target = at(hero("lyra", "wizard", "companion"), 3, 2);
    let blocker = at(goblin("b"), 6, 2);
    let all = vec![archer.clone(), hero_target.clone(), blocker];
    let shot = attack_setup(
        &map,
        &archer,
        &bow,
        GridPos::new(9, 2),
        &hero_target,
        &all,
        true,
    )
    .unwrap();
    assert_eq!(shot.cover, Cover::Half);
    assert!(!shot.flanked, "flanking is for melee");
}

#[test]
fn cover_raises_the_armor_class_and_flanking_gives_advantage() {
    let attacker = hero("thorin", "fighter", "player");
    let attack = attacker.stats5e.as_ref().unwrap().attacks[0].clone();
    let base = armor_class(&goblin("g"));
    let attack_with = |situation: AttackSituation| {
        let mut target = goblin("g");
        let mut rng = StdRng::seed_from_u64(9);
        let events = resolve_attack_with(&attacker, &attack, &mut target, &situation, &mut rng);
        events
            .into_iter()
            .find_map(|e| match e {
                CombatEvent::Attack {
                    target_ac,
                    cover,
                    flanked,
                    roll,
                    ..
                } => Some((target_ac, cover, flanked, roll.mode)),
                _ => None,
            })
            .unwrap()
    };
    assert_eq!(
        attack_with(AttackSituation::default()),
        (base, None, false, RollMode::Normal)
    );
    let covered = attack_with(AttackSituation {
        cover: Cover::ThreeQuarters,
        ..Default::default()
    });
    assert_eq!(
        (covered.0, covered.1),
        (base + 5, Some(Cover::ThreeQuarters))
    );
    let flanked = attack_with(AttackSituation {
        flanked: true,
        ..Default::default()
    });
    assert_eq!((flanked.2, flanked.3), (true, RollMode::Advantage));
    // Flanking and disadvantage cancel out, as advantage and disadvantage always do.
    let both = attack_with(AttackSituation {
        flanked: true,
        disadvantage: true,
        ..Default::default()
    });
    assert_eq!(both.3, RollMode::Normal);
    // Without cover and flanking the event's JSON is what it was before.
    let json = serde_json::to_value(CombatEvent::Attack {
        attacker_id: "a".into(),
        attacker_name: "A".into(),
        target_id: "t".into(),
        target_name: "T".into(),
        attack_id: "x".into(),
        attack_name: LocalizedName::default(),
        roll: D20Roll {
            mode: RollMode::Normal,
            rolls: vec![10],
            natural: 10,
        },
        to_hit: 0,
        total: 10,
        target_ac: 10,
        hit: true,
        critical: false,
        bonus_die: None,
        cover: None,
        flanked: false,
    })
    .unwrap();
    assert!(json.get("cover").is_none() && json.get("flanked").is_none());
}

#[test]
fn bundled_maps_build_and_have_spawn_zones() {
    assert_eq!(battle_maps().len(), 3);
    for map in battle_maps() {
        assert!(
            !map.zone_cells("party").is_empty() && !map.zone_cells("spawn").is_empty(),
            "{}",
            map.id
        );
        assert_eq!(map.cells.len() as i32, map.width * map.height);
        assert!(!map.name.de.is_empty() && !map.name.ru.is_empty());
        // Exploration data points at things that exist; rooms do not overlap.
        assert!(!map.rooms.is_empty(), "{}", map.id);
        for room in &map.rooms {
            assert!(
                !room.name.de.is_empty()
                    && !room.name.ru.is_empty()
                    && !room.description.is_empty()
            );
            for other in map.rooms.iter().filter(|o| o.id != room.id) {
                let [x0, y0, x1, y1] = other.area;
                assert!(
                    ![(x0, y0), (x1, y1)]
                        .iter()
                        .any(|&(x, y)| room.contains(GridPos::new(x, y)))
                );
            }
        }
        for encounter in &map.encounters {
            assert!(
                encounter
                    .monsters
                    .iter()
                    .all(|m| monster(&m.monster).is_some()),
                "{}",
                encounter.id
            );
        }
        for exit in &map.exits {
            assert!(battle_map(&exit.to).is_some(), "{}", exit.to);
        }
        for trap in &map.traps {
            assert!(map.walkable(trap.at) && DiceFormula::parse(&trap.damage).is_some());
        }
    }
    assert_eq!(battle_map("crypt_hall").unwrap().tileset, "dungeon");
}

#[test]
fn map_files_are_checked() {
    let file = |rows: &[&str]| MapFile {
        id: "bad".into(),
        name: LocalizedName::default(),
        tileset: "dungeon".into(),
        rows: rows.iter().map(|r| r.to_string()).collect(),
        legend: [(
            ".".to_string(),
            MapCell {
                ground: "f".into(),
                kind: CellKind::Floor,
                object: None,
                zone: Some("party".into()),
            },
        )]
        .into(),
        ..MapFile::default()
    };
    assert!(file(&["..", "."]).build().is_err()); // not a rectangle
    assert!(
        file(&[".x"])
            .build()
            .unwrap_err()
            .contains("unknown character 'x'")
    );
    assert!(file(&[".."]).build().is_ok());
}

#[test]
fn movement_costs_terrain_and_respects_walls_and_corners() {
    let map = small_map(&["#######", "#p.~..#", "#..#..#", "#.....#", "#######"]);
    let start = GridPos::new(1, 1);
    let reach = reachable(&map, start, 30, &Occupancy::default());
    // Into the water costs 10: 5 to (2,1), 10 more to (3,1).
    assert_eq!(reach.cost(GridPos::new(3, 1)), Some(15));
    // Walls are never reachable.
    assert_eq!(reach.cost(GridPos::new(3, 2)), None);
    // (4,2) is two squares from (3,1)… but the diagonal from (2,1)? Cutting past the wall at
    // (3,2) from (2,1) to (3,2) is impossible anyway; check a real corner: (2,2) → (3,3) passes
    // the wall corner (3,2), so it must go around.
    let from_corner = reachable(&map, GridPos::new(2, 2), 5, &Occupancy::default());
    assert_eq!(from_corner.cost(GridPos::new(3, 3)), None);
    assert_eq!(from_corner.cost(GridPos::new(2, 3)), Some(5));
    // Diagonals cost 5 ft like straight steps.
    assert_eq!(reach.cost(GridPos::new(2, 2)), Some(5));
    let path = reach.path(GridPos::new(5, 3));
    assert_eq!(path.last(), Some(&GridPos::new(5, 3)));
    assert!(path.iter().all(|p| map.walkable(*p)));
}

#[test]
fn enemies_block_and_allies_are_passed_but_not_ended_on() {
    let map = small_map(&["#####", "#p..#", "#####"]);
    let start = GridPos::new(1, 1);
    let ally = Occupancy {
        allies: vec![GridPos::new(2, 1)],
        enemies: vec![],
    };
    let reach = reachable(&map, start, 30, &ally);
    assert!(!reach.can_end(GridPos::new(2, 1)));
    assert_eq!(
        reach.path(GridPos::new(3, 1)),
        vec![GridPos::new(2, 1), GridPos::new(3, 1)]
    );
    let enemy = Occupancy {
        allies: vec![],
        enemies: vec![GridPos::new(2, 1)],
    };
    assert_eq!(
        reachable(&map, start, 30, &enemy).cost(GridPos::new(3, 1)),
        None
    );
}

#[test]
fn sight_and_attack_ranges() {
    let map = small_map(&[
        "##########",
        "#p...O...#",
        "#........#",
        "#...D....#",
        "##########",
    ]);
    let archer = GridPos::new(1, 1);
    assert!(
        !map.line_of_sight(archer, GridPos::new(8, 1)),
        "pillar blocks"
    );
    assert!(map.line_of_sight(archer, GridPos::new(8, 2)));
    assert!(
        !map.line_of_sight(GridPos::new(4, 2), GridPos::new(4, 4))
            || !map.contains(GridPos::new(4, 4))
    );
    assert!(
        !map.line_of_sight(GridPos::new(3, 3), GridPos::new(5, 3)),
        "closed door blocks"
    );
    let (goblin, _) = monster_stats(monster("goblin").unwrap());
    let scimitar = goblin.attack("scimitar").unwrap();
    let shortbow = goblin.attack("shortbow").unwrap();
    assert_eq!(
        attack_reach(&map, scimitar, GridPos::new(2, 2), GridPos::new(3, 3)),
        Some(RollMode::Normal)
    );
    assert_eq!(
        attack_reach(&map, scimitar, GridPos::new(2, 2), GridPos::new(4, 2)),
        None
    );
    assert_eq!(
        attack_reach(&map, shortbow, archer, GridPos::new(8, 2)),
        Some(RollMode::Normal)
    );
    let mut short = shortbow.clone();
    short.range_ft = 20;
    short.long_range_ft = 30; // (8,2) is 35 ft away: out of long range
    assert_eq!(
        attack_reach(&map, &short, archer, GridPos::new(6, 2)),
        Some(RollMode::Disadvantage)
    );
    assert_eq!(attack_reach(&map, &short, archer, GridPos::new(8, 2)), None);
}

#[test]
fn placement_fills_the_zone_then_spreads() {
    let map = small_map(&["#######", "#s....#", "#....p#", "#######"]);
    let spots = map.placements("spawn", 3, &[GridPos::new(2, 1)]);
    assert_eq!(spots.len(), 3);
    assert_eq!(spots[0], GridPos::new(1, 1));
    assert!(
        spots
            .iter()
            .all(|p| map.walkable(*p) && *p != GridPos::new(2, 1))
    );
    assert_eq!(GridPos::new(1, 1).feet_to(GridPos::new(4, 3)), 15);
}

// --- Fighting on the board ---

fn at(mut c: Combatant, x: i32, y: i32) -> Combatant {
    c.position = Some(GridPos::new(x, y));
    c
}

fn open_map() -> BattleMap {
    small_map(&[
        "############",
        "#p.........#",
        "#..........#",
        "#..........#",
        "#.........s#",
        "############",
    ])
}

#[test]
fn leaving_reach_provokes_one_opportunity_attack_unless_disengaged() {
    let mut fighters = vec![
        at(hero("thorin", "fighter", "player"), 2, 2),
        at(goblin("g1"), 3, 2),
    ];
    let mut reactions = Vec::new();
    let mut rng = StdRng::seed_from_u64(5);
    let events = walk(
        &mut fighters,
        0,
        &[GridPos::new(1, 2), GridPos::new(1, 1)],
        false,
        &mut reactions,
        &mut rng,
    );
    assert!(matches!(events[0], CombatEvent::Move { feet: 10, .. }));
    assert!(
        events
            .iter()
            .any(|e| matches!(e, CombatEvent::OpportunityAttack { .. }))
    );
    assert_eq!(reactions, vec!["g1".to_string()]);
    // Back next to the goblin and away again: its reaction is spent this round.
    fighters[0].position = Some(GridPos::new(2, 2));
    let again = walk(
        &mut fighters,
        0,
        &[GridPos::new(1, 2)],
        false,
        &mut reactions,
        &mut rng,
    );
    assert!(
        !again
            .iter()
            .any(|e| matches!(e, CombatEvent::OpportunityAttack { .. }))
    );
    // Disengaged: no reaction at all.
    let mut fresh = Vec::new();
    fighters[0].position = Some(GridPos::new(2, 2));
    let calm = walk(
        &mut fighters,
        0,
        &[GridPos::new(1, 2)],
        true,
        &mut fresh,
        &mut rng,
    );
    assert!(fresh.is_empty() && calm.len() == 1);
}

#[test]
fn monsters_close_in_and_archers_keep_their_distance() {
    let map = open_map();
    let thorin = at(hero("thorin", "fighter", "player"), 1, 1);
    // A zombie (speed 20) far away walks towards the hero and cannot attack yet.
    let zombie = at(
        combatant("z", "enemy", monster_stats(monster("zombie").unwrap())),
        9,
        4,
    );
    let fight = vec![thorin.clone(), zombie.clone()];
    let plan = monster_board_plan(&map, &zombie, &fight, 20, false);
    assert_eq!(plan.action, TurnDecision::Pass);
    let target = plan.move_to.expect("moves");
    assert!(
        target.squares_to(GridPos::new(1, 1))
            < zombie.position.unwrap().squares_to(GridPos::new(1, 1))
    );
    // An orc two squares away walks up and swings its greataxe (much stronger than a javelin);
    // a goblin with equally strong bow and scimitar simply shoots from where it stands.
    let orc = at(
        combatant("o", "enemy", monster_stats(monster("orc").unwrap())),
        4,
        1,
    );
    let plan = monster_board_plan(&map, &orc, &[thorin.clone(), orc.clone()], 30, false);
    assert!(
        matches!(plan.action, TurnDecision::Attack { ref attack_id, .. } if attack_id == "greataxe")
    );
    assert_eq!(
        plan.move_to.map(|p| p.squares_to(GridPos::new(1, 1))),
        Some(1)
    );
    let archer = at(goblin("g"), 4, 1);
    let plan = monster_board_plan(&map, &archer, &[thorin.clone(), archer.clone()], 30, false);
    assert!(
        matches!(plan.action, TurnDecision::Attack { ref attack_id, .. } if attack_id == "shortbow")
    );
    assert_eq!(plan.move_to, None);
    // A kobold with only a sling in reach shoots from where it stands, not from next to the hero.
    let mut slinger = at(
        combatant("k", "enemy", monster_stats(monster("kobold").unwrap())),
        6,
        3,
    );
    slinger
        .stats5e
        .as_mut()
        .unwrap()
        .attacks
        .retain(|a| a.id == "sling");
    let plan = monster_board_plan(
        &map,
        &slinger,
        &[thorin.clone(), slinger.clone()],
        30,
        false,
    );
    assert!(matches!(plan.action, TurnDecision::Attack { .. }));
    let from = plan.move_to.or(slinger.position).unwrap();
    assert!(
        from.squares_to(GridPos::new(1, 1)) > 1,
        "shoots from a distance"
    );
}

#[test]
fn attacks_in_place_follow_reach_and_sight() {
    let map = open_map();
    let lyra = at(hero("lyra", "wizard", "player"), 1, 1);
    let near = at(goblin("near"), 2, 1);
    let far = at(goblin("far"), 9, 4);
    let options = actions_in_place(
        &map,
        &lyra,
        &[lyra.clone(), near.clone(), far.clone()],
        false,
    );
    let ids: Vec<&str> = options.iter().map(|o| o.id.as_str()).collect();
    assert!(ids.contains(&"attack:quarterstaff:near"));
    assert!(!ids.contains(&"attack:quarterstaff:far"));
    // Fire Bolt at the far goblin: in range, but an enemy stands next to Lyra.
    let bolt = options
        .iter()
        .find(|o| o.id == "attack:fire_bolt:far")
        .unwrap();
    assert!(bolt.disadvantage);
    assert!(ids.contains(&"dodge"));
}

#[test]
fn a_seeded_board_fight_runs_to_the_end() {
    let map = open_map();
    let mut rng = StdRng::seed_from_u64(9);
    let mut encounter = EncounterState {
        is_active: true,
        flanking: false,
        round: 1,
        current_turn_index: 0,
        combatants: vec![
            at(hero("thorin", "fighter", "player"), 1, 1),
            at(hero("finn", "rogue", "companion"), 2, 2),
            at(goblin("g1"), 9, 4),
            at(goblin("g2"), 10, 3),
        ],
        combat_log: Vec::new(),
        events: Vec::new(),
        turn: TurnBudget::default(),
        reactions_used: Vec::new(),
        effects: Vec::new(),
        difficulty: None,
    };
    roll_initiative(&mut encounter.combatants, &mut rng);
    let mut turns = 0;
    while combat_outcome(&encounter.combatants).is_none() && turns < 300 {
        let index = encounter.current_turn_index;
        let actor = encounter.combatants[index].clone();
        let plan = if is_enemy(&actor) {
            monster_board_plan(&map, &actor, &encounter.combatants, 30, false)
        } else {
            hero_board_plan(&map, &actor, &encounter.combatants, 30, false)
        };
        if let Some(target) = plan.move_to {
            let reach = reachable(
                &map,
                actor.position.unwrap(),
                30,
                &occupancy(&actor, &encounter.combatants),
            );
            let path = reach.path(target);
            walk(
                &mut encounter.combatants,
                index,
                &path,
                false,
                &mut encounter.reactions_used,
                &mut rng,
            );
        }
        let actor = encounter.combatants[index].clone();
        if is_up(&actor) {
            match plan.action {
                TurnDecision::Attack {
                    attack_id,
                    target_id,
                } => {
                    let attack = actor
                        .stats5e
                        .as_ref()
                        .unwrap()
                        .attack(&attack_id)
                        .unwrap()
                        .clone();
                    let target = encounter
                        .combatants
                        .iter_mut()
                        .find(|c| c.id == target_id)
                        .unwrap();
                    resolve_attack(&actor, &attack, target, &mut rng);
                }
                TurnDecision::Flee => {
                    flee(&mut encounter.combatants[index]);
                }
                _ => {}
            }
        }
        // Nobody ever stands on a wall or on someone else's square.
        let positions: Vec<GridPos> = encounter
            .combatants
            .iter()
            .filter(|c| is_up(c))
            .filter_map(|c| c.position)
            .collect();
        assert!(positions.iter().all(|p| map.walkable(*p)));
        assert_eq!(
            positions.len(),
            positions
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
        );
        advance_turn(&mut encounter);
        encounter
            .reactions_used
            .retain(|id| *id != encounter.combatants[encounter.current_turn_index].id);
        turns += 1;
    }
    assert!(
        combat_outcome(&encounter.combatants).is_some(),
        "board fight ended within {turns} turns"
    );
}

// --- Spells, conditions, death saves ---

fn wizard(id: &str) -> Combatant {
    hero(id, "wizard", "player")
}

#[test]
fn spell_data_loads_and_casters_get_slots_and_spells() {
    assert_eq!(spells().len(), 26);
    for spell in spells() {
        assert!(
            !spell.name.de.is_empty() && !spell.name.ru.is_empty(),
            "{}",
            spell.id
        );
    }
    let lyra = wizard("lyra");
    let casting = lyra
        .stats5e
        .as_ref()
        .unwrap()
        .spellcasting
        .as_ref()
        .unwrap();
    assert_eq!(casting.slots_max[0], 2);
    // Level 1: cantrips and 1st-level spells, no 2nd-level ones yet.
    assert!(casting.spells.contains(&"burning_hands".to_string()));
    assert!(!casting.spells.contains(&"scorching_ray".to_string()));
    let stats = lyra.stats5e.as_ref().unwrap();
    assert_eq!((spell_save_dc(stats), spell_attack_bonus(stats)), (12, 4));
    assert!(
        hero("t", "fighter", "player")
            .stats5e
            .unwrap()
            .spellcasting
            .is_none()
    );
    assert_eq!(full_caster_slots(3)[..2], [4, 2]);
}

#[test]
fn cast_requests_round_trip_and_are_checked() {
    let request = CastRequest {
        spell_id: "burning_hands".into(),
        slot_level: 1,
        target: CastTarget::Point(GridPos::new(3, 2)),
    };
    assert_eq!(CastRequest::parse(&request.id()), Some(request.clone()));
    let map = open_map();
    let lyra = at(wizard("lyra"), 1, 1);
    let goblin = at(goblin("g"), 3, 1);
    let fighters = vec![lyra.clone(), goblin.clone()];
    let budget = CastBudget {
        action: true,
        bonus_action: true,
    };
    assert!(check_cast(Some(&map), &lyra, &fighters, &request, budget).is_ok());
    // Cantrips cost no slot; spells need one of their level; time must be left.
    let bolt = CastRequest {
        spell_id: "ray_of_frost".into(),
        slot_level: 0,
        target: CastTarget::Creature("g".into()),
    };
    assert!(check_cast(Some(&map), &lyra, &fighters, &bolt, budget).is_ok());
    let no_time = CastBudget {
        action: false,
        bonus_action: true,
    };
    assert_eq!(
        check_cast(Some(&map), &lyra, &fighters, &bolt, no_time),
        Err(CastProblem::BudgetUsed)
    );
    let unknown = CastRequest {
        spell_id: "cure_wounds".into(),
        slot_level: 1,
        target: CastTarget::Creature("lyra".into()),
    };
    assert_eq!(
        check_cast(Some(&map), &lyra, &fighters, &unknown, budget),
        Err(CastProblem::UnknownSpell)
    );
    let mut spent = lyra.clone();
    spent
        .stats5e
        .as_mut()
        .unwrap()
        .spellcasting
        .as_mut()
        .unwrap()
        .slots_used[0] = 2;
    assert_eq!(
        check_cast(Some(&map), &spent, &fighters, &request, budget),
        Err(CastProblem::NoSlot)
    );
    // Hold Person only works on humanoids.
    let mut cleric = at(hero("althea", "cleric", "player"), 1, 2);
    cleric
        .stats5e
        .as_mut()
        .unwrap()
        .spellcasting
        .as_mut()
        .unwrap()
        .spells
        .push("hold_person".into());
    cleric
        .stats5e
        .as_mut()
        .unwrap()
        .spellcasting
        .as_mut()
        .unwrap()
        .slots_max[1] = 1;
    let zombie = at(
        combatant("z", "enemy", monster_stats(monster("zombie").unwrap())),
        4,
        2,
    );
    let hold = |id: &str| CastRequest {
        spell_id: "hold_person".into(),
        slot_level: 2,
        target: CastTarget::Creature(id.into()),
    };
    let crowd = vec![cleric.clone(), goblin.clone(), zombie];
    assert!(check_cast(Some(&map), &cleric, &crowd, &hold("g"), budget).is_ok());
    assert_eq!(
        check_cast(Some(&map), &cleric, &crowd, &hold("z"), budget),
        Err(CastProblem::WrongTarget)
    );
}

#[test]
fn areas_cover_the_expected_squares() {
    let caster = GridPos::new(5, 5);
    // 15-ft cone to the east: 1 square wide at the start, 3 at the end.
    let cone = area_squares(
        Area {
            shape: AreaShape::Cone,
            size_ft: 15,
        },
        caster,
        GridPos::new(9, 5),
    );
    assert!(
        cone.contains(&GridPos::new(6, 5))
            && cone.contains(&GridPos::new(8, 6))
            && cone.contains(&GridPos::new(8, 4))
    );
    assert!(
        !cone.contains(&caster)
            && !cone.contains(&GridPos::new(4, 5))
            && !cone.contains(&GridPos::new(9, 5))
    );
    // 20-ft sphere: 9×9 squares around the point.
    assert_eq!(
        area_squares(
            Area {
                shape: AreaShape::Sphere,
                size_ft: 20
            },
            caster,
            GridPos::new(2, 2)
        )
        .len(),
        81
    );
    // 15-ft cube next to the caster.
    let cube = area_squares(
        Area {
            shape: AreaShape::Cube,
            size_ft: 15,
        },
        caster,
        GridPos::new(5, 9),
    );
    assert!(
        cube.contains(&GridPos::new(5, 6))
            && cube.contains(&GridPos::new(4, 8))
            && !cube.contains(&GridPos::new(5, 9))
    );
}

#[test]
fn burning_hands_hits_everyone_in_the_cone_with_saves() {
    let map = open_map();
    let mut fighters = vec![
        at(wizard("lyra"), 2, 2),
        at(goblin("g1"), 3, 2),
        at(goblin("g2"), 4, 3),
        at(goblin("far"), 9, 2),
    ];
    let request = CastRequest {
        spell_id: "burning_hands".into(),
        slot_level: 1,
        target: CastTarget::Point(GridPos::new(5, 2)),
    };
    let mut effects = Vec::new();
    let events = cast_spell(
        Some(&map),
        &mut fighters,
        0,
        spell("burning_hands").unwrap(),
        &request,
        &mut effects,
        false,
        &mut StdRng::seed_from_u64(4),
    );
    let saves: Vec<&str> = events
        .iter()
        .filter_map(|e| match e {
            CombatEvent::Save { target_name, .. } => Some(target_name.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(saves, vec!["g1", "g2"]);
    assert!(fighters[1].hp < 7 || fighters[2].hp < 7);
    assert_eq!(fighters[3].hp, 7, "outside the cone");
    assert_eq!(
        fighters[0]
            .stats5e
            .as_ref()
            .unwrap()
            .spellcasting
            .as_ref()
            .unwrap()
            .slots_used[0],
        1
    );
    // Half damage on a save, of the same roll.
    for e in &events {
        if let CombatEvent::Save {
            success: true,
            target_id,
            ..
        } = e
        {
            let damage = events.iter().find_map(|d| match d {
                CombatEvent::Damage {
                    target_id: t,
                    amount,
                    ..
                } if t == target_id => Some(*amount),
                _ => None,
            });
            let full = events
                .iter()
                .find_map(|d| match d {
                    CombatEvent::Damage { roll, .. } => Some(roll.total),
                    _ => None,
                })
                .unwrap();
            assert!(damage.is_none_or(|d| d <= full));
        }
    }
}

#[test]
fn conditions_change_attacks_and_saves() {
    let thorin = hero("thorin", "fighter", "player");
    let mut held = goblin("g");
    add_condition(&mut held, PARALYZED, 10);
    let (mode, crit) = attack_conditions(&thorin, &held, Some(5));
    assert_eq!((mode, crit), (RollMode::Advantage, true));
    assert!(
        !attack_conditions(&thorin, &held, Some(30)).1,
        "no automatic crit from afar"
    );
    assert!(incapacitated(&held) && speed_ft(&held) == 0 && auto_fails(&held, Ability::Dex));
    let mut poisoned = hero("finn", "rogue", "player");
    add_condition(&mut poisoned, POISONED, 3);
    assert_eq!(
        attack_conditions(&poisoned, &goblin("x"), None).0,
        RollMode::Disadvantage
    );
    // Prone: close attackers have advantage, distant ones disadvantage.
    let mut lying = goblin("p");
    add_condition(&mut lying, PRONE, 1);
    assert_eq!(
        attack_conditions(&thorin, &lying, Some(5)).0,
        RollMode::Advantage
    );
    assert_eq!(
        attack_conditions(&thorin, &lying, Some(30)).0,
        RollMode::Disadvantage
    );
    assert_eq!(normalize_condition("Vergiftet"), Some(POISONED));
    assert_eq!(normalize_condition("ошеломлён"), Some(STUNNED));
    assert_eq!(normalize_condition("Verliebt"), None);
    // Shield of Faith and Mage Armor change the armor class.
    let mut lyra = wizard("lyra");
    assert_eq!(armor_class(&lyra), 12);
    add_condition(&mut lyra, MAGE_ARMOR, UNTIL_REST);
    add_condition(&mut lyra, SHIELD_OF_FAITH, 10);
    assert_eq!(armor_class(&lyra), 15 + 2);
}

#[test]
fn death_saves_stabilize_kill_or_knock_out() {
    let mut rng = StdRng::seed_from_u64(11);
    let mut finn = hero("finn", "rogue", "companion");
    let hit = DamageRoll {
        rolls: vec![20],
        modifier: 0,
        total: 20,
    };
    let ctx = DamageContext::default();
    // Finn has 10 hit points (d8 + CON 2): exactly 10 damage takes him down.
    let events = apply_damage(
        &mut finn,
        DamageRoll {
            rolls: vec![10],
            modifier: 0,
            total: 10,
        },
        "slashing",
        DamageScaling::Normal,
        &ctx,
        &mut rng,
    );
    assert!(events.iter().any(|e| matches!(e, CombatEvent::Down { .. })));
    assert!(is_dying(&finn) && takes_turn(&finn) && !is_up(&finn));
    // A hit while dying is a failure, a critical one two.
    apply_damage(
        &mut finn,
        hit.clone(),
        "slashing",
        DamageScaling::Normal,
        &DamageContext {
            critical: true,
            heroic_death: true,
        },
        &mut rng,
    );
    assert_eq!(finn.stats5e.as_ref().unwrap().death_saves.failures, 2);
    let events = apply_damage(
        &mut finn,
        hit,
        "slashing",
        DamageScaling::Normal,
        &DamageContext {
            critical: false,
            heroic_death: true,
        },
        &mut rng,
    );
    assert!(events.iter().any(|e| matches!(
        e,
        CombatEvent::DeathSave {
            outcome: DeathSaveOutcome::Dead,
            ..
        }
    )));
    assert!(!takes_turn(&finn));
    // Without heroic death three failures only knock out; healing brings the hero back.
    let mut lyra = wizard("lyra");
    lyra.hp = 0;
    add_condition(&mut lyra, UNCONSCIOUS, 0);
    for _ in 0..30 {
        if !is_dying(&lyra) {
            break;
        }
        death_save(&mut lyra, false, &mut rng);
    }
    assert!(!is_dying(&lyra));
    let saves = &lyra.stats5e.as_ref().unwrap().death_saves;
    assert!(!saves.dead, "never dead without heroic death");
    if lyra.hp == 0 {
        let events = heal(&mut lyra, 4);
        assert_eq!(lyra.hp, 4);
        assert!(
            events
                .iter()
                .any(|e| matches!(e, CombatEvent::ConditionEnd { .. }))
        );
        assert_eq!(
            lyra.stats5e.as_ref().unwrap().death_saves,
            DeathSaves::default()
        );
    }
}

#[test]
fn sleep_takes_the_weakest_and_spares_undead() {
    let map = open_map();
    let mut fighters = vec![
        at(wizard("lyra"), 1, 1),
        at(goblin("weak"), 6, 2),
        at(
            combatant("z", "enemy", monster_stats(monster("zombie").unwrap())),
            6,
            3,
        ),
        at(
            combatant("o", "enemy", monster_stats(monster("orc").unwrap())),
            7,
            3,
        ),
    ];
    fighters[1].hp = 2;
    let request = CastRequest {
        spell_id: "sleep".into(),
        slot_level: 1,
        target: CastTarget::Point(GridPos::new(6, 3)),
    };
    let mut effects = Vec::new();
    cast_spell(
        Some(&map),
        &mut fighters,
        0,
        spell("sleep").unwrap(),
        &request,
        &mut effects,
        false,
        &mut StdRng::seed_from_u64(3),
    );
    assert!(
        has_condition(&fighters[1], ASLEEP),
        "the weakest sleeps first"
    );
    assert!(!has_condition(&fighters[2], ASLEEP), "undead do not sleep");
    // Damage wakes a sleeper.
    let mut rng = StdRng::seed_from_u64(2);
    apply_damage(
        &mut fighters[1],
        DamageRoll {
            rolls: vec![1],
            modifier: 0,
            total: 1,
        },
        "fire",
        DamageScaling::Normal,
        &DamageContext::default(),
        &mut rng,
    );
    assert!(!has_condition(&fighters[1], ASLEEP));
}

#[test]
fn concentration_ends_with_the_casters_focus() {
    let mut cleric = hero("althea", "cleric", "player");
    let thorin = hero("thorin", "fighter", "companion");
    let mut fighters = vec![cleric.clone(), thorin];
    let request = CastRequest {
        spell_id: "bless".into(),
        slot_level: 1,
        target: CastTarget::Creature("althea".into()),
    };
    let mut effects = Vec::new();
    cast_spell(
        None,
        &mut fighters,
        0,
        spell("bless").unwrap(),
        &request,
        &mut effects,
        false,
        &mut StdRng::seed_from_u64(1),
    );
    assert!(fighters.iter().all(|c| has_condition(c, BLESSED)));
    assert_eq!(effects.len(), 2);
    assert_eq!(
        fighters[0]
            .stats5e
            .as_ref()
            .unwrap()
            .concentration
            .as_deref(),
        Some("bless")
    );
    // The caster goes down: concentration and the blessing end everywhere.
    fighters[0].hp = 0;
    let ended = sync_concentration(&mut fighters, &mut effects);
    assert_eq!(ended.len(), 2);
    assert!(effects.is_empty() && !fighters.iter().any(|c| has_condition(c, BLESSED)));
    cleric.hp = 1;
}

#[test]
fn healing_and_magic_missile() {
    let mut fighters = vec![
        hero("althea", "cleric", "player"),
        hero("finn", "rogue", "companion"),
        goblin("g"),
    ];
    fighters[1].hp = 0;
    add_condition(&mut fighters[1], UNCONSCIOUS, 0);
    let mut effects = Vec::new();
    let cure = CastRequest {
        spell_id: "healing_word".into(),
        slot_level: 1,
        target: CastTarget::Creature("finn".into()),
    };
    let events = cast_spell(
        None,
        &mut fighters,
        0,
        spell("healing_word").unwrap(),
        &cure,
        &mut effects,
        false,
        &mut StdRng::seed_from_u64(6),
    );
    assert!(
        fighters[1].hp > 2 && is_up(&fighters[1]),
        "1d4 + WIS 2: {events:?}"
    );
    // Magic missile never misses: three darts of 1d4+1.
    let mut lyra_side = vec![wizard("lyra"), goblin("g")];
    let missile = CastRequest {
        spell_id: "magic_missile".into(),
        slot_level: 1,
        target: CastTarget::Creature("g".into()),
    };
    let events = cast_spell(
        None,
        &mut lyra_side,
        0,
        spell("magic_missile").unwrap(),
        &missile,
        &mut effects,
        false,
        &mut StdRng::seed_from_u64(6),
    );
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, CombatEvent::Damage { .. }))
            .count(),
        3
    );
    assert!(lyra_side[1].hp <= 7 - 3);
}

#[test]
fn heroes_level_up_by_milestone() {
    let fighter = class("fighter").unwrap();
    assert_eq!([1, 2, 3].map(|l| hero_stats_at(fighter, l).1), [12, 20, 28]);
    let (wizard3, hp) = hero_stats_at(class("wizard").unwrap(), 3);
    assert_eq!(hp, 17);
    let casting = wizard3.spellcasting.as_ref().unwrap();
    assert_eq!(&casting.slots_max[..2], &[4, 2]);
    assert!(casting.spells.contains(&"scorching_ray".to_string()));
    assert!(
        !hero("w", "wizard", "player")
            .stats5e
            .unwrap()
            .spellcasting
            .unwrap()
            .spells
            .contains(&"scorching_ray".to_string())
    );

    let mut thorin = hero("thorin", "fighter", "companion");
    thorin.hp = 5;
    rules5e_spend_second_wind(&mut thorin);
    assert!(level_up(&mut thorin, 2));
    let stats = thorin.stats5e.as_ref().unwrap();
    assert_eq!(
        (thorin.hp, thorin.max_hp, stats.level, stats.hit_dice_left),
        (13, 20, 2, 2)
    );
    assert_eq!(uses_left(stats, SECOND_WIND), 0, "used features stay used");
    assert_eq!(uses_left(stats, ACTION_SURGE), 1);
    assert!(!level_up(&mut thorin, 2), "no level twice");
    assert!(level_up(&mut thorin, 9));
    assert_eq!(thorin.stats5e.as_ref().unwrap().level, MAX_LEVEL);
    assert_eq!(critical_from(thorin.stats5e.as_ref().unwrap()), 19);

    // A spent slot stays spent when the hero gains slots.
    let mut lyra = hero("lyra", "wizard", "companion");
    lyra.stats5e
        .as_mut()
        .unwrap()
        .spellcasting
        .as_mut()
        .unwrap()
        .slots_used[0] = 2;
    level_up(&mut lyra, 3);
    let casting = lyra
        .stats5e
        .as_ref()
        .unwrap()
        .spellcasting
        .as_ref()
        .unwrap();
    assert_eq!(
        (
            casting.slots_used[0],
            casting.slots_left(1),
            casting.slots_left(2)
        ),
        (2, 2, 2)
    );
}

fn rules5e_spend_second_wind(hero: &mut Combatant) {
    spend(hero.stats5e.as_mut().unwrap(), SECOND_WIND);
}

#[test]
fn class_features_by_level_and_rests() {
    assert_eq!(class_features("rogue", 1), vec![SNEAK_ATTACK]);
    assert_eq!(
        class_features("rogue", 3),
        vec![SNEAK_ATTACK, CUNNING_ACTION]
    );
    assert_eq!(
        class_features("cleric", 2),
        vec![DISCIPLE_OF_LIFE, TURN_UNDEAD]
    );
    let mut rogue = hero("finn", "rogue", "companion");
    assert_eq!(sneak_attack_dice(rogue.stats5e.as_ref().unwrap()), 1);
    level_up(&mut rogue, 3);
    assert_eq!(sneak_attack_dice(rogue.stats5e.as_ref().unwrap()), 2);
    let cleric = hero("althea", "cleric", "companion");
    assert_eq!(healing_bonus(cleric.stats5e.as_ref().unwrap(), 1), 3);
    assert_eq!(healing_bonus(cleric.stats5e.as_ref().unwrap(), 0), 0);

    // Arcane Recovery: half the wizard level (rounded up) in slot levels, once per long rest.
    let mut lyra = hero("lyra", "wizard", "companion");
    level_up(&mut lyra, 3);
    let stats = lyra.stats5e.as_mut().unwrap();
    let casting = stats.spellcasting.as_mut().unwrap();
    casting.slots_used[0] = 2;
    casting.slots_used[1] = 1;
    assert_eq!(arcane_recovery(stats), vec![2]);
    assert!(arcane_recovery(stats).is_empty());
    short_rest(stats);
    assert!(
        arcane_recovery(stats).is_empty(),
        "comes back only with a long rest"
    );
    long_rest(stats);
    assert_eq!(arcane_recovery(stats), vec![1, 1]);
}

#[test]
fn sneak_attack_adds_dice_on_hits_and_champions_crit_on_19() {
    let finn = hero("finn", "rogue", "player");
    let attack = finn.stats5e.as_ref().unwrap().attacks[0].clone();
    let situation = AttackSituation {
        sneak_dice: 1,
        ..Default::default()
    };
    let (mut hits, mut sneaks) = (0, 0);
    for seed in 0..40 {
        let mut target = goblin("g");
        target.hp = 500;
        target.max_hp = 500;
        let events = resolve_attack_with(
            &finn,
            &attack,
            &mut target,
            &situation,
            &mut StdRng::seed_from_u64(seed),
        );
        let hit = matches!(events[0], CombatEvent::Attack { hit: true, .. });
        let sneak = events
            .iter()
            .any(|e| matches!(e, CombatEvent::Feature { feature, .. } if feature == SNEAK_ATTACK));
        assert_eq!(hit, sneak);
        hits += usize::from(hit);
        sneaks += usize::from(sneak);
    }
    assert!(hits > 0 && hits == sneaks);

    let mut thorin = hero("thorin", "fighter", "player");
    level_up(&mut thorin, 3);
    let attack = thorin.stats5e.as_ref().unwrap().attacks[0].clone();
    let situation = AttackSituation {
        critical_from: 19,
        ..Default::default()
    };
    let nineteen = (0..400)
        .find_map(|seed| {
            let mut target = goblin("g");
            target.hp = 500;
            let events = resolve_attack_with(
                &thorin,
                &attack,
                &mut target,
                &situation,
                &mut StdRng::seed_from_u64(seed),
            );
            match &events[0] {
                CombatEvent::Attack { roll, critical, .. } if roll.natural == 19 => Some(*critical),
                _ => None,
            }
        })
        .expect("a natural 19");
    assert!(nineteen);
}

#[test]
fn encounter_difficulty_uses_srd_xp_and_trims_wild_groups() {
    assert_eq!(
        [0.125, 0.25, 0.5, 1.0, 2.0].map(xp_for_cr),
        [25, 50, 100, 200, 450]
    );
    let budget = party_budget(&[1, 1, 1, 1, 1]);
    assert_eq!(budget, [100, 200, 320, 480]);
    let goblin = monster("goblin").unwrap();
    assert_eq!(encounter_xp(&[goblin, goblin]), 125);
    assert_eq!(rate(125, budget), Difficulty::Easy);
    assert_eq!(rate(50, budget), Difficulty::Trivial);
    let ogre = monster("ogre").unwrap();
    assert_eq!(rate(encounter_xp(&[ogre]), budget), Difficulty::Hard);
    // Eight ogres against level-1 heroes: cut down until it is merely brutal.
    let trimmed = trim_to_budget(vec![ogre; 8], budget);
    assert!(trimmed.len() < 8 && encounter_xp(&trimmed) <= budget[3] * 3 / 2);
    assert_eq!(
        trim_to_budget(vec![ogre], party_budget(&[1])).len(),
        1,
        "one always stays"
    );
}

#[test]
fn a_wizard_casts_shield_when_it_turns_a_hit_into_a_miss() {
    let goblin = goblin("g");
    let attack = goblin.stats5e.as_ref().unwrap().attacks[0].clone();
    let situation = AttackSituation {
        target_can_react: true,
        ..Default::default()
    };
    let mut shielded = 0;
    for seed in 0..60 {
        let mut lyra = wizard("lyra");
        lyra.hp = 500;
        let events = resolve_attack_with(
            &goblin,
            &attack,
            &mut lyra,
            &situation,
            &mut StdRng::seed_from_u64(seed),
        );
        let shield = events
            .iter()
            .any(|e| matches!(e, CombatEvent::Feature { feature, .. } if feature == "shield"));
        let CombatEvent::Attack {
            hit,
            total,
            target_ac,
            roll,
            ..
        } = events
            .iter()
            .find(|e| matches!(e, CombatEvent::Attack { .. }))
            .unwrap()
        else {
            unreachable!()
        };
        if shield {
            shielded += 1;
            assert!(!hit && *target_ac == 17 && *total < 17);
            assert!(has_condition(&lyra, SHIELDED));
            assert_eq!(
                lyra.stats5e
                    .as_ref()
                    .unwrap()
                    .spellcasting
                    .as_ref()
                    .unwrap()
                    .slots_used[0],
                1
            );
        } else if *hit {
            assert!(
                roll.natural == 20 || *total >= 17,
                "a hit Shield could have stopped"
            );
        }
    }
    assert!(shielded > 0);
    // Without the reaction nothing happens.
    let mut lyra = wizard("lyra");
    for seed in 0..20 {
        let events = resolve_attack_with(
            &goblin,
            &attack,
            &mut lyra,
            &AttackSituation::default(),
            &mut StdRng::seed_from_u64(seed),
        );
        assert!(
            !events
                .iter()
                .any(|e| matches!(e, CombatEvent::Feature { .. }))
        );
        lyra.hp = lyra.max_hp;
    }
}

#[test]
fn starting_gear_gives_the_class_armor_class_and_attacks() {
    assert!(items().len() >= 20);
    for class_data in classes() {
        for id in &class_data.equipment {
            assert!(item(id).is_some(), "{id}");
        }
        let (stats, _) = hero_stats(class_data);
        assert_eq!(
            stats.armor_class, class_data.armor_class,
            "{}",
            class_data.id
        );
        assert_eq!(stats.armor_class, worn_armor_class(&stats));
        let ids: Vec<&str> = stats.attacks.iter().map(|a| a.id.as_str()).collect();
        let template: Vec<&str> = class_data.attacks.iter().map(|a| a.id.as_str()).collect();
        let mut sorted = ids.clone();
        sorted.sort();
        let mut expected = template.clone();
        expected.sort();
        assert_eq!(sorted, expected, "{}", class_data.id);
    }
    // Loot on the bundled maps names real items.
    for map in battle_maps() {
        for entry in map
            .loot
            .iter()
            .flat_map(|l| l.items.iter())
            .chain(map.encounters.iter().flat_map(|e| e.loot.iter()))
        {
            let id = entry.split('*').next().unwrap();
            assert!(item(id).is_some(), "{}: {entry}", map.id);
        }
    }
}

#[test]
fn equipping_changes_armor_class_and_attacks_within_proficiencies() {
    let mut thorin = hero("thorin", "fighter", "player");
    let stats = thorin.stats5e.as_mut().unwrap();
    assert!(unequip(stats, "chain_mail"));
    assert_eq!(stats.armor_class, 10 + 1 + 2, "unarmored + DEX + shield");
    assert_eq!(equip(stats, "splint"), Ok(Vec::new()));
    assert_eq!(stats.armor_class, 19);
    assert_eq!(equip(stats, "chain_mail"), Ok(vec!["splint".to_string()]));
    // A third weapon fits; a fourth replaces the first.
    assert_eq!(equip(stats, "greataxe"), Ok(Vec::new()));
    let greataxe = stats.attack("greataxe").unwrap();
    assert_eq!((greataxe.to_hit, greataxe.damage.as_str()), (4, "1d12+2"));
    assert_eq!(equip(stats, "handaxe"), Ok(vec!["longsword".to_string()]));
    assert!(stats.attack("longsword").is_none() && stats.attack("handaxe_thrown").is_some());

    let mut lyra = hero("lyra", "wizard", "player");
    let stats = lyra.stats5e.as_mut().unwrap();
    assert_eq!(equip(stats, "leather"), Err(EquipProblem::NotProficient));
    assert_eq!(
        equip(stats, "potion_of_healing"),
        Err(EquipProblem::NotWearable)
    );
    // A wizard can swing a longsword, but without proficiency.
    equip(stats, "longsword").unwrap();
    assert_eq!(stats.attack("longsword").unwrap().to_hit, -1);
    assert!(stats.attack("fire_bolt").is_some(), "spell attacks stay");

    let mut finn = hero("finn", "rogue", "player");
    level_up(&mut finn, 2);
    let stats = finn.stats5e.as_mut().unwrap();
    equip(stats, "studded_leather").unwrap();
    assert_eq!(stats.armor_class, 14);
    level_up(&mut finn, 3);
    assert_eq!(
        finn.stats5e.as_ref().unwrap().armor_class,
        14,
        "gear survives a level-up"
    );
}

// --- Standard actions: Help, Hide, Ready, grapple, shove, escape, stand up, off-hand, potion ---

/// A running fight on `rows` with the fighters on their squares; the first one's turn.
fn arena(rows: &[&str], fighters: Vec<(Combatant, (i32, i32))>) -> TableState {
    let mut state = TableState {
        rules: Some(SceneRules {
            ruleset: "5e".into(),
            ..Default::default()
        }),
        map: Some(small_map(rows)),
        ..Default::default()
    };
    state.combat.is_active = true;
    state.combat.combatants = fighters
        .into_iter()
        .map(|(mut c, (x, y))| {
            c.position = Some(GridPos::new(x, y));
            c
        })
        .collect();
    begin_turn(&mut state.table());
    state
}

const ROOM: [&str; 5] = [
    "#########",
    "#p......#",
    "#.......#",
    "#.......#",
    "#########",
];

fn option_ids(state: &TableState) -> Vec<String> {
    combat_options(&state.combat, state.map.as_ref())
        .actions
        .into_iter()
        .map(|o| o.id)
        .collect()
}

fn rolled_mode(events: &[CombatEvent]) -> Option<RollMode> {
    events.iter().find_map(|e| match e {
        CombatEvent::Attack { roll, .. } => Some(roll.mode),
        _ => None,
    })
}

#[test]
fn maneuver_ids_are_not_read_as_dodge() {
    let options = vec![
        ActionOption {
            id: "help:g".into(),
            target_id: Some("g".into()),
            ..Default::default()
        },
        ActionOption {
            id: "dodge".into(),
            ..Default::default()
        },
    ];
    assert_eq!(
        parse_action("help:g", &options),
        Some(TurnDecision::Maneuver("help:g".into()))
    );
    assert_eq!(parse_action("dodge", &options), Some(TurnDecision::Dodge));
}

#[test]
fn help_gives_the_next_attack_against_the_target_advantage() {
    let mut state = arena(
        &ROOM,
        vec![
            (hero("player", "fighter", "player"), (2, 2)),
            (hero("lyra", "cleric", "companion"), (4, 2)),
            (goblin("g"), (3, 2)),
        ],
    );
    let mut rng = StdRng::seed_from_u64(1);
    assert!(option_ids(&state).contains(&"help:g".to_string()));
    let action = parse_player_action(&state.combat, state.map.as_ref(), "help:g").unwrap();
    let (events, _) = apply_player_action(&mut state.table(), action, &mut rng);
    assert!(
        matches!(&events[0], CombatEvent::Maneuver { maneuver, target_id: Some(t), .. } if maneuver == HELP && t == "g")
    );
    assert!(state.combat.turn.action_used);
    assert!(has_condition(&state.combat.combatants[2], HELPED));
    // The goblin's own turn does not end it yet; the ally's attack uses it up.
    state.combat.current_turn_index = 2;
    begin_turn(&mut state.table());
    assert!(has_condition(&state.combat.combatants[2], HELPED));
    state.combat.current_turn_index = 1;
    begin_turn(&mut state.table());
    let events = act(
        &mut state.table(),
        TurnDecision::Attack {
            attack_id: "mace".into(),
            target_id: "g".into(),
        },
        &mut rng,
    );
    assert_eq!(rolled_mode(&events), Some(RollMode::Advantage));
    assert!(!has_condition(&state.combat.combatants[2], HELPED));
}

#[test]
fn hiding_needs_cover_and_distance_and_gives_advantage_until_the_attack() {
    // A pillar between the rogue and the goblin: hiding works; in the open or next to it, not.
    let behind = [
        "#########",
        "#p......#",
        "#..O....#",
        "#.......#",
        "#########",
    ];
    let mut state = arena(
        &behind,
        vec![
            (hero("finn", "rogue", "player"), (2, 2)),
            (goblin("g"), (6, 2)),
        ],
    );
    assert!(option_ids(&state).contains(&HIDE.to_string()));
    let open = arena(
        &ROOM,
        vec![
            (hero("finn", "rogue", "player"), (2, 2)),
            (goblin("g"), (6, 2)),
        ],
    );
    assert!(!option_ids(&open).contains(&HIDE.to_string()));
    let close = arena(
        &behind,
        vec![
            (hero("finn", "rogue", "player"), (2, 2)),
            (goblin("g"), (1, 2)),
        ],
    );
    assert!(!option_ids(&close).contains(&HIDE.to_string()));
    // The check: Stealth against the best passive Perception.
    for seed in 0..20 {
        let mut copy = state.clone();
        let events = perform(&mut copy.table(), HIDE, &mut StdRng::seed_from_u64(seed));
        let CombatEvent::Maneuver {
            total: Some(total),
            against: Some(against),
            success,
            ..
        } = &events[0]
        else {
            panic!("hide reports its check: {events:?}");
        };
        assert_eq!(*against, passive_perception(&copy.combat.combatants[1]));
        assert_eq!(*success, total >= against);
        assert_eq!(*success, has_condition(&copy.combat.combatants[0], HIDDEN));
    }
    // Hidden: the attack has advantage (and Sneak Attack), then the rogue is seen again.
    add_condition(&mut state.combat.combatants[0], HIDDEN, 0);
    state.combat.combatants[0].position = Some(GridPos::new(5, 2));
    let events = act(
        &mut state.table(),
        TurnDecision::Attack {
            attack_id: "shortsword".into(),
            target_id: "g".into(),
        },
        &mut StdRng::seed_from_u64(3),
    );
    assert_eq!(rolled_mode(&events), Some(RollMode::Advantage));
    assert!(
        events.iter().any(
            |e| matches!(e, CombatEvent::ConditionEnd { condition, .. } if condition == HIDDEN)
        )
    );
    assert!(!has_condition(&state.combat.combatants[0], HIDDEN));
    // Attacks against a hidden creature have disadvantage.
    let mut seen = state.clone();
    add_condition(&mut seen.combat.combatants[0], HIDDEN, 0);
    let goblin = seen.combat.combatants[1].clone();
    let attack = goblin.stats5e.as_ref().unwrap().attacks[0].clone();
    let events = resolve_attack(
        &goblin,
        &attack,
        &mut seen.combat.combatants[0],
        &mut StdRng::seed_from_u64(4),
    );
    assert_eq!(rolled_mode(&events), Some(RollMode::Disadvantage));
}

#[test]
fn grapple_holds_the_target_until_it_escapes_or_the_holder_is_gone() {
    let mut won = None;
    for seed in 0..40 {
        let mut state = arena(
            &ROOM,
            vec![
                (hero("player", "fighter", "player"), (2, 2)),
                (goblin("g"), (3, 2)),
            ],
        );
        let events = perform(
            &mut state.table(),
            "grapple:g",
            &mut StdRng::seed_from_u64(seed),
        );
        let CombatEvent::Maneuver {
            total,
            against,
            success,
            ..
        } = &events[0]
        else {
            panic!("{events:?}");
        };
        assert_eq!(*success, total.unwrap() >= against.unwrap());
        assert_eq!(
            *success,
            has_condition(&state.combat.combatants[1], GRAPPLED)
        );
        if *success {
            won = Some(state);
            break;
        }
    }
    let mut state = won.expect("a fighter wins a grapple against a goblin sometimes");
    // Held: no speed, and the goblin may try to escape.
    state.combat.current_turn_index = 1;
    assert!(release_grapple(&mut state.combat).is_none());
    begin_turn(&mut state.table());
    assert_eq!(state.combat.turn.movement_left_ft, 0);
    assert!(option_ids(&state).contains(&ESCAPE.to_string()));
    // The holder moved away: the grapple ends at the goblin's turn.
    state.combat.combatants[0].position = Some(GridPos::new(6, 3));
    assert!(matches!(
        release_grapple(&mut state.combat),
        Some(CombatEvent::ConditionEnd { .. })
    ));
    assert!(!has_condition(&state.combat.combatants[1], GRAPPLED));
}

#[test]
fn a_shove_pushes_one_square_away_or_knocks_prone() {
    let fighters = || {
        vec![
            (hero("player", "fighter", "player"), (2, 2)),
            (goblin("g"), (3, 2)),
        ]
    };
    let state = arena(&ROOM, fighters());
    let ids = option_ids(&state);
    assert!(
        ids.contains(&"shove_prone:g".to_string()) && ids.contains(&"shove_push:g".to_string())
    );
    // A wall right behind: no push.
    let walled = arena(&["#####", "#p..#", "#...#", "#####"], fighters());
    assert!(!option_ids(&walled).contains(&"shove_push:g".to_string()));
    for seed in 0..40 {
        let mut push = arena(&ROOM, fighters());
        let events = perform(
            &mut push.table(),
            "shove_push:g",
            &mut StdRng::seed_from_u64(seed),
        );
        let pushed = matches!(&events[0], CombatEvent::Maneuver { success: true, .. });
        let expected = if pushed { (4, 2) } else { (3, 2) };
        assert_eq!(
            push.combat.combatants[1].position,
            Some(GridPos::new(expected.0, expected.1))
        );
        // Forced movement provokes nothing.
        assert!(
            !events
                .iter()
                .any(|e| matches!(e, CombatEvent::OpportunityAttack { .. }))
        );
        let mut prone = arena(&ROOM, fighters());
        let events = perform(
            &mut prone.table(),
            "shove_prone:g",
            &mut StdRng::seed_from_u64(seed),
        );
        let down = matches!(&events[0], CombatEvent::Maneuver { success: true, .. });
        assert_eq!(down, has_condition(&prone.combat.combatants[1], PRONE));
    }
}

#[test]
fn standing_up_costs_half_the_movement_and_engine_creatures_do_it_themselves() {
    let mut goblin_down = goblin("g");
    add_condition(&mut goblin_down, PRONE, 0);
    let mut state = arena(
        &ROOM,
        vec![
            (goblin_down, (6, 2)),
            (hero("player", "fighter", "player"), (2, 2)),
        ],
    );
    let speed = state.combat.turn.movement_left_ft;
    assert!(option_ids(&state).contains(&STAND_UP.to_string()));
    let events = engine_turn_prelude(&mut state.table(), &mut StdRng::seed_from_u64(1));
    assert!(matches!(&events[0], CombatEvent::Maneuver { maneuver, .. } if maneuver == STAND_UP));
    assert!(!has_condition(&state.combat.combatants[0], PRONE));
    assert_eq!(state.combat.turn.movement_left_ft, speed - speed / 2);
    // Not enough movement left: no standing up.
    add_condition(&mut state.combat.combatants[0], PRONE, 0);
    state.combat.turn.movement_left_ft = 5;
    assert!(!option_ids(&state).contains(&STAND_UP.to_string()));
}

#[test]
fn two_light_weapons_give_an_off_hand_strike_without_the_ability_bonus() {
    let mut state = arena(
        &ROOM,
        vec![
            (hero("finn", "rogue", "player"), (2, 2)),
            (goblin("g"), (3, 2)),
        ],
    );
    let mut rng = StdRng::seed_from_u64(5);
    // Before attacking with a light weapon there is no off-hand strike.
    assert!(
        !option_ids(&state)
            .iter()
            .any(|id| id.starts_with("offhand:"))
    );
    let action =
        parse_player_action(&state.combat, state.map.as_ref(), "attack:shortsword:g").unwrap();
    apply_player_action(&mut state.table(), action, &mut rng);
    if !is_up(&state.combat.combatants[1]) {
        state.combat.combatants[1].hp = 3;
    }
    assert_eq!(
        state.combat.turn.offhand_from.as_deref(),
        Some("shortsword")
    );
    let ids = option_ids(&state);
    assert!(ids.contains(&"offhand:dagger:g".to_string()), "{ids:?}");
    let action =
        parse_player_action(&state.combat, state.map.as_ref(), "offhand:dagger:g").unwrap();
    let (events, _) = apply_player_action(&mut state.table(), action, &mut rng);
    assert!(state.combat.turn.bonus_action_used);
    assert!(matches!(&events[0], CombatEvent::Attack { attack_id, .. } if attack_id == "dagger"));
    if let Some(CombatEvent::Damage { roll, .. }) = events
        .iter()
        .find(|e| matches!(e, CombatEvent::Damage { .. }))
    {
        assert!(
            roll.total <= 4,
            "no DEX bonus on the off-hand damage: {roll:?}"
        );
    }
    // A ranged or heavy weapon opens nothing.
    assert!(
        !is_light_melee("shortbow") && !is_light_melee("longsword") && is_light_melee("dagger")
    );
    // The new turn field stays out of the JSON when empty (older readers).
    let json = serde_json::to_value(TurnBudget::default()).unwrap();
    assert!(json.get("offhand_from").is_none());
}

#[test]
fn a_healing_potion_brings_a_dying_ally_back_and_is_used_up() {
    let mut lyra = hero("lyra", "cleric", "companion");
    lyra.hp = 0;
    add_condition(&mut lyra, UNCONSCIOUS, 0);
    let mut state = arena(
        &ROOM,
        vec![
            (hero("player", "fighter", "player"), (2, 2)),
            (lyra, (3, 2)),
            (goblin("g"), (6, 2)),
        ],
    );
    state.inventory = vec![InventoryItem {
        id: "potion".into(),
        name: "Heiltrank".into(),
        description: String::new(),
        quantity: 2,
        item_type: "consumable".into(),
        hp_restore: 0,
        stress_restore: 0,
        clears_condition: None,
        srd_id: Some("potion_of_healing".into()),
    }];
    let options = item_options(&state.combat, state.map.as_ref(), &state.inventory);
    assert_eq!(
        options.iter().map(|o| o.id.as_str()).collect::<Vec<_>>(),
        vec!["potion:potion:lyra"]
    );
    let action =
        parse_player_action(&state.combat, state.map.as_ref(), "potion:potion:lyra").unwrap();
    let (events, _) =
        apply_player_action(&mut state.table(), action, &mut StdRng::seed_from_u64(2));
    assert!(matches!(&events[0], CombatEvent::Maneuver { maneuver, .. } if maneuver == POTION));
    let lyra = &state.combat.combatants[1];
    assert!(lyra.hp >= 4 && !has_condition(lyra, UNCONSCIOUS));
    assert_eq!(state.inventory[0].quantity, 1);
    // Without the action left, no potion.
    assert!(item_options(&state.combat, state.map.as_ref(), &state.inventory).is_empty());
    // An engine companion gives the last potion to a dying friend on its own.
    state.combat.combatants[0].hp = 0;
    state.combat.current_turn_index = 1;
    begin_turn(&mut state.table());
    let events = engine_turn_prelude(&mut state.table(), &mut StdRng::seed_from_u64(3));
    // A cleric heals with a spell instead, if one is ready.
    if urgent_cast(
        &state.combat,
        state.map.as_ref(),
        &state.combat.combatants[1],
    )
    .is_none()
    {
        assert!(
            events
                .iter()
                .any(|e| matches!(e, CombatEvent::Maneuver { maneuver, .. } if maneuver == POTION))
        );
        assert!(state.inventory.is_empty());
        assert!(matches!(
            engine_plan(&state.combat, state.map.as_ref()),
            EnginePlan::Decided(PlannedTurn::InPlace(TurnDecision::Pass))
        ));
    }
}

#[test]
fn a_readied_strike_hits_the_foe_that_steps_into_reach() {
    let mut state = arena(
        &ROOM,
        vec![
            (hero("player", "fighter", "player"), (2, 2)),
            (goblin("g"), (6, 2)),
        ],
    );
    let mut rng = StdRng::seed_from_u64(7);
    let action = parse_player_action(&state.combat, state.map.as_ref(), READY).unwrap();
    apply_player_action(&mut state.table(), action, &mut rng);
    assert!(has_condition(&state.combat.combatants[0], READIED));
    // The goblin walks up (and is struck as it arrives, even when disengaged).
    let path = [GridPos::new(5, 2), GridPos::new(4, 2), GridPos::new(3, 2)];
    let events = walk(
        &mut state.combat.combatants,
        1,
        &path,
        true,
        &mut state.combat.reactions_used,
        &mut rng,
    );
    let at = events
        .iter()
        .position(
            |e| matches!(e, CombatEvent::Maneuver { maneuver, .. } if maneuver == READIED_ATTACK),
        )
        .expect("the readied strike goes off");
    assert!(matches!(events[at + 1], CombatEvent::Attack { .. }));
    assert!(!has_condition(&state.combat.combatants[0], READIED));
    assert!(state.combat.reactions_used.contains(&"player".to_string()));
}

#[test]
fn the_maneuver_event_keeps_its_json_small() {
    let event = CombatEvent::Maneuver {
        actor_id: "a".into(),
        actor_name: "A".into(),
        maneuver: STAND_UP.into(),
        target_id: None,
        target_name: None,
        total: None,
        against: None,
        success: true,
    };
    assert_eq!(
        serde_json::to_value(&event).unwrap(),
        serde_json::json!({ "type": "maneuver", "actor_id": "a", "actor_name": "A", "maneuver": "stand_up", "success": true })
    );
}
