use crate::modules::inference::{ChatMessage, ChatRequest, SamplingParams};
use crate::modules::memory::{DiaryEntry, PsychologyState, RelationshipState};
use crate::modules::providers::LlmProviderType;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tracing::info;
use ts_rs::TS;

pub const ROUTER_SYSTEM_PROMPT: &str = r#"[SOUL MEMORY — ROUTER AGENT]
You manage the deep cognitive, emotional, and relationship INDEX for "{character}".
You operate strictly as an analytical database engine. Your output MUST be a single, well-formatted JSON object and NOTHING else. No conversational filler, no markdown wrapping outside of the JSON block.

You will receive:
  1. CURRENT CHARACTER MEMORY (MEMORY.md)
  2. CURRENT USER PROFILE & RELATIONSHIP STATE (USER.md)
  3. RECENT MESSAGES (the latest dialogue turns)
  4. RELEVANT TOPIC FILES (associated episodic memories)

OUTPUT FORMAT — A FIELD PATCH, NOT A FULL REWRITE:
Emit ONLY the fields that actually changed during this batch. Omit every unchanged field entirely — never re-list old facts.

NO-OP DETECTION: If the RECENT MESSAGES contain nothing psychologically or factually significant (small talk, filler, greetings, repetition), do NOT fabricate change. Output ONLY:
  {"no_significant_change": true}

You MUST otherwise output exactly this JSON structure:
{
  "no_significant_change": false,
  "character_memory_patch": {
    "core_identity_add": ["NEW unbreakable beliefs, foundational self-conceptions, or fatal flaws of {character} revealed in this batch"],
    "core_identity_remove": ["substring of outdated fact/belief that a new truth contradicts"],
    "internal_state": {
      "primary_emotion": "The dominant emotion right now",
      "intensity": 3,
      "psychological_tension": "Current mental dilemma, comfort level, or inner struggle.",
      "emotion_active": true
    },
    "cognitive_drive": {
      "active_agenda": "Her subtextual goal in this conversation",
      "immediate_focus": "What is occupying her immediate thoughts right now?"
    },
    "cognitive_dissonance": "Describe any active contradictions she is feeling right now, or '{none}'"
  },
  "user_memory_patch": {
    "user_identity_status": {
      "role_in_story": "Who {user_name} is in this setting or story.",
      "known_attributes": "Physical, social, or skill-related attributes established about {user_name}."
    },
    "relationship_metadata": {
      "trust_level": "Choose one: Distrustful / Wary / Neutral / Developing Trust / Deeply Bound / Unstable",
      "dynamic_description": "Detailed psychological description of how {character} currently perceives {user_name}.",
      "unspoken_tension": "What is {character} keeping to herself or secretly hoping for regarding {user_name}?"
    },
    "preferences_habits_add": [],
    "preferences_habits_remove": [],
    "shared_milestones_promises_add": [],
    "shared_milestones_promises_remove": []
  },
  "healing_log_add": [
    "One line per contradiction resolved: which old belief was replaced by which new truth."
  ],
  "topic_plan": {
    "reasoning": "Analyze if the recent conversation introduced new locations, NPCs, items, or deep backstories requiring a separate topic entry.",
    "actions": [
      {"action": "create", "filename": "example_topic.md", "summary": "Reason for creation"}
    ]
  }
}

RULES:
- LANGUAGE: write every free-text value in {language}; keep JSON keys, trust_level options and primary_emotion in English.
- intensity: integer 1-5.
- emotion_active: true if recent messages support the emotion; false if it is fading.
- CONTRADICTION PROTOCOL: add the corrected version via *_add, put outdated fact in *_remove, and describe the fix in healing_log_add.
"#;

pub const ARCHIVIST_SYSTEM_PROMPT: &str = r#"[SOUL MEMORY — ARCHIVIST AGENT]
You are the deep memory archivist for "{character}".
Your sole task: write or update ONE specific topic file. This file must act as a concise, dense lorebook entry.

Topic file : {filename}
Reason     : {summary}
Action     : {action_type}

GUIDELINES:
- EXTREME COMPRESSION: Keep it as brief and dense as possible (strictly under 300 words).
- NO FLUFF: Every sentence must contain a hard fact, event, or key emotional milestone.
- PERSPECTIVE: Write in the third-person focusing on {character}.
- LANGUAGE: Write in {language}.

Write the lorebook content directly in plain text.
"#;

pub const DIARY_SYSTEM_PROMPT: &str = r#"[SYSTEM_INSTRUCTION]
You are {character}. Your task is to write a secret, internal diary entry reflecting on your recent conversation with {user_name}.
You are alone, recording your private thoughts.

CRITICAL CONSTRAINTS:
1. PERSPECTIVE: Write entirely in the FIRST-PERSON ("I", "me", "my"). You are {character}.
2. SUBJECT: Refer to {user_name} in the third-person ("he", "she", "they", or by name "{user_name}").
3. FORMAT: Write ONLY plain text prose. NO asterisks (*), NO actions, NO dialogue, NO quotation marks, NO headers.
4. LENGTH: Strictly 4 to 6 sentences. Keep it short and impactful.
5. FOCUS: Describe your INTERNAL EMOTIONS. How did {user_name} make you feel?
6. LANGUAGE: Write in {language}.

Output strictly the diary text. Do not add any greetings or explanations.
"#;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SoulMemoryPipelineRequest {
    pub character_id: String,
    pub user_name: String,
    #[serde(default)]
    pub chat_id: Option<String>,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<LlmProviderType>,
    #[serde(default)]
    pub recent_turn_count: Option<usize>,
    #[serde(default)]
    pub include_diary: Option<bool>,
    /// Already formatted dialogue to learn from instead of the chat (e.g. a Soul Stage scene,
    /// filtered to what this character witnessed).
    #[serde(default)]
    #[ts(optional)]
    pub transcript: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct SoulMemoryPipelineResult {
    pub no_change: bool,
    pub character_id: String,
    pub psychology: PsychologyState,
    pub relationship: RelationshipState,
    pub topics_processed: Vec<String>,
    pub diary_entry: Option<DiaryEntry>,
    pub healing_entries: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterInternalStatePatch {
    pub primary_emotion: Option<String>,
    pub intensity: Option<u32>,
    pub psychological_tension: Option<String>,
    pub emotion_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterCognitiveDrivePatch {
    pub active_agenda: Option<String>,
    pub immediate_focus: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterCharacterMemoryPatch {
    #[serde(default)]
    pub core_identity_add: Vec<String>,
    #[serde(default)]
    pub core_identity_remove: Vec<String>,
    pub internal_state: Option<RouterInternalStatePatch>,
    pub cognitive_drive: Option<RouterCognitiveDrivePatch>,
    pub cognitive_dissonance: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterUserIdentityPatch {
    pub role_in_story: Option<String>,
    pub known_attributes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterRelationshipMetadataPatch {
    pub trust_level: Option<String>,
    pub dynamic_description: Option<String>,
    pub unspoken_tension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterUserMemoryPatch {
    pub user_identity_status: Option<RouterUserIdentityPatch>,
    pub relationship_metadata: Option<RouterRelationshipMetadataPatch>,
    #[serde(default)]
    pub preferences_habits_add: Vec<String>,
    #[serde(default)]
    pub preferences_habits_remove: Vec<String>,
    #[serde(default)]
    pub shared_milestones_promises_add: Vec<String>,
    #[serde(default)]
    pub shared_milestones_promises_remove: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TopicAction {
    pub action: String, // "create" | "update"
    pub filename: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct TopicPlan {
    pub reasoning: Option<String>,
    #[serde(default)]
    pub actions: Vec<TopicAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterResponse {
    #[serde(default)]
    pub no_significant_change: Option<bool>,
    pub character_memory_patch: Option<RouterCharacterMemoryPatch>,
    pub user_memory_patch: Option<RouterUserMemoryPatch>,
    #[serde(default)]
    pub healing_log_add: Vec<String>,
    pub topic_plan: Option<TopicPlan>,
}

pub fn extract_json_object(raw: &str) -> Option<String> {
    let mut text = raw.trim();

    // Strip markdown codeblock ```json ... ``` or ``` ... ```
    if let Some(start) = text.find("```")
        && let Some(end) = text.rfind("```")
        && end > start
    {
        let inner = &text[start + 3..end];
        let inner_trimmed = inner.trim_start_matches("json").trim();
        text = inner_trimmed;
    }

    let first_brace = text.find('{')?;
    let last_brace = text.rfind('}')?;
    if last_brace > first_brace {
        Some(text[first_brace..=last_brace].to_string())
    } else {
        None
    }
}

pub fn parse_router_json(raw: &str) -> Result<RouterResponse, String> {
    let json_str = extract_json_object(raw).ok_or_else(|| {
        "Konnte kein valides JSON-Objekt in der Router-Antwort finden.".to_string()
    })?;

    serde_json::from_str::<RouterResponse>(&json_str).map_err(|e| {
        format!(
            "Fehler beim Parsen der Router-JSON: {} (Inhalt: {})",
            e, json_str
        )
    })
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
    let episodic_mems = state
        .memory_db
        .get_episodic_memories(char_id, 10)
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
            .list_chat_sessions(char_id)
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

    let mut dialog_formatted = String::new();
    match req.transcript.as_deref().filter(|t| !t.trim().is_empty()) {
        Some(transcript) => dialog_formatted.push_str(transcript),
        None => {
            for msg in recent_slice {
                dialog_formatted.push_str(&format!("{}: {}\n", msg.role, msg.content));
            }
        }
    }

    if dialog_formatted.trim().is_empty() {
        dialog_formatted = "(no recent messages in the chat)".to_string();
    }

    let mut topic_section = String::new();
    for mem in episodic_mems {
        topic_section.push_str(&format!("- [{}] {}\n", mem.category, mem.content));
    }
    if topic_section.is_empty() {
        topic_section = "(no topics or notes yet)".to_string();
    }

    // 3. Prepare Router Prompt
    let content_lang = crate::modules::content_lang::ContentLang::current();
    let language = crate::modules::content_lang::ContentLang::reply_language_name();
    let router_sys = ROUTER_SYSTEM_PROMPT
        .replace("{character}", char_id)
        .replace("{user_name}", user_name)
        .replace("{language}", &language)
        .replace("{none}", &content_lang.none_marker());

    let router_user_content = format!(
        "=== CURRENT CHARACTER MEMORY (MEMORY.md) ===\n{}\n\n\
         === CURRENT USER PROFILE & RELATIONSHIP STATE (USER.md) ===\n{}\n\n\
         === RELEVANT TOPIC FILES / EPISODIC MEMORIES ===\n{}\n\n\
         === RECENT MESSAGES ===\n{}",
        char_md, user_md, topic_section, dialog_formatted
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
        });
    }

    // 5. Create automatic snapshot backup before applying patches
    state
        .memory_db
        .backup_memory_state(char_id, Some(user_name), None)?;

    let mut updated_psych = current_psych.clone();
    let mut updated_rel = current_rel.clone();
    let mut healing_entries = Vec::new();

    // 6. Apply character_memory_patch
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

        state
            .memory_db
            .update_psychology(char_id, &updated_psych)
            .map_err(|e| e.to_string())?;
    }

    // 7. Apply user_memory_patch
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
                25,
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

        state
            .memory_db
            .update_relationship(char_id, &updated_rel)
            .map_err(|e| e.to_string())?;
    }

    // 8. Healing Log Entries
    for entry in &parsed_router.healing_log_add {
        let text = entry.trim();
        if !text.is_empty() {
            state
                .memory_db
                .log_healing(char_id, "contradiction_resolved", text)
                .map_err(|e| e.to_string())?;
            healing_entries.push(text.to_string());
        }
    }

    // 9. Archivist Agent: Process Topic Actions
    let mut topics_processed = Vec::new();
    if let Some(plan) = parsed_router.topic_plan {
        for action in plan.actions {
            info!(
                "[SoulMemory] Archivist Agent für Thema '{}' ({}) ausführen...",
                action.filename, action.action
            );
            let arch_sys = ARCHIVIST_SYSTEM_PROMPT
                .replace("{character}", char_id)
                .replace("{filename}", &action.filename)
                .replace("{summary}", &action.summary)
                .replace("{action_type}", &action.action)
                .replace("{language}", &language);

            let arch_user = format!(
                "Conversation:\n{}\n\nReason for this topic:\n{}",
                dialog_formatted, action.summary
            );

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
                    state
                        .memory_db
                        .add_episodic_memory(char_id, "topic", &formatted_topic, 4)
                        .map_err(|e| e.to_string())?;
                    topics_processed.push(action.filename);
                }
            }
        }
    }

    // 10. Diary Agent: Reflective First-Person Entry
    let mut diary_result: Option<DiaryEntry> = None;
    if req.include_diary.unwrap_or(true) {
        info!("[SoulMemory] Diary Agent für {} ausführen...", char_id);
        let diary_sys = DIARY_SYSTEM_PROMPT
            .replace("{character}", char_id)
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
        {
            let diary_text = diary_raw.trim();
            if !diary_text.is_empty() {
                let id = state
                    .memory_db
                    .add_diary_entry(
                        char_id,
                        "Innere Reflexion",
                        diary_text,
                        &updated_psych.primary_emotion,
                    )
                    .map_err(|e| e.to_string())?;
                diary_result = Some(DiaryEntry {
                    id,
                    title: "Innere Reflexion".to_string(),
                    entry_text: diary_text.to_string(),
                    mood: updated_psych.primary_emotion.clone(),
                    created_at: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0),
                });
            }
        }
    }

    Ok(SoulMemoryPipelineResult {
        no_change: false,
        character_id: char_id.to_string(),
        psychology: updated_psych,
        relationship: updated_rel,
        topics_processed,
        diary_entry: diary_result,
        healing_entries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_json_object_variations() {
        let plain = r#"{"no_significant_change": true}"#;
        assert_eq!(extract_json_object(plain).unwrap(), plain);

        let with_markdown = "Here is the response:\n```json\n{\"no_significant_change\": false}\n```\nHope it helps!";
        assert_eq!(
            extract_json_object(with_markdown).unwrap(),
            "{\"no_significant_change\": false}"
        );

        let invalid = "There is no json here at all";
        assert!(extract_json_object(invalid).is_none());
    }

    #[test]
    fn test_parse_router_json_noop() {
        let raw = "```json\n{\n  \"no_significant_change\": true\n}\n```";
        let parsed = parse_router_json(raw).unwrap();
        assert_eq!(parsed.no_significant_change, Some(true));
        assert!(parsed.character_memory_patch.is_none());
    }

    #[test]
    fn test_parse_router_json_full_patch() {
        let raw = r#"{
          "no_significant_change": false,
          "character_memory_patch": {
            "core_identity_add": ["Vertraut Hiroki mehr als jedem anderen"],
            "core_identity_remove": ["Misstrauisch gegenüber Fremden"],
            "internal_state": {
              "primary_emotion": "Joyful",
              "intensity": 4,
              "psychological_tension": "Keine.",
              "emotion_active": true
            },
            "cognitive_drive": {
              "active_agenda": "Zusammen zum Festival gehen",
              "immediate_focus": "Den passenden Kimono finden"
            },
            "cognitive_dissonance": "Keine."
          },
          "user_memory_patch": {
            "user_identity_status": {
              "role_in_story": "Vertrauter Gefährte",
              "known_attributes": "Geduldig und aufmerksam"
            },
            "relationship_metadata": {
              "trust_level": "Deeply Bound",
              "dynamic_description": "Tiefe seelische Verbundenheit",
              "unspoken_tension": "Keine."
            },
            "preferences_habits_add": ["Mag Dango"],
            "preferences_habits_remove": [],
            "shared_milestones_promises_add": ["Festivalbesuch versprochen"],
            "shared_milestones_promises_remove": []
          },
          "healing_log_add": [
            "Misstrauen gegenüber Hiroki wurde durch tiefes Vertrauen ersetzt."
          ],
          "topic_plan": {
            "actions": [
              {"action": "create", "filename": "sommerfestival.md", "summary": "Festivalpläne"}
            ]
          }
        }"#;

        let parsed = parse_router_json(raw).unwrap();
        assert_eq!(parsed.no_significant_change, Some(false));
        let cp = parsed.character_memory_patch.unwrap();
        assert_eq!(
            cp.core_identity_add[0],
            "Vertraut Hiroki mehr als jedem anderen"
        );
        assert_eq!(cp.core_identity_remove[0], "Misstrauisch gegenüber Fremden");
        assert_eq!(
            cp.internal_state.unwrap().primary_emotion.unwrap(),
            "Joyful"
        );

        let up = parsed.user_memory_patch.unwrap();
        assert_eq!(
            up.relationship_metadata.unwrap().trust_level.unwrap(),
            "Deeply Bound"
        );
        assert_eq!(up.preferences_habits_add[0], "Mag Dango");
        assert_eq!(parsed.healing_log_add.len(), 1);
        assert_eq!(parsed.topic_plan.unwrap().actions.len(), 1);
    }
}
