use super::*;
use crate::modules::stage::{Combatant, EncounterState};
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
    assert_eq!(monsters().len(), 10);
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
    let events = apply_damage(
        &mut skeleton,
        roll.clone(),
        "bludgeoning",
        DamageScaling::Vulnerable,
    );
    assert!(matches!(events[0], CombatEvent::Damage { amount: 8, .. }));
    assert_eq!(skeleton.hp, 5);
    let events = apply_damage(&mut skeleton, roll, "slashing", DamageScaling::Normal);
    assert_eq!(skeleton.hp, 1);
    assert_eq!(events.len(), 1);
    let big = DamageRoll {
        rolls: vec![9],
        modifier: 0,
        total: 9,
    };
    let events = apply_damage(&mut skeleton, big, "slashing", DamageScaling::Normal);
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
    };
    let event = roll_initiative(&mut encounter.combatants, &mut StdRng::seed_from_u64(3));
    let CombatEvent::Initiative { order } = event else {
        panic!()
    };
    assert_eq!(order.len(), 3);
    assert!(order.windows(2).all(|pair| pair[0].total >= pair[1].total));
    // Someone down is skipped; wrapping starts a new round.
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
            TurnDecision::Dodge | TurnDecision::Pass => {}
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
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v))
        .collect(),
    }
    .build()
    .unwrap()
}

#[test]
fn bundled_maps_build_and_have_spawn_zones() {
    assert_eq!(battle_maps().len(), 2);
    for map in battle_maps() {
        assert!(
            !map.zone_cells("party").is_empty() && !map.zone_cells("spawn").is_empty(),
            "{}",
            map.id
        );
        assert_eq!(map.cells.len() as i32, map.width * map.height);
        assert!(!map.name.de.is_empty() && !map.name.ru.is_empty());
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
    let plan = monster_board_plan(&map, &zombie, &fight, 20);
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
    let plan = monster_board_plan(&map, &orc, &[thorin.clone(), orc.clone()], 30);
    assert!(
        matches!(plan.action, TurnDecision::Attack { ref attack_id, .. } if attack_id == "greataxe")
    );
    assert_eq!(
        plan.move_to.map(|p| p.squares_to(GridPos::new(1, 1))),
        Some(1)
    );
    let archer = at(goblin("g"), 4, 1);
    let plan = monster_board_plan(&map, &archer, &[thorin.clone(), archer.clone()], 30);
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
    let plan = monster_board_plan(&map, &slinger, &[thorin.clone(), slinger.clone()], 30);
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
    let options = actions_in_place(&map, &lyra, &[lyra.clone(), near.clone(), far.clone()]);
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
    };
    roll_initiative(&mut encounter.combatants, &mut rng);
    let mut turns = 0;
    while combat_outcome(&encounter.combatants).is_none() && turns < 300 {
        let index = encounter.current_turn_index;
        let actor = encounter.combatants[index].clone();
        let plan = if is_enemy(&actor) {
            monster_board_plan(&map, &actor, &encounter.combatants, 30)
        } else {
            hero_board_plan(&map, &actor, &encounter.combatants, 30)
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
