//! The game master's screen: hidden motives, traps, threats and off-screen goals. Only the
//! planner sees them; an NPC knows its own agenda; the narrator and the companions learn a
//! secret only when the planner reveals it (it then becomes a party lore card and a discovery).

use super::*;

/// Secrets kept per scene; the oldest revealed ones go first when there are more.
const MAX_SECRETS: usize = 40;
/// Characters of a secret the planner may write.
const MAX_SECRET_CHARS: usize = 600;

/// `"Hidden Door!"` → `"hidden_door"`: ids the planner can repeat reliably.
pub fn normalize_secret_id(id: &str) -> String {
    let mut out = String::new();
    for c in id.trim().chars() {
        if c.is_alphanumeric() {
            out.extend(c.to_lowercase());
        } else if !out.ends_with('_') {
            out.push('_');
        }
    }
    out.trim_matches('_').to_string()
}

fn known_kind(kind: &str) -> String {
    let kind = kind.trim().to_ascii_lowercase();
    if SECRET_KINDS.contains(&kind.as_str()) {
        kind
    } else {
        default_secret_kind()
    }
}

/// The open secrets for the planner prompt: `[id] kind (about X): text`, or `none`.
pub fn gm_screen_context(state: &SceneState) -> String {
    let lines: Vec<String> = state
        .gm_secrets
        .iter()
        .filter(|s| !s.revealed)
        .map(|s| {
            let about = if s.about.trim().is_empty() {
                String::new()
            } else {
                format!(", about {}", s.about.trim())
            };
            format!("- [{}] {}{about}: {}", s.id, s.kind, s.text.trim())
        })
        .collect();
    if lines.is_empty() {
        "none".to_string()
    } else {
        lines.join("\n")
    }
}

/// An NPC's own open secrets (its hidden agenda), for its prompt only.
pub fn hidden_agenda_block(state: &SceneState, npc_name: &str) -> String {
    let lines: Vec<String> = state
        .gm_secrets
        .iter()
        .filter(|s| !s.revealed && s.about.trim().eq_ignore_ascii_case(npc_name.trim()))
        .map(|s| format!("- {}", s.text.trim()))
        .collect();
    if lines.is_empty() {
        return String::new();
    }
    format!(
        "\nYour hidden agenda (act on it, but never state it openly or admit it, even when asked):\n{}",
        lines.join("\n")
    )
}

/// Adds or changes secrets (matched by id); revealed ones stay revealed.
pub fn apply_secret_updates(state: &mut SceneState, updates: &[PlanSecretUpdate]) {
    for update in updates {
        let text: String = update.text.trim().chars().take(MAX_SECRET_CHARS).collect();
        if text.is_empty() {
            continue;
        }
        let id = match normalize_secret_id(&update.id) {
            id if id.is_empty() => format!("secret_{}", state.gm_secrets.len() + 1),
            id => id,
        };
        let kind = known_kind(&update.kind);
        let about = update.about.trim().to_string();
        match state.gm_secrets.iter_mut().find(|s| s.id == id) {
            Some(existing) => {
                existing.text = text;
                existing.kind = kind;
                if !about.is_empty() {
                    existing.about = about;
                }
            }
            None => state.gm_secrets.push(GmSecret {
                id,
                kind,
                about,
                text,
                revealed: false,
            }),
        }
    }
    while state.gm_secrets.len() > MAX_SECRETS {
        let index = state
            .gm_secrets
            .iter()
            .position(|s| s.revealed)
            .unwrap_or(0);
        state.gm_secrets.remove(index);
    }
}

/// Reveals the named secrets: each becomes scene lore everyone may know. Returns the newly
/// revealed ones (for the narrator and the discovery cards).
pub fn reveal_secrets(state: &mut SceneState, ids: &[String]) -> Vec<GmSecret> {
    let mut revealed = Vec::new();
    for id in ids {
        let id = normalize_secret_id(id);
        let Some(secret) = state
            .gm_secrets
            .iter_mut()
            .find(|s| s.id == id && !s.revealed)
        else {
            continue;
        };
        secret.revealed = true;
        revealed.push(secret.clone());
    }
    for secret in &revealed {
        let title = if secret.about.trim().is_empty() {
            secret.text.chars().take(48).collect::<String>()
        } else {
            secret.about.trim().to_string()
        };
        let card_id = format!("secret_{}", secret.id);
        let keywords = if secret.about.trim().is_empty() {
            Vec::new()
        } else {
            vec![secret.about.trim().to_string()]
        };
        match state.lore_cards.iter_mut().find(|c| c.id == card_id) {
            Some(card) => {
                card.content = secret.text.clone();
                card.audience = "party".to_string();
            }
            None => state.lore_cards.push(StageLoreCard {
                id: card_id,
                title,
                content: secret.text.clone(),
                keywords,
                audience: "party".to_string(),
            }),
        }
    }
    revealed
}

/// The value of `"narration_plan"` in a broken JSON reply (it comes first, so it usually
/// survives a cut-off reply).
static NARRATION_PLAN_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#""narration_plan"\s*:\s*"((?:[^"\\]|\\.)*)""#).expect("static regex is valid")
});

fn raw_narration_plan(raw: &str) -> Option<String> {
    let value = NARRATION_PLAN_RE.captures(raw)?.get(1)?.as_str();
    serde_json::from_str::<String>(&format!("\"{value}\"")).ok()
}

/// Keeps open secrets out of what the narrator and the player see: a plan that fell back to
/// the raw reply (JSON with the secrets in it) gets no narration plan, and a secret copied
/// word for word into a visible text is cut out.
pub fn scrub_secret_leaks(plan: &mut GmPlan, state: &SceneState) {
    let open: Vec<&str> = state
        .gm_secrets
        .iter()
        .filter(|s| {
            !s.revealed
                && !plan
                    .reveal_secrets
                    .iter()
                    .any(|id| normalize_secret_id(id) == s.id)
        })
        .map(|s| s.text.trim())
        .filter(|t| t.chars().count() >= 12)
        .collect();
    // A plan that could not be parsed carries the raw reply: keep only its narration plan.
    if plan.narration_plan.contains("\"narration_plan\"")
        || plan.narration_plan.contains("\"secret_updates\"")
    {
        plan.narration_plan = raw_narration_plan(&plan.narration_plan).unwrap_or_default();
    }
    let scrub = |text: &mut String| {
        for secret in &open {
            if text.contains(secret) {
                *text = text.replace(secret, "…");
            }
        }
    };
    scrub(&mut plan.narration_plan);
    if let Some(discovery) = plan.discovery.as_mut() {
        scrub(discovery);
    }
    if let Some(consequence) = plan.lasting_consequence.as_mut() {
        scrub(consequence);
    }
    for choice in &mut plan.player_choices {
        scrub(&mut choice.text);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret(id: &str, about: &str, text: &str) -> PlanSecretUpdate {
        PlanSecretUpdate {
            id: id.into(),
            kind: "motive".into(),
            about: about.into(),
            text: text.into(),
        }
    }

    #[test]
    fn a_new_story_starts_with_the_secrets_of_its_definition() {
        let def: SceneDefinition = serde_json::from_value(serde_json::json!({
            "id": "story_own_1",
            "title": "T",
            "description": "D",
            "gm_secrets": [{"id": "secret_1", "kind": "threat", "about": "Lighthouse", "text": "A cult below."}],
        }))
        .unwrap();
        let state = build_initial_scene_state(&def);
        assert_eq!(state.gm_secrets.len(), 1);
        assert_eq!(state.gm_secrets[0].kind, "threat");
        assert!(!state.gm_secrets[0].revealed);
        assert!(
            gm_screen_context(&state)
                .contains("[secret_1] threat, about Lighthouse: A cult below.")
        );
        // Scenes without secrets keep their file format.
        let plain: SceneDefinition = serde_json::from_value(
            serde_json::json!({"id": "x", "title": "T", "description": "D"}),
        )
        .unwrap();
        assert!(
            serde_json::to_value(&plain)
                .unwrap()
                .get("gm_secrets")
                .is_none()
        );
    }

    #[test]
    fn ids_are_normalized_and_updates_merge() {
        let mut state = StageEngine::new().get_state();
        apply_secret_updates(
            &mut state,
            &[secret(
                "Mira's Debt!",
                "Mira",
                "Mira owes the thieves' guild 300 gold.",
            )],
        );
        apply_secret_updates(
            &mut state,
            &[PlanSecretUpdate {
                kind: "weird".into(),
                ..secret("mira_s_debt", "", "Mira owes the guild 500 gold.")
            }],
        );
        assert_eq!(state.gm_secrets.len(), 1);
        let s = &state.gm_secrets[0];
        assert_eq!(s.id, "mira_s_debt");
        assert_eq!(s.kind, "other");
        assert_eq!(s.about, "Mira");
        assert_eq!(s.text, "Mira owes the guild 500 gold.");
    }

    #[test]
    fn open_secrets_reach_only_the_planner_and_the_npc_itself() {
        let mut state = StageEngine::new().get_state();
        apply_secret_updates(
            &mut state,
            &[
                secret("debt", "Mira", "Mira owes the thieves' guild 300 gold."),
                secret("trap", "", "The third stair step is a pressure plate."),
            ],
        );
        let screen = gm_screen_context(&state);
        assert!(screen.contains("[debt] motive, about Mira: Mira owes"));
        assert!(screen.contains("pressure plate"));
        let agenda = hidden_agenda_block(&state, "mira");
        assert!(agenda.contains("thieves' guild") && !agenda.contains("pressure plate"));
        assert!(hidden_agenda_block(&state, "Bram").is_empty());
    }

    #[test]
    fn revealing_turns_a_secret_into_party_lore() {
        let mut state = StageEngine::new().get_state();
        apply_secret_updates(
            &mut state,
            &[secret("debt", "Mira", "Mira owes the guild.")],
        );
        let revealed = reveal_secrets(&mut state, &["Debt".into(), "unknown".into()]);
        assert_eq!(revealed.len(), 1);
        assert!(state.gm_secrets[0].revealed);
        assert_eq!(gm_screen_context(&state), "none");
        assert!(hidden_agenda_block(&state, "Mira").is_empty());
        let card = state
            .lore_cards
            .iter()
            .find(|c| c.id == "secret_debt")
            .unwrap();
        assert_eq!(card.audience, "party");
        assert_eq!(card.keywords, vec!["Mira".to_string()]);
        // Revealing twice does nothing.
        assert!(reveal_secrets(&mut state, &["debt".into()]).is_empty());
    }

    #[test]
    fn leaks_into_visible_texts_are_cut() {
        let mut state = StageEngine::new().get_state();
        apply_secret_updates(
            &mut state,
            &[
                secret("trap", "", "The third stair step is a pressure plate."),
                secret("debt", "Mira", "Mira owes the thieves' guild 300 gold."),
            ],
        );
        let mut plan = GmPlan {
            narration_plan: "They climb. The third stair step is a pressure plate. Mira owes the thieves' guild 300 gold.".into(),
            discovery: Some("The third stair step is a pressure plate.".into()),
            reveal_secrets: vec!["debt".into()],
            ..Default::default()
        };
        scrub_secret_leaks(&mut plan, &state);
        assert!(!plan.narration_plan.contains("pressure plate"));
        // A secret revealed in this beat may be told.
        assert!(plan.narration_plan.contains("thieves' guild"));
        assert_eq!(plan.discovery.as_deref(), Some("…"));

        // A broken reply keeps its narration plan, never the secrets around it.
        let mut fallback = GmPlan {
            narration_plan: r#"{"narration_plan": "Nebel zieht \"auf\".", "secret_updates": [{"id": "x", "text": "SECRET_X"#.into(),
            ..Default::default()
        };
        scrub_secret_leaks(&mut fallback, &state);
        assert_eq!(fallback.narration_plan, "Nebel zieht \"auf\".");
        let mut garbage = GmPlan {
            narration_plan: r#"{"secret_updates": [{"id": "x", "text": "SECRET_X"#.into(),
            ..Default::default()
        };
        scrub_secret_leaks(&mut garbage, &state);
        assert!(garbage.narration_plan.is_empty());
        // Prose without JSON stays as it is.
        let mut prose = GmPlan {
            narration_plan: "Die Gruppe erreicht das Tor.".into(),
            ..Default::default()
        };
        scrub_secret_leaks(&mut prose, &state);
        assert_eq!(prose.narration_plan, "Die Gruppe erreicht das Tor.");
    }
}
