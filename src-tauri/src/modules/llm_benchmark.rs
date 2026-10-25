//! Built-in speed test of the local chat model: one fixed prompt (about 700 tokens) is read and
//! 128 tokens are written, and llama-server's own timings say how fast that went. Results are
//! kept per model and setting in `<Daten>/llm_benchmarks.json`, so models can be compared.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use ts_rs::TS;

use crate::modules::llama_manager::LlamaServerConfig;

const FILE_NAME: &str = "llm_benchmarks.json";
/// Results kept (newest first).
const KEEP: usize = 50;
/// Tokens written in the measured run (generation runs to the end, ignoring the end token).
const GENERATE: u32 = 128;
/// Writing speed from which replies feel fluent (faster than one reads) and still usable.
const SMOOTH_TPS: f64 = 15.0;
const USABLE_TPS: f64 = 6.0;

/// One measurement of a local chat model with the settings it ran with.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct BenchmarkResult {
    pub id: String,
    /// RFC 3339.
    pub created_at: String,
    pub model_name: String,
    pub model_path: String,
    pub context_size: u32,
    pub gpu_layers: u32,
    pub cache_type: Option<String>,
    pub flash_attn: bool,
    /// File name of the LoRA adapter in use.
    pub lora: Option<String>,
    pub prompt_tokens: u32,
    /// Reading the prompt (prompt processing), tokens per second.
    pub prompt_tps: f64,
    pub gen_tokens: u32,
    /// Writing the reply (generation), tokens per second.
    pub gen_tps: f64,
    /// Time until the first word of a reply to this prompt.
    pub first_token_ms: u64,
    /// Graphics memory of llama-server (NVIDIA only).
    pub vram_mb: Option<u64>,
    /// `smooth`, `usable` or `slow`.
    pub rating: String,
}

/// How a writing speed feels in the chat.
pub fn rating(gen_tps: f64) -> &'static str {
    if gen_tps >= SMOOTH_TPS {
        "smooth"
    } else if gen_tps >= USABLE_TPS {
        "usable"
    } else {
        "slow"
    }
}

/// The test text: a fixed story passage (German, as most chats here), about 700 tokens.
fn prompt() -> String {
    let passage = "Der Regen trommelte gegen die Fenster der alten Bibliothek, als Shiori die letzte \
        Kerze anzündete. Zwischen den Regalen roch es nach Staub, Tinte und Lavendel. Sie zog ein \
        schweres Buch mit abgegriffenem Ledereinband hervor, dessen Seiten von Karten fremder Länder, \
        vergessener Häfen und verschlungener Bergpfade erzählten. Draußen schlug die Turmuhr elf, \
        und irgendwo im Dunkel knarrte eine Tür, obwohl niemand mehr im Haus sein sollte. ";
    let mut text = String::from(
        "Lies den folgenden Abschnitt und erzähle die Geschichte danach in eigenen Worten weiter.\n\n",
    );
    for _ in 0..6 {
        text.push_str(passage);
    }
    text.push_str("\n\nWie geht es weiter?");
    text
}

/// Timings llama-server reports with a finished completion.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Timings {
    prompt_n: u32,
    prompt_ms: f64,
    prompt_per_second: f64,
    predicted_n: u32,
    predicted_per_second: f64,
}

fn parse_timings(response: &serde_json::Value) -> Option<Timings> {
    let t = response.get("timings")?;
    let num = |key: &str| t.get(key).and_then(serde_json::Value::as_f64);
    let timings = Timings {
        prompt_n: num("prompt_n")? as u32,
        prompt_ms: num("prompt_ms")?,
        prompt_per_second: num("prompt_per_second")?,
        predicted_n: num("predicted_n")? as u32,
        predicted_per_second: num("predicted_per_second")?,
    };
    (timings.predicted_n > 0 && timings.predicted_per_second.is_finite()).then_some(timings)
}

fn file_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_string()
}

fn result_from(
    config: &LlamaServerConfig,
    timings: Timings,
    vram_mb: Option<u64>,
    now: chrono::DateTime<chrono::Utc>,
) -> BenchmarkResult {
    let round = |v: f64| (v * 10.0).round() / 10.0;
    let lora = config
        .lora_path
        .as_deref()
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(file_name);
    BenchmarkResult {
        id: format!("{}", now.timestamp_millis()),
        created_at: now.to_rfc3339(),
        model_name: file_name(&config.model_path)
            .trim_end_matches(".gguf")
            .to_string(),
        model_path: config.model_path.clone(),
        context_size: config.context_size,
        gpu_layers: config.gpu_layers,
        cache_type: config.cache_type_k.clone().filter(|c| !c.is_empty()),
        flash_attn: config.flash_attn,
        lora,
        prompt_tokens: timings.prompt_n,
        prompt_tps: round(timings.prompt_per_second),
        gen_tokens: timings.predicted_n,
        gen_tps: round(timings.predicted_per_second),
        first_token_ms: timings.prompt_ms.max(0.0).round() as u64,
        vram_mb,
        rating: rating(timings.predicted_per_second).to_string(),
    }
}

async fn complete(
    client: &reqwest::Client,
    port: u16,
    body: serde_json::Value,
) -> Result<serde_json::Value, String> {
    client
        .post(format!("http://127.0.0.1:{port}/completion"))
        .json(&body)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| crate::err!("backend.benchmark.failed", error = e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| crate::err!("backend.benchmark.failed", error = e))
}

/// Measures the running server of `config`: a short warm-up, then the test prompt.
pub async fn run(config: &LlamaServerConfig) -> Result<BenchmarkResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;
    // The first request after loading pays for buffers and caches.
    complete(
        &client,
        config.port,
        serde_json::json!({ "prompt": "Hallo", "n_predict": 4, "cache_prompt": false }),
    )
    .await?;
    let response = complete(
        &client,
        config.port,
        serde_json::json!({
            "prompt": prompt(),
            "n_predict": GENERATE,
            "temperature": 0,
            "ignore_eos": true,
            "cache_prompt": false,
        }),
    )
    .await?;
    let timings = parse_timings(&response)
        .ok_or_else(|| crate::err!("backend.benchmark.failed", error = "keine Zeitmessung"))?;
    let vram = tokio::task::spawn_blocking(|| {
        let used: u64 = crate::modules::hardware::gpu_memory_users()
            .into_iter()
            .filter(|(name, _)| name.starts_with("llama-server"))
            .map(|(_, mb)| mb)
            .sum();
        (used > 0).then_some(used)
    })
    .await
    .ok()
    .flatten();
    let result = result_from(config, timings, vram, chrono::Utc::now());
    save(&path(), &result)?;
    Ok(result)
}

fn path() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir).join(FILE_NAME)
}

fn load_from(path: &Path) -> Vec<BenchmarkResult> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn save(path: &Path, result: &BenchmarkResult) -> Result<(), String> {
    let mut all = load_from(path);
    all.insert(0, result.clone());
    all.truncate(KEEP);
    write(path, &all)
}

fn write(path: &Path, all: &[BenchmarkResult]) -> Result<(), String> {
    let text = serde_json::to_string_pretty(all).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

/// The kept results, newest first.
pub fn list() -> Vec<BenchmarkResult> {
    load_from(&path())
}

/// Forgets all results.
pub fn clear() -> Result<(), String> {
    write(&path(), &[])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn timings(gen_tps: f64) -> Timings {
        Timings {
            prompt_n: 512,
            prompt_ms: 180.4,
            prompt_per_second: 2838.14,
            predicted_n: 128,
            predicted_per_second: gen_tps,
        }
    }

    #[test]
    fn reads_the_timings_of_llama_server() {
        let response = serde_json::json!({
            "content": "…",
            "timings": {
                "prompt_n": 512, "prompt_ms": 180.4, "prompt_per_second": 2838.14,
                "predicted_n": 128, "predicted_ms": 1500.0, "predicted_per_second": 85.3
            }
        });
        assert_eq!(parse_timings(&response), Some(timings(85.3)));
        assert_eq!(parse_timings(&serde_json::json!({ "content": "x" })), None);
        let mut nothing = response.clone();
        nothing["timings"]["predicted_n"] = 0.into();
        assert_eq!(parse_timings(&nothing), None, "nichts erzeugt");
    }

    #[test]
    fn rates_the_writing_speed() {
        assert_eq!(rating(42.0), "smooth");
        assert_eq!(rating(15.0), "smooth");
        assert_eq!(rating(8.0), "usable");
        assert_eq!(rating(2.5), "slow");
    }

    #[test]
    fn result_names_model_and_settings() {
        let config = LlamaServerConfig {
            model_path: "/m/gemma-4-12b-it-Q4_K_M.gguf".into(),
            context_size: 32_768,
            lora_path: Some("/d/chat-loras/gemma-4-12b-heretic.gguf".into()),
            ..Default::default()
        };
        let now = chrono::DateTime::parse_from_rfc3339("2026-10-25T18:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let r = result_from(&config, timings(85.27), Some(9_100), now);
        assert_eq!(r.model_name, "gemma-4-12b-it-Q4_K_M");
        assert_eq!(r.lora.as_deref(), Some("gemma-4-12b-heretic.gguf"));
        assert_eq!(
            (r.prompt_tps, r.gen_tps, r.first_token_ms),
            (2838.1, 85.3, 180)
        );
        assert_eq!(
            (r.context_size, r.cache_type.as_deref()),
            (32_768, Some("q8_0"))
        );
        assert_eq!(r.rating, "smooth");
        assert_eq!(r.created_at, "2026-10-25T18:00:00+00:00");
    }

    #[test]
    fn keeps_the_newest_results() {
        let dir = std::env::temp_dir().join(format!("otakusoul-bench-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join(FILE_NAME);
        let _ = std::fs::remove_file(&file);
        let config = LlamaServerConfig {
            model_path: "m.gguf".into(),
            ..Default::default()
        };
        let base = chrono::Utc::now();
        for i in 0..(KEEP + 3) {
            let now = base + chrono::Duration::seconds(i as i64);
            save(&file, &result_from(&config, timings(i as f64), None, now)).unwrap();
        }
        let all = load_from(&file);
        assert_eq!(all.len(), KEEP);
        assert_eq!(all[0].gen_tps, (KEEP + 2) as f64, "neuestes zuerst");
        // A broken file counts as empty instead of failing.
        std::fs::write(&file, "kaputt").unwrap();
        assert!(load_from(&file).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_test_prompt_is_long_enough() {
        // About 700 tokens: long enough for a stable reading speed, short for any context.
        let words = prompt().split_whitespace().count();
        assert!((350..=600).contains(&words), "{words} Wörter");
    }
}
