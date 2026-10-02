//! The game master's long-term view of the world: established facts and the chronicle.

use super::*;

/// Chronicle entries the planner sees (the newest ones).
const CHRONICLE_IN_PROMPT: usize = 12;

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
