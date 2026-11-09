//! The 18 skills of the SRD with their abilities, and checks out of combat: the game master
//! names a skill, the engine rolls d20 + ability modifier (+ proficiency when trained).

use super::*;

/// Skill id, its ability, and names the game master may use (English, German, Russian).
const SKILLS: [(&str, Ability, &[&str]); 18] = [
    (
        "athletics",
        Ability::Str,
        &["athletics", "athletik", "атлетика"],
    ),
    (
        "acrobatics",
        Ability::Dex,
        &["acrobatics", "akrobatik", "акробатика"],
    ),
    (
        "sleight_of_hand",
        Ability::Dex,
        &[
            "sleight of hand",
            "sleight_of_hand",
            "fingerfertigkeit",
            "ловкость рук",
        ],
    ),
    (
        "stealth",
        Ability::Dex,
        &["stealth", "heimlichkeit", "schleichen", "скрытность"],
    ),
    (
        "arcana",
        Ability::Int,
        &["arcana", "arkane kunde", "magiekunde", "магия"],
    ),
    (
        "history",
        Ability::Int,
        &["history", "geschichte", "история"],
    ),
    (
        "investigation",
        Ability::Int,
        &[
            "investigation",
            "nachforschungen",
            "untersuchen",
            "анализ",
            "расследование",
        ],
    ),
    ("nature", Ability::Int, &["nature", "naturkunde", "природа"]),
    ("religion", Ability::Int, &["religion", "религия"]),
    (
        "animal_handling",
        Ability::Wis,
        &[
            "animal handling",
            "animal_handling",
            "mit tieren umgehen",
            "уход за животными",
        ],
    ),
    (
        "insight",
        Ability::Wis,
        &["insight", "motiv erkennen", "проницательность"],
    ),
    (
        "medicine",
        Ability::Wis,
        &["medicine", "heilkunde", "медицина"],
    ),
    (
        "perception",
        Ability::Wis,
        &["perception", "wahrnehmung", "внимательность", "восприятие"],
    ),
    (
        "survival",
        Ability::Wis,
        &["survival", "überlebenskunst", "выживание"],
    ),
    (
        "deception",
        Ability::Cha,
        &["deception", "täuschen", "täuschung", "обман"],
    ),
    (
        "intimidation",
        Ability::Cha,
        &[
            "intimidation",
            "einschüchtern",
            "einschüchterung",
            "запугивание",
        ],
    ),
    (
        "performance",
        Ability::Cha,
        &["performance", "auftreten", "выступление"],
    ),
    (
        "persuasion",
        Ability::Cha,
        &["persuasion", "überzeugen", "überzeugung", "убеждение"],
    ),
];

/// All skill ids (for the planner prompt).
pub fn skill_ids() -> Vec<&'static str> {
    SKILLS.iter().map(|(id, _, _)| *id).collect()
}

/// The skill a name means, with its ability. Plain ability names ("Strength", "Stärke") are
/// understood as an ability check without a skill.
pub fn skill(name: &str) -> Option<(Option<&'static str>, Ability)> {
    let name = name.trim().to_lowercase().replace('_', " ");
    if let Some((id, ability, _)) = SKILLS
        .iter()
        .find(|(id, _, names)| id.replace('_', " ") == name || names.contains(&name.as_str()))
    {
        return Some((Some(id), *ability));
    }
    let abilities: [(Ability, &[&str]); 6] = [
        (Ability::Str, &["strength", "stärke", "str", "сила"]),
        (
            Ability::Dex,
            &["dexterity", "geschicklichkeit", "dex", "ловкость"],
        ),
        (
            Ability::Con,
            &["constitution", "konstitution", "con", "телосложение"],
        ),
        (
            Ability::Int,
            &["intelligence", "intelligenz", "int", "интеллект"],
        ),
        (Ability::Wis, &["wisdom", "weisheit", "wis", "мудрость"]),
        (Ability::Cha, &["charisma", "cha", "харизма"]),
    ];
    abilities
        .iter()
        .find(|(_, names)| names.contains(&name.as_str()))
        .map(|(ability, _)| (None, *ability))
}

/// Bonus of a check: ability modifier, plus proficiency when trained in the skill.
pub fn check_bonus(stats: &Stats5e, skill_name: &str) -> Option<i32> {
    let (skill, ability) = skill(skill_name)?;
    let trained = skill.is_some_and(|id| stats.skill_proficiencies.iter().any(|s| s == id));
    Some(stats.modifier(ability) + if trained { stats.proficiency() } else { 0 })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skills_resolve_in_every_language_and_add_proficiency_when_trained() {
        assert_eq!(skill("Heimlichkeit"), Some((Some("stealth"), Ability::Dex)));
        assert_eq!(
            skill(" Восприятие "),
            Some((Some("perception"), Ability::Wis))
        );
        assert_eq!(skill("Stärke"), Some((None, Ability::Str)));
        assert_eq!(skill("Kochen"), None);
        let (rogue, _) = hero_stats(class("rogue").unwrap());
        let stealth = rogue.modifier(Ability::Dex) + rogue.proficiency();
        assert!(rogue.skill_proficiencies.iter().any(|s| s == "stealth"));
        assert_eq!(check_bonus(&rogue, "stealth"), Some(stealth));
        assert_eq!(
            check_bonus(&rogue, "religion"),
            Some(rogue.modifier(Ability::Int))
        );
        assert_eq!(skill_ids().len(), 18);
    }
}
