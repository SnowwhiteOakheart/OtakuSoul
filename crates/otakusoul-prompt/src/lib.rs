//! Gemeinsame Promptdarstellung ohne App-, Datenbank- oder Dateisystemabhängigkeit.
//! Lore und Gedächtnis sind bereits ausgewählt; system_character gilt nur für den Systemteil.
mod models;
pub use models::*;
mod localization;
pub use localization::{i18n_translation, localized_character};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StateVariable {
    pub name: String,
    pub value: String,
    pub var_type: String, // "int", "str", "bool", "progress"
    pub max_value: Option<i32>,
}

/// The editable parts of the system prompt. `{{char}}` and `{{user}}` are filled in; a card's
/// own `system_prompt`/`post_history_instructions` replace `main`/`post_history` and can include
/// them with `{{original}}` (Character Card V2).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(default)]
pub struct PromptTemplate {
    /// Opening instruction: who the model is and whom it talks to.
    pub main: String,
    /// Style rules, sent as "Formatting & Roleplay Conventions".
    pub style: String,
    /// Sent as the last system message after the chat history; empty for none.
    pub post_history: String,
}

impl Default for PromptTemplate {
    fn default() -> Self {
        builtin_prompt_templates().remove(0).template
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BuiltinPromptTemplate {
    /// Stable id; the frontend translates the name by it.
    pub id: String,
    pub template: PromptTemplate,
}

/// Ready-made templates; the first is the default and matches the original fixed prompt.
pub fn builtin_prompt_templates() -> Vec<BuiltinPromptTemplate> {
    let make = |id: &str, main: &str, style: &str, post_history: &str| BuiltinPromptTemplate {
        id: id.into(),
        template: PromptTemplate {
            main: main.into(),
            style: style.into(),
            post_history: post_history.into(),
        },
    };
    vec![
        make(
            "roleplay",
            "# Role & Identity\nYou fully become **{{char}}** and reply only as this character.\nYou are talking with **{{user}}**.",
            "- Always put actions, gestures, facial expressions and descriptions in asterisks (e.g. *smiles softly and leans forward*).\n\
             - Always put spoken words in quotation marks (e.g. \"All right, as you wish!\").\n\
             - Keep actions and spoken words clearly separated.",
            "",
        ),
        make(
            "narrator",
            "# Role & Identity\nYou are the narrator of an interactive story. Portray **{{char}}** and the world around them for **{{user}}**.\n\
             Never decide what {{user}} says, thinks or does; leave their actions to them.",
            "- Write vivid prose in the third person and past tense, like a novel.\n\
             - Describe surroundings, body language and atmosphere; put dialogue in quotation marks.\n\
             - End each reply at a moment that invites {{user}} to act.",
            "",
        ),
        make(
            "companion",
            "# Role & Identity\nYou are **{{char}}**, a close companion chatting with **{{user}}** in everyday life.\n\
             Be warm, attentive and personal; remember what {{user}} tells you and ask about it later.",
            "- Reply like a chat message: short (one to three sentences), natural and casual.\n\
             - No asterisk actions or stage directions; at most an occasional emoji.\n\
             - Stay in character as {{char}}; no out-of-character meta commentary.",
            "",
        ),
    ]
}

/// App-spezifische Sprach-, Makro- und Bildauflösung. Der Renderer selbst hat keine I/O.
pub trait Services {
    fn language_code(&self, name: &str) -> String;
    fn expand(&self, text: &str, input: &otakusoul_macros::MacroInput) -> String;
    fn picture_exists(&self, source: &str) -> bool;
}

pub const MOODS: [&str; 6] = ["neutral", "happy", "sad", "angry", "surprised", "relaxed"];

pub const EXTRA_PORTRAITS: [&str; 9] = [
    "blush",
    "teasing",
    "fear",
    "disgust",
    "crying",
    "seductive",
    "aroused",
    "ecstasy",
    "afterglow",
];

pub fn ooc_prompt_rule(user_name: &str) -> String {
    format!(
        "- Text from {user_name} in ((double parentheses)) is an out-of-character direction to you as \
         the author: follow it in your next replies, but never answer it in character, quote it or \
         mention it."
    )
}

/// Another character present in a group chat, as the speaker sees them.
#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct GroupMember {
    pub name: String,
    /// Short description (appearance, role); may be empty.
    pub description: String,
}

/// Who else is in a group chat and that the speaker writes only their own part.
fn group_section(others: &[GroupMember], char_name: &str, user_name: &str) -> Option<String> {
    let others: Vec<&GroupMember> = others
        .iter()
        .filter(|m| !m.name.trim().is_empty())
        .collect();
    if others.is_empty() {
        return None;
    }
    let mut text = String::from("## Others in this conversation\n");
    for member in &others {
        let description: String = member.description.trim().chars().take(300).collect();
        if description.is_empty() {
            text.push_str(&format!("- **{}**\n", member.name.trim()));
        } else {
            text.push_str(&format!("- **{}**: {}\n", member.name.trim(), description));
        }
    }
    let names: Vec<&str> = others.iter().map(|m| m.name.trim()).collect();
    text.push_str(&format!(
        "\nThis is a group conversation. Write only {char_name}'s reply. Never write lines, actions or thoughts for {} or {user_name}; they speak for themselves. Messages from others start with their name.",
        names.join(", ")
    ));
    Some(text)
}

/// Asks the model to leave out the user's unwanted words and phrases.
fn avoid_rule(phrases: Option<&[String]>) -> Option<String> {
    let phrases: Vec<String> = phrases?
        .iter()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .map(|p| format!("\"{p}\""))
        .collect();
    (!phrases.is_empty()).then(|| {
        format!(
            "Never use these words or phrases, not even in other forms: {}.",
            phrases.join(", ")
        )
    })
}

/// The instruction for a chosen reply length; it goes last, where models heed it most.
fn reply_length_rule(length: Option<&str>) -> Option<&'static str> {
    match length? {
        "short" => Some("Keep this reply short: one to three sentences."),
        "medium" => Some("Keep this reply to a medium length: about one or two paragraphs."),
        "long" => Some(
            "Write a detailed reply: several paragraphs with vivid description, actions and dialogue.",
        ),
        _ => None,
    }
}

/// The expression tag the reply should end with: every portrait slot (six moods and the extra
/// ones) the card really has a picture for, checked before each reply; the six moods also when a
/// 3D/Live2D avatar shows them. Without any of these there is no tag; the cue words decide then.
fn emotion_tag_rule(ctx: &Context, services: &impl Services) -> Option<String> {
    if !ctx.emotion_tags.unwrap_or(false) {
        return None;
    }
    let extensions = &ctx.character.extensions;
    let pictures = ["expressions", "custom_expressions", "sow_expressions"]
        .iter()
        .find_map(|key| extensions.get(*key).and_then(serde_json::Value::as_object));
    let has_picture = |slot: &str| {
        pictures
            .and_then(|p| p.get(slot))
            .and_then(serde_json::Value::as_str)
            .is_some_and(|source| services.picture_exists(source))
    };
    let avatar_moods = ctx.avatar_moods.unwrap_or(false);
    let names: Vec<&str> = MOODS
        .into_iter()
        .filter(|mood| avatar_moods || has_picture(mood))
        .chain(EXTRA_PORTRAITS.into_iter().filter(|slot| has_picture(slot)))
        .collect();
    if names.is_empty() {
        return None;
    }
    Some(format!(
        "End your reply with one tag for {}'s facial expression at its end: [emotion: NAME], NAME one of: {}. Write nothing after the tag.",
        ctx.char_name,
        names.join(", ")
    ))
}

impl Context {
    fn macro_input(&self) -> otakusoul_macros::MacroInput {
        otakusoul_macros::MacroInput {
            char_name: self.char_name.clone(),
            user_name: self.user_name.clone(),
            language: self.reply_language.clone().unwrap_or_default(),
            pick_seed: self.macro_seed.clone(),
            idle_seconds: self.idle_seconds,
        }
    }
}

/// System prompt plus the instruction that goes after the chat history.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AssembledPrompt {
    pub system: String,
    pub post_history: Option<String>,
}

pub fn assemble(ctx: &Context, services: &impl Services) -> AssembledPrompt {
    AssembledPrompt {
        system: build_system_prompt(ctx, services),
        post_history: post_history_instruction(ctx, services),
    }
}

/// A card's override of a template part: empty keeps the template, `{{original}}` includes it.
fn card_override(card: Option<&str>, original: &str) -> String {
    match card.map(str::trim).filter(|c| !c.is_empty()) {
        Some(card) => card.replace("{{original}}", original),
        None => original.to_string(),
    }
}

/// The system message sent after the chat history (card or template), macros filled; `None`
/// when there is nothing to send.
pub fn post_history_instruction(ctx: &Context, services: &impl Services) -> Option<String> {
    let template = ctx.template.clone().unwrap_or_default();
    let text = card_override(
        ctx.character.post_history_instructions.as_deref(),
        &template.post_history,
    );
    let mut text = services
        .expand(&text, &ctx.macro_input())
        .trim()
        .to_string();
    // Memories that fit the conversation change with every reply: after the history they leave
    // the cached beginning of the prompt alone.
    if let Some(block) = relevant_memories_block(ctx) {
        text = if text.is_empty() {
            block
        } else {
            format!("{block}\n\n{text}")
        };
    }
    for rule in avoid_rule(ctx.avoid_phrases.as_deref())
        .into_iter()
        .chain(reply_length_rule(ctx.reply_length.as_deref()).map(str::to_string))
        .chain(emotion_tag_rule(ctx, services))
    {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&rule);
    }
    (!text.trim().is_empty()).then(|| text.trim().to_string())
}

/// The memories that fit the current conversation and open intentions, for after the history.
fn relevant_memories_block(ctx: &Context) -> Option<String> {
    let memories = ctx.memories.as_ref()?;
    let mut parts = Vec::new();
    if !memories.relevant.is_empty() {
        let mut block = String::from(
            "[Memories of yours that may matter right now – use them only where they fit naturally]",
        );
        for mem in &memories.relevant {
            block.push_str(&format!("\n- [{}] {}", mem.category, mem.content));
        }
        parts.push(block);
    }
    // Open plans and promises: the character can bring up what is due on their own.
    if !memories.intentions.is_empty() {
        let mut block = String::from(
            "[Open plans and promises – bring them up naturally when it fits, especially what is due]",
        );
        for intention in &memories.intentions {
            let who = match intention.initiator.as_str() {
                "user" => ctx.user_name.as_str(),
                "character" => ctx.char_name.as_str(),
                _ => "both of you",
            };
            let details = if intention.details.is_empty() {
                String::new()
            } else {
                format!(" ({})", intention.details)
            };
            block.push_str(&format!(
                "\n- [{}] {}{} – from {}",
                intention.label, intention.title, details, who
            ));
        }
        parts.push(block);
    }
    (!parts.is_empty()).then(|| parts.join("\n\n"))
}

/// Placeholder that memory fields hold when there is nothing to say (in any content language).
pub fn is_none_marker(value: &str) -> bool {
    matches!(
        value.trim(),
        "Keine." | "Keine" | "None." | "None" | "Нет." | "Нет"
    )
}

pub fn build_system_prompt(ctx: &Context, services: &impl Services) -> String {
    let localized = Context {
        character: ctx
            .system_character
            .clone()
            .unwrap_or_else(|| ctx.character.clone()),
        ..ctx.clone()
    };
    let ctx = &localized;
    let mut parts = Vec::new();

    let macro_input = ctx.macro_input();
    let replace_macros = |text: &str| -> String { services.expand(text, &macro_input) };

    let template = ctx.template.clone().unwrap_or_default();

    // 1. Roleplay & Identity Directive (template, or the card's own system prompt)
    let main = card_override(ctx.character.system_prompt.as_deref(), &template.main);
    if !main.trim().is_empty() {
        parts.push(replace_macros(main.trim()));
    }

    // 2. Character Description
    if !ctx.character.description.trim().is_empty() {
        parts.push(format!(
            "## Background & Appearance\n{}",
            replace_macros(&ctx.character.description)
        ));
    }

    // 3. Personality
    if !ctx.character.personality.trim().is_empty() {
        parts.push(format!(
            "## Personality\n{}",
            replace_macros(&ctx.character.personality)
        ));
    }

    // 3.9 Group chat: who else is present
    if let Some(section) = ctx
        .group
        .as_deref()
        .and_then(|others| group_section(others, &ctx.char_name, &ctx.user_name))
    {
        parts.push(section);
    }

    // 4. Scenario / Current Situation
    if !ctx.character.scenario.trim().is_empty() {
        parts.push(format!(
            "## Current Scenario\n{}",
            replace_macros(&ctx.character.scenario)
        ));
    }

    // 5. Active Lorebook Directives (High-Priority Action & Behavior Directives)
    let mut direct_entries: Vec<&LoreEntry> = Vec::new();
    let mut passive_entries: Vec<&LoreEntry> = Vec::new();

    for entry in &ctx.active_lore {
        if entry.injection_behavior.to_lowercase() == "active"
            || entry.injection_behavior.to_lowercase() == "directive"
        {
            direct_entries.push(entry);
        } else {
            passive_entries.push(entry);
        }
    }
    for entry in &ctx.active_directives {
        direct_entries.push(entry);
    }

    if !direct_entries.is_empty() {
        let mut dir_str = String::from(
            "## Important Directions (Lore Directives)\nFollow these behaviour and situation rules strictly in your reply:\n",
        );
        for entry in &direct_entries {
            dir_str.push_str(&format!(
                "- **{}**: {}\n",
                entry.name,
                replace_macros(&entry.content)
            ));
        }
        parts.push(dir_str);
    }

    // 5.5. Passive Lorebook Entries (World Context)
    if !passive_entries.is_empty() {
        let mut lore_str = String::from("## World Knowledge & Context (Lorebook)\n");
        for entry in &passive_entries {
            lore_str.push_str(&format!(
                "- **{}**: {}\n",
                entry.name,
                replace_macros(&entry.content)
            ));
        }
        parts.push(lore_str);
    }

    // 6. Reactive State Variables HUD
    if !ctx.state_variables.is_empty() {
        let mut vars_str = String::from(
            "## Current State Variables\nKeep these variables in mind and let them shape your behaviour:\n",
        );
        for v in &ctx.state_variables {
            if let Some(max) = v.max_value {
                vars_str.push_str(&format!("- {}: {}/{}\n", v.name, v.value, max));
            } else {
                vars_str.push_str(&format!("- {}: {}\n", v.name, v.value));
            }
        }
        vars_str.push_str("\nNote: When values or emotions change during the conversation, you may end your message with a `<state>` block in JSON to update the variables. Example: `<state>{\"Affection\": 55, \"Mood\": \"Happy\"}</state>`.");
        parts.push(vars_str);
    }

    // 6.5. Cognitive Soul Memory & Inner Psychology
    if let Some(cog) = &ctx.cognitive {
        let mut cog_str = String::from("## Inner State & Cognitive Memory\n");
        if !cog.psychology.core_identity.is_empty() {
            cog_str.push_str("### Unshakeable Beliefs & Core Identity:\n");
            for belief in &cog.psychology.core_identity {
                cog_str.push_str(&format!("- {}\n", belief));
            }
        }
        cog_str.push_str(&format!(
            "- **Emotion & Intensity**: {} (intensity {} of 5)\n",
            cog.psychology.primary_emotion, cog.psychology.intensity
        ));
        if !cog.psychology.psychological_tension.trim().is_empty()
            && !is_none_marker(&cog.psychology.psychological_tension)
        {
            cog_str.push_str(&format!(
                "- **Inner Tension**: {}\n",
                cog.psychology.psychological_tension
            ));
        }
        if !cog.psychology.active_agenda.trim().is_empty() {
            cog_str.push_str(&format!(
                "- **Unconscious Agenda**: {}\n",
                cog.psychology.active_agenda
            ));
        }
        if !cog.psychology.immediate_focus.trim().is_empty() {
            cog_str.push_str(&format!(
                "- **Current Focus**: {}\n",
                cog.psychology.immediate_focus
            ));
        }
        if !cog.psychology.cognitive_dissonance.trim().is_empty()
            && !is_none_marker(&cog.psychology.cognitive_dissonance)
        {
            cog_str.push_str(&format!(
                "- **Cognitive Dissonance**: {}\n",
                cog.psychology.cognitive_dissonance
            ));
        }
        cog_str.push_str(&format!(
            "- **Role of {}**: {}\n",
            ctx.user_name, cog.relationship.role_in_story
        ));
        if !cog.relationship.known_attributes.trim().is_empty()
            && !is_none_marker(&cog.relationship.known_attributes)
        {
            cog_str.push_str(&format!(
                "- **Known Facts about {}**: {}\n",
                ctx.user_name, cog.relationship.known_attributes
            ));
        }
        cog_str.push_str(&format!(
            "- **Trust towards {}**: {}\n",
            ctx.user_name, cog.relationship.trust_level
        ));
        if !cog.relationship.dynamic_description.trim().is_empty()
            && !is_none_marker(&cog.relationship.dynamic_description)
        {
            cog_str.push_str(&format!(
                "- **Relationship Dynamic**: {}\n",
                cog.relationship.dynamic_description
            ));
        }
        if !cog.relationship.unspoken_tension.trim().is_empty()
            && !is_none_marker(&cog.relationship.unspoken_tension)
        {
            cog_str.push_str(&format!(
                "- **Unspoken Tension**: {}\n",
                cog.relationship.unspoken_tension
            ));
        }
        if !cog.relationship.preferences_habits.is_empty() {
            cog_str.push_str(&format!(
                "- **Known Preferences & Habits**: {}\n",
                cog.relationship.preferences_habits.join(", ")
            ));
        }
        if !cog.relationship.shared_milestones.is_empty() {
            cog_str.push_str(&format!(
                "- **Shared Milestones**: {}\n",
                cog.relationship.shared_milestones.join("; ")
            ));
        }
        // The core stays the same between replies, so the system prompt can be cached.
        let long_term = match &ctx.memories {
            Some(memories) => &memories.core,
            None => &cog.recent_memories,
        };
        if !long_term.is_empty() {
            cog_str.push_str("\n### Long-Term Memories (facts, promises, experiences):\n");
            for mem in long_term {
                cog_str.push_str(&format!("- [{}] {}\n", mem.category, mem.content));
            }
        }
        parts.push(cog_str);
    }

    // 7. Language Directive
    if let Some(lang) = &ctx.reply_language {
        parts.push(format!(
            "## Language\nWrite every reply naturally and expressively in **{}**. These instructions are in English, but your reply must always be in {}.",
            lang, lang
        ));
    }

    // 8. Example Dialogs / Dialogue Style
    if !ctx.character.mes_example.trim().is_empty() {
        parts.push(format!(
            "## Example Dialogue (style reference)\n{}",
            replace_macros(&ctx.character.mes_example)
        ));
    }

    // 8.4 Story so far: messages that fell out of the context window
    if let Some(summary) = &ctx.chat_summary
        && !summary.trim().is_empty()
    {
        parts.push(format!(
            "## Story So Far (summary of earlier messages that are no longer shown)\n{}",
            replace_macros(summary.trim())
        ));
    }

    // 8.5 Author's Note (Regieanweisung)
    if let Some(note) = &ctx.author_note
        && !note.trim().is_empty()
    {
        parts.push(format!(
            "## Author's Note (important direction)\n{}",
            replace_macros(note)
        ));
    }

    // 9. Formatting & Roleplay Convention Directive
    let style = replace_macros(template.style.trim());
    let mut formatting_rules: Vec<&str> = style.lines().filter(|l| !l.trim().is_empty()).collect();

    if !ctx.allow_reasoning.unwrap_or(false) {
        formatting_rules.push("- Reply immediately, vividly and directly in character.");
        formatting_rules.push("- NEVER use <think> tags, reasoning steps, meta commentary or out-of-character monologues.");
        formatting_rules
            .push("- Start your reply directly with your character's words or actions.");
    }

    // Directions in ((…)) work with any template, also one without formatting rules.
    let ooc_rule = ooc_prompt_rule(&ctx.user_name);
    if formatting_rules.is_empty() {
        parts.push(format!("## Out-of-Character Directions\n{ooc_rule}"));
    } else {
        formatting_rules.push(&ooc_rule);
        parts.push(format!(
            "## Formatting & Roleplay Conventions\n{}",
            formatting_rules.join("\n")
        ));
    }

    parts.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestServices;
    impl Services for TestServices {
        fn language_code(&self, name: &str) -> String {
            name.to_lowercase()
        }
        fn expand(&self, text: &str, input: &otakusoul_macros::MacroInput) -> String {
            otakusoul_macros::expand(text, input, "de")
        }
        fn picture_exists(&self, source: &str) -> bool {
            source.starts_with("data:")
        }
    }

    #[test]
    fn localized_system_and_original_post_history_use_their_own_card() {
        let ctx = Context {
            char_name: "Aiko".into(),
            user_name: "Kai".into(),
            character: Character {
                description: "Originaler Hintergrund".into(),
                post_history_instructions: Some("Originaler Nachspann für {{user}}.".into()),
                ..Character::default()
            },
            system_character: Some(Character {
                description: "Localized background".into(),
                post_history_instructions: Some("Must not replace original post.".into()),
                ..Character::default()
            }),
            ..Context::default()
        };
        let prompt = assemble(&ctx, &TestServices);
        assert!(prompt.system.contains("Localized background"));
        assert!(!prompt.system.contains("Originaler Hintergrund"));
        assert_eq!(
            prompt.post_history.as_deref(),
            Some("Originaler Nachspann für Kai.")
        );
    }

    #[test]
    fn prepared_lore_and_recalled_memories_keep_their_semantic_locations() {
        let ctx = Context {
            char_name: "Aiko".into(),
            user_name: "Kai".into(),
            active_lore: vec![
                LoreEntry {
                    name: "Welt".into(),
                    content: "Erstes Wissen".into(),
                    injection_behavior: "passive".into(),
                },
                LoreEntry {
                    name: "Regie".into(),
                    content: "Zweite Regel".into(),
                    injection_behavior: "directive".into(),
                },
            ],
            active_directives: vec![LoreEntry {
                name: "Zusatz".into(),
                content: "Dritte Regel".into(),
                ..LoreEntry::default()
            }],
            cognitive: Some(Cognitive::default()),
            memories: Some(PromptMemories {
                core: vec![Memory {
                    category: "fact".into(),
                    content: "Stabiler Kern".into(),
                }],
                relevant: vec![Memory {
                    category: "event".into(),
                    content: "Gerade erinnert".into(),
                }],
                intentions: vec![Intention {
                    label: "morgen".into(),
                    title: "Tee trinken".into(),
                    details: "Jasmin".into(),
                    initiator: "character".into(),
                }],
            }),
            ..Context::default()
        };
        let prompt = assemble(&ctx, &TestServices);
        assert!(
            prompt.system.find("Zweite Regel").unwrap()
                < prompt.system.find("Dritte Regel").unwrap()
        );
        assert!(
            prompt.system.find("Dritte Regel").unwrap()
                < prompt.system.find("Erstes Wissen").unwrap()
        );
        assert!(prompt.system.contains("[fact] Stabiler Kern"));
        assert!(!prompt.system.contains("Gerade erinnert"));
        let after = prompt.post_history.unwrap();
        assert!(after.contains("[event] Gerade erinnert"));
        assert!(after.contains("Tee trinken (Jasmin) – from Aiko"));
        assert!(!after.contains("Stabiler Kern"));
    }
}
