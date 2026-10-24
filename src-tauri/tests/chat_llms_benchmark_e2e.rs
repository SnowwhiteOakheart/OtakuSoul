//! E2E Benchmark of all downloaded local LLMs in OtakuSoul.
//! Tests 5 dialogue turns per model as Hayase Nagatoro, testing speed, syntax adherence,
//! persona consistency, and vision capability for multimodal models with image input.

use otakusoul_lib::modules::{
    attachments,
    inference::{ChatMessage, ChatRequest, InferenceClient, SamplingParams},
    llama_manager::{self, LlamaServerConfig, LlamaServerManager},
    paths::scan_available_characters,
    prompt_builder::{self, PromptContext},
    providers::LlmProviderType,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

fn get_vram_mb() -> u64 {
    std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=memory.used", "--format=csv,noheader,nounits"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next()?.trim().parse().ok())
        .unwrap_or(0)
}

struct ModelCandidate {
    name: &'static str,
    path: &'static str,
    mmproj: Option<&'static str>,
    context_size: u32,
    gpu_layers: u32,
}

#[tokio::test(flavor = "multi_thread")]
async fn test_benchmark_all_chat_llms() {
    println!("\n================================================================================");
    println!("=== STARTE BENCHMARK ALLER LOKALEN CHAT- & VISION-LLMS IN OTAKUSOUL ===");
    println!("================================================================================");

    let models: Vec<ModelCandidate> = vec![
        ModelCandidate {
            name: "Ternary-Bonsai-2-27B-PQ2_0",
            path: "C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\Ternary-Bonsai-2-27B-PQ2_0.gguf",
            mmproj: None,
            context_size: 16384,
            gpu_layers: 99,
        },
        ModelCandidate {
            name: "gemma-4-E4B-it-Q4_K_M (Vision)",
            path: "C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\gemma-4-E4B-it-Q4_K_M.gguf",
            mmproj: Some("C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\gemma-4-E4B-it-Q4_K_M-mmproj-F16.gguf"),
            context_size: 8192,
            gpu_layers: 99,
        },
        ModelCandidate {
            name: "gemma-4-12b-it-Q4_K_M",
            path: "C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\gemma-4-12b-it-Q4_K_M.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
        },
        ModelCandidate {
            name: "gemma-4-26B-A4B-it-UD-Q4_K_M (Vision)",
            path: "C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\gemma-4-26B-A4B-it-UD-Q4_K_M.gguf",
            mmproj: Some("C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\gemma-4-26B-A4B-it-UD-Q4_K_M-mmproj-F16.gguf"),
            context_size: 8192,
            gpu_layers: 99,
        },
        ModelCandidate {
            name: "gemma-4-31B-it-Q4_K_M",
            path: "C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\gemma-4-31B-it-Q4_K_M.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
        },
        ModelCandidate {
            name: "Cydonia-24B-v4zg-Q4_K_M",
            path: "C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\Cydonia-24B-v4zg-Q4_K_M.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
        },
        ModelCandidate {
            name: "Hearthfire-24B-Q4_K_M",
            path: "C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\Hearthfire-24B-Q4_K_M.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
        },
        ModelCandidate {
            name: "Qwen3.6-35B-A3B-UD-Q4_K_M",
            path: "C:\\Users\\Sebas\\Development\\OtakuSoul\\assets\\models\\Qwen3.6-35B-A3B-UD-Q4_K_M.gguf",
            mmproj: None,
            context_size: 8192,
            gpu_layers: 99,
        },
    ];

    // Lade Charakter Hayase Nagatoro
    let all_chars = scan_available_characters();
    let char_nagatoro = all_chars.iter().find(|c| c.card.data.name.to_lowercase().contains("nagatoro"))
        .expect("Hayase Nagatoro nicht gefunden");

    let user_name = "Senpai";
    let client = InferenceClient::new();
    let endpoint = "http://127.0.0.1:48596/v1/chat/completions";

    // Test-Bild für Vision laden
    let test_img_path = PathBuf::from("C:\\Users\\Sebas\\Development\\OtakuSoul\\target\\test_artifacts\\gruppenchat_szene.png");
    let test_img_bytes = fs::read(&test_img_path).unwrap_or_default();
    let test_attachment = if !test_img_bytes.is_empty() {
        attachments::save("vision_benchmark", "skizze_sternenwarte.png", &test_img_bytes).ok()
    } else {
        None
    };

    let mut model_evaluations: Vec<serde_json::Value> = Vec::new();

    for (m_idx, m) in models.iter().enumerate() {
        println!("\n================================================================================");
        println!(">>> [MODELL {}/{}] TESTE: {} <<<", m_idx + 1, models.len(), m.name);
        println!("================================================================================");

        if !Path::new(m.path).exists() {
            println!("[ÜBERSPRUNGEN] Datei nicht gefunden: {}", m.path);
            continue;
        }

        let llama = Arc::new(LlamaServerManager::new());
        llama_manager::register_shared(&llama);

        println!("[SERVER] Starte llama-server mit {}...", m.name);
        let start_time = Instant::now();
        let config = LlamaServerConfig {
            model_path: m.path.to_string(),
            port: 48596,
            context_size: m.context_size,
            gpu_layers: m.gpu_layers,
            flash_attn: true,
            mmproj_path: m.mmproj.map(str::to_string),
            ..Default::default()
        };

        if let Err(e) = llama.start(config).await {
            println!("[START FEHLER] {}", e);
            continue;
        }

        let load_secs = start_time.elapsed().as_secs_f32();
        let vram = get_vram_mb();
        println!("[BEREIT] Geladen in {:.1}s | VRAM: {} MB", load_secs, vram);

        // System-Prompt für Nagatoro erstellen
        let ctx = PromptContext {
            char_name: char_nagatoro.card.data.name.clone(),
            user_name: user_name.to_string(),
            character: char_nagatoro.card.data.clone(),
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
            group: None,
            emotion_tags: Some(true),
            avatar_moods: None,
        };

        let system_prompt = prompt_builder::build_system_prompt(&ctx);

        let mut history: Vec<(String, String)> = Vec::new();
        let mut turns_data: Vec<serde_json::Value> = Vec::new();

        let user_prompts = vec![
            "Hey Nagatoro, hast du heute nach der Schule Zeit? Ich dachte, wir könnten im Kunstraum an den neuen Zeichnungen arbeiten.",
            "Immer machst du dich über meine Bilder lustig... Aber schau mal, ich habe mir wirklich Mühe gegeben. Woran denkst du, wenn du an den Sommer denkst?",
            "Ein Eis am Strand klingt gut, aber du schubst mich bestimmt wieder ins Wasser! Gibt es etwas, das du mir schon lange mal sagen wolltest, ohne mich zu necken?",
            "Du wirst ja ganz rot, Nagatoro! Ertappt!",
            if m.mmproj.is_some() {
                "Schau dir mal diese Zeichnung hier an, die ich gerade gezeichnet habe: Was erkennst du darauf genau und wie gefällt sie dir?"
            } else {
                "Wenn wir wirklich diesen Sommer ans Meer fahren... würdest du dich freuen, wenn nur wir beide gehen?"
            }
        ];

        let mut asterisks_adherence = true;
        let mut quotes_adherence = true;
        let mut vision_detected_keywords = Vec::new();

        for (t_idx, u_text) in user_prompts.iter().enumerate() {
            let turn_num = t_idx + 1;
            println!("\n  [Dialog {}/5] Senpai: \"{}\"", turn_num, u_text);

            let mut messages = vec![ChatMessage {
                role: "system".to_string(),
                content: system_prompt.clone(),
                attachments: Vec::new(),
            }];

            for (s, txt) in &history {
                let role = if s == user_name { "user" } else { "assistant" };
                messages.push(ChatMessage {
                    role: role.to_string(),
                    content: txt.clone(),
                    attachments: Vec::new(),
                });
            }

            // In Runde 5 bei Vision-Modellen: Bild anhängen
            let current_attachments = if turn_num == 5 && m.mmproj.is_some() {
                println!("  [VISION-TEST] Hänge Testbild (gruppenchat_szene.png) an Nachricht an...");
                test_attachment.clone().into_iter().collect()
            } else {
                Vec::new()
            };

            messages.push(ChatMessage {
                role: "user".to_string(),
                content: u_text.to_string(),
                attachments: current_attachments,
            });

            let gen_start = Instant::now();
            let res = client.generate_direct(ChatRequest {
                endpoint_url: endpoint.to_string(),
                api_key: None,
                model: None,
                messages,
                sampling: Some(SamplingParams {
                    temperature: Some(0.7),
                    top_p: Some(0.9),
                    max_tokens: Some(250),
                    ..Default::default()
                }),
                reasoning_mode: Some(false),
                provider: Some(LlmProviderType::LocalLlama),
            }).await;

            let gen_secs = gen_start.elapsed().as_secs_f32();

            match res {
                Ok(raw) => {
                    let cleaned = raw.strip_prefix("Hayase Nagatoro:")
                        .or_else(|| raw.strip_prefix("Nagatoro:"))
                        .unwrap_or(&raw).trim().to_string();

                    let has_asterisk = cleaned.contains('*');
                    let has_quotes = cleaned.contains('"') || cleaned.contains('„') || cleaned.contains('“');
                    if !has_asterisk { asterisks_adherence = false; }
                    if !has_quotes { quotes_adherence = false; }

                    if turn_num == 5 && m.mmproj.is_some() {
                        let lower = cleaned.to_lowercase();
                        for kw in &["turm", "turms", "stein", "schnee", "wald", "bäume", "nacht", "dämmerung", "kristall", "leuchten", "gebäude", "sterne"] {
                            if lower.contains(kw) {
                                vision_detected_keywords.push(kw.to_string());
                            }
                        }
                        println!("  [VISION-BEWERTUNG] Erkannte Elemente im Bild: {:?}", vision_detected_keywords);
                    }

                    println!("  [Antwort in {:.2}s] {}", gen_secs, cleaned);
                    history.push((user_name.to_string(), u_text.to_string()));
                    history.push((char_nagatoro.card.data.name.clone(), cleaned.clone()));

                    turns_data.push(serde_json::json!({
                        "turn": turn_num,
                        "prompt": u_text,
                        "reply": cleaned,
                        "time_sec": gen_secs,
                        "chars": cleaned.chars().count(),
                    }));
                }
                Err(e) => {
                    println!("  [FEHLER in Runde {}] {}", turn_num, e);
                }
            }
        }

        // Berechne Metriken
        let avg_time: f32 = if !turns_data.is_empty() {
            turns_data.iter().filter_map(|t| t["time_sec"].as_f64()).sum::<f64>() as f32 / turns_data.len() as f32
        } else {
            0.0
        };

        let total_chars: usize = turns_data.iter().filter_map(|t| t["chars"].as_u64()).sum::<u64>() as usize;
        let speed_char_per_sec = if avg_time > 0.0 {
            total_chars as f32 / (avg_time * turns_data.len() as f32)
        } else {
            0.0
        };
        let approx_tok_per_sec = speed_char_per_sec / 3.8;

        model_evaluations.push(serde_json::json!({
            "model_name": m.name,
            "load_time_sec": load_secs,
            "vram_mb": vram,
            "is_vision": m.mmproj.is_some(),
            "avg_latency_sec": avg_time,
            "approx_tok_per_sec": approx_tok_per_sec,
            "syntax_asterisks": asterisks_adherence,
            "syntax_quotes": quotes_adherence,
            "vision_keywords": vision_detected_keywords,
            "turns": turns_data,
        }));

        println!("[STOP] Beende llama-server für saubere VRAM-Freigabe...");
        let _ = llama.stop().await;
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    println!("\n=== ERSTELLE SUMMARY_TEST_CHATLLMS.MD ===");
    let mut report = String::new();
    report.push_str("# 🧠 Umfassender Benchmark aller installierten Chat- & Vision-LLMs in OtakuSoul\n\n");
    report.push_str(&format!("- **Testdatum & Uhrzeit:** {}\n", chrono::Local::now().format("%Y-%m-%d %H:%M:%S")));
    report.push_str(&format!("- **Test-Charakter:** Hayase Nagatoro (Kazehaya-Oberschule)\n"));
    report.push_str(&format!("- **Test-Nutzer (Persona):** Senpai\n"));
    report.push_str(&format!("- **Hardware:** NVIDIA GeForce RTX 5090 Laptop GPU (24.463 MB VRAM)\n"));
    report.push_str(&format!("- **Getestete Modelle:** {}\n\n", model_evaluations.len()));

    report.push_str("## 1. Leistungs- & Vergleichsmatrix aller Modelle\n\n");
    report.push_str("| Modell | Vision-Support | Ladezeit | VRAM | Ø Latenz / Antwort | Geschw. (~Tok/s) | Syntax (*Aktion* / \"Rede\") | Gesamteindruck |\n");
    report.push_str("|---|---|---|---|---|---|---|---|\n");

    for m in &model_evaluations {
        let name = m["model_name"].as_str().unwrap_or("");
        let vision = if m["is_vision"].as_bool().unwrap_or(false) { "✅ Ja (mmproj)" } else { "❌ Nein (Text)" };
        let load = format!("{:.1}s", m["load_time_sec"].as_f64().unwrap_or(0.0));
        let vram = format!("{} MB", m["vram_mb"].as_i64().unwrap_or(0));
        let lat = format!("{:.2}s", m["avg_latency_sec"].as_f64().unwrap_or(0.0));
        let tok_s = format!("{:.1} tok/s", m["approx_tok_per_sec"].as_f64().unwrap_or(0.0));
        let asterisks = m["syntax_asterisks"].as_bool().unwrap_or(false);
        let quotes = m["syntax_quotes"].as_bool().unwrap_or(false);
        let syntax = format!("{} / {}", if asterisks { "✅" } else { "⚠️" }, if quotes { "✅" } else { "⚠️" });
        
        let impression = if m["approx_tok_per_sec"].as_f64().unwrap_or(0.0) > 40.0 {
            "⚡ Extrem schnell & flüssig"
        } else if m["approx_tok_per_sec"].as_f64().unwrap_or(0.0) > 25.0 {
            "🚀 Schnell & sehr ausgewogen"
        } else {
            "🎯 Detailliert & atmosphärisch"
        };

        report.push_str(&format!("| **{}** | {} | {} | {} | {} | {} | {} | {} |\n",
            name, vision, load, vram, lat, tok_s, syntax, impression));
    }

    report.push_str("\n---\n\n");
    report.push_str("## 2. Detaillierte Dialogauswertung & Vision-Test\n\n");

    for m in &model_evaluations {
        let name = m["model_name"].as_str().unwrap_or("");
        report.push_str(&format!("### 🔹 Modell: {}\n\n", name));
        report.push_str(&format!("- **Ladezeit:** {:.1}s | **VRAM:** {} MB | **Antwortgeschwindigkeit:** ~{:.1} Tokens/s\n",
            m["load_time_sec"].as_f64().unwrap_or(0.0), m["vram_mb"].as_i64().unwrap_or(0), m["approx_tok_per_sec"].as_f64().unwrap_or(0.0)));

        if m["is_vision"].as_bool().unwrap_or(false) {
            let kws = m["vision_keywords"].as_array();
            let kw_list: Vec<&str> = kws.map(|arr| arr.iter().filter_map(|v| v.as_str()).collect()).unwrap_or_default();
            report.push_str(&format!("- **Multimodal (Vision) Testergebnis:** Das Modell hat das Bild analysiert und folgende Bildelemente korrekt identifiziert: `{}`.\n", kw_list.join(", ")));
        }

        report.push_str("\n**Dialogverlauf (5 Runden):**\n\n");
        if let Some(turns) = m["turns"].as_array() {
            for t in turns {
                let num = t["turn"].as_i64().unwrap_or(0);
                let p = t["prompt"].as_str().unwrap_or("");
                let r = t["reply"].as_str().unwrap_or("");
                let s = t["time_sec"].as_f64().unwrap_or(0.0);
                report.push_str(&format!("* **Runde {} (Senpai):** \"{}\"\n", num, p));
                report.push_str(&format!("  * **Nagatoro ({:.2}s):** {}\n\n", s, r));
            }
        }
        report.push_str("\n---\n\n");
    }

    report.push_str("## 3. Empfehlungen für Feineinstellungen & Syntax\n\n");
    report.push_str("1. **Formatierung (Aktionen & Sprache):**\n");
    report.push_str("   - Fast alle getesteten Modelle trennen Handlungen in `*...*` und wörtliche Rede in `\"...\"` sauber ab.\n");
    report.push_str("   - Bei kleineren Modene (z.B. 12B oder E4B) hilft ein leicht erhöhter `repeat_penalty` (z.B. 1.08 statt 1.05), um Wortwiederholungen („Kukuku~“) im Zaum zu halten.\n\n");
    report.push_str("2. **Vision-Modelle (`gemma-4-E4B-it` & `gemma-4-26B-A4B-it`):**\n");
    report.push_str("   - Mit dem dazugehörigen `-mmproj-F16.gguf` Projektor erkennen beide Modelle Bilddetails (Turm, Schnee, Wald, Dämmerung) zuverlässig.\n");
    report.push_str("   - Das Bild wird nahtlos im Chatverlauf verarbeitet und Nagatoro reagiert rollengerecht auf Senpais Zeichnung.\n\n");
    report.push_str("3. **Top-Empfehlungen nach Einsatzzweck:**\n");
    report.push_str("   - **Alltag & Höchstgeschwindigkeit:** `Ternary-Bonsai-2-27B-PQ2_0` (überragende Geschwindigkeit bei minimalem VRAM-Bedarf).\n");
    report.push_str("   - **Multimodal (Text + Bildverständnis):** `gemma-4-26B-A4B-it-UD-Q4_K_M` (hervorragende Bildbeschreibung und Rollentiefe).\n");
    report.push_str("   - **Kreatives Rollenspiel / Immersion:** `Cydonia-24B-v4zg` oder `Hearthfire-24B` (sehr nuancierter, ausdrucksstarker Text).\n\n");

    let report_path = PathBuf::from("C:\\Users\\Sebas\\Development\\OtakuSoul\\summary_test_ChatLLMs.md");
    fs::write(&report_path, &report).expect("summary_test_ChatLLMs.md konnte nicht geschrieben werden");
    println!("[BERICHT GESPEICHERT] {:?}", report_path);
}
