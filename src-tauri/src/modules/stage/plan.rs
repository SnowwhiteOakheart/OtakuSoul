//! Schema of the game master plan returned by the language model, and its JSON repair.

use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanDiceCheck {
    pub formula: String,
    pub dc: i32,
    pub skill_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanClockUpdate {
    pub id: String,
    pub delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanResourceDelta {
    pub target: String,
    #[serde(default)]
    pub hp_delta: i32,
    #[serde(default)]
    pub stress_delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanArcUpdate {
    pub id: String,
    #[serde(default)]
    pub stage_delta: i32,
    #[serde(default)]
    pub reveal: bool,
    #[serde(default)]
    pub resolve: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanObjectiveUpdate {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub progress_delta: i32,
    #[serde(default)]
    pub max: Option<u32>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanInventoryAdd {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_inventory_quantity")]
    pub quantity: u32,
    #[serde(default = "default_inventory_type")]
    pub item_type: String,
    #[serde(default)]
    pub hp_restore: i32,
    #[serde(default)]
    pub stress_restore: i32,
    #[serde(default)]
    pub clears_condition: Option<String>,
}

pub(super) fn default_inventory_quantity() -> u32 {
    1
}
pub(super) fn default_inventory_type() -> String {
    "key".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanCombatant {
    pub name: String,
    #[serde(default = "default_enemy_hp")]
    pub hp: i32,
    #[serde(default = "default_enemy_role")]
    pub role: String,
}

pub(super) fn default_enemy_hp() -> i32 {
    10
}
pub(super) fn default_enemy_role() -> String {
    "enemy".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanCombatDelta {
    pub target: String,
    pub hp_delta: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanEncounterUpdate {
    pub action: String,
    #[serde(default)]
    pub enemies: Vec<PlanCombatant>,
    #[serde(default)]
    pub hp_updates: Vec<PlanCombatDelta>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GmPlan {
    pub narration_plan: String,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub time_of_day: Option<String>,
    #[serde(default)]
    pub weather: Option<String>,
    #[serde(default)]
    pub bg_image: Option<String>,
    #[serde(default)]
    pub ambient_audio: Option<String>,
    #[serde(default)]
    pub next_actor: Option<String>,
    #[serde(default)]
    pub dice_check: Option<PlanDiceCheck>,
    #[serde(default)]
    pub campaign_clock_updates: Vec<PlanClockUpdate>,
    #[serde(default)]
    pub resource_delta: Option<PlanResourceDelta>,
    #[serde(default)]
    pub story_arc_updates: Vec<PlanArcUpdate>,
    #[serde(default)]
    pub objective_updates: Vec<PlanObjectiveUpdate>,
    #[serde(default)]
    pub inventory_add: Vec<PlanInventoryAdd>,
    #[serde(default)]
    pub inventory_remove: Vec<String>,
    #[serde(default)]
    pub encounter: Option<PlanEncounterUpdate>,
    #[serde(default)]
    pub player_choices: Vec<TaggedChoice>,
    #[serde(default)]
    pub lasting_consequence: Option<String>,
    #[serde(default)]
    pub discovery: Option<String>,
}

/// Robust JSON repair function that extracts and parses GM JSON plans
/// Trailing commas before `]`/`}` that language models like to emit in JSON.
pub(super) static TRAILING_COMMA_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r",\s*([\]\}])").expect("static regex is valid"));

pub fn repair_and_parse_gm_plan(raw: &str) -> GmPlan {
    let mut text = raw.trim();

    // Strip markdown fences
    if text.starts_with("```") {
        if let Some(pos) = text.find('\n') {
            text = &text[pos + 1..];
        }
        if let Some(end) = text.rfind("```") {
            text = &text[..end];
        }
        text = text.trim();
    }

    // Try direct parse
    if let Ok(plan) = serde_json::from_str::<GmPlan>(text) {
        return plan;
    }

    // Extract outer curly braces
    if let (Some(start), Some(end)) = (text.find('{'), text.rfind('}'))
        && start < end
    {
        let candidate = &text[start..=end];
        // Remove trailing commas before closing braces/brackets
        let cleaned = TRAILING_COMMA_RE.replace_all(candidate, "$1");

        if let Ok(plan) = serde_json::from_str::<GmPlan>(&cleaned) {
            return plan;
        }
    }

    // Attempt token repair: count unbalanced braces
    let mut balanced = text.to_string();
    let mut open_braces = 0i32;
    let mut open_brackets = 0i32;
    for c in balanced.chars() {
        match c {
            '{' => open_braces += 1,
            '}' => open_braces -= 1,
            '[' => open_brackets += 1,
            ']' => open_brackets -= 1,
            _ => {}
        }
    }
    while open_brackets > 0 {
        balanced.push(']');
        open_brackets -= 1;
    }
    while open_braces > 0 {
        balanced.push('}');
        open_braces -= 1;
    }
    if let Ok(plan) = serde_json::from_str::<GmPlan>(&balanced) {
        return plan;
    }

    // Fallback default plan
    GmPlan {
        narration_plan: text.to_string(),
        next_actor: Some("PLAYER".to_string()),
        player_choices: vec![
            TaggedChoice {
                text: "Die Umgebung untersuchen".to_string(),
                badge: Some("Wahrnehmung".to_string()),
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: "Mit der Gruppe sprechen".to_string(),
                badge: None,
                action_type: "say".to_string(),
            },
            TaggedChoice {
                text: "Vorsichtig weitergehen".to_string(),
                badge: None,
                action_type: "do".to_string(),
            },
        ],
        ..Default::default()
    }
}
