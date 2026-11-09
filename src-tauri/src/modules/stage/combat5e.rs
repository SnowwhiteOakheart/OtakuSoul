//! Fights in 5e scenes (`SceneRules::ruleset == "5e"`): the rules engine (`rules5e`) resolves
//! every turn – monsters by its own AI, companions by the language model choosing one legal
//! action (or the engine's fallback), the player through the UI. Afterwards the game master
//! narrates the resulting events without changing them.

use super::rules5e::{self, CombatEvent, CombatOutcome, DeathSaveOutcome, PlayerAction};
use super::*;
use rand::{Rng, SeedableRng};

/// Gives player and companions their rules values from the class templates (5e scenes only;
/// [`rules5e::ensure_party_stats`]). Order: the scene's choice, the class on the character
/// card (`extensions.otakusoul_5e.class`, read once when the hero joins), the default by place
/// in the party.
pub fn ensure_party_stats(state: &mut SceneState) {
    if !state.definition.is_5e() {
        return;
    }
    let needs_cards = state
        .combat
        .combatants
        .iter()
        .any(|c| c.role == "companion" && c.stats5e.is_none());
    let cards = if needs_cards {
        crate::modules::paths::scan_available_characters()
    } else {
        Vec::new()
    };
    rules5e::ensure_party_stats(&mut state.table(), |name| {
        crate::modules::characters::find_by_name(&cards, name)
            .and_then(|c| rules5e::card_class(&c.card.data.extensions))
    });
}

/// The planner's rule for encounters in 5e scenes, with the monsters it may use.
pub fn planner_encounter_rule(state: &SceneState) -> String {
    let map_rule = super::explore5e::planner_map_rule(state);
    let [easy, medium, hard, deadly] = rules5e::party_budget(&rules5e::party_levels(&state.combat));
    let ids = rules5e::monsters()
        .iter()
        .map(|m| format!("{} (CR {}, {} XP)", m.id, m.cr, rules5e::xp_for_cr(m.cr)))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        r#"- encounter: only to start or end a fight. Start: {{"action":"start", "enemies":[{{"monster":"goblin", "count":2}}]}} with monster ids from: {ids}. End without a winner (surrender, escape, truce): {{"action":"end"}}. A rules engine resolves every attack, hit and wound – never put damage, hit points or hp_updates into the plan.
- Encounter budget for this party (XP, a group counts +25 % per extra monster): easy {easy}, medium {medium}, hard {hard}, deadly {deadly}. Pick monsters to fit the story; the engine trims groups far beyond deadly.
- inventory_add (5e): gear, potions and coins as {{"srd_id": "<id>", "quantity": 1}} with ids from: {items}; other finds as before.
- dice_check (5e): skill_name must be one of {skills}; the engine adds the character's own bonus, so the formula is ignored.{map_rule}"#,
        skills = rules5e::skill_ids().join(", "),
        items = rules5e::items()
            .iter()
            .map(|i| i.id.as_str())
            .collect::<Vec<_>>()
            .join(", "),
    )
}

/// A 5e rest for the party ([`rules5e::rest_party`]); one English line per hero for the
/// chronicle.
pub fn rest_party<R: Rng + ?Sized>(state: &mut SceneState, long: bool, rng: &mut R) -> Vec<String> {
    rules5e::rest_party(&mut state.table(), long, rng)
}

/// Sets up a fight with the SRD monsters the game master asked for. Unknown monsters are
/// skipped; returns false when none is left.
pub fn start_encounter(
    state: &mut SceneState,
    enemies: &[PlanCombatant],
    language_code: &str,
) -> bool {
    start_encounter_at(
        state,
        enemies,
        language_code,
        "spawn",
        true,
        Utc::now().timestamp_millis(),
        &mut rand::rng(),
    )
}

/// Like [`start_encounter`], with the monsters placed on `zone` of the map. With `limit`
/// (fights the game master makes up) a group far beyond deadly for the party is trimmed;
/// prepared encounters of an adventure stay as written.
/// `stamp` makes the enemies' ids unique (the desktop passes the time in milliseconds).
pub fn start_encounter_at<R: Rng + ?Sized>(
    state: &mut SceneState,
    enemies: &[PlanCombatant],
    language_code: &str,
    zone: &str,
    limit: bool,
    stamp: i64,
    rng: &mut R,
) -> bool {
    ensure_party_vitals(state);
    let requests: Vec<rules5e::EnemyRequest> = enemies
        .iter()
        .map(|request| rules5e::EnemyRequest {
            monster: request
                .monster
                .clone()
                .unwrap_or_else(|| request.name.clone()),
            count: request.count,
        })
        .collect();
    let report = rules5e::start_encounter_at(
        &mut state.table(),
        &requests,
        language_code,
        zone,
        limit,
        stamp,
        rng,
    );
    for id in &report.unknown {
        tracing::warn!("Unknown 5e monster '{id}' ignored");
    }
    if let Some((before, after)) = report.trimmed {
        tracing::info!("5e encounter trimmed from {before} to {after} monsters (XP budget)");
    }
    report.started
}

/// Ends the fight ([`rules5e::end_encounter`]): enemies leave, fight-only effects end, heroes
/// who went down wake with 1 hit point.
pub fn end_encounter(state: &mut SceneState, _outcome: Option<CombatOutcome>) {
    rules5e::end_encounter(&mut state.table());
}

/// The player decides for this combatant (always for the player, for companions when the
/// scene says so).
pub(super) fn player_controls(state: &SceneState, combatant: &Combatant) -> bool {
    rules5e::player_controls(state.definition.rules.as_ref(), combatant)
}

/// Ends the current combatant's turn and starts the next one ([`rules5e::next_turn`]).
pub(super) fn next_turn<R: Rng + ?Sized>(state: &mut SceneState, rng: &mut R) -> Vec<CombatEvent> {
    rules5e::next_turn(&mut state.table(), rng)
}

/// What the current combatant may do now, for the UI (and to check the player's action).
pub fn combat_options(state: &SceneState) -> rules5e::CombatOptions {
    rules5e::combat_options(&state.combat, state.map.as_ref())
}

/// The player's input for the current combatant, if it is allowed now.
pub(super) fn parse_player_action(state: &SceneState, action: &str) -> Option<PlayerAction> {
    rules5e::parse_player_action(&state.combat, state.map.as_ref(), action)
}

/// Carries out the player's input; returns the events and whether the turn is over.
pub(super) fn apply_player_action<R: Rng + ?Sized>(
    state: &mut SceneState,
    action: PlayerAction,
    rng: &mut R,
) -> (Vec<CombatEvent>, bool) {
    rules5e::apply_player_action(&mut state.table(), action, rng)
}

/// One line per legal action for the language model: id and what it means.
fn describe_options(
    actor: &Combatant,
    combatants: &[Combatant],
    options: &[rules5e::ActionOption],
) -> String {
    options
        .iter()
        .map(|option| match (&option.attack_id, &option.target_id) {
            _ if option.id.starts_with("cast:") => describe_cast(&option.id, combatants),
            _ if option.id == "feature:turn_undead" => format!(
                "{} — present the holy symbol: undead within {} ft must flee (Wisdom save)",
                option.id,
                rules5e::TURN_UNDEAD_FT
            ),
            (Some(attack_id), Some(target_id)) => {
                let attack = actor.stats5e.as_ref().and_then(|s| s.attack(attack_id));
                let target = combatants.iter().find(|c| &c.id == target_id);
                format!(
                    "{} — {} ({:+} to hit, {}) against {} ({})",
                    option.id,
                    attack.map_or(attack_id.as_str(), |a| a.name.en.as_str()),
                    attack.map_or(0, |a| a.to_hit),
                    attack.map_or("", |a| a.damage.as_str()),
                    target.map_or(target_id.as_str(), |t| t.name.as_str()),
                    target.map_or("", |t| tier_text(rules5e::health_tier(t.hp, t.max_hp))),
                )
            }
            _ => format!(
                "{} — take cover and defend (attacks against you have disadvantage)",
                option.id
            ),
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn describe_cast(id: &str, combatants: &[Combatant]) -> String {
    let Some(request) = rules5e::CastRequest::parse(id) else {
        return id.to_string();
    };
    let Some(spell) = rules5e::spell(&request.spell_id) else {
        return id.to_string();
    };
    let slot = if request.slot_level == 0 {
        "cantrip".to_string()
    } else {
        format!("level {} slot", request.slot_level)
    };
    let target = match &request.target {
        rules5e::CastTarget::Creature(target_id) => combatants
            .iter()
            .find(|c| &c.id == target_id)
            .map_or(target_id.clone(), |t| {
                if rules5e::is_enemy(t) {
                    format!(
                        "{} ({})",
                        t.name,
                        tier_text(rules5e::health_tier(t.hp, t.max_hp))
                    )
                } else {
                    format!("{} ({}/{} HP)", t.name, t.hp, t.max_hp)
                }
            }),
        rules5e::CastTarget::Point(p) => format!("the area around square {}:{}", p.x, p.y),
    };
    format!("{id} — cast {} ({slot}) on {target}", spell.name.en)
}

fn tier_text(tier: rules5e::HealthTier) -> &'static str {
    match tier {
        rules5e::HealthTier::Unhurt => "unhurt",
        rules5e::HealthTier::Wounded => "wounded",
        rules5e::HealthTier::BadlyWounded => "badly wounded",
        rules5e::HealthTier::Down => "down",
    }
}

/// A companion's choice among `options`: the language model answers with one id. `None` when
/// the answer names none, the call fails or the turn was stopped (the caller falls back).
async fn companion_choice(
    state: &SceneState,
    inference: &InferenceClient,
    llm: &StageLlm,
    options: &[rules5e::ActionOption],
) -> Option<String> {
    if inference.is_aborted() || options.is_empty() {
        return None;
    }
    let actor = &state.combat.combatants[state.combat.current_turn_index];
    let combatants = &state.combat.combatants;
    let class = actor
        .stats5e
        .as_ref()
        .and_then(|s| rules5e::class(&s.class_id))
        .map_or("adventurer", |c| c.name.en.as_str());
    let situation = combatants
        .iter()
        .filter(|c| rules5e::is_up(c))
        .map(|c| {
            format!(
                "- {} ({}, {})",
                c.name,
                c.role,
                tier_text(rules5e::health_tier(c.hp, c.max_hp))
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let prompt = format!(
        "[STAGE — COMBAT ACTION]\nYou decide the next action of {name}, a {class}, in a fight.\nStill fighting:\n{situation}\n\nOptions (id — meaning):\n{options}\n\nAnswer with the id of exactly one option and nothing else.",
        name = actor.name,
        options = describe_options(actor, combatants, options),
    );
    let answer = inference
        .with_abort(inference.generate_direct(llm.request(prompt, 40)))
        .await?
        .ok()?;
    // The longest id the answer contains (so "dodge" inside other words does not win).
    let mut by_length: Vec<&rules5e::ActionOption> = options.iter().collect();
    by_length.sort_by_key(|o| std::cmp::Reverse(o.id.len()));
    by_length
        .into_iter()
        .find(|option| answer.contains(&option.id))
        .map(|option| option.id.clone())
}

/// The turn of a monster or a companion: the engine plans it ([`rules5e::engine_plan`]); where
/// a companion may choose, the language model picks one legal option (otherwise the engine's
/// fallback). `rng` must be `Send` (it is held across the language model call).
pub(super) async fn engine_turn<R: Rng + Send + ?Sized>(
    state: &mut SceneState,
    inference: &InferenceClient,
    llm: &StageLlm,
    rng: &mut R,
) -> Vec<CombatEvent> {
    // A badly hurt fighter catches their Second Wind first (bonus action).
    let mut events = rules5e::engine_turn_prelude(&mut state.table(), rng);
    let turn = match rules5e::engine_plan(&state.combat, state.map.as_ref()) {
        rules5e::EnginePlan::Decided(turn) => turn,
        rules5e::EnginePlan::Choice(choice) => {
            let id = companion_choice(state, inference, llm, &choice.options).await;
            choice.pick(id.as_deref())
        }
    };
    events.extend(rules5e::play_turn(&mut state.table(), turn, rng));
    events
}

/// Plain facts of the events for the narrator (English; it narrates in the reply language).
fn report(events: &[CombatEvent]) -> String {
    events
        .iter()
        .filter_map(|event| match event {
            CombatEvent::Attack {
                attacker_name,
                target_name,
                attack_name,
                hit,
                critical,
                ..
            } => Some(format!(
                "{attacker_name} attacks {target_name} with {}: {}.",
                attack_name.en,
                if *critical {
                    "a critical hit"
                } else if *hit {
                    "hit"
                } else {
                    "miss"
                }
            )),
            CombatEvent::Damage {
                target_name,
                amount,
                damage_type,
                tier,
                ..
            } => Some(format!(
                "{target_name} takes {amount} {damage_type} damage and is now {}.",
                tier_text(*tier)
            )),
            CombatEvent::Down { target_name, .. } => Some(format!("{target_name} goes down.")),
            CombatEvent::Dodge { actor_name, .. } => {
                Some(format!("{actor_name} takes cover and defends."))
            }
            CombatEvent::Flee { actor_name, .. } => {
                Some(format!("{actor_name} flees from the fight."))
            }
            CombatEvent::Move {
                actor_name, feet, ..
            } => Some(format!("{actor_name} moves {feet} feet.")),
            CombatEvent::OpportunityAttack {
                attacker_name,
                target_name,
                ..
            } => Some(format!(
                "{attacker_name} strikes at {target_name}, who is leaving its reach:"
            )),
            CombatEvent::Dash { actor_name, .. } => Some(format!("{actor_name} dashes.")),
            CombatEvent::Disengage { actor_name, .. } => {
                Some(format!("{actor_name} carefully disengages."))
            }
            CombatEvent::SpellCast {
                caster_name,
                spell_name,
                ..
            } => Some(format!("{caster_name} casts {}.", spell_name.en)),
            CombatEvent::Save {
                target_name,
                ability,
                success,
                ..
            } => Some(format!(
                "{target_name} {} the {ability:?} saving throw.",
                if *success { "succeeds on" } else { "fails" }
            )),
            CombatEvent::Heal {
                target_name,
                amount,
                ..
            } => Some(format!("{target_name} regains {amount} hit points.")),
            CombatEvent::ConditionStart {
                target_name,
                condition,
                ..
            } => Some(format!(
                "{target_name} is now {}.",
                condition.replace('_', " ")
            )),
            CombatEvent::ConditionEnd {
                target_name,
                condition,
                ..
            } => Some(format!(
                "{target_name} is no longer {}.",
                condition.replace('_', " ")
            )),
            CombatEvent::DeathSave {
                actor_name,
                outcome,
                ..
            } => Some(match outcome {
                DeathSaveOutcome::Ongoing => format!("{actor_name} fights for life."),
                DeathSaveOutcome::Stable => format!("{actor_name} is stable, but unconscious."),
                DeathSaveOutcome::Revived => format!("{actor_name} gets back up!"),
                DeathSaveOutcome::Dead => format!("{actor_name} dies."),
                DeathSaveOutcome::Out => format!("{actor_name} is out of the fight."),
            }),
            CombatEvent::ConcentrationLost { caster_name, .. } => {
                Some(format!("{caster_name} loses concentration on the spell."))
            }
            CombatEvent::Feature {
                actor_name,
                feature,
                ..
            } => Some(match feature.as_str() {
                rules5e::SECOND_WIND => format!("{actor_name} catches a second wind."),
                rules5e::ACTION_SURGE => {
                    format!("{actor_name} pushes beyond their limits for one more action.")
                }
                rules5e::SNEAK_ATTACK => {
                    format!("{actor_name} strikes where it hurts most (sneak attack).")
                }
                rules5e::TURN_UNDEAD => {
                    format!("{actor_name} raises the holy symbol against the undead.")
                }
                "cunning_dash" | "cunning_disengage" => {
                    format!("{actor_name} moves with cunning agility.")
                }
                other => format!("{actor_name} uses {}.", other.replace('_', " ")),
            }),
            CombatEvent::Teleport { actor_name, .. } => {
                Some(format!("{actor_name} vanishes and reappears nearby."))
            }
            CombatEvent::CombatEnd { outcome } => Some(match outcome {
                CombatOutcome::Victory => {
                    "The fight is won: no enemy is left standing.".to_string()
                }
                CombatOutcome::Defeat => {
                    "The party is defeated: everyone has gone down.".to_string()
                }
            }),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// The game master narrates what happened; nothing is changed. A failed or stopped call
/// leaves only the log (the UI shows the events anyway).
async fn narrate(
    state: &mut SceneState,
    events: &[CombatEvent],
    inference: &InferenceClient,
    llm: &StageLlm,
    on_stream: StageStream<'_>,
) {
    let facts = report(events);
    narrate_facts(
        state,
        "[STAGE — COMBAT REPORT]",
        "These things just happened in the fight, in this order; they are final",
        &facts,
        inference,
        llm,
        on_stream,
    )
    .await;
}

/// The game master narrates engine facts (fight or exploration) without changing them.
pub(super) async fn narrate_facts(
    state: &mut SceneState,
    marker: &str,
    intro: &str,
    facts: &str,
    inference: &InferenceClient,
    llm: &StageLlm,
    on_stream: StageStream<'_>,
) {
    if facts.is_empty() || inference.is_aborted() {
        return;
    }
    let reply_language = crate::modules::content_lang::ContentLang::reply_language_name();
    let lang_code = crate::modules::content_lang::language_code(&reply_language);
    let definition = state.definition.localized(&lang_code);
    let recent = state
        .chat_log
        .iter()
        .rev()
        .take(4)
        .rev()
        .map(|m| line_for(m, Audience::Narrator))
        .collect::<Vec<_>>()
        .join("\n");
    let prompt = format!(
        "{marker}\nYou are the game master of a tabletop fantasy adventure (tone: {tone}). Narrator style: {style}\nRecent story:\n{recent}\n\n{intro}:\n{facts}\n\nNarrate them in {reply_language} in 2 to 5 vivid sentences. Keep every outcome exactly as given: no extra hits, wounds or enemies, nobody acts who is not listed. Do not mention dice, numbers or armor class.",
        tone = definition.gm_tone,
        style = definition.narrator_style,
    );
    let mut request = llm.request(prompt, 400);
    if let Some(sampling) = request.sampling.as_mut() {
        sampling.temperature = Some(0.8);
    }
    let message_id = format!("msg_{}", Utc::now().timestamp_millis());
    let text = super::turn::stream_message(
        inference,
        request,
        on_stream,
        &message_id,
        "Game Master",
        "gm",
        None,
    )
    .await
    .ok()
    .filter(|text| !text.trim().is_empty());
    if let Some(content) = text {
        state.push_message(SceneTurnMessage {
            id: message_id,
            sender_id: "gm".to_string(),
            sender_name: "Game Master".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content,
            turn_mode: "do".to_string(),
            whisper_target: None,
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
            bg: None,
            images: Vec::new(),
        });
    }
}

/// Plays a fight on: the player's action (if given) for the current combatant, then every
/// turn the engine or the companions decide until the player is up again or the fight ends,
/// then the narration. Without an action it only continues (e.g. right after the start).
pub async fn execute_combat_turn(
    engine: &StageEngine,
    inference: &InferenceClient,
    scene_id: &str,
    action: Option<String>,
    on_stream: StageStream<'_>,
) -> Result<SceneState, String> {
    inference.reset_abort();
    let mut state = engine.get_state();
    if state.definition.id != scene_id {
        state = load_scene_by_id(scene_id)?;
    }
    if !state.definition.is_5e() || !state.combat.is_active {
        return Err(crate::err!("backend.stage.noCombat"));
    }
    let mut events = Vec::new();
    let current = &state.combat.combatants[state.combat.current_turn_index];
    if let Some(action) = action.as_deref() {
        if !player_controls(&state, current) {
            return Err(crate::err!("backend.stage.notYourTurn"));
        }
        let action = parse_player_action(&state, action)
            .ok_or_else(|| crate::err!("backend.stage.invalidAction"))?;
        engine.push_snapshot(&state.definition.id, state.clone());
        let (done, turn_over) = apply_player_action(&mut state, action, &mut rand::rng());
        events.extend(done);
        if rules5e::combat_outcome(&state.combat.combatants).is_none() {
            if !turn_over {
                // Still the player's turn on the board: keep the events, no narration yet.
                state.combat.events.extend(events);
                super::explore5e::refresh_fog(&mut state);
                engine.set_state(state.clone());
                save_scene_state(&state)?;
                return Ok(state);
            }
            events.extend(next_turn(&mut state, &mut rand::rng()));
        }
    } else if player_controls(&state, current) {
        // Nothing to continue: it is the player's turn.
        return Ok(state);
    } else {
        engine.push_snapshot(&state.definition.id, state.clone());
    }

    finish_round(engine, inference, state, events, on_stream).await
}

/// Plays monsters and companions until the player is to act (or the fight ends), lets the
/// game master narrate `events` plus what happened, and saves the scene.
pub(super) async fn finish_round(
    engine: &StageEngine,
    inference: &InferenceClient,
    mut state: SceneState,
    mut events: Vec<CombatEvent>,
    on_stream: StageStream<'_>,
) -> Result<SceneState, String> {
    let llm = StageLlm::from_settings();
    // Held across the language model calls, so it has to be `Send` (unlike `rand::rng()`).
    let mut rng = rand::rngs::StdRng::from_rng(&mut rand::rng());
    let mut turns = 0;
    while rules5e::combat_outcome(&state.combat.combatants).is_none()
        && turns < rules5e::MAX_TURNS_PER_CALL
    {
        let actor = state.combat.combatants[state.combat.current_turn_index].clone();
        if player_controls(&state, &actor) {
            break;
        }
        events.extend(engine_turn(&mut state, inference, &llm, &mut rng).await);
        turns += 1;
        if rules5e::combat_outcome(&state.combat.combatants).is_some() {
            break;
        }
        let next = next_turn(&mut state, &mut rng);
        if next.is_empty() {
            break;
        }
        events.extend(next);
    }

    let outcome = rules5e::record_round(&mut state.combat, &mut events);
    narrate(&mut state, &events, inference, &llm, on_stream).await;
    if outcome == Some(CombatOutcome::Victory) {
        super::explore5e::won_fight(
            &mut state,
            &super::explore5e::reply_code(),
            Utc::now().timestamp_micros(),
        );
    }
    if let Some(outcome) = outcome {
        end_encounter(&mut state, Some(outcome));
    }
    super::explore5e::refresh_fog(&mut state);
    state.current_turn_actor = "PLAYER".to_string();
    state.definition.last_played = Some(Utc::now().to_rfc3339());
    engine.set_state(state.clone());
    save_scene_state(&state)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn five_e_scene(classes: &[(&str, &str)]) -> SceneState {
        let mut state = StageEngine::new().get_state();
        state.definition.party = vec!["Lyra".into(), "Finn".into()];
        state.definition.rules = Some(SceneRules {
            ruleset: "5e".into(),
            hero_classes: classes
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            control_companions: false,
            heroic_death: false,
            map_id: None,
            ..Default::default()
        });
        state.combat.combatants.retain(|c| c.role == "player");
        ensure_party_vitals(&mut state);
        state
    }

    fn party_class(state: &SceneState, name: &str) -> String {
        let c = state
            .combat
            .combatants
            .iter()
            .find(|c| c.name == name || c.role == name)
            .unwrap();
        c.stats5e.as_ref().unwrap().class_id.clone()
    }

    #[test]
    fn party_gets_class_values_and_keeps_hit_points() {
        let mut state = five_e_scene(&[("lyra", "wizard")]);
        assert_eq!(party_class(&state, "player"), "fighter");
        assert_eq!(party_class(&state, "Lyra"), "wizard");
        // Finn is the second companion without a choice: rogue.
        assert_eq!(party_class(&state, "Finn"), "rogue");
        let lyra = state
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.name == "Lyra")
            .unwrap();
        assert_eq!(lyra.max_hp, 7); // d6 + CON 13 (+1)
        lyra.hp = 3;
        ensure_party_stats(&mut state);
        assert_eq!(
            state
                .combat
                .combatants
                .iter()
                .find(|c| c.name == "Lyra")
                .unwrap()
                .hp,
            3
        );
        // Narrative scenes stay without rules values.
        let mut plain = StageEngine::new().get_state();
        ensure_party_vitals(&mut plain);
        assert!(plain.combat.combatants.iter().all(|c| c.stats5e.is_none()));
    }

    fn wolf_fight(classes: &[(&str, &str)]) -> SceneState {
        let mut state = five_e_scene(classes);
        assert!(start_encounter(
            &mut state,
            &[PlanCombatant {
                name: String::new(),
                monster: Some("wolf".into()),
                count: Some(1),
                hp: 0,
                role: "enemy".into(),
            }],
            "en",
        ));
        state
    }

    fn index_of(state: &SceneState, name: &str) -> usize {
        state
            .combat
            .combatants
            .iter()
            .position(|c| c.name == name || c.role == name)
            .unwrap()
    }

    #[test]
    fn a_cleric_companion_brings_a_dying_hero_back() {
        let mut state = wolf_fight(&[("lyra", "cleric")]);
        let player = index_of(&state, "player");
        state.combat.combatants[player].hp = 0;
        rules5e::add_condition(
            &mut state.combat.combatants[player],
            rules5e::UNCONSCIOUS,
            0,
        );
        assert!(rules5e::is_dying(&state.combat.combatants[player]));
        state.combat.current_turn_index = index_of(&state, "Lyra");
        rules5e::begin_turn(&mut state.table());
        let lyra = state.combat.combatants[state.combat.current_turn_index].clone();
        let id = rules5e::urgent_cast(&state.combat, state.map.as_ref(), &lyra)
            .expect("healing the dying is urgent");
        assert!(
            id.ends_with(&format!(":{}", state.combat.combatants[player].id)),
            "{id}"
        );
        let events = rules5e::act(
            &mut state.table(),
            rules5e::TurnDecision::Cast(id),
            &mut rand::rng(),
        );
        assert!(
            events
                .iter()
                .any(|e| matches!(e, CombatEvent::SpellCast { .. }))
        );
        let hero = &state.combat.combatants[player];
        assert!(hero.hp > 0, "{events:?}");
        assert!(!rules5e::has_condition(hero, rules5e::UNCONSCIOUS));
        assert!(report(&events).contains("regains"));
    }

    #[test]
    fn the_player_casts_and_a_bonus_spell_keeps_the_turn_open() {
        let mut state = wolf_fight(&[("player", "cleric")]);
        let player = index_of(&state, "player");
        let wolf = state
            .combat
            .combatants
            .iter()
            .find(|c| c.role == "enemy")
            .unwrap()
            .id
            .clone();
        let player_id = state.combat.combatants[player].id.clone();
        state.combat.current_turn_index = player;
        rules5e::begin_turn(&mut state.table());
        let options = combat_options(&state);
        assert!(
            options
                .spells
                .iter()
                .any(|o| o.spell_id == "sacred_flame" && o.targets.contains(&wolf))
        );
        // Healing Word is a bonus action: the action stays.
        state.combat.combatants[player].hp -= 3;
        let action = parse_player_action(&state, &format!("cast:healing_word:1:{player_id}"))
            .expect("valid cast");
        let (_, over) = apply_player_action(&mut state, action, &mut rand::rng());
        assert!(!over && !state.combat.turn.action_used && state.combat.turn.bonus_action_used);
        let slots = state.combat.combatants[player]
            .stats5e
            .as_ref()
            .unwrap()
            .spellcasting
            .as_ref()
            .unwrap()
            .slots_used;
        assert_eq!(slots.first().copied(), Some(1));
        // No second bonus action, but the cantrip still works and ends the turn.
        assert!(parse_player_action(&state, &format!("cast:healing_word:1:{player_id}")).is_none());
        let action =
            parse_player_action(&state, &format!("cast:sacred_flame:0:{wolf}")).expect("cantrip");
        let (events, over) = apply_player_action(&mut state, action, &mut rand::rng());
        assert!(over);
        assert!(events.iter().any(|e| matches!(e, CombatEvent::Save { .. })));
        assert!(parse_player_action(&state, "cast:fireball:3:x").is_none());
    }

    #[test]
    fn fighters_catch_a_second_wind_and_surge() {
        let mut state = wolf_fight(&[]);
        let player = index_of(&state, "player");
        rules5e::level_up(&mut state.combat.combatants[player], 2);
        state.combat.current_turn_index = player;
        rules5e::begin_turn(&mut state.table());
        assert!(
            parse_player_action(&state, "feature:second_wind").is_none(),
            "only when hurt"
        );
        state.combat.combatants[player].hp = 3;
        let action = parse_player_action(&state, "feature:second_wind").expect("second wind");
        let (events, over) = apply_player_action(&mut state, action, &mut rand::rng());
        assert!(!over && state.combat.turn.bonus_action_used && !state.combat.turn.action_used);
        assert!(state.combat.combatants[player].hp > 3);
        assert!(events.iter().any(
            |e| matches!(e, CombatEvent::Feature { feature, .. } if feature == rules5e::SECOND_WIND)
        ));
        assert!(
            parse_player_action(&state, "feature:second_wind").is_none(),
            "once per rest"
        );
        // Action Surge only once the action is spent; it gives it back.
        assert!(parse_player_action(&state, "feature:action_surge").is_none());
        state.combat.turn.action_used = true;
        let action = parse_player_action(&state, "feature:action_surge").expect("action surge");
        apply_player_action(&mut state, action, &mut rand::rng());
        assert!(!state.combat.turn.action_used);
        rest_party(&mut state, false, &mut rand::rng());
        let stats = state.combat.combatants[player].stats5e.as_ref().unwrap();
        assert_eq!(rules5e::uses_left(stats, rules5e::SECOND_WIND), 1);
    }

    #[test]
    fn clerics_turn_undead_who_then_keep_away() {
        let mut state = five_e_scene(&[("player", "cleric")]);
        assert!(start_encounter(
            &mut state,
            &[PlanCombatant {
                name: String::new(),
                monster: Some("skeleton".into()),
                count: Some(3),
                hp: 0,
                role: "enemy".into(),
            }],
            "en",
        ));
        let player = index_of(&state, "player");
        state.combat.current_turn_index = player;
        rules5e::begin_turn(&mut state.table());
        assert!(
            parse_player_action(&state, "feature:turn_undead").is_none(),
            "a level 2 feature"
        );
        rules5e::level_up(&mut state.combat.combatants[player], 2);
        let action = parse_player_action(&state, "feature:turn_undead").expect("turn undead");
        let (events, _) = apply_player_action(&mut state, action, &mut rand::rng());
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e, CombatEvent::Save { .. }))
                .count(),
            3
        );
        let turned: Vec<_> = state
            .combat
            .combatants
            .iter()
            .filter(|c| rules5e::has_condition(c, rules5e::TURNED))
            .cloned()
            .collect();
        for undead in &turned {
            assert_eq!(
                rules5e::monster_decision(undead, &state.combat.combatants),
                rules5e::TurnDecision::Dodge
            );
        }
        assert!(state.combat.turn.action_used);
        assert!(parse_player_action(&state, "feature:turn_undead").is_none());
    }

    #[test]
    fn rests_restore_hit_points_and_slots() {
        let mut state = five_e_scene(&[("lyra", "cleric")]);
        let lyra = index_of(&state, "Lyra");
        let player = index_of(&state, "player");
        {
            let c = &mut state.combat.combatants[lyra];
            c.hp = 1;
            c.stats5e
                .as_mut()
                .unwrap()
                .spellcasting
                .as_mut()
                .unwrap()
                .slots_used[0] = 2;
        }
        rest_party(&mut state, false, &mut rand::rng());
        let c = &state.combat.combatants[lyra];
        let stats = c.stats5e.as_ref().unwrap();
        // A level-1 hero has one hit die: spent, and some hit points back; slots stay used.
        assert!(c.hp > 1 && stats.hit_dice_left == 0);
        assert_eq!(stats.spellcasting.as_ref().unwrap().slots_used[0], 2);
        state.combat.combatants[player].hp = 0;
        rules5e::add_condition(
            &mut state.combat.combatants[player],
            rules5e::UNCONSCIOUS,
            0,
        );
        let lines = rest_party(&mut state, true, &mut rand::rng());
        assert_eq!(lines.len(), 3);
        for c in state
            .combat
            .combatants
            .iter()
            .filter(|c| rules5e::is_party(c))
        {
            assert_eq!(c.hp, c.max_hp, "{}", c.name);
            assert!(c.conditions.is_empty());
        }
        let stats = state.combat.combatants[lyra].stats5e.as_ref().unwrap();
        assert_eq!(stats.spellcasting.as_ref().unwrap().slots_used, [0; 9]);
        assert_eq!(stats.hit_dice_left, 1);
    }

    #[test]
    fn encounter_starts_with_srd_monsters_only() {
        let mut state = five_e_scene(&[]);
        let request = |monster: &str, count| PlanCombatant {
            name: String::new(),
            monster: Some(monster.into()),
            count: Some(count),
            hp: 99,
            role: "enemy".into(),
        };
        assert!(!start_encounter(&mut state, &[request("dragon", 1)], "de"));
        assert!(!state.combat.is_active);
        assert!(start_encounter(
            &mut state,
            &[request("goblin", 2), request("dragon", 1)],
            "de"
        ));
        let enemies: Vec<_> = state
            .combat
            .combatants
            .iter()
            .filter(|c| rules5e::is_enemy(c))
            .collect();
        assert_eq!(enemies.len(), 2);
        // SRD hit points, not the 99 from the plan; numbered German names.
        assert!(enemies.iter().all(|e| e.hp == 7 && e.stats5e.is_some()));
        assert_eq!(
            enemies
                .iter()
                .map(|e| e.name.as_str())
                .collect::<std::collections::BTreeSet<_>>(),
            ["Goblin 1", "Goblin 2"].into()
        );
        assert!(matches!(
            state.combat.events[0],
            CombatEvent::Initiative { .. }
        ));
        assert!(matches!(
            state.combat.events[1],
            CombatEvent::TurnStart { .. }
        ));
        assert_eq!(state.combat.combatants.len(), 5);
    }

    #[test]
    fn downed_heroes_wake_with_one_hit_point_after_any_end() {
        let mut state = five_e_scene(&[]);
        start_encounter(
            &mut state,
            &[PlanCombatant {
                name: "Orc".into(),
                monster: None,
                count: None,
                hp: 1,
                role: "enemy".into(),
            }],
            "en",
        );
        for c in state
            .combat
            .combatants
            .iter_mut()
            .filter(|c| rules5e::is_party(c))
        {
            c.hp = 0;
        }
        assert_eq!(
            rules5e::combat_outcome(&state.combat.combatants),
            Some(CombatOutcome::Defeat)
        );
        end_encounter(&mut state, Some(CombatOutcome::Defeat));
        assert!(!state.combat.is_active);
        assert!(
            state
                .combat
                .combatants
                .iter()
                .all(|c| rules5e::is_party(c) && c.hp == 1)
        );
        // After a victory too: someone who went down does not stay at 0.
        let goblin = PlanCombatant {
            name: "Goblin".into(),
            monster: None,
            count: None,
            hp: 1,
            role: "enemy".into(),
        };
        start_encounter(&mut state, &[goblin], "en");
        let player = |state: &mut SceneState| {
            state
                .combat
                .combatants
                .iter_mut()
                .find(|c| c.role == "player")
                .unwrap()
                .hp
        };
        state
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.role == "player")
            .unwrap()
            .hp = 0;
        end_encounter(&mut state, Some(CombatOutcome::Victory));
        assert_eq!(player(&mut state), 1);
    }

    #[test]
    fn report_and_options_read_as_plain_facts() {
        let events = vec![
            CombatEvent::Down {
                target_id: "g".into(),
                target_name: "Goblin 1".into(),
            },
            CombatEvent::CombatEnd {
                outcome: CombatOutcome::Victory,
            },
            CombatEvent::Pass {
                actor_id: "x".into(),
                actor_name: "X".into(),
            },
        ];
        assert_eq!(
            report(&events),
            "Goblin 1 goes down.\nThe fight is won: no enemy is left standing."
        );
        let mut state = five_e_scene(&[]);
        start_encounter(
            &mut state,
            &[PlanCombatant {
                name: String::new(),
                monster: Some("wolf".into()),
                count: Some(1),
                hp: 0,
                role: "enemy".into(),
            }],
            "en",
        );
        let lyra = state
            .combat
            .combatants
            .iter()
            .find(|c| c.name == "Lyra")
            .unwrap();
        let options = rules5e::legal_actions(lyra, &state.combat.combatants);
        let text = describe_options(lyra, &state.combat.combatants, &options);
        assert!(text.contains("against Wolf (unhurt)"), "{text}");
        assert!(text.lines().last().unwrap().starts_with("dodge — "));
    }
}

#[cfg(test)]
mod board_tests {
    use super::*;

    fn crypt_scene() -> SceneState {
        let mut state = StageEngine::new().get_state();
        state.definition.party = vec!["Lyra".into()];
        state.definition.rules = Some(SceneRules {
            ruleset: "5e".into(),
            hero_classes: HashMap::new(),
            control_companions: false,
            heroic_death: false,
            map_id: Some("crypt_hall".into()),
            ..Default::default()
        });
        state.combat.combatants.retain(|c| c.role == "player");
        ensure_party_vitals(&mut state);
        let goblins = PlanCombatant {
            name: String::new(),
            monster: Some("goblin".into()),
            count: Some(2),
            hp: 0,
            role: "enemy".into(),
        };
        assert!(start_encounter(&mut state, &[goblins], "de"));
        state
    }

    #[test]
    fn fighters_are_placed_on_their_zones() {
        let state = crypt_scene();
        let map = state.map.as_ref().expect("map loaded");
        for c in &state.combat.combatants {
            let pos = c.position.expect("placed");
            let zone = map.cell(pos).and_then(|cell| cell.zone.clone());
            assert_eq!(
                zone.as_deref(),
                Some(if rules5e::is_party(c) {
                    "party"
                } else {
                    "spawn"
                }),
                "{}",
                c.name
            );
        }
    }

    #[test]
    fn the_player_moves_within_its_speed_and_ends_the_turn() {
        let mut state = crypt_scene();
        let player = state
            .combat
            .combatants
            .iter()
            .position(|c| c.role == "player")
            .unwrap();
        state.combat.current_turn_index = player;
        rules5e::begin_turn(&mut state.table());
        assert_eq!(state.combat.turn.movement_left_ft, 30);
        let options = combat_options(&state);
        let step = options
            .reachable
            .iter()
            .find(|s| s.feet == 5)
            .expect("a neighbour square");
        let action = parse_player_action(&state, &format!("move:{}:{}", step.x, step.y))
            .expect("valid move");
        let (_, over) = apply_player_action(&mut state, action, &mut rand::rng());
        assert!(!over);
        assert_eq!(state.combat.turn.movement_left_ft, 25);
        assert_eq!(
            state.combat.combatants[player].position,
            Some(rules5e::GridPos::new(step.x, step.y))
        );
        // Too far, into a wall, or not a move at all.
        assert!(parse_player_action(&state, "move:14:10").is_none());
        assert!(parse_player_action(&state, "move:0:0").is_none());
        assert!(parse_player_action(&state, "fly").is_none());
        // Dash doubles the movement but uses the action; then the turn ends on request.
        let (_, over) = {
            let action = parse_player_action(&state, "dash").unwrap();
            apply_player_action(&mut state, action, &mut rand::rng())
        };
        assert!(!over && state.combat.turn.action_used);
        assert_eq!(state.combat.turn.movement_left_ft, 55);
        assert!(combat_options(&state).actions.is_empty());
        let (_, over) = {
            let action = parse_player_action(&state, "end_turn").unwrap();
            apply_player_action(&mut state, action, &mut rand::rng())
        };
        assert!(over);
    }
}
