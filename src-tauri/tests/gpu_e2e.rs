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

    /// Starts counting again from the current usage (e.g. once other models are unloaded).
    fn reset(&self) {
        self.peak.store(vram_used_mb(), Ordering::SeqCst);
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
    // `OTAKUSOUL_E2E_KEEP_RUNTIME=1`: test the installed build as it is (e.g. an older one when
    // comparing versions).
    if std::env::var("OTAKUSOUL_E2E_KEEP_RUNTIME").is_ok()
        && let Some(info) = runtimes::installed(kind)
    {
        println!(
            "[{kind:?}] behalte installierte Laufzeit: {} {}",
            info.build, info.backend
        );
        return info;
    }
    let variants = runtimes::list_variants(kind).await.unwrap();
    let variant = variants
        .iter()
        .find(|v| v.recommended)
        .or_else(|| {
            prefer
                .iter()
                .find_map(|p| variants.iter().find(|v| v.backend.starts_with(p)))
        })
        .expect("no variant");
    let backend = variant.backend.clone();
    // Tests run against the newest build; an update keeps the previous one for a rollback.
    if let Some(info) = runtimes::installed(kind)
        && info.backend == backend
        && info.build == variant.build
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
/// Sound tags: a model that voices them does not say the words "laugh" or "sigh".
const EN_TAGS: &str = "[laugh] Oh, that is a funny story! [sigh] But now I am really tired.";
const WARM: &str = "Hast du Lust, es gemeinsam zu lesen? Ich bin schon ganz gespannt.";

/// Median pitch (Hz) of the voiced parts of a WAV, by autocorrelation over 40 ms frames.
fn median_pitch(bytes: &[u8]) -> f32 {
    let mut reader = hound::WavReader::new(std::io::Cursor::new(bytes)).expect("valid WAV");
    let spec = reader.spec();
    let channels = spec.channels as usize;
    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().map(|s| s.unwrap()).collect(),
        hound::SampleFormat::Int => reader
            .samples::<i16>()
            .map(|s| f32::from(s.unwrap()) / f32::from(i16::MAX))
            .collect(),
    };
    let mono: Vec<f32> = samples
        .chunks(channels)
        .map(|c| c.iter().sum::<f32>() / channels as f32)
        .collect();
    let rate = spec.sample_rate as usize;
    let frame = rate * 40 / 1000;
    let (min_lag, max_lag) = (rate / 400, rate / 60);
    let mut pitches = Vec::new();
    for chunk in mono.chunks(frame) {
        if chunk.len() < frame {
            break;
        }
        let energy: f32 = chunk.iter().map(|x| x * x).sum();
        if energy / (frame as f32) < 1e-4 {
            continue;
        }
        let (mut best, mut best_lag) = (0.0f32, 0usize);
        for lag in min_lag..max_lag.min(frame - 1) {
            let corr: f32 = (0..frame - lag).map(|i| chunk[i] * chunk[i + lag]).sum();
            if corr > best {
                best = corr;
                best_lag = lag;
            }
        }
        // Voiced: a clear periodic peak.
        if best_lag > 0 && best > 0.3 * energy {
            pitches.push(rate as f32 / best_lag as f32);
        }
    }
    pitches.sort_by(|a, b| a.partial_cmp(b).unwrap());
    pitches.get(pitches.len() / 2).copied().unwrap_or(0.0)
}

/// Qwen3-TTS 1.7B CustomVoice through the app's own path (`voice::synthesize_speech`): the
/// spoken words are always the same, only a roleplay action in front differs (removed before
/// speaking). Its feeling must change the delivery while the line stays intelligible, and a
/// written speaking style must work, too. Downloads the model through the catalog.
///
/// ```text
/// OTAKUSOUL_E2E_OUT=/tmp/e2e cargo test --test gpu_e2e style_voice -- --ignored --nocapture
/// ```
#[tokio::test(flavor = "multi_thread")]
#[ignore = "downloads a model and needs a GPU"]
async fn style_voice() {
    use base64::Engine;
    use otakusoul_lib::modules::voice::{self, TtsEngine, VoiceConfig};
    let out = out_dir();
    ensure_runtime(RuntimeKind::Crisp, &["vulkan"]).await;
    let model = "qwen3-tts-customvoice-1.7b";
    let started = Instant::now();
    tts_local::download_model_with(model, &|_| {})
        .await
        .unwrap();
    println!(
        "[download] {model} bereit nach {:.0}s",
        started.elapsed().as_secs_f32()
    );

    const LINE: &str = "Du bist also wirklich gekommen, nach all den Jahren.";
    let base = VoiceConfig {
        engine: TtsEngine::Local,
        local_model_id: Some(model.into()),
        voice_id: "preset:ryan".into(),
        ..VoiceConfig::default()
    };
    let calm = VoiceConfig {
        local_emotion: false,
        ..base.clone()
    };
    let cases = [
        ("neutral", LINE.to_string(), base.clone()),
        ("traurig", format!("*weint leise* {LINE}"), base.clone()),
        ("wuetend", format!("*funkelt wütend* {LINE}"), base.clone()),
        ("belustigt", format!("*kichert* {LINE}"), base.clone()),
        // The feeling can be switched off: the same sad action then sounds like the neutral line.
        ("traurig-aus", format!("*weint leise* {LINE}"), calm.clone()),
        (
            "stil-fluestern",
            LINE.to_string(),
            VoiceConfig {
                local_style: "Speak very slowly and quietly, almost whispering.".into(),
                ..calm
            },
        ),
    ];
    let mut measured = std::collections::HashMap::new();
    let mut unclear = Vec::new();
    for (name, text, config) in cases {
        let url = voice::synthesize_speech(&text, &config).await.unwrap();
        let wav = base64::engine::general_purpose::STANDARD
            .decode(url.split_once(',').unwrap().1)
            .unwrap();
        let path = out.join(format!("style-{name}.wav"));
        std::fs::write(&path, &wav).unwrap();
        let (seconds, pitch) = (wav_seconds(&wav), median_pitch(&wav));
        let heard = transcribe(&path, "de");
        let words = word_match(LINE, &heard);
        println!(
            "[style] {name:<15} {seconds:>5.2}s {pitch:>4.0} Hz Wörter {:>3.0}% → {heard}",
            words * 100.0
        );
        if words < 0.8 {
            unclear.push(format!("{name}: {heard}"));
        }
        measured.insert(name, (seconds, pitch));
    }
    // Stop the speech server before any assert, or a failure leaves it running.
    tts_local::engine().stop().await;
    assert!(unclear.is_empty(), "unverständlich: {unclear:?}");
    let (neutral_s, neutral_hz) = measured["neutral"];
    // Sadness sounds lower or slower; switched off, the sad action changes nothing (the same
    // input gives the same audio); a whispered style is slower; anger or amusement raise the voice.
    let (sad_s, sad_hz) = measured["traurig"];
    assert!(
        sad_hz < neutral_hz * 0.95 || sad_s > neutral_s * 1.1,
        "traurig klingt wie neutral: {measured:?}"
    );
    let (off_s, off_hz) = measured["traurig-aus"];
    assert!(
        (off_s / neutral_s - 1.0).abs() < 0.05 && (off_hz / neutral_hz - 1.0).abs() < 0.05,
        "Gefühle aus ändert trotzdem die Stimme: {measured:?}"
    );
    assert!(
        measured["stil-fluestern"].0 > neutral_s * 1.1,
        "Stil wirkt nicht: {measured:?}"
    );
    assert!(
        measured["wuetend"].1 > neutral_hz * 1.1 || measured["belustigt"].1 > neutral_hz * 1.1,
        "Gefühl hebt die Stimme nicht: {measured:?}"
    );
}

/// Chatterbox clones natively from a WAV (CrispASR, 24 kHz path): a clone of Kokoro's high
/// female voice must come out near its pitch, not near Chatterbox's own (lower) default voice.
///
/// ```text
/// OTAKUSOUL_E2E_OUT=/tmp/e2e cargo test --test gpu_e2e chatterbox_clone -- --ignored --nocapture
/// ```
#[tokio::test(flavor = "multi_thread")]
#[ignore = "downloads models and needs a GPU"]
async fn chatterbox_clone() {
    let out = out_dir();
    ensure_runtime(RuntimeKind::Crisp, &["vulkan"]).await;
    let models: &[&str] = if std::env::var("OTAKUSOUL_E2E_TURBO").is_ok() {
        &["kokoro-de", "chatterbox-multilingual", "chatterbox-turbo"]
    } else {
        &["kokoro-de", "chatterbox-multilingual"]
    };
    for id in models {
        tts_local::download_model_with(id, &|_| {}).await.unwrap();
    }
    let engine = tts_local::engine();
    engine.stop().await;
    let say = async |model: &str, voice: &str, text: &str, lang: &str| {
        let started = Instant::now();
        let wav = engine
            .synthesize_with(model, voice, text, lang, 1.0, Default::default())
            .await
            .unwrap_or_else(|e| panic!("{model} {voice}: {e}"));
        let name = format!("clone-{model}-{}-{lang}.wav", voice.replace(':', "_"));
        std::fs::write(out.join(&name), &wav).unwrap();
        let heard = transcribe(&out.join(&name), lang);
        let score = word_match(text, &heard);
        let pitch = median_pitch(&wav);
        println!(
            "[clone] {model} {voice} {lang}: {:.1}s Audio in {:.1}s, Tonhöhe {pitch:.0} Hz, Wörter {:.0}%\n        gehört: {heard}",
            wav_seconds(&wav),
            started.elapsed().as_secs_f32(),
            score * 100.0
        );
        (pitch, score)
    };

    // Reference: Kokoro's female German voice, taken as the app's recorder delivers it (16 kHz).
    let reference = engine
        .synthesize_with(
            "kokoro-de",
            "preset:df_victoria",
            DE,
            "de",
            1.0,
            Default::default(),
        )
        .await
        .unwrap();
    let reference_path = out.join("clone-reference-victoria.wav");
    std::fs::write(&reference_path, &reference).unwrap();
    let reference_pitch = median_pitch(&reference);
    let (samples, rate) = read_wav_mono(&reference_path);
    let samples = resample(&samples, rate, 16_000);
    let clone =
        tts_local::create_cloned_voice("E2E Victoria", &samples, 16_000, DE, "de", true).unwrap();
    println!(
        "[clone] Referenz Victoria: Tonhöhe {reference_pitch:.0} Hz, Klon {}",
        clone.id
    );
    let voice = format!("clone:{}", clone.id);

    let mut failures = Vec::new();
    let (default_pitch, _) = say("chatterbox-multilingual", "preset:default", WARM, "de").await;
    for (lang, text) in [("de", WARM), ("en", EN)] {
        let (pitch, score) = say("chatterbox-multilingual", &voice, text, lang).await;
        let near_reference = (pitch - reference_pitch).abs() < (pitch - default_pitch).abs();
        if score < 0.6 || !near_reference {
            failures.push(format!(
                "multilingual {lang}: {pitch:.0} Hz, Wörter {:.0}%",
                score * 100.0
            ));
        }
    }
    if models.contains(&"chatterbox-turbo") {
        let (turbo_default, _) = say("chatterbox-turbo", "preset:default", EN, "en").await;
        let (pitch, score) = say("chatterbox-turbo", &voice, EN, "en").await;
        if score < 0.6 || (pitch - reference_pitch).abs() >= (pitch - turbo_default).abs() {
            failures.push(format!(
                "turbo: {pitch:.0} Hz, Wörter {:.0}%",
                score * 100.0
            ));
        }
    }
    tts_local::delete_cloned_voice(&clone.id).unwrap();
    engine.stop().await;
    assert!(failures.is_empty(), "Klon nicht gelungen: {failures:?}");
}

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
        "qwen3-tts-1.7b-voicedesign",
        "tada-3b-ml",
        "chatterbox-turbo",
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
        // VoiceDesign lines carry the voice description in `voice`.
        let description = if line.model.ends_with("voicedesign") {
            line.voice.as_str()
        } else {
            ""
        };
        let result = engine
            .synthesize_with(
                line.model,
                &line.voice,
                line.text,
                line.lang,
                1.0,
                otakusoul_lib::modules::tts_local::VoicePrompt {
                    description,
                    style: "",
                },
            )
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
    // Chatterbox Turbo (English), plain and with sound tags. Its German fine-tune Kartoffelbox
    // was tried and dropped: it adds invented English phrases (2026-10-06).
    for (model, lang, text) in [
        ("chatterbox-turbo", "en", EN),
        ("chatterbox-turbo", "en", EN_TAGS),
    ] {
        run(Line {
            model,
            voice: "preset:default".into(),
            lang,
            text,
        })
        .await;
    }
    // TADA: built-in reference voice per language.
    for (lang, text, voice) in [
        ("de", DE, "preset:tada-ref-de"),
        ("en", EN, "preset:tada-ref"),
    ] {
        run(Line {
            model: "tada-3b-ml",
            voice: voice.into(),
            lang,
            text,
        })
        .await;
    }
    // VoiceDesign: the voice comes from a description.
    for (lang, text) in [("de", DE), ("en", EN)] {
        run(Line {
            model: "qwen3-tts-1.7b-voicedesign",
            voice: "A calm, warm young female voice, speaking softly and a little slowly.".into(),
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
        // TADA clones the WAV on the fly with the aligner of the clone's language.
        for (lang, text) in [("de", WARM), ("en", EN)] {
            run(Line {
                model: "tada-3b-ml",
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
        local_image::download_model_with(id, true, &|p| {
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
        .any(|m| m.id == "qwen3-tts-customvoice-0.6b" && m.installed)
    {
        let wav = tts_local::engine()
            .synthesize(
                "qwen3-tts-customvoice-0.6b",
                "preset:vivian",
                "Hallo!",
                "de",
                1.0,
            )
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
                        // Count only what the image model uses, after unloading/shrinking.
                        if s.phase == "loading_model" {
                            peak.reset();
                        }
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
                        loras: &[],
                        reference: None,
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

/// Selfies keep the character's look: the app's request with the portrait as reference
/// (Qwen-Image with its vision weights, FLUX.2) or as img2img start (SD 1.5). Pick models with
/// `OTAKUSOUL_E2E_IMAGES` (default: SD 1.5 and Qwen-Image); images go to `OTAKUSOUL_E2E_OUT`.
/// `cargo test --test gpu_e2e selfies -- --ignored --nocapture`
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a GPU and downloads models"]
async fn selfies() {
    use otakusoul_lib::modules::local_image::ImageReference;
    let out = out_dir();
    ensure_runtime(RuntimeKind::Sd, &["vulkan"]).await;
    let ids: Vec<String> = std::env::var("OTAKUSOUL_E2E_IMAGES")
        .map(|s| s.split(',').map(str::to_string).collect())
        .unwrap_or_else(|_| vec!["counterfeit-v3-sd15".into(), "qwen-image-2.1-q4".into()]);
    let portrait = std::fs::read(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../presets/characters/shiori_amane.png"),
    )
    .expect("Porträt");
    let engine = LocalImageEngine::new();
    let llama = Arc::new(LlamaServerManager::new());
    for id in &ids {
        local_image::download_model_with(id, true, &|_| {})
            .await
            .unwrap();
        let started = Instant::now();
        let png = engine
            .generate(
                &|_| {},
                llama.clone(),
                GenerationRequest {
                    model_id: id,
                    strategy: VramStrategy::Swap,
                    // Like the app's prompt writer, which gets the character's description.
                    prompt: "Selfie of a girl with shoulder-length brown hair, round glasses, beige cardigan and green bow tie, holding her phone in a cozy cafe, cherry blossoms outside the window, smiling, anime illustration",
                    negative: "lowres, bad anatomy, watermark, text",
                    seed: 42,
                    loras: &[],
                    reference: Some(ImageReference { png: &portrait, img2img: true }),
                },
            )
            .await
            .unwrap_or_else(|e| panic!("{id}: {e}"));
        let name = format!("selfie-{id}.png");
        std::fs::write(out.join(&name), &png).unwrap();
        assert!(png.starts_with(b"\x89PNG"), "{id}: kein PNG");
        println!(
            "[selfie] {id}: {:.0}s → {name}",
            started.elapsed().as_secs_f32()
        );
    }
    engine.stop().await;
}

/// A dream told on start, with its picture, on real models: the chat model tells the dream from
/// three memories (the app's instruction), the app's prompt writer turns it into an image prompt
/// (kind `dream`) and Qwen-Image draws it with the character's portrait as reference, swapping the
/// chat model out. Chat model from `OTAKUSOUL_E2E_LLM` (default: Gemma 4 12B in assets/models).
/// `cargo test --test gpu_e2e dream_picture -- --ignored --nocapture`
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a GPU, a chat model and Qwen-Image"]
async fn dream_picture() {
    use otakusoul_lib::modules::image_generator::{ImageGenerator, ImagePromptRequest};
    use otakusoul_lib::modules::inference::InferenceClient;
    use otakusoul_lib::modules::local_image::ImageReference;
    use otakusoul_lib::modules::providers::LlmProviderType;
    let out = out_dir();
    ensure_runtime(RuntimeKind::Llama, &["cuda-12", "vulkan"]).await;
    ensure_runtime(RuntimeKind::Sd, &["vulkan"]).await;
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let llm_path = std::env::var("OTAKUSOUL_E2E_LLM").unwrap_or_else(|_| {
        root.join("assets/models/gemma-4-12b-it-Q4_K_M.gguf")
            .to_string_lossy()
            .into_owned()
    });
    let card: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("presets/characters/shiori_amane.json")).unwrap(),
    )
    .unwrap();
    let data = card.get("data").unwrap_or(&card);
    let description = data["description"]
        .as_str()
        .unwrap()
        .replace("{{char}}", "Shiori Amane");
    let portrait = std::fs::read(root.join("presets/characters/shiori_amane.png")).unwrap();

    let llama = Arc::new(LlamaServerManager::new());
    let port = 48_698;
    llama
        .start(LlamaServerConfig {
            model_path: llm_path,
            port,
            context_size: 8192,
            gpu_layers: 99,
            flash_attn: true,
            ..Default::default()
        })
        .await
        .expect("chat model starts");
    let endpoint = format!("http://127.0.0.1:{port}/v1/chat/completions");

    // The instruction the app sends (utils/proactive.ts, kind `dream`).
    let memories = [
        "Kai hat Shiori ein altes Buch über Leuchttürme ausgeliehen",
        "Bei einem Gewitter saßen beide in der Bibliothek fest",
        "Shiori möchte einmal das Meer bei Kamakura im Winter sehen",
    ];
    let woven = memories
        .iter()
        .map(|m| format!("- {m}"))
        .collect::<Vec<_>>()
        .join("\n");
    let instruction = format!(
        "[Shiori Amane has just woken up and tells Kai on their own initiative, like a short text message, about a dream they had tonight. The dream strangely mixes these memories of theirs:\n{woven}\nMake it vivid, a little surreal and short, stay in character and end with a feeling or a small question. Do not list the memories, and do not mention timers or being an AI.]"
    );
    let client = reqwest::Client::new();
    let started = Instant::now();
    let reply: serde_json::Value = client
        .post(&endpoint)
        .json(&serde_json::json!({
            "messages": [
                {"role": "system", "content": format!("You are Shiori Amane. {description}\nReply in German.")},
                {"role": "user", "content": "Gute Nacht, Shiori!"},
                {"role": "assistant", "content": "*klappt das Buch zu* Gute Nacht, Kai. Schlaf gut."},
                {"role": "user", "content": instruction},
            ],
            "max_tokens": 400,
            "temperature": 0.8,
            "chat_template_kwargs": {"enable_thinking": false},
        }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let dream = reply["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .trim()
        .to_string();
    println!(
        "[dream] {:.0}s:\n{dream}\n",
        started.elapsed().as_secs_f32()
    );
    assert!(dream.chars().count() > 40, "kein Traum: {reply}");

    let prompt = ImageGenerator::write_image_prompt(
        &InferenceClient::new(),
        ImagePromptRequest {
            endpoint_url: endpoint,
            api_key: None,
            model: None,
            provider: Some(LlmProviderType::LocalLlama),
            kind: "dream".into(),
            style: "natural".into(),
            subject: "Shiori Amane".into(),
            description,
            context: vec![dream.clone()],
        },
    )
    .await
    .expect("image prompt");
    println!("[dream] Bild-Prompt: {prompt}\n");

    let engine = LocalImageEngine::new();
    local_image::download_model_with("qwen-image-2.1-q4", true, &|_| {})
        .await
        .unwrap();
    let started = Instant::now();
    let png = engine
        .generate(
            &|s| println!("[dream] {}", s.phase),
            llama.clone(),
            GenerationRequest {
                model_id: "qwen-image-2.1-q4",
                strategy: VramStrategy::Swap,
                prompt: &prompt,
                negative: "lowres, bad anatomy, watermark, text",
                seed: 7,
                loras: &[],
                reference: Some(ImageReference {
                    png: &portrait,
                    img2img: false,
                }),
            },
        )
        .await
        .expect("dream picture");
    println!("[dream] Bild nach {:.0}s", started.elapsed().as_secs_f32());
    std::fs::write(out.join("dream.txt"), format!("{dream}\n\n{prompt}\n")).unwrap();
    std::fs::write(out.join("dream-qwen-image.png"), &png).unwrap();
    engine.stop().await;
    llama.stop().await.ok();
}

/// LoRAs reach `sd-server` through the app's request: the same seed with and without a LoRA
/// gives different images; the SD 1.5 tier generates. Downloads the catalog files it needs.
/// `cargo test --test gpu_e2e loras -- --ignored --nocapture`
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a GPU and downloads models"]
async fn loras() {
    use otakusoul_lib::modules::image_loras::{self, LoraSelection};
    let out = out_dir();
    ensure_runtime(RuntimeKind::Sd, &["vulkan"]).await;
    for id in ["counterfeit-v3-sd15", "animagine-xl-4"] {
        local_image::download_model_with(id, true, &|_| {})
            .await
            .unwrap();
    }
    image_loras::download_lora_with("pastel-anime-xl", &|_| {})
        .await
        .expect("Pastel Anime XL herunterladen");
    let pastel = image_loras::list_loras()
        .into_iter()
        .find(|l| l.catalog_id.as_deref() == Some("pastel-anime-xl"))
        .unwrap();
    assert!(
        pastel.installed,
        "Pastel Anime XL in loras/ herunterladen (App oder curl)"
    );

    let engine = LocalImageEngine::new();
    let llama = Arc::new(LlamaServerManager::new());
    let generate = async |model_id: &str, loras: &[LoraSelection]| {
        let started = Instant::now();
        let png = engine
            .generate(
                &|_| {},
                llama.clone(),
                GenerationRequest {
                    model_id,
                    strategy: VramStrategy::Swap,
                    prompt: "1girl, silver hair, school uniform, cherry blossoms, smiling",
                    negative: "lowres, bad anatomy, worst quality",
                    seed: 42,
                    loras,
                    reference: None,
                },
            )
            .await
            .expect("image generated");
        println!(
            "[lora] {model_id} mit {} LoRA(s): {:.0}s",
            loras.len(),
            started.elapsed().as_secs_f32()
        );
        png
    };

    let sd15 = generate("counterfeit-v3-sd15", &[]).await;
    std::fs::write(out.join("lora-sd15.png"), &sd15).unwrap();
    let plain = generate("animagine-xl-4", &[]).await;
    let pastel = [LoraSelection {
        file: pastel.file,
        weight: 1.0,
    }];
    let styled = generate("animagine-xl-4", &pastel).await;
    std::fs::write(out.join("lora-sdxl-plain.png"), &plain).unwrap();
    std::fs::write(out.join("lora-sdxl-pastel.png"), &styled).unwrap();
    // A LoRA of another family is left out: same image as without.
    let flux_only = [LoraSelection {
        file: "flux-ghibsky-illustration.safetensors".into(),
        weight: 1.0,
    }];
    let unchanged = generate("animagine-xl-4", &flux_only).await;
    engine.stop().await;
    assert_ne!(plain, styled, "LoRA ändert das Bild nicht");
    assert_eq!(
        plain, unchanged,
        "LoRA einer anderen Modellfamilie wurde mitgeschickt"
    );
}

/// Chat models as the app sets them up: each GGUF in `assets/models` (or `OTAKUSOUL_E2E_LLMS`,
/// comma-separated paths) starts with the recommended context and GPU layers; checks the context
/// the server reports, one slot, the VRAM estimate against `nvidia-smi`, the speed, and a prompt
/// that fills the context almost completely.
///
/// ```text
/// cargo test --test gpu_e2e llm -- --ignored --nocapture
/// ```
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a GPU and local chat models"]
async fn llm() {
    use otakusoul_lib::modules::hardware;
    let models: Vec<PathBuf> = match std::env::var("OTAKUSOUL_E2E_LLMS") {
        Ok(list) => list.split(',').map(PathBuf::from).collect(),
        Err(_) => {
            let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../assets/models");
            let mut found: Vec<PathBuf> = std::fs::read_dir(&dir)
                .map(|entries| entries.flatten().map(|e| e.path()).collect())
                .unwrap_or_default();
            found.retain(|p| {
                p.extension().is_some_and(|e| e == "gguf")
                    && !p.to_string_lossy().contains("mmproj")
            });
            found.sort();
            found
        }
    };
    assert!(!models.is_empty(), "keine Chat-Modelle gefunden");
    let prism = |p: &Path| {
        let name = p.to_string_lossy().to_ascii_lowercase();
        name.contains("pq2_0") || name.contains("ptq1_0")
    };
    if models.iter().any(|p| prism(p)) {
        ensure_runtime(RuntimeKind::Prism, &["cuda-12", "vulkan"]).await;
    }
    if models.iter().any(|p| !prism(p)) {
        ensure_runtime(RuntimeKind::Llama, &["cuda-12", "vulkan"]).await;
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(1800))
        .build()
        .unwrap();
    let base = "http://127.0.0.1:48697";
    let mut rows = Vec::new();
    for model in &models {
        let name = model.file_stem().unwrap().to_string_lossy().to_string();
        let bonsai = name.to_ascii_lowercase().contains("bonsai");
        // As `selectLocalModel` does: Bonsai with a q4 cache, others f16.
        let cache = if bonsai { "q4_0" } else { "f16" };
        let path = model.to_string_lossy().to_string();
        let rec = {
            let path = path.clone();
            tokio::task::spawn_blocking(move || {
                hardware::recommend_gpu_layers(0, 0, 4096, Some(&path), Some(cache), Some(cache))
            })
            .await
            .unwrap()
        };
        println!(
            "\n[{name}] Empfehlung: Kontext {} (gelernt {}), {} GPU-Layer, geschätzt {} MB (Kontext {} MB)",
            rec.recommended_context_size,
            rec.trained_context_size,
            rec.recommended_layers,
            rec.estimated_vram_usage_mb,
            rec.estimated_context_vram_mb
        );
        let llama = LlamaServerManager::new();
        let config = LlamaServerConfig {
            model_path: path.clone(),
            port: 48_697,
            context_size: rec.recommended_context_size,
            gpu_layers: rec.recommended_layers,
            flash_attn: true,
            cache_type_k: Some(cache.into()),
            cache_type_v: Some(cache.into()),
            ..Default::default()
        };
        let idle = vram_used_mb();
        let started = Instant::now();
        if let Err(e) = llama.start(config).await {
            println!(
                "[{name}] Start fehlgeschlagen: {}",
                e.chars().take(400).collect::<String>()
            );
            rows.push(format!(
                "| {name} | – | – | – | Start fehlgeschlagen | – | – |"
            ));
            continue;
        }
        let load_secs = started.elapsed().as_secs_f32();
        let loaded = vram_used_mb().saturating_sub(idle);
        let props: serde_json::Value = client
            .get(format!("{base}/props"))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let n_ctx = props["default_generation_settings"]["n_ctx"]
            .as_u64()
            .unwrap_or(0);
        let slots = props["total_slots"].as_u64().unwrap_or(0);
        assert_eq!(slots, 1, "--parallel 1 wirkt nicht");
        assert_eq!(
            n_ctx,
            u64::from(rec.recommended_context_size),
            "Server meldet anderen Kontext"
        );

        // Speed with a short request through the chat endpoint the app uses (with the model's
        // chat template; some models end a raw prompt at once).
        let short: serde_json::Value = client
            .post(format!("{base}/v1/chat/completions"))
            .json(&serde_json::json!({
                "messages": [{ "role": "user", "content": "Write a short, friendly greeting from an anime character to a friend who just came home." }],
                "max_tokens": 128, "temperature": 0.7
            }))
            .send().await.unwrap().json().await.unwrap();
        let gen_speed = short["timings"]["predicted_per_second"]
            .as_f64()
            .unwrap_or(0.0);
        assert!(
            gen_speed > 0.0,
            "{name}: keine Antwort über die Chat-Schnittstelle"
        );

        // A prompt filling ~90 % of the context (at most 32K tokens to keep the run short).
        let target = (n_ctx as f64 * 0.9).min(32_768.0) as usize;
        let sentence =
            "The old library smelled of candle wax and dust, and somewhere a clock ticked slowly. ";
        let per_sentence: serde_json::Value = client
            .post(format!("{base}/tokenize"))
            .json(&serde_json::json!({ "content": sentence }))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let per = per_sentence["tokens"]
            .as_array()
            .map_or(16, |t| t.len().max(1));
        let long_prompt = sentence.repeat(target / per);
        let peak = VramPeak::start();
        let fill_started = Instant::now();
        let fill = client
            .post(format!("{base}/completion"))
            .json(&serde_json::json!({ "prompt": long_prompt, "n_predict": 16, "cache_prompt": false }))
            .send()
            .await;
        let fill_secs = fill_started.elapsed().as_secs_f32();
        let peak_mb = peak.finish().saturating_sub(idle);
        let (filled, prompt_speed) = match fill {
            Ok(resp) if resp.status().is_success() => {
                let body: serde_json::Value = resp.json().await.unwrap_or_default();
                (
                    body["timings"]["prompt_n"].as_u64().unwrap_or(0),
                    body["timings"]["prompt_per_second"].as_f64().unwrap_or(0.0),
                )
            }
            Ok(resp) => {
                println!("[{name}] voller Kontext: HTTP {}", resp.status());
                (0, 0.0)
            }
            Err(e) => {
                println!("[{name}] voller Kontext: {e}");
                (0, 0.0)
            }
        };
        let alive = llama.get_status().await.state == ServerState::Running;
        llama.stop().await.unwrap();
        let deviation = peak_mb as f64 / rec.estimated_vram_usage_mb.max(1) as f64 * 100.0 - 100.0;
        println!(
            "[{name}] geladen in {load_secs:.0}s, {loaded} MB; voller Kontext ({filled} Tokens in {fill_secs:.0}s, {prompt_speed:.0} t/s) Spitze {peak_mb} MB = Schätzung {deviation:+.0} %; {gen_speed:.1} t/s; Server läuft weiter: {alive}"
        );
        rows.push(format!(
            "| {name} | {} | {} | {} MB | {peak_mb} MB ({deviation:+.0} %) | {gen_speed:.1} t/s | {filled} Tokens, {prompt_speed:.0} t/s |",
            rec.recommended_context_size,
            if rec.recommended_layers >= 99 { "alle".to_string() } else { rec.recommended_layers.to_string() },
            rec.estimated_vram_usage_mb,
        ));
        assert!(alive, "{name}: Server nach vollem Kontext abgestürzt");
        assert!(filled > 0, "{name}: voller Kontext nicht verarbeitet");
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
    println!(
        "\n| Modell | Kontext | GPU-Layer | Schätzung | Gemessen (Spitze) | Antwort | Voller Kontext |\n|---|---|---|---|---|---|---|"
    );
    for row in rows {
        println!("{row}");
    }
}

/// Memory pipeline against real chat models: does the reflection retire contradicted facts,
/// plan real and story intentions, resolve done ones, merge long habit lists, and does the
/// cleanup propose sensible groups? Runs in a throw-away profile; prints one row per model.
///
/// ```text
/// OTAKUSOUL_E2E_LLMS=/path/a.gguf,/path/b.gguf cargo test --test gpu_e2e memory -- --ignored --nocapture
/// ```
#[tokio::test(flavor = "multi_thread")]
#[ignore = "needs a GPU and local chat models"]
async fn memory() {
    use otakusoul_lib::modules::{
        hardware,
        memory::IntentionDraft,
        memory_pipeline::{self, MemoryCleanupRequest, SoulMemoryPipelineRequest},
        providers::LlmProviderType,
    };
    use otakusoul_lib::state::AppState;

    // A throw-away profile that uses the installed llama.cpp build (no download, no update).
    let real_data = otakusoul_lib::modules::paths::base_dirs().1;
    let home = std::env::temp_dir().join(format!("otakusoul-memory-e2e-{}", std::process::id()));
    std::fs::create_dir_all(home.join("config")).unwrap();
    std::fs::create_dir_all(home.join("data")).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(real_data.join("runtimes"), home.join("data/runtimes")).unwrap();
    // A junction needs no admin rights or developer mode (unlike a symlink).
    #[cfg(windows)]
    assert!(
        std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(home.join("data").join("runtimes"))
            .arg(real_data.join("runtimes"))
            .stdout(std::process::Stdio::null())
            .status()
            .is_ok_and(|s| s.success()),
        "Runtime-Verknüpfung fehlgeschlagen"
    );
    // SAFETY: set once before anything reads the environment.
    unsafe { std::env::set_var("OTAKUSOUL_HOME", &home) };
    let models: Vec<PathBuf> = std::env::var("OTAKUSOUL_E2E_LLMS")
        .expect("OTAKUSOUL_E2E_LLMS=/pfad/modell.gguf[,…]")
        .split(',')
        .map(PathBuf::from)
        .collect();
    let runtime = runtimes::installed(RuntimeKind::Llama).expect("llama.cpp ist nicht installiert");
    println!("llama.cpp {} {}", runtime.build, runtime.backend);
    let state = AppState::new();
    let db = state.memory_db.clone();
    let port = 48_698;
    let endpoint = format!("http://127.0.0.1:{port}/v1/chat/completions");
    let today = chrono::Local::now().date_naive();
    let tomorrow = today.succ_opt().unwrap();
    let mut rows = Vec::new();

    for model in &models {
        let name = model.file_stem().unwrap().to_string_lossy().to_string();
        let path = model.to_string_lossy().to_string();
        let rec = {
            let path = path.clone();
            tokio::task::spawn_blocking(move || {
                hardware::recommend_gpu_layers(0, 0, 16_384, Some(&path), Some("f16"), Some("f16"))
            })
            .await
            .unwrap()
        };
        let llama = LlamaServerManager::new();
        let config = LlamaServerConfig {
            model_path: path,
            port,
            context_size: rec.recommended_context_size.min(16_384),
            gpu_layers: rec.recommended_layers,
            flash_attn: true,
            ..Default::default()
        };
        if let Err(e) = llama.start(config).await {
            println!(
                "[{name}] Start fehlgeschlagen: {}",
                e.chars().take(300).collect::<String>()
            );
            continue;
        }
        let tag = name
            .chars()
            .filter(char::is_ascii_alphanumeric)
            .take(12)
            .collect::<String>();
        let reflect = |char_id: String, lines: Vec<(&'static str, &'static str)>| {
            let state = &state;
            let endpoint = endpoint.clone();
            async move {
                let session = state
                    .memory_db
                    .create_chat_session(&char_id, "Test")
                    .unwrap();
                for (role, text) in lines {
                    state
                        .memory_db
                        .add_chat_message(&session.id, role, text, None, &[])
                        .unwrap();
                }
                let started = Instant::now();
                let result = memory_pipeline::execute_memory_pipeline(
                    state,
                    SoulMemoryPipelineRequest {
                        character_id: char_id.clone(),
                        user_name: "Kai".into(),
                        chat_id: Some(session.id),
                        endpoint_url: endpoint,
                        api_key: None,
                        model: None,
                        provider: Some(LlmProviderType::LocalLlama),
                        recent_turn_count: Some(8),
                        include_diary: Some(false),
                        transcript: None,
                        speaker_names: None,
                    },
                )
                .await;
                (result, started.elapsed().as_secs())
            }
        };

        // 1. A contradicted fact is retired (or the router at least writes a new version).
        let who = format!("Aiko{tag}1");
        let munich = db
            .add_episodic_memory(&who, "fact", "Kai wohnt in München", 3)
            .unwrap();
        let (result, secs1) = reflect(who.clone(), vec![
            ("user", "Ich muss dir was erzählen: Ich bin letzte Woche von München nach Hamburg gezogen!"),
            ("assistant", "*reißt die Augen auf* Nach Hamburg? Wow, das ist ja ein riesiger Schritt! Wie ist die neue Wohnung?"),
            ("user", "Klein, aber mit Blick auf den Hafen. München vermisse ich gar nicht mehr."),
            ("assistant", "*lächelt* Dann musst du mir unbedingt Fotos vom Hafen zeigen."),
        ]).await;
        let error1 = result.err();
        let superseded = db
            .get_superseded_memories(&who, 10)
            .unwrap()
            .iter()
            .any(|m| m.id == munich);
        let hamburg = db
            .get_episodic_memories(&who, 20)
            .unwrap()
            .iter()
            .any(|m| m.content.contains("Hamburg"))
            || db
                .get_or_create_relationship(&who, "Kai")
                .unwrap()
                .known_attributes
                .contains("Hamburg");

        // 2. Real and story intentions with the right time basis and date.
        let who = format!("Aiko{tag}2");
        let (result, secs2) = reflect(who.clone(), vec![
            ("user", "Kannst du mich morgen um 9 Uhr an mein Vorstellungsgespräch erinnern? Ich bin so nervös."),
            ("assistant", "Na klar! Morgen um neun denke ich an dich und drück dir die Daumen."),
            ("user", "*sattelt die Pferde* Und in unserer Geschichte: Bei Sonnenaufgang reiten wir zur Burg der Nebelkönigin."),
            ("assistant", "*zieht den Umhang fester* Bei Sonnenaufgang also. Ich bringe die Karte mit, die ich dir versprochen habe."),
        ]).await;
        let error2 = result.err();
        let plans = db.get_intentions(&who, "Kai", true).unwrap();
        let interview = plans.iter().find(|p| {
            let t = p.title.to_lowercase();
            t.contains("vorstellung") || t.contains("interview") || t.contains("gespräch")
        });
        let interview_ok = interview.is_some_and(|p| {
            p.time_basis == "real"
                && p.due_at
                    .and_then(|d| {
                        chrono::TimeZone::timestamp_opt(&chrono::Local, d as i64, 0).single()
                    })
                    .is_some_and(|d| d.date_naive() == tomorrow)
        });
        let castle_story = plans.iter().any(|p| {
            p.time_basis == "story" && {
                let t = p.title.to_lowercase();
                ["burg", "reit", "karte", "castle", "ride", "journey", "map"]
                    .iter()
                    .any(|w| t.contains(w))
            }
        });
        let story_dated = plans
            .iter()
            .any(|p| p.time_basis == "story" && p.due_at.is_some());

        // 3. A done plan is resolved.
        let who = format!("Aiko{tag}3");
        db.add_intention(
            &who,
            "Kai",
            &IntentionDraft {
                title: "Zusammen italienisch kochen".into(),
                initiator: "both".into(),
                time_basis: "real".into(),
                ..Default::default()
            },
        )
        .unwrap();
        let (result, secs3) = reflect(who.clone(), vec![
            ("user", "Das Kochen gestern Abend mit dir war so schön! Die selbstgemachte Pasta war perfekt."),
            ("assistant", "*strahlt* Fand ich auch! Endlich haben wir unser italienisches Kochabend-Versprechen eingelöst."),
        ]).await;
        let error3 = result.err();
        let cooking = db.get_intentions(&who, "Kai", true).unwrap();
        let fulfilled = cooking
            .iter()
            .any(|p| p.title.contains("italienisch") && p.status == "fulfilled");

        // 4. A long habit list is merged.
        let who = format!("Aiko{tag}4");
        let mut rel = db.get_or_create_relationship(&who, "Kai").unwrap();
        rel.preferences_habits = [
            "Mag Dango",
            "Mag Mochi",
            "Mag Taiyaki",
            "Trinkt morgens Grüntee",
            "Trinkt abends Jasmintee",
            "Hört Lo-Fi beim Lernen",
            "Hört Jazz beim Kochen",
            "Joggt sonntags",
            "Joggt mittwochs",
            "Liest Fantasy-Romane",
            "Liest Mangas vor dem Schlafen",
            "Mag Regen",
            "Mag Gewitter",
            "Hasst laute Bars",
        ]
        .iter()
        .map(|s| s.to_string())
        .collect();
        db.update_relationship(&who, &rel).unwrap();
        let (result, secs4) = reflect(who.clone(), vec![
            ("user", "Heute war ein langer Tag. Ich hab nach der Arbeit noch Mochi gekauft, die mit Erdbeere."),
            ("assistant", "*nimmt sich einen* Erdbeer-Mochi! Du kennst mich einfach zu gut."),
        ]).await;
        let error4 = result.err();
        let habits = db
            .get_or_create_relationship(&who, "Kai")
            .unwrap()
            .preferences_habits;
        let merged = habits.len() <= 12;

        // 5. Cleanup proposes groups of overlapping memories.
        let who = format!("Aiko{tag}5");
        for text in [
            "Kai trinkt morgens Grüntee",
            "Kai mag grünen Tee am liebsten am Morgen",
            "Kai hat eine Katze namens Mochi",
            "Kais Katze Mochi ist drei Jahre alt",
            "Kai arbeitet als Grafikdesigner",
        ] {
            db.add_episodic_memory(&who, "fact", text, 3).unwrap();
        }
        let started = Instant::now();
        let proposal = memory_pipeline::propose_memory_cleanup(
            &state,
            MemoryCleanupRequest {
                character_id: who.clone(),
                endpoint_url: endpoint.clone(),
                api_key: None,
                model: None,
                provider: Some(LlmProviderType::LocalLlama),
            },
        )
        .await;
        let secs5 = started.elapsed().as_secs();
        let (groups, cleanup_note) = match &proposal {
            Ok(p) => (
                p.groups.len(),
                p.groups
                    .iter()
                    .map(|g| format!("{:?}: {}", g.memory_ids, g.summary))
                    .collect::<Vec<_>>()
                    .join(" | "),
            ),
            Err(e) => (0, format!("Fehler: {e}")),
        };
        llama.stop().await.ok();

        let mark = |ok: bool| if ok { "✅" } else { "❌" };
        println!("\n[{name}]");
        println!(
            "  1 Widerspruch ({secs1}s): abgelöst {} · neue Fassung {} {}",
            mark(superseded),
            mark(hamburg),
            error1.unwrap_or_default()
        );
        println!(
            "  2 Vorhaben ({secs2}s): echt+morgen {} · Geschichte {} · Geschichte ohne Datum {} {}",
            mark(interview_ok),
            mark(castle_story),
            mark(!story_dated),
            error2.unwrap_or_default()
        );
        for p in &plans {
            println!(
                "      - [{} {:?} {}] {} ({})",
                p.time_basis, p.due_at, p.due_has_time, p.title, p.initiator
            );
        }
        println!(
            "  3 Erledigt ({secs3}s): {} {}",
            mark(fulfilled),
            error3.unwrap_or_default()
        );
        for p in &cooking {
            println!("      - [{}] {}", p.status, p.title);
        }
        println!(
            "  4 Gewohnheiten ({secs4}s): {} → {} {} {:?}",
            14,
            habits.len(),
            mark(merged),
            error4.unwrap_or_default()
        );
        println!("      {habits:?}");
        println!(
            "  5 Aufräumen ({secs5}s): {groups} Gruppe(n) {} – {cleanup_note}",
            mark(groups >= 1)
        );
        rows.push(format!(
            "| {name} | {} {} | {} {} {} | {} | {} ({}) | {} ({groups}) |",
            mark(superseded),
            mark(hamburg),
            mark(interview_ok),
            mark(castle_story),
            mark(!story_dated),
            mark(fulfilled),
            mark(merged),
            habits.len(),
            mark(groups >= 1),
        ));
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
    println!(
        "\n| Modell | Widerspruch (abgelöst, neu) | Vorhaben (echt, Geschichte, ohne Datum) | Erledigt | Gewohnheiten | Aufräumen |"
    );
    println!("|---|---|---|---|---|---|");
    for row in rows {
        println!("{row}");
    }
    let _ = std::fs::remove_dir_all(&home);
}
