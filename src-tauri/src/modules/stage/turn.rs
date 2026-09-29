//! Turn orchestration: prompts the language model, applies its plan and handles rests.

use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
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
) -> Result<SceneState, String> {
    let mut state = engine.get_state();
    if state.definition.id != req.scene_id {
        state = load_scene_by_id(&req.scene_id)?;
    }

    // 0. Snapshot for Undo
    engine.push_snapshot(&state.definition.id, state.clone());

    let settings = load_app_settings();
    let (endpoint_url, api_key, model_name, provider) = if settings.selected_backend == "cloud" {
        (
            settings.cloud_endpoint.clone(),
            if settings.cloud_api_key.is_empty() {
                None
            } else {
                Some(settings.cloud_api_key.clone())
            },
            if settings.cloud_model.is_empty() {
                None
            } else {
                Some(settings.cloud_model.clone())
            },
            Some(
                crate::modules::providers::ProviderRegistry::detect_provider(
                    &settings.cloud_endpoint,
                    None,
                ),
            ),
        )
    } else {
        (
            format!(
                "http://127.0.0.1:{}/v1/chat/completions",
                settings.server_config.port
            ),
            None,
            None,
            Some(crate::modules::providers::LlmProviderType::LocalLlama),
        )
    };

    let user_name = if !state.definition.persona.is_empty() {
        state.definition.persona.clone()
    } else {
        "Spieler".to_string()
    };

    // 1. Append Player Turn Message if non-empty
    let clean_input = req.user_input.trim();
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

    // 2. Build Planner Context & Call LLM for GmPlan
    let party_list = if state.definition.party.is_empty() {
        "Keine".to_string()
    } else {
        state.definition.party.join(", ")
    };

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
    let arc_context = state
        .arcs
        .iter()
        .map(|arc| {
            format!(
                "{} [{}]: {}/{}{}",
                arc.title,
                arc.id,
                arc.stage,
                arc.max_stage,
                if arc.is_revealed {
                    " sichtbar"
                } else {
                    " verborgen"
                }
            )
        })
        .collect::<Vec<_>>()
        .join("; ");
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
        "kein aktiver Kampf".to_string()
    };

    let recent_history: Vec<String> = state
        .chat_log
        .iter()
        .rev()
        .take(6)
        .rev()
        .map(|m| format!("{}: {}", m.sender_name, m.content))
        .collect();

    // Scan bound lorebooks for Stage-Lore
    let mut active_lore_snippets = Vec::new();
    if !state.definition.lorebook.is_empty() {
        let all_lorebooks = crate::modules::lorebook::scan_available_lorebooks();
        let text_to_scan = format!("{}\n{}", clean_input, recent_history.join("\n"));
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
    let lore_context = if active_lore_snippets.is_empty() {
        "keine".to_string()
    } else {
        active_lore_snippets.join("\n")
    };

    let planner_system_prompt = format!(
        r#"[SOUL STAGE — GAME MASTER PLANNER]
Du bist der Spielleiter (Game Master) für ein immersives Tabletop-RPG im Genre/Ton "{tone}".
Narrator-Stil: {narrator_style}
Szenen-Kontext: {world_context}
Stage-Lore / Weltwissen:
{lore_context}
Aktueller Ort: {location} ({time_of_day}, Wetter: {weather})
Gruppe: {party}
Spieler: {user_name}
Kampagnen-Uhren: {clocks}
Ziele: {objectives}
Story-Arcs: {arcs}
Inventar: {inventory}
Kampf: {combat}

AUFGABE:
Analysiere die jüngste Aktion des Spielers und plane den nächsten dramatischen Beat.
Antworte AUSSCHLIESSLICH mit einem einzigen, gültigen JSON-Objekt im folgenden Format:
{{
  "narration_plan": "Kurze Regie-Anweisung, was jetzt geschieht und enthüllt wird",
  "location": null,
  "time_of_day": null,
  "weather": null,
  "bg_image": null,
  "ambient_audio": null,
  "next_actor": "{first_party_or_player}",
  "dice_check": null,
  "campaign_clock_updates": [],
  "resource_delta": null,
  "story_arc_updates": [],
  "objective_updates": [],
  "inventory_add": [],
  "inventory_remove": [],
  "encounter": null,
  "player_choices": [
    {{"text": "Aktion 1", "badge": "Wahrnehmung (DC 14)", "action_type": "do"}},
    {{"text": "Aktion 2", "badge": null, "action_type": "say"}},
    {{"text": "Aktion 3", "badge": null, "action_type": "do"}}
  ],
  "lasting_consequence": null,
  "discovery": null
}}

REGELN:
- dice_check: Wenn eine anspruchsvolle Probe nötig ist, gib z.B. {{"formula": "1d20+3", "dc": 14, "skill_name": "Wahrnehmung"}} an, sonst null.
- next_actor: Wer soll nach der Spielleiter-Schilderung sprechen? Ein Gruppenmitglied aus [{party}] oder "PLAYER".
- bg_image: Optional Name eines neuen passenden Hintergrundbildes (z.B. "Horizontal Elkia Grand Library.png") oder null.
- resource_delta: Optional {{"target":"PLAYER oder Name", "hp_delta":-5, "stress_delta":10}}.
- story_arc_updates: Optional {{"id":"arc-id", "stage_delta":1, "reveal":true, "resolve":false}}.
- objective_updates: Optional {{"id":"objective-id", "title":"", "description":"", "progress_delta":1, "max":3, "status":"active|completed|failed"}}.
- inventory_add: Optional Gegenstände mit name, description, quantity, item_type und optional hp_restore/stress_restore/clears_condition. inventory_remove enthält IDs oder Namen.
- encounter: Nur bei Kampfänderungen: {{"action":"start|update|end", "enemies":[{{"name":"Gegner", "hp":12, "role":"enemy"}}], "hp_updates":[{{"target":"Name", "hp_delta":-4}}]}}.
- Antworte NUR als reines JSON ohne Erklärungen oder Markdown davor/danach!"#,
        tone = state.definition.gm_tone,
        narrator_style = state.definition.narrator_style,
        world_context = state.definition.world_context,
        lore_context = lore_context,
        location = state.world.location,
        time_of_day = state.world.time_of_day,
        weather = state.world.weather,
        party = party_list,
        user_name = user_name,
        clocks = if clock_context.is_empty() {
            "keine"
        } else {
            &clock_context
        },
        objectives = if objective_context.is_empty() {
            "keine"
        } else {
            &objective_context
        },
        arcs = if arc_context.is_empty() {
            "keine"
        } else {
            &arc_context
        },
        inventory = if inventory_context.is_empty() {
            "leer"
        } else {
            &inventory_context
        },
        combat = combat_context,
        first_party_or_player = state
            .definition
            .party
            .first()
            .cloned()
            .unwrap_or_else(|| "PLAYER".to_string())
    );

    let planner_user_prompt = format!(
        "=== LETZTER VERLAUF ===\n{}\n\n=== AKTUELLE AKTION VON {} ===\nModus: {}\nInhalt: {}\n\nPlane den nächsten Beat als JSON:",
        recent_history.join("\n"),
        user_name,
        req.turn_mode,
        clean_input
    );

    let planner_messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: planner_system_prompt,
        },
        ChatMessage {
            role: "user".to_string(),
            content: planner_user_prompt,
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

    let plan_raw = inference
        .generate_direct(plan_req)
        .await
        .unwrap_or_default();
    let gm_plan = repair_and_parse_gm_plan(&plan_raw);

    // 3. Resolve Mechanics (Dice, Clocks, Resources)
    let mut dice_outcome_text = String::new();
    let mut dice_event_card = None;
    let mut secondary_event_cards: Vec<(String, StageEventCard)> = Vec::new();

    if let Some(check) = &gm_plan.dice_check
        && state.definition.dice_rolls_enabled
        && let Ok(roll) = roll_dice(&check.formula, Some(check.dc))
    {
        let passed = roll.dc_check.as_ref().is_some_and(|d| d.passed);
        dice_outcome_text = format!(
            "\n[WÜRFELPROBE {}: Formel {}, Wurf={}, Summe={}. DC={}. Ergebnis: {}]",
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
        state.definition.starting_bg = bg.clone();
        state.current_bg = Some(bg.clone());
    }

    // Apply Clock updates
    for clk_up in &gm_plan.campaign_clock_updates {
        if let Some(c) = state.clocks.iter_mut().find(|c| c.id == clk_up.id) {
            let new_val = (c.current as i32 + clk_up.delta).clamp(0, c.max as i32) as u32;
            c.current = new_val;
            secondary_event_cards.push((
                format!("Die Kampagnen-Uhr „{}“ verändert sich.", c.name),
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
                    });
                }
                state
                    .combat
                    .combatants
                    .sort_by_key(|c| std::cmp::Reverse(c.initiative));
                secondary_event_cards.push((
                    "Eine Kampfbegegnung beginnt.".to_string(),
                    StageEventCard::Combat {
                        action: "started".to_string(),
                        text: "Initiative wird gewürfelt — der Kampf beginnt!".to_string(),
                    },
                ));
            }
            "end" => {
                state.combat.is_active = false;
                secondary_event_cards.push((
                    "Die Kampfbegegnung endet.".to_string(),
                    StageEventCard::Combat {
                        action: "ended".to_string(),
                        text: "Der Kampf ist beendet.".to_string(),
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
Du bist der Game Master im Genre "{tone}".
Schreibe die Schilderung dessen, was geschieht, im folgenden Stil:
{narrator_style}

Szenenort: {location} ({time_of_day}, {weather})
Gruppe: {party}
Spieler: {user_name}

Anweisung des Plans:
{narration_plan}
{dice_outcome}

REGELN:
- Verfasse packende, atmosphärische Schilderung auf Deutsch im Präsens.
- Falls eine Würfelprobe vorliegt, flechte deren Ausgang logisch und dramatisch ein.
- Antworte NUR mit der Schilderung, ohne Meta-Kommentare oder Anreden."#,
        tone = state.definition.gm_tone,
        narrator_style = state.definition.narrator_style,
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
        },
        ChatMessage {
            role: "user".to_string(),
            content: format!(
                "Beschreibe das Geschehen basierend auf der Aktion: '{}'",
                clean_input
            ),
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

    let narration_content = inference
        .generate_direct(exec_req)
        .await
        .unwrap_or_else(|_| gm_plan.narration_plan.clone());

    let gm_turn_msg = SceneTurnMessage {
        id: format!("msg_{}", Utc::now().timestamp_millis()),
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

    // 5. Next Actor Turn (Party Member reactions up to max_actor_depth)
    let initial_next = req
        .force_next_actor
        .as_deref()
        .filter(|actor| !actor.trim().is_empty())
        .or(gm_plan.next_actor.as_deref())
        .unwrap_or("PLAYER")
        .to_string();

    let max_depth = state.definition.max_actor_depth.max(1);
    let mut current_actor = initial_next;
    let mut actor_depth = 0;
    let mut spoken_actors = std::collections::HashSet::new();

    while current_actor != "PLAYER" && actor_depth < max_depth {
        actor_depth += 1;
        state.current_turn_actor = current_actor.clone();
        spoken_actors.insert(current_actor.to_lowercase());

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

        if state
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
                    "\n\nAktive Welt- und Szenen-Informationen:\n{}",
                    active_lore_snippets.join("\n---\n")
                )
            } else {
                String::new()
            };

            let companion_system = if let Some(ch) = matched_char {
                format!(
                    r#"Du bist {name}.
Persönlichkeit: {personality}
Hintergrund: {description}
Szenen-Kontext: {world_context}{lore_section}

Reagiere nun aus der Ich-Perspektive auf das, was der Spielleiter, {user_name} und eventuelle Gefährten soeben getan oder gesagt haben.
Bleibe absolut in deiner Rolle, nutze deine eigene Stimme und drücke deine Gefühle lebendig und authentisch aus. Fasse dich prägnant."#,
                    name = ch.card.data.name,
                    personality = ch.card.data.personality,
                    description = ch.card.data.description,
                    world_context = state.definition.world_context,
                    lore_section = lore_section,
                    user_name = user_name
                )
            } else {
                format!(
                    "Du bist {}. Reagiere aus deiner Sicht auf das Geschehen.{lore_section}",
                    current_actor,
                    lore_section = lore_section
                )
            };

            let recent_history_dialogue: Vec<String> = state
                .chat_log
                .iter()
                .rev()
                .take(5)
                .rev()
                .map(|m| format!("{}: {}", m.sender_name, m.content))
                .collect();
            let history_text = recent_history_dialogue.join("\n\n");

            let companion_messages = vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: companion_system,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: format!(
                        "Aktueller Verlauf:\n{}\n\nReagiere als {}:",
                        history_text, current_actor
                    ),
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

            if let Ok(comp_text) = inference.generate_direct(comp_req).await {
                let companion_msg = SceneTurnMessage {
                    id: format!("msg_{}_{}", Utc::now().timestamp_millis(), actor_depth),
                    sender_id: current_actor.clone(),
                    sender_name: current_actor.clone(),
                    sender_role: "companion".to_string(),
                    avatar_url: matched_char.and_then(|c| c.avatar_data_url.clone()),
                    content: comp_text,
                    turn_mode: "say".to_string(),
                    whisper_target: None,
                    event_card: None,
                    timestamp: Utc::now().timestamp() as u64,
                };
                state.chat_log.push(companion_msg);
            }
        }

        // Determine if another party member should react
        if actor_depth < max_depth {
            if let Some(next_party_member) = state
                .definition
                .party
                .iter()
                .find(|p| !spoken_actors.contains(&p.to_lowercase()))
            {
                current_actor = next_party_member.clone();
            } else {
                current_actor = "PLAYER".to_string();
            }
        } else {
            current_actor = "PLAYER".to_string();
        }
    }

    // 6. Update pending choices and save
    if !gm_plan.player_choices.is_empty() {
        state.pending_choices = gm_plan.player_choices;
    } else {
        state.pending_choices = vec![
            TaggedChoice {
                text: "Vorsichtig weiter vorrücken".to_string(),
                badge: None,
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: "Die Umgebung absichern und untersuchen".to_string(),
                badge: Some("Wahrnehmung".to_string()),
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: "Mit den Gefährten die nächste Aktion abstimmen".to_string(),
                badge: None,
                action_type: "say".to_string(),
            },
        ];
    }

    state.current_turn_actor = "PLAYER".to_string();
    state.definition.last_played = Some(Utc::now().to_rfc3339());

    engine.set_state(state.clone());
    save_scene_state(&state)?;

    Ok(state)
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

    let (hp_rec, stress_rec, note) = if rest_type == "long" {
        state.world.time_of_day = match state.world.time_of_day.as_str() {
            "Morgen" => "Abend".to_string(),
            "Mittag" => "Mitternacht".to_string(),
            _ => "Morgen".to_string(),
        };
        (
            40,
            30,
            "Lange Rast vollendet: Die Gruppe hat ein sicheres Lager aufgeschlagen, neue Kräfte gesammelt und die Ausrüstung gewartet.",
        )
    } else {
        (
            15,
            10,
            "Kurze Rast: Ein Moment des Durchatmens am Lagerfeuer lindert die Erschöpfung.",
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
        "Spieler".to_string()
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
                role_view: "Gefährte".to_string(),
                last_shift_reason: String::new(),
            });
            state.relationships.len() - 1
        };
        let relationship = &mut state.relationships[relationship_index];
        let before = relationship.affinity;
        relationship.affinity = (relationship.affinity + affinity_gain).clamp(-100, 100);
        relationship.last_shift_reason = if rest_type == "long" {
            "Gemeinsames Lagerfeuer".to_string()
        } else {
            "Gemeinsame Rast".to_string()
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
            sender_name: "Beziehungs-Meilenstein".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content: format!(
                "Die Bindung zu {} hat Stufe {} erreicht.",
                companion, milestone
            ),
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
            content: "Es tut gut, für einen Augenblick innezuhalten. Wir müssen auf der Hut bleiben, aber gemeinsam schaffen wir das.".to_string(),
            turn_mode: "say".to_string(),
            whisper_target: None,
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
        };
        state.chat_log.push(comp_msg);
    }

    engine.set_state(state.clone());
    save_scene_state(&state)?;

    Ok(state)
}
