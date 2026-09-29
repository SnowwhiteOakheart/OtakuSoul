//! `StageEngine`: holds the active scene and applies game master plans to it.

use super::*;

pub struct StageEngine {
    state: RwLock<SceneState>,
    snapshots: RwLock<HashMap<String, VecDeque<SceneState>>>,
}

impl Default for StageEngine {
    fn default() -> Self {
        Self::new()
    }
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

        let encounter = EncounterState {
            combatants: initial_combatants,
            ..Default::default()
        };

        let initial_def = SceneDefinition {
            id: "default_scene".to_string(),
            title: "Die verlassene Zuflucht".to_string(),
            description: "Ein altes Sanktum voller arkaner Relikte und verborgener Gefahren.".to_string(),
            world_context: "In den Tiefen einer vergessenen Bastion sucht ihr nach Antworten.".to_string(),
            starting_location: "Alte Bibliothek des Ordens".to_string(),
            time_of_day: "Dämmerung".to_string(),
            opening_narration: "Das Portal schließt sich leise hinter euch. Staub tanzt in den verblassenden Lichtstrahlen. Vor euch erstrecken sich endlose Regale uralter Schriften.".to_string(),
            first_message: "".to_string(),
            party: vec!["Ayu Ikue".to_string()],
            gm_tone: "Epic Fantasy".to_string(),
            narrator_style: "Atmosphärisch und detailliert.".to_string(),
            persona: "Hiroki".to_string(),
            lorebook: Vec::new(),
            folder: "Eigene Szenen".to_string(),
            lock_bg: false,
            disable_ambient: false,
            solo_mode: false,
            max_actor_depth: 3,
            dice_rolls_enabled: true,
            starting_bg: "".to_string(),
            starting_ambient: "None".to_string(),
            created_at: Utc::now().to_rfc3339(),
            last_played: Some(Utc::now().to_rfc3339()),
        };

        let initial_msg = SceneTurnMessage {
            id: "msg_init".to_string(),
            sender_id: "gm".to_string(),
            sender_name: "Game Master".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content: initial_def.opening_narration.clone(),
            turn_mode: "do".to_string(),
            whisper_target: None,
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
        };

        let state = SceneState {
            definition: initial_def,
            world: WorldState::default(),
            clocks: initial_clocks,
            combat: encounter,
            arcs: vec![StoryArc {
                id: "arc_1".to_string(),
                title: "Das Geheimnis des Ordens".to_string(),
                description: "Finde heraus, warum die Bibliothek einst versiegelt wurde."
                    .to_string(),
                stage: 1,
                max_stage: 3,
                is_revealed: true,
                is_resolved: false,
            }],
            inventory: vec![
                InventoryItem {
                    id: "item_1".to_string(),
                    name: "Heiltrank".to_string(),
                    description: "Stellt 25 HP wieder her.".to_string(),
                    quantity: 2,
                    item_type: "consumable".to_string(),
                    hp_restore: 25,
                    stress_restore: 0,
                    clears_condition: None,
                },
                InventoryItem {
                    id: "item_2".to_string(),
                    name: "Messing-Schlüssel".to_string(),
                    description: "Ein verzierter Schlüssel mit Sonnensymbol.".to_string(),
                    quantity: 1,
                    item_type: "key".to_string(),
                    hp_restore: 0,
                    stress_restore: 0,
                    clears_condition: None,
                },
            ],
            objectives: vec![CampaignObjective {
                id: "objective_1".to_string(),
                title: "Das Grimoire untersuchen".to_string(),
                description: "Finde heraus, was die Dimensionsrisse verursacht.".to_string(),
                current: 0,
                max: 3,
                status: "active".to_string(),
            }],
            relationships: vec![StageRelationship {
                subject: "Ayu Ikue".to_string(),
                target: "Hiroki".to_string(),
                affinity: 10,
                tags: vec!["Gefährtin".to_string()],
                role_view: "Vertrauter Verbündeter".to_string(),
                last_shift_reason: String::new(),
            }],
            consequence_ledger: Vec::new(),
            chat_log: vec![initial_msg],
            pending_choices: vec![
                TaggedChoice {
                    text: "Das leuchtende Buch auf dem Lesepult untersuchen".to_string(),
                    badge: Some("Wahrnehmung (DC 13)".to_string()),
                    action_type: "do".to_string(),
                },
                TaggedChoice {
                    text: "Ayu fragen, ob sie diese Schriftzeichen entziffern kann".to_string(),
                    badge: None,
                    action_type: "say".to_string(),
                },
                TaggedChoice {
                    text: "Die Tür im hinteren Bereich leise überprüfen".to_string(),
                    badge: Some("Heimlichkeit".to_string()),
                    action_type: "do".to_string(),
                },
            ],
            current_turn_actor: "PLAYER".to_string(),
            current_bg: None,
        };

        Self {
            state: RwLock::new(state),
            snapshots: RwLock::new(HashMap::new()),
        }
    }

    pub fn get_state(&self) -> SceneState {
        self.state.read().clone()
    }

    pub fn set_state(&self, new_state: SceneState) {
        let mut st = self.state.write();
        *st = new_state;
    }

    pub fn update_world(&self, new_world: WorldState) {
        let mut st = self.state.write();
        st.world = new_world;
    }

    pub fn set_clock_progress(&self, clock_id: &str, progress: u32) {
        let mut st = self.state.write();
        if let Some(clock) = st.clocks.iter_mut().find(|c| c.id == clock_id) {
            clock.current = progress.min(clock.max);
        }
    }

    pub fn add_clock(&self, clock: CampaignClock) {
        let mut st = self.state.write();
        st.clocks.retain(|c| c.id != clock.id);
        st.clocks.push(clock);
    }

    pub fn delete_clock(&self, clock_id: &str) {
        let mut st = self.state.write();
        st.clocks.retain(|c| c.id != clock_id);
    }

    // --- Encounter Lifecycle ---
    pub fn start_encounter(&self) {
        let mut st = self.state.write();
        if st.combat.combatants.is_empty() {
            let mut rng = rand::rng();
            let player_name = if st.definition.persona.trim().is_empty() {
                "Spieler".to_string()
            } else {
                st.definition.persona.clone()
            };
            st.combat.combatants.push(Combatant {
                id: "player".to_string(),
                name: player_name,
                role: "player".to_string(),
                hp: 50,
                max_hp: 50,
                stress: 0,
                max_stress: 100,
                initiative: rng.random_range(1..=20),
                conditions: Vec::new(),
            });
            let party = st.definition.party.clone();
            for (index, name) in party.into_iter().enumerate() {
                st.combat.combatants.push(Combatant {
                    id: format!("companion_{}", index),
                    name,
                    role: "companion".to_string(),
                    hp: 40,
                    max_hp: 40,
                    stress: 0,
                    max_stress: 100,
                    initiative: rng.random_range(1..=20),
                    conditions: Vec::new(),
                });
            }
            st.combat.combatants.push(Combatant {
                id: "enemy_1".to_string(),
                name: "Unbekannter Gegner".to_string(),
                role: "enemy".to_string(),
                hp: 20,
                max_hp: 20,
                stress: 0,
                max_stress: 0,
                initiative: rng.random_range(1..=20),
                conditions: Vec::new(),
            });
        }
        st.combat.is_active = true;
        st.combat.round = 1;
        st.combat.current_turn_index = 0;
        st.combat
            .combatants
            .sort_by_key(|c| std::cmp::Reverse(c.initiative));
        let active_name = st
            .combat
            .combatants
            .first()
            .map(|c| c.name.clone())
            .unwrap_or_else(|| "Niemand".to_string());
        st.combat.combat_log.push(format!(
            "Kampf gestartet! Runde 1 – {} ist am Zug.",
            active_name
        ));
    }

    pub fn end_encounter(&self) {
        let mut st = self.state.write();
        st.combat.is_active = false;
        st.combat
            .combat_log
            .push("Kampf beendet. Alle Einheiten entspannen sich.".to_string());
    }

    pub fn next_turn(&self) {
        let mut st = self.state.write();
        if !st.combat.is_active || st.combat.combatants.is_empty() {
            return;
        }

        let num_combatants = st.combat.combatants.len();
        st.combat.current_turn_index += 1;

        if st.combat.current_turn_index >= num_combatants {
            st.combat.current_turn_index = 0;
            st.combat.round += 1;

            // Tick down conditions
            for c in st.combat.combatants.iter_mut() {
                c.conditions.retain_mut(|cond| {
                    if cond.rounds_remaining > 0 {
                        cond.rounds_remaining -= 1;
                    }
                    cond.rounds_remaining > 0
                });
            }

            let round_num = st.combat.round;
            st.combat
                .combat_log
                .push(format!("--- Neue Runde: Runde {} ---", round_num));
        }

        let active_name = st.combat.combatants[st.combat.current_turn_index]
            .name
            .clone();
        st.combat
            .combat_log
            .push(format!("{} ist am Zug.", active_name));
    }

    pub fn apply_combatant_delta(&self, combatant_id: &str, hp_delta: i32, stress_delta: i32) {
        let mut st = self.state.write();
        let log_msg = if let Some(c) = st
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.id == combatant_id)
        {
            c.hp = (c.hp + hp_delta).clamp(0, c.max_hp);
            c.stress = (c.stress + stress_delta).clamp(0, c.max_stress);

            let msg = if hp_delta < 0 {
                format!(
                    "{} erleidet {} Schaden (HP: {}/{})",
                    c.name,
                    hp_delta.abs(),
                    c.hp,
                    c.max_hp
                )
            } else if hp_delta > 0 {
                format!(
                    "{} wird um {} HP geheilt (HP: {}/{})",
                    c.name, hp_delta, c.hp, c.max_hp
                )
            } else {
                format!(
                    "{} Stress verändert um {} (Stress: {}/{})",
                    c.name, stress_delta, c.stress, c.max_stress
                )
            };
            Some(msg)
        } else {
            None
        };

        if let Some(msg) = log_msg {
            st.combat.combat_log.push(msg);
        }
    }

    pub fn add_condition(&self, combatant_id: &str, condition: CombatCondition) {
        let mut st = self.state.write();
        let log_msg = if let Some(c) = st
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.id == combatant_id)
        {
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
            st.combat.combat_log.push(msg);
        }
    }

    pub fn delay_turn(&self) -> Result<SceneState, String> {
        let mut st = self.state.write();
        if !st.combat.is_active || st.combat.combatants.len() < 2 {
            return Err(crate::err!("backend.stage.noEncounter"));
        }
        let index = st.combat.current_turn_index;
        if index >= st.combat.combatants.len() || st.combat.combatants[index].role != "player" {
            return Err(crate::err!("backend.stage.delayOwnTurn"));
        }
        if index + 1 >= st.combat.combatants.len() {
            return Err(crate::err!("backend.stage.delayLastTurn"));
        }
        let player_name = st.combat.combatants[index].name.clone();
        st.combat.combatants.swap(index, index + 1);
        let next_name = st.combat.combatants[index].name.clone();
        st.current_turn_actor = next_name.clone();
        st.combat.combat_log.push(format!(
            "{} verschiebt den Zug. {} handelt zuerst.",
            player_name, next_name
        ));
        Ok(st.clone())
    }

    pub fn use_inventory_item(&self, scene_id: &str, item_id: &str) -> Result<SceneState, String> {
        let current = self.get_state();
        let mut st = if current.definition.id == scene_id {
            current
        } else {
            load_scene_by_id(scene_id)?
        };
        self.push_snapshot(scene_id, st.clone());

        let item_index = st
            .inventory
            .iter()
            .position(|item| item.id == item_id)
            .ok_or_else(|| crate::err!("backend.stage.itemMissing"))?;
        let item = st.inventory[item_index].clone();
        if item.item_type != "consumable" {
            return Err(crate::err!("backend.stage.itemNotConsumable"));
        }

        let fallback_name = item.name.to_lowercase();
        let hp_restore = if item.hp_restore != 0 {
            item.hp_restore
        } else if fallback_name.contains("heil") || fallback_name.contains("trank") {
            25
        } else if fallback_name.contains("bandage") {
            10
        } else {
            0
        };
        let stress_restore = if item.stress_restore != 0 {
            item.stress_restore
        } else if fallback_name.contains("brot") || fallback_name.contains("tee") {
            10
        } else {
            0
        };

        let player = st
            .combat
            .combatants
            .iter_mut()
            .find(|c| c.role == "player")
            .ok_or_else(|| crate::err!("backend.stage.noPlayer"))?;
        let hp_before = player.hp;
        let stress_before = player.stress;
        player.hp = (player.hp + hp_restore).clamp(0, player.max_hp);
        player.stress = (player.stress - stress_restore).clamp(0, player.max_stress);
        let hp_recovered = player.hp - hp_before;
        let stress_recovered = stress_before - player.stress;
        let cleared_condition = item.clears_condition.as_ref().and_then(|condition| {
            let before = player.conditions.len();
            player
                .conditions
                .retain(|entry| !entry.name.eq_ignore_ascii_case(condition));
            (player.conditions.len() < before).then(|| condition.clone())
        });

        if st.inventory[item_index].quantity > 1 {
            st.inventory[item_index].quantity -= 1;
        } else {
            st.inventory.remove(item_index);
        }

        st.chat_log.push(SceneTurnMessage {
            id: format!("msg_{}", Utc::now().timestamp_millis()),
            sender_id: "system".to_string(),
            sender_name: "Inventar".to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content: format!("{} wurde benutzt.", item.name),
            turn_mode: "do".to_string(),
            whisper_target: None,
            event_card: Some(StageEventCard::ItemUse {
                item_name: item.name,
                hp_recovered,
                stress_recovered,
                cleared_condition,
            }),
            timestamp: Utc::now().timestamp() as u64,
        });

        self.set_state(st.clone());
        save_scene_state(&st)?;
        Ok(st)
    }

    // --- Snapshot & Undo ---
    pub fn push_snapshot(&self, scene_id: &str, state: SceneState) {
        let mut snaps = self.snapshots.write();
        let queue = snaps.entry(scene_id.to_string()).or_default();
        queue.push_back(state);
        if queue.len() > 10 {
            queue.pop_front();
        }
    }

    pub fn undo_turn(&self, scene_id: &str) -> Result<SceneState, String> {
        let mut snaps = self.snapshots.write();
        if let Some(queue) = snaps.get_mut(scene_id)
            && let Some(previous_state) = queue.pop_back()
        {
            self.set_state(previous_state.clone());
            let _ = save_scene_state(&previous_state);
            return Ok(previous_state);
        }
        Err(crate::err!("backend.stage.nothingToUndo"))
    }
}
