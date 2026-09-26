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
    #[serde(default)]
    pub cognitive: Option<crate::modules::memory::CognitiveOverview>,
    pub reply_language: Option<String>, // e.g. "Deutsch", "English"
    #[serde(default)]
    pub allow_reasoning: Option<bool>,
    #[serde(default)]
    pub author_note: Option<String>,
    #[serde(default)]
    pub author_note_depth: Option<u32>,
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
        vars_str.push_str("\nHinweis: Wenn sich Werte oder Emotionen im Gesprächsverlauf verändern, kannst du am Ende deiner Nachricht optional einen `<state>` Block im JSON-Format ausgeben, um Variablen zu aktualisieren. Beispiel: `<state>{\"Affection\": 55, \"Mood\": \"Glücklich\"}</state>`.");
        parts.push(vars_str);
    }

    // 6.5. Cognitive Soul Memory & Inner Psychology
    if let Some(cog) = &ctx.cognitive {
        let mut cog_str = String::from("## Innerer Geisteszustand & Kognitives Gedächtnis\n");
        if !cog.psychology.core_identity.is_empty() {
            cog_str.push_str("### Unumstößliche Glaubenssätze & Kernidentität:\n");
            for belief in &cog.psychology.core_identity {
                cog_str.push_str(&format!("- {}\n", belief));
            }
        }
        cog_str.push_str(&format!(
            "- **Emotion & Intensität**: {} (Intensität {} von 5)\n",
            cog.psychology.primary_emotion, cog.psychology.intensity
        ));
        if !cog.psychology.psychological_tension.trim().is_empty() && cog.psychology.psychological_tension != "Keine." {
            cog_str.push_str(&format!("- **Innere Anspannung**: {}\n", cog.psychology.psychological_tension));
        }
        if !cog.psychology.active_agenda.trim().is_empty() {
            cog_str.push_str(&format!("- **Unbewusste Agenda**: {}\n", cog.psychology.active_agenda));
        }
        if !cog.psychology.immediate_focus.trim().is_empty() {
            cog_str.push_str(&format!("- **Gedanklicher Fokus**: {}\n", cog.psychology.immediate_focus));
        }
        if !cog.psychology.cognitive_dissonance.trim().is_empty() && cog.psychology.cognitive_dissonance != "Keine." {
            cog_str.push_str(&format!("- **Kognitive Dissonanz**: {}\n", cog.psychology.cognitive_dissonance));
        }
        cog_str.push_str(&format!("- **Rolle von {}**: {}\n", ctx.user_name, cog.relationship.role_in_story));
        if !cog.relationship.known_attributes.trim().is_empty() && cog.relationship.known_attributes != "Keine." {
            cog_str.push_str(&format!("- **Bekannte Attribute über {}**: {}\n", ctx.user_name, cog.relationship.known_attributes));
        }
        cog_str.push_str(&format!("- **Vertrauensstufe zu {}**: {}\n", ctx.user_name, cog.relationship.trust_level));
        if !cog.relationship.dynamic_description.trim().is_empty() && cog.relationship.dynamic_description != "Keine." {
            cog_str.push_str(&format!("- **Beziehungsdynamik**: {}\n", cog.relationship.dynamic_description));
        }
        if !cog.relationship.unspoken_tension.trim().is_empty() && cog.relationship.unspoken_tension != "Keine." {
            cog_str.push_str(&format!("- **Ungesagte Spannungen**: {}\n", cog.relationship.unspoken_tension));
        }
        if !cog.relationship.preferences_habits.is_empty() {
            cog_str.push_str(&format!(
                "- **Bekannte Vorlieben/Gewohnheiten**: {}\n",
                cog.relationship.preferences_habits.join(", ")
            ));
        }
        if !cog.relationship.shared_milestones.is_empty() {
            cog_str.push_str(&format!(
                "- **Gemeinsame Meilensteine**: {}\n",
                cog.relationship.shared_milestones.join("; ")
            ));
        }
        if !cog.recent_memories.is_empty() {
            cog_str.push_str("\n### Erinnertes Langzeitgedächtnis (Fakten, Versprechen, Erlebnisse):\n");
            for mem in &cog.recent_memories {
                cog_str.push_str(&format!("- [{}] {}\n", mem.category, mem.content));
            }
        }
        parts.push(cog_str);
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

    // 8.5 Author's Note (Regieanweisung)
    if let Some(note) = &ctx.author_note {
        if !note.trim().is_empty() {
            parts.push(format!(
                "## Author's Note (Wichtige Regieanweisung)\n{}",
                replace_macros(note)
            ));
        }
    }

    // 9. Formatting & Roleplay Convention Directive
    let mut formatting_rules = vec![
        "- Formatiere alle Handlungen, Gesten, Mimiken und Beschreibungen strikt in Sternchen (z. B. *lächelt sanft und lehnt sich vor*).",
        "- Formatiere alle gesprochenen Worte und wörtliche Rede strikt in Anführungszeichen (z. B. \"Alles klar, wie du willst!\").",
        "- Trenne Handlungen und gesprochene Worte sauber voneinander.",
    ];

    if !ctx.allow_reasoning.unwrap_or(false) {
        formatting_rules.push("- Antworte sofort, lebendig und direkt in Deiner Rolle als Charakter.");
        formatting_rules.push("- Verwende NIEMALS <think>-Tags, Denkschritte, Meta-Erklärungen oder interne Monologe.");
        formatting_rules.push("- Beginne Deine Antwort unmittelbar mit den Worten oder Taten Deines Charakters.");
    }

    parts.push(format!(
        "## Formatierungs- & Rollenspiel-Konventionen\n{}",
        formatting_rules.join("\n")
    ));

    parts.join("\n\n")
}
