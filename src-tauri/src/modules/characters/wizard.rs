use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CharacterWizardInput {
    pub name: String,
    pub concept: String,
    pub archetype: String,
    pub visual_style: String,
    pub personality_traits: String,
    pub world_background: String,
    pub relationship_to_user: String,
    pub greeting_scenario: String,
    pub target_language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct CharacterDraft {
    pub name: String,
    pub description: String,
    pub personality: String,
    pub scenario: String,
    pub first_mes: String,
    pub mes_example: String,
    pub system_prompt: String,
    pub tags: Vec<String>,
}

pub fn build_character_wizard_prompt(input: &CharacterWizardInput) -> String {
    let lang = input.target_language.as_deref().unwrap_or("Deutsch");
    format!(
        r#"You are a masterful AI author of roleplay characters and SillyTavern V2 character cards.
Based on the user's key facts below, create a deep, vivid and consistent character card. Write every value in {lang}.

KEY FACTS:
- Name: {name}
- Concept: {concept}
- Archetype: {archetype}
- Visual appearance: {visual}
- Personality & traits: {personality}
- World & background: {world}
- Relationship to {{{{user}}}}: {relationship}
- Opening scenario: {scenario}

FORMAT REQUIREMENTS:
Reply ONLY with a single valid JSON object in this format (no explanations, no code fences):
{{
  "name": "{name}",
  "description": "<Detailed visual description: clothing, hair, eyes, build, age, social role>",
  "personality": "<Thorough personality: traits, quirks, fears, desires, tone, speech patterns>",
  "scenario": "<Current setting in which {{{{char}}}} meets {{{{user}}}}>",
  "first_mes": "<Atmospheric first message from {{{{char}}}}, including *actions* and \"spoken dialogue\">",
  "mes_example": "<START>\\n{{{{user}}}}: <greeting>\\n{{{{char}}}}: <reply with *action* and dialogue>",
  "system_prompt": "<One or two sentences in {lang} telling the model to write as {name}, stay in character and use *...* for actions and sensations>",
  "tags": ["Anime", "{archetype}", "<genre tag>"]
}}
"#,
        lang = lang,
        name = input.name,
        concept = input.concept,
        archetype = input.archetype,
        visual = input.visual_style,
        personality = input.personality_traits,
        world = input.world_background,
        relationship = input.relationship_to_user,
        scenario = input.greeting_scenario,
    )
}

pub fn parse_character_wizard_draft(raw_text: &str) -> Result<CharacterDraft, String> {
    let cleaned = raw_text.trim();
    let json_candidate = if let Some(start) = cleaned.find('{') {
        if let Some(end) = cleaned.rfind('}') {
            &cleaned[start..=end]
        } else {
            cleaned
        }
    } else {
        cleaned
    };

    serde_json::from_str::<CharacterDraft>(json_candidate)
        .map_err(|e| crate::err!("backend.characters.draftParse", error = e))
}
