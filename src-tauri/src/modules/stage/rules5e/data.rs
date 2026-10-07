//! SRD 5.1 data (monsters, class templates) bundled from `presets/srd5/` and turned into
//! [`Stats5e`]. Hit points follow the SRD averages so encounters are predictable.

use super::*;
use std::sync::LazyLock;

const MONSTERS_JSON: &str = include_str!("../../../../../presets/srd5/monsters.json");
const CLASSES_JSON: &str = include_str!("../../../../../presets/srd5/classes.json");
/// Battle maps (`presets/srd5/maps/*.json`); new maps are added here.
const MAP_JSONS: [&str; 2] = [
    include_str!("../../../../../presets/srd5/maps/crypt_hall.json"),
    include_str!("../../../../../presets/srd5/maps/forest_road.json"),
];

#[derive(Debug, Clone, Deserialize)]
pub struct MonsterData {
    pub id: String,
    pub name: LocalizedName,
    pub cr: f32,
    pub armor_class: i32,
    pub hit_dice: String,
    pub speed_ft: u32,
    pub abilities: [u8; 6],
    pub attacks: Vec<Attack>,
    #[serde(default)]
    pub traits: Vec<String>,
    #[serde(default)]
    pub vulnerabilities: Vec<String>,
    #[serde(default)]
    pub resistances: Vec<String>,
    #[serde(default)]
    pub immunities: Vec<String>,
    #[serde(default)]
    pub undead: bool,
    #[serde(default)]
    pub never_flees: bool,
}

/// How a class attack gets its numbers.
#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AttackAbility {
    Str,
    Dex,
    Int,
    Wis,
    Cha,
    /// The better of STR and DEX.
    Finesse,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClassAttackData {
    pub id: String,
    pub name: LocalizedName,
    pub kind: AttackKind,
    pub ability: AttackAbility,
    /// Damage dice without modifier, e.g. `1d8`.
    pub damage: String,
    /// Cantrips like Fire Bolt add no modifier to their damage.
    #[serde(default = "yes")]
    pub add_modifier: bool,
    pub damage_type: String,
    #[serde(default)]
    pub range_ft: u32,
    #[serde(default)]
    pub long_range_ft: u32,
}

fn yes() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClassData {
    pub id: String,
    pub name: LocalizedName,
    pub hit_die: u32,
    pub abilities: [u8; 6],
    pub armor_class: i32,
    pub speed_ft: u32,
    pub saves: Vec<Ability>,
    pub skills: Vec<String>,
    pub attacks: Vec<ClassAttackData>,
}

#[derive(Deserialize)]
struct MonsterFile {
    monsters: Vec<MonsterData>,
}

#[derive(Deserialize)]
struct ClassFile {
    classes: Vec<ClassData>,
}

static MONSTERS: LazyLock<Vec<MonsterData>> = LazyLock::new(|| {
    serde_json::from_str::<MonsterFile>(MONSTERS_JSON)
        .expect("presets/srd5/monsters.json is valid (checked by tests)")
        .monsters
});

static CLASSES: LazyLock<Vec<ClassData>> = LazyLock::new(|| {
    serde_json::from_str::<ClassFile>(CLASSES_JSON)
        .expect("presets/srd5/classes.json is valid (checked by tests)")
        .classes
});

static MAPS: LazyLock<Vec<BattleMap>> = LazyLock::new(|| {
    MAP_JSONS
        .iter()
        .map(|json| {
            serde_json::from_str::<MapFile>(json)
                .map_err(|e| e.to_string())
                .and_then(MapFile::build)
                .expect("bundled maps are valid (checked by tests)")
        })
        .collect()
});

pub fn battle_maps() -> &'static [BattleMap] {
    &MAPS
}

pub fn battle_map(id: &str) -> Option<&'static BattleMap> {
    MAPS.iter().find(|map| map.id == id)
}

pub fn monsters() -> &'static [MonsterData] {
    &MONSTERS
}

pub fn classes() -> &'static [ClassData] {
    &CLASSES
}

pub fn monster(id: &str) -> Option<&'static MonsterData> {
    let id = id.trim().to_lowercase().replace([' ', '-'], "_");
    MONSTERS.iter().find(|monster| monster.id == id)
}

pub fn class(id: &str) -> Option<&'static ClassData> {
    CLASSES.iter().find(|class| class.id == id)
}

/// Stats and (average) hit points of an SRD monster.
pub fn monster_stats(data: &MonsterData) -> (Stats5e, i32) {
    let hit_dice = DiceFormula::parse(&data.hit_dice).unwrap_or(DiceFormula {
        count: 1,
        sides: 8,
        modifier: 0,
    });
    let stats = Stats5e {
        level: 1,
        class_id: String::new(),
        monster_id: data.id.clone(),
        abilities: data.abilities,
        armor_class: data.armor_class,
        speed_ft: data.speed_ft,
        save_proficiencies: Vec::new(),
        skill_proficiencies: Vec::new(),
        attacks: data.attacks.clone(),
        hit_die: hit_dice.sides,
        hit_dice_left: hit_dice.count,
        vulnerabilities: data.vulnerabilities.clone(),
        resistances: data.resistances.clone(),
        immunities: data.immunities.clone(),
        never_flees: data.never_flees,
    };
    (stats, hit_dice.average().max(1))
}

/// Stats and hit points of a level-1 hero built from a class template: attack bonus is
/// proficiency + ability modifier, damage adds the modifier (unless the attack says not to),
/// hit points are the hit die maximum + CON modifier.
pub fn hero_stats(data: &ClassData) -> (Stats5e, i32) {
    let level = 1;
    let modifier = |ability: Ability| ability_modifier(data.abilities[ability.index()]);
    let attacks = data
        .attacks
        .iter()
        .map(|attack| {
            let ability_mod = match attack.ability {
                AttackAbility::Str => modifier(Ability::Str),
                AttackAbility::Dex => modifier(Ability::Dex),
                AttackAbility::Int => modifier(Ability::Int),
                AttackAbility::Wis => modifier(Ability::Wis),
                AttackAbility::Cha => modifier(Ability::Cha),
                AttackAbility::Finesse => modifier(Ability::Str).max(modifier(Ability::Dex)),
            };
            let damage_mod = if attack.add_modifier { ability_mod } else { 0 };
            let damage = match damage_mod {
                0 => attack.damage.clone(),
                m if m > 0 => format!("{}+{m}", attack.damage),
                m => format!("{}{m}", attack.damage),
            };
            Attack {
                id: attack.id.clone(),
                name: attack.name.clone(),
                kind: attack.kind,
                to_hit: proficiency_bonus(level) + ability_mod,
                damage,
                damage_type: attack.damage_type.clone(),
                range_ft: attack.range_ft,
                long_range_ft: attack.long_range_ft,
            }
        })
        .collect();
    let stats = Stats5e {
        level,
        class_id: data.id.clone(),
        monster_id: String::new(),
        abilities: data.abilities,
        armor_class: data.armor_class,
        speed_ft: data.speed_ft,
        save_proficiencies: data.saves.clone(),
        skill_proficiencies: data.skills.clone(),
        attacks,
        hit_die: data.hit_die,
        hit_dice_left: level,
        vulnerabilities: Vec::new(),
        resistances: Vec::new(),
        immunities: Vec::new(),
        never_flees: true,
    };
    let max_hp = (data.hit_die as i32 + modifier(Ability::Con)).max(1);
    (stats, max_hp)
}
