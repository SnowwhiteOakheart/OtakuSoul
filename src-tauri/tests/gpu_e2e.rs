//! End-to-end checks on real hardware: runtimes, model downloads, speech synthesis, voice
//! cloning and image generation with VRAM planning next to a running chat model.
//!
//! They download several GB into the app's real data folder (so the app can use the models
//! afterwards) and need an NVIDIA GPU for the VRAM measurements. Run explicitly:
//!
//! ```text
//! OTAKUSOUL_E2E_OUT=/tmp/e2e cargo test --test gpu_e2e tts -- --ignored --nocapture
//! OTAKUSOUL_E2E_OUT=/tmp/e2e OTAKUSOUL_E2E_LLM=/path/model.gguf \
//!   cargo test --test gpu_e2e images -- --ignored --nocapture
//! ```

use otakusoul_lib::modules::{
    llama_manager::{LlamaServerConfig, LlamaServerManager, ServerState},
    local_image::{self, GenerationRequest, LocalImageEngine, VramStrategy},
    runtimes::{self, RuntimeKind},
    tts_local,
};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

fn out_dir() -> PathBuf {
    let dir = std::env::var("OTAKUSOUL_E2E_OUT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("otakusoul-e2e"));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn vram_used_mb() -> u64 {
    std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=memory.used", "--format=csv,noheader,nounits"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().next()?.trim().parse().ok())
        .unwrap_or(0)
}

/// Samples `nvidia-smi` in the background and reports the peak while it lives.
struct VramPeak {
    peak: Arc<AtomicU64>,
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl VramPeak {
    fn start() -> Self {
        let peak = Arc::new(AtomicU64::new(vram_used_mb()));
        let stop = Arc::new(AtomicBool::new(false));
        let handle = {
            let (peak, stop) = (peak.clone(), stop.clone());
            std::thread::spawn(move || {
                while !stop.load(Ordering::SeqCst) {
                    peak.fetch_max(vram_used_mb(), Ordering::SeqCst);
                    std::thread::sleep(Duration::from_millis(200));
                }
            })
        };
        Self {
            peak,
            stop,
            handle: Some(handle),
        }
    }

    fn finish(mut self) -> u64 {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
        self.peak.load(Ordering::SeqCst)
    }
}

/// Installs the variant the app recommends for this system (reinstalling when a different
/// one is installed), or the first match of `prefer` when the app has no recommendation.
async fn ensure_runtime(kind: RuntimeKind, prefer: &[&str]) -> runtimes::RuntimeInfo {
    let variants = runtimes::list_variants(kind).await.unwrap();
    let backend = variants
        .iter()
        .find(|v| v.recommended)
        .or_else(|| {
            prefer
                .iter()
                .find_map(|p| variants.iter().find(|v| v.backend.starts_with(p)))
        })
        .expect("no variant")
        .backend
        .clone();
    if let Some(info) = runtimes::installed(kind)
        && info.backend == backend
    {
        println!(
            "[{kind:?}] bereits installiert: {} {}",
            info.build, info.backend
        );
        return info;
    }
    println!("[{kind:?}] installiere empfohlene Variante {backend} …");
    let info = runtimes::install_with(kind, &backend, &|_| {})
        .await
        .unwrap();
    println!("[{kind:?}] installiert: {} {}", info.build, info.backend);
    info
}

fn wav_seconds(bytes: &[u8]) -> f32 {
    let reader = hound::WavReader::new(std::io::Cursor::new(bytes)).expect("valid WAV");
    let spec = reader.spec();
    reader.duration() as f32 / spec.sample_rate as f32
}

fn read_wav_mono(path: &Path) -> (Vec<f32>, u32) {
    let mut reader = hound::WavReader::open(path).unwrap();
    let spec = reader.spec();
    let channels = spec.channels as usize;
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| f32::from(s.unwrap()) / f32::from(i16::MAX))
        .collect::<Vec<_>>()
        .chunks(channels)
        .map(|c| c.iter().sum::<f32>() / channels as f32)
        .collect();
    (samples, spec.sample_rate)
}

fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    let ratio = f64::from(from) / f64::from(to);
    let len = (input.len() as f64 / ratio) as usize;
    (0..len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let left = pos as usize;
            let right = (left + 1).min(input.len() - 1);
            let frac = (pos - left as f64) as f32;
            input[left] * (1.0 - frac) + input[right] * frac
        })
        .collect()
}

/// Transcribes `wav` with whisper through the installed CrispASR runtime.
fn transcribe(wav: &Path, lang: &str) -> String {
    let info = runtimes::installed(RuntimeKind::Crisp).expect("crispasr");
    let bin = PathBuf::from(&info.server_path);
    let out = std::process::Command::new(&bin)
        .args([
            "-m",
            "auto",
            "--backend",
            "whisper",
            "-np",
            "-l",
            lang,
            "-f",
        ])
        .arg(wav)
        .env("LD_LIBRARY_PATH", bin.parent().unwrap())
        .output()
        .expect("whisper runs");
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// Share of the expected words that whisper heard (case and punctuation ignored).
fn word_match(expected: &str, heard: &str) -> f32 {
    let words = |s: &str| -> Vec<String> {
        s.to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .filter(|w| !w.is_empty())
            .map(str::to_string)
            .collect()
    };
    let expected = words(expected);
    let heard = words(heard);
    let hits = expected.iter().filter(|w| heard.contains(w)).count();
    hits as f32 / expected.len().max(1) as f32
}

struct Line {
    model: &'static str,
    voice: String,
    lang: &'static str,
    text: &'static str,
}

const DE: &str = "Guten Abend! Ich habe heute in der alten Bibliothek ein seltsames Buch gefunden.";
const RU: &str = "Добрый вечер! Сегодня я нашла в старой библиотеке странную книгу.";
const EN: &str = "Good evening! Today I found a strange book in the old library.";
const WARM: &str = "Hast du Lust, es gemeinsam zu lesen? Ich bin schon ganz gespannt.";

#[tokio::test(flavor = "multi_thread")]
#[ignore = "downloads models and needs a GPU"]
async fn tts() {
    let out = out_dir();
    ensure_runtime(RuntimeKind::Crisp, &["vulkan"]).await;
    let mut settings = tts_local::load_settings();
    settings.allow_noncommercial = true;
    tts_local::save_settings(&settings).unwrap();

    for id in [
        "qwen3-tts-customvoice-0.6b",
        "qwen3-tts-1.7b",
        "chatterbox-multilingual",
        "kokoro-de",
        "f5-tts-v1",
    ] {
        let started = Instant::now();
        tts_local::download_model_with(id, &|_| {}).await.unwrap();
        println!(
            "[download] {id} bereit nach {:.0}s",
            started.elapsed().as_secs_f32()
        );
    }

    let engine = tts_local::engine();
    engine.stop().await;
    let baseline = vram_used_mb();
    println!("[vram] Grundlast {baseline} MB");
    let mut results = Vec::new();
    let mut run = async |line: Line| {
        let peak = VramPeak::start();
        let started = Instant::now();
        let result = engine
            .synthesize(line.model, &line.voice, line.text, line.lang, 1.0)
            .await;
        let secs = started.elapsed().as_secs_f32();
        let peak = peak.finish();
        match result {
            Ok(wav) => {
                let name = format!(
                    "tts-{}-{}-{}.wav",
                    line.model,
                    line.voice.replace(':', "_"),
                    line.lang
                );
                std::fs::write(out.join(&name), &wav).unwrap();
                let audio = wav_seconds(&wav);
                let heard = transcribe(&out.join(&name), line.lang);
                let score = word_match(line.text, &heard);
                println!(
                    "[tts] {} {} {}: {:.1}s Audio in {:.1}s (RTF {:.2}), VRAM +{} MB, Wörter {:.0}%\n      gehört: {heard}",
                    line.model,
                    line.voice,
                    line.lang,
                    audio,
                    secs,
                    secs / audio,
                    peak.saturating_sub(baseline),
                    score * 100.0
                );
                results.push((
                    line.model,
                    line.voice.clone(),
                    line.lang,
                    score >= 0.6,
                    audio,
                ));
            }
            Err(e) => {
                println!(
                    "[tts] {} {} {}: FEHLER {e}",
                    line.model, line.voice, line.lang
                );
                results.push((line.model, line.voice.clone(), line.lang, false, 0.0));
            }
        }
    };

    for (lang, text) in [("de", DE), ("ru", RU), ("en", EN)] {
        run(Line {
            model: "qwen3-tts-customvoice-0.6b",
            voice: "preset:vivian".into(),
            lang,
            text,
        })
        .await;
    }
    // Same model, warm server: latency without loading.
    run(Line {
        model: "qwen3-tts-customvoice-0.6b",
        voice: "preset:ryan".into(),
        lang: "de",
        text: WARM,
    })
    .await;
    for (lang, text) in [("de", DE), ("ru", RU)] {
        run(Line {
            model: "chatterbox-multilingual",
            voice: "preset:default".into(),
            lang,
            text,
        })
        .await;
    }
    for voice in ["preset:df_victoria", "preset:dm_bernd", "preset:df_eva"] {
        run(Line {
            model: "kokoro-de",
            voice: voice.into(),
            lang: "de",
            text: DE,
        })
        .await;
    }

    // Voice cloning from a 16 kHz recording (what the app's recorder used to deliver); the
    // reference is Kokoro's "Victoria", a preset without spoken disclosure.
    let reference = out.join("tts-kokoro-de-preset_df_victoria-de.wav");
    if reference.is_file() {
        let (samples, rate) = read_wav_mono(&reference);
        let samples = resample(&samples, rate, 16_000);
        // Without consent nothing is stored.
        assert!(tts_local::create_cloned_voice("x", &samples, 16_000, DE, "de", false).is_err());
        let clone =
            tts_local::create_cloned_voice("E2E Kokoro Victoria", &samples, 16_000, DE, "de", true)
                .unwrap();
        println!(
            "[clone] Stimme {} ({:.1}s) angelegt",
            clone.id, clone.duration_secs
        );
        let voice = format!("clone:{}", clone.id);
        for (lang, text) in [("de", WARM), ("ru", RU), ("en", EN)] {
            run(Line {
                model: "qwen3-tts-1.7b",
                voice: voice.clone(),
                lang,
                text,
            })
            .await;
        }
        if std::env::var("OTAKUSOUL_E2E_F5").is_ok() {
            run(Line {
                model: "f5-tts-v1",
                voice: voice.clone(),
                lang: "en",
                text: EN,
            })
            .await;
        }
        tts_local::delete_cloned_voice(&clone.id).unwrap();
    }
    engine.stop().await;

    println!("\n== TTS-Ergebnis ==");
    for (model, voice, lang, ok, audio) in &results {
        println!(
            "{:<28} {:<34} {:<3} {} {:.1}s",
            model,
            voice,
            lang,
            if *ok { "ok " } else { "FEHLER" },
            audio
        );
    }
    assert!(results.iter().all(|r| r.3), "some lines failed");
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "downloads ~60 GB of models and needs a GPU"]
async fn images() {
    let out = out_dir();
    ensure_runtime(RuntimeKind::Sd, &["vulkan"]).await;
    let llm_path = std::env::var("OTAKUSOUL_E2E_LLM").unwrap_or_default();
    if llm_path.to_ascii_lowercase().contains("pq2_0")
        || llm_path.to_ascii_lowercase().contains("ptq1_0")
    {
        ensure_runtime(RuntimeKind::Prism, &["cuda-12", "vulkan"]).await;
    } else {
        ensure_runtime(RuntimeKind::Llama, &["cuda-12", "vulkan"]).await;
    }
    let only: Option<Vec<String>> = std::env::var("OTAKUSOUL_E2E_IMAGES")
        .ok()
        .map(|s| s.split(',').map(str::to_string).collect());
    let models = [
        (
            "animagine-xl-4",
            "1girl, solo, silver hair, long hair, violet eyes, reading a glowing book, old library, candlelight, upper body, looking at viewer",
        ),
        (
            "flux1-dev-q5",
            "An anime girl with long silver hair and violet eyes reads a glowing book in an old library at night, warm candlelight, anime illustration, detailed.",
        ),
        (
            "qwen-image-2.1-q4",
            "An anime girl with long silver hair and violet eyes reads a glowing book in an old library at night, warm candlelight, anime illustration, detailed.",
        ),
        (
            "flux2-dev-q4",
            "An anime girl with long silver hair and violet eyes reads a glowing book in an old library at night, warm candlelight, anime illustration, detailed.",
        ),
    ];
    let selected: Vec<_> = models
        .iter()
        .filter(|(id, _)| only.as_ref().is_none_or(|o| o.iter().any(|x| x == id)))
        .collect();
    for (id, _) in &selected {
        let started = Instant::now();
        let last = Mutex::new(0u32);
        local_image::download_model_with(id, &|p| {
            let step = (p.percent / 10.0) as u32;
            let mut last = last.lock().unwrap();
            if step > *last {
                *last = step;
                println!("[download] {id} {:.0}%", p.percent);
            }
        })
        .await
        .unwrap();
        println!(
            "[download] {id} bereit nach {:.0}s",
            started.elapsed().as_secs_f32()
        );
    }

    if std::env::var("OTAKUSOUL_E2E_DOWNLOAD_ONLY").is_ok() {
        return;
    }
    assert!(!llm_path.is_empty(), "OTAKUSOUL_E2E_LLM=chat model");
    let llama = Arc::new(LlamaServerManager::new());
    let config = LlamaServerConfig {
        model_path: llm_path.clone(),
        port: 48_696,
        context_size: 16_384,
        gpu_layers: 99,
        flash_attn: true,
        ..Default::default()
    };
    let idle = vram_used_mb();
    llama
        .start(config.clone())
        .await
        .expect("chat model starts");
    println!(
        "[llm] gestartet: {} MB VRAM (vorher {idle} MB)",
        vram_used_mb()
    );

    // A loaded speech model, so the planner has to consider it.
    if tts_local::list_models()
        .iter()
        .any(|m| m.id == "qwen3-tts-0.6b" && m.installed)
    {
        let wav = tts_local::engine()
            .synthesize("qwen3-tts-0.6b", "preset:default", "Hallo!", "de", 1.0)
            .await;
        println!(
            "[tts] Sprachmodell geladen: {} ({} MB VRAM)",
            wav.is_ok(),
            vram_used_mb()
        );
    }

    let engine = LocalImageEngine::new();
    let strategies: Vec<VramStrategy> = match std::env::var("OTAKUSOUL_E2E_STRATEGY").as_deref() {
        Ok("reduce") => vec![VramStrategy::ReduceLlm],
        Ok("all") => vec![VramStrategy::Auto, VramStrategy::ReduceLlm],
        _ => vec![VramStrategy::Auto],
    };
    let mut results = Vec::new();
    for strategy in strategies {
        for (id, prompt) in &selected {
            let phases = Mutex::new(Vec::<String>::new());
            let peak = VramPeak::start();
            let started = Instant::now();
            let result = engine
                .generate(
                    &|s| {
                        let label = match s.plan {
                            Some(plan) => format!("{} ({plan:?})", s.phase),
                            None => s.phase,
                        };
                        phases.lock().unwrap().push(label);
                    },
                    llama.clone(),
                    GenerationRequest {
                        model_id: id,
                        strategy,
                        prompt,
                        negative: "lowres, bad anatomy, bad hands, watermark, text",
                        seed: 42,
                    },
                )
                .await;
            let secs = started.elapsed().as_secs_f32();
            let peak = peak.finish();
            let phases = phases.into_inner().unwrap();
            match &result {
                Ok(png) => {
                    let name = format!("img-{id}-{strategy:?}.png");
                    std::fs::write(out.join(&name), png).unwrap();
                    println!(
                        "[img] {id} {strategy:?}: {:.0}s, VRAM-Spitze {peak} MB, Phasen: {} → {name}",
                        secs,
                        phases.join(" → ")
                    );
                }
                Err(e) => println!(
                    "[img] {id} {strategy:?}: FEHLER nach {secs:.0}s: {e}\n  Phasen: {}",
                    phases.join(" → ")
                ),
            }

            // After a swap the chat model has to come back and answer.
            let restarted = Instant::now();
            let mut llm_ok = false;
            while restarted.elapsed() < Duration::from_secs(180) {
                let status = llama.get_status().await;
                if status.state == ServerState::Running {
                    let reply = reqwest::Client::new()
                        .post(format!(
                            "http://127.0.0.1:{}/v1/chat/completions",
                            config.port
                        ))
                        .json(&serde_json::json!({
                            "messages": [{"role": "user", "content": "Antworte nur mit: Hallo"}],
                            "max_tokens": 16
                        }))
                        .send()
                        .await;
                    llm_ok = reply.is_ok_and(|r| r.status().is_success());
                    break;
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            println!(
                "[llm] nach {id}: {} ({:.0}s bis bereit), VRAM jetzt {} MB",
                if llm_ok {
                    "antwortet"
                } else {
                    "ANTWORTET NICHT"
                },
                restarted.elapsed().as_secs_f32(),
                vram_used_mb()
            );
            results.push((id.to_string(), strategy, result.is_ok(), llm_ok, secs, peak));
        }
    }
    engine.stop().await;
    tts_local::engine().stop().await;
    llama.stop().await.ok();

    println!("\n== Bild-Ergebnis ==");
    for (id, strategy, ok, llm_ok, secs, peak) in &results {
        println!(
            "{:<20} {:<10} Bild {:<6} Chat danach {:<6} {:>5.0}s  Spitze {} MB",
            id,
            format!("{strategy:?}"),
            if *ok { "ok" } else { "FEHLER" },
            if *llm_ok { "ok" } else { "FEHLER" },
            secs,
            peak
        );
    }
    assert!(
        results.iter().all(|r| r.2 && r.3),
        "some generations failed"
    );
}
