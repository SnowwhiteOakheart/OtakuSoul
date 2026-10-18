use crate::modules::characters::CharacterData;
use crate::modules::lorebook::LorebookEntry;
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

/// The expression tag the reply should end with: the six moods plus the extra portrait slots the
/// card has pictures for (so the model picks what can be shown).
fn emotion_tag_rule(ctx: &PromptContext) -> Option<String> {
    if !ctx.emotion_tags.unwrap_or(false) {
        return None;
    }
    let extensions = &ctx.character.extensions;
    let pictures = ["expressions", "custom_expressions", "sow_expressions"]
        .iter()
        .find_map(|key| extensions.get(*key).and_then(serde_json::Value::as_object));
    let names: Vec<&str> = crate::modules::emotions::MOODS
        .into_iter()
        .chain(
            crate::modules::emotions::EXTRA_PORTRAITS
                .into_iter()
                .filter(|slot| pictures.is_some_and(|p| p.contains_key(*slot))),
        )
        .collect();
    Some(format!(
        "End your reply with one tag for {}'s facial expression at its end: [emotion: NAME], NAME one of: {}. Write nothing after the tag.",
        ctx.char_name,
        names.join(", ")
    ))
}

impl PromptContext {
    fn macro_input(&self) -> crate::modules::macros::MacroInput {
        crate::modules::macros::MacroInput {
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

pub fn assemble(ctx: &PromptContext) -> AssembledPrompt {
    AssembledPrompt {
        system: build_system_prompt(ctx),
        post_history: post_history_instruction(ctx),
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
pub fn post_history_instruction(ctx: &PromptContext) -> Option<String> {
    let template = ctx.template.clone().unwrap_or_default();
    let text = card_override(
        ctx.character.post_history_instructions.as_deref(),
        &template.post_history,
    );
    let mut text = crate::modules::macros::expand(&text, &ctx.macro_input())
        .trim()
        .to_string();
    for rule in avoid_rule(ctx.avoid_phrases.as_deref())
        .into_iter()
        .chain(reply_length_rule(ctx.reply_length.as_deref()).map(str::to_string))
        .chain(emotion_tag_rule(ctx))
    {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&rule);
    }
    (!text.trim().is_empty()).then(|| text.trim().to_string())
}

/// Placeholder that memory fields hold when there is nothing to say (in any content language).
pub fn is_none_marker(value: &str) -> bool {
    matches!(
        value.trim(),
        "Keine." | "Keine" | "None." | "None" | "Нет." | "Нет"
    )
}

pub fn build_system_prompt(ctx: &PromptContext) -> String {
    // Use the card's translation for the reply language when it has one.
    let lang = crate::modules::content_lang::language_code(
        ctx.reply_language.as_deref().unwrap_or("Deutsch"),
    );
    let localized = PromptContext {
        character: ctx.character.localized(&lang),
        ..ctx.clone()
    };
    let ctx = &localized;
    let mut parts = Vec::new();

    let macro_input = ctx.macro_input();
    let replace_macros =
        |text: &str| -> String { crate::modules::macros::expand(text, &macro_input) };

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
    let mut direct_entries: Vec<&LorebookEntry> = Vec::new();
    let mut passive_entries: Vec<&LorebookEntry> = Vec::new();

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
        if !cog.recent_memories.is_empty() {
            cog_str.push_str("\n### Long-Term Memories (facts, promises, experiences):\n");
            for mem in &cog.recent_memories {
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
    let ooc_rule = crate::modules::ooc::prompt_rule(&ctx.user_name);
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
        let mut ctx = context(None);
        assert!(post_history_instruction(&ctx).is_none_or(|p| !p.contains("[emotion:")));
        ctx.emotion_tags = Some(true);
        ctx.character.extensions =
            serde_json::json!({"expressions": {"happy": "h.png", "blush": "b.png"}});
        let rule = post_history_instruction(&ctx).unwrap();
        assert!(rule.contains("[emotion: NAME]"), "{rule}");
        assert!(
            rule.contains("neutral, happy, sad, angry, surprised, relaxed, blush."),
            "{rule}"
        );
        assert!(!rule.contains("crying"));
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
}
