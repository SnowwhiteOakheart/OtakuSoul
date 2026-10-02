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
    fn request(&self, prompt: String, max_tokens: u32) -> ChatRequest {
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
/// stands in, so an arc is never lost from the archive.
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
            "[SOUL STAGE — ARC ARCHIVE]\nThe story arc \"{}\" has been resolved.\nArc description: {}\n\nRecent events:\n{}\n\n\
             Summarize in two or three sentences in {language} how the arc ended and what lasting \
             consequences it leaves. Reply with the summary only.",
            arc.title, arc.description, history
        );
        let summary = inference
            .generate_direct(llm.request(prompt, 200))
            .await
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
    state.turns_since_audit += 1;
    if state.turns_since_audit < AUDIT_INTERVAL || state.world.key_facts.is_empty() {
        return;
    }
    state.turns_since_audit = 0;
    let prompt = format!(
        "[SOUL STAGE — CONSISTENCY]\nYou audit the established facts of a tabletop campaign against recent events.\n\n\
         Facts:\n{}\n\nRecent events:\n{}\n\n\
         Remove facts that are obsolete, temporary or resolved, and correct those that events contradict. \
         Do not invent new facts. Reply ONLY with JSON: \
         {{\"prune_keys\": [\"key\"], \"updated_facts\": {{\"key\": \"corrected value\"}}}}",
        facts_context(state).replace("; ", "\n"),
        recent_history(state)
    );
    let Ok(raw) = inference.generate_direct(llm.request(prompt, 300)).await else {
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

#[cfg(test)]
mod tests {
    use super::*;

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
