use super::super::*;
use super::TurnContext;

pub(super) struct MechanicsOutcome {
    pub(super) dice_outcome_text: String,
    pub(super) dice_event_card: Option<StageEventCard>,
    pub(super) secondary_event_cards: Vec<(String, StageEventCard)>,
}

pub(super) fn apply_mechanics(
    ctx: &TurnContext<'_>,
    state: &mut SceneState,
    gm_plan: &GmPlan,
    ambient_files: &[String],
) -> MechanicsOutcome {
    let lang = &ctx.lang;
    let lang_code = &ctx.lang_code;
    let user_name = &ctx.user_name;

    let mut dice_outcome_text = String::new();
    let mut dice_event_card = None;
    let mut secondary_event_cards: Vec<(String, StageEventCard)> = Vec::new();

    let current_actor = state
        .combat
        .combatants
        .iter()
        .find(|c| c.name == state.current_turn_actor || c.id == state.current_turn_actor);
    // 5e: the engine sets the bonus from the actor's ability and skill training.
    let check_formula = gm_plan.dice_check.as_ref().map(|check| {
        let actor_stats = current_actor
            .or_else(|| state.combat.combatants.iter().find(|c| c.role == "player"))
            .and_then(|c| c.stats5e.as_ref());
        match actor_stats.filter(|_| state.definition.is_5e()) {
            Some(stats) => super::rules5e::check_bonus(stats, &check.skill_name)
                .map(|bonus| format!("1d20{bonus:+}"))
                .unwrap_or_else(|| check.formula.clone()),
            None => check.formula.clone(),
        }
    });
    if let Some(check) = &gm_plan.dice_check
        && state.definition.dice_rolls_enabled
        && let Some(formula) = &check_formula
        && let Ok(roll) = roll_dice(formula, Some(check.dc), current_actor)
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

    // Only the known moods; anything else keeps the current music.
    if let Some(mood) = gm_plan
        .music_mood
        .as_deref()
        .map(|m| m.trim().to_lowercase())
        && crate::modules::stage_music::MOODS.contains(&mood.as_str())
    {
        state.current_music_mood = Some(mood);
    }

    // Apply Clock updates
    for clk_up in &gm_plan.campaign_clock_updates {
        if let Some(c) = state.clocks.iter_mut().find(|c| c.id == clk_up.id) {
            let new_val = (c.current as i32 + clk_up.delta).clamp(0, c.max as i32) as u32;
            c.current = new_val;
            secondary_event_cards.push((
                lang.t("The campaign clock “{}” changes.")
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
            // With the 5e rules the engine alone changes hit points.
            if !state.definition.is_5e() {
                combatant.hp = (combatant.hp + delta.hp_delta).clamp(0, combatant.max_hp);
            }
            combatant.stress =
                (combatant.stress + delta.stress_delta).clamp(0, combatant.max_stress);
            state.combat.combat_log.push(format!(
                "{}: HP {:+}, Stress {:+}",
                combatant.name, delta.hp_delta, delta.stress_delta
            ));
        }
    }

    for update in &gm_plan.condition_updates {
        if let Some(combatant) = find_combatant(state, &update.target) {
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
                    .unwrap_or_else(super::rules5e::default_objective_status),
            });
        }
    }

    for addition in &gm_plan.inventory_add {
        // 5e gear and loot by SRD id: name and values come from the equipment data.
        if let Some(srd_id) = addition
            .srd_id
            .as_deref()
            .filter(|id| super::rules5e::item(id).is_some())
        {
            let entry = format!("{srd_id}*{}", addition.quantity.max(1));
            super::explore5e::add_items(state, &[entry], lang_code, Utc::now().timestamp_micros());
            continue;
        }
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
                srd_id: None,
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

    // 5e scenes with a map are explored on it; the planner chooses only from its lists.
    let map_started = if state.definition.is_5e() && super::explore5e::ensure_exploring(state) {
        super::explore5e::apply_planner_map(
            state,
            gm_plan.encounter.as_ref(),
            gm_plan.map_change.as_deref(),
            lang_code,
        )
    } else {
        None
    };
    if let Some(encounter) = gm_plan
        .encounter
        .as_ref()
        .filter(|_| state.definition.is_5e())
    {
        // 5e: the engine sets up the fight; hit points from the plan are ignored.
        match encounter.action.as_str() {
            "start" if map_started.is_some() || !state.combat.is_active => {
                let started = map_started.unwrap_or_else(|| {
                    super::combat5e::start_encounter(state, &encounter.enemies, lang_code)
                });
                if started {
                    secondary_event_cards.push((
                        lang.t("An encounter begins.").to_string(),
                        StageEventCard::Combat {
                            action: "started".to_string(),
                            text: lang
                                .t("Roll for initiative — the fight begins!")
                                .to_string(),
                        },
                    ));
                }
            }
            "end" if state.combat.is_active => {
                super::combat5e::end_encounter(state, None);
                secondary_event_cards.push((
                    lang.t("The encounter ends.").to_string(),
                    StageEventCard::Combat {
                        action: "ended".to_string(),
                        text: lang.t("The fight is over.").to_string(),
                    },
                ));
            }
            _ => {}
        }
    } else if let Some(encounter) = &gm_plan.encounter {
        match encounter.action.as_str() {
            "start" => {
                ensure_party_vitals(state);
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
                        stats5e: None,
                        position: None,
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
                        stats5e: None,
                        position: None,
                    });
                }
                state
                    .combat
                    .combatants
                    .sort_by_key(|c| std::cmp::Reverse(c.initiative));
                secondary_event_cards.push((
                    lang.t("An encounter begins.").to_string(),
                    StageEventCard::Combat {
                        action: "started".to_string(),
                        text: lang
                            .t("Roll for initiative — the fight begins!")
                            .to_string(),
                    },
                ));
            }
            "end" => {
                state.combat.is_active = false;
                remove_enemies(state);
                secondary_event_cards.push((
                    lang.t("The encounter ends.").to_string(),
                    StageEventCard::Combat {
                        action: "ended".to_string(),
                        text: lang.t("The fight is over.").to_string(),
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
    apply_fact_updates(state, &gm_plan.fact_updates);
    apply_overlay_updates(state, &gm_plan.overlay_updates);
    apply_lore_card_updates(state, &gm_plan.lore_card_updates);

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

    MechanicsOutcome {
        dice_outcome_text,
        dice_event_card,
        secondary_event_cards,
    }
}
