//! Journaling: an evening reflection on the day and a monthly review, written by the character
//! into their diary (`soul_diary.kind` = `evening` / `monthly`, one per `period`).

use crate::modules::inference::{ChatMessage, ChatRequest, SamplingParams};
use crate::modules::memory::{DiaryEntry, MemoryDb};
use crate::modules::providers::LlmProviderType;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Messages of a day the evening reflection reads at most (the newest).
const EVENING_MESSAGES: usize = 40;
/// Characters of one message in the evening transcript.
const MESSAGE_CHARS: usize = 400;
/// Diary entries and memories of a month the review reads at most.
const MONTH_DIARY: usize = 40;
const MONTH_MEMORIES: usize = 30;
/// Characters of one diary entry in the monthly review.
const DIARY_CHARS: usize = 300;

pub const EVENING_SYSTEM_PROMPT: &str = r#"[SYSTEM_INSTRUCTION]
You are {character}. It is the evening of {date}. Write a private journal entry about today with {user_name}.
You are alone, looking back on the day.

CRITICAL CONSTRAINTS:
1. PERSPECTIVE: First person ("I"). Refer to {user_name} by name or in the third person.
2. CONTENT: What happened today, how it made you feel, and what you look forward to. Mention the plans, promises and habits listed below only where they fit naturally (a plan due tomorrow, a promise kept today, a habit you noticed).
3. FORMAT: Plain prose, 120 to 220 words. No title, no date line, no lists, no asterisks, no dialogue.
4. LANGUAGE: Write in {language}.

Output strictly the journal text."#;

pub const MONTHLY_SYSTEM_PROMPT: &str = r#"[SYSTEM_INSTRUCTION]
You are {character}. Write a personal review of the month {month} with {user_name}, in your diary.

CRITICAL CONSTRAINTS:
1. PERSPECTIVE: First person ("I"). Refer to {user_name} by name or in the third person.
2. CONTENT: The most important moments, how your relationship developed, what you learned about {user_name}, which plans came true or fell through, and what you hope for next month. Draw only on the notes below; do not invent events.
3. FORMAT: Warm plain prose, 200 to 350 words, two to four paragraphs. No title, no lists, no asterisks.
4. LANGUAGE: Write in {language}.

Output strictly the review text."#;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct JournalRequest {
    /// Memory id of the character (a branch has its own).
    pub character_id: String,
    /// Character whose chats are read (without a branch suffix).
    pub chat_character_id: String,
    /// Name as the character is presented.
    pub character_name: String,
    pub user_name: String,
    /// `evening` or `monthly`.
    pub kind: String,
    /// `2026-11-05` (evening) or `2026-10` (monthly); one entry per kind and period.
    pub period: String,
    /// Diary title (in the app language).
    pub title: String,
    /// Shown in the prompt: the day or the month in words.
    pub period_label: String,
    /// Time range the entry looks back on, UNIX seconds (`to` exclusive).
    pub from: u64,
    pub to: u64,
    /// Replace an existing entry of this period (written by hand from the diary tab).
    #[serde(default)]
    pub replace: bool,
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<LlmProviderType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct JournalOutcome {
    /// `written`, `exists` (already one for this period) or `empty` (nothing happened yet).
    pub status: String,
    pub entry: Option<DiaryEntry>,
}

fn short(text: &str, max: usize) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= max {
        flat
    } else {
        format!("{}…", flat.chars().take(max).collect::<String>())
    }
}

fn list(title: &str, items: &[String]) -> String {
    if items.is_empty() {
        return String::new();
    }
    let lines: Vec<String> = items.iter().map(|i| format!("- {i}")).collect();
    format!("{title}:\n{}\n\n", lines.join("\n"))
}

fn in_range(at: Option<u64>, req: &JournalRequest) -> bool {
    at.is_some_and(|t| t >= req.from && t < req.to)
}

/// What the evening reflection gets to read; `None` when the user did not talk to the character
/// in the range.
pub fn evening_input(db: &MemoryDb, req: &JournalRequest) -> Result<Option<String>, String> {
    let mut messages = Vec::new();
    for session in db
        .list_chat_sessions(&req.chat_character_id)
        .map_err(|e| e.to_string())?
    {
        // Only the chats of this memory: a branch with its own memory has its own day.
        if session.updated_at < req.from
            || crate::modules::memory::memory_id(&session.character_id, &session.memory_branch)
                != req.character_id
        {
            continue;
        }
        let chat = db
            .get_chat_messages(&session.id)
            .map_err(|e| e.to_string())?;
        messages.extend(
            chat.into_iter().filter(|m| {
                m.role != "system" && m.created_at >= req.from && m.created_at < req.to
            }),
        );
    }
    if !messages.iter().any(|m| m.role == "user") {
        return Ok(None);
    }
    messages.sort_by_key(|m| m.created_at);
    let skip = messages.len().saturating_sub(EVENING_MESSAGES);
    let dialog: Vec<String> = messages[skip..]
        .iter()
        .map(|m| {
            let who = if m.role == "user" {
                req.user_name.as_str()
            } else {
                req.character_name.as_str()
            };
            format!("{who}: {}", short(&m.content, MESSAGE_CHARS))
        })
        .collect();

    let intentions = db
        .get_intentions(&req.character_id, &req.user_name, true)
        .map_err(|e| e.to_string())?;
    let open: Vec<String> = intentions
        .iter()
        .filter(|i| i.status == "pending")
        .map(|i| i.title.clone())
        .collect();
    let ended: Vec<String> = intentions
        .iter()
        .filter(|i| i.status != "pending" && in_range(i.resolved_at, req))
        .map(|i| format!("{} ({})", i.title, i.status))
        .collect();
    let relationship = db
        .get_or_create_relationship(&req.character_id, &req.user_name)
        .map_err(|e| e.to_string())?;
    let psychology = db
        .get_or_create_psychology(&req.character_id)
        .map_err(|e| e.to_string())?;

    Ok(Some(format!(
        "Today's conversations:\n{}\n\n{}{}{}Your current emotion: {} (intensity {}/5)",
        dialog.join("\n"),
        list("Open plans and promises", &open),
        list("Kept, missed or called off today", &ended),
        list(
            &format!("Habits of {} you know", req.user_name),
            &relationship.preferences_habits
        ),
        psychology.primary_emotion,
        psychology.intensity
    )))
}

/// What the monthly review gets to read; `None` when the month left no trace.
pub fn monthly_input(db: &MemoryDb, req: &JournalRequest) -> Result<Option<String>, String> {
    let diary = db
        .get_diary_entries_between(&req.character_id, req.from, req.to, MONTH_DIARY)
        .map_err(|e| e.to_string())?;
    let memories = db
        .get_memories_between(&req.character_id, req.from, req.to, MONTH_MEMORIES)
        .map_err(|e| e.to_string())?;
    let intentions = db
        .get_intentions(&req.character_id, &req.user_name, true)
        .map_err(|e| e.to_string())?;
    let ended: Vec<String> = intentions
        .iter()
        .filter(|i| i.status != "pending" && in_range(i.resolved_at, req))
        .map(|i| format!("{} ({})", i.title, i.status))
        .collect();
    let started: Vec<String> = intentions
        .iter()
        .filter(|i| i.status == "pending" && in_range(Some(i.created_at), req))
        .map(|i| i.title.clone())
        .collect();
    if diary.is_empty() && memories.is_empty() && ended.is_empty() && started.is_empty() {
        return Ok(None);
    }
    let relationship = db
        .get_or_create_relationship(&req.character_id, &req.user_name)
        .map_err(|e| e.to_string())?;

    let diary_lines: Vec<String> = diary
        .iter()
        .map(|d| {
            let date = chrono::DateTime::from_timestamp(d.created_at as i64, 0)
                .map(|t| {
                    t.with_timezone(&chrono::Local)
                        .format("%Y-%m-%d")
                        .to_string()
                })
                .unwrap_or_default();
            format!(
                "[{date}] {}: {}",
                d.title.trim(),
                short(&d.entry_text, DIARY_CHARS)
            )
        })
        .collect();
    let memory_lines: Vec<String> = memories.iter().map(|m| short(&m.content, 240)).collect();
    Ok(Some(format!(
        "{}{}{}{}Relationship now: {} – {}\n\n{}",
        list("Your diary this month", &diary_lines),
        list("Memories from this month", &memory_lines),
        list("Plans kept, missed or called off", &ended),
        list("New plans still open", &started),
        relationship.trust_level,
        relationship.dynamic_description,
        list("Shared milestones so far", &relationship.shared_milestones),
    )))
}

/// Writes the evening reflection or the monthly review of `req.period`, once per period.
pub async fn write_journal_entry(
    db: &MemoryDb,
    client: &crate::modules::inference::InferenceClient,
    req: JournalRequest,
) -> Result<JournalOutcome, String> {
    let monthly = match req.kind.as_str() {
        "evening" => false,
        "monthly" => true,
        _ => return Err(format!("unknown journal kind: {}", req.kind)),
    };
    if !req.replace
        && db
            .journal_entry_exists(&req.character_id, &req.kind, &req.period)
            .map_err(|e| e.to_string())?
    {
        return Ok(JournalOutcome {
            status: "exists".into(),
            entry: None,
        });
    }
    let input = if monthly {
        monthly_input(db, &req)?
    } else {
        evening_input(db, &req)?
    };
    let Some(input) = input else {
        return Ok(JournalOutcome {
            status: "empty".into(),
            entry: None,
        });
    };
    let system = if monthly {
        MONTHLY_SYSTEM_PROMPT.replace("{month}", &req.period_label)
    } else {
        EVENING_SYSTEM_PROMPT.replace("{date}", &req.period_label)
    }
    .replace("{character}", &req.character_name)
    .replace("{user_name}", &req.user_name)
    .replace(
        "{language}",
        &crate::modules::content_lang::ContentLang::reply_language_name(),
    );
    let request = ChatRequest {
        endpoint_url: req.endpoint_url.clone(),
        api_key: req.api_key.clone(),
        model: req.model.clone(),
        messages: vec![
            ChatMessage {
                role: "system".into(),
                content: system,
                attachments: Vec::new(),
            },
            ChatMessage {
                role: "user".into(),
                content: input,
                attachments: Vec::new(),
            },
        ],
        sampling: Some(SamplingParams {
            temperature: Some(0.7),
            max_tokens: Some(if monthly { 800 } else { 500 }),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: req.provider.clone(),
    };
    let text = client.generate_direct(request).await?;
    let text = text.trim();
    if text.is_empty() {
        return Err(crate::err!("backend.memory.emptyDiary"));
    }
    let mood = db
        .get_or_create_psychology(&req.character_id)
        .map_err(|e| e.to_string())?
        .primary_emotion;
    let entry = db
        .add_journal_entry(
            &req.character_id,
            &req.title,
            text,
            &mood,
            &req.kind,
            &req.period,
        )
        .map_err(|e| e.to_string())?;
    Ok(JournalOutcome {
        status: "written".into(),
        entry: Some(entry),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(kind: &str, from: u64, to: u64) -> JournalRequest {
        JournalRequest {
            character_id: "ayu".into(),
            chat_character_id: "ayu".into(),
            character_name: "Ayu".into(),
            user_name: "Kai".into(),
            kind: kind.into(),
            period: "p".into(),
            title: "t".into(),
            period_label: "today".into(),
            from,
            to,
            replace: false,
            endpoint_url: String::new(),
            api_key: None,
            model: None,
            provider: None,
        }
    }

    #[test]
    fn evening_needs_a_conversation_and_names_plans_and_habits() {
        let db = MemoryDb::new_in_memory().unwrap();
        let mut rel = db.get_or_create_relationship("ayu", "Kai").unwrap();
        rel.preferences_habits = vec!["Joggt morgens".into()];
        db.update_relationship("ayu", &rel).unwrap();
        let chat = db.create_chat_session("ayu", "Chat").unwrap();
        db.add_chat_message(&chat.id, "assistant", "Hallo Kai!", None, &[])
            .unwrap();
        // Only the greeting: nothing to reflect on yet.
        assert!(
            evening_input(&db, &req("evening", 0, u64::MAX))
                .unwrap()
                .is_none()
        );
        db.add_chat_message(&chat.id, "user", "Ich hatte heute eine Prüfung.", None, &[])
            .unwrap();
        let text = evening_input(&db, &req("evening", 0, u64::MAX))
            .unwrap()
            .unwrap();
        assert!(text.contains("Kai: Ich hatte heute eine Prüfung."));
        assert!(text.contains("Ayu: Hallo Kai!"));
        assert!(text.contains("- Joggt morgens"));
        // Messages outside the day do not count.
        assert!(evening_input(&db, &req("evening", 0, 1)).unwrap().is_none());
    }

    #[test]
    fn evening_reads_only_the_chats_of_its_own_memory() {
        let db = MemoryDb::new_in_memory().unwrap();
        let main = db.create_chat_session("ayu", "Chat").unwrap();
        let start = db
            .add_chat_message(&main.id, "assistant", "Hallo!", None, &[])
            .unwrap();
        let branch = db
            .branch_chat(&main.id, &start.id, "Was wäre wenn", true)
            .unwrap();
        db.add_chat_message(&branch.id, "user", "Nur im Zweig", None, &[])
            .unwrap();
        // The main line talked about nothing today.
        assert!(
            evening_input(&db, &req("evening", 0, u64::MAX))
                .unwrap()
                .is_none()
        );
        let scoped = crate::modules::memory::memory_id("ayu", &branch.memory_branch);
        let in_branch = JournalRequest {
            character_id: scoped,
            ..req("evening", 0, u64::MAX)
        };
        assert!(
            evening_input(&db, &in_branch)
                .unwrap()
                .unwrap()
                .contains("Nur im Zweig")
        );
        db.add_chat_message(&main.id, "user", "Nur in der Hauptlinie", None, &[])
            .unwrap();
        let text = evening_input(&db, &req("evening", 0, u64::MAX))
            .unwrap()
            .unwrap();
        assert!(text.contains("Nur in der Hauptlinie") && !text.contains("Nur im Zweig"));
    }

    #[test]
    fn monthly_review_reads_the_month_and_is_written_once() {
        let db = MemoryDb::new_in_memory().unwrap();
        assert!(
            monthly_input(&db, &req("monthly", 0, u64::MAX))
                .unwrap()
                .is_none()
        );
        db.add_episodic_memory("ayu", "event", "Kai hat die Prüfung bestanden", 5)
            .unwrap();
        db.add_journal_entry(
            "ayu",
            "Abend",
            "Ein guter Tag.",
            "Joy",
            "evening",
            "2026-10-03",
        )
        .unwrap();
        let text = monthly_input(&db, &req("monthly", 0, u64::MAX))
            .unwrap()
            .unwrap();
        assert!(text.contains("Kai hat die Prüfung bestanden"));
        assert!(text.contains("Abend: Ein guter Tag."));

        assert!(
            !db.journal_entry_exists("ayu", "monthly", "2026-10")
                .unwrap()
        );
        db.add_journal_entry(
            "ayu",
            "Oktober",
            "Erste Fassung",
            "Joy",
            "monthly",
            "2026-10",
        )
        .unwrap();
        db.add_journal_entry(
            "ayu",
            "Oktober",
            "Neue Fassung",
            "Joy",
            "monthly",
            "2026-10",
        )
        .unwrap();
        assert!(
            db.journal_entry_exists("ayu", "monthly", "2026-10")
                .unwrap()
        );
        let monthly: Vec<_> = db
            .get_diary_entries("ayu", 10)
            .unwrap()
            .into_iter()
            .filter(|d| d.kind == "monthly")
            .collect();
        assert_eq!(monthly.len(), 1);
        assert_eq!(monthly[0].entry_text, "Neue Fassung");
        assert_eq!(monthly[0].period, "2026-10");
    }
}
