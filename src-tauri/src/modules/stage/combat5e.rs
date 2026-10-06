//! Fights in 5e scenes (`SceneRules::ruleset == "5e"`): the rules engine (`rules5e`) resolves
//! every turn – monsters by its own AI, companions by the language model choosing one legal
//! action (or the engine's fallback), the player through the UI. Afterwards the game master
//! narrates the resulting events without changing them.

use super::rules5e::{self, CombatEvent, CombatOutcome, TurnDecision};
use super::*;

/// Fight events kept in the scene (log in the UI).
const MAX_EVENTS: usize = 300;
/// Enemies per fight; the language model cannot flood the scene.
const MAX_ENEMIES: usize = 12;
/// Engine turns per call before it stops (safety net; a fight never needs that many).
const MAX_TURNS_PER_CALL: usize = 60;

/// Class template when the scene names none: the player fights, companions take the other
/// roles in turn.
fn default_class(role: &str, companion_index: usize) -> &'static str {
    if role == "player" {
        "fighter"
    } else {
        ["cleric", "rogue", "wizard", "fighter"][companion_index % 4]
    }
}

/// Gives player and companions their rules values from the class templates (5e scenes only).
/// A changed class rebuilds the values; otherwise hit points stay as they are.
pub fn ensure_party_stats(state: &mut SceneState) {
    if !state.definition.is_5e() {
        return;
    }
    let rules = state.definition.rules.clone().unwrap_or_default();
    let class_for = |key: &str| {
        rules
            .hero_classes
            .iter()
            .find(|(name, _)| name.eq_ignore_ascii_case(key))
            .map(|(_, class)| class.clone())
    };
    let party = state.definition.party.clone();
    for combatant in state
        .combat
        .combatants
        .iter_mut()
        .filter(|c| rules5e::is_party(c))
    {
        let key = if combatant.role == "player" {
            "player"
        } else {
            combatant.name.as_str()
        };
        // Without a choice the place in the scene's party decides (stable across saves).
        let companion_index = party
            .iter()
            .position(|name| name.eq_ignore_ascii_case(&combatant.name))
            .unwrap_or(party.len());
        let wanted = class_for(key)
            .filter(|id| rules5e::class(id).is_some())
            .unwrap_or_else(|| default_class(&combatant.role, companion_index).to_string());
        if combatant
            .stats5e
            .as_ref()
            .is_some_and(|s| s.class_id == wanted)
        {
            combatant.hp = combatant.hp.min(combatant.max_hp);
            continue;
        }
        let Some(template) = rules5e::class(&wanted) else {
            continue;
        };
        let (stats, max_hp) = rules5e::hero_stats(template);
        combatant.stats5e = Some(stats);
        combatant.max_hp = max_hp;
        combatant.hp = max_hp;
    }
}

/// The planner's rule for encounters in 5e scenes, with the monsters it may use.
pub fn planner_encounter_rule() -> String {
    let ids = rules5e::monsters()
        .iter()
        .map(|m| format!("{} (CR {})", m.id, m.cr))
        .collect::<Vec<_>>()
        .join(", ");
    format!(
        r#"- encounter: only to start or end a fight. Start: {{"action":"start", "enemies":[{{"monster":"goblin", "count":2}}]}} with monster ids from: {ids}. End without a winner (surrender, escape, truce): {{"action":"end"}}. A rules engine resolves every attack, hit and wound – never put damage, hit points or hp_updates into the plan."#
    )
}

/// Sets up a fight with the SRD monsters the game master asked for. Unknown monsters are
/// skipped; returns false when none is left.
pub fn start_encounter(
    state: &mut SceneState,
    enemies: &[PlanCombatant],
    language_code: &str,
) -> bool {
    ensure_party_vitals(state);
    let mut fresh = Vec::new();
    for request in enemies {
        let id = request.monster.as_deref().unwrap_or(&request.name);
        let Some(data) = rules5e::monster(id) else {
            tracing::warn!("Unknown 5e monster '{id}' ignored");
            continue;
        };
        let count = request.count.unwrap_or(1).clamp(1, 8) as usize;
        for _ in 0..count {
            if fresh.len() >= MAX_ENEMIES {
                break;
            }
            fresh.push(data);
        }
    }
    if fresh.is_empty() {
        return false;
    }
    super::remove_enemies(state);
    let stamp = Utc::now().timestamp_millis();
    for (index, data) in fresh.iter().enumerate() {
        let base = data.name.get(language_code).to_string();
        let same_kind = fresh.iter().filter(|other| other.id == data.id).count();
        let number = fresh[..=index]
            .iter()
            .filter(|other| other.id == data.id)
            .count();
        let (stats, hp) = rules5e::monster_stats(data);
        state.combat.combatants.push(Combatant {
            id: format!("enemy_{stamp}_{index}"),
            name: if same_kind > 1 {
                format!("{base} {number}")
            } else {
                base
            },
            role: "enemy".to_string(),
            hp,
            max_hp: hp,
            stress: 0,
            max_stress: 0,
            initiative: 0,
            conditions: Vec::new(),
            skills: HashMap::new(),
            stats5e: Some(stats),
        });
    }
    for combatant in &mut state.combat.combatants {
        combatant
            .conditions
            .retain(|c| c.name != rules5e::DODGING && c.name != rules5e::FLED);
    }
    let mut rng = rand::rng();
    let initiative = rules5e::roll_initiative(&mut state.combat.combatants, &mut rng);
    state.combat.is_active = true;
    state.combat.round = 1;
    state.combat.current_turn_index = 0;
    state.combat.events = vec![initiative];
    // The first in the order may be down already (a hero from an earlier fight).
    if !rules5e::is_up(&state.combat.combatants[0]) {
        rules5e::advance_turn(&mut state.combat);
    }
    let index = state.combat.current_turn_index;
    let round = state.combat.round;
    let start = rules5e::start_turn(&mut state.combat.combatants[index], round);
    state.combat.events.push(start);
    true
}

/// Ends the fight: enemies leave; after a defeat the party comes to with 1 hit point.
pub fn end_encounter(state: &mut SceneState, outcome: Option<CombatOutcome>) {
    state.combat.is_active = false;
    if outcome == Some(CombatOutcome::Defeat) {
        for combatant in state
            .combat
            .combatants
            .iter_mut()
            .filter(|c| rules5e::is_party(c))
        {
            combatant.hp = combatant.hp.max(1);
        }
    }
    for combatant in &mut state.combat.combatants {
        combatant
            .conditions
            .retain(|c| c.name != rules5e::DODGING && c.name != rules5e::FLED);
    }
    super::remove_enemies(state);
}

/// The player decides for this combatant (always for the player, for companions when the
/// scene says so).
fn player_controls(state: &SceneState, combatant: &Combatant) -> bool {
    combatant.role == "player"
        || (combatant.role == "companion"
            && state
                .definition
                .rules
                .as_ref()
                .is_some_and(|r| r.control_companions))
}

/// Carries out a decision of the current combatant.
fn act(state: &mut SceneState, decision: TurnDecision) -> Vec<CombatEvent> {
    let index = state.combat.current_turn_index;
    let mut rng = rand::rng();
    match decision {
        TurnDecision::Attack {
            attack_id,
            target_id,
        } => {
            let actor = state.combat.combatants[index].clone();
            let attack = actor
                .stats5e
                .as_ref()
                .and_then(|s| s.attack(&attack_id))
                .cloned();
            let target = state
                .combat
                .combatants
                .iter_mut()
                .find(|c| c.id == target_id);
            match (attack, target) {
                (Some(attack), Some(target)) => {
                    rules5e::resolve_attack(&actor, &attack, target, &mut rng)
                }
                _ => vec![CombatEvent::Pass {
                    actor_id: actor.id.clone(),
                    actor_name: actor.name.clone(),
                }],
            }
        }
        TurnDecision::Dodge => vec![rules5e::take_dodge(&mut state.combat.combatants[index])],
        TurnDecision::Flee => vec![rules5e::flee(&mut state.combat.combatants[index])],
        TurnDecision::Pass => {
            let actor = &state.combat.combatants[index];
            vec![CombatEvent::Pass {
                actor_id: actor.id.clone(),
                actor_name: actor.name.clone(),
            }]
        }
    }
}

/// Next combatant's turn (or `None` when nobody can act).
fn next_turn(state: &mut SceneState) -> Option<CombatEvent> {
    if !rules5e::advance_turn(&mut state.combat) {
        return None;
    }
    let index = state.combat.current_turn_index;
    let round = state.combat.round;
    Some(rules5e::start_turn(
        &mut state.combat.combatants[index],
        round,
    ))
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

fn tier_text(tier: rules5e::HealthTier) -> &'static str {
    match tier {
        rules5e::HealthTier::Unhurt => "unhurt",
        rules5e::HealthTier::Wounded => "wounded",
        rules5e::HealthTier::BadlyWounded => "badly wounded",
        rules5e::HealthTier::Down => "down",
    }
}

/// A companion's action: the language model picks one legal option by id; anything else,
/// a failed call or a stop request falls back to the engine's choice.
async fn companion_decision(
    state: &SceneState,
    inference: &InferenceClient,
    llm: &StageLlm,
) -> TurnDecision {
    let actor = &state.combat.combatants[state.combat.current_turn_index];
    let combatants = &state.combat.combatants;
    let options = rules5e::legal_actions(actor, combatants);
    let fallback = || rules5e::hero_fallback_decision(actor, combatants);
    if inference.is_aborted() {
        return fallback();
    }
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
        options = describe_options(actor, combatants, &options),
    );
    let Some(Ok(answer)) = inference
        .with_abort(inference.generate_direct(llm.request(prompt, 40)))
        .await
    else {
        return fallback();
    };
    // The longest id the answer contains (so "dodge" inside other words does not win).
    let mut by_length: Vec<&rules5e::ActionOption> = options.iter().collect();
    by_length.sort_by_key(|o| std::cmp::Reverse(o.id.len()));
    by_length
        .into_iter()
        .find(|option| answer.contains(&option.id))
        .and_then(|option| rules5e::parse_action(&option.id, &options))
        .unwrap_or_else(fallback)
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
        "[STAGE — COMBAT REPORT]\nYou are the game master of a tabletop fantasy adventure (tone: {tone}). Narrator style: {style}\nRecent story:\n{recent}\n\nThese things just happened in the fight, in this order; they are final:\n{facts}\n\nNarrate them in {reply_language} in 2 to 5 vivid sentences. Keep every outcome exactly as given: no extra hits, wounds or enemies, nobody acts who is not listed. Do not mention dice, numbers or armor class.",
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
        state.chat_log.push(SceneTurnMessage {
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
        let options = rules5e::legal_actions(current, &state.combat.combatants);
        let decision = rules5e::parse_action(action, &options)
            .ok_or_else(|| crate::err!("backend.stage.invalidAction"))?;
        engine.push_snapshot(&state.definition.id, state.clone());
        events.extend(act(&mut state, decision));
        if rules5e::combat_outcome(&state.combat.combatants).is_none() {
            events.extend(next_turn(&mut state));
        }
    } else if player_controls(&state, current) {
        // Nothing to continue: it is the player's turn.
        return Ok(state);
    } else {
        engine.push_snapshot(&state.definition.id, state.clone());
    }

    let llm = StageLlm::from_settings();
    let mut turns = 0;
    while rules5e::combat_outcome(&state.combat.combatants).is_none() && turns < MAX_TURNS_PER_CALL
    {
        let actor = state.combat.combatants[state.combat.current_turn_index].clone();
        if player_controls(&state, &actor) {
            break;
        }
        let decision = if rules5e::is_enemy(&actor) {
            rules5e::monster_decision(&actor, &state.combat.combatants)
        } else {
            companion_decision(&state, inference, &llm).await
        };
        events.extend(act(&mut state, decision));
        turns += 1;
        if rules5e::combat_outcome(&state.combat.combatants).is_some() {
            break;
        }
        match next_turn(&mut state) {
            Some(event) => events.push(event),
            None => break,
        }
    }

    let outcome = rules5e::combat_outcome(&state.combat.combatants);
    if let Some(outcome) = outcome {
        events.push(CombatEvent::CombatEnd { outcome });
    }
    state.combat.events.extend(events.iter().cloned());
    let overflow = state.combat.events.len().saturating_sub(MAX_EVENTS);
    state.combat.events.drain(..overflow);
    narrate(&mut state, &events, inference, &llm, on_stream).await;
    if let Some(outcome) = outcome {
        end_encounter(&mut state, Some(outcome));
    }
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
    fn defeat_wakes_the_party_with_one_hit_point() {
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
