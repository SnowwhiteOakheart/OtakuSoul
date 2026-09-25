use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DcCheckResult {
    pub target_dc: i32,
    pub passed: bool,
    pub margin: i32, // sum - target_dc
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiceRollResult {
    pub formula: String,
    pub dice_count: u32,
    pub die_faces: u32,
    pub modifier: i32,
    pub individual_rolls: Vec<u32>,
    pub sum: i32,
    pub is_critical_success: bool,
    pub is_critical_failure: bool,
    pub dc_check: Option<DcCheckResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldState {
    pub time_of_day: String, // "Morgen", "Mittag", "Dämmerung", "Mitternacht"
    pub weather: String,     // "Klar", "Stürmisch", "Dichter Nebel", "Blutmond"
    pub location: String,    // "Kathedrale der Dämmerung", "Palastgarten"
    pub danger_level: u32,   // 1..5
    pub active_quest: String,
}

impl Default for WorldState {
    fn default() -> Self {
        Self {
            time_of_day: "Dämmerung".to_string(),
            weather: "Nebliger Dunst".to_string(),
            location: "Alte Bibliothek des Ordens".to_string(),
            danger_level: 2,
            active_quest: "Untersuche das uralte Grimoire über Dimensionsrisse.".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CampaignClock {
    pub id: String,
    pub name: String,
    pub current: u32,
    pub max: u32, // e.g. 4, 6, 8
    pub clock_type: String, // "danger" | "progress" | "mystery"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombatCondition {
    pub name: String,
    pub rounds_remaining: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Combatant {
    pub id: String,
    pub name: String,
    pub role: String, // "player" | "companion" | "enemy" | "boss"
    pub hp: i32,
    pub max_hp: i32,
    pub stress: i32,
    pub max_stress: i32,
    pub initiative: i32,
    pub conditions: Vec<CombatCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncounterState {
    pub is_active: bool,
    pub round: u32,
    pub current_turn_index: usize,
    pub combatants: Vec<Combatant>,
    pub combat_log: Vec<String>,
}

impl Default for EncounterState {
    fn default() -> Self {
        Self {
            is_active: false,
            round: 1,
            current_turn_index: 0,
            combatants: Vec::new(),
            combat_log: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StageState {
    pub world: WorldState,
    pub clocks: Vec<CampaignClock>,
    pub encounter: EncounterState,
}

pub struct StageEngine {
    state: RwLock<StageState>,
}

impl StageEngine {
    pub fn new() -> Self {
        let initial_clocks = vec![
            CampaignClock {
                id: "clock_1".to_string(),
                name: "Aufmerksamkeit der Wachen".to_string(),
                current: 2,
                max: 6,
                clock_type: "danger".to_string(),
            },
            CampaignClock {
                id: "clock_2".to_string(),
                name: "Ritual-Vollendung".to_string(),
                current: 1,
                max: 4,
                clock_type: "mystery".to_string(),
            },
        ];

        let initial_combatants = vec![
            Combatant {
                id: "comb_player".to_string(),
                name: "Hiroki".to_string(),
                role: "player".to_string(),
                hp: 45,
                max_hp: 50,
                stress: 20,
                max_stress: 100,
                initiative: 16,
                conditions: Vec::new(),
            },
            Combatant {
                id: "comb_companion".to_string(),
                name: "Ayu Ikue".to_string(),
                role: "companion".to_string(),
                hp: 38,
                max_hp: 40,
                stress: 15,
                max_stress: 100,
                initiative: 19,
                conditions: vec![CombatCondition {
                    name: "Verführerische Aura".to_string(),
                    rounds_remaining: 3,
                }],
            },
            Combatant {
                id: "comb_enemy_1".to_string(),
                name: "Schattenpirscher".to_string(),
                role: "enemy".to_string(),
                hp: 28,
                max_hp: 28,
                stress: 0,
                max_stress: 50,
                initiative: 12,
                conditions: Vec::new(),
            },
        ];

        let mut encounter = EncounterState::default();
        encounter.combatants = initial_combatants;

        let state = StageState {
            world: WorldState::default(),
            clocks: initial_clocks,
            encounter,
        };

        Self {
            state: RwLock::new(state),
        }
    }

    pub fn get_state(&self) -> StageState {
        self.state.read().unwrap().clone()
    }

    pub fn update_world(&self, new_world: WorldState) {
        let mut st = self.state.write().unwrap();
        st.world = new_world;
    }

    pub fn set_clock_progress(&self, clock_id: &str, progress: u32) {
        let mut st = self.state.write().unwrap();
        if let Some(clock) = st.clocks.iter_mut().find(|c| c.id == clock_id) {
            clock.current = progress.min(clock.max);
        }
    }

    pub fn add_clock(&self, clock: CampaignClock) {
        let mut st = self.state.write().unwrap();
        st.clocks.retain(|c| c.id != clock.id);
        st.clocks.push(clock);
    }

    pub fn delete_clock(&self, clock_id: &str) {
        let mut st = self.state.write().unwrap();
        st.clocks.retain(|c| c.id != clock_id);
    }

    // --- Encounter Lifecycle ---
    pub fn start_encounter(&self) {
        let mut st = self.state.write().unwrap();
        st.encounter.is_active = true;
        st.encounter.round = 1;
        st.encounter.current_turn_index = 0;
        // Sort combatants by initiative descending
        st.encounter
            .combatants
            .sort_by(|a, b| b.initiative.cmp(&a.initiative));
        let active_name = st
            .encounter
            .combatants
            .first()
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "Niemand".to_string());
        st.encounter
            .combat_log
            .push(format!("Kampf gestartet! Runde 1 – {} ist am Zug.", active_name));
    }

    pub fn end_encounter(&self) {
        let mut st = self.state.write().unwrap();
        st.encounter.is_active = false;
        st.encounter
            .combat_log
            .push("Kampf beendet. Alle Einheiten entspannen sich.".to_string());
    }

    pub fn next_turn(&self) {
        let mut st = self.state.write().unwrap();
        if !st.encounter.is_active || st.encounter.combatants.is_empty() {
            return;
        }

        let num_combatants = st.encounter.combatants.len();
        st.encounter.current_turn_index += 1;

        if st.encounter.current_turn_index >= num_combatants {
            st.encounter.current_turn_index = 0;
            st.encounter.round += 1;

            // Tick down conditions
            for c in st.encounter.combatants.iter_mut() {
                c.conditions.retain_mut(|cond| {
                    if cond.rounds_remaining > 0 {
                        cond.rounds_remaining -= 1;
                    }
                    cond.rounds_remaining > 0
                });
            }

            let round_num = st.encounter.round;
            st.encounter
                .combat_log
                .push(format!("--- Neue Runde: Runde {} ---", round_num));
        }

        let active_name = st.encounter.combatants[st.encounter.current_turn_index]
            .name
            .clone();
        st.encounter
            .combat_log
            .push(format!("{} ist am Zug.", active_name));
    }

    pub fn apply_combatant_delta(
        &self,
        combatant_id: &str,
        hp_delta: i32,
        stress_delta: i32,
    ) {
        let mut st = self.state.write().unwrap();
        let log_msg = if let Some(c) = st.encounter.combatants.iter_mut().find(|c| c.id == combatant_id) {
            c.hp = (c.hp + hp_delta).clamp(0, c.max_hp);
            c.stress = (c.stress + stress_delta).clamp(0, c.max_stress);

            let msg = if hp_delta < 0 {
                format!("{} erleidet {} Schaden (HP: {}/{})", c.name, hp_delta.abs(), c.hp, c.max_hp)
            } else if hp_delta > 0 {
                format!("{} wird um {} HP geheilt (HP: {}/{})", c.name, hp_delta, c.hp, c.max_hp)
            } else {
                format!("{} Stress verändert um {} (Stress: {}/{})", c.name, stress_delta, c.stress, c.max_stress)
            };
            Some(msg)
        } else {
            None
        };

        if let Some(msg) = log_msg {
            st.encounter.combat_log.push(msg);
        }
    }

    pub fn add_condition(&self, combatant_id: &str, condition: CombatCondition) {
        let mut st = self.state.write().unwrap();
        let log_msg = if let Some(c) = st.encounter.combatants.iter_mut().find(|c| c.id == combatant_id) {
            let name = condition.name.clone();
            let rounds = condition.rounds_remaining;
            let c_name = c.name.clone();
            c.conditions.retain(|cond| cond.name != name);
            c.conditions.push(condition);
            Some(format!(
                "{} erhält Zustand: {} ({} Runden)",
                c_name, name, rounds
            ))
        } else {
            None
        };

        if let Some(msg) = log_msg {
            st.encounter.combat_log.push(msg);
        }
    }
}

/// Helper function to parse dice formulas like "1d20+4", "2d6", "d100", "3d8-2"
pub fn roll_dice(formula_raw: &str, target_dc: Option<i32>) -> Result<DiceRollResult, String> {
    let clean = formula_raw.trim().replace(' ', "");
    if clean.is_empty() {
        return Err("Würfelformel darf nicht leer sein.".to_string());
    }

    let (base_part, modifier) = if let Some(pos) = clean.find('+') {
        let (b, m) = clean.split_at(pos);
        let mod_val: i32 = m[1..].parse().map_err(|_| "Ungültiger positiver Modifikator")?;
        (b, mod_val)
    } else if let Some(pos) = clean.rfind('-') {
        let (b, m) = clean.split_at(pos);
        let mod_val: i32 = m[1..].parse().map_err(|_| "Ungültiger negativer Modifikator")?;
        (b, -mod_val)
    } else {
        (clean.as_str(), 0)
    };

    let parts: Vec<&str> = base_part.split(|c| c == 'd' || c == 'D').collect();
    if parts.len() != 2 {
        return Err(format!("Ungültiges Würfelformat: '{}'. Erwartet XdY z.B. 1d20 oder 2d6+3", clean));
    }

    let dice_count: u32 = if parts[0].is_empty() {
        1
    } else {
        parts[0].parse().map_err(|_| "Ungültige Anzahl der Würfel")?
    };

    let die_faces: u32 = parts[1].parse().map_err(|_| "Ungültige Seitenzahl des Würfels")?;

    if dice_count == 0 || dice_count > 100 {
        return Err("Würfelanzahl muss zwischen 1 und 100 liegen.".to_string());
    }
    if die_faces < 2 || die_faces > 1000 {
        return Err("Seitenzahl muss zwischen 2 und 1000 liegen.".to_string());
    }

    let mut rng = rand::thread_rng();
    let mut individual_rolls = Vec::with_capacity(dice_count as usize);
    let mut rolls_sum: i32 = 0;

    for _ in 0..dice_count {
        let roll: u32 = rng.gen_range(1..=die_faces);
        rolls_sum += roll as i32;
        individual_rolls.push(roll);
    }

    let total_sum = rolls_sum + modifier;

    // Critical rule determinations
    let is_critical_success = if dice_count == 1 && die_faces == 20 {
        individual_rolls[0] == 20
    } else if dice_count == 1 && die_faces == 100 {
        individual_rolls[0] <= 5
    } else if dice_count == 2 && die_faces == 6 {
        rolls_sum == 12
    } else {
        false
    };

    let is_critical_failure = if dice_count == 1 && die_faces == 20 {
        individual_rolls[0] == 1
    } else if dice_count == 1 && die_faces == 100 {
        individual_rolls[0] >= 96
    } else if dice_count == 2 && die_faces == 6 {
        rolls_sum == 2
    } else {
        false
    };

    let dc_check = target_dc.map(|dc| DcCheckResult {
        target_dc: dc,
        passed: if is_critical_success {
            true
        } else if is_critical_failure {
            false
        } else {
            total_sum >= dc
        },
        margin: total_sum - dc,
    });

    Ok(DiceRollResult {
        formula: clean,
        dice_count,
        die_faces,
        modifier,
        individual_rolls,
        sum: total_sum,
        is_critical_success,
        is_critical_failure,
        dc_check,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dice_parser_simple() {
        let res = roll_dice("1d20", None).unwrap();
        assert_eq!(res.dice_count, 1);
        assert_eq!(res.die_faces, 20);
        assert_eq!(res.modifier, 0);
        assert_eq!(res.individual_rolls.len(), 1);
        assert!(res.sum >= 1 && res.sum <= 20);
    }

    #[test]
    fn test_dice_parser_with_modifier() {
        let res = roll_dice("2d6+4", None).unwrap();
        assert_eq!(res.dice_count, 2);
        assert_eq!(res.die_faces, 6);
        assert_eq!(res.modifier, 4);
        assert!(res.sum >= 6 && res.sum <= 16);
    }

    #[test]
    fn test_dice_parser_with_negative_modifier() {
        let res = roll_dice("3d8-2", None).unwrap();
        assert_eq!(res.dice_count, 3);
        assert_eq!(res.die_faces, 8);
        assert_eq!(res.modifier, -2);
        assert!(res.sum >= 1 && res.sum <= 22);
    }

    #[test]
    fn test_dc_check() {
        let res = roll_dice("1d20+5", Some(15)).unwrap();
        assert!(res.dc_check.is_some());
        let dc = res.dc_check.unwrap();
        assert_eq!(dc.target_dc, 15);
        assert_eq!(dc.passed, res.sum >= 15 || res.is_critical_success);
    }

    #[test]
    fn test_stage_engine_clocks_and_combat() {
        let engine = StageEngine::new();
        let state = engine.get_state();
        assert_eq!(state.clocks.len(), 2);
        assert_eq!(state.encounter.combatants.len(), 3);

        // Advance clock
        engine.set_clock_progress("clock_1", 4);
        let updated = engine.get_state();
        let clock = updated.clocks.iter().find(|c| c.id == "clock_1").unwrap();
        assert_eq!(clock.current, 4);

        // Start encounter
        engine.start_encounter();
        let combat_st = engine.get_state();
        assert!(combat_st.encounter.is_active);
        // Ayu has highest initiative (19), so she should be first
        assert_eq!(combat_st.encounter.combatants[0].name, "Ayu Ikue");

        // Next turn
        engine.next_turn();
        let turn2 = engine.get_state();
        assert_eq!(turn2.encounter.current_turn_index, 1);
        assert_eq!(turn2.encounter.combatants[1].name, "Hiroki");

        // Damage calculation
        engine.apply_combatant_delta("comb_enemy_1", -10, 5);
        let dmg_st = engine.get_state();
        let enemy = dmg_st.encounter.combatants.iter().find(|c| c.id == "comb_enemy_1").unwrap();
        assert_eq!(enemy.hp, 18);
        assert_eq!(enemy.stress, 5);
    }
}
