//! Party vitals that persist outside combat, and who may know what (whispers, thoughts).

use super::*;

const PLAYER_HP: i32 = 50;
const COMPANION_HP: i32 = 40;
const MAX_STRESS: i32 = 100;
/// Secrets kept per character; the oldest drop out.
const PRIVATE_KNOWLEDGE_LIMIT: usize = 20;

fn player_name(state: &SceneState) -> String {
    if state.definition.persona.trim().is_empty() {
        crate::modules::content_lang::ContentLang::current()
            .pick("Spieler", "Player", "Игрок")
            .to_string()
    } else {
        state.definition.persona.clone()
    }
}

/// Player and companions always carry HP, stress and conditions, also outside combat; a fight
/// only adds enemies. Fills in whoever is missing (new scenes, older saves, party changes).
pub fn ensure_party_vitals(state: &mut SceneState) {
    let name = player_name(state);
    let combatants = &mut state.combat.combatants;
    if !combatants.iter().any(|c| c.role == "player") {
        combatants.push(Combatant {
            id: "player".to_string(),
            name,
            role: "player".to_string(),
            hp: PLAYER_HP,
            max_hp: PLAYER_HP,
            stress: 0,
            max_stress: MAX_STRESS,
            // 0 = not rolled yet; a fight rolls it.
            initiative: 0,
            conditions: Vec::new(),
        });
    }
    for name in state.definition.party.clone() {
        let combatants = &mut state.combat.combatants;
        if combatants
            .iter()
            .any(|c| c.role == "companion" && c.name.eq_ignore_ascii_case(&name))
        {
            continue;
        }
        let index = (0..)
            .find(|i| !combatants.iter().any(|c| c.id == format!("companion_{i}")))
            .unwrap_or(0);
        combatants.push(Combatant {
            id: format!("companion_{index}"),
            name,
            role: "companion".to_string(),
            hp: COMPANION_HP,
            max_hp: COMPANION_HP,
            stress: 0,
            max_stress: MAX_STRESS,
            initiative: 0,
            conditions: Vec::new(),
        });
    }
}

/// After a fight only the party stays; the next fight rolls initiative anew.
pub fn remove_enemies(state: &mut SceneState) {
    state
        .combat
        .combatants
        .retain(|c| c.role == "player" || c.role == "companion");
    for combatant in &mut state.combat.combatants {
        combatant.initiative = 0;
    }
}

/// Outside combat, conditions last a number of turns.
pub fn tick_conditions_outside_combat(state: &mut SceneState) {
    if state.combat.is_active {
        return;
    }
    for combatant in &mut state.combat.combatants {
        combatant.conditions.retain_mut(|condition| {
            condition.rounds_remaining = condition.rounds_remaining.saturating_sub(1);
            condition.rounds_remaining > 0
        });
    }
}

/// The party's state for the planner prompt.
pub fn party_vitals_context(state: &SceneState) -> String {
    state
        .combat
        .combatants
        .iter()
        .filter(|c| c.role == "player" || c.role == "companion")
        .map(|c| {
            let conditions = c
                .conditions
                .iter()
                .map(|cond| format!("{} ({} turns)", cond.name, cond.rounds_remaining))
                .collect::<Vec<_>>()
                .join(", ");
            format!(
                "{}{}: HP {}/{}, stress {}/{}{}",
                c.name,
                if c.role == "player" { " (PLAYER)" } else { "" },
                c.hp,
                c.max_hp,
                c.stress,
                c.max_stress,
                if conditions.is_empty() {
                    String::new()
                } else {
                    format!(", conditions: {conditions}")
                }
            )
        })
        .collect::<Vec<_>>()
        .join("; ")
}

/// Combatant addressed by a plan (`PLAYER`, name or id).
pub fn find_combatant<'a>(state: &'a mut SceneState, target: &str) -> Option<&'a mut Combatant> {
    let target = target.trim();
    state.combat.combatants.iter_mut().find(|c| {
        (target.eq_ignore_ascii_case("PLAYER") && c.role == "player")
            || c.name.eq_ignore_ascii_case(target)
            || c.id.eq_ignore_ascii_case(target)
    })
}

/// The recipient of a whisper, if the message really is one.
pub fn whisper_recipient(turn_mode: &str, target: Option<&str>) -> Option<String> {
    let target = target?.trim();
    (turn_mode == "whisper"
        && !target.is_empty()
        && !["none", "null", "everyone", "alle"].contains(&target.to_lowercase().as_str()))
    .then(|| target.to_string())
}

/// Remembers what `recipient` was told in private.
pub fn add_private_knowledge(state: &mut SceneState, recipient: &str, text: String) {
    let entries = state
        .private_knowledge
        .entry(recipient.to_string())
        .or_default();
    entries.push(text);
    if entries.len() > PRIVATE_KNOWLEDGE_LIMIT {
        entries.remove(0);
    }
}

/// Rebuild derived whisper knowledge after editing/deleting/regenerating source messages.
pub fn rebuild_private_knowledge(state: &mut SceneState) {
    let whispers: Vec<_> = state
        .chat_log
        .iter()
        .filter_map(|msg| {
            whisper_recipient(&msg.turn_mode, msg.whisper_target.as_deref()).map(|to| {
                (
                    to,
                    format!("{} whispered to you: {}", msg.sender_name, msg.content),
                )
            })
        })
        .collect();
    state.private_knowledge.clear();
    for (to, text) in whispers {
        add_private_knowledge(state, &to, text);
    }
}

/// Who reads a history line: the game master (knows everything, keeps secrets), the narrator
/// (describes only what everyone can perceive) or a character.
#[derive(Clone, Copy)]
pub enum Audience<'a> {
    Planner,
    Narrator,
    Character(&'a str),
}

/// A message as `audience` perceives it: whispers reach only their recipient, thoughts only the
/// game master.
pub fn line_for(msg: &SceneTurnMessage, audience: Audience<'_>) -> String {
    let full = format!("{}: {}", msg.sender_name, msg.content);
    let recipient = whisper_recipient(&msg.turn_mode, msg.whisper_target.as_deref());
    match (msg.turn_mode.as_str(), recipient, audience) {
        (_, Some(to), Audience::Planner) => format!(
            "{} (PRIVATE whisper to {to} – keep the content secret from everyone else)",
            full
        ),
        (_, Some(to), Audience::Character(name)) if to.eq_ignore_ascii_case(name) => {
            format!("{} (whispered only to you)", full)
        }
        (_, Some(to), _) => format!(
            "{}: *leans close to {to} and whispers something nobody else can hear*",
            msg.sender_name
        ),
        ("think", None, Audience::Planner) => format!("{} (private thought)", full),
        ("think", None, _) => format!("{}: *seems lost in thought*", msg.sender_name),
        _ => full,
    }
}

/// What the character `name` knows privately, for their prompt.
pub fn private_knowledge_block(state: &SceneState, name: &str) -> String {
    state
        .private_knowledge
        .iter()
        .find(|(who, _)| who.eq_ignore_ascii_case(name))
        .filter(|(_, entries)| !entries.is_empty())
        .map(|(_, entries)| {
            format!(
                "\n\nThings only you know (told to you in private – never reveal them unless you choose to):\n- {}",
                entries.join("\n- ")
            )
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(mode: &str, target: Option<&str>) -> SceneTurnMessage {
        SceneTurnMessage {
            id: "m".into(),
            sender_id: "player".into(),
            sender_name: "Kai".into(),
            sender_role: "player".into(),
            avatar_url: None,
            content: "Der Schlüssel liegt unter dem Altar.".into(),
            turn_mode: mode.into(),
            whisper_target: target.map(Into::into),
            event_card: None,
            timestamp: 0,
        }
    }

    #[test]
    fn whispers_reach_only_their_recipient() {
        let whisper = message("whisper", Some("Ayu"));
        assert!(line_for(&whisper, Audience::Character("ayu")).contains("unter dem Altar"));
        assert!(!line_for(&whisper, Audience::Character("Sora")).contains("Altar"));
        assert!(!line_for(&whisper, Audience::Narrator).contains("Altar"));
        assert!(line_for(&whisper, Audience::Planner).contains("PRIVATE"));
        // Without a target a "whisper" is just speech.
        assert!(line_for(&message("whisper", Some("")), Audience::Narrator).contains("Altar"));
    }

    #[test]
    fn thoughts_stay_with_the_game_master() {
        let thought = message("think", None);
        assert!(line_for(&thought, Audience::Planner).contains("Altar"));
        assert!(!line_for(&thought, Audience::Character("Ayu")).contains("Altar"));
    }

    #[test]
    fn party_gets_vitals_once() {
        let mut definition = StageEngine::new().get_state().definition;
        definition.party = vec!["Ayu".into(), "Sora".into()];
        let mut state = build_initial_scene_state(&definition);
        ensure_party_vitals(&mut state);
        ensure_party_vitals(&mut state);
        assert_eq!(state.combat.combatants.len(), 3);
        find_combatant(&mut state, "PLAYER").unwrap().hp -= 10;
        state.definition.party.push("Jibril".into());
        ensure_party_vitals(&mut state);
        assert_eq!(state.combat.combatants.len(), 4);
        assert_eq!(find_combatant(&mut state, "player").unwrap().hp, 40);
    }

    #[test]
    fn conditions_wear_off_outside_combat() {
        let mut state = build_initial_scene_state(&StageEngine::new().get_state().definition);
        find_combatant(&mut state, "PLAYER")
            .unwrap()
            .conditions
            .push(CombatCondition {
                name: "Vergiftet".into(),
                rounds_remaining: 2,
            });
        tick_conditions_outside_combat(&mut state);
        assert_eq!(
            find_combatant(&mut state, "PLAYER")
                .unwrap()
                .conditions
                .len(),
            1
        );
        tick_conditions_outside_combat(&mut state);
        assert!(
            find_combatant(&mut state, "PLAYER")
                .unwrap()
                .conditions
                .is_empty()
        );
    }
}
