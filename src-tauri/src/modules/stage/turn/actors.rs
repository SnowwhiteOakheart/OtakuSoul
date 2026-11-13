use super::super::*;
use super::{TurnContext, stream_message};

pub(super) async fn run_actor_reactions(
    ctx: &TurnContext<'_>,
    state: &mut SceneState,
    gm_plan: &GmPlan,
    active_lore_snippets: &[String],
    continues: bool,
) -> bool {
    let TurnContext {
        req,
        inference,
        memory_db,
        counter,
        llm,
        reply_language,
        lang_code,
        user_name,
        clean_input,
        whisper_to,
        observation_start,
        on_stream,
        ..
    } = ctx;
    let observation_start = *observation_start;
    let endpoint_url = &llm.endpoint_url;
    let api_key = &llm.api_key;
    let model_name = &llm.model;
    let provider = &llm.provider;
    let localized_def = state.definition.localized(lang_code);

    let addressed = (!continues && whisper_to.is_none())
        .then(|| detect_direct_address(clean_input, &speaking_cast(state)))
        .flatten();
    // The planner's pick, matched loosely to the cast ("Stephanie" → "Stephanie Dola"). Outside
    // combat the party always gets a word after the narration: on "PLAYER", an unknown name or a
    // broken plan, whoever has waited longest speaks, so the game master never plays alone.
    let planned = {
        let cast = speaking_cast(state);
        let wanted = gm_plan.next_actor.as_deref().unwrap_or("PLAYER");
        resolve_actor(wanted, &cast).or_else(|| {
            (!state.combat.is_active)
                .then(|| spotlight_pick(&state.definition.party, &recent_speakers(state, 12)))
                .flatten()
        })
    };
    let initial_next = req
        .force_next_actor
        .as_deref()
        .filter(|actor| !actor.trim().is_empty())
        .map(str::to_string)
        .or(whisper_to.clone())
        .or(addressed.clone())
        .or(planned)
        .unwrap_or_else(|| "PLAYER".to_string());

    let max_depth = state.definition.max_actor_depth.max(1);
    let mut current_actor = initial_next;
    let mut actor_depth = 0;
    let mut spoken_actors = std::collections::HashSet::new();
    let mut spoken_order: Vec<String> = Vec::new();
    let mut last_line: Option<(String, String)> = None;
    if inference.is_aborted() {
        current_actor = "PLAYER".to_string();
    }

    while current_actor != "PLAYER" && actor_depth < max_depth {
        if let Some(npc) = find_npc(state, current_actor.trim()) {
            current_actor = npc.name.clone();
        }
        actor_depth += 1;
        state.current_turn_actor = current_actor.clone();
        spoken_actors.insert(current_actor.to_lowercase());
        spoken_order.push(current_actor.clone());

        if state.combat.is_active
            && let Some(index) = state.combat.combatants.iter().position(|combatant| {
                (current_actor == "PLAYER" && combatant.role == "player")
                    || combatant.name.eq_ignore_ascii_case(&current_actor)
            })
        {
            if index < state.combat.current_turn_index {
                state.combat.round += 1;
            }
            state.combat.current_turn_index = index;
        }

        let npc = find_npc(state, &current_actor)
            .filter(|n| n.active && n.promoted_character_id.is_none())
            .cloned();
        if npc.is_some()
            || state
                .definition
                .party
                .iter()
                .any(|p| p.eq_ignore_ascii_case(&current_actor))
        {
            let all_chars = scan_available_characters();
            let matched_char = crate::modules::characters::find_by_name(&all_chars, &current_actor);

            let lore_section = if !active_lore_snippets.is_empty() {
                format!(
                    "\n\nActive world and scene information:\n{}",
                    active_lore_snippets.join("\n---\n")
                )
            } else {
                String::new()
            };

            // What only this character knows, and how the story has changed them.
            let secrets = format!(
                "{}{}",
                private_knowledge_block(state, &current_actor),
                overlay_block(state, &current_actor)
            );
            let companion_system = if let Some(npc) = &npc {
                let localized_npc = npc.localized(lang_code);
                format!(
                    "[STAGE — NPC]\nYou are {} ({}).\nPersonality and background: {}\nScene context: {}{lore_section}\nReact in the first person to events you witnessed. Stay in character; keep it concise. Reply in {reply_language}.{}{}",
                    localized_npc.name,
                    localized_npc.archetype,
                    localized_npc.personality,
                    localized_def.world_context,
                    npc_memory_block(npc, clean_input),
                    secrets
                )
            } else if let Some(ch) = matched_char {
                let localized_char = ch
                    .card
                    .data
                    .localized(&crate::modules::content_lang::language_code(reply_language));
                let memories =
                    soul_memory_block(state, memory_db, &ch.id, &ch.card.data.name, user_name);
                format!(
                    r#"You are {name}.
Personality: {personality}
Background: {description}
Scene context: {world_context}{lore_section}

React in the first person to what the game master, {user_name} and any companions just did or said.
Stay fully in character, use your own voice and express your feelings vividly and authentically. Keep it concise.
Reply in {reply_language}.{memories}{secrets}"#,
                    name = ch.card.data.name,
                    personality = localized_char.personality,
                    description = localized_char.description,
                    world_context = localized_def.world_context,
                    lore_section = lore_section,
                    user_name = user_name,
                    reply_language = reply_language,
                    secrets = secrets
                )
            } else {
                format!(
                    "You are {}. React to what is happening from your point of view, in {reply_language}.{lore_section}{secrets}",
                    current_actor,
                    lore_section = lore_section,
                    reply_language = reply_language,
                    secrets = secrets
                )
            };

            let companion_messages = vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: companion_system,
                    attachments: Vec::new(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: format!("React as {}:", current_actor),
                    attachments: Vec::new(),
                },
            ];

            let comp_req = ChatRequest {
                endpoint_url: endpoint_url.clone(),
                api_key: api_key.clone(),
                model: model_name.clone(),
                messages: companion_messages,
                sampling: Some(SamplingParams {
                    temperature: Some(0.8),
                    top_p: Some(0.95),
                    max_tokens: Some(800),
                    ..Default::default()
                }),
                reasoning_mode: Some(false),
                provider: provider.clone(),
            };

            let Some(comp_req) = super::history::prepare(
                state,
                inference,
                counter,
                Audience::Character(&current_actor),
                comp_req,
            )
            .await
            else {
                return false;
            };
            let comp_msg_id = format!("msg_{}_{}", Utc::now().timestamp_millis(), actor_depth);
            // Companions get their picture in the interface (by name, from the library), so the
            // scene doesn't store a Base64 copy of the card's PNG with every message.
            let avatar_url = npc.as_ref().map(|n| npc_avatar(&n.archetype));
            let sender_role = if npc.is_some() { "npc" } else { "companion" };
            if let Ok(comp_text) = stream_message(
                inference,
                comp_req,
                on_stream,
                &comp_msg_id,
                &current_actor,
                sender_role,
                avatar_url.clone(),
            )
            .await
            {
                last_line = Some((current_actor.clone(), comp_text.clone()));
                let companion_msg = SceneTurnMessage {
                    id: comp_msg_id,
                    sender_id: current_actor.clone(),
                    sender_name: current_actor.clone(),
                    sender_role: sender_role.to_string(),
                    avatar_url,
                    content: comp_text,
                    turn_mode: "say".to_string(),
                    whisper_target: None,
                    event_card: None,
                    timestamp: Utc::now().timestamp() as u64,
                    bg: None,
                    images: Vec::new(),
                };
                state.push_message(companion_msg);
                if let Some(npc) = npc
                    && let Some(stored) = state.npcs.iter_mut().find(|n| n.id == npc.id)
                {
                    stored.turn_count += 1;
                }
                observe_npcs(state, observation_start);
            }
        }

        // Who reacts next: someone addressed by name, else the routing call decides.
        current_actor = if inference.is_aborted() || actor_depth >= max_depth {
            "PLAYER".to_string()
        } else {
            let speaker = current_actor.clone();
            let candidates: Vec<String> = speaking_cast(state)
                .into_iter()
                .filter(|c| !c.eq_ignore_ascii_case(&speaker))
                .collect();
            match &last_line {
                _ if candidates.is_empty() => "PLAYER".to_string(),
                None => "PLAYER".to_string(),
                Some((who, text)) => {
                    if let Some(name) = detect_direct_address(text, &candidates) {
                        name
                    } else {
                        let routing = ChatRequest {
                            endpoint_url: endpoint_url.clone(),
                            api_key: api_key.clone(),
                            model: model_name.clone(),
                            messages: vec![ChatMessage {
                                role: "user".to_string(),
                                content: routing_prompt(
                                    who,
                                    text,
                                    &candidates,
                                    &spoken_order,
                                    &recent_speakers(state, 10),
                                ),
                                attachments: Vec::new(),
                            }],
                            sampling: Some(SamplingParams {
                                temperature: Some(0.1),
                                max_tokens: Some(80),
                                ..Default::default()
                            }),
                            reasoning_mode: Some(false),
                            provider: provider.clone(),
                        };
                        let Some(routing_result) = inference
                            .with_abort(inference.generate_direct(routing))
                            .await
                        else {
                            return false;
                        };
                        let routed = routing_result
                            .ok()
                            .and_then(|raw| parse_routing(&raw, &candidates));
                        // Unusable answer: the old order (next party member who hasn't spoken).
                        routed.unwrap_or_else(|| {
                            state
                                .definition
                                .party
                                .iter()
                                .find(|p| !spoken_actors.contains(&p.to_lowercase()))
                                .cloned()
                                .unwrap_or_else(|| "PLAYER".to_string())
                        })
                    }
                }
            }
        };
    }

    true
}
