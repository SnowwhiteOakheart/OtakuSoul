//! The battle map: a grid of 5-ft squares from a JSON file (rows of characters plus a legend),
//! movement with difficult terrain, line of sight and attack ranges. Diagonals cost 5 ft like
//! orthogonal steps (SRD default); corners of walls cannot be cut.

use super::*;
use std::collections::{BinaryHeap, HashMap};

/// Feet per square.
pub const SQUARE_FT: u32 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GridPos {
    pub x: i32,
    pub y: i32,
}

impl GridPos {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    /// Squares between two positions (diagonals count as one).
    pub fn squares_to(self, other: GridPos) -> u32 {
        (self.x - other.x)
            .unsigned_abs()
            .max((self.y - other.y).unsigned_abs())
    }

    pub fn feet_to(self, other: GridPos) -> u32 {
        self.squares_to(other) * SQUARE_FT
    }
}

/// What a square does for movement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum CellKind {
    Floor,
    Difficult,
    Wall,
    Pit,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapCell {
    /// Ground tile (`floor_stone`, `grass`, `wall_stone` …); the UI picks a variant.
    pub ground: String,
    pub kind: CellKind,
    /// Object tile on top (`door_closed`, `tree`, `rubble` …).
    #[serde(default)]
    #[ts(optional)]
    pub object: Option<String>,
    /// Placement zone (`party`, `spawn`, …).
    #[serde(default)]
    #[ts(optional)]
    pub zone: Option<String>,
}

/// Objects that block movement (and those that also block sight). A closed door is opened in
/// passing (free object interaction); locked ones stay shut.
const BLOCKING_OBJECTS: &[&str] = &[
    "door_locked",
    "pillar",
    "chest_closed",
    "chest_open",
    "altar",
    "altar_dark",
    "sarcophagus",
    "brazier",
    "tree",
    "tree_pine",
    "rock",
    "wagon_left",
    "wagon_right",
    "crates",
    "campfire",
];
const SIGHT_BLOCKING_OBJECTS: &[&str] = &[
    "door_closed",
    "door_locked",
    "pillar",
    "tree",
    "tree_pine",
    "wagon_left",
    "wagon_right",
];
const DIFFICULT_OBJECTS: &[&str] = &["rubble", "bush", "log"];

impl MapCell {
    pub fn blocks_movement(&self) -> bool {
        matches!(self.kind, CellKind::Wall | CellKind::Pit)
            || self
                .object
                .as_deref()
                .is_some_and(|o| BLOCKING_OBJECTS.contains(&o))
    }

    pub fn blocks_sight(&self) -> bool {
        self.kind == CellKind::Wall
            || self
                .object
                .as_deref()
                .is_some_and(|o| SIGHT_BLOCKING_OBJECTS.contains(&o))
    }

    pub fn is_difficult(&self) -> bool {
        self.kind == CellKind::Difficult
            || self
                .object
                .as_deref()
                .is_some_and(|o| DIFFICULT_OBJECTS.contains(&o))
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BattleMap {
    pub id: String,
    pub name: LocalizedName,
    /// Tile set folder (`dungeon`, `forest`).
    pub tileset: String,
    pub width: i32,
    pub height: i32,
    /// Row by row, `width × height` cells.
    pub cells: Vec<MapCell>,
    /// Rooms with a description for the game master (exploration).
    #[serde(default)]
    pub rooms: Vec<MapRoom>,
    /// Prepared encounters: entering their room starts the fight.
    #[serde(default)]
    pub encounters: Vec<MapEncounter>,
    /// Squares of a zone that lead to another map.
    #[serde(default)]
    pub exits: Vec<MapExit>,
    /// Hidden traps; found ones get the `trap_plate` object.
    #[serde(default)]
    pub traps: Vec<MapTrap>,
    /// Locked doors and chests.
    #[serde(default)]
    pub locks: Vec<MapLock>,
    /// How far the party sees (light); default by tile set.
    #[serde(default)]
    #[ts(optional)]
    pub light_ft: Option<u32>,
    /// Fog of war: squares the party has seen. Empty = everything visible (fights without
    /// exploration).
    #[serde(default)]
    pub revealed: Vec<bool>,
    /// Encounters that already happened.
    #[serde(default)]
    pub triggered: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapRoom {
    pub id: String,
    pub name: LocalizedName,
    /// Inclusive rectangle `[x0, y0, x1, y1]`.
    pub area: [i32; 4],
    /// For the game master (English); the narrator retells it.
    pub description: String,
}

impl MapRoom {
    pub fn contains(&self, pos: GridPos) -> bool {
        let [x0, y0, x1, y1] = self.area;
        (x0..=x1).contains(&pos.x) && (y0..=y1).contains(&pos.y)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EncounterMonster {
    pub monster: String,
    #[serde(default = "one")]
    pub count: u32,
}

fn one() -> u32 {
    1
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapEncounter {
    pub id: String,
    pub room: String,
    pub monsters: Vec<EncounterMonster>,
    /// Placement zone of the monsters.
    #[serde(default = "spawn_zone")]
    pub zone: String,
}

fn spawn_zone() -> String {
    "spawn".to_string()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapExit {
    pub zone: String,
    /// Map id it leads to.
    pub to: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapTrap {
    pub at: GridPos,
    /// Passive Perception needed to notice it.
    pub spot_dc: i32,
    /// Dexterity save against it.
    pub save_dc: i32,
    pub damage: String,
    pub damage_type: String,
    #[serde(default)]
    pub spotted: bool,
    #[serde(default)]
    pub sprung: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MapLock {
    pub at: GridPos,
    pub dc: i32,
    /// Someone tried it: the party knows it is locked.
    #[serde(default)]
    pub known: bool,
}

/// A map as written by hand: rows of characters and what each character means.
#[derive(Debug, Default, Deserialize)]
pub struct MapFile {
    pub id: String,
    pub name: LocalizedName,
    pub tileset: String,
    pub rows: Vec<String>,
    pub legend: HashMap<String, MapCell>,
    #[serde(default)]
    pub rooms: Vec<MapRoom>,
    #[serde(default)]
    pub encounters: Vec<MapEncounter>,
    #[serde(default)]
    pub exits: Vec<MapExit>,
    #[serde(default)]
    pub traps: Vec<MapTrap>,
    #[serde(default)]
    pub locks: Vec<MapLock>,
    #[serde(default)]
    pub light_ft: Option<u32>,
}

impl MapFile {
    /// Checks the rows (rectangle, known characters, a party zone) and builds the map.
    pub fn build(self) -> Result<BattleMap, String> {
        let width = self.rows.first().map_or(0, |r| r.chars().count());
        if width == 0 || self.rows.iter().any(|r| r.chars().count() != width) {
            return Err(format!("map {}: rows must form a rectangle", self.id));
        }
        let mut cells = Vec::with_capacity(width * self.rows.len());
        for (y, row) in self.rows.iter().enumerate() {
            for (x, ch) in row.chars().enumerate() {
                let cell = self.legend.get(&ch.to_string()).ok_or_else(|| {
                    format!("map {}: unknown character '{ch}' at {x},{y}", self.id)
                })?;
                cells.push(cell.clone());
            }
        }
        let map = BattleMap {
            id: self.id,
            name: self.name,
            tileset: self.tileset,
            width: width as i32,
            height: self.rows.len() as i32,
            cells,
            rooms: self.rooms,
            encounters: self.encounters,
            exits: self.exits,
            traps: self.traps,
            locks: self.locks,
            light_ft: self.light_ft,
            revealed: Vec::new(),
            triggered: Vec::new(),
        };
        if map.zone_cells("party").is_empty() {
            return Err(format!("map {}: no party start zone", map.id));
        }
        for encounter in &map.encounters {
            if !map.rooms.iter().any(|r| r.id == encounter.room) {
                return Err(format!(
                    "map {}: encounter {} in unknown room",
                    map.id, encounter.id
                ));
            }
            if map.zone_cells(&encounter.zone).is_empty() {
                return Err(format!(
                    "map {}: encounter {} without zone",
                    map.id, encounter.id
                ));
            }
        }
        for exit in &map.exits {
            if map.zone_cells(&exit.zone).is_empty() {
                return Err(format!(
                    "map {}: exit zone {} has no squares",
                    map.id, exit.zone
                ));
            }
        }
        for at in map
            .traps
            .iter()
            .map(|t| t.at)
            .chain(map.locks.iter().map(|l| l.at))
        {
            if !map.contains(at) {
                return Err(format!("map {}: trap or lock outside the map", map.id));
            }
        }
        Ok(map)
    }
}

impl BattleMap {
    pub fn contains(&self, pos: GridPos) -> bool {
        pos.x >= 0 && pos.y >= 0 && pos.x < self.width && pos.y < self.height
    }

    pub fn cell(&self, pos: GridPos) -> Option<&MapCell> {
        self.contains(pos)
            .then(|| &self.cells[(pos.y * self.width + pos.x) as usize])
    }

    pub fn cell_mut(&mut self, pos: GridPos) -> Option<&mut MapCell> {
        if !self.contains(pos) {
            return None;
        }
        let index = (pos.y * self.width + pos.x) as usize;
        Some(&mut self.cells[index])
    }

    pub fn walkable(&self, pos: GridPos) -> bool {
        self.cell(pos).is_some_and(|c| !c.blocks_movement())
            && !self.locks.iter().any(|lock| lock.at == pos)
    }

    /// Opens closed doors on the squares walked; returns the doors opened.
    pub fn open_doors_on(&mut self, path: &[GridPos]) -> Vec<GridPos> {
        let mut opened = Vec::new();
        for &pos in path {
            if let Some(cell) = self.cell_mut(pos)
                && cell.object.as_deref() == Some("door_closed")
            {
                cell.object = Some("door_open".to_string());
                opened.push(pos);
            }
        }
        opened
    }

    /// Squares of a placement zone, in reading order.
    pub fn zone_cells(&self, zone: &str) -> Vec<GridPos> {
        (0..self.height)
            .flat_map(|y| (0..self.width).map(move |x| GridPos::new(x, y)))
            .filter(|&p| self.cell(p).and_then(|c| c.zone.as_deref()) == Some(zone))
            .collect()
    }

    /// Clear line of sight between the centres of two squares: no wall, closed door, pillar
    /// or tree on a square in between (the end squares themselves do not count).
    pub fn line_of_sight(&self, from: GridPos, to: GridPos) -> bool {
        let (dx, dy) = ((to.x - from.x) as f64, (to.y - from.y) as f64);
        let steps = (dx.abs().max(dy.abs()) * 4.0).ceil() as i32;
        for step in 1..steps {
            let t = f64::from(step) / f64::from(steps);
            let point = GridPos::new(
                (f64::from(from.x) + 0.5 + dx * t).floor() as i32,
                (f64::from(from.y) + 0.5 + dy * t).floor() as i32,
            );
            if point == from || point == to {
                continue;
            }
            if self.cell(point).is_none_or(MapCell::blocks_sight) {
                return false;
            }
        }
        true
    }

    /// The nearest free walkable squares around a zone, for placing combatants.
    pub fn placements(&self, zone: &str, count: usize, taken: &[GridPos]) -> Vec<GridPos> {
        let mut free: Vec<GridPos> = self
            .zone_cells(zone)
            .into_iter()
            .filter(|p| self.walkable(*p) && !taken.contains(p))
            .collect();
        // Not enough room in the zone: spread to walkable squares around it.
        let mut ring = 1;
        while free.len() < count && ring < self.width.max(self.height) {
            let seeds = self.zone_cells(zone);
            for seed in &seeds {
                for y in -ring..=ring {
                    for x in -ring..=ring {
                        let p = GridPos::new(seed.x + x, seed.y + y);
                        if self.walkable(p) && !taken.contains(&p) && !free.contains(&p) {
                            free.push(p);
                        }
                    }
                }
            }
            ring += 1;
        }
        free.truncate(count);
        free
    }
}

/// Who stands where, for movement: allies can be passed, enemies not; nobody ends on an
/// occupied square.
#[derive(Debug, Clone, Default)]
pub struct Occupancy {
    pub allies: Vec<GridPos>,
    pub enemies: Vec<GridPos>,
}

const NEIGHBOURS: [(i32, i32); 8] = [
    (-1, -1),
    (0, -1),
    (1, -1),
    (-1, 0),
    (1, 0),
    (-1, 1),
    (0, 1),
    (1, 1),
];

/// Movement options from one square: every square reached with its cost and the step that
/// led there; allies' squares can be crossed but not ended on.
#[derive(Debug, Clone)]
pub struct Reach {
    steps: HashMap<GridPos, (u32, GridPos)>,
    start: GridPos,
    allies: Vec<GridPos>,
}

impl Reach {
    /// A square the mover may stop on (the start counts, with cost 0).
    pub fn can_end(&self, pos: GridPos) -> bool {
        self.steps.contains_key(&pos) && (pos == self.start || !self.allies.contains(&pos))
    }

    pub fn cost(&self, pos: GridPos) -> Option<u32> {
        self.can_end(pos).then(|| self.steps[&pos].0)
    }

    /// All squares the mover may stop on, with their cost.
    pub fn ends(&self) -> Vec<(GridPos, u32)> {
        let mut ends: Vec<_> = self
            .steps
            .iter()
            .filter(|(pos, _)| self.can_end(**pos))
            .map(|(pos, (cost, _))| (*pos, *cost))
            .collect();
        ends.sort();
        ends
    }

    /// The squares walked from the start to `target` (start excluded).
    pub fn path(&self, target: GridPos) -> Vec<GridPos> {
        let mut path = Vec::new();
        let mut current = target;
        while current != self.start {
            let Some((_, previous)) = self.steps.get(&current) else {
                return Vec::new();
            };
            path.push(current);
            current = *previous;
        }
        path.reverse();
        path
    }
}

/// Squares reachable with `budget_ft` of movement. Entering difficult terrain costs double;
/// enemies' squares cannot be entered; diagonal steps may not cut past a blocked orthogonal
/// square.
pub fn reachable(map: &BattleMap, start: GridPos, budget_ft: u32, occupancy: &Occupancy) -> Reach {
    let mut steps: HashMap<GridPos, (u32, GridPos)> = HashMap::from([(start, (0, start))]);
    let mut queue = BinaryHeap::from([std::cmp::Reverse((0u32, start))]);
    while let Some(std::cmp::Reverse((cost, pos))) = queue.pop() {
        if steps.get(&pos).is_some_and(|(c, _)| *c < cost) {
            continue;
        }
        for (dx, dy) in NEIGHBOURS {
            let next = GridPos::new(pos.x + dx, pos.y + dy);
            let Some(cell) = map.cell(next) else { continue };
            if !map.walkable(next) || occupancy.enemies.contains(&next) {
                continue;
            }
            if dx != 0
                && dy != 0
                && (!map.walkable(GridPos::new(pos.x + dx, pos.y))
                    || !map.walkable(GridPos::new(pos.x, pos.y + dy)))
            {
                continue;
            }
            let step = if cell.is_difficult() {
                SQUARE_FT * 2
            } else {
                SQUARE_FT
            };
            let total = cost + step;
            if total > budget_ft || steps.get(&next).is_some_and(|(c, _)| *c <= total) {
                continue;
            }
            steps.insert(next, (total, pos));
            queue.push(std::cmp::Reverse((total, next)));
        }
    }
    Reach {
        steps,
        start,
        allies: occupancy.allies.clone(),
    }
}

/// Whether an attack can reach and how: `None` when out of range or sight, otherwise the
/// roll mode the distance forces (long range: disadvantage).
pub fn attack_reach(
    map: &BattleMap,
    attack: &Attack,
    from: GridPos,
    to: GridPos,
) -> Option<RollMode> {
    let distance = from.feet_to(to);
    match attack.kind {
        AttackKind::Melee => (distance <= SQUARE_FT).then_some(RollMode::Normal),
        AttackKind::Ranged | AttackKind::Spell => {
            let long = attack.long_range_ft.max(attack.range_ft);
            if distance > long || !map.line_of_sight(from, to) {
                None
            } else if distance > attack.range_ft {
                Some(RollMode::Disadvantage)
            } else {
                Some(RollMode::Normal)
            }
        }
    }
}
