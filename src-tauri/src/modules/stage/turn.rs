//! Turn orchestration: prompts the language model, applies its plan and handles rests.

use super::*;
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageTurnRequest {
    pub scene_id: String,
    #[serde(alias = "player_input")]
    pub user_input: String,
    #[serde(default = "default_turn_mode")]
    pub turn_mode: String, // "say" | "do" | "think" | "direct" | "whisper"
    #[serde(default, alias = "target_actor")]
    pub whisper_target: Option<String>,
    #[serde(default)]
    pub force_next_actor: Option<String>,
}

pub async fn execute_stage_turn(
    engine: &StageEngine,
    inference: &InferenceClient,
    req: StageTurnRequest,
    on_stream: StageStream<'_>,
) -> Result<SceneState, String> {
    // A stop request (abort_chat_generation) ends the whole turn, not just one call.
    inference.reset_abort();
    let mut state = engine.get_state();
    if state.definition.id != req.scene_id {
        state = load_scene_by_id(&req.scene_id)?;
    }

    // 0. Snapshot for Undo
    engine.push_snapshot(&state.definition.id, state.clone());
    ensure_party_vitals(&mut state);
    // A turn passes: conditions outside combat wear off (in combat they count rounds).
    tick_conditions_outside_combat(&mut state);

    let counter = crate::modules::context_window::TokenCounter::default();
    let StageLlm {
        endpoint_url,
        api_key,
        model: model_name,
        provider,
    } = StageLlm::from_settings();

    let user_name = if !state.definition.persona.is_empty() {
        state.definition.persona.clone()
    } else {
        "Spieler".to_string()
    };

    // 1. Append Player Turn Message if non-empty
    let clean_input = req.user_input.trim();
    // A whisper is known only to its recipient, who answers it.
    let whisper_to = whisper_recipient(&req.turn_mode, req.whisper_target.as_deref())
        .filter(|_| !clean_input.is_empty());
    if let Some(to) = &whisper_to {
        add_private_knowledge(
            &mut state,
            to,
            format!("{user_name} whispered to you: {clean_input}"),
        );
    }
    if !clean_input.is_empty() {
        let player_msg = SceneTurnMessage {
            id: format!("msg_{}", Utc::now().timestamp_millis()),
            sender_id: "player".to_string(),
            sender_name: user_name.clone(),
            sender_role: "player".to_string(),
            avatar_url: None,
            content: clean_input.to_string(),
            turn_mode: req.turn_mode.clone(),
            whisper_target: req.whisper_target.clone(),
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
        };
        state.chat_log.push(player_msg);
    }

    let observation_start = state
        .chat_log
        .len()
        .saturating_sub(usize::from(!clean_input.is_empty()));

    // 2. Build Planner Context & Call LLM for GmPlan
    let lang = crate::modules::content_lang::ContentLang::current();
    let reply_language = crate::modules::content_lang::ContentLang::reply_language_name();
    let lang_code = crate::modules::content_lang::language_code(&reply_language);
    let localized_def = state.definition.localized(&lang_code);
    let party_list = if state.definition.party.is_empty() {
        "none".to_string()
    } else {
        state.definition.party.join(", ")
    };

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
    let arc_context = open_arcs_context(&state);
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
    let vitals_context = party_vitals_context(&state);

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
        let all_lorebooks = crate::modules::lorebook::scan_available_lorebooks().into_iter().map(|lb| lb.localized(&lang_code)).collect::<Vec<_>>();
        let text_to_scan = recent_history.join("\n");
        for lb_name in &state.definition.lorebook {
            if let Some(lb) = all_lorebooks.iter().find(|l| {
                l.name.eq_ignore_ascii_case(lb_name) || l.id.eq_ignore_ascii_case(lb_name)
            }) {
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
        &state,
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
        r#"[SOUL STAGE — GAME MASTER PLANNER]
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
    {{"text": "Action 1", "badge": "Perception (DC 14)", "action_type": "do"}},
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
- next_actor: who speaks after the game master's narration? A party member from [{party}], a present/new NPC by name, or "PLAYER".
- spawn_npcs: introduce or return NPCs with {{"name":"Name", "archetype":"citizen|innkeeper|guard|merchant|villain|creature|sage|noble", "personality":"Brief traits and background in {reply_language}"}}. Reuse known names; never create NPCs for party members.
- despawn_npcs: names of NPCs who leave the scene. Their memories persist. Choose a present or newly spawned NPC as next_actor when they should speak.
- bg_image: optionally the name of a fitting new background image (e.g. "Horizontal Elkia Grand Library.png"), or null.
- ambient_audio: when the mood or place changes, one of these sound files: [{ambient_files}]; "None" for silence; otherwise null (keep the current one{current_ambient}).
- resource_delta: optional {{"target":"PLAYER or name", "hp_delta":-5, "stress_delta":10}}. HP and stress count outside combat too: wounds, exhaustion, fear and rest matter.
- condition_updates: optional {{"target":"PLAYER or name", "add":"Poisoned", "turns":3}} or {{"target":"name", "remove":"Poisoned"}}; condition names in {reply_language}.
- Private whispers and thoughts in the history are secret: never put their content into narration_plan or player_choices; only the whisper's recipient may react to it.
- story_arc_updates: optional {{"id":"arc-id", "stage_delta":1, "reveal":true, "resolve":false}}.
- objective_updates: optional {{"id":"objective-id", "title":"", "description":"", "progress_delta":1, "max":3, "status":"active|completed|failed"}}.
- fact_updates: keep the established facts true: {{"short_key": "new value"}} to add or change one, {{"short_key": null}} when it no longer holds. Short snake_case keys, values in {reply_language}.
- overlay_updates: when a character's situation in the story changes: {{"name": "Name", "current_role": "…", "arc_stage": "…", "facts": {{"short_key": "value or null"}}}}; omit unchanged fields.
- lore_card_updates: new or changed scene knowledge worth remembering: {{"title": "…", "content": "…", "keywords": ["word that brings it up"], "audience": "party" or "gm"}}; "gm" for secrets the players must discover. Same title updates a card.
- inventory_add: optional items with name, description, quantity, item_type and optionally hp_restore/stress_restore/clears_condition. inventory_remove holds IDs or names.
- encounter: only when combat changes: {{"action":"start|update|end", "enemies":[{{"name":"Enemy", "hp":12, "role":"enemy"}}], "hp_updates":[{{"target":"Name", "hp_delta":-4}}]}}.
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
        reply_language = reply_language,
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
        arc_archive = arc_archive_context(&state),
        inventory = if inventory_context.is_empty() {
            "empty"
        } else {
            &inventory_context
        },
        vitals = vitals_context,
        facts = facts_context(&state),
        overlays = overlays_context(&state),
        lore_titles = lore_card_titles(&state),
        chronicle = chronicle_context(&state),
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
        super::history::prepare(&mut state, inference, &counter, Audience::Planner, plan_req).await;
    let plan_raw = inference
        .generate_direct(plan_req)
        .await
        .unwrap_or_default();
    let gm_plan = repair_and_parse_gm_plan(&plan_raw);

    for draft in &gm_plan.spawn_npcs {
        if let Err(error) = upsert_npc(&mut state, draft.clone()) {
            tracing::warn!(%error, "Invalid NPC spawn ignored");
        }
    }
    for name in &gm_plan.despawn_npcs {
        let _ = set_npc_active(&mut state, name, false);
    }
    observe_npcs(&mut state, observation_start);

    // 3. Resolve Mechanics (Dice, Clocks, Resources)
    let mut dice_outcome_text = String::new();
    let mut dice_event_card = None;
    let mut secondary_event_cards: Vec<(String, StageEventCard)> = Vec::new();

    let current_actor = state
        .combat
        .combatants
        .iter()
        .find(|c| c.name == state.current_turn_actor || c.id == state.current_turn_actor);
    if let Some(check) = &gm_plan.dice_check
        && state.definition.dice_rolls_enabled
        && let Ok(roll) = roll_dice(&check.formula, Some(check.dc), current_actor)
    {
        let passed = roll.dc_check.as_ref().is_some_and(|d| d.passed);
        dice_outcome_text = format!(
            "\n[DICE CHECK {}: formula {}, rolls={}, total={}. DC={}. Result: {}]",
            check.skill_name.to_uppercase(),
            roll.formula,
            roll.individual_rolls
                .iter()
                .map(|r| r.to_string())
                .collect::<Vec<_>>()
                .join("+"),
            roll.sum,
            check.dc,
            if passed {
                "ERFOLGREICH"
            } else {
                "FEHLGESCHLAGEN"
            }
        );

        dice_event_card = Some(StageEventCard::DiceRoll(DiceEventData {
            formula: roll.formula,
            rolls: roll.individual_rolls,
            modifier: roll.modifier,
            total: roll.sum,
            target_dc: Some(check.dc),
            passed: Some(passed),
            is_crit_success: roll.is_critical_success,
            is_crit_fail: roll.is_critical_failure,
        }));
    }

    // Apply World updates from Plan
    if let Some(loc) = &gm_plan.location
        && !loc.trim().is_empty()
    {
        state.world.location = loc.clone();
    }
    if let Some(tod) = &gm_plan.time_of_day
        && !tod.trim().is_empty()
    {
        state.world.time_of_day = tod.clone();
    }
    if let Some(wth) = &gm_plan.weather
        && !wth.trim().is_empty()
    {
        state.world.weather = wth.clone();
    }
    if let Some(bg) = &gm_plan.bg_image
        && !bg.trim().is_empty()
        && !state.definition.lock_bg
    {
        state.current_bg = Some(bg.clone());
    }
    // Only known files (or silence); a made-up name would just stop the sound.
    if let Some(choice) = gm_plan.ambient_audio.as_deref().map(str::trim)
        && !choice.is_empty()
        && !state.definition.disable_ambient
    {
        match ambient_name(choice) {
            None => state.current_ambient = None,
            Some(name) => {
                if let Some(file) = ambient_files.iter().find(|f| f.eq_ignore_ascii_case(&name)) {
                    state.current_ambient = Some(file.clone());
                }
            }
        }
    }

    // Apply Clock updates
    for clk_up in &gm_plan.campaign_clock_updates {
        if let Some(c) = state.clocks.iter_mut().find(|c| c.id == clk_up.id) {
            let new_val = (c.current as i32 + clk_up.delta).clamp(0, c.max as i32) as u32;
            c.current = new_val;
            secondary_event_cards.push((
                lang.pick(
                    "Die Kampagnen-Uhr „{}“ verändert sich.",
                    "The campaign clock “{}” changes.",
                    "Часы кампании «{}» меняются.",
                )
                .replace("{}", &c.name),
                StageEventCard::ClockUpdate(ClockUpdateData {
                    clock_id: c.id.clone(),
                    clock_name: c.name.clone(),
                    delta: clk_up.delta,
                    current: c.current,
                    max: c.max,
                }),
            ));
        }
    }

    if let Some(delta) = &gm_plan.resource_delta {
        let target = delta.target.trim();
        if let Some(combatant) = state.combat.combatants.iter_mut().find(|combatant| {
            (target.eq_ignore_ascii_case("PLAYER") && combatant.role == "player")
                || combatant.name.eq_ignore_ascii_case(target)
                || combatant.id.eq_ignore_ascii_case(target)
        }) {
            combatant.hp = (combatant.hp + delta.hp_delta).clamp(0, combatant.max_hp);
            combatant.stress =
                (combatant.stress + delta.stress_delta).clamp(0, combatant.max_stress);
            state.combat.combat_log.push(format!(
                "{}: HP {:+}, Stress {:+}",
                combatant.name, delta.hp_delta, delta.stress_delta
            ));
        }
    }

    for update in &gm_plan.condition_updates {
        if let Some(combatant) = find_combatant(&mut state, &update.target) {
            if let Some(name) = update
                .add
                .as_deref()
                .map(str::trim)
                .filter(|n| !n.is_empty())
            {
                combatant
                    .conditions
                    .retain(|c| !c.name.eq_ignore_ascii_case(name));
                combatant.conditions.push(CombatCondition {
                    name: name.to_string(),
                    rounds_remaining: update.turns.clamp(1, 20),
                });
            }
            if let Some(name) = update.remove.as_deref().map(str::trim) {
                combatant
                    .conditions
                    .retain(|c| !c.name.eq_ignore_ascii_case(name));
            }
        }
    }

    for update in &gm_plan.story_arc_updates {
        if let Some(arc) = state.arcs.iter_mut().find(|arc| arc.id == update.id) {
            arc.stage =
                (arc.stage as i32 + update.stage_delta).clamp(0, arc.max_stage as i32) as u32;
            arc.is_revealed |= update.reveal;
            arc.is_resolved |= update.resolve || arc.stage >= arc.max_stage;
            if update.reveal || update.resolve || update.stage_delta != 0 {
                secondary_event_cards.push((
                    format!("Story-Arc aktualisiert: {}", arc.title),
                    StageEventCard::Discovery {
                        text: format!(
                            "{} — Fortschritt {}/{}{}",
                            arc.title,
                            arc.stage,
                            arc.max_stage,
                            if arc.is_resolved {
                                " (abgeschlossen)"
                            } else {
                                ""
                            }
                        ),
                    },
                ));
            }
        }
    }

    for update in &gm_plan.objective_updates {
        if let Some(objective) = state
            .objectives
            .iter_mut()
            .find(|objective| objective.id == update.id)
        {
            if !update.title.trim().is_empty() {
                objective.title = update.title.clone();
            }
            if !update.description.trim().is_empty() {
                objective.description = update.description.clone();
            }
            if let Some(maximum) = update.max {
                objective.max = maximum.max(1);
            }
            objective.current = (objective.current as i32 + update.progress_delta)
                .clamp(0, objective.max as i32) as u32;
            if let Some(status) = &update.status {
                objective.status = status.clone();
            }
            if objective.current >= objective.max && objective.status == "active" {
                objective.status = "completed".to_string();
            }
        } else if !update.title.trim().is_empty() {
            let maximum = update.max.unwrap_or(1).max(1);
            state.objectives.push(CampaignObjective {
                id: update.id.clone(),
                title: update.title.clone(),
                description: update.description.clone(),
                current: update.progress_delta.max(0).min(maximum as i32) as u32,
                max: maximum,
                status: update
                    .status
                    .clone()
                    .unwrap_or_else(default_objective_status),
            });
        }
    }

    for addition in &gm_plan.inventory_add {
        if let Some(existing) = state
            .inventory
            .iter_mut()
            .find(|item| item.name.eq_ignore_ascii_case(&addition.name))
        {
            existing.quantity = existing.quantity.saturating_add(addition.quantity.max(1));
        } else if !addition.name.trim().is_empty() {
            state.inventory.push(InventoryItem {
                id: format!("item_{}", Utc::now().timestamp_micros()),
                name: addition.name.clone(),
                description: addition.description.clone(),
                quantity: addition.quantity.max(1),
                item_type: addition.item_type.clone(),
                hp_restore: addition.hp_restore,
                stress_restore: addition.stress_restore,
                clears_condition: addition.clears_condition.clone(),
            });
        }
    }
    for removal in &gm_plan.inventory_remove {
        if let Some(index) = state.inventory.iter().position(|item| {
            item.id.eq_ignore_ascii_case(removal) || item.name.eq_ignore_ascii_case(removal)
        }) {
            if state.inventory[index].quantity > 1 {
                state.inventory[index].quantity -= 1;
            } else {
                state.inventory.remove(index);
            }
        }
    }

    if let Some(encounter) = &gm_plan.encounter {
        match encounter.action.as_str() {
            "start" => {
                ensure_party_vitals(&mut state);
                for combatant in state
                    .combat
                    .combatants
                    .iter_mut()
                    .filter(|c| c.initiative == 0)
                {
                    combatant.initiative = rand::rng().random_range(1..=20);
                }
                state.combat.is_active = true;
                state.combat.round = 1;
                state.combat.current_turn_index = 0;
                state.combat.combatants.retain(|combatant| {
                    combatant.role == "player" || combatant.role == "companion"
                });
                if !state
                    .combat
                    .combatants
                    .iter()
                    .any(|combatant| combatant.role == "player")
                {
                    state.combat.combatants.push(Combatant {
                        id: "player".to_string(),
                        name: user_name.clone(),
                        role: "player".to_string(),
                        hp: 50,
                        max_hp: 50,
                        stress: 0,
                        max_stress: 100,
                        initiative: rand::rng().random_range(1..=20),
                        conditions: Vec::new(),
                        skills: std::collections::HashMap::new(),
                    });
                }
                for (index, enemy) in encounter.enemies.iter().enumerate() {
                    state.combat.combatants.push(Combatant {
                        id: format!("enemy_{}_{}", Utc::now().timestamp_millis(), index),
                        name: enemy.name.clone(),
                        role: enemy.role.clone(),
                        hp: enemy.hp.max(1),
                        max_hp: enemy.hp.max(1),
                        stress: 0,
                        max_stress: 0,
                        initiative: rand::rng().random_range(1..=20),
                        conditions: Vec::new(),
                        skills: std::collections::HashMap::new(),
                    });
                }
                state
                    .combat
                    .combatants
                    .sort_by_key(|c| std::cmp::Reverse(c.initiative));
                secondary_event_cards.push((
                    lang.pick(
                        "Eine Kampfbegegnung beginnt.",
                        "An encounter begins.",
                        "Начинается схватка.",
                    )
                    .to_string(),
                    StageEventCard::Combat {
                        action: "started".to_string(),
                        text: lang
                            .pick(
                                "Initiative wird gewürfelt — der Kampf beginnt!",
                                "Roll for initiative — the fight begins!",
                                "Бросок инициативы — бой начинается!",
                            )
                            .to_string(),
                    },
                ));
            }
            "end" => {
                state.combat.is_active = false;
                remove_enemies(&mut state);
                secondary_event_cards.push((
                    lang.pick(
                        "Die Kampfbegegnung endet.",
                        "The encounter ends.",
                        "Схватка окончена.",
                    )
                    .to_string(),
                    StageEventCard::Combat {
                        action: "ended".to_string(),
                        text: lang
                            .pick(
                                "Der Kampf ist beendet.",
                                "The fight is over.",
                                "Бой окончен.",
                            )
                            .to_string(),
                    },
                ));
            }
            _ => {}
        }
        for update in &encounter.hp_updates {
            if let Some(target) = state.combat.combatants.iter_mut().find(|combatant| {
                combatant.name.eq_ignore_ascii_case(&update.target) || combatant.id == update.target
            }) {
                target.hp = (target.hp + update.hp_delta).clamp(0, target.max_hp);
            }
        }
        if state.combat.is_active
            && state
                .combat
                .combatants
                .iter()
                .filter(|combatant| combatant.role == "enemy" || combatant.role == "boss")
                .all(|combatant| combatant.hp == 0)
        {
            state.combat.is_active = false;
        }
    }

    if let Some(discovery) = &gm_plan.discovery
        && !discovery.trim().is_empty()
    {
        secondary_event_cards.push((
            discovery.clone(),
            StageEventCard::Discovery {
                text: discovery.clone(),
            },
        ));
    }
    apply_fact_updates(&mut state, &gm_plan.fact_updates);
    apply_overlay_updates(&mut state, &gm_plan.overlay_updates);
    apply_lore_card_updates(&mut state, &gm_plan.lore_card_updates);

    if let Some(consequence) = &gm_plan.lasting_consequence
        && !consequence.trim().is_empty()
    {
        state.consequence_ledger.push(ConsequenceEntry {
            id: format!("consequence_{}", Utc::now().timestamp_millis()),
            text: consequence.clone(),
            created_at: Utc::now().to_rfc3339(),
        });
        secondary_event_cards.push((
            consequence.clone(),
            StageEventCard::Consequence {
                text: consequence.clone(),
            },
        ));
    }

    // 4. GM Executor: Generate Narrative prose
    let executor_system_prompt = format!(
        r#"[SOUL STAGE — GAME MASTER NARRATOR]
You are the game master in the genre "{tone}".
Narrate what happens in this style:
{narrator_style}

Location: {location} ({time_of_day}, {weather})
Party: {party}
Player: {user_name}

Plan to follow:
{narration_plan}
{dice_outcome}

RULES:
- Write gripping, atmospheric narration in {reply_language}, in the present tense.
- If there was a dice check, weave its outcome in logically and dramatically.
- Reply ONLY with the narration, without meta comments or addressing the reader."#,
        reply_language = reply_language,
        tone = localized_def.gm_tone,
        narrator_style = localized_def.narrator_style,
        location = state.world.location,
        time_of_day = state.world.time_of_day,
        weather = state.world.weather,
        party = party_list,
        user_name = user_name,
        narration_plan = gm_plan.narration_plan,
        dice_outcome = dice_outcome_text
    );

    let executor_messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: executor_system_prompt,
            attachments: Vec::new(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: if continues {
                "Continue the scene with the next beat; the player is waiting to see what happens."
                    .to_string()
            } else {
                format!(
                    "Narrate what happens after this action: '{}'",
                    match (&whisper_to, req.turn_mode.as_str()) {
                        // The narrator describes only what everyone can perceive.
                        (Some(to), _) => format!(
                            "{user_name} leans close to {to} and whispers something nobody else can hear"
                        ),
                        (None, "think") => format!("{user_name} is silently lost in thought"),
                        _ => clean_input.to_string(),
                    }
                )
            },
            attachments: Vec::new(),
        },
    ];

    let exec_req = ChatRequest {
        endpoint_url: endpoint_url.clone(),
        api_key: api_key.clone(),
        model: model_name.clone(),
        messages: executor_messages,
        sampling: Some(SamplingParams {
            temperature: Some(0.7),
            top_p: Some(0.9),
            max_tokens: Some(1500),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: provider.clone(),
    };

    let exec_req = super::history::prepare(
        &mut state,
        inference,
        &counter,
        Audience::Narrator,
        exec_req,
    )
    .await;
    let gm_msg_id = format!("msg_{}", Utc::now().timestamp_millis());
    let narration_content = stream_message(
        inference,
        exec_req,
        on_stream,
        &gm_msg_id,
        "Game Master",
        "gm",
        None,
    )
    .await
    .ok()
    // Failed, or stopped before the first word: the planner's outline stands in.
    .filter(|text| !text.trim().is_empty())
    .unwrap_or_else(|| gm_plan.narration_plan.clone());

    let gm_turn_msg = SceneTurnMessage {
        id: gm_msg_id,
        sender_id: "gm".to_string(),
        sender_name: "Game Master".to_string(),
        sender_role: "gm".to_string(),
        avatar_url: None,
        content: narration_content.clone(),
        turn_mode: "do".to_string(),
        whisper_target: None,
        event_card: dice_event_card,
        timestamp: Utc::now().timestamp() as u64,
    };
    state.chat_log.push(gm_turn_msg);

    for (index, (content, card)) in secondary_event_cards.into_iter().enumerate() {
        state.chat_log.push(SceneTurnMessage {
            id: format!("msg_{}_{}", Utc::now().timestamp_millis(), index),
            sender_id: "system".to_string(),
            sender_name: "Kampagnen-Chronik".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content,
            turn_mode: "direct".to_string(),
            whisper_target: None,
            event_card: Some(card),
            timestamp: Utc::now().timestamp() as u64,
        });
    }

    observe_npcs(&mut state, observation_start);

    // 5. Next Actor Turn (reactions up to max_actor_depth). Priority: the player's explicit
    // choice, a whisper's recipient, whoever the player addressed by name, then the planner.
    let addressed = (!continues && whisper_to.is_none())
        .then(|| detect_direct_address(clean_input, &speaking_cast(&state)))
        .flatten();
    let initial_next = req
        .force_next_actor
        .as_deref()
        .filter(|actor| !actor.trim().is_empty())
        .or(whisper_to.as_deref())
        .or(addressed.as_deref())
        .or(gm_plan.next_actor.as_deref())
        .unwrap_or("PLAYER")
        .to_string();

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
        if let Some(npc) = find_npc(&state, current_actor.trim()) {
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

        let npc = find_npc(&state, &current_actor)
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
            let matched_char = all_chars
                .iter()
                .find(|c| c.card.data.name.eq_ignore_ascii_case(&current_actor));

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
                private_knowledge_block(&state, &current_actor),
                overlay_block(&state, &current_actor)
            );
            let companion_system = if let Some(npc) = &npc {
                let localized_npc = npc.localized(&lang_code);
                format!(
                    "[SOUL STAGE — NPC]\nYou are {} ({}).\nPersonality and background: {}\nScene context: {}{lore_section}\nReact in the first person to events you witnessed. Stay in character; keep it concise. Reply in {reply_language}.{}{}",
                    localized_npc.name,
                    localized_npc.archetype,
                    localized_npc.personality,
                    localized_def.world_context,
                    npc_memory_block(npc, clean_input),
                    secrets
                )
            } else if let Some(ch) = matched_char {
                let localized_char =
                    ch.card
                        .data
                        .localized(&crate::modules::content_lang::language_code(
                            &reply_language,
                        ));
                format!(
                    r#"You are {name}.
Personality: {personality}
Background: {description}
Scene context: {world_context}{lore_section}

React in the first person to what the game master, {user_name} and any companions just did or said.
Stay fully in character, use your own voice and express your feelings vividly and authentically. Keep it concise.
Reply in {reply_language}.{secrets}"#,
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

            let comp_req = super::history::prepare(
                &mut state,
                inference,
                &counter,
                Audience::Character(&current_actor),
                comp_req,
            )
            .await;
            let comp_msg_id = format!("msg_{}_{}", Utc::now().timestamp_millis(), actor_depth);
            let avatar_url = npc
                .as_ref()
                .map(|n| npc_avatar(&n.archetype))
                .or_else(|| matched_char.and_then(|c| c.avatar_data_url.clone()));
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
                };
                state.chat_log.push(companion_msg);
                if let Some(npc) = npc
                    && let Some(stored) = state.npcs.iter_mut().find(|n| n.id == npc.id)
                {
                    stored.turn_count += 1;
                }
                observe_npcs(&mut state, observation_start);
            }
        }

        // Who reacts next: someone addressed by name, else the routing call decides.
        current_actor = if inference.is_aborted() || actor_depth >= max_depth {
            "PLAYER".to_string()
        } else {
            let speaker = current_actor.clone();
            let candidates: Vec<String> = speaking_cast(&state)
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
                                    &recent_speakers(&state, 10),
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
                        let routed = inference
                            .generate_direct(routing)
                            .await
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

    // 6. Update pending choices and save
    if !gm_plan.player_choices.is_empty() {
        state.pending_choices = gm_plan.player_choices;
    } else {
        state.pending_choices = vec![
            TaggedChoice {
                text: lang
                    .pick(
                        "Vorsichtig weiter vorrücken",
                        "Advance carefully",
                        "Осторожно продвигаться дальше",
                    )
                    .to_string(),
                badge: None,
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: lang
                    .pick(
                        "Die Umgebung absichern und untersuchen",
                        "Secure and search the surroundings",
                        "Обезопасить и осмотреть окрестности",
                    )
                    .to_string(),
                badge: Some(
                    lang.pick("Wahrnehmung", "Perception", "Восприятие")
                        .to_string(),
                ),
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: lang
                    .pick(
                        "Mit den Gefährten die nächste Aktion abstimmen",
                        "Agree on the next move with the companions",
                        "Обсудить со спутниками следующий шаг",
                    )
                    .to_string(),
                badge: None,
                action_type: "say".to_string(),
            },
        ];
    }

    state.current_turn_actor = "PLAYER".to_string();
    state.definition.last_played = Some(Utc::now().to_rfc3339());

    // Long-term upkeep (skipped after "Stop"): archive resolved arcs, check facts now and then.
    if !inference.is_aborted() {
        let llm = StageLlm {
            endpoint_url: endpoint_url.clone(),
            api_key: api_key.clone(),
            model: model_name.clone(),
            provider: provider.clone(),
        };
        archive_resolved_arcs(&mut state, inference, &llm).await;
        audit_facts(&mut state, inference, &llm).await;
    }

    engine.set_state(state.clone());
    save_scene_state(&state)?;

    Ok(state)
}

/// Streams one turn message to the UI (`on_stream`) and returns its full text.
async fn stream_message(
    inference: &InferenceClient,
    request: ChatRequest,
    on_stream: StageStream<'_>,
    message_id: &str,
    sender_name: &str,
    sender_role: &str,
    avatar_url: Option<String>,
) -> Result<String, String> {
    let event = |text: String, done: bool| StageStreamEvent {
        message_id: message_id.to_string(),
        sender_name: sender_name.to_string(),
        sender_role: sender_role.to_string(),
        avatar_url: avatar_url.clone(),
        text,
        done,
    };
    let result = inference
        .stream_text(request, |text| on_stream(event(text.to_string(), false)))
        .await;
    on_stream(event(String::new(), true));
    result
}

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
            lang.pick("Abend", "Evening", "Вечер")
        } else if noon {
            lang.pick("Mitternacht", "Midnight", "Полночь")
        } else {
            lang.pick("Morgen", "Morning", "Утро")
        }
        .to_string();
        (
            40,
            30,
            lang.pick(
                "Lange Rast vollendet: Die Gruppe hat ein sicheres Lager aufgeschlagen, neue Kräfte gesammelt und die Ausrüstung gewartet.",
                "Long rest complete: the party made a safe camp, regained their strength and tended to their gear.",
                "Долгий отдых завершён: отряд разбил безопасный лагерь, восстановил силы и привёл снаряжение в порядок.",
            ),
        )
    } else {
        (
            15,
            10,
            lang.pick(
                "Kurze Rast: Ein Moment des Durchatmens am Lagerfeuer lindert die Erschöpfung.",
                "Short rest: a moment to breathe by the campfire eases the exhaustion.",
                "Короткий отдых: минута передышки у костра снимает усталость.",
            ),
        )
    };

    // Heal combatants
    for c in state.combat.combatants.iter_mut() {
        if c.role == "player" || c.role == "companion" {
            c.hp = (c.hp + hp_rec).min(c.max_hp);
            c.stress = (c.stress - stress_rec).max(0);
            if rest_type == "long" {
                c.conditions.clear();
            }
        }
    }

    let player_name = if state.definition.persona.is_empty() {
        lang.pick("Spieler", "Player", "Игрок").to_string()
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
                role_view: lang.pick("Gefährte", "Companion", "Спутник").to_string(),
                last_shift_reason: String::new(),
            });
            state.relationships.len() - 1
        };
        let relationship = &mut state.relationships[relationship_index];
        let before = relationship.affinity;
        relationship.affinity = (relationship.affinity + affinity_gain).clamp(-100, 100);
        relationship.last_shift_reason = if rest_type == "long" {
            lang.pick("Gemeinsames Lagerfeuer", "Shared campfire", "Общий костёр")
                .to_string()
        } else {
            lang.pick("Gemeinsame Rast", "Shared rest", "Совместный отдых")
                .to_string()
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
    };
    state.chat_log.push(rest_msg);

    for (index, (companion, affinity, milestone)) in bond_milestones.into_iter().enumerate() {
        state.chat_log.push(SceneTurnMessage {
            id: format!("msg_bond_{}_{}", Utc::now().timestamp_millis(), index),
            sender_id: "system".to_string(),
            sender_name: lang
                .pick("Beziehungs-Meilenstein", "Bond milestone", "Этап отношений")
                .to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content: lang
                .pick(
                    "Die Bindung zu {name} hat Stufe {level} erreicht.",
                    "Your bond with {name} reached level {level}.",
                    "Связь с {name} достигла уровня {level}.",
                )
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
                .pick(
                    "Es tut gut, für einen Augenblick innezuhalten. Wir müssen auf der Hut bleiben, aber gemeinsam schaffen wir das.",
                    "It feels good to pause for a moment. We have to stay on guard, but together we'll make it.",
                    "Хорошо ненадолго остановиться. Нужно быть начеку, но вместе мы справимся.",
                )
                .to_string(),
            turn_mode: "say".to_string(),
            whisper_target: None,
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
        };
        state.chat_log.push(comp_msg);
    }

    observe_npcs(&mut state, observation_start);
    engine.set_state(state.clone());
    save_scene_state(&state)?;

    Ok(state)
}
