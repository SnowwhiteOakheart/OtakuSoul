//! The game master's long-term view of the world: established facts, the chronicle, archived
//! story arcs and a regular consistency check of the facts.

use super::*;

/// Chronicle entries the planner sees (the newest ones).
const CHRONICLE_IN_PROMPT: usize = 12;
/// Turns between two consistency checks of the facts.
pub const AUDIT_INTERVAL: u32 = 8;
/// History lines the arc summary and the consistency check look at.
const RECENT_LINES: usize = 14;

/// Where the stage's helper calls (arc summary, consistency check) go: the selected chat model.
pub struct StageLlm {
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<crate::modules::providers::LlmProviderType>,
}

impl StageLlm {
    /// The chat model selected in the settings (local llama-server or cloud).
    pub fn from_settings() -> Self {
        let settings = load_app_settings();
        if settings.selected_backend == "cloud" {
            Self {
                provider: Some(
                    crate::modules::providers::ProviderRegistry::detect_provider(
                        &settings.cloud_endpoint,
                        None,
                    ),
                ),
                endpoint_url: settings.cloud_endpoint,
                api_key: (!settings.cloud_api_key.is_empty()).then_some(settings.cloud_api_key),
                model: (!settings.cloud_model.is_empty()).then_some(settings.cloud_model),
            }
        } else {
            Self {
                endpoint_url: format!(
                    "http://127.0.0.1:{}/v1/chat/completions",
                    settings.server_config.port
                ),
                api_key: None,
                model: None,
                provider: Some(crate::modules::providers::LlmProviderType::LocalLlama),
            }
        }
    }

    pub(super) fn request(&self, prompt: String, max_tokens: u32) -> ChatRequest {
        ChatRequest {
            endpoint_url: self.endpoint_url.clone(),
            api_key: self.api_key.clone(),
            model: self.model.clone(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
                attachments: Vec::new(),
            }],
            sampling: Some(SamplingParams {
                temperature: Some(0.2),
                max_tokens: Some(max_tokens),
                ..Default::default()
            }),
            reasoning_mode: Some(false),
            provider: self.provider.clone(),
        }
    }
}

/// The last history lines as the game master knows them.
fn recent_history(state: &SceneState) -> String {
    let log = &state.chat_log;
    log[log.len().saturating_sub(RECENT_LINES)..]
        .iter()
        .map(|m| line_for(m, Audience::Planner))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Open story arcs for the planner (resolved ones live in the archive).
pub fn open_arcs_context(state: &SceneState) -> String {
    let open: Vec<String> = state
        .arcs
        .iter()
        .filter(|arc| !arc.is_resolved)
        .map(|arc| {
            format!(
                "{} [{}]: {}/{} {}",
                arc.title,
                arc.id,
                arc.stage,
                arc.max_stage,
                if arc.is_revealed {
                    "revealed"
                } else {
                    "hidden"
                }
            )
        })
        .collect();
    if open.is_empty() {
        "none".to_string()
    } else {
        open.join("; ")
    }
}

/// Archived arcs for the planner, or "none".
pub fn arc_archive_context(state: &SceneState) -> String {
    if state.arc_archive.is_empty() {
        return "none".to_string();
    }
    state
        .arc_archive
        .iter()
        .map(|arc| format!("{}: {}", arc.title, arc.summary))
        .collect::<Vec<_>>()
        .join(" | ")
}

/// Condenses every resolved arc that is not archived yet; without an answer the description
/// stands in. Cancellation leaves the arc pending for the next turn.
pub async fn archive_resolved_arcs(
    state: &mut SceneState,
    inference: &InferenceClient,
    llm: &StageLlm,
) {
    let pending: Vec<StoryArc> = state
        .arcs
        .iter()
        .filter(|arc| arc.is_resolved && !state.arc_archive.iter().any(|a| a.arc_id == arc.id))
        .cloned()
        .collect();
    if pending.is_empty() {
        return;
    }
    let language = crate::modules::content_lang::ContentLang::reply_language_name();
    let history = recent_history(state);
    for arc in pending {
        let prompt = format!(
            "[STAGE — ARC ARCHIVE]\nThe story arc \"{}\" has been resolved.\nArc description: {}\n\nRecent events:\n{}\n\n\
             Summarize in two or three sentences in {language} how the arc ended and what lasting \
             consequences it leaves. Reply with the summary only.",
            arc.title, arc.description, history
        );
        let Some(result) = inference
            .with_abort(inference.generate_direct(llm.request(prompt, 200)))
            .await
        else {
            return;
        };
        let summary = result
            .ok()
            .map(|text| text.trim().to_string())
            .filter(|text| !text.is_empty())
            .unwrap_or_else(|| arc.description.clone());
        state.arc_archive.push(ArchivedArc {
            arc_id: arc.id.clone(),
            title: arc.title.clone(),
            summary,
        });
    }
}

#[derive(Deserialize, Default)]
struct AuditResult {
    #[serde(default)]
    prune_keys: Vec<String>,
    #[serde(default)]
    updated_facts: HashMap<String, String>,
}

/// Every few turns the model checks the facts against recent events: obsolete ones go,
/// wrong ones are corrected. New facts are not added here (that is the planner's job).
pub async fn audit_facts(state: &mut SceneState, inference: &InferenceClient, llm: &StageLlm) {
    if inference.is_aborted() {
        return;
    }
    state.turns_since_audit = state.turns_since_audit.saturating_add(1);
    if state.turns_since_audit < AUDIT_INTERVAL || state.world.key_facts.is_empty() {
        return;
    }
    let prompt = format!(
        "[STAGE — CONSISTENCY]\nYou audit the established facts of a tabletop campaign against recent events.\n\n\
         Facts:\n{}\n\nRecent events:\n{}\n\n\
         Remove facts that are obsolete, temporary or resolved, and correct those that events contradict. \
         Do not invent new facts. Reply ONLY with JSON: \
         {{\"prune_keys\": [\"key\"], \"updated_facts\": {{\"key\": \"corrected value\"}}}}",
        facts_context(state).replace("; ", "\n"),
        recent_history(state)
    );
    let Some(result) = inference
        .with_abort(inference.generate_direct(llm.request(prompt, 300)))
        .await
    else {
        return;
    };
    state.turns_since_audit = 0;
    let Ok(raw) = result else {
        return;
    };
    let Some(result) = raw
        .find('{')
        .zip(raw.rfind('}'))
        .and_then(|(start, end)| raw.get(start..=end))
        .and_then(|json| serde_json::from_str::<AuditResult>(json).ok())
    else {
        return;
    };
    let mut updates: HashMap<String, Option<String>> = result
        .prune_keys
        .into_iter()
        .map(|key| (key, None))
        .collect();
    for (key, value) in result.updated_facts {
        // Only corrections of known facts.
        if state
            .world
            .key_facts
            .contains_key(&normalize_fact_key(&key))
        {
            updates.insert(key, Some(value));
        }
    }
    apply_fact_updates(state, &updates);
}

/// `key: value; …` for the planner, or "none".
pub fn facts_context(state: &SceneState) -> String {
    let mut facts: Vec<_> = state.world.key_facts.iter().collect();
    facts.sort();
    if facts.is_empty() {
        return "none".to_string();
    }
    facts
        .into_iter()
        .map(|(key, value)| format!("{key}: {value}"))
        .collect::<Vec<_>>()
        .join("; ")
}

/// The newest chronicle entries, oldest first, or "none".
pub fn chronicle_context(state: &SceneState) -> String {
    let ledger = &state.consequence_ledger;
    if ledger.is_empty() {
        return "none".to_string();
    }
    ledger[ledger.len().saturating_sub(CHRONICLE_IN_PROMPT)..]
        .iter()
        .map(|entry| entry.text.as_str())
        .collect::<Vec<_>>()
        .join(" | ")
}

/// `"Torwache"` → `"torwache"`, `"Status des Tors"` → `"status_des_tors"`.
pub fn normalize_fact_key(key: &str) -> String {
    key.trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("_")
}

/// Sets or drops facts as the planner (or the consistency check) says.
pub fn apply_fact_updates(state: &mut SceneState, updates: &HashMap<String, Option<String>>) {
    for (key, value) in updates {
        let key = normalize_fact_key(key);
        if key.is_empty() {
            continue;
        }
        match value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            Some(value) => {
                state.world.key_facts.insert(key, value.to_string());
            }
            None => {
                state.world.key_facts.remove(&key);
            }
        }
    }
}

/// Overlays for the planner: `Name: role …, arc …, facts …; …` or "none".
pub fn overlays_context(state: &SceneState) -> String {
    if state.overlays.is_empty() {
        return "none".to_string();
    }
    state
        .overlays
        .iter()
        .map(|o| {
            let facts = o
                .facts
                .iter()
                .map(|(k, v)| format!("{k}: {v}"))
                .collect::<Vec<_>>()
                .join(", ");
            format!(
                "{} (role: {}; arc: {}; facts: {})",
                o.name,
                if o.current_role.is_empty() {
                    "-"
                } else {
                    &o.current_role
                },
                if o.arc_stage.is_empty() {
                    "-"
                } else {
                    &o.arc_stage
                },
                if facts.is_empty() {
                    "-".to_string()
                } else {
                    facts
                }
            )
        })
        .collect::<Vec<_>>()
        .join("; ")
}

/// The overlay as it goes into the character's own prompt, or nothing.
pub fn overlay_block(state: &SceneState, name: &str) -> String {
    let Some(overlay) = state
        .overlays
        .iter()
        .find(|o| o.name.eq_ignore_ascii_case(name))
    else {
        return String::new();
    };
    let mut lines = Vec::new();
    if !overlay.current_role.trim().is_empty() {
        lines.push(format!(
            "Your current role in this story: {}",
            overlay.current_role
        ));
    }
    if !overlay.arc_stage.trim().is_empty() {
        lines.push(format!(
            "Where your personal arc stands: {}",
            overlay.arc_stage
        ));
    }
    lines.extend(overlay.facts.iter().map(|(k, v)| format!("{k}: {v}")));
    if lines.is_empty() {
        String::new()
    } else {
        format!(
            "\n\nHow this story has changed you:\n- {}",
            lines.join("\n- ")
        )
    }
}

pub fn apply_overlay_updates(state: &mut SceneState, updates: &[PlanOverlayUpdate]) {
    for update in updates {
        let name = update.name.trim();
        if name.is_empty() {
            continue;
        }
        let index = match state
            .overlays
            .iter()
            .position(|o| o.name.eq_ignore_ascii_case(name))
        {
            Some(index) => index,
            None => {
                state.overlays.push(CharacterOverlay {
                    name: name.to_string(),
                    current_role: String::new(),
                    arc_stage: String::new(),
                    facts: Default::default(),
                });
                state.overlays.len() - 1
            }
        };
        let overlay = &mut state.overlays[index];
        if let Some(role) = update
            .current_role
            .as_deref()
            .map(str::trim)
            .filter(|r| !r.is_empty())
        {
            overlay.current_role = role.to_string();
        }
        if let Some(arc) = update
            .arc_stage
            .as_deref()
            .map(str::trim)
            .filter(|a| !a.is_empty())
        {
            overlay.arc_stage = arc.to_string();
        }
        for (key, value) in &update.facts {
            let key = normalize_fact_key(key);
            match value.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
                Some(value) => {
                    overlay.facts.insert(key, value.to_string());
                }
                None => {
                    overlay.facts.remove(&key);
                }
            }
        }
    }
}

pub fn apply_lore_card_updates(state: &mut SceneState, updates: &[PlanLoreCard]) {
    for card in updates {
        let title = card.title.trim();
        if title.is_empty() || card.content.trim().is_empty() {
            continue;
        }
        let audience = if card.audience.eq_ignore_ascii_case("gm") {
            "gm"
        } else {
            "party"
        };
        let keywords: Vec<String> = card
            .keywords
            .iter()
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
            .collect();
        match state
            .lore_cards
            .iter_mut()
            .find(|c| c.title.eq_ignore_ascii_case(title))
        {
            Some(existing) => {
                existing.content = card.content.trim().to_string();
                existing.keywords = keywords;
                existing.audience = audience.to_string();
            }
            None => state.lore_cards.push(StageLoreCard {
                id: format!(
                    "lore_{}_{}",
                    Utc::now().timestamp_millis(),
                    state.lore_cards.len()
                ),
                title: title.to_string(),
                content: card.content.trim().to_string(),
                keywords,
                audience: audience.to_string(),
            }),
        }
    }
}

/// Lore cards relevant to `text` (keyword match, or no keywords): `(party, gm_only)` snippets.
pub fn relevant_lore_cards(state: &SceneState, text: &str) -> (Vec<String>, Vec<String>) {
    let text = text.to_lowercase();
    let mut party = Vec::new();
    let mut gm = Vec::new();
    for card in &state.lore_cards {
        let relevant = card.keywords.is_empty()
            || card
                .keywords
                .iter()
                .any(|k| text.contains(&k.to_lowercase()));
        if !relevant {
            continue;
        }
        if card.audience == "gm" {
            gm.push(format!(
                "[GM-ONLY LORE – never reveal directly: {}] {}",
                card.title, card.content
            ));
        } else {
            party.push(format!("[LORE: {}] {}", card.title, card.content));
        }
    }
    (party, gm)
}

/// Titles of all scene lore cards, so the planner can update instead of duplicating them.
pub fn lore_card_titles(state: &SceneState) -> String {
    if state.lore_cards.is_empty() {
        return "none".to_string();
    }
    state
        .lore_cards
        .iter()
        .map(|c| format!("{} ({})", c.title, c.audience))
        .collect::<Vec<_>>()
        .join(", ")
}

/// New log lines a party member must have witnessed before their Soul Memory is updated.
pub const MEMORY_SYNC_LINES: usize = 10;

/// Party members whose Soul Memory is due: `(name, transcript)` with only what each of them
/// witnessed (whispers to others and thoughts stay hidden). Marks the lines as taken.
pub fn take_memory_sync_batches(state: &mut SceneState) -> Vec<(String, String)> {
    let len = state.chat_log.len();
    let mut batches = Vec::new();
    for name in state.definition.party.clone() {
        let start = *state
            .memory_sync
            .entry(name.clone())
            // First sync of an existing scene: only the recent part, not the whole history.
            .or_insert_with(|| len.saturating_sub(MEMORY_SYNC_LINES));
        if len.saturating_sub(start) < MEMORY_SYNC_LINES {
            continue;
        }
        let transcript = state.chat_log[start.min(len)..]
            .iter()
            .map(|m| super::npc::npc_history_line(state, m, Audience::Character(&name)))
            .collect::<Vec<_>>()
            .join("\n");
        state.memory_sync.insert(name.clone(), len);
        batches.push((name, transcript));
    }
    batches
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn already_stopped_upkeep_keeps_archives_facts_and_due_counter() {
        let mut state = StageEngine::new().get_state();
        state.arcs = vec![StoryArc {
            id: "pending".into(),
            title: "Gate".into(),
            description: "Opened".into(),
            stage: 1,
            max_stage: 1,
            is_revealed: true,
            is_resolved: true,
        }];
        state.world.key_facts.insert("gate".into(), "open".into());
        state.turns_since_audit = AUDIT_INTERVAL;
        let previous = serde_json::to_value(&state).unwrap();
        let inference = InferenceClient::new();
        inference.abort();
        let llm = StageLlm {
            endpoint_url: "http://127.0.0.1:9/v1/chat/completions".into(),
            api_key: None,
            model: None,
            provider: None,
        };
        archive_resolved_arcs(&mut state, &inference, &llm).await;
        audit_facts(&mut state, &inference, &llm).await;
        assert_eq!(serde_json::to_value(&state).unwrap(), previous);
    }

    fn line(sender: &str, content: &str, mode: &str, target: Option<&str>) -> SceneTurnMessage {
        SceneTurnMessage {
            id: format!("m-{content}"),
            sender_id: sender.into(),
            sender_name: sender.into(),
            sender_role: "player".into(),
            avatar_url: None,
            content: content.into(),
            turn_mode: mode.into(),
            whisper_target: target.map(Into::into),
            event_card: None,
            timestamp: 0,
        }
    }

    #[test]
    fn memory_sync_takes_each_characters_own_view() {
        let mut state = StageEngine::new().get_state();
        state.definition.party = vec!["Ayu".into()];
        state.chat_log.clear();
        state.memory_sync.insert("Ayu".into(), 0);
        for i in 0..8 {
            state
                .chat_log
                .push(line("Kai", &format!("PUBLIC_{i}"), "say", None));
        }
        assert!(
            take_memory_sync_batches(&mut state).is_empty(),
            "too few lines"
        );
        state
            .chat_log
            .push(line("Kai", "SECRET_FOR_SORA", "whisper", Some("Sora")));
        state
            .chat_log
            .push(line("Kai", "FOR_AYU", "whisper", Some("Ayu")));
        let batches = take_memory_sync_batches(&mut state);
        assert_eq!(batches.len(), 1);
        let (name, transcript) = &batches[0];
        assert_eq!(name, "Ayu");
        assert!(transcript.contains("PUBLIC_0") && transcript.contains("FOR_AYU"));
        assert!(!transcript.contains("SECRET_FOR_SORA"));
        // Taken lines are not sent again.
        assert!(take_memory_sync_batches(&mut state).is_empty());
    }

    #[test]
    fn overlays_are_kept_per_character() {
        let mut state = StageEngine::new().get_state();
        apply_overlay_updates(
            &mut state,
            &[PlanOverlayUpdate {
                name: "Ayu".into(),
                current_role: Some("Verräterin wider Willen".into()),
                arc_stage: None,
                facts: HashMap::from([("Verletzung".into(), Some("Arm in der Schlinge".into()))]),
            }],
        );
        apply_overlay_updates(
            &mut state,
            &[PlanOverlayUpdate {
                name: "ayu".into(),
                current_role: None,
                arc_stage: Some("zweifelt".into()),
                facts: HashMap::new(),
            }],
        );
        assert_eq!(state.overlays.len(), 1);
        let block = overlay_block(&state, "Ayu");
        assert!(
            block.contains("Verräterin wider Willen")
                && block.contains("zweifelt")
                && block.contains("verletzung: Arm in der Schlinge")
        );
        assert_eq!(overlay_block(&state, "Sora"), "");
    }

    #[test]
    fn lore_cards_reach_their_audience_when_relevant() {
        let mut state = StageEngine::new().get_state();
        apply_lore_card_updates(
            &mut state,
            &[
                PlanLoreCard {
                    title: "Das Siegel".into(),
                    content: "Nur Blut öffnet es.".into(),
                    keywords: vec!["Tor".into()],
                    audience: "party".into(),
                },
                PlanLoreCard {
                    title: "Der Verräter".into(),
                    content: "Ayu arbeitet für den Feind.".into(),
                    keywords: vec![],
                    audience: "GM".into(),
                },
            ],
        );
        let (party, gm) = relevant_lore_cards(&state, "Wir stehen vor dem tor.");
        assert_eq!(party.len(), 1);
        assert!(gm[0].contains("GM-ONLY") && gm[0].contains("Feind"));
        let (party, _) = relevant_lore_cards(&state, "Wir rasten.");
        assert!(party.is_empty());
        // Same title updates instead of duplicating.
        apply_lore_card_updates(
            &mut state,
            &[PlanLoreCard {
                title: "das siegel".into(),
                content: "Neu.".into(),
                keywords: vec![],
                audience: "party".into(),
            }],
        );
        assert_eq!(state.lore_cards.len(), 2);
    }

    #[test]
    fn resolved_arcs_leave_the_open_list() {
        let mut state = StageEngine::new().get_state();
        state.arcs = vec![
            StoryArc {
                id: "a".into(),
                title: "Tor".into(),
                description: "Wer?".into(),
                stage: 3,
                max_stage: 3,
                is_revealed: true,
                is_resolved: true,
            },
            StoryArc {
                id: "b".into(),
                title: "Verrat".into(),
                description: String::new(),
                stage: 0,
                max_stage: 2,
                is_revealed: false,
                is_resolved: false,
            },
        ];
        assert_eq!(open_arcs_context(&state), "Verrat [b]: 0/2 hidden");
        assert_eq!(arc_archive_context(&state), "none");
        state.arc_archive.push(ArchivedArc {
            arc_id: "a".into(),
            title: "Tor".into(),
            summary: "Offen.".into(),
        });
        assert_eq!(arc_archive_context(&state), "Tor: Offen.");
    }

    #[test]
    fn facts_are_set_dropped_and_shown() {
        let mut state = StageEngine::new().get_state();
        state.world.key_facts.clear();
        assert_eq!(facts_context(&state), "none");
        let updates = HashMap::from([
            ("Status des Tors".to_string(), Some("offen".to_string())),
            ("wache".to_string(), Some("schläft".to_string())),
        ]);
        apply_fact_updates(&mut state, &updates);
        assert_eq!(
            facts_context(&state),
            "status_des_tors: offen; wache: schläft"
        );
        apply_fact_updates(&mut state, &HashMap::from([("Wache".to_string(), None)]));
        assert_eq!(facts_context(&state), "status_des_tors: offen");
    }

    #[test]
    fn chronicle_shows_the_newest_entries() {
        let mut state = StageEngine::new().get_state();
        state.consequence_ledger = (0..20)
            .map(|i| ConsequenceEntry {
                id: format!("c{i}"),
                text: format!("Folge {i}"),
                created_at: String::new(),
            })
            .collect();
        let shown = chronicle_context(&state);
        assert!(shown.starts_with("Folge 8 |") && shown.ends_with("Folge 19"));
    }
}
