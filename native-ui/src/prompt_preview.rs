//! Vorschau mit demselben Renderer wie Tauri; noch keine Lore-/Gedächtnisauswahl.
use crate::model::Character;
use otakusoul_prompt::{AssembledPrompt, Context, Services};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Template {
    Roleplay,
    Narrator,
    Companion,
}
impl Template {
    fn id(self) -> &'static str {
        match self {
            Self::Roleplay => "roleplay",
            Self::Narrator => "narrator",
            Self::Companion => "companion",
        }
    }
}
impl fmt::Display for Template {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Roleplay => "Rollenspiel",
            Self::Narrator => "Erzähler",
            Self::Companion => "Alltagsgespräch",
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReplyLength {
    Standard,
    Short,
    Medium,
    Long,
}
impl fmt::Display for ReplyLength {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::Standard => "Standard",
            Self::Short => "Kurz",
            Self::Medium => "Mittel",
            Self::Long => "Ausführlich",
        })
    }
}

pub struct Settings {
    pub persona_name: String,
    pub author_note: String,
    pub template: Template,
    pub reply_length: ReplyLength,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            persona_name: "User".into(),
            author_note: String::new(),
            template: Template::Roleplay,
            reply_length: ReplyLength::Standard,
        }
    }
}

struct NativeServices;
impl Services for NativeServices {
    fn language_code(&self, language: &str) -> String {
        match language.trim().to_lowercase().as_str() {
            "deutsch" | "german" => "de".into(),
            "english" | "englisch" => "en".into(),
            "русский" | "russian" => "ru".into(),
            "日本語" | "japanese" => "ja".into(),
            other => other.into(),
        }
    }
    fn expand(&self, text: &str, input: &otakusoul_macros::MacroInput) -> String {
        otakusoul_macros::expand(text, input, &self.language_code(&input.language))
    }
    fn picture_exists(&self, _source: &str) -> bool {
        // Noch keine validierten Ausdrucksbilder in der Vorschau, daher keine Dateizugriffe.
        false
    }
}

#[cfg(test)]
pub fn greeting(character: &Character, settings: &Settings, seed: &str) -> String {
    otakusoul_macros::expand(
        &character.first_message,
        &otakusoul_macros::MacroInput {
            char_name: character.name.clone(),
            user_name: settings.persona_name.trim().into(),
            language: "Deutsch".into(),
            pick_seed: Some(seed.into()),
            idle_seconds: None,
        },
        "de",
    )
}

pub fn greetings(character: &Character, settings: &Settings, seed: &str) -> Vec<String> {
    otakusoul_macros::expand_all(
        &character
            .greeting_texts()
            .into_iter()
            .map(str::to_owned)
            .collect::<Vec<_>>(),
        &otakusoul_macros::MacroInput {
            char_name: character.name.clone(),
            user_name: settings.persona_name.trim().into(),
            language: "Deutsch".into(),
            pick_seed: Some(seed.into()),
            idle_seconds: None,
        },
        "de",
    )
}

pub fn build(
    character: &Character,
    settings: &Settings,
    seed: &str,
    lore: Option<&LoreReport>,
) -> Result<AssembledPrompt, String> {
    if settings.persona_name.trim().is_empty() {
        return Err("Bitte einen Persona-Namen eingeben.".into());
    }
    let card = character
        .card
        .as_ref()
        .ok_or("Für diese Figur fehlt die Charakterkarte.")?;
    let char_name = character.name.clone();
    let character: otakusoul_prompt::Character = serde_json::from_value(
        card.get("data").unwrap_or(card).clone(),
    )
    .map_err(|_| "Die Charakterkarte kann noch nicht in die Prompt-Vorschau übernommen werden.")?;
    let template = otakusoul_prompt::builtin_prompt_templates()
        .into_iter()
        .find(|template| template.id == settings.template.id())
        .ok_or("Die gewählte Prompt-Vorlage ist nicht verfügbar.")?
        .template;
    let system_character = Some(otakusoul_prompt::localized_character(&character, "de"));
    let context = Context {
        system_character,
        char_name,
        user_name: settings.persona_name.trim().into(),
        character,
        reply_language: Some("Deutsch".into()),
        allow_reasoning: Some(false),
        author_note: (!settings.author_note.trim().is_empty())
            .then(|| settings.author_note.clone()),
        template: Some(template),
        macro_seed: Some(seed.into()),
        active_lore: lore.map_or_else(Vec::new, |report| report.passive.clone()),
        active_directives: lore.map_or_else(Vec::new, |report| report.active.clone()),
        reply_length: match settings.reply_length {
            ReplyLength::Standard => None,
            ReplyLength::Short => Some("short".into()),
            ReplyLength::Medium => Some("medium".into()),
            ReplyLength::Long => Some("long".into()),
        },
        ..Context::default()
    };
    Ok(otakusoul_prompt::assemble(&context, &NativeServices))
}

#[derive(Debug, Clone)]
pub struct LoreReport {
    pub books: usize,
    pub passive: Vec<otakusoul_prompt::LoreEntry>,
    pub active: Vec<otakusoul_prompt::LoreEntry>,
}

pub fn candidate_books<'a>(
    character: &Character,
    catalog: &'a [crate::lore_catalog::Book],
) -> Vec<&'a crate::lore_catalog::Book> {
    let bindings = crate::character_draft::lorebook_bindings(character);
    catalog
        .iter()
        .filter(|book| {
            book.raw
                .get("is_global")
                .and_then(serde_json::Value::as_bool)
                == Some(true)
                || bindings
                    .iter()
                    .any(|reference| book.matches_reference(reference))
        })
        .collect()
}

pub fn evaluate_lore(books: Vec<serde_json::Value>, context: &str) -> LoreReport {
    let books: Vec<_> = books
        .iter()
        .map(|raw| otakusoul_lore::Lorebook::from_json_value(raw, None).localized("de"))
        .collect();
    let result = otakusoul_lore::evaluate_lorebooks(&books, context, 0);
    let project = |entry: otakusoul_lore::LorebookEntry| otakusoul_prompt::LoreEntry {
        name: entry.name,
        content: entry.content,
        injection_behavior: entry.injection_behavior,
    };
    LoreReport {
        books: books.len(),
        passive: result.passive_entries.into_iter().map(project).collect(),
        active: result.active_entries.into_iter().map(project).collect(),
    }
}

pub fn recent_lore_context(conversation: &crate::model::Conversation) -> String {
    let greeting = conversation
        .greeting
        .as_ref()
        .filter(|_| !conversation.is_read_only())
        .map(|(_, text)| text.as_str())
        .filter(|text| !text.trim().is_empty());
    let mut recent: Vec<_> = greeting
        .into_iter()
        .chain(
            conversation
                .messages
                .iter()
                .map(|message| message.content.as_str()),
        )
        .rev()
        .take(5)
        .collect();
    recent.reverse();
    recent.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Preview;

    #[test]
    fn shared_lore_rules_put_only_matching_bound_and_global_entries_in_the_prompt() {
        let mut preview = Preview::default();
        let character = &mut preview.characters[0];
        character.card.as_mut().unwrap()["data"]["extensions"]["bound_lorebooks"] =
            serde_json::json!(["BOUND"]);
        let make_book = |id, global, entries| {
            crate::lore_catalog::Book::from_json(
                serde_json::json!({"id":id,"name":id,"is_global":global,"entries":entries}),
                format!("{id}.json"),
                id,
            )
            .unwrap()
        };
        let books = [
            make_book(
                "bound",
                false,
                serde_json::json!([
                    {"name":"Tor","key":["Tor"],"content":"Das Tor ist verriegelt."},
                    {"name":"Versteckt","key":["Wald"],"content":"Unsichtbarer Wald."}
                ]),
            ),
            make_book(
                "global",
                true,
                serde_json::json!([
                    {"name":"Regie","content":"Beschreibe das Schloss.","injection_behavior":"active"}
                ]),
            ),
            make_book(
                "other",
                false,
                serde_json::json!([
                    {"name":"Fremd","content":"Fremder Inhalt."}
                ]),
            ),
        ];
        let selected = candidate_books(character, &books)
            .into_iter()
            .map(|book| book.raw.clone())
            .collect();
        let lore = evaluate_lore(selected, "Ich gehe zum Tor.");
        let prompt = build(character, &Settings::default(), "test", Some(&lore)).unwrap();
        assert_eq!(lore.books, 2);
        assert!(prompt.system.contains("Das Tor ist verriegelt."));
        assert!(prompt.system.contains("Beschreibe das Schloss."));
        assert!(!prompt.system.contains("Unsichtbarer Wald."));
        assert!(!prompt.system.contains("Fremder Inhalt."));
    }

    #[test]
    fn preview_uses_card_override_persona_note_and_reply_length() {
        let mut preview = Preview::default();
        preview.characters[0].card.as_mut().unwrap()["data"]["system_prompt"] =
            "{{original}}\nKein Vergessen, {{user}}.".into();
        let settings = Settings {
            persona_name: "Kai".into(),
            author_note: "{{char}} wartet am Tor.".into(),
            reply_length: ReplyLength::Short,
            ..Settings::default()
        };
        let prompt = build(&preview.characters[0], &settings, "chat-test", None).unwrap();
        assert!(prompt.system.contains("You are talking with **Kai**"));
        assert!(prompt.system.contains("Kein Vergessen, Kai."));
        assert!(prompt.system.contains("Shiori Amane wartet am Tor."));
        assert!(
            prompt
                .post_history
                .as_deref()
                .unwrap()
                .contains("Keep this reply short")
        );
        assert!(greeting(&preview.characters[0], &settings, "chat-test").contains("Kai"));
    }

    #[test]
    fn narrator_template_and_missing_persona_are_explicit() {
        let preview = Preview::default();
        let settings = Settings {
            template: Template::Narrator,
            ..Settings::default()
        };
        assert!(
            build(preview.character(), &settings, "chat-test", None)
                .unwrap()
                .system
                .contains("narrator of an interactive story")
        );
        assert!(
            build(
                preview.character(),
                &Settings {
                    persona_name: String::new(),
                    ..Settings::default()
                },
                "chat-test",
                None,
            )
            .is_err()
        );
    }

    #[test]
    fn greeting_and_prompt_use_the_same_trimmed_persona() {
        let mut preview = Preview::default();
        preview.characters[0].first_message = "{{user}}".into();
        let settings = Settings {
            persona_name: " Kai ".into(),
            ..Settings::default()
        };
        assert_eq!(greeting(&preview.characters[0], &settings, "test"), "Kai");
        assert!(
            build(&preview.characters[0], &settings, "test", None)
                .unwrap()
                .system
                .contains("**Kai**")
        );
    }
}
