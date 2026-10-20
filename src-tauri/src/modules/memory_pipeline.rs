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
  4. RELEVANT TOPIC FILES (associated episodic memories; #12 is the id of a memory, long ones are shortened)

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
    "preferences_habits_replace": ["only when a CONSOLIDATION TASK asks for it: the whole merged list"],
    "shared_milestones_promises_add": ["shared milestones only – promises and plans go into intentions_patch"],
    "shared_milestones_promises_remove": []
  },
  "healing_log_add": [
    "One line per contradiction resolved: which old belief was replaced by which new truth."
  ],
  "topic_plan": {
    "reasoning": "Analyze if the recent conversation introduced new locations, NPCs, items, or deep backstories requiring a separate topic entry.",
    "actions": [
      {"action": "create", "filename": "example_topic.md", "summary": "Reason for creation", "significance": 3}
    ]
  },
  "memory_supersede": [
    {"id": 12, "reason": "Why memory #12 is outdated now", "replaced_by_topic": "filename of a topic in topic_plan that holds the corrected version, or null"}
  ],
  "intentions_patch": {
    "create": [
      {"title": "Short plan or promise", "details": "", "initiator": "character | user | both", "time_basis": "real | story", "due": "YYYY-MM-DD or YYYY-MM-DDTHH:MM, or null"}
    ],
    "resolve": [{"id": 3, "status": "fulfilled | abandoned"}]
  }
}

RULES:
- LANGUAGE: write every free-text value in {language}; keep JSON keys, trust_level options and primary_emotion in English.
- intensity: integer 1-5.
- emotion_active: true if recent messages support the emotion; false if it is fading.
- CONTRADICTION PROTOCOL: add the corrected version via *_add, put outdated fact in *_remove, and describe the fix in healing_log_add.
- TOPICS: to update an existing topic, reuse its file name from its [Topic: …] header with action "update"; the archivist then merges the new facts into it and the old version is retired.
- TOPIC SIGNIFICANCE: integer 1-5 for each topic action, how much it matters for who someone is: 5 = core identity or the relationship itself (family, deep secrets, life goals), 3 = lasting useful background (places, people, hobbies), 1 = minor detail.
- CONSOLIDATION: only when the user message contains a CONSOLIDATION TASK, return preferences_habits_replace with the complete new list: merge related single facts into one pattern (e.g. three food likes into "Loves sweet Japanese snacks, especially dango"), keep what is distinct, drop nothing important. Otherwise omit it.
- INTENTIONS: create one when someone commits to doing something later (a plan, a promise, an appointment) that is not already in OPEN INTENTIONS. time_basis "real" only when it is clearly about the real world and real time (e.g. "remind me on Monday about my job interview"); then work out "due" from CURRENT LOCAL TIME. Everything happening inside the story or role-play (e.g. "tomorrow we ride to the castle") is "story" with due null; if in doubt, use "story". Resolve an open intention by its id (#3) when the RECENT MESSAGES show it was done (fulfilled) or called off (abandoned).
- MEMORY SUPERSEDE: list a memory only when the RECENT MESSAGES clearly contradict or outdate it (e.g. someone moved, a relationship ended), only with an id (#12) shown in RELEVANT TOPIC FILES, and put the corrected version into a topic or *_add. Leave it empty otherwise.
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

pub const CLEANUP_SYSTEM_PROMPT: &str = r##"[SOUL MEMORY — CLEANUP]
You tidy up the long-term memory of "{character}". Each memory is "#id [category] content".

Find groups of two or more memories about the same subject that repeat, overlap or update each other, and write ONE dense summary per group that keeps every fact that still holds. When memories contradict, the one with the higher id is newer and wins. Leave memories that stand on their own alone – do not group unrelated things.

Output ONLY this JSON object, nothing else:
{"groups": [{"memory_ids": [3, 8], "category": "topic", "title": "short subject name", "summary": "the merged memory"}]}

RULES:
- category: one of the categories of the grouped memories ("topic" for topic files, otherwise e.g. "fact" or "event").
- LANGUAGE: write title and summary in {language}.
- Nothing worth merging: {"groups": []}
"##;

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
    /// Group chat: names by speaker ID ('' = the chat's own character). The transcript then
    /// says who spoke instead of "user"/"assistant".
    #[serde(default)]
    #[ts(optional)]
    pub speaker_names: Option<std::collections::HashMap<String, String>>,
}

/// Who wrote a message, as the memory pipeline's transcript names them.
fn transcript_speaker(
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

pub type MemoryPipelineRequest = SoulMemoryPipelineRequest;

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
    /// Memories found contradicted: retired, or flagged for review when protected.
    #[serde(default)]
    pub contradicted_memories: usize,
}

pub type MemoryPipelineResult = SoulMemoryPipelineResult;

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterInternalStatePatch {
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub primary_emotion: Option<String>,
    #[serde(default, deserialize_with = "lenient::opt_u32")]
    pub intensity: Option<u32>,
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub psychological_tension: Option<String>,
    #[serde(default, deserialize_with = "lenient::opt_bool")]
    pub emotion_active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterCognitiveDrivePatch {
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub active_agenda: Option<String>,
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub immediate_focus: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterCharacterMemoryPatch {
    #[serde(default, deserialize_with = "lenient::text_list")]
    pub core_identity_add: Vec<String>,
    #[serde(default, deserialize_with = "lenient::text_list")]
    pub core_identity_remove: Vec<String>,
    pub internal_state: Option<RouterInternalStatePatch>,
    pub cognitive_drive: Option<RouterCognitiveDrivePatch>,
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub cognitive_dissonance: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterUserIdentityPatch {
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub role_in_story: Option<String>,
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub known_attributes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterRelationshipMetadataPatch {
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub trust_level: Option<String>,
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub dynamic_description: Option<String>,
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub unspoken_tension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterUserMemoryPatch {
    pub user_identity_status: Option<RouterUserIdentityPatch>,
    pub relationship_metadata: Option<RouterRelationshipMetadataPatch>,
    #[serde(default, deserialize_with = "lenient::text_list")]
    pub preferences_habits_add: Vec<String>,
    #[serde(default, deserialize_with = "lenient::text_list")]
    pub preferences_habits_remove: Vec<String>,
    /// The whole list, merged; only accepted when the router was asked to consolidate.
    #[serde(default, deserialize_with = "lenient::text_list")]
    pub preferences_habits_replace: Vec<String>,
    #[serde(default, deserialize_with = "lenient::text_list")]
    pub shared_milestones_promises_add: Vec<String>,
    #[serde(default, deserialize_with = "lenient::text_list")]
    pub shared_milestones_promises_remove: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TopicAction {
    #[serde(default, deserialize_with = "lenient::text")]
    pub action: String, // "create" | "update"
    #[serde(default, deserialize_with = "lenient::text")]
    pub filename: String,
    #[serde(default, deserialize_with = "lenient::text")]
    pub summary: String,
    /// 1..5, how much the topic matters for who someone is; missing → previous or default.
    #[serde(default, deserialize_with = "lenient::opt_u32")]
    pub significance: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct TopicPlan {
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub reasoning: Option<String>,
    #[serde(default)]
    pub actions: Vec<TopicAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterResponse {
    #[serde(default, deserialize_with = "lenient::opt_bool")]
    pub no_significant_change: Option<bool>,
    pub character_memory_patch: Option<RouterCharacterMemoryPatch>,
    pub user_memory_patch: Option<RouterUserMemoryPatch>,
    #[serde(default, deserialize_with = "lenient::text_list")]
    pub healing_log_add: Vec<String>,
    pub topic_plan: Option<TopicPlan>,
    #[serde(default)]
    pub memory_supersede: Vec<RouterMemorySupersede>,
    pub intentions_patch: Option<RouterIntentionsPatch>,
}

/// New and resolved intentions as the router writes them.
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterIntentionsPatch {
    #[serde(default)]
    pub create: Vec<RouterIntentionCreate>,
    #[serde(default)]
    pub resolve: Vec<RouterIntentionResolve>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterIntentionCreate {
    #[serde(default, deserialize_with = "lenient::text")]
    pub title: String,
    #[serde(default, deserialize_with = "lenient::text")]
    pub details: String,
    #[serde(default, deserialize_with = "lenient::text")]
    pub initiator: String,
    #[serde(default, deserialize_with = "lenient::text")]
    pub time_basis: String,
    /// `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (local time).
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub due: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterIntentionResolve {
    #[serde(default, deserialize_with = "lenient::id")]
    pub id: i64,
    #[serde(default, deserialize_with = "lenient::text")]
    pub status: String,
}

/// A memory the router found outdated.
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct RouterMemorySupersede {
    #[serde(default, deserialize_with = "lenient::id")]
    pub id: i64,
    #[serde(default, deserialize_with = "lenient::text")]
    pub reason: String,
    #[serde(default, deserialize_with = "lenient::opt_text")]
    pub replaced_by_topic: Option<String>,
}

/// Router answers as local models write them: a text field may come as a list, a list as
/// one text, a number as a string. Strict types threw away the whole reflection for that.
mod lenient {
    use serde::{Deserialize, Deserializer};
    use serde_json::Value;

    fn flatten(value: Value) -> Vec<String> {
        match value {
            Value::Null => Vec::new(),
            Value::String(s) => vec![s],
            Value::Array(items) => items.into_iter().flat_map(flatten).collect(),
            Value::Object(map) => map.into_values().flat_map(flatten).collect(),
            other => vec![other.to_string()],
        }
    }

    pub fn opt_text<'de, D: Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
        let parts: Vec<String> = flatten(Value::deserialize(d)?)
            .into_iter()
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect();
        Ok((!parts.is_empty()).then(|| parts.join("; ")))
    }

    pub fn text<'de, D: Deserializer<'de>>(d: D) -> Result<String, D::Error> {
        Ok(opt_text(d)?.unwrap_or_default())
    }

    pub fn text_list<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<String>, D::Error> {
        Ok(flatten(Value::deserialize(d)?)
            .into_iter()
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect())
    }

    pub fn opt_u32<'de, D: Deserializer<'de>>(d: D) -> Result<Option<u32>, D::Error> {
        Ok(match Value::deserialize(d)? {
            Value::Number(n) => n.as_f64().map(|f| f.round().max(0.0) as u32),
            Value::String(s) => s
                .trim()
                .parse::<f64>()
                .ok()
                .map(|f| f.round().max(0.0) as u32),
            _ => None,
        })
    }

    pub fn opt_bool<'de, D: Deserializer<'de>>(d: D) -> Result<Option<bool>, D::Error> {
        Ok(match Value::deserialize(d)? {
            Value::Bool(b) => Some(b),
            Value::String(s) => match s.trim().to_lowercase().as_str() {
                "true" | "yes" => Some(true),
                "false" | "no" => Some(false),
                _ => None,
            },
            _ => None,
        })
    }

    /// An id as a number, `"12"` or `"#12"`; 0 (never a real id) when unreadable.
    pub fn id<'de, D: Deserializer<'de>>(d: D) -> Result<i64, D::Error> {
        Ok(match Value::deserialize(d)? {
            Value::Number(n) => n.as_i64().unwrap_or(0),
            Value::String(s) => s.trim().trim_start_matches('#').parse().unwrap_or(0),
            _ => 0,
        })
    }
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
const HABITS_SOFT_CAP: usize = 12;
/// Never more than this, even when a reflection only adds (the oldest go).
const HABITS_HARD_CAP: usize = 25;
/// A merged list keeps at least this many patterns.
const HABITS_MIN_MERGED: usize = 3;
/// One merged pattern is a phrase, not a paragraph.
const HABIT_MAX_CHARS: usize = 160;

/// The task for the router when the preferences and habits grew too long.
fn consolidation_task(habits: &[String]) -> Option<String> {
    (habits.len() > HABITS_SOFT_CAP).then(|| {
        format!(
            "=== CONSOLIDATION TASK ===\nKnown Preferences & Habits has {} entries (limit {HABITS_SOFT_CAP}). \
             Return preferences_habits_replace with at most {HABITS_SOFT_CAP} entries that merge related ones into patterns.\n\n",
            habits.len()
        )
    })
}

/// A merged list replaces the habits only when it was asked for and is usable.
fn accept_habits_replace(asked: bool, replace: &[String]) -> Option<Vec<String>> {
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
const ROUTER_MEMORY_CHARS: usize = 300;

/// One memory as the router sees it: `- #id [category] content`, long text shortened.
fn router_memory_line(mem: &crate::modules::memory::EpisodicMemory) -> String {
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
        .replace("{character}", char_id)
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
                .replace("{character}", char_id)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn router_answers_of_local_models_are_read_leniently() {
        // As Qwen 3.6 and Mistral Nemo answer: a list where a text belongs, numbers as strings.
        let parsed = parse_router_json(
            r##"{
              "character_memory_patch": {"core_identity_add": "Ein einzelner Glaubenssatz",
                "internal_state": {"primary_emotion": ["Freude"], "intensity": "4", "emotion_active": "true"}},
              "user_memory_patch": {"user_identity_status": {"known_attributes": ["Zog nach Hamburg.", "Mag den Hafen."]},
                "preferences_habits_add": null},
              "memory_supersede": [{"id": "#27", "reason": ["umgezogen"]}],
              "intentions_patch": {"resolve": [{"id": "9", "status": "fulfilled"}]}
            }"##,
        )
        .unwrap();
        let cp = parsed.character_memory_patch.unwrap();
        assert_eq!(cp.core_identity_add, ["Ein einzelner Glaubenssatz"]);
        let ist = cp.internal_state.unwrap();
        assert_eq!(
            (
                ist.primary_emotion.as_deref(),
                ist.intensity,
                ist.emotion_active
            ),
            (Some("Freude"), Some(4), Some(true))
        );
        let up = parsed.user_memory_patch.unwrap();
        assert_eq!(
            up.user_identity_status.unwrap().known_attributes.as_deref(),
            Some("Zog nach Hamburg.; Mag den Hafen.")
        );
        assert!(up.preferences_habits_add.is_empty());
        assert_eq!(
            (
                parsed.memory_supersede[0].id,
                parsed.memory_supersede[0].reason.as_str()
            ),
            (27, "umgezogen")
        );
        assert_eq!(parsed.intentions_patch.unwrap().resolve[0].id, 9);
    }

    #[test]
    fn long_habit_lists_are_merged_only_when_asked() {
        let habits = |n: usize| {
            (0..n)
                .map(|i| format!("Gewohnheit {i}"))
                .collect::<Vec<_>>()
        };
        assert!(consolidation_task(&habits(HABITS_SOFT_CAP)).is_none());
        assert!(
            consolidation_task(&habits(HABITS_SOFT_CAP + 1))
                .unwrap()
                .contains("has 13 entries")
        );
        let list = |items: &[&str]| items.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let merged = list(&["Liebt süße Snacks", "Trinkt Tee", " ", "Joggt"]);
        assert_eq!(accept_habits_replace(false, &merged), None);
        assert_eq!(
            accept_habits_replace(true, &merged),
            Some(list(&["Liebt süße Snacks", "Trinkt Tee", "Joggt"]))
        );
        assert_eq!(
            accept_habits_replace(true, &habits(HABITS_SOFT_CAP + 1)),
            None
        );
        assert_eq!(accept_habits_replace(true, &[]), None);
        // One paragraph that swallowed everything (seen with Cydonia 24B) is no pattern list.
        assert_eq!(
            accept_habits_replace(true, &list(&["Mag Dango", "Trinkt Tee"])),
            None
        );
        let paragraph = "Mag süße Snacks. ".repeat(12);
        assert_eq!(
            accept_habits_replace(true, &list(&[&paragraph, "Trinkt Tee", "Joggt"])),
            None
        );
        let parsed = parse_router_json(
            r#"{"user_memory_patch": {"preferences_habits_replace": ["Liebt Dango"]}}"#,
        )
        .unwrap();
        assert_eq!(
            parsed.user_memory_patch.unwrap().preferences_habits_replace,
            ["Liebt Dango"]
        );
    }

    #[test]
    fn the_router_can_plan_and_resolve_intentions() {
        let parsed = parse_router_json(
            r#"{"intentions_patch": {"create": [{"title": "Kochen", "time_basis": "real", "due": "2026-10-20"}], "resolve": [{"id": 4, "status": "fulfilled"}]}}"#,
        )
        .unwrap();
        let patch = parsed.intentions_patch.unwrap();
        assert_eq!(patch.create[0].due.as_deref(), Some("2026-10-20"));
        assert_eq!(patch.create[0].initiator, "");
        assert_eq!(
            (patch.resolve[0].id, patch.resolve[0].status.as_str()),
            (4, "fulfilled")
        );
        assert!(parse_router_json("{}").unwrap().intentions_patch.is_none());
    }

    #[test]
    fn the_router_can_name_outdated_memories() {
        let parsed = parse_router_json(
            r#"{"memory_supersede": [{"id": 12, "reason": "umgezogen", "replaced_by_topic": "wohnort.md"}, {"id": 3}]}"#,
        )
        .unwrap();
        assert_eq!(parsed.memory_supersede.len(), 2);
        assert_eq!(
            parsed.memory_supersede[0].replaced_by_topic.as_deref(),
            Some("wohnort.md")
        );
        assert_eq!(parsed.memory_supersede[1].reason, "");
        assert!(parse_router_json("{}").unwrap().memory_supersede.is_empty());
    }

    #[test]
    fn the_router_sees_memory_ids_and_shortened_topics() {
        let mem = |id: i64, content: &str| crate::modules::memory::EpisodicMemory {
            id,
            category: "topic".into(),
            content: content.into(),
            significance: 4,
            created_at: 0,
            last_accessed_at: 0,
            source_chat_id: None,
            source_message_ids: Vec::new(),
            origin: "auto".into(),
            pinned: false,
            needs_review: false,
            topic_key: None,
            superseded_by: None,
            superseded_at: None,
            supersede_reason: String::new(),
        };
        assert_eq!(
            router_memory_line(&mem(7, "[Topic: tee]\nMag  Jasmintee")),
            "- #7 [topic] [Topic: tee] Mag Jasmintee\n"
        );
        let long = router_memory_line(&mem(8, &"ä".repeat(400)));
        assert!(long.ends_with("…\n"));
        assert_eq!(
            long.chars().filter(|c| *c == 'ä').count(),
            ROUTER_MEMORY_CHARS
        );
    }

    #[test]
    fn a_group_chat_transcript_names_every_speaker() {
        let msg = |role: &str, speaker: &str| crate::modules::memory::StoredChatMessage {
            id: String::new(),
            chat_id: "c".into(),
            role: role.into(),
            content: String::new(),
            thought: None,
            order_index: 0,
            swipe_index: 0,
            swipes: Vec::new(),
            created_at: 0,
            attachments: Vec::new(),
            speaker_id: speaker.into(),
        };
        let names = std::collections::HashMap::from([
            (String::new(), "Ayu".to_string()),
            ("sora".to_string(), "Sora".to_string()),
        ]);
        assert_eq!(
            transcript_speaker(&msg("user", ""), "Kai", Some(&names)),
            "Kai"
        );
        assert_eq!(
            transcript_speaker(&msg("assistant", ""), "Kai", Some(&names)),
            "Ayu"
        );
        assert_eq!(
            transcript_speaker(&msg("assistant", "sora"), "Kai", Some(&names)),
            "Sora"
        );
        // A normal chat keeps the roles.
        assert_eq!(
            transcript_speaker(&msg("assistant", ""), "Kai", None),
            "assistant"
        );
    }

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
        let actions = parsed.topic_plan.unwrap().actions;
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].significance, None);
        // Small models sometimes write the rating as text.
        let rated = parse_router_json(
            r#"{"topic_plan": {"actions": [{"action": "create", "filename": "a.md", "significance": "5"}]}}"#,
        )
        .unwrap();
        assert_eq!(rated.topic_plan.unwrap().actions[0].significance, Some(5));
    }
}

/// What a memory cleanup needs: whose memory and which model.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct MemoryCleanupRequest {
    pub character_id: String,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<LlmProviderType>,
}

#[derive(Deserialize)]
struct CleanupAnswer {
    #[serde(default)]
    groups: Vec<crate::modules::memory::CleanupGroup>,
}

/// Asks the model which memories belong together. Nothing is written: the user confirms the
/// proposal first (`apply_memory_cleanup`).
pub async fn propose_memory_cleanup(
    state: &AppState,
    req: MemoryCleanupRequest,
) -> Result<crate::modules::memory::CleanupProposal, String> {
    let candidates = state
        .memory_db
        .cleanup_candidates(&req.character_id, crate::modules::memory::CLEANUP_TOKENS)
        .map_err(|e| e.to_string())?;
    if candidates.len() < 2 {
        return Ok(Default::default());
    }
    let listing: String = candidates
        .iter()
        .map(|m| format!("#{} [{}] {}\n", m.id, m.category, m.content.trim()))
        .collect();
    let language = crate::modules::content_lang::ContentLang::reply_language_name();
    let request = ChatRequest {
        endpoint_url: req.endpoint_url,
        api_key: req.api_key,
        model: req.model,
        messages: vec![
            ChatMessage {
                role: "system".to_string(),
                content: CLEANUP_SYSTEM_PROMPT
                    .replace("{character}", &req.character_id)
                    .replace("{language}", &language),
                attachments: Vec::new(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: format!("=== MEMORIES ===\n{listing}"),
                attachments: Vec::new(),
            },
        ],
        sampling: Some(SamplingParams {
            temperature: Some(0.2),
            max_tokens: Some(2500),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: req.provider,
    };
    info!(
        "[SoulMemory] Aufräumen für {}: {} Erinnerungen prüfen...",
        req.character_id,
        candidates.len()
    );
    let raw = state.inference_client.generate_direct(request).await?;
    let json =
        extract_json_object(&raw).ok_or_else(|| crate::err!("backend.memory.cleanupNoJson"))?;
    let answer: CleanupAnswer = serde_json::from_str(&json)
        .map_err(|e| crate::err!("backend.memory.cleanupBadJson", error = e))?;
    let known: Vec<i64> = candidates.iter().map(|m| m.id).collect();
    let groups = crate::modules::memory::valid_cleanup_groups(answer.groups, &known);
    let sources = candidates
        .into_iter()
        .filter(|m| groups.iter().any(|g| g.memory_ids.contains(&m.id)))
        .collect();
    Ok(crate::modules::memory::CleanupProposal { groups, sources })
}
