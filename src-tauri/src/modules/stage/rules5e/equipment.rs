//! Equipment from the SRD 5.1 (`presets/srd5/equipment.json`): armor sets the armor class,
//! weapons give the attacks, a class's proficiencies decide what fits. Heroes keep the ids
//! of what they wear in `Stats5e::equipped`; armor class and weapon attacks are recomputed
//! from them, other attacks of the class template (Fire Bolt …) stay.

use super::*;
use std::sync::LazyLock;

const EQUIPMENT_JSON: &str = include_str!("../../../../../presets/srd5/equipment.json");
/// Weapons a hero carries ready at most.
pub const MAX_WEAPONS: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum ItemKind {
    Armor,
    Shield,
    Weapon,
    Potion,
    Treasure,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ArmorData {
    /// `light`, `medium` or `heavy`.
    pub category: String,
    pub base: i32,
    /// Most DEX that counts (medium 2, heavy 0); none = all.
    #[serde(default)]
    #[ts(optional)]
    pub dex_max: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct WeaponData {
    /// `simple` or `martial`.
    pub category: String,
    pub damage: String,
    pub damage_type: String,
    #[serde(default)]
    pub finesse: bool,
    #[serde(default)]
    pub ranged: bool,
    #[serde(default)]
    pub thrown: bool,
    /// Used as a thrown weapon only (javelin): one ranged attack under the weapon's id.
    #[serde(default)]
    pub thrown_only: bool,
    #[serde(default)]
    pub two_handed: bool,
    #[serde(default)]
    pub range_ft: u32,
    #[serde(default)]
    pub long_range_ft: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ItemData {
    pub id: String,
    pub name: LocalizedName,
    pub kind: ItemKind,
    #[serde(default)]
    #[ts(optional)]
    pub armor: Option<ArmorData>,
    #[serde(default)]
    #[ts(optional)]
    pub weapon: Option<WeaponData>,
    /// Healing of a potion, e.g. `2d4+2`.
    #[serde(default)]
    #[ts(optional)]
    pub heal: Option<String>,
    #[serde(default)]
    pub value_gp: f32,
}

/// What a class may wear and wield.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct ClassProficiencies {
    #[serde(default)]
    pub armor: Vec<String>,
    #[serde(default)]
    pub shield: bool,
    /// `simple`, `martial` or single weapon ids.
    #[serde(default)]
    pub weapons: Vec<String>,
}

#[derive(Deserialize)]
struct EquipmentFile {
    items: Vec<ItemData>,
}

static ITEMS: LazyLock<Vec<ItemData>> = LazyLock::new(|| {
    serde_json::from_str::<EquipmentFile>(EQUIPMENT_JSON)
        .expect("presets/srd5/equipment.json is valid (checked by tests)")
        .items
});

pub fn items() -> &'static [ItemData] {
    &ITEMS
}

pub fn item(id: &str) -> Option<&'static ItemData> {
    ITEMS.iter().find(|item| item.id == id)
}

fn proficiencies(stats: &Stats5e) -> ClassProficiencies {
    class(&stats.class_id)
        .map(|c| c.proficiencies.clone())
        .unwrap_or_default()
}

fn proficient_with(stats: &Stats5e, item: &ItemData) -> bool {
    let prof = proficiencies(stats);
    match (&item.armor, &item.weapon, item.kind) {
        (Some(armor), _, _) => prof.armor.contains(&armor.category),
        (_, _, ItemKind::Shield) => prof.shield,
        (_, Some(weapon), _) => prof
            .weapons
            .iter()
            .any(|w| *w == weapon.category || *w == item.id),
        _ => false,
    }
}

/// Armor class from what is worn: armor + DEX (capped), otherwise 10 + DEX; a shield adds 2.
pub fn worn_armor_class(stats: &Stats5e) -> i32 {
    let dex = stats.modifier(Ability::Dex);
    let worn = |kind: ItemKind| {
        stats
            .equipped
            .iter()
            .filter_map(|id| item(id))
            .find(|i| i.kind == kind)
    };
    let body = match worn(ItemKind::Armor).and_then(|i| i.armor.as_ref()) {
        Some(armor) => armor.base + armor.dex_max.map_or(dex, |max| dex.min(max)),
        None => 10 + dex,
    };
    body + if worn(ItemKind::Shield).is_some() {
        2
    } else {
        0
    }
}

/// The attack a weapon gives (melee and, for thrown weapons, a throw). STR for melee, DEX for
/// ranged, the better one with finesse; proficiency only with a proficient weapon.
pub fn weapon_attacks(stats: &Stats5e, item: &ItemData) -> Vec<Attack> {
    let Some(weapon) = &item.weapon else {
        return Vec::new();
    };
    let str_mod = stats.modifier(Ability::Str);
    let dex_mod = stats.modifier(Ability::Dex);
    let ability = if weapon.finesse {
        str_mod.max(dex_mod)
    } else if weapon.ranged {
        dex_mod
    } else {
        str_mod
    };
    let to_hit = ability
        + if proficient_with(stats, item) {
            stats.proficiency()
        } else {
            0
        };
    let damage = match ability {
        0 => weapon.damage.clone(),
        m if m > 0 => format!("{}+{m}", weapon.damage),
        m => format!("{}{m}", weapon.damage),
    };
    let attack =
        |id: String, name: LocalizedName, kind: AttackKind, range_ft: u32, long_range_ft: u32| {
            Attack {
                id,
                name,
                kind,
                to_hit,
                damage: damage.clone(),
                damage_type: weapon.damage_type.clone(),
                range_ft,
                long_range_ft,
            }
        };
    if weapon.ranged || weapon.thrown_only {
        return vec![attack(
            item.id.clone(),
            item.name.clone(),
            AttackKind::Ranged,
            weapon.range_ft,
            weapon.long_range_ft,
        )];
    }
    let mut attacks = vec![attack(
        item.id.clone(),
        item.name.clone(),
        AttackKind::Melee,
        0,
        0,
    )];
    if weapon.thrown {
        let thrown = |text: &str, suffix: &str| format!("{text} ({suffix})");
        attacks.push(attack(
            format!("{}_thrown", item.id),
            LocalizedName {
                de: thrown(&item.name.de, "geworfen"),
                en: thrown(&item.name.en, "thrown"),
                ru: thrown(&item.name.ru, "бросок"),
            },
            AttackKind::Ranged,
            weapon.range_ft,
            weapon.long_range_ft,
        ));
    }
    attacks
}

/// Recomputes a hero's armor class and weapon attacks from what they wear; attacks that are
/// no weapon (spells of the class template) stay.
pub fn recompute_gear(stats: &mut Stats5e) {
    if stats.class_id.is_empty() {
        return;
    }
    stats.armor_class = worn_armor_class(stats);
    let is_weapon_attack = |id: &str| {
        let base = id.strip_suffix("_thrown").unwrap_or(id);
        item(base).is_some_and(|i| i.kind == ItemKind::Weapon)
    };
    let others: Vec<Attack> = stats
        .attacks
        .iter()
        .filter(|a| !is_weapon_attack(&a.id))
        .cloned()
        .collect();
    // Weapons first, in the order they were taken up; then the class's other attacks.
    let mut attacks: Vec<Attack> = stats
        .equipped
        .iter()
        .filter_map(|id| item(id))
        .filter(|i| i.kind == ItemKind::Weapon)
        .flat_map(|weapon| weapon_attacks(stats, weapon))
        .collect();
    attacks.extend(others);
    stats.attacks = attacks;
}

/// Why an item cannot be put on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EquipProblem {
    Unknown,
    NotWearable,
    NotProficient,
}

/// Puts on an item; returns what had to come off for it (the old armor or shield, the
/// oldest weapon when the hands are full).
pub fn equip(stats: &mut Stats5e, item_id: &str) -> Result<Vec<String>, EquipProblem> {
    let data = item(item_id).ok_or(EquipProblem::Unknown)?;
    let removed: Vec<String> = match data.kind {
        ItemKind::Armor | ItemKind::Shield => {
            if !proficient_with(stats, data) {
                return Err(EquipProblem::NotProficient);
            }
            stats
                .equipped
                .iter()
                .filter(|id| item(id).is_some_and(|i| i.kind == data.kind))
                .cloned()
                .collect()
        }
        ItemKind::Weapon => {
            let weapons: Vec<String> = stats
                .equipped
                .iter()
                .filter(|id| item(id).is_some_and(|i| i.kind == ItemKind::Weapon))
                .cloned()
                .collect();
            if weapons.len() >= MAX_WEAPONS {
                vec![weapons[0].clone()]
            } else {
                Vec::new()
            }
        }
        _ => return Err(EquipProblem::NotWearable),
    };
    for id in &removed {
        if let Some(pos) = stats.equipped.iter().position(|e| e == id) {
            stats.equipped.remove(pos);
        }
    }
    stats.equipped.push(item_id.to_string());
    recompute_gear(stats);
    Ok(removed)
}

/// Takes an item off; false when it was not worn.
pub fn unequip(stats: &mut Stats5e, item_id: &str) -> bool {
    let Some(pos) = stats.equipped.iter().position(|e| e == item_id) else {
        return false;
    };
    stats.equipped.remove(pos);
    recompute_gear(stats);
    true
}

/// Short description of an item's game values (English, for the inventory and the planner).
pub fn item_summary(data: &ItemData) -> String {
    match (&data.armor, &data.weapon, data.kind) {
        (Some(a), _, _) => match a.dex_max {
            Some(0) => format!("{} armor, AC {}", a.category, a.base),
            Some(max) => format!("{} armor, AC {} + DEX (max {max})", a.category, a.base),
            None => format!("{} armor, AC {} + DEX", a.category, a.base),
        },
        (_, _, ItemKind::Shield) => "shield, +2 AC".to_string(),
        (_, Some(w), _) => format!("{} weapon, {} {}", w.category, w.damage, w.damage_type),
        (_, _, ItemKind::Potion) => format!("potion, heals {}", data.heal.as_deref().unwrap_or("")),
        _ => "treasure".to_string(),
    }
}
