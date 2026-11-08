//! App-Adapter für die gemeinsame Darstellung bereits ausgewählter Promptdaten.
use crate::modules::characters::CharacterData;
use crate::modules::lorebook::LorebookEntry;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub use otakusoul_prompt::{
    AssembledPrompt, BuiltinPromptTemplate, GroupMember, PromptTemplate, StateVariable,
    builtin_prompt_templates, is_none_marker,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct PromptContext {
    pub char_name: String,
    pub user_name: String,
    pub character: CharacterData,
    pub active_lore: Vec<LorebookEntry>,
    #[serde(default)]
    pub active_directives: Vec<LorebookEntry>,
    pub state_variables: Vec<StateVariable>,
    #[serde(default)]
    pub cognitive: Option<crate::modules::memory::CognitiveOverview>,
    /// Memories picked for this reply (`get_prompt_memories`): the core goes into the system
    /// prompt, the ones fitting the conversation after the history. Without it the overview's
    /// memories are used.
    #[serde(default)]
    #[ts(optional)]
    pub memories: Option<crate::modules::memory::PromptMemories>,
    pub reply_language: Option<String>, // e.g. "Deutsch", "English"
    #[serde(default)]
    pub allow_reasoning: Option<bool>,
    #[serde(default)]
    pub author_note: Option<String>,
    #[serde(default)]
    pub author_note_depth: Option<u32>,
    /// Summary of earlier messages that no longer fit into the context window.
    #[serde(default)]
    #[ts(optional)]
    pub chat_summary: Option<String>,
    /// Editable prompt parts; the default template when missing.
    #[serde(default)]
    #[ts(optional)]
    pub template: Option<PromptTemplate>,
    /// Keeps `{{pick}}` stable within a chat (the chat ID).
    #[serde(default)]
    #[ts(optional)]
    pub macro_seed: Option<String>,
    /// Seconds since the user's previous message (`{{idle_duration}}`).
    #[serde(default)]
    #[ts(optional)]
    pub idle_seconds: Option<u64>,
    /// The chat's reply length (`short`, `medium`, `long`; empty = as the template says).
    #[serde(default)]
    #[ts(optional)]
    pub reply_length: Option<String>,
    /// Words and phrases the reply must not use (settings → reply style).
    #[serde(default)]
    #[ts(optional)]
    pub avoid_phrases: Option<Vec<String>>,
    /// The other characters of a group chat (the speaker is `character`).
    #[serde(default)]
    #[ts(optional)]
    pub group: Option<Vec<GroupMember>>,
    /// Ask for an expression tag at the reply's end (`[emotion: …]`, chat replies only); it picks
    /// the portrait language independently (`emotions::classify_emotion`).
    #[serde(default)]
    #[ts(optional)]
    pub emotion_tags: Option<bool>,
    /// The avatar on screen (3D, Live2D) shows the six moods itself: the tag offers them even
    /// without portrait pictures.
    #[serde(default)]
    #[ts(optional)]
    pub avatar_moods: Option<bool>,
}

/// Whether a portrait entry points to a picture: embedded or remote ones count, files must exist
/// (cards hold absolute paths once loaded, `characters::resolve_profile_expression_paths`).
fn picture_exists(source: &str) -> bool {
    let source = source.trim();
    if source.is_empty() {
        return false;
    }
    let lower = source.to_ascii_lowercase();
    if ["data:", "http://", "https://", "asset:", "blob:"]
        .iter()
        .any(|scheme| lower.starts_with(scheme))
    {
        return true;
    }
    std::path::Path::new(source).is_file()
}

/// Die Promptdaten behalten ihre bisherige API; nur ihre Darstellung liegt im gemeinsamen Core.
struct BackendServices;
impl otakusoul_prompt::Services for BackendServices {
    fn language_code(&self, name: &str) -> String {
        crate::modules::content_lang::language_code(name)
    }
    fn expand(&self, text: &str, input: &crate::modules::macros::MacroInput) -> String {
        crate::modules::macros::expand(text, input)
    }
    fn picture_exists(&self, source: &str) -> bool {
        picture_exists(source)
    }
}

fn character_projection(character: &CharacterData) -> otakusoul_prompt::Character {
    otakusoul_prompt::Character {
        name: character.name.clone(),
        description: character.description.clone(),
        personality: character.personality.clone(),
        scenario: character.scenario.clone(),
        mes_example: character.mes_example.clone(),
        system_prompt: character.system_prompt.clone(),
        post_history_instructions: character.post_history_instructions.clone(),
        extensions: character.extensions.clone(),
    }
}

fn lore_projection(entry: &LorebookEntry) -> otakusoul_prompt::LoreEntry {
    otakusoul_prompt::LoreEntry {
        name: entry.name.clone(),
        content: entry.content.clone(),
        injection_behavior: entry.injection_behavior.clone(),
    }
}

fn memory_projection(memory: &crate::modules::memory::EpisodicMemory) -> otakusoul_prompt::Memory {
    otakusoul_prompt::Memory {
        category: memory.category.clone(),
        content: memory.content.clone(),
    }
}

fn projection(ctx: &PromptContext) -> otakusoul_prompt::Context {
    let language = otakusoul_prompt::Services::language_code(
        &BackendServices,
        ctx.reply_language.as_deref().unwrap_or("Deutsch"),
    );
    let character = character_projection(&ctx.character);
    let system_character = Some(otakusoul_prompt::localized_character(&character, &language));
    otakusoul_prompt::Context {
        char_name: ctx.char_name.clone(),
        user_name: ctx.user_name.clone(),
        character,
        system_character,
        active_lore: ctx.active_lore.iter().map(lore_projection).collect(),
        active_directives: ctx.active_directives.iter().map(lore_projection).collect(),
        state_variables: ctx.state_variables.clone(),
        cognitive: ctx
            .cognitive
            .as_ref()
            .map(|cognitive| otakusoul_prompt::Cognitive {
                psychology: otakusoul_prompt::Psychology {
                    core_identity: cognitive.psychology.core_identity.clone(),
                    primary_emotion: cognitive.psychology.primary_emotion.clone(),
                    intensity: cognitive.psychology.intensity,
                    psychological_tension: cognitive.psychology.psychological_tension.clone(),
                    active_agenda: cognitive.psychology.active_agenda.clone(),
                    immediate_focus: cognitive.psychology.immediate_focus.clone(),
                    cognitive_dissonance: cognitive.psychology.cognitive_dissonance.clone(),
                },
                relationship: otakusoul_prompt::Relationship {
                    role_in_story: cognitive.relationship.role_in_story.clone(),
                    known_attributes: cognitive.relationship.known_attributes.clone(),
                    trust_level: cognitive.relationship.trust_level.clone(),
                    dynamic_description: cognitive.relationship.dynamic_description.clone(),
                    unspoken_tension: cognitive.relationship.unspoken_tension.clone(),
                    preferences_habits: cognitive.relationship.preferences_habits.clone(),
                    shared_milestones: cognitive.relationship.shared_milestones.clone(),
                },
                recent_memories: cognitive
                    .recent_memories
                    .iter()
                    .map(memory_projection)
                    .collect(),
            }),
        memories: ctx
            .memories
            .as_ref()
            .map(|memories| otakusoul_prompt::PromptMemories {
                core: memories.core.iter().map(memory_projection).collect(),
                relevant: memories.relevant.iter().map(memory_projection).collect(),
                intentions: memories
                    .intentions
                    .iter()
                    .map(|intention| otakusoul_prompt::Intention {
                        label: intention.label.clone(),
                        title: intention.title.clone(),
                        details: intention.details.clone(),
                        initiator: intention.initiator.clone(),
                    })
                    .collect(),
            }),
        reply_language: ctx.reply_language.clone(),
        allow_reasoning: ctx.allow_reasoning,
        author_note: ctx.author_note.clone(),
        author_note_depth: ctx.author_note_depth,
        chat_summary: ctx.chat_summary.clone(),
        template: ctx.template.clone(),
        macro_seed: ctx.macro_seed.clone(),
        idle_seconds: ctx.idle_seconds,
        reply_length: ctx.reply_length.clone(),
        avoid_phrases: ctx.avoid_phrases.clone(),
        group: ctx.group.clone(),
        emotion_tags: ctx.emotion_tags,
        avatar_moods: ctx.avatar_moods,
    }
}

pub fn assemble(ctx: &PromptContext) -> AssembledPrompt {
    otakusoul_prompt::assemble(&projection(ctx), &BackendServices)
}

pub fn build_system_prompt(ctx: &PromptContext) -> String {
    otakusoul_prompt::build_system_prompt(&projection(ctx), &BackendServices)
}

pub fn post_history_instruction(ctx: &PromptContext) -> Option<String> {
    otakusoul_prompt::post_history_instruction(&projection(ctx), &BackendServices)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context(system_prompt: Option<&str>) -> PromptContext {
        PromptContext {
            char_name: "Aiko".into(),
            user_name: "Kai".into(),
            character: CharacterData {
                name: "Aiko".into(),
                system_prompt: system_prompt.map(Into::into),
                ..CharacterData::default()
            },
            ..PromptContext::default()
        }
    }

    #[test]
    fn chat_replies_end_with_an_expression_tag_the_card_can_show() {
        let dir =
            std::env::temp_dir().join(format!("otakusoul-tag-pictures-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = |name: &str| {
            let path = dir.join(name);
            std::fs::write(&path, b"x").unwrap();
            path.to_string_lossy().to_string()
        };
        let mut ctx = context(None);
        assert!(post_history_instruction(&ctx).is_none_or(|p| !p.contains("[emotion:")));
        ctx.emotion_tags = Some(true);
        ctx.character.extensions = serde_json::json!({"expressions": {
            "happy": file("happy.png"),
            "sad": dir.join("fehlt.png").to_string_lossy(),
            "neutral": "",
            "blush": file("blush.png"),
            "aroused": "data:image/png;base64,AAAA",
        }});
        let rule = post_history_instruction(&ctx).unwrap();
        assert!(rule.contains("[emotion: NAME]"), "{rule}");
        // Only slots with a picture, in the order moods → extra slots.
        assert!(
            rule.contains("NAME one of: happy, blush, aroused."),
            "{rule}"
        );

        // No picture at all: no tag.
        ctx.character.extensions = serde_json::json!({"expressions": {"sad": "/nicht/da.png"}});
        assert!(post_history_instruction(&ctx).is_none_or(|p| !p.contains("[emotion:")));
        ctx.character.extensions = serde_json::json!({});
        assert!(post_history_instruction(&ctx).is_none_or(|p| !p.contains("[emotion:")));

        // A 3D/Live2D avatar shows the six moods; extra slots still need their picture.
        ctx.avatar_moods = Some(true);
        let rule = post_history_instruction(&ctx).unwrap();
        assert!(
            rule.contains("NAME one of: neutral, happy, sad, angry, surprised, relaxed."),
            "{rule}"
        );
        ctx.character.extensions =
            serde_json::json!({"expressions": {"crying": file("crying.png")}});
        let rule = post_history_instruction(&ctx).unwrap();
        assert!(rule.contains("relaxed, crying."), "{rule}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_group_chat_names_the_others_and_keeps_the_speaker_to_their_part() {
        let mut ctx = context(None);
        assert!(!build_system_prompt(&ctx).contains("Others in this conversation"));
        ctx.group = Some(vec![
            GroupMember {
                name: "Sora".into(),
                description: "Ein ruhiger Bogenschütze.".into(),
            },
            GroupMember {
                name: " ".into(),
                description: String::new(),
            },
        ]);
        let prompt = build_system_prompt(&ctx);
        assert!(
            prompt
                .contains("## Others in this conversation\n- **Sora**: Ein ruhiger Bogenschütze.")
        );
        assert!(prompt.contains(
            "Write only Aiko's reply. Never write lines, actions or thoughts for Sora or Kai"
        ));
    }

    #[test]
    fn the_chosen_reply_length_comes_last() {
        let mut ctx = context(None);
        assert!(
            !post_history_instruction(&ctx)
                .unwrap_or_default()
                .contains("reply short")
        );
        ctx.reply_length = Some("short".into());
        let text = post_history_instruction(&ctx).unwrap();
        assert!(text.ends_with("Keep this reply short: one to three sentences."));
        // Also without a post-history text in the template.
        ctx.template = Some(PromptTemplate {
            post_history: String::new(),
            ..PromptTemplate::default()
        });
        ctx.reply_length = Some("long".into());
        assert!(
            post_history_instruction(&ctx)
                .unwrap()
                .starts_with("Write a detailed reply")
        );
        ctx.reply_length = Some(String::new());
        assert_eq!(post_history_instruction(&ctx), None);
    }

    #[test]
    fn unwanted_phrases_are_named_at_the_end() {
        let mut ctx = context(None);
        ctx.avoid_phrases = Some(vec![
            "Schauer über den Rücken".into(),
            " ".into(),
            "Ozon".into(),
        ]);
        ctx.reply_length = Some("short".into());
        let text = post_history_instruction(&ctx).unwrap();
        assert!(text.contains(
            "Never use these words or phrases, not even in other forms: \"Schauer über den Rücken\", \"Ozon\".\nKeep this reply short"
        ));
        ctx.avoid_phrases = Some(vec![" ".into()]);
        assert!(
            !post_history_instruction(&ctx)
                .unwrap()
                .contains("Never use")
        );
    }

    #[test]
    fn recalled_memories_go_after_the_history_and_the_core_stays_in_the_system_prompt() {
        let db = crate::modules::memory::MemoryDb::new_in_memory().unwrap();
        let mem = |id: i64, content: &str| crate::modules::memory::EpisodicMemory {
            id,
            category: "fact".into(),
            content: content.into(),
            significance: 3,
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
        let mut ctx = context(None);
        let mut overview = db.get_cognitive_overview("aiko", "Kai").unwrap();
        overview.recent_memories = vec![mem(9, "Alte Übersicht")];
        ctx.cognitive = Some(overview);
        ctx.memories = Some(crate::modules::memory::PromptMemories {
            core: vec![mem(1, "Kai heißt eigentlich Kaito")],
            relevant: vec![mem(2, "Lieblingstee ist Jasmin")],
            intentions: Vec::new(),
        });
        let system = build_system_prompt(&ctx);
        assert!(system.contains("- [fact] Kai heißt eigentlich Kaito"));
        assert!(!system.contains("Jasmin") && !system.contains("Alte Übersicht"));
        let after = post_history_instruction(&ctx).unwrap();
        assert!(after.contains("- [fact] Lieblingstee ist Jasmin"));

        // Open intentions follow the memories, with who made them.
        ctx.memories.as_mut().unwrap().intentions = vec![crate::modules::memory::IntentionPrompt {
            label: "due tomorrow".into(),
            title: "Zusammen kochen".into(),
            details: "italienisch".into(),
            initiator: "user".into(),
        }];
        let after = post_history_instruction(&ctx).unwrap();
        assert!(after.contains("- [due tomorrow] Zusammen kochen (italienisch) – from Kai"));
        assert!(after.find("Jasmin") < after.find("Zusammen kochen"));
        assert_eq!(build_system_prompt(&ctx), system);

        // Other relevant memories leave the system prompt as it was (prompt cache).
        ctx.memories.as_mut().unwrap().relevant = vec![mem(3, "Mag Regen")];
        assert_eq!(build_system_prompt(&ctx), system);
    }

    #[test]
    fn out_of_character_directions_are_explained() {
        let prompt = build_system_prompt(&context(None));
        assert!(prompt.contains(
            "- Text from Kai in ((double parentheses)) is an out-of-character direction"
        ));
    }

    #[test]
    fn card_macros_are_expanded_everywhere() {
        let mut ctx = context(Some("{{original}}\nHeute ist {{weekday}}. {{// Notiz}}"));
        ctx.reply_language = Some("Deutsch".into());
        ctx.macro_seed = Some("chat_1".into());
        ctx.character.description = "{{char}} trägt {{pick:rot,blau}}.".into();
        ctx.author_note = Some("Würfel: {{roll:1d1+1}}".into());
        let first = build_system_prompt(&ctx);
        assert!(first.contains("Aiko trägt "));
        assert!(first.contains("Würfel: 2"));
        assert!(!first.contains("{{") && !first.contains("Notiz"));
        // `{{pick}}` keeps its choice for the whole chat.
        assert!((0..10).all(|_| build_system_prompt(&ctx) == first));
    }

    #[test]
    fn default_template_keeps_the_original_prompt() {
        let prompt = build_system_prompt(&context(None));
        assert!(prompt.starts_with(
            "# Role & Identity\nYou fully become **Aiko** and reply only as this character.\nYou are talking with **Kai**."
        ));
        assert!(prompt.contains(
            "## Formatting & Roleplay Conventions\n- Always put actions, gestures, facial expressions and descriptions in asterisks"
        ));
        assert!(
            prompt.contains(
                "- Keep actions and spoken words clearly separated.\n- Reply immediately"
            )
        );
    }

    #[test]
    fn card_system_prompt_replaces_the_main_prompt() {
        let prompt = build_system_prompt(&context(Some("{{original}}\nAlways rhyme, {{user}}.")));
        assert!(prompt.starts_with("# Role & Identity\nYou fully become **Aiko**"));
        assert!(prompt.contains("Always rhyme, Kai."));

        let replaced = build_system_prompt(&context(Some("You are a pirate called {{char}}.")));
        assert!(replaced.starts_with("You are a pirate called Aiko."));
        assert!(!replaced.contains("You fully become"));
    }

    #[test]
    fn custom_template_and_post_history() {
        let mut ctx = context(None);
        ctx.template = Some(PromptTemplate {
            main: "Be {{char}}.".into(),
            style: String::new(),
            post_history: "Stay short, {{user}}.".into(),
        });
        ctx.allow_reasoning = Some(true);
        let prompt = build_system_prompt(&ctx);
        assert!(prompt.starts_with("Be Aiko."));
        assert!(!prompt.contains("Formatting & Roleplay Conventions"));
        assert!(prompt.ends_with(&format!(
            "## Out-of-Character Directions\n{}",
            crate::modules::ooc::prompt_rule("Kai")
        )));
        assert_eq!(
            post_history_instruction(&ctx).as_deref(),
            Some("Stay short, Kai.")
        );

        ctx.character.post_history_instructions = Some("{{original}} No emojis.".into());
        assert_eq!(
            post_history_instruction(&ctx).as_deref(),
            Some("Stay short, Kai. No emojis.")
        );
        ctx.template = None;
        ctx.character.post_history_instructions = None;
        assert_eq!(post_history_instruction(&ctx), None);
    }

    /// Snapshot captured with the original renderer before moving its implementation.
    #[test]
    fn shared_prompt_migration_golden() {
        let mut ctx = context(Some("{{original}}\n{{char}} bleibt bei {{user}}."));
        ctx.user_name = "Kai".into();
        ctx.reply_language = Some("Deutsch".into());
        ctx.macro_seed = Some("migration-parity".into());
        ctx.character.description = "{{char}} trägt einen {{pick:blauen}} Mantel.".into();
        ctx.character.personality = "Ruhig und wachsam.".into();
        ctx.character.scenario = "{{user}} wartet am Tor.".into();
        ctx.character.mes_example = "{{user}}: Hallo!\n{{char}}: Willkommen.".into();
        ctx.character.post_history_instructions = Some("{{original}} Bleib bei {{user}}.".into());
        ctx.character.extensions = serde_json::json!({"otakusoul_i18n":{"source_language":"de","translations":{"en":{"description":"{{char}} wears a blue coat.","post_history_instructions":"English post should not replace original post."}}},"expressions":{"blush":"data:image/png;base64,AAAA"}});
        ctx.active_lore = vec![
            LorebookEntry {
                name: "Ort".into(),
                content: "{{char}} kennt die Stadt.".into(),
                ..LorebookEntry::default()
            },
            LorebookEntry {
                name: "Regel".into(),
                content: "Sprich mit {{user}}.".into(),
                injection_behavior: "active".into(),
                ..LorebookEntry::default()
            },
        ];
        ctx.active_directives = vec![LorebookEntry {
            name: "Zusatz".into(),
            content: "Das Tor bleibt offen.".into(),
            ..LorebookEntry::default()
        }];
        ctx.state_variables = vec![StateVariable {
            name: "Mut".into(),
            value: "4".into(),
            var_type: "progress".into(),
            max_value: Some(10),
        }];
        ctx.group = Some(vec![GroupMember {
            name: "Sora".into(),
            description: "Bogenschütze".into(),
        }]);
        ctx.author_note = Some("{{user}} sieht den Weg.".into());
        ctx.author_note_depth = Some(2);
        ctx.chat_summary = Some("{{char}} hat das Tor gefunden.".into());
        ctx.reply_length = Some("medium".into());
        ctx.avoid_phrases = Some(vec!["Ozon".into()]);
        ctx.emotion_tags = Some(true);
        ctx.avatar_moods = Some(true);
        ctx.template = Some(PromptTemplate {
            post_history: "Später, {{user}}.".into(),
            ..PromptTemplate::default()
        });
        let memory = |id, content: &str| crate::modules::memory::EpisodicMemory {
            id,
            category: "fact".into(),
            content: content.into(),
            significance: 3,
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
        let db = crate::modules::memory::MemoryDb::new_in_memory().unwrap();
        let mut cognitive = db.get_cognitive_overview("migration-aiko", "Kai").unwrap();
        cognitive.psychology.core_identity = vec!["Ich halte mein Wort.".into()];
        cognitive.psychology.primary_emotion = "happy".into();
        cognitive.psychology.intensity = 3;
        cognitive.psychology.psychological_tension = "Ein Geheimnis bewahren.".into();
        cognitive.psychology.active_agenda = "Das Tor erreichen.".into();
        cognitive.psychology.immediate_focus = "Der Pfad".into();
        cognitive.psychology.cognitive_dissonance = "Keine.".into();
        cognitive.relationship.role_in_story = "Freund".into();
        cognitive.relationship.known_attributes = "Kai hört zu.".into();
        cognitive.relationship.trust_level = "Developing Trust".into();
        cognitive.relationship.dynamic_description = "Gemeinsame Reise".into();
        cognitive.relationship.unspoken_tension = "Keine.".into();
        cognitive.relationship.preferences_habits = vec!["Tee".into()];
        cognitive.relationship.shared_milestones = vec!["Das Tor gefunden".into()];
        cognitive.recent_memories = vec![memory(1, "Alte Übersicht")];
        ctx.cognitive = Some(cognitive);
        ctx.memories = Some(crate::modules::memory::PromptMemories {
            core: vec![memory(2, "Kai heißt Kaito")],
            relevant: vec![memory(3, "Mag Jasmintee")],
            intentions: vec![crate::modules::memory::IntentionPrompt {
                label: "due tomorrow".into(),
                title: "Zusammen kochen".into(),
                details: "italienisch".into(),
                initiator: "user".into(),
            }],
        });
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../crates/otakusoul-prompt/tests/fixtures");
        for (language, name) in [("Deutsch", "rich-de"), ("English", "rich-en")] {
            ctx.reply_language = Some(language.into());
            let prompt = assemble(&ctx);
            let actual = format!(
                "{}\n\n=== POST HISTORY ===\n{}\n",
                prompt.system,
                prompt.post_history.unwrap_or_default()
            );
            let path = directory.join(format!("{name}.txt"));
            assert_eq!(actual, std::fs::read_to_string(path).unwrap(), "{language}");
        }
    }
}
