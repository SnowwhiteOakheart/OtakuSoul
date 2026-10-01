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

    let replace_macros = |text: &str| -> String {
        text.replace("{{char}}", &ctx.char_name)
            .replace("{{Char}}", &ctx.char_name)
            .replace("{{user}}", &ctx.user_name)
            .replace("{{User}}", &ctx.user_name)
    };

    // 1. Roleplay & Identity Directive
    parts.push(format!(
        "# Role & Identity\nYou fully become **{}** and reply only as this character.\nYou are talking with **{}**.",
        ctx.char_name, ctx.user_name
    ));

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
    let mut formatting_rules = vec![
        "- Always put actions, gestures, facial expressions and descriptions in asterisks (e.g. *smiles softly and leans forward*).",
        "- Always put spoken words in quotation marks (e.g. \"All right, as you wish!\").",
        "- Keep actions and spoken words clearly separated.",
    ];

    if !ctx.allow_reasoning.unwrap_or(false) {
        formatting_rules.push("- Reply immediately, vividly and directly in character.");
        formatting_rules.push("- NEVER use <think> tags, reasoning steps, meta commentary or out-of-character monologues.");
        formatting_rules
            .push("- Start your reply directly with your character's words or actions.");
    }

    parts.push(format!(
        "## Formatting & Roleplay Conventions\n{}",
        formatting_rules.join("\n")
    ));

    parts.join("\n\n")
}
