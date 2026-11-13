use super::super::*;

pub async fn execute_stage_rest(
    engine: &StageEngine,
    _inference: &InferenceClient,
    scene_id: &str,
    rest_type: &str,
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }

    engine.push_snapshot(&state.definition.id, state.clone());
    let observation_start = state.chat_log.len();

    let lang = crate::modules::content_lang::ContentLang::current();
    let (hp_rec, stress_rec, note) = if rest_type == "long" {
        let morning = matches!(
            state.world.time_of_day.as_str(),
            "Morgen" | "Morning" | "Утро"
        );
        let noon = matches!(
            state.world.time_of_day.as_str(),
            "Mittag" | "Noon" | "Полдень"
        );
        state.world.time_of_day = if morning {
            lang.t("Evening")
        } else if noon {
            lang.t("Midnight")
        } else {
            lang.t("Morning")
        }
        .to_string();
        (
            40,
            30,
            lang.t("Long rest complete: the party made a safe camp, regained their strength and tended to their gear."),
        )
    } else {
        (
            15,
            10,
            lang.t("Short rest: a moment to breathe by the campfire eases the exhaustion."),
        )
    };

    // 5e scenes rest by the rules (hit dice, slots); narrative scenes by fixed amounts.
    let five_e = state.definition.is_5e();
    if five_e {
        super::combat5e::rest_party(&mut state, rest_type == "long", &mut rand::rng());
    }
    // Heal combatants
    for c in state.combat.combatants.iter_mut().filter(|_| !five_e) {
        if c.role == "player" || c.role == "companion" {
            c.hp = (c.hp + hp_rec).min(c.max_hp);
            c.stress = (c.stress - stress_rec).max(0);
            if rest_type == "long" {
                c.conditions.clear();
            }
        }
    }

    let player_name = if state.definition.persona.is_empty() {
        lang.t("Player").to_string()
    } else {
        state.definition.persona.clone()
    };
    let affinity_gain = if rest_type == "long" { 5 } else { 2 };
    let mut bond_milestones = Vec::new();
    for companion in state.definition.party.clone() {
        let relationship_index = if let Some(index) =
            state.relationships.iter().position(|relationship| {
                relationship.subject == companion && relationship.target == player_name
            }) {
            index
        } else {
            state.relationships.push(StageRelationship {
                subject: companion.clone(),
                target: player_name.clone(),
                affinity: 0,
                tags: Vec::new(),
                role_view: lang.t("Companion").to_string(),
                last_shift_reason: String::new(),
            });
            state.relationships.len() - 1
        };
        let relationship = &mut state.relationships[relationship_index];
        let before = relationship.affinity;
        relationship.affinity = (relationship.affinity + affinity_gain).clamp(-100, 100);
        relationship.last_shift_reason = if rest_type == "long" {
            lang.t("Shared campfire").to_string()
        } else {
            lang.t("Shared rest").to_string()
        };
        for milestone in [25, 50, 75] {
            if before < milestone && relationship.affinity >= milestone {
                bond_milestones.push((companion.clone(), relationship.affinity, milestone));
            }
        }
    }

    let rest_card = StageEventCard::Rest(RestEventData {
        rest_type: rest_type.to_string(),
        recovered_hp: hp_rec,
        recovered_stress: stress_rec,
        campfire_note: note.to_string(),
    });

    let rest_msg = SceneTurnMessage {
        id: format!("msg_{}", Utc::now().timestamp_millis()),
        sender_id: "gm".to_string(),
        sender_name: "Game Master".to_string(),
        sender_role: "gm".to_string(),
        avatar_url: None,
        content: note.to_string(),
        turn_mode: "do".to_string(),
        whisper_target: None,
        event_card: Some(rest_card),
        timestamp: Utc::now().timestamp() as u64,
        bg: None,
        images: Vec::new(),
    };
    state.push_message(rest_msg);

    for (index, (companion, affinity, milestone)) in bond_milestones.into_iter().enumerate() {
        state.push_message(SceneTurnMessage {
            id: format!("msg_bond_{}_{}", Utc::now().timestamp_millis(), index),
            sender_id: "system".to_string(),
            sender_name: lang.t("Bond milestone").to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content: lang
                .t("Your bond with {name} reached level {level}.")
                .replace("{name}", &companion)
                .replace("{level}", &milestone.to_string()),
            turn_mode: "direct".to_string(),
            whisper_target: None,
            event_card: Some(StageEventCard::BondMilestone {
                companion,
                affinity,
                milestone,
            }),
            timestamp: Utc::now().timestamp() as u64,
            bg: None,
            images: Vec::new(),
        });
    }

    // Optional short campfire dialogue from companion
    if let Some(companion_name) = state.definition.party.first() {
        let comp_msg = SceneTurnMessage {
            id: format!("msg_{}", Utc::now().timestamp_millis() + 1),
            sender_id: companion_name.clone(),
            sender_name: companion_name.clone(),
            sender_role: "companion".to_string(),
            avatar_url: None,
            content: lang
                .t("It feels good to pause for a moment. We have to stay on guard, but together we'll make it.")
                .to_string(),
            turn_mode: "say".to_string(),
            whisper_target: None,
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
            bg: None,
            images: Vec::new(),
        };
        state.push_message(comp_msg);
    }

    observe_npcs(&mut state, observation_start);
    engine.set_state(state.clone());
    save_scene_state(&state)?;

    Ok(state)
}
