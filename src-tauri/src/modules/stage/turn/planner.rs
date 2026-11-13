use super::super::*;
use super::TurnContext;

pub(super) struct PlanOutcome {
    pub(super) gm_plan: GmPlan,
    pub(super) active_lore_snippets: Vec<String>,
    pub(super) ambient_files: Vec<String>,
}

pub(super) async fn plan_turn(
    ctx: &TurnContext<'_>,
    state: &mut SceneState,
) -> Option<PlanOutcome> {
    let TurnContext {
        req,
        inference,
        counter,
        llm,
        reply_language,
        lang_code,
        user_name,
        party_list,
        clean_input,
        whisper_to,
        observation_start,
        ..
    } = ctx;
    let observation_start = *observation_start;
    let endpoint_url = &llm.endpoint_url;
    let api_key = &llm.api_key;
    let model_name = &llm.model;
    let provider = &llm.provider;
    let localized_def = state.definition.localized(lang_code);

    let npc_context = state
        .npcs
        .iter()
        .filter(|n| n.promoted_character_id.is_none())
        .map(|n| {
            format!(
                "{} ({}; {}; {})",
                n.name,
                n.archetype,
                if n.active {
                    "present"
                } else {
                    "absent, may return"
                },
                n.personality
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let clock_context = state
        .clocks
        .iter()
        .map(|clock| {
            format!(
                "{} [{}]: {}/{}",
                clock.name, clock.id, clock.current, clock.max
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    let objective_context = state
        .objectives
        .iter()
        .map(|objective| {
            format!(
                "{} [{}]: {}/{} ({})",
                objective.title, objective.id, objective.current, objective.max, objective.status
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
    let arc_context = open_arcs_context(state);
    let inventory_context = state
        .inventory
        .iter()
        .map(|item| format!("{} x{} [{}]", item.name, item.quantity, item.id))
        .collect::<Vec<_>>()
        .join("; ");
    let combat_context = if state.combat.is_active {
        state
            .combat
            .combatants
            .iter()
            .map(|combatant| {
                format!(
                    "{} [{}]: {}/{} HP",
                    combatant.name, combatant.role, combatant.hp, combatant.max_hp
                )
            })
            .collect::<Vec<_>>()
            .join("; ")
    } else {
        "no active combat".to_string()
    };
    let vitals_context = party_vitals_context(state);

    let recent_history: Vec<String> = state
        .chat_log
        .iter()
        .rev()
        .take(6)
        .rev()
        .map(|m| line_for(m, Audience::Narrator))
        .collect();

    // Scan bound lorebooks for Stage-Lore
    let mut active_lore_snippets = Vec::new();
    if !state.definition.lorebook.is_empty() {
        // Scenes name their lorebooks in the source language (or by id): look them up before
        // translating, otherwise a story in another language would find none.
        let all_lorebooks = crate::modules::lorebook::scan_available_lorebooks();
        let text_to_scan = recent_history.join("\n");
        for lb_name in &state.definition.lorebook {
            if let Some(lb) = all_lorebooks
                .iter()
                .find(|l| {
                    l.name.eq_ignore_ascii_case(lb_name) || l.id.eq_ignore_ascii_case(lb_name)
                })
                .map(|l| l.localized(lang_code))
                .as_ref()
            {
                let triggered = crate::modules::lorebook::evaluate_lorebooks(
                    std::slice::from_ref(lb),
                    &text_to_scan,
                    0,
                );
                for entry in triggered
                    .passive_entries
                    .iter()
                    .chain(triggered.active_entries.iter())
                {
                    if !active_lore_snippets
                        .iter()
                        .any(|s: &String| s.contains(&entry.name))
                    {
                        active_lore_snippets
                            .push(format!("[LORE: {}] {}", entry.name, entry.content));
                    }
                }
            }
        }
    }
    // Scene lore cards: party cards reach every speaker, game-master cards only the planner.
    let (party_cards, gm_cards) = relevant_lore_cards(
        state,
        &format!("{clean_input}\n{}", recent_history.join("\n")),
    );
    active_lore_snippets.extend(party_cards);
    let lore_context = if active_lore_snippets.is_empty() && gm_cards.is_empty() {
        "none".to_string()
    } else {
        active_lore_snippets
            .iter()
            .chain(gm_cards.iter())
            .cloned()
            .collect::<Vec<_>>()
            .join("\n")
    };

    let ambient_files = list_stage_assets().remove("ambient").unwrap_or_default();
    let planner_system_prompt = format!(
        r#"[STAGE — GAME MASTER PLANNER]
You are the game master of an immersive tabletop RPG in the genre/tone "{tone}".
Narrator style: {narrator_style}
Scene context: {world_context}
Stage lore / world knowledge:
{lore_context}
Current location: {location} ({time_of_day}, weather: {weather})
Party: {party}
Known NPCs:
{npc_context}
Player: {user_name}
Campaign clocks: {clocks}
Objectives: {objectives}
Open story arcs: {arcs}
Resolved story arcs (archive): {arc_archive}
Inventory: {inventory}
Party condition: {vitals}
Established facts: {facts}
Character overlays (how the story changed each character): {overlays}
Scene lore cards: {lore_titles}
Lasting consequences (chronicle, oldest first): {chronicle}
Combat: {combat}

TASK:
Analyse the player's latest action and plan the next dramatic beat.
Reply ONLY with a single valid JSON object in this format:
{{
  "narration_plan": "Short direction of what happens now and what is revealed",
  "location": null,
  "time_of_day": null,
  "weather": null,
  "bg_image": null,
  "ambient_audio": null,
  "music_mood": null,
  "next_actor": "{first_party_or_player}",
  "spawn_npcs": [],
  "despawn_npcs": [],
  "dice_check": null,
  "campaign_clock_updates": [],
  "resource_delta": null,
  "condition_updates": [],
  "story_arc_updates": [],
  "objective_updates": [],
  "inventory_add": [],
  "inventory_remove": [],
  "encounter": null,
  "player_choices": [
    {{"text": "Action 1", "badge": "{example_badge}", "action_type": "do"}},
    {{"text": "Action 2", "badge": null, "action_type": "say"}},
    {{"text": "Action 3", "badge": null, "action_type": "do"}}
  ],
  "lasting_consequence": null,
  "fact_updates": {{}},
  "overlay_updates": [],
  "lore_card_updates": [],
  "discovery": null
}}

RULES:
- Write every text the player sees (player_choices text and badge, discovery, lasting_consequence, item names and descriptions, skill_name) in {reply_language}. Keep JSON keys and enum values in English.
- dice_check: when a demanding check is needed, give e.g. {{"formula": "1d20+3", "dc": 14, "skill_name": "Perception"}}, otherwise null.
- The party members [{party}] are played by their own voices after your narration: never script their words, decisions or reactions in narration_plan. Plan only the world, events and NPCs.
- next_actor: who speaks after the game master's narration? Usually the party member from [{party}] who would react first; a present/new NPC by name when they should speak; "PLAYER" only when the player must decide right now.
- spawn_npcs: introduce or return NPCs with {{"name":"Name", "archetype":"citizen|innkeeper|guard|merchant|villain|creature|sage|noble", "personality":"Brief traits and background in {reply_language}"}}. Reuse known names; never create NPCs for party members.
- despawn_npcs: names of NPCs who leave the scene. Their memories persist. Choose a present or newly spawned NPC as next_actor when they should speak.
- bg_image: optionally the name of a fitting new background image (e.g. "Horizontal Elkia Grand Library.png"), or null.
- ambient_audio: when the mood or place changes, one of these sound files: [{ambient_files}]; "None" for silence; otherwise null (keep the current one{current_ambient}).
- music_mood: when the scene's mood shifts, one of [{music_moods}] ("boss" only for a climactic fight with a major villain); otherwise null (keep the current one{current_music}).
- resource_delta: optional {{"target":"PLAYER or name", "hp_delta":-5, "stress_delta":10}}. HP and stress count outside combat too: wounds, exhaustion, fear and rest matter.
- condition_updates: optional {{"target":"PLAYER or name", "add":"Poisoned", "turns":3}} or {{"target":"name", "remove":"Poisoned"}}; condition names in {reply_language}.
- Private whispers and thoughts in the history are secret: never put their content into narration_plan or player_choices; only the whisper's recipient may react to it.
- story_arc_updates: optional {{"id":"arc-id", "stage_delta":1, "reveal":true, "resolve":false}}.
- objective_updates: optional {{"id":"objective-id", "title":"", "description":"", "progress_delta":1, "max":3, "status":"active|completed|failed"}}.
- fact_updates: keep the established facts true: {{"short_key": "new value"}} to add or change one, {{"short_key": null}} when it no longer holds. Short snake_case keys, values in {reply_language}.
- overlay_updates: when a character's situation in the story changes: {{"name": "Name", "current_role": "…", "arc_stage": "…", "facts": {{"short_key": "value or null"}}}}; omit unchanged fields.
- lore_card_updates: new or changed scene knowledge worth remembering: {{"title": "…", "content": "…", "keywords": ["word that brings it up"], "audience": "party" or "gm"}}; "gm" for secrets the players must discover. Same title updates a card.
- inventory_add: optional items with name, description, quantity, item_type and optionally hp_restore/stress_restore/clears_condition. inventory_remove holds IDs or names.
{encounter_rule}
- Reply ONLY with raw JSON, without explanations or markdown before or after it!"#,
        ambient_files = if ambient_files.is_empty() {
            "none available".to_string()
        } else {
            ambient_files
                .iter()
                .take(30)
                .cloned()
                .collect::<Vec<_>>()
                .join(", ")
        },
        current_ambient = state
            .current_ambient
            .as_deref()
            .map(|a| format!(": {a}"))
            .unwrap_or_default(),
        music_moods = crate::modules::stage_music::MOODS.join(", "),
        current_music = state
            .current_music_mood
            .as_deref()
            .map(|m| format!(": {m}"))
            .unwrap_or_default(),
        reply_language = reply_language,
        // The model copies the example badge as it is: in the player's language.
        example_badge =
            crate::modules::content_lang::ContentLang::current().t("Perception (DC 13)"),
        encounter_rule = if state.definition.is_5e() {
            super::combat5e::planner_encounter_rule(state)
        } else {
            r#"- encounter: only when combat changes: {"action":"start|update|end", "enemies":[{"name":"Enemy", "hp":12, "role":"enemy"}], "hp_updates":[{"target":"Name", "hp_delta":-4}]}."#.to_string()
        },
        tone = localized_def.gm_tone,
        narrator_style = localized_def.narrator_style,
        world_context = localized_def.world_context,
        lore_context = lore_context,
        location = state.world.location,
        time_of_day = state.world.time_of_day,
        weather = state.world.weather,
        party = party_list,
        user_name = user_name,
        clocks = if clock_context.is_empty() {
            "none"
        } else {
            &clock_context
        },
        objectives = if objective_context.is_empty() {
            "none"
        } else {
            &objective_context
        },
        arcs = arc_context,
        arc_archive = arc_archive_context(state),
        inventory = if inventory_context.is_empty() {
            "empty"
        } else {
            &inventory_context
        },
        vitals = vitals_context,
        facts = facts_context(state),
        overlays = overlays_context(state),
        lore_titles = lore_card_titles(state),
        chronicle = chronicle_context(state),
        combat = combat_context,
        first_party_or_player = state
            .definition
            .party
            .first()
            .cloned()
            .unwrap_or_else(|| "PLAYER".to_string())
    );

    // "Continue plot" (or an empty turn): the player lets the story run on.
    let continues = req.turn_mode == "continue" || clean_input.is_empty();
    let planner_user_prompt = format!(
        "=== CURRENT ACTION BY {} ===\nMode: {}\nContent: {}\n\nPlan the next beat as JSON:",
        user_name,
        match &whisper_to {
            Some(to) => format!("whisper (PRIVATE, only {to} hears it – keep it secret)"),
            None if continues => "continue".to_string(),
            None => req.turn_mode.clone(),
        },
        if continues {
            "(none – the player waits and lets the story unfold; plan the next dramatic beat yourself, \
             e.g. a development, an NPC's move or a companion taking the initiative)"
        } else {
            clean_input
        }
    );

    let planner_messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: planner_system_prompt,
            attachments: Vec::new(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: planner_user_prompt,
            attachments: Vec::new(),
        },
    ];

    let plan_req = ChatRequest {
        endpoint_url: endpoint_url.clone(),
        api_key: api_key.clone(),
        model: model_name.clone(),
        messages: planner_messages,
        sampling: Some(SamplingParams {
            temperature: Some(0.15),
            top_p: Some(0.9),
            max_tokens: Some(1000),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: provider.clone(),
    };

    let plan_req =
        super::history::prepare(state, inference, counter, Audience::Planner, plan_req).await?;
    let plan_raw = inference
        .with_abort(inference.generate_direct(plan_req))
        .await?;
    let plan_raw = plan_raw.unwrap_or_default();
    let gm_plan = repair_and_parse_gm_plan(&plan_raw);

    for draft in &gm_plan.spawn_npcs {
        if let Err(error) = upsert_npc(state, draft.clone()) {
            tracing::warn!(%error, "Invalid NPC spawn ignored");
        }
    }
    for name in &gm_plan.despawn_npcs {
        let _ = set_npc_active(state, name, false);
    }
    observe_npcs(state, observation_start);

    Some(PlanOutcome {
        gm_plan,
        active_lore_snippets,
        ambient_files,
    })
}
