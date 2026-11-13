use crate::modules::inference::{ChatMessage, ChatRequest, SamplingParams};
use crate::modules::memory::DiaryEntry;
use crate::state::AppState;
use tracing::info;

use super::json::parse_router_json;
use super::models::{SoulMemoryPipelineRequest, SoulMemoryPipelineResult};
use super::prompts::{ARCHIVIST_SYSTEM_PROMPT, DIARY_SYSTEM_PROMPT, ROUTER_SYSTEM_PROMPT};

/// Who wrote a message, as the memory pipeline's transcript names them.
pub(super) fn transcript_speaker(
    msg: &crate::modules::memory::StoredChatMessage,
    user_name: &str,
    names: Option<&std::collections::HashMap<String, String>>,
) -> String {
    match (names, msg.role.as_str()) {
        (Some(_), "user") => user_name.to_string(),
        (Some(names), "assistant") => names
            .get(&msg.speaker_id)
            .cloned()
            .unwrap_or_else(|| msg.role.clone()),
        _ => msg.role.clone(),
    }
}

fn remove_matching(list: &mut Vec<String>, patterns: &[String]) -> usize {
    let mut removed_count = 0;
    list.retain(|item| {
        let norm_item = item.to_lowercase();
        let matches = patterns.iter().any(|p| {
            let norm_p = p.trim().to_lowercase();
            !norm_p.is_empty() && (norm_item == norm_p || norm_item.contains(&norm_p))
        });
        if matches {
            removed_count += 1;
            false
        } else {
            true
        }
    });
    removed_count
}

fn add_unique(list: &mut Vec<String>, items: &[String], max_cap: usize) {
    for item in items {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if !list.iter().any(|existing| existing.to_lowercase() == lower) {
            list.push(trimmed.to_string());
        }
    }
    if list.len() > max_cap {
        let overflow = list.len() - max_cap;
        list.drain(0..overflow);
    }
}

pub async fn execute_soul_memory_pipeline(
    state: &AppState,
    req: SoulMemoryPipelineRequest,
) -> Result<SoulMemoryPipelineResult, String> {
    execute_memory_pipeline(state, req).await
}

/// One open intention as the router sees it: `- #id [basis, due …] title – details`.
fn router_intention_line(entry: &crate::modules::memory::IntentionEntry) -> String {
    let due = match entry
        .due_at
        .and_then(|d| chrono::TimeZone::timestamp_opt(&chrono::Local, d as i64, 0).single())
    {
        Some(due) if entry.due_has_time => format!(", due {}", due.format("%Y-%m-%d %H:%M")),
        Some(due) => format!(", due {}", due.format("%Y-%m-%d")),
        None => String::new(),
    };
    let details = if entry.details.is_empty() {
        String::new()
    } else {
        format!(" – {}", entry.details)
    };
    format!(
        "- #{} [{}{}, by {}] {}{}\n",
        entry.id, entry.time_basis, due, entry.initiator, entry.title, details
    )
}

/// Preferences and habits a relationship keeps before the router is asked to merge them.
pub(super) const HABITS_SOFT_CAP: usize = 12;
/// Never more than this, even when a reflection only adds (the oldest go).
const HABITS_HARD_CAP: usize = 25;
/// A merged list keeps at least this many patterns.
const HABITS_MIN_MERGED: usize = 3;
/// One merged pattern is a phrase, not a paragraph.
const HABIT_MAX_CHARS: usize = 160;

/// The task for the router when the preferences and habits grew too long.
pub(super) fn consolidation_task(habits: &[String]) -> Option<String> {
    (habits.len() > HABITS_SOFT_CAP).then(|| {
        format!(
            "=== CONSOLIDATION TASK ===\nKnown Preferences & Habits has {} entries (limit {HABITS_SOFT_CAP}). \
             Return preferences_habits_replace with at most {HABITS_SOFT_CAP} entries that merge related ones into patterns.\n\n",
            habits.len()
        )
    })
}

/// A merged list replaces the habits only when it was asked for and is usable.
pub(super) fn accept_habits_replace(asked: bool, replace: &[String]) -> Option<Vec<String>> {
    let cleaned: Vec<String> = replace
        .iter()
        .map(|h| h.trim().to_string())
        .filter(|h| !h.is_empty())
        .collect();
    // A few short patterns, not one paragraph that swallowed everything.
    let usable = cleaned.len() >= HABITS_MIN_MERGED
        && cleaned.len() <= HABITS_SOFT_CAP
        && cleaned.iter().all(|h| h.chars().count() <= HABIT_MAX_CHARS);
    (asked && usable).then_some(cleaned)
}

/// Characters of one memory the router sees; topic files can be long.
pub(super) const ROUTER_MEMORY_CHARS: usize = 300;

/// One memory as the router sees it: `- #id [category] content`, long text shortened.
pub(super) fn router_memory_line(mem: &crate::modules::memory::EpisodicMemory) -> String {
    let flat = mem.content.split_whitespace().collect::<Vec<_>>().join(" ");
    let text = match flat.char_indices().nth(ROUTER_MEMORY_CHARS) {
        Some((cut, _)) => format!("{}…", &flat[..cut]),
        None => flat,
    };
    format!("- #{} [{}] {}\n", mem.id, mem.category, text)
}

pub async fn execute_memory_pipeline(
    state: &AppState,
    req: SoulMemoryPipelineRequest,
) -> Result<SoulMemoryPipelineResult, String> {
    let char_id = &req.character_id;
    let user_name = &req.user_name;

    // 1. Fetch current cognitive state
    let char_md = state
        .memory_db
        .render_character_markdown(char_id)
        .map_err(|e| e.to_string())?;
    let user_md = state
        .memory_db
        .render_user_markdown(char_id, user_name)
        .map_err(|e| e.to_string())?;
    // 2. Fetch recent conversation messages
    let turn_limit = req.recent_turn_count.unwrap_or(8);
    let messages = if let Some(cid) = &req.chat_id {
        state
            .memory_db
            .get_chat_messages(cid)
            .map_err(|e| e.to_string())?
    } else {
        // Find most recent session for character
        let sessions = state
            .memory_db
            .list_chat_sessions(crate::modules::memory::base_character_id(char_id))
            .map_err(|e| e.to_string())?;
        if let Some(first) = sessions.first() {
            state
                .memory_db
                .get_chat_messages(&first.id)
                .map_err(|e| e.to_string())?
        } else {
            Vec::new()
        }
    };

    let recent_slice = if messages.len() > turn_limit {
        &messages[messages.len() - turn_limit..]
    } else {
        &messages[..]
    };
    // Memories remember the messages they were learned from (not for a Stage transcript).
    let source_chat_id = messages.first().map(|m| m.chat_id.clone());
    let source_ids: Vec<String> = if req
        .transcript
        .as_deref()
        .is_some_and(|t| !t.trim().is_empty())
    {
        Vec::new()
    } else {
        recent_slice.iter().map(|m| m.id.clone()).collect()
    };

    let mut dialog_formatted = String::new();
    match req.transcript.as_deref().filter(|t| !t.trim().is_empty()) {
        Some(transcript) => dialog_formatted.push_str(transcript),
        None => {
            // Out-of-character directions to the AI are nothing to remember.
            for msg in recent_slice {
                let text = crate::modules::ooc::strip(&msg.content);
                if !text.is_empty() {
                    let speaker =
                        transcript_speaker(msg, &req.user_name, req.speaker_names.as_ref());
                    dialog_formatted.push_str(&format!("{speaker}: {text}\n"));
                }
            }
        }
    }

    if dialog_formatted.trim().is_empty() {
        dialog_formatted = "(no recent messages in the chat)".to_string();
    }

    // The router sees the memories that fit this conversation, so it can spot contradictions.
    let recalled = state
        .memory_db
        .select_prompt_memories(
            char_id,
            &dialog_formatted,
            crate::modules::memory::MemoryBudget {
                tokens: 800,
                shown_chars: ROUTER_MEMORY_CHARS,
            },
        )
        .map_err(|e| e.to_string())?;
    let mut topic_section = String::new();
    for mem in recalled.core.iter().chain(&recalled.relevant) {
        topic_section.push_str(&router_memory_line(mem));
    }
    if topic_section.is_empty() {
        topic_section = "(no topics or notes yet)".to_string();
    }

    // 3. Prepare Router Prompt
    let content_lang = crate::modules::content_lang::ContentLang::current();
    let language = crate::modules::content_lang::ContentLang::reply_language_name();
    let router_sys = ROUTER_SYSTEM_PROMPT
        .replace(
            "{character}",
            crate::modules::memory::base_character_id(char_id),
        )
        .replace("{user_name}", user_name)
        .replace("{language}", &language)
        .replace("{none}", &content_lang.none_marker());

    // Open intentions with their ids, so the router can resolve them (missed ones expire first).
    let now = chrono::Local::now();
    let open_intentions = state
        .memory_db
        .get_intentions(char_id, user_name, false)
        .map_err(|e| e.to_string())?;
    let mut intention_section = String::new();
    for entry in &open_intentions {
        intention_section.push_str(&router_intention_line(entry));
    }
    if intention_section.is_empty() {
        intention_section = "(none)".to_string();
    }

    let habits_before = state
        .memory_db
        .get_or_create_relationship(char_id, user_name)
        .map_err(|e| e.to_string())?
        .preferences_habits;
    let consolidation = consolidation_task(&habits_before);

    let router_user_content = format!(
        "{}=== CURRENT LOCAL TIME ===\n{}\n\n\
         === CURRENT CHARACTER MEMORY (MEMORY.md) ===\n{}\n\n\
         === CURRENT USER PROFILE & RELATIONSHIP STATE (USER.md) ===\n{}\n\n\
         === RELEVANT TOPIC FILES / EPISODIC MEMORIES ===\n{}\n\n\
         === OPEN INTENTIONS ===\n{}\n\n\
         === RECENT MESSAGES ===\n{}",
        consolidation.as_deref().unwrap_or_default(),
        now.format("%A, %Y-%m-%d %H:%M"),
        char_md,
        user_md,
        topic_section,
        intention_section,
        dialog_formatted
    );

    let router_messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: router_sys,
            attachments: Vec::new(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: router_user_content,
            attachments: Vec::new(),
        },
    ];

    let router_req = ChatRequest {
        endpoint_url: req.endpoint_url.clone(),
        api_key: req.api_key.clone(),
        model: req.model.clone(),
        messages: router_messages,
        sampling: Some(SamplingParams {
            temperature: Some(0.2), // Low temperature for deterministic database output
            top_p: Some(0.9),
            max_tokens: Some(1500),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: req.provider.clone(),
    };

    info!("[SoulMemory] Router Agent ausführen für {}...", char_id);
    let router_raw = state.inference_client.generate_direct(router_req).await?;
    let parsed_router = parse_router_json(&router_raw)?;

    // 4. Check for No-Op
    let current_psych = state
        .memory_db
        .get_or_create_psychology(char_id)
        .map_err(|e| e.to_string())?;
    let current_rel = state
        .memory_db
        .get_or_create_relationship(char_id, user_name)
        .map_err(|e| e.to_string())?;

    if parsed_router.no_significant_change == Some(true) {
        info!(
            "[SoulMemory] Router meldete 'no_significant_change': Keine Änderungen erforderlich."
        );
        return Ok(SoulMemoryPipelineResult {
            no_change: true,
            character_id: char_id.to_string(),
            psychology: current_psych,
            relationship: current_rel,
            topics_processed: Vec::new(),
            diary_entry: None,
            healing_entries: Vec::new(),
            contradicted_memories: 0,
        });
    }

    // 5. Work out every change first; the model calls of archivist and diary come before any
    // write, and all writes happen together at the end (one transaction).
    let mut updated_psych = current_psych.clone();
    let mut updated_rel = current_rel.clone();
    let mut healing_entries = Vec::new();

    // 6. Character memory patch
    let psych_changed = parsed_router.character_memory_patch.is_some();
    if let Some(cp) = parsed_router.character_memory_patch {
        if !cp.core_identity_remove.is_empty() {
            remove_matching(&mut updated_psych.core_identity, &cp.core_identity_remove);
        }
        if !cp.core_identity_add.is_empty() {
            add_unique(&mut updated_psych.core_identity, &cp.core_identity_add, 15);
        }

        if let Some(ist) = cp.internal_state {
            if let Some(em) = ist.primary_emotion
                && !em.trim().is_empty()
            {
                updated_psych.primary_emotion = em.trim().to_string();
            }
            if let Some(intensity) = ist.intensity {
                updated_psych.intensity = intensity.clamp(1, 5);
            }
            if let Some(tens) = ist.psychological_tension
                && !tens.trim().is_empty()
            {
                updated_psych.psychological_tension = tens.trim().to_string();
            }
            if ist.emotion_active == Some(false) {
                // Advance emotional decay
                updated_psych.emotional_decay_counter += 1;
                if updated_psych.emotional_decay_counter >= 2 {
                    if updated_psych.intensity > 3 {
                        updated_psych.intensity -= 1;
                    }
                    updated_psych.emotional_decay_counter = 0;
                }
            }
        }

        if let Some(drive) = cp.cognitive_drive {
            if let Some(agenda) = drive.active_agenda
                && !agenda.trim().is_empty()
            {
                updated_psych.active_agenda = agenda.trim().to_string();
            }
            if let Some(focus) = drive.immediate_focus
                && !focus.trim().is_empty()
            {
                updated_psych.immediate_focus = focus.trim().to_string();
            }
        }

        if let Some(dissonance) = cp.cognitive_dissonance
            && !dissonance.trim().is_empty()
        {
            updated_psych.cognitive_dissonance = dissonance.trim().to_string();
        }
    }

    // 7. User memory patch
    let rel_changed = parsed_router.user_memory_patch.is_some();
    if let Some(up) = parsed_router.user_memory_patch {
        if let Some(uis) = up.user_identity_status {
            if let Some(role) = uis.role_in_story
                && !role.trim().is_empty()
            {
                updated_rel.role_in_story = role.trim().to_string();
            }
            if let Some(attrs) = uis.known_attributes
                && !attrs.trim().is_empty()
            {
                updated_rel.known_attributes = attrs.trim().to_string();
            }
        }

        if let Some(meta) = up.relationship_metadata {
            if let Some(trust) = meta.trust_level
                && !trust.trim().is_empty()
            {
                updated_rel.trust_level = trust.trim().to_string();
            }
            if let Some(dyn_desc) = meta.dynamic_description
                && !dyn_desc.trim().is_empty()
            {
                updated_rel.dynamic_description = dyn_desc.trim().to_string();
            }
            if let Some(tension) = meta.unspoken_tension
                && !tension.trim().is_empty()
            {
                updated_rel.unspoken_tension = tension.trim().to_string();
            }
        }

        if let Some(merged) =
            accept_habits_replace(consolidation.is_some(), &up.preferences_habits_replace)
        {
            info!(
                "[SoulMemory] Gewohnheiten zusammengefasst: {} → {} Einträge.",
                updated_rel.preferences_habits.len(),
                merged.len()
            );
            updated_rel.preferences_habits = merged;
        }
        if !up.preferences_habits_remove.is_empty() {
            remove_matching(
                &mut updated_rel.preferences_habits,
                &up.preferences_habits_remove,
            );
        }
        if !up.preferences_habits_add.is_empty() {
            add_unique(
                &mut updated_rel.preferences_habits,
                &up.preferences_habits_add,
                HABITS_HARD_CAP,
            );
        }

        if !up.shared_milestones_promises_remove.is_empty() {
            remove_matching(
                &mut updated_rel.shared_milestones,
                &up.shared_milestones_promises_remove,
            );
        }
        if !up.shared_milestones_promises_add.is_empty() {
            add_unique(
                &mut updated_rel.shared_milestones,
                &up.shared_milestones_promises_add,
                25,
            );
        }
    }

    // 8. Healing log entries
    for entry in &parsed_router.healing_log_add {
        let text = entry.trim();
        if !text.is_empty() {
            healing_entries.push(text.to_string());
        }
    }

    // Only memories the router was shown may be retired (a model can invent ids).
    let shown: std::collections::HashSet<i64> = recalled
        .core
        .iter()
        .chain(&recalled.relevant)
        .map(|m| m.id)
        .collect();
    let mut supersede = Vec::new();
    for outdated in parsed_router.memory_supersede {
        if shown.contains(&outdated.id) {
            supersede.push(crate::modules::memory::MemorySupersede {
                id: outdated.id,
                reason: outdated.reason.trim().to_string(),
                replaced_by_topic: outdated.replaced_by_topic,
            });
        } else {
            info!(
                "[SoulMemory] Router wollte unbekannte Erinnerung #{} ablösen – ignoriert.",
                outdated.id
            );
        }
    }

    // Intentions: dates are read here; a Stage transcript only knows story time. Only open
    // intentions the router was shown may be resolved.
    let story_only = req
        .transcript
        .as_deref()
        .is_some_and(|t| !t.trim().is_empty());
    let mut intention_create = Vec::new();
    let mut intention_resolve = Vec::new();
    if let Some(patch) = parsed_router.intentions_patch {
        for create in patch.create {
            let time_basis = if story_only {
                "story".to_string()
            } else {
                create.time_basis
            };
            let due = create
                .due
                .as_deref()
                .filter(|_| time_basis.trim().eq_ignore_ascii_case("real"))
                .and_then(|d| crate::modules::memory::parse_due(d, now));
            intention_create.push(crate::modules::memory::IntentionDraft {
                title: create.title,
                details: create.details,
                initiator: create.initiator,
                time_basis,
                due_at: due.map(|(at, _)| at),
                due_has_time: due.is_some_and(|(_, has_time)| has_time),
            });
        }
        for resolve in patch.resolve {
            if open_intentions.iter().any(|e| e.id == resolve.id) {
                intention_resolve.push((resolve.id, resolve.status));
            } else {
                info!(
                    "[SoulMemory] Router wollte unbekanntes Vorhaben #{} abschließen – ignoriert.",
                    resolve.id
                );
            }
        }
    }

    // 9. Archivist agent: one topic memory per planned topic
    let mut topics_processed = Vec::new();
    let mut topic_memories = Vec::new();
    if let Some(plan) = parsed_router.topic_plan {
        for action in plan.actions {
            info!(
                "[SoulMemory] Archivist Agent für Thema '{}' ({}) ausführen...",
                action.filename, action.action
            );
            let arch_sys = ARCHIVIST_SYSTEM_PROMPT
                .replace(
                    "{character}",
                    crate::modules::memory::base_character_id(char_id),
                )
                .replace("{filename}", &action.filename)
                .replace("{summary}", &action.summary)
                .replace("{action_type}", &action.action)
                .replace("{language}", &language);

            // An existing topic is merged instead of written anew, so nothing gets lost.
            let topic_key = crate::modules::memory::normalize_topic_key(&action.filename);
            let current = match &topic_key {
                Some(key) => state
                    .memory_db
                    .active_topic_memory(char_id, key)
                    .map_err(|e| e.to_string())?,
                None => None,
            };
            let mut arch_user = format!(
                "Conversation:\n{}\n\nReason for this topic:\n{}",
                dialog_formatted, action.summary
            );
            if let Some(current) = &current {
                arch_user.push_str(&format!(
                    "\n\nCurrent content of this topic file:\n{}\n\nWrite the complete updated file: keep what still holds, add the new facts and drop what the conversation contradicts.",
                    crate::modules::memory::topic_body(&current.content)
                ));
            }

            let arch_req = ChatRequest {
                endpoint_url: req.endpoint_url.clone(),
                api_key: req.api_key.clone(),
                model: req.model.clone(),
                messages: vec![
                    ChatMessage {
                        role: "system".to_string(),
                        content: arch_sys,
                        attachments: Vec::new(),
                    },
                    ChatMessage {
                        role: "user".to_string(),
                        content: arch_user,
                        attachments: Vec::new(),
                    },
                ],
                sampling: Some(SamplingParams {
                    temperature: Some(0.3),
                    max_tokens: Some(600),
                    ..Default::default()
                }),
                reasoning_mode: Some(false),
                provider: req.provider.clone(),
            };

            let arch_raw = state.inference_client.generate_direct(arch_req).await?;
            {
                let trimmed = arch_raw.trim();
                if !trimmed.is_empty() {
                    let formatted_topic = format!(
                        "[{}: {}]\n{}",
                        content_lang.t("Topic"),
                        action.filename,
                        trimmed
                    );
                    topic_memories.push(crate::modules::memory::TopicMemory {
                        key: topic_key,
                        text: formatted_topic,
                        significance: action.significance,
                    });
                    topics_processed.push(action.filename);
                }
            }
        }
    }

    // 10. Diary agent: reflective first-person entry
    let mut diary_text = String::new();
    if req.include_diary.unwrap_or(true) {
        info!("[SoulMemory] Diary Agent für {} ausführen...", char_id);
        let diary_sys = DIARY_SYSTEM_PROMPT
            .replace(
                "{character}",
                crate::modules::memory::base_character_id(char_id),
            )
            .replace("{user_name}", user_name)
            .replace("{language}", &language);

        let diary_user = format!(
            "Latest conversation with {}:\n{}\n\nYour current emotion: {} (intensity: {}/5)",
            user_name, dialog_formatted, updated_psych.primary_emotion, updated_psych.intensity
        );

        let diary_req = ChatRequest {
            endpoint_url: req.endpoint_url.clone(),
            api_key: req.api_key.clone(),
            model: req.model.clone(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: diary_sys,
                    attachments: Vec::new(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: diary_user,
                    attachments: Vec::new(),
                },
            ],
            sampling: Some(SamplingParams {
                temperature: Some(0.6),
                max_tokens: Some(400),
                ..Default::default()
            }),
            reasoning_mode: Some(false),
            provider: req.provider.clone(),
        };

        let diary_raw = state.inference_client.generate_direct(diary_req).await?;
        diary_text = diary_raw.trim().to_string();
    }

    // 11. Snapshot, then every change in one transaction.
    state
        .memory_db
        .backup_memory_state(char_id, Some(user_name), None)?;
    let diary_title = "Innere Reflexion";
    let outcome = state
        .memory_db
        .apply_reflection(
            char_id,
            &crate::modules::memory::ReflectionChanges {
                psychology: psych_changed.then_some(&updated_psych),
                relationship: rel_changed.then_some(&updated_rel),
                healing: &healing_entries,
                topics: &topic_memories,
                supersede: &supersede,
                intentions: Some(&crate::modules::memory::IntentionChanges {
                    user_name,
                    create: intention_create,
                    resolve: intention_resolve,
                    source_chat_id: source_chat_id.as_deref(),
                    now,
                }),
                source: crate::modules::memory::MemorySource {
                    origin: "auto",
                    chat_id: if source_ids.is_empty() {
                        None
                    } else {
                        source_chat_id.as_deref()
                    },
                    message_ids: &source_ids,
                },
                diary: (!diary_text.is_empty()).then_some((
                    diary_title,
                    diary_text.as_str(),
                    updated_psych.primary_emotion.as_str(),
                )),
            },
        )
        .map_err(|e| e.to_string())?;
    let diary_result = outcome.diary.map(|id| DiaryEntry {
        id,
        title: diary_title.to_string(),
        entry_text: diary_text.clone(),
        mood: updated_psych.primary_emotion.clone(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
        kind: String::new(),
        period: String::new(),
    });

    Ok(SoulMemoryPipelineResult {
        no_change: false,
        character_id: char_id.to_string(),
        psychology: updated_psych,
        relationship: updated_rel,
        topics_processed,
        diary_entry: diary_result,
        healing_entries,
        contradicted_memories: outcome.contradictions,
    })
}
