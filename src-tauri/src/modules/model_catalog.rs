//! Starter catalog for the setup wizard: the copy shipped with the app
//! (`presets/recommended_models.json`) and the one in the data repository, fetched at start into
//! `<Daten>/recommended_models.json`. The catalog with the higher `version` wins, so new models
//! can be recommended without an app release, and a newer release is not held back by an older
//! download. Entries are checked before use; a broken or empty file falls back to the shipped one.
//!
//! Licences: chat models need no sign-in at the source; their licence may restrict use (Llama,
//! Gemma, NVIDIA, non-commercial, none stated). Such models are listed with that marked
//! (`license_kind`, `license_note`), and the automatic recommendation only picks openly licensed ones.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

const BUNDLED: &str = include_str!("../../../presets/recommended_models.json");
const FILE_NAME: &str = "recommended_models.json";
/// Licences without conditions on use; everything else is marked in the list.
const OPEN_LICENSES: &[&str] = &["Apache-2.0", "MIT", "BSD-2-Clause", "BSD-3-Clause"];
const RUNTIMES: &[&str] = &["standard", "prism"];
const DEFAULT_RESERVE_MB: u64 = 1_536;

#[derive(Debug, Clone, Deserialize)]
pub struct CatalogModel {
    pub id: String,
    pub name: String,
    pub hf_id: String,
    pub file: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub license: String,
    pub quantization: String,
    pub runtime: String,
    /// Recommended whenever it fits, even over larger models.
    #[serde(default)]
    pub preferred: bool,
    /// Estimated VRAM with the start context, in MB.
    pub vram_mb: u64,
    /// Short description per language code.
    #[serde(default)]
    pub description: HashMap<String, String>,
    /// What the licence restricts, per language code (for models without an open licence).
    #[serde(default)]
    pub license_note: HashMap<String, String>,
    /// Page with the licence text; the model page when missing.
    #[serde(default)]
    pub license_url: Option<String>,
    /// Vision projector in the same repository: lets the model see attached images.
    #[serde(default)]
    pub mmproj: Option<CatalogMmproj>,
}

/// A vision projector (`mmproj-*.gguf`) of a catalog model.
#[derive(Debug, Clone, Deserialize)]
pub struct CatalogMmproj {
    /// File name in the model's repository (often just `mmproj-F16.gguf`).
    pub file: String,
    pub size_bytes: u64,
    pub sha256: String,
}

impl CatalogModel {
    /// Name the projector is saved under: repositories share names like `mmproj-F16.gguf`, so
    /// it starts with the model's file name (and contains `mmproj`, so the scan lists it as one).
    pub fn mmproj_target(&self) -> Option<String> {
        let mmproj = self.mmproj.as_ref()?;
        let stem = self.file.strip_suffix(".gguf").unwrap_or(&self.file);
        Some(format!("{stem}-{}", mmproj.file))
    }
}

impl CatalogModel {
    /// `open` (Apache-2.0, MIT, BSD), `noncommercial` or `restricted` (any other or no licence).
    pub fn license_kind(&self) -> &'static str {
        let license = self.license.to_ascii_lowercase();
        if OPEN_LICENSES
            .iter()
            .any(|open| open.eq_ignore_ascii_case(&self.license))
        {
            "open"
        } else if license.contains("-nc")
            || license.contains("noncommercial")
            || license.contains("non-commercial")
        {
            "noncommercial"
        } else {
            "restricted"
        }
    }
}

#[derive(Debug, Clone)]
pub struct Catalog {
    pub version: String,
    /// VRAM left for the desktop and the driver.
    pub desktop_reserve_mb: u64,
    /// Sorted by VRAM.
    pub models: Vec<CatalogModel>,
    /// Settings that families of models need, matched by file name.
    pub model_defaults: Vec<ModelDefaults>,
}

/// Server and sampler values a family of models needs (e.g. Ternary Bonsai: q4 KV cache,
/// thinking on, its own sampler). They are used when a model without a saved profile is chosen.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ModelDefaults {
    /// Applies to models whose file name contains one of these texts (ignoring case).
    #[serde(rename = "match")]
    pub matches: Vec<String>,
    /// Fields of `LlamaServerConfig` (only tuning, see [`SERVER_KEYS`]).
    #[serde(default)]
    pub server: serde_json::Map<String, serde_json::Value>,
    /// Fields of `SamplingParams` (see [`SAMPLING_KEYS`]).
    #[serde(default)]
    pub sampling: serde_json::Map<String, serde_json::Value>,
}

/// Server settings a catalog may set; model, port and projector stay the user's choice.
const SERVER_KEYS: &[&str] = &[
    "flash_attn",
    "reasoning_mode",
    "thinking_budget",
    "cache_type_k",
    "cache_type_v",
    "batch_size",
    "ubatch_size",
];
const SAMPLING_KEYS: &[&str] = &[
    "temperature",
    "top_p",
    "top_k",
    "min_p",
    "repeat_penalty",
    "presence_penalty",
    "frequency_penalty",
];

/// Keeps rules with a name to match and only known fields with plain values.
fn clean_defaults(rules: Vec<ModelDefaults>) -> Vec<ModelDefaults> {
    let keep = |map: serde_json::Map<String, serde_json::Value>, keys: &[&str]| {
        map.into_iter()
            .filter(|(key, value)| {
                keys.contains(&key.as_str())
                    && (value.is_number() || value.is_boolean() || value.is_string())
            })
            .collect()
    };
    rules
        .into_iter()
        .map(|rule| ModelDefaults {
            matches: rule
                .matches
                .into_iter()
                .map(|m| m.trim().to_ascii_lowercase())
                .filter(|m| !m.is_empty())
                .collect(),
            server: keep(rule.server, SERVER_KEYS),
            sampling: keep(rule.sampling, SAMPLING_KEYS),
        })
        .filter(|rule| !rule.matches.is_empty())
        .collect()
}

#[derive(Deserialize)]
struct CatalogFile {
    version: String,
    #[serde(default)]
    desktop_reserve_mb: Option<u64>,
    models: Vec<serde_json::Value>,
    #[serde(default)]
    model_defaults: Vec<ModelDefaults>,
}

/// Set once the start-up download finished (or failed).
static REFRESHED: AtomicBool = AtomicBool::new(false);

fn downloaded_path() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir).join(FILE_NAME)
}

/// `"3.1.0"` → `[3, 1, 0]`; parts that are no numbers count as 0.
fn version_key(version: &str) -> Vec<u64> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| part.trim().parse().unwrap_or(0))
        .collect()
}

fn is_newer(candidate: &str, than: &str) -> bool {
    let (mut a, mut b) = (version_key(candidate), version_key(than));
    let len = a.len().max(b.len());
    a.resize(len, 0);
    b.resize(len, 0);
    a > b
}

/// A plain name: no path separators, no `..`, nothing hidden.
fn plain_segment(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && !name.contains(['/', '\\'])
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
}

fn usable(model: &CatalogModel) -> bool {
    let repo_ok = model
        .hf_id
        .split_once('/')
        .is_some_and(|(owner, name)| plain_segment(owner) && plain_segment(name));
    !model.id.trim().is_empty()
        && !model.name.trim().is_empty()
        && repo_ok
        && plain_segment(&model.file)
        && model.file.to_ascii_lowercase().ends_with(".gguf")
        && model.size_bytes > 0
        && model.vram_mb > 0
        && model.sha256.len() == 64
        && model.sha256.chars().all(|c| c.is_ascii_hexdigit())
        && !model.license.trim().is_empty()
        && model
            .license_url
            .as_deref()
            .is_none_or(|url| url.starts_with("https://"))
        && RUNTIMES.contains(&model.runtime.as_str())
        && model.mmproj.as_ref().is_none_or(|m| {
            plain_segment(&m.file)
                && m.file.to_ascii_lowercase().contains("mmproj")
                && m.file.to_ascii_lowercase().ends_with(".gguf")
                && m.size_bytes > 0
                && m.sha256.len() == 64
                && m.sha256.chars().all(|c| c.is_ascii_hexdigit())
        })
}

/// Reads a catalog and keeps the entries the app can offer; `None` if none is left.
fn parse(text: &str) -> Option<Catalog> {
    let file: CatalogFile = serde_json::from_str(text).ok()?;
    let mut models: Vec<CatalogModel> = Vec::new();
    for raw in file.models {
        match serde_json::from_value::<CatalogModel>(raw) {
            Ok(model) if usable(&model) && !models.iter().any(|m| m.id == model.id) => {
                models.push(model)
            }
            Ok(model) => tracing::warn!("Modellkatalog: Eintrag {} übersprungen", model.id),
            Err(e) => tracing::warn!("Modellkatalog: ungültiger Eintrag übersprungen: {e}"),
        }
    }
    if models.is_empty() {
        return None;
    }
    models.sort_by_key(|m| m.vram_mb);
    Some(Catalog {
        version: file.version,
        desktop_reserve_mb: file.desktop_reserve_mb.unwrap_or(DEFAULT_RESERVE_MB),
        models,
        model_defaults: clean_defaults(file.model_defaults),
    })
}

/// The newer of the shipped catalog and `downloaded` (the shipped one on a tie).
fn choose(downloaded: Option<&str>) -> Catalog {
    let bundled = parse(BUNDLED).expect("mitgelieferter Modellkatalog ist gültig");
    match downloaded.and_then(parse) {
        Some(remote) if is_newer(&remote.version, &bundled.version) => remote,
        _ => bundled,
    }
}

/// The catalog in effect now.
pub fn catalog() -> Catalog {
    let downloaded = std::fs::read_to_string(downloaded_path()).ok();
    choose(downloaded.as_deref())
}

/// Fetches the data repository's catalog into `<Daten>`; runs in the background at start.
pub async fn refresh() {
    if let Err(e) = fetch().await {
        tracing::debug!("Modellkatalog nicht geladen: {e}");
    }
    REFRESHED.store(true, Ordering::Release);
}

async fn fetch() -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let text = client
        .get(crate::modules::hub::hub_url(FILE_NAME))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    if parse(&text).is_none() {
        return Err("kein gültiger Katalog".into());
    }
    let path = downloaded_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, text).map_err(|e| e.to_string())
}

/// Waits up to `max` for the start-up download, so the wizard shows the current catalog.
pub async fn wait_for_refresh(max: std::time::Duration) {
    let start = std::time::Instant::now();
    while !REFRESHED.load(Ordering::Acquire) && start.elapsed() < max {
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn catalog_json(version: &str, models: serde_json::Value) -> String {
        serde_json::json!({ "version": version, "models": models }).to_string()
    }

    fn model(id: &str, vram: u64) -> serde_json::Value {
        serde_json::json!({
            "id": id, "name": id, "hf_id": "owner/repo-GGUF", "file": format!("{id}-Q4_K_M.gguf"),
            "size_bytes": 1000, "sha256": "a".repeat(64), "license": "Apache-2.0",
            "quantization": "Q4_K_M", "runtime": "standard", "vram_mb": vram,
            "description": { "de": "Test" }
        })
    }

    #[test]
    fn shipped_catalog_is_valid_and_sorted() {
        let bundled = parse(BUNDLED).unwrap();
        let raw: serde_json::Value = serde_json::from_str(BUNDLED).unwrap();
        assert_eq!(
            bundled.models.len(),
            raw["models"].as_array().unwrap().len(),
            "mitgelieferte Einträge übersprungen"
        );
        assert!(
            bundled
                .models
                .windows(2)
                .all(|w| w[0].vram_mb <= w[1].vram_mb)
        );
        for m in &bundled.models {
            for lang in ["de", "en", "ru"] {
                assert!(m.description.contains_key(lang), "{} ohne {lang}", m.id);
            }
            // A description promising pictures comes with the projector to see them.
            if m.description["en"].contains("pictures") {
                assert!(m.mmproj.is_some(), "{} verspricht Bilder ohne mmproj", m.id);
            }
        }
        let gemma = bundled
            .models
            .iter()
            .find(|m| m.id == "gemma-4-12b")
            .unwrap();
        assert_eq!(
            gemma.mmproj_target().as_deref(),
            Some("gemma-4-12b-it-Q4_K_M-mmproj-F16.gguf")
        );
    }

    #[test]
    fn the_newer_catalog_wins() {
        let bundled = parse(BUNDLED).unwrap();
        let newer = catalog_json("99.0.0", serde_json::json!([model("new", 5000)]));
        assert_eq!(choose(Some(&newer)).models[0].id, "new");
        let older = catalog_json("0.1", serde_json::json!([model("old", 5000)]));
        assert_eq!(choose(Some(&older)).version, bundled.version);
        let same = catalog_json(&bundled.version, serde_json::json!([model("same", 5000)]));
        assert_eq!(choose(Some(&same)).version, bundled.version);
        assert_eq!(choose(Some("kaputt")).version, bundled.version);
        assert_eq!(choose(None).version, bundled.version);
        assert!(is_newer("3.0.10", "3.0.9"));
        assert!(is_newer("3.1", "3.0.5"));
        assert!(!is_newer("3.0", "3.0.0"));
    }

    #[test]
    fn licences_are_sorted_into_open_restricted_and_noncommercial() {
        let kind = |license: &str| {
            let mut m = model("x", 1000);
            m["license"] = license.into();
            serde_json::from_value::<CatalogModel>(m)
                .unwrap()
                .license_kind()
        };
        assert_eq!(kind("Apache-2.0"), "open");
        assert_eq!(kind("mit"), "open");
        assert_eq!(kind("llama3.3"), "restricted");
        assert_eq!(kind("unknown"), "restricted");
        assert_eq!(kind("CC-BY-NC-4.0"), "noncommercial");
    }

    #[test]
    fn unsafe_or_closed_entries_are_dropped() {
        let mut bad_license = model("nolicense", 4000);
        bad_license["license"] = "".into();
        let mut bad_path = model("path", 4000);
        bad_path["file"] = "../evil.gguf".into();
        let mut bad_repo = model("repo", 4000);
        bad_repo["hf_id"] = "owner/../x".into();
        let mut bad_hash = model("hash", 4000);
        bad_hash["sha256"] = "123".into();
        let mut bad_runtime = model("rt", 4000);
        bad_runtime["runtime"] = "exe".into();
        let text = catalog_json(
            "9",
            serde_json::json!([
                bad_license,
                bad_path,
                bad_repo,
                bad_hash,
                bad_runtime,
                model("ok", 9000),
                model("small", 3000),
                model("ok", 1)
            ]),
        );
        let parsed = parse(&text).unwrap();
        let ids: Vec<_> = parsed.models.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(
            ids,
            ["small", "ok"],
            "unsichere Einträge, Doppelte entfernt, nach VRAM sortiert"
        );
        // Nothing usable left: the file is ignored.
        assert!(parse(&catalog_json("9", serde_json::json!([model("x", 0)]))).is_none());
    }

    #[test]
    fn shipped_catalog_has_bonsai_defaults_and_drops_unknown_fields() {
        let bundled = parse(BUNDLED).unwrap();
        let bonsai = bundled
            .model_defaults
            .iter()
            .find(|rule| rule.matches.iter().any(|m| m == "bonsai"))
            .expect("Bonsai-Vorgaben im Katalog");
        assert_eq!(bonsai.server["cache_type_k"], "q4_0");
        assert_eq!(bonsai.server["reasoning_mode"], true);
        assert_eq!(bonsai.sampling["top_k"], 20);

        let rules = clean_defaults(vec![
            ModelDefaults {
                matches: vec![" Foo ".into()],
                server: serde_json::json!({ "model_path": "/x", "flash_attn": false })
                    .as_object()
                    .unwrap()
                    .clone(),
                sampling: serde_json::json!({ "top_k": 5, "stop": ["x"] })
                    .as_object()
                    .unwrap()
                    .clone(),
            },
            ModelDefaults::default(),
        ]);
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].matches, ["foo"]);
        assert_eq!(rules[0].server.len(), 1);
        assert_eq!(rules[0].sampling.len(), 1);
    }
}
