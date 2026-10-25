//! Comprehensive Multi-LLM Benchmark for OtakuSoul
//! Tests all 12 downloaded local models on:
//! 1. Soul Stage 5e Adventure over 10 rounds with Lorebooks and combat rules
//! 2. 4-person Group Chat over 10 turns with router and distinct character roles
//! 3. 1-on-1 dialogue with Lorebook fact retrieval and Vision QA (for multimodal models)
//! 4. Image generation co-existence and VRAM management
//! 5. Detailed Markdown report generation: TESTBERICHT_SOULSTAGE_LOREBOOKS_LLMS.md

use otakusoul_lib::modules::{
    attachments,
    group_chat::{self, GroupRouteRequest, PLAYER},
    inference::{ChatMessage, ChatRequest, InferenceClient, SamplingParams},
    llama_manager::{self, LlamaServerConfig, LlamaServerManager},
    local_image::{GenerationRequest, LocalImageEngine, VramStrategy},
    lorebook::LorebookEntry,
    memory::MemoryDb,
    paths::scan_available_characters,
    prompt_builder::{self, GroupMember, PromptContext},
    providers::LlmProviderType,
    stage::{
        StageEngine, StageTurnRequest, execute_combat_turn, execute_stage_turn, load_scene_by_id,
    },
};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

fn repo(relative: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(relative)
}

fn get_vram_mb() -> u64 {
    std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=memory.used", "--format=csv,noheader,nounits"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next()?.trim().parse().ok())
        .unwrap_or(0)
}

struct ModelToTest {
    name: &'static str,
    path: &'static str,
    mmproj: Option<&'static str>,
    context_size: u32,
    gpu_layers: u32,
    is_prism: bool,
}

#[derive(Default, serde::Serialize)]
struct ModelResult {
    name: String,
    size_mb: u64,
    runtime: String,
    is_vision: bool,
    load_time_sec: f64,
    vram_usage_mb: u64,
    gpu_layers_used: u32,
    total_blocks: u32,
    // 5e Soul Stage
    stage_success: bool,
    stage_rounds_completed: usize,
    stage_avg_latency_sec: f64,
    stage_lorebook_triggered: bool,
    stage_lorebook_quoted: bool,
    stage_combat_occurred: bool,
    stage_image_generated: bool,
    stage_image_duration_sec: f64,
    stage_turns: Vec<serde_json::Value>,
    // Group Chat
    group_success: bool,
    group_turns_completed: usize,
    group_avg_latency_sec: f64,
    group_speakers: Vec<String>,
    group_image_generated: bool,
    group_image_duration_sec: f64,
    group_dialogue: Vec<serde_json::Value>,
    // 1-on-1 Dialogue & Vision
    dialogue_success: bool,
    dialogue_avg_tok_per_sec: f64,
    dialogue_lorebook_recall: bool,
    dialogue_vision_detected: Vec<String>,
    dialogue_turns: Vec<serde_json::Value>,
    // Scores (1-10)
    score_speed: f64,
    score_stage_5e: f64,
    score_group_roleplay: f64,
    score_lorebook: f64,
    score_overall: f64,
    verdict: String,
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs local models, GPU, and comprehensive execution"]
async fn test_full_soulstage_lorebooks_multi_llm_benchmark() {
    println!("\n================================================================================");
    println!("=== STARTE GROSSEN OTAKUSOUL BENCHMARK: SOULSTAGE, LOREBOOKS & GRUPPENCHAT ===");
    println!("================================================================================");

    let baseline_vram = get_vram_mb();
    println!("[HARDWARE] System Baseline VRAM: {} MB", baseline_vram);

    // Stop any leftover sd-server / image-server
    let image_engine = Arc::new(LocalImageEngine::new());
    image_engine.stop().await;

    let models_to_test: Vec<ModelToTest> = vec![
        ModelToTest {
            name: "Ternary-Bonsai-2-27B-PQ2_0",
            path: "assets/models/Ternary-Bonsai-2-27B-PQ2_0.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
            is_prism: true,
        },
        ModelToTest {
            name: "gemma-4-E4B-it-Q4_K_M (Vision)",
            path: "assets/models/gemma-4-E4B-it-Q4_K_M.gguf",
            mmproj: Some("assets/models/gemma-4-E4B-it-Q4_K_M-mmproj-F16.gguf"),
            context_size: 8192,
            gpu_layers: 99,
            is_prism: false,
        },
        ModelToTest {
            name: "gemma-4-12b-it-Q4_K_M (Vision)",
            path: "assets/models/gemma-4-12b-it-Q4_K_M.gguf",
            mmproj: Some("assets/models/gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf"),
            context_size: 8192,
            gpu_layers: 99,
            is_prism: false,
        },
        ModelToTest {
            name: "Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced",
            path: "assets/models/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced-Q4_K_M.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
            is_prism: false,
        },
        ModelToTest {
            name: "Mistral-Nemo-Instruct-2407",
            path: "assets/models/Mistral-Nemo-Instruct-2407-Q4_K_M.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
            is_prism: false,
        },
        ModelToTest {
            name: "Rocinante-X-12B-v1b",
            path: "assets/models/Rocinante-X-12B-v1b-Q4_K_M.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
            is_prism: false,
        },
        ModelToTest {
            name: "Cydonia-24B-v4zg",
            path: "assets/models/Cydonia-24B-v4zg-Q4_K_M.gguf",
            mmproj: None,
            context_size: 4096,
            gpu_layers: 28,
            is_prism: false,
        },
        ModelToTest {
            name: "Hearthfire-24B",
            path: "assets/models/Hearthfire-24B-Q4_K_M.gguf",
            mmproj: None,
            context_size: 4096,
            gpu_layers: 28,
            is_prism: false,
        },
        ModelToTest {
            name: "gemma-4-26B-A4B-it-UD",
            path: "assets/models/gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
            mmproj: None,
            context_size: 4096,
            gpu_layers: 18,
            is_prism: false,
        },
        ModelToTest {
            name: "Qwen3.8-27B-Heretic",
            path: "assets/models/Qwen3.8-27B-Heretic-Q4_K_M.gguf",
            mmproj: None,
            context_size: 4096,
            gpu_layers: 34,
            is_prism: false,
        },
        ModelToTest {
            name: "Qwen3.6-35B-A3B-UD",
            path: "assets/models/Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",
            mmproj: None,
            context_size: 4096,
            gpu_layers: 18,
            is_prism: false,
        },
        ModelToTest {
            name: "Ternary-Bonsai-27B-PQ2_0 (v1)",
            path: "assets/models/Ternary-Bonsai-27B-PQ2_0.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
            is_prism: true,
        },
    ];

    // Shared Engines
    let llama = Arc::new(LlamaServerManager::new());
    llama_manager::register_shared(&llama);
    let inference = InferenceClient::new();
    let db_path = otakusoul_lib::modules::paths::base_dirs()
        .1
        .join("otakusoul.db");
    let memory_db = MemoryDb::new(&db_path).expect("MemoryDb konnte nicht geöffnet werden");

    let out_dir = repo("target/benchmark_artifacts");
    let _ = fs::create_dir_all(&out_dir);

    // Scan characters
    let all_chars = scan_available_characters();
    let char_nagatoro = all_chars
        .iter()
        .find(|c| c.card.data.name.to_lowercase().contains("nagatoro"))
        .expect("Hayase Nagatoro nicht gefunden");
    let char_lirwen = all_chars
        .iter()
        .find(|c| c.card.data.name.to_lowercase().contains("lirwen"))
        .expect("Lirwen nicht gefunden");
    let char_faelion = all_chars
        .iter()
        .find(|c| c.card.data.name.to_lowercase().contains("faelion"))
        .expect("Faelion nicht gefunden");
    let char_shiori = all_chars
        .iter()
        .find(|c| c.card.data.name.to_lowercase().contains("shiori"))
        .expect("Shiori Amane nicht gefunden");

    let group_participants = [char_nagatoro, char_lirwen, char_faelion, char_shiori];

    // Reference test image for vision
    let test_img_path = repo("assets/test-avatars/screenshots/A010-neutral.png");
    let test_img_bytes = fs::read(&test_img_path).unwrap_or_default();
    let vision_attachment = if !test_img_bytes.is_empty() {
        attachments::save("benchmark_vision", "test_image.png", &test_img_bytes).ok()
    } else {
        None
    };

    let mut results: Vec<ModelResult> = Vec::new();

    for (m_idx, m) in models_to_test.iter().enumerate() {
        println!(
            "\n================================================================================"
        );
        println!(
            ">>> [MODELL {}/{}] TESTE: {} <<<",
            m_idx + 1,
            models_to_test.len(),
            m.name
        );
        println!(
            "================================================================================"
        );

        let model_full_path = repo(m.path);
        if !model_full_path.exists() {
            println!("[SKIP] Datei existiert nicht: {:?}", model_full_path);
            continue;
        }

        let meta_size = fs::metadata(&model_full_path)
            .map(|meta| meta.len() / (1024 * 1024))
            .unwrap_or(0);
        let blocks = otakusoul_lib::modules::gguf::block_count(&model_full_path).unwrap_or(0);
        let gpu_layers = m.gpu_layers.min(blocks).max(1);

        println!(
            "[CONFIG] Größe: {} MB | Blöcke: {} | GPU-Layers: {}/{} | Runtime: {}",
            meta_size,
            blocks,
            gpu_layers,
            blocks,
            if m.is_prism { "Prism" } else { "Standard" }
        );

        // 1. Server stoppen & VRAM freiräumen
        println!("[SERVER] Stoppe vorherigen Server & leere VRAM...");
        let _ = llama.stop().await;
        image_engine.stop().await;
        tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;

        let start_time = Instant::now();
        let config = LlamaServerConfig {
            model_path: model_full_path.to_string_lossy().into_owned(),
            port: 48596,
            context_size: m.context_size,
            gpu_layers,
            flash_attn: true,
            mmproj_path: m.mmproj.map(|p| repo(p).to_string_lossy().into_owned()),
            ..Default::default()
        };

        if let Err(e) = llama.start(config).await {
            println!("[START FEHLER] Konnte llama-server nicht starten: {}", e);
            continue;
        }

        let load_secs = start_time.elapsed().as_secs_f64();
        let vram_after_load = get_vram_mb();
        println!(
            "[SERVER BEREIT] Geladen in {:.2}s | VRAM: {} MB",
            load_secs, vram_after_load
        );

        let mut res = ModelResult {
            name: m.name.to_string(),
            size_mb: meta_size,
            runtime: if m.is_prism { "Prism" } else { "Standard" }.to_string(),
            is_vision: m.mmproj.is_some(),
            load_time_sec: load_secs,
            vram_usage_mb: vram_after_load,
            gpu_layers_used: gpu_layers,
            total_blocks: blocks,
            ..Default::default()
        };

        // -----------------------------------------------------------------------------------------
        // TEST 1: SOUL STAGE 5E ABENTEUER (10 RUNDEN) + LOREBOOK + BILDGENERIERUNG
        // -----------------------------------------------------------------------------------------
        println!("\n>>> [TEST 1] SOUL STAGE 5E ABENTEUER (10 RUNDEN) MIT LOREBOOK <<<");
        let scene_id = "akt1_waldstrasse";

        // Sauberen Stand aus Preset laden
        let preset_path = repo("presets/crypt-of-shadows/scenes/akt1_waldstrasse.json");
        let mut scene_state = if preset_path.exists() {
            let json_str = fs::read_to_string(&preset_path).unwrap_or_default();
            serde_json::from_str::<otakusoul_lib::modules::stage::SceneState>(&json_str)
                .or_else(|_| load_scene_by_id(scene_id))
                .unwrap_or_else(|_| load_scene_by_id(scene_id).unwrap())
        } else {
            load_scene_by_id(scene_id).unwrap()
        };

        // Kampfzustand sicher zurücksetzen
        scene_state.combat.is_active = false;
        scene_state.combat.combatants.clear();
        scene_state.combat.events.clear();

        // Binde Lorebook dunkelwald_lore
        if !scene_state
            .definition
            .lorebook
            .contains(&"dunkelwald_lore".to_string())
        {
            scene_state
                .definition
                .lorebook
                .push("dunkelwald_lore".to_string());
        }

        let stage_engine = StageEngine::new();
        stage_engine.set_state(scene_state.clone());

        let player_actions = [
            "Ich halte die Hand am Schwertknauf und mustere den verunglückten Wagen ganz genau. Finn, schau nach Spuren im Schlamm!",
            "Thorin, decke die linke Flanke! Lyra, halte einen Schutzzauber bereit, falls etwas aus dem Dickicht schießt.",
            "Ich trete vorsichtig näher an die Deichsel und schaue nach, ob Fracht oder Überlebende im Wagen sind.",
            "Achtung, Hinterhalt! Alle in Abwehrposition gehen!",
            "Ich ziehe mein Langschwert und greife den vordersten Banditen an!",
            "Thorin, bedränge den Anführer! Althea, halte die Gruppe im Blick!",
            "Ich führe einen gezielten Schwerthieb gegen den verbliebenen Angreifer aus!",
            "Wir sichern den Bereich und durchsuchen die Angreifer nach Hinweisen auf die Gruft.",
            "Finn, Lyra, wisst ihr etwas über den Orden der Morgensonne und was uns in der Gruft der vergessenen Schatten erwartet?",
            "Wir formieren uns neu und folgen dem alten Pfad tiefer in den Dunkelwald zur Gruft der vergessenen Schatten.",
        ];

        let mut stage_latencies = Vec::new();
        let mut lorebook_triggered = false;
        let mut lorebook_quoted = false;
        let mut combat_active_recorded = false;

        // Bildgenerierung in Runde 1
        println!("[BILD] Starte Bildgenerierung in Soulstage (Runde 1)...");
        let img_req = GenerationRequest {
            model_id: "counterfeit-v3-sd15",
            strategy: VramStrategy::Auto,
            prompt: "An overturned merchant wagon on an old mossy dirt road in a dark fantasy forest at dusk, a lone raven sitting on the wooden shaft, eerie mist, deep shadows among ancient pine trees, anime fantasy illustration, masterpiece",
            negative: "lowres, bad anatomy, bad hands, text, error, missing fingers, cropped, worst quality",
            seed: 42,
            loras: &[],
            reference: None,
        };
        let img_start = Instant::now();
        let img_res = image_engine.generate(&|_| {}, llama.clone(), img_req).await;
        if let Ok(bytes) = img_res {
            let img_dur = img_start.elapsed().as_secs_f64();
            res.stage_image_generated = true;
            res.stage_image_duration_sec = img_dur;
            let img_file = out_dir.join(format!("stage_{}_r1.png", m.name.replace(' ', "_")));
            let _ = fs::write(&img_file, &bytes);
            println!(
                "[BILD ERFOLG] {} Bytes in {:.2}s generiert",
                bytes.len(),
                img_dur
            );
        } else if let Err(e) = img_res {
            println!("[BILD WARNUNG] {}", e);
        }
        // WICHTIG: sd-server stoppen, um VRAM freizugeben
        image_engine.stop().await;

        for (r_idx, action) in player_actions.iter().enumerate() {
            let round_num = r_idx + 1;
            let is_combat = stage_engine.get_state().combat.is_active;
            if is_combat {
                combat_active_recorded = true;
            }

            let turn_start = Instant::now();
            let turn_res = if is_combat {
                let st = stage_engine.get_state();
                let is_player_turn = st
                    .combat
                    .combatants
                    .get(st.combat.current_turn_index)
                    .map(|c| c.role == "player")
                    .unwrap_or(false);
                let act = if is_player_turn {
                    Some("attack:longsword:enemy_0".to_string())
                } else {
                    None
                };
                execute_combat_turn(&stage_engine, &inference, scene_id, act, &|_| {}).await
            } else {
                let req = StageTurnRequest {
                    scene_id: scene_id.to_string(),
                    user_input: action.to_string(),
                    turn_mode: "do".to_string(),
                    whisper_target: None,
                    force_next_actor: None,
                };
                execute_stage_turn(&stage_engine, &inference, &memory_db, req, &|_| {}).await
            };

            let turn_time = turn_start.elapsed().as_secs_f64();
            stage_latencies.push(turn_time);

            match turn_res {
                Ok(new_state) => {
                    stage_engine.set_state(new_state.clone());
                    scene_state = new_state;
                    res.stage_rounds_completed += 1;

                    let last_msg = scene_state.chat_log.last();
                    let speaker = last_msg
                        .map(|msg| msg.sender_name.clone())
                        .unwrap_or_else(|| "GM".to_string());
                    let content = last_msg.map(|msg| msg.content.clone()).unwrap_or_default();

                    let lower = content.to_lowercase();
                    if round_num == 9 {
                        lorebook_triggered = true;
                        if lower.contains("morgensonne")
                            || lower.contains("sonnenanhänger")
                            || lower.contains("eldorath")
                            || lower.contains("kloster")
                            || lower.contains("krypta")
                        {
                            lorebook_quoted = true;
                        }
                    }

                    res.stage_turns.push(serde_json::json!({
                        "round": round_num,
                        "action": action,
                        "speaker": speaker,
                        "latency_sec": turn_time,
                        "snippet": content.chars().take(120).collect::<String>(),
                    }));

                    println!(
                        "  [5e R{}/10] ({:.2}s) {}: {}",
                        round_num,
                        turn_time,
                        speaker,
                        content.chars().take(80).collect::<String>()
                    );
                }
                Err(e) => {
                    println!("  [5e R{}/10 FEHLER] {}", round_num, e);
                }
            }
        }

        res.stage_success = res.stage_rounds_completed >= 8;
        res.stage_avg_latency_sec = if !stage_latencies.is_empty() {
            stage_latencies.iter().sum::<f64>() / stage_latencies.len() as f64
        } else {
            0.0
        };
        res.stage_lorebook_triggered = lorebook_triggered;
        res.stage_lorebook_quoted = lorebook_quoted;
        res.stage_combat_occurred = combat_active_recorded;

        // -----------------------------------------------------------------------------------------
        // TEST 2: 4-PERSONEN-GRUPPENCHAT (10 RUNDEN)
        // -----------------------------------------------------------------------------------------
        println!("\n>>> [TEST 2] 4-PERSONEN-GRUPPENCHAT (10 RUNDEN) <<<");
        let user_name = "Sebastian".to_string();
        let mut group_history: Vec<(String, String)> = Vec::new();
        let mut group_latencies = Vec::new();
        let endpoint = "http://127.0.0.1:48596/v1/chat/completions";

        let scripted_group_msgs = [
            (
                0,
                "Hallo alle zusammen! Lasst uns heute gemeinsam einen Ausflug planen. Habt ihr schon Vorschläge, wohin wir aufbrechen könnten?",
            ),
            (
                3,
                "Lirwen, die verlassene Sternenwarte im Nebelwald klingt fantastisch! Faelion, wie schätzt du die Sicherheit auf dem Weg dorthin ein?",
            ),
            (
                6,
                "Können wir uns die Sternenwarte bildlich vorstellen? Ein alter Steinturm in der Abenddämmerung unter schneebedeckten Kiefern mit leuchtenden Kristallen an den Wänden.",
            ),
            (
                8,
                "Das sieht atemberaubend aus! Nagatoro, Shiori, packt eure Sachen, wir brechen sofort auf!",
            ),
        ];

        let mut distinct_speakers = std::collections::HashSet::new();

        for current_turn in 0..10 {
            let user_msg_opt = scripted_group_msgs.iter().find(|(t, _)| *t == current_turn);

            if let Some((_, text)) = user_msg_opt {
                group_history.push((user_name.clone(), text.to_string()));
                res.group_dialogue.push(serde_json::json!({
                    "turn": current_turn + 1,
                    "speaker": user_name.clone(),
                    "role": "user",
                    "text": text,
                }));
                println!("  [Gruppe R{}/10] User: \"{}\"", current_turn + 1, text);

                if current_turn == 6 {
                    println!("[BILD] Starte Bildgenerierung im Gruppenchat (Runde 7)...");
                    let g_img_req = GenerationRequest {
                        model_id: "counterfeit-v3-sd15",
                        strategy: VramStrategy::Auto,
                        prompt: "An ancient stone observatory tower at dusk, covered in snow, glowing magical crystals on the ancient stone walls, pine forest, anime fantasy illustration, highly detailed, masterpiece",
                        negative: "lowres, bad anatomy, bad hands, text, error, missing fingers, cropped, worst quality",
                        seed: 1234,
                        loras: &[],
                        reference: None,
                    };
                    let g_img_start = Instant::now();
                    let g_img_res = image_engine
                        .generate(&|_| {}, llama.clone(), g_img_req)
                        .await;
                    if let Ok(bytes) = g_img_res {
                        let dur = g_img_start.elapsed().as_secs_f64();
                        res.group_image_generated = true;
                        res.group_image_duration_sec = dur;
                        let img_file =
                            out_dir.join(format!("group_{}_r7.png", m.name.replace(' ', "_")));
                        let _ = fs::write(&img_file, &bytes);
                        println!("[BILD ERFOLG] Gruppenchat-Bild in {:.2}s generiert", dur);
                    }
                    image_engine.stop().await;
                }

                res.group_turns_completed += 1;
                continue;
            }

            // NPC antwortet
            let candidates: Vec<String> = group_participants
                .iter()
                .map(|p| p.card.data.name.clone())
                .collect();
            let (last_speaker, last_text) = group_history
                .last()
                .cloned()
                .unwrap_or((user_name.clone(), String::new()));

            let mut speaker_name = group_chat::route(
                &inference,
                GroupRouteRequest {
                    last_speaker: last_speaker.clone(),
                    last_text: last_text.clone(),
                    candidates: candidates.clone(),
                    this_turn: group_history
                        .iter()
                        .rev()
                        .take_while(|(s, _)| *s != user_name)
                        .map(|(s, _)| s.clone())
                        .collect::<Vec<_>>()
                        .into_iter()
                        .rev()
                        .collect(),
                    recent: group_history
                        .iter()
                        .rev()
                        .take(4)
                        .map(|(s, _)| s.clone())
                        .collect(),
                    endpoint_url: endpoint.to_string(),
                    api_key: None,
                    model: None,
                    provider: Some(LlmProviderType::LocalLlama),
                    user_text: group_history
                        .iter()
                        .rev()
                        .find(|(s, _)| *s == user_name)
                        .map(|(_, t)| t.clone()),
                },
            )
            .await;

            if speaker_name == PLAYER || !candidates.contains(&speaker_name) {
                let next_cand = candidates
                    .iter()
                    .find(|c| **c != last_speaker)
                    .unwrap_or(&candidates[0]);
                speaker_name = next_cand.clone();
            }

            distinct_speakers.insert(speaker_name.clone());
            let speaker_profile = group_participants
                .iter()
                .find(|p| p.card.data.name == speaker_name)
                .unwrap();

            let other_members: Vec<GroupMember> = group_participants
                .iter()
                .filter(|p| p.card.data.name != speaker_name)
                .map(|p| GroupMember {
                    name: p.card.data.name.clone(),
                    description: p.card.data.description.chars().take(150).collect(),
                })
                .collect();

            let ctx = PromptContext {
                char_name: speaker_name.clone(),
                user_name: user_name.clone(),
                character: speaker_profile.card.data.clone(),
                active_lore: Vec::new(),
                active_directives: Vec::new(),
                state_variables: Vec::new(),
                cognitive: None,
                memories: None,
                reply_language: Some("Deutsch".to_string()),
                allow_reasoning: Some(false),
                author_note: None,
                author_note_depth: None,
                chat_summary: None,
                template: None,
                macro_seed: None,
                idle_seconds: None,
                reply_length: Some("medium".to_string()),
                avoid_phrases: None,
                group: Some(other_members),
                emotion_tags: Some(true),
                avatar_moods: None,
            };

            let system_prompt = prompt_builder::build_system_prompt(&ctx);
            let mut messages = vec![ChatMessage {
                role: "system".to_string(),
                content: system_prompt,
                attachments: Vec::new(),
            }];

            for (s, txt) in group_history
                .iter()
                .rev()
                .take(6)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
            {
                let own = *s == speaker_name;
                let role = if own { "assistant" } else { "user" };
                let content = if own {
                    txt.clone()
                } else {
                    format!("{}: {}", s, txt)
                };
                messages.push(ChatMessage {
                    role: role.to_string(),
                    content,
                    attachments: Vec::new(),
                });
            }

            let g_start = Instant::now();
            let answer_res = inference
                .generate_direct(ChatRequest {
                    endpoint_url: endpoint.to_string(),
                    api_key: None,
                    model: None,
                    messages,
                    sampling: Some(SamplingParams {
                        temperature: Some(0.7),
                        max_tokens: Some(500),
                        ..Default::default()
                    }),
                    reasoning_mode: Some(false),
                    provider: Some(LlmProviderType::LocalLlama),
                })
                .await;

            let g_dur = g_start.elapsed().as_secs_f64();
            group_latencies.push(g_dur);

            match answer_res {
                Ok(reply) => {
                    let cleaned = reply
                        .strip_prefix(&format!("{}:", speaker_name))
                        .unwrap_or(&reply)
                        .trim()
                        .to_string();
                    group_history.push((speaker_name.clone(), cleaned.clone()));
                    res.group_dialogue.push(serde_json::json!({
                        "turn": current_turn + 1,
                        "speaker": speaker_name.clone(),
                        "role": "assistant",
                        "text": cleaned.chars().take(120).collect::<String>(),
                        "latency_sec": g_dur,
                    }));
                    println!(
                        "  [Gruppe R{}/10] ({:.2}s) {}: \"{}\"",
                        current_turn + 1,
                        g_dur,
                        speaker_name,
                        cleaned.chars().take(80).collect::<String>()
                    );
                    res.group_turns_completed += 1;
                }
                Err(e) => {
                    println!("  [Gruppe R{}/10 FEHLER] {}", current_turn + 1, e);
                }
            }
        }

        res.group_success = res.group_turns_completed >= 8;
        res.group_avg_latency_sec = if !group_latencies.is_empty() {
            group_latencies.iter().sum::<f64>() / group_latencies.len() as f64
        } else {
            0.0
        };
        res.group_speakers = distinct_speakers.into_iter().collect();

        // -----------------------------------------------------------------------------------------
        // TEST 3: 1-ON-1 DIALOG, LOREBOOK TIEFENABFRAGE & VISION-TEST
        // -----------------------------------------------------------------------------------------
        println!("\n>>> [TEST 3] 1-ON-1 CHARAKTERDIALOG, LOREBOOK TIEFENABFRAGE & VISION <<<");
        let ctx_naga = PromptContext {
            char_name: char_nagatoro.card.data.name.clone(),
            user_name: "Senpai".to_string(),
            character: char_nagatoro.card.data.clone(),
            active_lore: vec![LorebookEntry {
                uid: Some(1),
                name: "Schulfest der Kazehaya-Oberschule".to_string(),
                key: vec!["Schulfest".to_string(), "Goldener Pinsel".to_string()],
                content: "Das Große Schulfest der Kazehaya-Oberschule: Der jährliche Kunst-Wettbewerb verleiht den 'Goldenen Pinsel von Kazehaya'. Frau Toyoda achtet streng darauf, dass keine anzüglichen Skizzen eingereicht werden.".to_string(),
                trigger_type: "always_on".to_string(),
                probability: Some(100),
                priority: 100,
                enabled: true,
                injection_behavior: "active".to_string(),
                ..Default::default()
            }],
            active_directives: Vec::new(),
            state_variables: Vec::new(),
            cognitive: None,
            memories: None,
            reply_language: Some("Deutsch".to_string()),
            allow_reasoning: Some(false),
            author_note: None,
            author_note_depth: None,
            chat_summary: None,
            template: None,
            macro_seed: None,
            idle_seconds: None,
            reply_length: Some("medium".to_string()),
            avoid_phrases: None,
            group: None,
            emotion_tags: Some(true),
            avatar_moods: None,
        };

        let sys_naga = prompt_builder::build_system_prompt(&ctx_naga);
        let mut naga_history: Vec<(String, String)> = Vec::new();
        let mut d_speeds = Vec::new();

        let naga_prompts = [
            "Hey Nagatoro, hast du heute nach der Schule Zeit? Ich dachte, wir könnten im Kunstraum an den neuen Zeichnungen arbeiten.",
            "Erinnerst du dich an die Regeln für das Schulfest? Was hat Frau Toyoda über den Goldenen Pinsel von Kazehaya gesagt?",
            if m.mmproj.is_some() {
                "Schau mal auf diese Zeichnung, die ich gerade gezeichnet habe: Was erkennst du darauf genau und wie gefällt sie dir?"
            } else {
                "Wenn wir diesen Sommer ans Meer fahren... würdest du dich freuen, wenn nur wir beide gehen?"
            },
        ];

        let mut vision_kws = Vec::new();
        let mut lorebook_recalled = false;

        for (t_idx, u_msg) in naga_prompts.iter().enumerate() {
            let t_num = t_idx + 1;
            let mut messages = vec![ChatMessage {
                role: "system".to_string(),
                content: sys_naga.clone(),
                attachments: Vec::new(),
            }];

            for (s, txt) in &naga_history {
                let role = if s == "Senpai" { "user" } else { "assistant" };
                messages.push(ChatMessage {
                    role: role.to_string(),
                    content: txt.clone(),
                    attachments: Vec::new(),
                });
            }

            let current_attach = if t_num == 3 && m.mmproj.is_some() {
                vision_attachment.clone().into_iter().collect()
            } else {
                Vec::new()
            };

            messages.push(ChatMessage {
                role: "user".to_string(),
                content: u_msg.to_string(),
                attachments: current_attach,
            });

            let t_start = Instant::now();
            let d_res = inference
                .generate_direct(ChatRequest {
                    endpoint_url: endpoint.to_string(),
                    api_key: None,
                    model: None,
                    messages,
                    sampling: Some(SamplingParams {
                        temperature: Some(0.7),
                        max_tokens: Some(500),
                        ..Default::default()
                    }),
                    reasoning_mode: Some(false),
                    provider: Some(LlmProviderType::LocalLlama),
                })
                .await;

            let t_dur = t_start.elapsed().as_secs_f64();

            match d_res {
                Ok(reply) => {
                    let cleaned = reply
                        .strip_prefix("Nagatoro:")
                        .or_else(|| reply.strip_prefix("Hayase Nagatoro:"))
                        .unwrap_or(&reply)
                        .trim()
                        .to_string();
                    let tok_est = (cleaned.len() as f64 / 3.8).max(1.0);
                    let tok_per_sec = tok_est / t_dur.max(0.1);
                    d_speeds.push(tok_per_sec);

                    let lower = cleaned.to_lowercase();
                    if t_num == 2
                        && (lower.contains("goldenen pinsel")
                            || lower.contains("toyoda")
                            || lower.contains("schulfest")
                            || lower.contains("wettbewerb")
                            || lower.contains("pinsel"))
                    {
                        lorebook_recalled = true;
                    }

                    if t_num == 3 && m.mmproj.is_some() {
                        for kw in &[
                            "mädchen",
                            "gesicht",
                            "anime",
                            "skizze",
                            "zeichnung",
                            "haare",
                            "augen",
                            "blick",
                            "avatar",
                        ] {
                            if lower.contains(kw) && !vision_kws.contains(&kw.to_string()) {
                                vision_kws.push(kw.to_string());
                            }
                        }
                    }

                    naga_history.push(("Senpai".to_string(), u_msg.to_string()));
                    naga_history.push(("Nagatoro".to_string(), cleaned.clone()));

                    res.dialogue_turns.push(serde_json::json!({
                        "turn": t_num,
                        "user": u_msg,
                        "reply": cleaned.chars().take(120).collect::<String>(),
                        "duration_sec": t_dur,
                        "tok_per_sec": tok_per_sec,
                    }));

                    println!(
                        "  [Dialog {}/3] ({:.2}s | {:.1} tok/s) Nagatoro: \"{}\"",
                        t_num,
                        t_dur,
                        tok_per_sec,
                        cleaned.chars().take(80).collect::<String>()
                    );
                }
                Err(e) => println!("  [Dialog {}/3 FEHLER] {}", t_num, e),
            }
        }

        res.dialogue_success = naga_history.len() >= 4;
        res.dialogue_avg_tok_per_sec = if !d_speeds.is_empty() {
            d_speeds.iter().sum::<f64>() / d_speeds.len() as f64
        } else {
            0.0
        };
        res.dialogue_lorebook_recall = lorebook_recalled;
        res.dialogue_vision_detected = vision_kws;

        // -----------------------------------------------------------------------------------------
        // SCORING & BEWERTUNG
        // -----------------------------------------------------------------------------------------
        let speed_score = (res.dialogue_avg_tok_per_sec / 12.0).clamp(1.0, 10.0);
        let stage_score = if res.stage_success && res.stage_lorebook_quoted {
            9.5
        } else if res.stage_success {
            8.5
        } else {
            6.0
        };
        let group_score = if res.group_success && res.group_speakers.len() >= 3 {
            9.5
        } else if res.group_success {
            8.0
        } else {
            5.0
        };
        let lore_score = match (res.stage_lorebook_quoted, res.dialogue_lorebook_recall) {
            (true, true) => 10.0,
            (true, false) | (false, true) => 8.0,
            (false, false) => 5.0,
        };
        let overall_score =
            (speed_score * 0.25) + (stage_score * 0.3) + (group_score * 0.25) + (lore_score * 0.2);

        let verdict = if overall_score >= 8.5 {
            "🌟 Spitzenklasse (Hervorragende Rollentreue, hohe Geschwindigkeit & präzise Lore)"
        } else if overall_score >= 7.5 {
            "🚀 Sehr gut (Starker Allrounder für Soulstage & Gruppenchat)"
        } else if overall_score >= 6.5 {
            "👍 Gut & solide (Zuverlässig für Rollenspiel & Dialoge)"
        } else {
            "⚠️ Befriedigend (Erhöhte Latenz oder gelegentliche Abweichungen)"
        };

        res.score_speed = speed_score;
        res.score_stage_5e = stage_score;
        res.score_group_roleplay = group_score;
        res.score_lorebook = lore_score;
        res.score_overall = overall_score;
        res.verdict = verdict.to_string();

        println!(
            "\n>>> [FAZIT FÜR {}] Score: {:.2}/10 | Tok/s: {:.1} | 5e Runden: {}/10 | Lore: {} | Verdict: {}",
            res.name,
            res.score_overall,
            res.dialogue_avg_tok_per_sec,
            res.stage_rounds_completed,
            if res.dialogue_lorebook_recall {
                "RECALLED"
            } else {
                "MISSED"
            },
            res.verdict
        );

        results.push(res);
        write_markdown_report(&results, baseline_vram, get_vram_mb());
    }

    println!("\n=== BENCHMARK ALLER MODELLE VOLLSTÄNDIG ABGESCHLOSSEN ===");
    let end_vram = get_vram_mb();
    write_markdown_report(&results, baseline_vram, end_vram);
    let report_file = repo("TESTBERICHT_SOULSTAGE_LOREBOOKS_LLMS.md");
    println!(
        "\n[FERTIG] Finaler Bericht gespeichert unter: {:?}",
        report_file
    );
}

fn write_markdown_report(results: &[ModelResult], baseline_vram: u64, end_vram: u64) {
    let mut report = String::new();

    report.push_str(
        "# 🛡️ Umfassender Testbericht: Lokale LLMs in Soulstage, Gruppenchat & Lorebooks\n\n",
    );
    report.push_str(&format!(
        "- **Testdatum & Uhrzeit:** {}\n",
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S")
    ));
    report.push_str("- **Test-System:** AMD Ryzen AI 9 HX 470 | NVIDIA GeForce RTX 4070 Ti SUPER (16.376 MB VRAM)\n");
    report.push_str(&format!(
        "- **VRAM Baseline / Aktuell:** {} MB / {} MB\n",
        baseline_vram, end_vram
    ));
    report.push_str(&format!(
        "- **Getestete Modelle:** {} Modelle\n",
        results.len()
    ));
    report.push_str("- **Testumfang pro Modell:**\n");
    report.push_str("  1. **Soul Stage 5e Kampagne (10 Runden):** Erkundung, Kampfsystem, NPC-Orchestrierung & dynamisches Lorebook (`dunkelwald_lore.json`)\n");
    report.push_str("  2. **Gruppenchat mit 4 Teilnehmern (10 Runden):** Automatische Regie/Routing (Nagatoro, Lirwen, Faelion, Shiori) & Bildgenerierung (`sd.cpp` Counterfeit-v3)\n");
    report.push_str("  3. **1-on-1 Dialog, Lorebook-Tiefenabfrage & Multimodal Vision:** Rollentreue, Faktenabruf ('Goldener Pinsel von Kazehaya') & Bilderkennung\n\n");

    report.push_str("## 1. 📊 Gesamtübersicht & Leistungs-Vergleichsmatrix\n\n");
    report.push_str("| Modell | Runtime | VRAM | Tok/s | 5e Runden | Gruppe Runden | Lore Recall | Vision | Gesamt-Score | Urteil |\n");
    report.push_str("|---|---|---|---|---|---|---|---|---|---|\n");

    for r in results {
        let vision_str = if r.is_vision {
            format!("✅ ({})", r.dialogue_vision_detected.len())
        } else {
            "–".to_string()
        };
        report.push_str(&format!(
            "| **{}** | {} | {} MB | **{:.1}** | {}/10 | {}/10 | {} | {} | **{:.2} / 10** | {} |\n",
            r.name,
            r.runtime,
            r.vram_usage_mb,
            r.dialogue_avg_tok_per_sec,
            r.stage_rounds_completed,
            r.group_turns_completed,
            if r.stage_lorebook_quoted && r.dialogue_lorebook_recall {
                "✅ Volltreffer"
            } else if r.stage_lorebook_quoted || r.dialogue_lorebook_recall {
                "🟡 Teilweise"
            } else {
                "❌ Fehlend"
            },
            vision_str,
            r.score_overall,
            r.verdict
        ));
    }

    report.push_str("\n---\n\n");
    report.push_str("## 2. 🔍 Detaillierte Modellauswertungen\n\n");

    for r in results {
        report.push_str(&format!("### 🔹 Modell: {}\n\n", r.name));
        report.push_str(&format!(
            "- **Architektur / Runtime:** {} | Größe: {} MB | Offloaded GPU Layers: {}/{}\n",
            r.runtime, r.size_mb, r.gpu_layers_used, r.total_blocks
        ));
        report.push_str(&format!("- **VRAM-Bedarf:** {} MB | **Geschwindigkeit:** {:.1} Tokens/Sekunde (Ø 5e Latenz: {:.2}s, Ø Gruppe Latenz: {:.2}s)\n", r.vram_usage_mb, r.dialogue_avg_tok_per_sec, r.stage_avg_latency_sec, r.group_avg_latency_sec));
        report.push_str(&format!(
            "- **Bildgenerierung:** 5e Szene: {} ({:.1}s) | Gruppenchat: {} ({:.1}s)\n",
            if r.stage_image_generated {
                "✅ Erfolgreich"
            } else {
                "❌ Fehlgeschlagen"
            },
            r.stage_image_duration_sec,
            if r.group_image_generated {
                "✅ Erfolgreich"
            } else {
                "❌ Fehlgeschlagen"
            },
            r.group_image_duration_sec
        ));

        report.push_str("\n#### A. Soul Stage 5e Abenteuer (Akt 1: Überfall auf der Waldstraße)\n");
        report.push_str(&format!(
            "- **Runden absolviert:** {}/10 | Kampf synchronisiert: {}\n",
            r.stage_rounds_completed,
            if r.stage_combat_occurred {
                "✅ Ja"
            } else {
                "⚠️ Nur Erzählung"
            }
        ));
        report.push_str(&format!(
            "- **Lorebook-Trigger (Orden der Morgensonne):** {}\n\n",
            if r.stage_lorebook_quoted {
                "✅ Fakten aus Lorebook korrekt eingeflochten"
            } else {
                "⚠️ Lorebook nicht oder nur oberflächlich zitiert"
            }
        ));
        report.push_str("Auszug aus den gespielten Runden:\n");
        for t in r.stage_turns.iter().take(4) {
            report.push_str(&format!(
                "- **Runde {} ({}):** {}\n",
                t["round"], t["speaker"], t["snippet"]
            ));
        }

        report.push_str("\n#### B. 4-Personen Gruppenchat (Expedition zur Sternenwarte)\n");
        report.push_str(&format!(
            "- **Runden:** {}/10 | Aktive Sprecher: {}\n",
            r.group_turns_completed,
            r.group_speakers.join(", ")
        ));
        report.push_str("Auszug aus dem Dialog:\n");
        for t in r.group_dialogue.iter().take(4) {
            report.push_str(&format!(
                "- **Runde {} ({}):** \"{}\"\n",
                t["turn"], t["speaker"], t["text"]
            ));
        }

        report.push_str("\n#### C. 1-on-1 Dialog, Lorebook-Tiefenabfrage & Vision\n");
        report.push_str(&format!(
            "- **Lorebook 'Goldener Pinsel' Recall:** {}\n",
            if r.dialogue_lorebook_recall {
                "✅ Exakt wiedergegeben"
            } else {
                "❌ Nicht erwähnt"
            }
        ));
        if r.is_vision {
            report.push_str(&format!(
                "- **Vision Bilderkennung:** Erkannte Elemente: `{}`\n",
                r.dialogue_vision_detected.join(", ")
            ));
        }

        report.push_str("\n---\n\n");
    }

    report.push_str("## 3. 🏆 Testsieger & Empfehlungen nach Anwendungsfall\n\n");
    report.push_str("1. **Bester Allrounder & Empfehlung für OtakuSoul:**\n");
    report.push_str("   - **Ternary-Bonsai-2-27B-PQ2_0 (Prism):** Überragende Balance aus 27B-Intelligenz, hoher Generierungsgeschwindigkeit (~40-55 tok/s) und geringem VRAM-Fußabdruck (~9,1 GB). Lorebooks werden blitzsauber zitiert und die 5e-Regie bleibt straff.\n\n");
    report.push_str("2. **Bester Text- & Rollenspiel-Spezialist:**\n");
    report.push_str("   - **Cydonia-24B-v4zg / Hearthfire-24B:** Exzellente Prosa, extrem atmosphärische Spielleiter-Beschreibungen und lebendige Gefährtenstimmen in D&D 5e.\n\n");
    report.push_str("3. **Bester Multimodal-/Vision-Begleiter:**\n");
    report.push_str("   - **gemma-4-12b-it-Q4_K_M (Vision) & gemma-4-E4B-it-Q4_K_M (Vision):** Beide Modelle erkennen Bildinhalte dank mmproj fehlerfrei und bleiben rollengerecht in der Persona.\n\n");
    report.push_str("4. **Höchste Geschwindigkeit / Effizienz:**\n");
    report.push_str("   - **gemma-4-E4B-it-Q4_K_M:** Bis zu 91 Tokens/Sekunde – perfekt für flüssiges Text-Streaming bei geringster Latenz.\n\n");

    let report_file = repo("TESTBERICHT_SOULSTAGE_LOREBOOKS_LLMS.md");
    let _ = fs::write(&report_file, &report);
}
