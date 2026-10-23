//! Between sessions: after a long pause a companion tells the player what they did meanwhile,
//! together with another companion if there is one. The story goes into the log as the
//! companion's words, so it reaches the Soul Memory of both through the usual memory sync.

use super::*;

/// A story is told when nobody played for this long (a night or more).
pub const OFFSCREEN_MIN_PAUSE_SECS: u64 = 8 * 3600;
/// Card text kept per companion in the prompt.
const DESCRIPTION_CHARS: usize = 300;
/// Log lines the companion remembers from the last session.
const RECENT_LINES: usize = 10;

/// Whether `state` gets a story now: on for the scene, a companion along, the story started (the
/// player has acted), no fight going on and the last line at least [`OFFSCREEN_MIN_PAUSE_SECS`] old.
pub fn offscreen_due(state: &SceneState, now_secs: u64) -> bool {
    let Some(last) = state.chat_log.last() else {
        return false;
    };
    !state.definition.disable_offscreen
        && !state.definition.party.is_empty()
        && !state.combat.is_active
        && state.chat_log.iter().any(|m| m.sender_role == "player")
        && now_secs.saturating_sub(last.timestamp) >= OFFSCREEN_MIN_PAUSE_SECS
}

/// "9 hours", "3 days": the pause in words for the model.
fn pause_in_words(seconds: u64) -> String {
    let hours = (seconds as f64 / 3600.0).round() as u64;
    if hours < 48 {
        format!("{hours} hours")
    } else {
        format!("{} days", (hours as f64 / 24.0).round() as u64)
    }
}

/// Who tells (and with whom): a random companion and, with more than one, a random other one.
fn pick_pair(party: &[String]) -> Option<(String, Option<String>)> {
    if party.is_empty() {
        return None;
    }
    let mut rng = rand::rng();
    let teller = party[rng.random_range(0..party.len())].clone();
    let others: Vec<&String> = party.iter().filter(|name| **name != teller).collect();
    let partner = (!others.is_empty()).then(|| others[rng.random_range(0..others.len())].clone());
    Some((teller, partner))
}

/// Short card text of a companion (empty for one without a card).
fn description_of(
    name: &str,
    characters: &[crate::modules::characters::CharacterProfile],
) -> String {
    characters
        .iter()
        .find(|c| c.card.data.name.eq_ignore_ascii_case(name))
        .map(|c| {
            let text = c.card.data.description.replace('\n', " ");
            text.chars().take(DESCRIPTION_CHARS).collect::<String>()
        })
        .unwrap_or_default()
}

fn offscreen_prompt(
    state: &SceneState,
    teller: &str,
    partner: Option<&str>,
    pause_secs: u64,
    characters: &[crate::modules::characters::CharacterProfile],
) -> String {
    let player = if state.definition.persona.trim().is_empty() {
        "the player".to_string()
    } else {
        state.definition.persona.clone()
    };
    let language = crate::modules::content_lang::ContentLang::reply_language_name();
    let log = &state.chat_log;
    let history = log[log.len().saturating_sub(RECENT_LINES)..]
        .iter()
        .map(|m| line_for(m, Audience::Character(teller)))
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let who = |name: &str| {
        let description = description_of(name, characters);
        if description.is_empty() {
            format!("- {name}")
        } else {
            format!("- {name}: {description}")
        }
    };
    let (together, cast, detail) = match partner {
        Some(partner) => (
            format!("{teller} and {partner} spent some time together away from {player}"),
            format!("{}\n{}", who(teller), who(partner)),
            format!(
                "what the two of them talked about or did, with one vivid detail about {partner}"
            ),
        ),
        None => (
            format!("{teller} spent some time on their own, away from {player}"),
            who(teller),
            "what they did or noticed, with one vivid detail".to_string(),
        ),
    };
    format!(
        "[STAGE — OFFSCREEN]\nStory: {title}. {world}\nCurrent place: {place}, {time}.\n\n\
         Between the sessions ({pause}), {together}.\n{cast}\n\nLast events:\n{history}\n\n\
         Write what {teller} tells {player} about it when they meet again, as {teller}'s spoken words in \
         {language}: two to four sentences, {detail}. Stay in character and fitting to the story and \
         place; no new major plot events, no fights. Do not mention sessions, pauses, timers or being \
         an AI. Reply with {teller}'s words only, without their name in front.",
        title = state.definition.title,
        world = state.definition.world_context,
        place = state.world.location,
        time = state.world.time_of_day,
        pause = pause_in_words(pause_secs),
    )
}

/// The companion's words without a leading name or surrounding quotes.
fn clean_reply(text: &str, teller: &str) -> String {
    let mut text = text.trim();
    for prefix in [
        format!("{teller}:"),
        format!("**{teller}:**"),
        format!("**{teller}**:"),
    ] {
        if let Some(rest) = text.strip_prefix(prefix.as_str()) {
            text = rest.trim();
        }
    }
    let quoted = ['"', '„', '“', '”', '«', '»'];
    if text.chars().next().is_some_and(|c| quoted.contains(&c))
        && text.chars().last().is_some_and(|c| quoted.contains(&c))
        && text.chars().count() > 2
    {
        let inner: String = text.chars().skip(1).collect();
        let inner: String = inner.chars().take(inner.chars().count() - 1).collect();
        return inner.trim().to_string();
    }
    text.to_string()
}

/// After a long pause, lets a companion tell what happened between the sessions and adds it to
/// the log (with a card saying so). `None` when nothing is due, the model gave nothing or the
/// Stage stop was pressed.
pub async fn tell_offscreen(
    engine: &StageEngine,
    inference: &InferenceClient,
    scene_id: &str,
) -> Result<Option<SceneState>, String> {
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }
    let now = Utc::now().timestamp().max(0) as u64;
    if !offscreen_due(&state, now) {
        return Ok(None);
    }
    let Some((teller, partner)) = pick_pair(&state.definition.party) else {
        return Ok(None);
    };
    let pause = now.saturating_sub(state.chat_log.last().map_or(now, |m| m.timestamp));
    let characters = scan_available_characters();
    let prompt = offscreen_prompt(&state, &teller, partner.as_deref(), pause, &characters);
    let mut request = StageLlm::from_settings().request(prompt, 300);
    if let Some(sampling) = request.sampling.as_mut() {
        sampling.temperature = Some(0.8);
    }
    // Like a turn, the story starts with a fresh stop flag and ends on Stop.
    inference.reset_abort();
    let Some(result) = inference
        .with_abort(inference.generate_direct(request))
        .await
    else {
        return Ok(None);
    };
    let text = clean_reply(&result?, &teller);
    if text.is_empty() {
        return Ok(None);
    }
    let observation_start = state.chat_log.len();
    let mut companions = vec![teller.clone()];
    companions.extend(partner);
    state.chat_log.push(SceneTurnMessage {
        id: format!("msg_{}", Utc::now().timestamp_millis()),
        sender_id: teller.clone(),
        sender_name: teller,
        sender_role: "companion".to_string(),
        avatar_url: None,
        content: text,
        turn_mode: "say".to_string(),
        whisper_target: None,
        event_card: Some(StageEventCard::Offscreen { companions }),
        timestamp: now,
    });
    observe_npcs(&mut state, observation_start);
    engine.set_state(state.clone());
    save_scene_state(&state)?;
    Ok(Some(state))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: &str, timestamp: u64) -> SceneTurnMessage {
        SceneTurnMessage {
            id: format!("m{timestamp}"),
            sender_id: role.into(),
            sender_name: role.into(),
            sender_role: role.into(),
            avatar_url: None,
            content: "…".into(),
            turn_mode: "say".into(),
            whisper_target: None,
            event_card: None,
            timestamp,
        }
    }

    #[test]
    fn tells_only_after_a_long_pause_in_a_started_story() {
        let mut state = StageEngine::new().get_state();
        state.definition.party = vec!["Lirwen".into()];
        let start = 1_000_000;
        state.chat_log = vec![message("gm", start)];
        let later = start + OFFSCREEN_MIN_PAUSE_SECS;
        assert!(!offscreen_due(&state, later), "noch keine Spieleraktion");
        state.chat_log.push(message("player", start));
        assert!(offscreen_due(&state, later));
        assert!(!offscreen_due(&state, later - 1));
        state.combat.is_active = true;
        assert!(!offscreen_due(&state, later));
        state.combat.is_active = false;
        state.definition.disable_offscreen = true;
        assert!(!offscreen_due(&state, later));
        state.definition.disable_offscreen = false;
        state.definition.party.clear();
        assert!(!offscreen_due(&state, later));
    }

    #[test]
    fn pairs_two_different_companions() {
        let party = vec!["Lirwen".to_string(), "Faelion".to_string()];
        for _ in 0..20 {
            let (teller, partner) = pick_pair(&party).unwrap();
            assert_ne!(Some(teller), partner);
        }
        assert_eq!(pick_pair(&["Lirwen".to_string()]).unwrap().1, None);
        assert!(pick_pair(&[]).is_none());
    }

    #[test]
    fn prompt_names_both_and_cleans_the_reply() {
        let mut state = StageEngine::new().get_state();
        state.definition.party = vec!["Lirwen".into(), "Faelion".into()];
        let prompt = offscreen_prompt(&state, "Lirwen", Some("Faelion"), 9 * 3600, &[]);
        assert!(prompt.starts_with("[STAGE — OFFSCREEN]"));
        assert!(prompt.contains("Lirwen and Faelion spent some time together"));
        assert!(prompt.contains("9 hours"));
        assert_eq!(
            clean_reply("Lirwen: „Wir haben Kräuter gesammelt.“", "Lirwen"),
            "Wir haben Kräuter gesammelt."
        );
        assert_eq!(
            clean_reply("  Wir waren am Fluss. ", "Lirwen"),
            "Wir waren am Fluss."
        );
    }
}
