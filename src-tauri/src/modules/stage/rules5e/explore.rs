//! Exploring a map outside fights: fog of war (what the party has seen, by light radius and
//! line of sight), walking the party as a group, doors and chests, hidden traps, rooms with
//! prepared encounters and exits to other maps. Pure functions on [`BattleMap`]; the scene
//! glue lives in `stage/explore5e.rs`.

use super::*;
use std::collections::VecDeque;

/// What happened while exploring (log in the UI, facts for the game master).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export)]
pub enum ExploreEvent {
    Move {
        actor_name: String,
        feet: u32,
    },
    /// The party enters a room for the first time.
    Room {
        room_id: String,
        name: LocalizedName,
        description: String,
    },
    Door {
        at: GridPos,
        opened: bool,
    },
    Chest {
        at: GridPos,
    },
    Locked {
        at: GridPos,
    },
    Check {
        actor_name: String,
        skill: String,
        roll: D20Roll,
        bonus: i32,
        total: i32,
        dc: i32,
        success: bool,
    },
    TrapSpotted {
        at: GridPos,
        by_name: String,
    },
    Trap {
        at: GridPos,
        target_name: String,
        saved: bool,
        damage: i32,
        down: bool,
    },
    Encounter {
        encounter_id: String,
    },
    MapChange {
        map_id: String,
        name: LocalizedName,
    },
}

/// Light radius in squares: the map's own value, otherwise torchlight underground and
/// daylight outside.
pub fn sight_squares(map: &BattleMap) -> i32 {
    let feet = map
        .light_ft
        .unwrap_or(if map.tileset == "dungeon" { 30 } else { 60 });
    (feet / SQUARE_FT) as i32
}

/// Turns on fog of war (nothing seen yet), unless the map is already being explored.
pub fn start_exploring(map: &mut BattleMap) {
    if map.revealed.len() != map.cells.len() {
        map.revealed = vec![false; map.cells.len()];
    }
}

/// Whether the party has seen a square. Maps without fog show everything.
pub fn is_revealed(map: &BattleMap, pos: GridPos) -> bool {
    map.contains(pos)
        && (map.revealed.is_empty() || map.revealed[(pos.y * map.width + pos.x) as usize])
}

/// Reveals what the viewers see: squares within the light radius and in line of sight
/// (walls and closed doors themselves are seen, not what lies behind them). Returns how
/// many squares were new.
pub fn reveal(map: &mut BattleMap, viewers: &[GridPos]) -> usize {
    if map.revealed.len() != map.cells.len() {
        return 0;
    }
    let radius = sight_squares(map);
    let mut fresh = Vec::new();
    for &viewer in viewers {
        for y in viewer.y - radius..=viewer.y + radius {
            for x in viewer.x - radius..=viewer.x + radius {
                let p = GridPos::new(x, y);
                if !map.contains(p) || is_revealed(map, p) || fresh.contains(&p) {
                    continue;
                }
                if map.line_of_sight(viewer, p) {
                    fresh.push(p);
                }
            }
        }
    }
    for p in &fresh {
        let index = (p.y * map.width + p.x) as usize;
        map.revealed[index] = true;
    }
    fresh.len()
}

pub fn room_at(map: &BattleMap, pos: GridPos) -> Option<&MapRoom> {
    map.rooms.iter().find(|room| room.contains(pos))
}

/// A prepared encounter that starts now: someone of the party stands in its room.
pub fn pending_encounter(map: &BattleMap, party: &[GridPos]) -> Option<MapEncounter> {
    map.encounters
        .iter()
        .filter(|e| !map.triggered.contains(&e.id))
        .find(|e| {
            map.rooms
                .iter()
                .find(|r| r.id == e.room)
                .is_some_and(|room| party.iter().any(|p| room.contains(*p)))
        })
        .cloned()
}

pub fn exit_at(map: &BattleMap, pos: GridPos) -> Option<&MapExit> {
    let zone = map.cell(pos)?.zone.as_deref()?;
    map.exits.iter().find(|exit| exit.zone == zone)
}

fn trap_squares(map: &BattleMap) -> Vec<GridPos> {
    map.traps
        .iter()
        .filter(|t| t.spotted && !t.sprung)
        .map(|t| t.at)
        .collect()
}

/// The way for the leader to `target`, around walls and known traps; others of the party can
/// be passed but not stood on. `None` when it cannot be reached.
pub fn explore_path(
    map: &BattleMap,
    from: GridPos,
    target: GridPos,
    party: &[GridPos],
) -> Option<Vec<GridPos>> {
    let occupancy = Occupancy {
        allies: party.to_vec(),
        enemies: trap_squares(map)
            .into_iter()
            .filter(|t| *t != target)
            .collect(),
    };
    let budget = SQUARE_FT * 2 * (map.width * map.height) as u32;
    let reach = reachable(map, from, budget, &occupancy);
    if target == from {
        return Some(Vec::new());
    }
    reach.can_end(target).then(|| reach.path(target))
}

/// The way to a square next to `target` (a door, a chest), or an empty way when the leader
/// already stands next to it.
pub fn approach_object(
    map: &BattleMap,
    from: GridPos,
    target: GridPos,
    party: &[GridPos],
) -> Option<Vec<GridPos>> {
    // Straight in front of it is better than diagonal (one sees through an opened door), as
    // long as it is not much further.
    let score = |len: usize, at: GridPos| {
        len * 2
            + if at.x != target.x && at.y != target.y {
                3
            } else {
                0
            }
    };
    let mut best: Option<(usize, Vec<GridPos>)> =
        (from.squares_to(target) == 1).then(|| (score(0, from), Vec::new()));
    for y in -1..=1 {
        for x in -1..=1 {
            let next = GridPos::new(target.x + x, target.y + y);
            if next == target || !map.walkable(next) {
                continue;
            }
            if let Some(path) = explore_path(map, from, next, party) {
                let value = score(path.len(), next);
                if best.as_ref().is_none_or(|(b, _)| value < *b) {
                    best = Some((value, path));
                }
            }
        }
    }
    best.map(|(_, path)| path)
}

/// Free squares closest to the leader (by walking, not through walls), for the rest of the
/// party to stand on.
pub fn follow_squares(map: &BattleMap, leader: GridPos, count: usize) -> Vec<GridPos> {
    let traps = trap_squares(map);
    let mut seen = vec![leader];
    let mut queue = VecDeque::from([leader]);
    let mut spots = Vec::new();
    while let Some(pos) = queue.pop_front() {
        if spots.len() >= count {
            break;
        }
        for y in -1..=1 {
            for x in -1..=1 {
                let next = GridPos::new(pos.x + x, pos.y + y);
                if seen.contains(&next) || !map.walkable(next) || traps.contains(&next) {
                    continue;
                }
                seen.push(next);
                queue.push_back(next);
                if spots.len() < count {
                    spots.push(next);
                }
            }
        }
    }
    spots
}

/// What can be done with an object on a square.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Interaction {
    OpenDoor,
    CloseDoor,
    LockedDoor,
    OpenChest,
    LockedChest,
}

pub fn interaction_at(map: &BattleMap, pos: GridPos) -> Option<Interaction> {
    let locked = map.locks.iter().any(|l| l.at == pos);
    match map.cell(pos)?.object.as_deref()? {
        "door_locked" => Some(Interaction::LockedDoor),
        "door_closed" if locked => Some(Interaction::LockedDoor),
        "door_closed" => Some(Interaction::OpenDoor),
        "door_open" => Some(Interaction::CloseDoor),
        "chest_closed" if locked => Some(Interaction::LockedChest),
        "chest_closed" => Some(Interaction::OpenChest),
        _ => None,
    }
}

pub fn lock_dc(map: &BattleMap, pos: GridPos) -> Option<i32> {
    map.locks.iter().find(|l| l.at == pos).map(|l| l.dc)
}

/// Opens a lock (picked or forced): the door becomes a closed, unlocked door.
pub fn unlock(map: &mut BattleMap, pos: GridPos) {
    map.locks.retain(|l| l.at != pos);
    if let Some(cell) = map.cell_mut(pos)
        && cell.object.as_deref() == Some("door_locked")
    {
        cell.object = Some("door_closed".to_string());
    }
}

pub fn set_object(map: &mut BattleMap, pos: GridPos, object: &str) {
    if let Some(cell) = map.cell_mut(pos) {
        cell.object = Some(object.to_string());
    }
}

/// Traps someone notices with their passive Perception: in sight and light, not found yet.
/// Found traps show as `trap_plate`. Returns each find with the finder's name.
pub fn spot_traps(
    map: &mut BattleMap,
    viewers: &[(GridPos, i32, String)],
) -> Vec<(GridPos, String)> {
    let radius = sight_squares(map) as u32;
    let mut found = Vec::new();
    for index in 0..map.traps.len() {
        let trap = map.traps[index].clone();
        if trap.spotted || trap.sprung {
            continue;
        }
        let finder = viewers.iter().find(|(pos, passive, _)| {
            *passive >= trap.spot_dc
                && pos.squares_to(trap.at) <= radius
                && map.line_of_sight(*pos, trap.at)
        });
        if let Some((_, _, name)) = finder {
            map.traps[index].spotted = true;
            set_object(map, trap.at, "trap_plate");
            found.push((trap.at, name.clone()));
        }
    }
    found
}

/// A trap nobody found that springs when stepped on.
pub fn hidden_trap_at(map: &BattleMap, pos: GridPos) -> Option<usize> {
    map.traps
        .iter()
        .position(|t| t.at == pos && !t.spotted && !t.sprung)
}
