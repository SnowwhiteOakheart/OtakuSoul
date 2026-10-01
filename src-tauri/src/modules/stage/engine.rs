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
        let lang = crate::modules::content_lang::ContentLang::current();
        let initial_clocks = vec![
            CampaignClock {
                id: "clock_1".to_string(),
                name: lang
                    .pick(
                        "Aufmerksamkeit der Wachen",
                        "The guards' attention",
                        "Внимание стражи",
                    )
                    .to_string(),
                current: 2,
                max: 6,
                clock_type: "danger".to_string(),
            },
            CampaignClock {
                id: "clock_2".to_string(),
                name: lang
                    .pick(
                        "Ritual-Vollendung",
                        "Ritual completion",
                        "Завершение ритуала",
                    )
                    .to_string(),
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
                    name: lang
                        .pick("Verführerische Aura", "Alluring aura", "Чарующая аура")
                        .to_string(),
                    rounds_remaining: 3,
                }],
            },
            Combatant {
                id: "comb_enemy_1".to_string(),
                name: lang
                    .pick("Schattenpirscher", "Shadow stalker", "Теневой охотник")
                    .to_string(),
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
            title: lang.pick("Die verlassene Zuflucht", "The abandoned sanctuary", "Заброшенное убежище").to_string(),
            description: lang.pick("Ein altes Sanktum voller arkaner Relikte und verborgener Gefahren.", "An ancient sanctum full of arcane relics and hidden dangers.", "Древнее святилище, полное тайных реликвий и скрытых опасностей.").to_string(),
            world_context: lang.pick("In den Tiefen einer vergessenen Bastion sucht ihr nach Antworten.", "Deep inside a forgotten bastion, you search for answers.", "В глубинах забытого бастиона вы ищете ответы.").to_string(),
            starting_location: lang.pick("Alte Bibliothek des Ordens", "The order's old library", "Старая библиотека ордена").to_string(),
            time_of_day: lang.pick("Dämmerung", "Dusk", "Сумерки").to_string(),
            opening_narration: lang.pick("Das Portal schließt sich leise hinter euch. Staub tanzt in den verblassenden Lichtstrahlen. Vor euch erstrecken sich endlose Regale uralter Schriften.", "The portal closes quietly behind you. Dust dances in the fading beams of light. Endless shelves of ancient writings stretch out before you.", "Портал тихо закрывается за вами. Пыль танцует в угасающих лучах света. Перед вами тянутся бесконечные полки древних свитков.").to_string(),
            first_message: "".to_string(),
            party: vec!["Ayu Ikue".to_string()],
            gm_tone: "Epic Fantasy".to_string(),
            narrator_style: lang.pick("Atmosphärisch und detailliert.", "Atmospheric and detailed.", "Атмосферно и подробно.").to_string(),
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
                title: lang
                    .pick(
                        "Das Geheimnis des Ordens",
                        "The order's secret",
                        "Тайна ордена",
                    )
                    .to_string(),
                description: lang
                    .pick(
                        "Finde heraus, warum die Bibliothek einst versiegelt wurde.",
                        "Find out why the library was once sealed.",
                        "Узнай, почему библиотеку когда-то запечатали.",
                    )
                    .to_string(),
                stage: 1,
                max_stage: 3,
                is_revealed: true,
                is_resolved: false,
            }],
            inventory: vec![
                InventoryItem {
                    id: "item_1".to_string(),
                    name: lang
                        .pick("Heiltrank", "Healing potion", "Лечебное зелье")
                        .to_string(),
                    description: lang
                        .pick(
                            "Stellt 25 HP wieder her.",
                            "Restores 25 HP.",
                            "Восстанавливает 25 HP.",
                        )
                        .to_string(),
                    quantity: 2,
                    item_type: "consumable".to_string(),
                    hp_restore: 25,
                    stress_restore: 0,
                    clears_condition: None,
                },
                InventoryItem {
                    id: "item_2".to_string(),
                    name: lang
                        .pick("Messing-Schlüssel", "Brass key", "Латунный ключ")
                        .to_string(),
                    description: lang
                        .pick(
                            "Ein verzierter Schlüssel mit Sonnensymbol.",
                            "An ornate key with a sun emblem.",
                            "Узорный ключ с символом солнца.",
                        )
                        .to_string(),
                    quantity: 1,
                    item_type: "key".to_string(),
                    hp_restore: 0,
                    stress_restore: 0,
                    clears_condition: None,
                },
            ],
            objectives: vec![CampaignObjective {
                id: "objective_1".to_string(),
                title: lang
                    .pick(
                        "Das Grimoire untersuchen",
                        "Examine the grimoire",
                        "Изучить гримуар",
                    )
                    .to_string(),
                description: lang
                    .pick(
                        "Finde heraus, was die Dimensionsrisse verursacht.",
                        "Find out what causes the dimensional rifts.",
                        "Узнай, что вызывает разломы измерений.",
                    )
                    .to_string(),
                current: 0,
                max: 3,
                status: "active".to_string(),
            }],
            relationships: vec![StageRelationship {
                subject: "Ayu Ikue".to_string(),
                target: "Hiroki".to_string(),
                affinity: 10,
                tags: vec![lang.pick("Gefährtin", "Companion", "Спутница").to_string()],
                role_view: lang
                    .pick("Vertrauter Verbündeter", "Trusted ally", "Верный союзник")
                    .to_string(),
                last_shift_reason: String::new(),
            }],
            consequence_ledger: Vec::new(),
            chat_log: vec![initial_msg],
            pending_choices: vec![
                TaggedChoice {
                    text: lang
                        .pick(
                            "Das leuchtende Buch auf dem Lesepult untersuchen",
                            "Examine the glowing book on the lectern",
                            "Осмотреть светящуюся книгу на пюпитре",
                        )
                        .to_string(),
                    badge: Some(
                        lang.pick(
                            "Wahrnehmung (DC 13)",
                            "Perception (DC 13)",
                            "Восприятие (DC 13)",
                        )
                        .to_string(),
                    ),
                    action_type: "do".to_string(),
                },
                TaggedChoice {
                    text: lang
                        .pick(
                            "Ayu fragen, ob sie diese Schriftzeichen entziffern kann",
                            "Ask Ayu whether she can decipher these runes",
                            "Спросить Аю, может ли она расшифровать эти знаки",
                        )
                        .to_string(),
                    badge: None,
                    action_type: "say".to_string(),
                },
                TaggedChoice {
                    text: lang
                        .pick(
                            "Die Tür im hinteren Bereich leise überprüfen",
                            "Quietly check the door at the back",
                            "Тихо проверить дверь в глубине зала",
                        )
                        .to_string(),
                    badge: Some(
                        lang.pick("Heimlichkeit", "Stealth", "Скрытность")
                            .to_string(),
                    ),
                    action_type: "do".to_string(),
                },
            ],
            current_turn_actor: "PLAYER".to_string(),
            current_bg: None,
            private_knowledge: HashMap::new(),
            history_summaries: HashMap::new(),
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
        let lang = crate::modules::content_lang::ContentLang::current();
        let mut st = self.state.write();
        ensure_party_vitals(&mut st);
        let mut rng = rand::rng();
        if !st
            .combat
            .combatants
            .iter()
            .any(|c| c.role != "player" && c.role != "companion")
        {
            st.combat.combatants.push(Combatant {
                id: "enemy_1".to_string(),
                name: lang
                    .pick("Unbekannter Gegner", "Unknown enemy", "Неизвестный враг")
                    .to_string(),
                role: "enemy".to_string(),
                hp: 20,
                max_hp: 20,
                stress: 0,
                max_stress: 0,
                initiative: 0,
                conditions: Vec::new(),
            });
        }
        for combatant in st
            .combat
            .combatants
            .iter_mut()
            .filter(|c| c.initiative == 0)
        {
            combatant.initiative = rng.random_range(1..=20);
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
            .unwrap_or_else(|| lang.pick("Niemand", "Nobody", "Никто").to_string());
        st.combat.combat_log.push(lang.fill(
            "Kampf gestartet! Runde 1 – {} ist am Zug.",
            "Combat started! Round 1 – {}'s turn.",
            "Бой начался! Раунд 1 – ходит {}.",
            &[&active_name],
        ));
    }

    pub fn end_encounter(&self) {
        let lang = crate::modules::content_lang::ContentLang::current();
        let mut st = self.state.write();
        st.combat.is_active = false;
        remove_enemies(&mut st);
        st.combat.combat_log.push(
            lang.pick(
                "Kampf beendet. Alle Einheiten entspannen sich.",
                "Combat over. Everyone relaxes.",
                "Бой окончен. Все расслабляются.",
            )
            .to_string(),
        );
    }

    pub fn next_turn(&self) {
        let lang = crate::modules::content_lang::ContentLang::current();
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
            st.combat.combat_log.push(lang.fill(
                "--- Neue Runde: Runde {} ---",
                "--- New round: round {} ---",
                "--- Новый раунд: раунд {} ---",
                &[&round_num],
            ));
        }

        let active_name = st.combat.combatants[st.combat.current_turn_index]
            .name
            .clone();
        st.combat.combat_log.push(lang.fill(
            "{} ist am Zug.",
            "{}'s turn.",
            "Ходит {}.",
            &[&active_name],
        ));
    }

    pub fn apply_combatant_delta(&self, combatant_id: &str, hp_delta: i32, stress_delta: i32) {
        let lang = crate::modules::content_lang::ContentLang::current();
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
                lang.fill(
                    "{} erleidet {} Schaden (HP: {}/{})",
                    "{} takes {} damage (HP: {}/{})",
                    "{} получает {} урона (HP: {}/{})",
                    &[&c.name, &hp_delta.abs(), &c.hp, &c.max_hp],
                )
            } else if hp_delta > 0 {
                lang.fill(
                    "{} wird um {} HP geheilt (HP: {}/{})",
                    "{} heals {} HP (HP: {}/{})",
                    "{} восстанавливает {} HP (HP: {}/{})",
                    &[&c.name, &hp_delta, &c.hp, &c.max_hp],
                )
            } else {
                lang.fill(
                    "{} Stress verändert um {} (Stress: {}/{})",
                    "{} stress changes by {} (stress: {}/{})",
                    "Стресс {} меняется на {} (стресс: {}/{})",
                    &[&c.name, &stress_delta, &c.stress, &c.max_stress],
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
        let lang = crate::modules::content_lang::ContentLang::current();
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
            Some(lang.fill(
                "{} erhält Zustand: {} ({} Runden)",
                "{} gains condition: {} ({} rounds)",
                "{} получает состояние: {} ({} раундов)",
                &[&c_name, &name, &rounds],
            ))
        } else {
            None
        };

        if let Some(msg) = log_msg {
            st.combat.combat_log.push(msg);
        }
    }

    pub fn delay_turn(&self) -> Result<SceneState, String> {
        let lang = crate::modules::content_lang::ContentLang::current();
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
        st.combat.combat_log.push(lang.fill(
            "{} verschiebt den Zug. {} handelt zuerst.",
            "{} delays their turn. {} acts first.",
            "{} откладывает ход. {} действует первым.",
            &[&player_name, &next_name],
        ));
        Ok(st.clone())
    }

    pub fn use_inventory_item(&self, scene_id: &str, item_id: &str) -> Result<SceneState, String> {
        let lang = crate::modules::content_lang::ContentLang::current();
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
            sender_name: lang.pick("Inventar", "Inventory", "Инвентарь").to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content: lang.fill(
                "{} wurde benutzt.",
                "{} was used.",
                "Использовано: {}.",
                &[&item.name],
            ),
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
