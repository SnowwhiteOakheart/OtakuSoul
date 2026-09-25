use crate::modules::characters::CharacterData;
use crate::modules::lorebook::LorebookEntry;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateVariable {
    pub name: String,
    pub value: String,
    pub var_type: String, // "int", "str", "bool", "progress"
    pub max_value: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptContext {
    pub char_name: String,
    pub user_name: String,
    pub character: CharacterData,
    pub active_lore: Vec<LorebookEntry>,
    pub state_variables: Vec<StateVariable>,
    pub reply_language: Option<String>, // e.g. "Deutsch", "English"
}

pub fn build_system_prompt(ctx: &PromptContext) -> String {
    let mut parts = Vec::new();

    let replace_macros = |text: &str| -> String {
        text.replace("{{char}}", &ctx.char_name)
            .replace("{{Char}}", &ctx.char_name)
            .replace("{{user}}", &ctx.user_name)
            .replace("{{User}}", &ctx.user_name)
    };

    // 1. Roleplay & Identity Directive
    parts.push(format!(
        "# Rolle & Identität\nDu schlüpfst vollständig in die Rolle von **{}** und antwortest ausschließlich als diese Figur.\nDein Gesprächspartner ist **{}**.",
        ctx.char_name, ctx.user_name
    ));

    // 2. Character Description
    if !ctx.character.description.trim().is_empty() {
        parts.push(format!(
            "## Hintergrund & Erscheinung\n{}",
            replace_macros(&ctx.character.description)
        ));
    }

    // 3. Personality
    if !ctx.character.personality.trim().is_empty() {
        parts.push(format!(
            "## Persönlichkeit\n{}",
            replace_macros(&ctx.character.personality)
        ));
    }

    // 4. Scenario / Current Situation
    if !ctx.character.scenario.trim().is_empty() {
        parts.push(format!(
            "## Aktuelles Szenario\n{}",
            replace_macros(&ctx.character.scenario)
        ));
    }

    // 5. Active Lorebook Entries
    if !ctx.active_lore.is_empty() {
        let mut lore_str = String::from("## Weltwissen & Kontext (Lorebook)\n");
        for entry in &ctx.active_lore {
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
        let mut vars_str = String::from("## Aktuelle Status-Variablen\nBehalte diese Variablen im Gedächtnis und passe Dein Verhalten daran an:\n");
        for v in &ctx.state_variables {
            if let Some(max) = v.max_value {
                vars_str.push_str(&format!("- {}: {}/{}\n", v.name, v.value, max));
            } else {
                vars_str.push_str(&format!("- {}: {}\n", v.name, v.value));
            }
        }
        parts.push(vars_str);
    }

    // 7. Language Directive
    if let Some(lang) = &ctx.reply_language {
        parts.push(format!(
            "## Sprache\nAntworte natürlich und ausdrucksstark auf **{}**.",
            lang
        ));
    }

    // 8. Example Dialogs / Dialogue Style
    if !ctx.character.mes_example.trim().is_empty() {
        parts.push(format!(
            "## Dialogbeispiele (Stilvorgabe)\n{}",
            replace_macros(&ctx.character.mes_example)
        ));
    }

    parts.join("\n\n")
}
