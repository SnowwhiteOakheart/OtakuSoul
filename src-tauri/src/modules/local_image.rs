//! Local image generation with stable-diffusion.cpp (`sd-server`), sharing the GPU with the
//! chat model.
//!
//! The app owns both servers, so it frees VRAM itself instead of relying on ComfyUI nodes:
//! before a generation the [VRAM planner](plan) decides whether the image model fits next to
//! the running `llama-server` (parallel), whether the chat model should keep fewer layers on
//! the GPU, or whether it has to step aside (swap: stop `llama-server`, generate, stop
//! `sd-server`, start `llama-server` again with the same settings).
//!
//! Image models come from a small catalog, one entry per VRAM tier. Their files are stored
//! flat in `image-models/` (shared files such as VAEs download once), resumed after an
//! interruption and checked against Hugging Face's SHA-256.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use ts_rs::TS;

use crate::modules::llama_manager::{LlamaServerConfig, LlamaServerManager};

/// Port of the app's own `sd-server` (next to llama-server's 48596).
const SD_PORT: u16 = 48597;
/// VRAM kept free for the desktop, the WebView and driver overhead.
const OS_RESERVE_MB: u64 = 1_536;
/// Extra headroom on top of an image model's estimate.
const SAFETY_MB: u64 = 1_024;
/// Loading a 20 GB model from a slow disk takes a while.
const SD_READY_TIMEOUT: Duration = Duration::from_secs(900);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Role {
    /// Single-file checkpoint (SDXL).
    Checkpoint,
    Diffusion,
    Vae,
    ClipL,
    T5xxl,
    /// LLM text encoder (Qwen-Image, Flux.2).
    Llm,
}

impl Role {
    fn flag(self) -> &'static str {
        match self {
            Self::Checkpoint => "--model",
            Self::Diffusion => "--diffusion-model",
            Self::Vae => "--vae",
            Self::ClipL => "--clip_l",
            Self::T5xxl => "--t5xxl",
            Self::Llm => "--llm",
        }
    }
}

struct CatalogFile {
    role: Role,
    repo: &'static str,
    path: &'static str,
    size: u64,
    sha256: &'static str,
}

impl CatalogFile {
    fn remote(&self) -> crate::modules::model_files::RemoteFile {
        crate::modules::model_files::RemoteFile {
            repo: self.repo,
            path: self.path,
            size: self.size,
            sha256: Some(self.sha256),
        }
    }

    fn file_name(&self) -> &'static str {
        self.remote().file_name()
    }
}

struct CatalogModel {
    id: &'static str,
    name: &'static str,
    family: &'static str,
    /// Estimated VRAM while generating at the default size, in MB.
    vram_mb: u64,
    license: &'static str,
    files: &'static [CatalogFile],
    width: u32,
    height: u32,
    steps: u32,
    cfg_scale: f32,
    sampler: &'static str,
    /// Extra `sd-server` flags for this model.
    args: &'static [&'static str],
}

const FLUX_VAE: CatalogFile = CatalogFile {
    role: Role::Vae,
    repo: "Comfy-Org/Lumina_Image_2.0_Repackaged",
    path: "split_files/vae/ae.safetensors",
    size: 335_304_388,
    sha256: "afc8e28272cd15db3919bacdb6918ce9c1ed22e96cb12c4d5ed0fba823529e38",
};

const CATALOG: &[CatalogModel] = &[
    CatalogModel {
        id: "animagine-xl-4",
        name: "Animagine XL 4.0",
        family: "sdxl",
        vram_mb: 7_500,
        license: "CreativeML Open RAIL++-M",
        files: &[CatalogFile {
            role: Role::Checkpoint,
            repo: "cagliostrolab/animagine-xl-4.0",
            path: "animagine-xl-4.0-opt.safetensors",
            size: 6_938_350_040,
            sha256: "6327eca98bfb6538dd7a4edce22484a1bbc57a8cff6b11d075d40da1afb847ac",
        }],
        width: 832,
        height: 1216,
        steps: 28,
        cfg_scale: 5.0,
        sampler: "euler a",
        args: &["--vae-tiling"],
    },
    CatalogModel {
        id: "illustrious-xl-0.1",
        name: "Illustrious XL 0.1",
        family: "sdxl",
        vram_mb: 7_500,
        license: "Illustrious XL (siehe Modellkarte)",
        files: &[CatalogFile {
            role: Role::Checkpoint,
            repo: "OnomaAIResearch/Illustrious-xl-early-release-v0",
            path: "Illustrious-XL-v0.1.safetensors",
            size: 6_938_040_760,
            sha256: "3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9",
        }],
        width: 832,
        height: 1216,
        steps: 28,
        cfg_scale: 5.5,
        sampler: "euler a",
        args: &["--vae-tiling"],
    },
    CatalogModel {
        id: "flux1-dev-q5",
        name: "FLUX.1 dev (GGUF Q5_K_S)",
        family: "flux",
        vram_mb: 10_000,
        license: "FLUX.1 [dev] Non-Commercial",
        files: &[
            CatalogFile {
                role: Role::Diffusion,
                repo: "city96/FLUX.1-dev-gguf",
                path: "flux1-dev-Q5_K_S.gguf",
                size: 8_285_267_232,
                sha256: "aa76146ca0f1b09c67e0c3fcef18be3a375837ecd5aaa021d3e9ebc558bd68f9",
            },
            CatalogFile {
                role: Role::ClipL,
                repo: "comfyanonymous/flux_text_encoders",
                path: "clip_l.safetensors",
                size: 246_144_152,
                sha256: "660c6f5b1abae9dc498ac2d21e1347d2abdb0cf6c0c0c8576cd796491d9a6cdd",
            },
            CatalogFile {
                role: Role::T5xxl,
                repo: "city96/t5-v1_1-xxl-encoder-gguf",
                path: "t5-v1_1-xxl-encoder-Q5_K_M.gguf",
                size: 3_386_856_640,
                sha256: "b51cbb10b1a7aac6dd1c3b62f0ed908bfd06e0b42d2f3577d43e061361f51dae",
            },
            FLUX_VAE,
        ],
        width: 832,
        height: 1216,
        steps: 20,
        cfg_scale: 1.0,
        sampler: "euler",
        args: &["--clip-on-cpu", "--vae-tiling", "--diffusion-fa"],
    },
    CatalogModel {
        id: "qwen-image-2.1-q4",
        name: "Qwen-Image 2.1 (GGUF Q4_K)",
        family: "qwen_image",
        vram_mb: 7_000,
        license: "Apache-2.0",
        files: &[
            CatalogFile {
                role: Role::Diffusion,
                repo: "leejet/Qwen-Image-2.1-GGUF",
                path: "qwen_image_2.1-Q4_K.gguf",
                size: 4_197_494_816,
                sha256: "29f9c83c249ff0292fb2943fceddfa2319b446601866c82a4f8be062abea72c2",
            },
            CatalogFile {
                role: Role::Vae,
                repo: "Comfy-Org/Qwen-Image-2.1",
                path: "vae/qwen_image_2.1_vae_bf16.safetensors",
                size: 675_509_688,
                sha256: "bb21f7473051e1ac368515dd3f2e15cd44d7a11748ee8823e1ddca3e4876b7c9",
            },
            CatalogFile {
                role: Role::Llm,
                repo: "Qwen/Qwen3-VL-8B-Instruct-GGUF",
                path: "Qwen3VL-8B-Instruct-Q4_K_M.gguf",
                size: 5_027_784_800,
                sha256: "67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2",
            },
        ],
        width: 832,
        height: 1216,
        steps: 20,
        cfg_scale: 6.0,
        sampler: "euler",
        args: &["--offload-to-cpu", "--diffusion-fa"],
    },
    CatalogModel {
        id: "flux2-dev-q4",
        name: "FLUX.2 dev (GGUF Q4_K_S)",
        family: "flux2",
        vram_mb: 21_500,
        license: "FLUX.2 [dev] Non-Commercial",
        files: &[
            CatalogFile {
                role: Role::Diffusion,
                repo: "city96/FLUX.2-dev-gguf",
                path: "flux2-dev-Q4_K_S.gguf",
                size: 19_299_128_288,
                sha256: "b9c1c8295ed044f54c3a9894a800e003b4ecc94bfb0f63192b68bafc232c2b27",
            },
            CatalogFile {
                role: Role::Vae,
                repo: "Comfy-Org/flux2-dev",
                path: "split_files/vae/flux2-vae.safetensors",
                size: 336_213_556,
                sha256: "d64f3a68e1cc4f9f4e29b6e0da38a0204fe9a49f2d4053f0ec1fa1ca02f9c4b5",
            },
            CatalogFile {
                role: Role::Llm,
                repo: "unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF",
                path: "Mistral-Small-3.2-24B-Instruct-2506-Q4_K_M.gguf",
                size: 14_333_922_848,
                sha256: "a3cc56310807ed0d145eaf9f018ccda9ae7ad8edb41ec870aa2454b0d4700b3c",
            },
        ],
        width: 832,
        height: 1216,
        steps: 28,
        cfg_scale: 1.0,
        sampler: "euler",
        args: &["--offload-to-cpu", "--diffusion-fa"],
    },
];

fn catalog_model(id: &str) -> Result<&'static CatalogModel, String> {
    CATALOG
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| crate::err!("backend.localImage.unknownModel", model = id))
}

fn models_dir() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir).join("image-models")
}

fn file_path(file: &CatalogFile) -> PathBuf {
    models_dir().join(file.file_name())
}

fn is_file_complete(file: &CatalogFile) -> bool {
    std::fs::metadata(file_path(file)).is_ok_and(|m| m.len() == file.size)
}

/// How the planner may share the GPU between chat and image model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "snake_case")]
#[ts(export)]
pub enum VramStrategy {
    /// Parallel when both fit, otherwise swap.
    #[default]
    Auto,
    /// Keep both loaded, even if that spills into shared memory.
    Parallel,
    /// Always unload the chat model while generating.
    Swap,
    /// Keep fewer chat-model layers on the GPU so both fit; swap if that would be too slow.
    ReduceLlm,
}

/// An image model of the catalog as the settings show it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImageModelInfo {
    pub id: String,
    pub name: String,
    pub family: String,
    pub vram_mb: u64,
    pub download_bytes: u64,
    /// Bytes still missing (0 when installed).
    pub missing_bytes: u64,
    pub installed: bool,
    pub license: String,
    /// Largest model that fits this GPU on its own.
    pub recommended: bool,
    /// Fits the GPU on its own (with the chat model unloaded).
    pub fits_gpu: bool,
}

/// Lists the catalog with install state and a recommendation for the detected GPU.
pub fn list_models() -> Vec<ImageModelInfo> {
    let total_vram = best_gpu_vram().0;
    let usable = total_vram.saturating_sub(OS_RESERVE_MB);
    let recommended = CATALOG
        .iter()
        .filter(|m| m.vram_mb <= usable)
        .max_by_key(|m| m.vram_mb)
        .map(|m| m.id);
    CATALOG
        .iter()
        .map(|m| {
            let download_bytes = m.files.iter().map(|f| f.size).sum();
            let missing_bytes = m
                .files
                .iter()
                .filter(|f| !is_file_complete(f))
                .map(|f| f.size)
                .sum::<u64>();
            ImageModelInfo {
                id: m.id.to_string(),
                name: m.name.to_string(),
                family: m.family.to_string(),
                vram_mb: m.vram_mb,
                download_bytes,
                missing_bytes,
                installed: missing_bytes == 0,
                license: m.license.to_string(),
                recommended: Some(m.id) == recommended,
                fits_gpu: m.vram_mb <= usable,
            }
        })
        .collect()
}

/// (total, free) VRAM of the largest GPU in MB; free is `None` when the driver doesn't say.
fn best_gpu_vram() -> (u64, Option<u64>) {
    crate::modules::hardware::probe_hardware()
        .gpus
        .iter()
        .max_by_key(|g| g.total_vram_mb)
        .map(|g| {
            (
                g.total_vram_mb,
                (g.free_vram_mb > 0).then_some(g.free_vram_mb),
            )
        })
        .unwrap_or((0, None))
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImageModelProgress {
    pub model_id: String,
    pub file_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f32,
    pub finished: bool,
}

static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);

/// Asks a running [`download_model`] to stop after the current chunk; the partial file is
/// kept and resumed next time.
pub fn cancel_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

/// Downloads every missing file of `model_id`, resuming partial files, and verifies them.
/// Progress goes to the `image-model-progress` event.
pub async fn download_model<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    model_id: &str,
) -> Result<(), String> {
    download_model_with(model_id, &|p| {
        let _ = app.emit("image-model-progress", p);
    })
    .await
}

/// [`download_model`] with a progress callback instead of the Tauri event (tests, tools).
pub async fn download_model_with(
    model_id: &str,
    emit: &(impl Fn(ImageModelProgress) + Sync),
) -> Result<(), String> {
    let model = catalog_model(model_id)?;
    CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);
    let dir = models_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let client = crate::modules::model_files::http_client()?;

    let total: u64 = model.files.iter().map(|f| f.size).sum();
    let mut done: u64 = model
        .files
        .iter()
        .filter(|f| is_file_complete(f))
        .map(|f| f.size)
        .sum();
    for file in model.files.iter().filter(|f| !is_file_complete(f)) {
        let emit = |downloaded: u64| {
            emit(ImageModelProgress {
                model_id: model.id.to_string(),
                file_name: file.file_name().to_string(),
                downloaded_bytes: done + downloaded,
                total_bytes: total,
                percent: ((done + downloaded) as f32 / total.max(1) as f32 * 100.0).min(100.0),
                finished: false,
            });
        };
        crate::modules::model_files::download_file(
            &client,
            &file.remote(),
            &dir,
            &CANCEL_DOWNLOAD,
            &emit,
        )
        .await?;
        done += file.size;
    }
    emit(ImageModelProgress {
        model_id: model.id.to_string(),
        file_name: String::new(),
        downloaded_bytes: total,
        total_bytes: total,
        percent: 100.0,
        finished: true,
    });
    tracing::info!("Bildmodell {} heruntergeladen", model.id);
    Ok(())
}

/// Deletes the files of `model_id` that no other installed model uses.
pub fn delete_model(model_id: &str) -> Result<(), String> {
    let model = catalog_model(model_id)?;
    for file in model.files {
        let shared = CATALOG.iter().any(|other| {
            other.id != model.id
                && other
                    .files
                    .iter()
                    .any(|f| f.file_name() == file.file_name())
                && other.files.iter().all(is_file_complete)
        });
        if !shared {
            let _ = std::fs::remove_file(file_path(file));
            let _ = std::fs::remove_file(crate::modules::model_files::part_path(&file_path(file)));
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------
// VRAM planning
// ---------------------------------------------------------------------------------------

/// What the planner knows before a generation.
#[derive(Debug, Clone, Copy)]
pub struct PlanInput {
    pub total_vram_mb: u64,
    /// Free VRAM measured right now (with the chat model loaded), if the driver reports it.
    pub free_vram_mb: Option<u64>,
    pub llm_running: bool,
    /// VRAM of the running chat model with its current layers on the GPU.
    pub llm_vram_mb: u64,
    /// Layers of the chat model on the GPU now, and in total.
    pub llm_gpu_layers: u32,
    pub llm_total_layers: Option<u32>,
    pub image_vram_mb: u64,
    /// VRAM of a loaded speech model (`crispasr`), 0 when none is loaded.
    pub tts_vram_mb: u64,
}

/// The plan plus whether the small speech model has to make room as well.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VramDecision {
    pub plan: VramPlan,
    /// Stop `crispasr`; it starts again by itself for the next line it has to speak.
    pub unload_tts: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "mode", rename_all = "snake_case")]
#[ts(export)]
pub enum VramPlan {
    /// Both models stay loaded.
    Parallel,
    /// Restart the chat model with only `gpu_layers` on the GPU, then keep both loaded.
    ReduceLlm { gpu_layers: u32 },
    /// Unload the chat model while generating and reload it afterwards.
    Swap,
}

/// Below this share of layers on the GPU the chat model gets too slow to be worth it.
const MIN_REDUCED_LAYER_SHARE: f64 = 0.4;

/// What the image model would find free if the chat and speech models stay loaded
/// (`keep_llm`, `keep_tts`) or are unloaded first.
fn available_mb(input: &PlanInput, keep_llm: bool, keep_tts: bool) -> u64 {
    let freed = |keep: bool, mb: u64| if keep { 0 } else { mb };
    match input.free_vram_mb {
        // Measured with everything that is loaded right now; unloading gives memory back.
        Some(free) => {
            free + freed(keep_llm || !input.llm_running, input.llm_vram_mb)
                + freed(keep_tts, input.tts_vram_mb)
        }
        None => {
            let llm = if keep_llm && input.llm_running {
                input.llm_vram_mb
            } else {
                0
            };
            let tts = if keep_tts { input.tts_vram_mb } else { 0 };
            input
                .total_vram_mb
                .saturating_sub(OS_RESERVE_MB)
                .saturating_sub(llm)
                .saturating_sub(tts)
        }
    }
}

fn fits(input: &PlanInput, keep_llm: bool, keep_tts: bool) -> bool {
    available_mb(input, keep_llm, keep_tts) >= input.image_vram_mb + SAFETY_MB
}

fn reduced_layers(input: &PlanInput) -> Option<u32> {
    let total_layers = input.llm_total_layers.filter(|l| *l > 0)?;
    let on_gpu = input.llm_gpu_layers.min(total_layers).max(1);
    let per_layer = (input.llm_vram_mb / u64::from(on_gpu)).max(1);
    let budget = input
        .total_vram_mb
        .saturating_sub(OS_RESERVE_MB)
        .saturating_sub(input.tts_vram_mb)
        .saturating_sub(input.image_vram_mb + SAFETY_MB);
    let layers = u32::try_from(budget / per_layer)
        .unwrap_or(u32::MAX)
        .min(total_layers);
    (f64::from(layers) >= f64::from(total_layers) * MIN_REDUCED_LAYER_SHARE).then_some(layers)
}

/// Decides how chat, speech and image model share the GPU for one generation. Nothing is
/// unloaded while everything fits; otherwise the small speech model yields first and the
/// chat model only when that is not enough (or the user chose to always swap).
pub fn plan(input: &PlanInput, strategy: VramStrategy) -> VramDecision {
    let keep = |plan| VramDecision {
        plan,
        unload_tts: false,
    };
    // CPU generation or an explicit "always parallel": nothing to plan.
    if input.total_vram_mb == 0 || strategy == VramStrategy::Parallel {
        return keep(VramPlan::Parallel);
    }
    let swap = || VramDecision {
        plan: VramPlan::Swap,
        unload_tts: input.tts_vram_mb > 0 && !fits(input, false, true),
    };
    if strategy == VramStrategy::Swap && input.llm_running {
        return swap();
    }
    if fits(input, true, true) {
        return keep(VramPlan::Parallel);
    }
    if input.tts_vram_mb > 0 && fits(input, true, false) {
        return VramDecision {
            plan: VramPlan::Parallel,
            unload_tts: true,
        };
    }
    if !input.llm_running {
        // Only the speech model could make room; the image model may still spill over.
        return VramDecision {
            plan: VramPlan::Parallel,
            unload_tts: input.tts_vram_mb > 0,
        };
    }
    match strategy {
        VramStrategy::ReduceLlm => reduced_layers(input)
            .filter(|layers| *layers < input.llm_gpu_layers)
            .map_or_else(swap, |gpu_layers| keep(VramPlan::ReduceLlm { gpu_layers })),
        _ => swap(),
    }
}

/// The sd.cpp device (from `sd-server --list-devices`, `name<TAB>description` per line) of the
/// GPU named `gpu`, e.g. `Vulkan0` for "NVIDIA GeForce RTX 4070 Ti SUPER".
fn pick_device(listing: &str, gpu: Option<&str>) -> Option<String> {
    let gpu = gpu?.to_lowercase();
    listing.lines().find_map(|line| {
        let (name, description) = line.split_once('\t')?;
        let description = description.trim().to_lowercase();
        (name != "CPU"
            && !gpu.is_empty()
            && (description.contains(&gpu) || gpu.contains(&description)))
        .then(|| name.trim().to_string())
    })
}

/// `--backend` value and remaining flags: everything on `device`, text encoders on the CPU when
/// the model asks for that (`--clip-on-cpu` is deprecated in favour of `te=cpu`).
fn backend_assignment<'a>(
    args: &'a [&'a str],
    device: Option<&str>,
) -> (Option<String>, Vec<&'a str>) {
    let te_on_cpu = args.contains(&"--clip-on-cpu");
    let Some(device) = device else {
        return (None, args.to_vec());
    };
    let rest: Vec<&str> = args
        .iter()
        .copied()
        .filter(|a| *a != "--clip-on-cpu")
        .collect();
    let backend = if te_on_cpu {
        format!("te=cpu,diffusion={device},vae={device}")
    } else {
        device.to_string()
    };
    (Some(backend), rest)
}

// ---------------------------------------------------------------------------------------
// sd-server and generation
// ---------------------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LocalImageStatus {
    /// `planning`, `unloading_llm`, `reducing_llm`, `loading_model`, `generating`,
    /// `reloading_llm`, `done` or `failed`.
    pub phase: String,
    pub plan: Option<VramPlan>,
    pub model_id: Option<String>,
}

struct SdProcess {
    child: Child,
    model_id: String,
}

/// Owns the app's `sd-server` and serialises generations.
pub struct LocalImageEngine {
    process: Mutex<Option<SdProcess>>,
    logs: Arc<Mutex<std::collections::VecDeque<String>>>,
    busy: Mutex<()>,
}

impl Default for LocalImageEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Settings of the generation, taken from the model and the user's image settings.
pub struct GenerationRequest<'a> {
    pub model_id: &'a str,
    pub strategy: VramStrategy,
    pub prompt: &'a str,
    pub negative: &'a str,
    pub seed: i64,
}

impl LocalImageEngine {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
            logs: Arc::new(Mutex::new(std::collections::VecDeque::with_capacity(60))),
            busy: Mutex::new(()),
        }
    }

    /// Model the running `sd-server` has loaded.
    pub async fn loaded_model(&self) -> Option<String> {
        let mut guard = self.process.lock().await;
        let running = guard
            .as_mut()
            .is_some_and(|p| matches!(p.child.try_wait(), Ok(None)));
        if !running {
            *guard = None;
        }
        guard.as_ref().map(|p| p.model_id.clone())
    }

    /// Stops `sd-server` and frees its VRAM.
    pub async fn stop(&self) {
        if let Some(mut process) = self.process.lock().await.take() {
            #[cfg(unix)]
            if let Some(pid) = process.child.id() {
                // SAFETY: plain signal to our own child process.
                unsafe {
                    libc::kill(pid as i32, libc::SIGTERM);
                }
            }
            tokio::select! {
                _ = process.child.wait() => {}
                _ = tokio::time::sleep(Duration::from_secs(5)) => {
                    let _ = process.child.kill().await;
                }
            }
            tracing::info!("sd-server gestoppt ({})", process.model_id);
        }
    }

    async fn ensure_server(&self, model: &CatalogModel) -> Result<(), String> {
        if self.loaded_model().await.as_deref() == Some(model.id) {
            return Ok(());
        }
        self.stop().await;

        let runtime =
            crate::modules::runtimes::installed(crate::modules::runtimes::RuntimeKind::Sd)
                .ok_or_else(|| crate::err!("backend.localImage.noRuntime"))?;
        if let Some(missing) = model.files.iter().find(|f| !is_file_complete(f)) {
            return Err(crate::err!(
                "backend.localImage.notInstalled",
                model = model.name,
                file = missing.file_name()
            ));
        }

        let binary = PathBuf::from(&runtime.server_path);
        let mut cmd = Command::new(&binary);
        let mut lib_dirs: Vec<PathBuf> = runtime.library_dirs.iter().map(PathBuf::from).collect();
        if let Some(parent) = binary.parent() {
            lib_dirs.push(parent.to_path_buf());
        }
        let var = if cfg!(windows) {
            "PATH"
        } else {
            "LD_LIBRARY_PATH"
        };
        let existing = std::env::var_os(var).unwrap_or_default();
        let joined =
            std::env::join_paths(lib_dirs.into_iter().chain(std::env::split_paths(&existing)))
                .map_err(|e| crate::err!("backend.localImage.startFailed", error = e))?;
        cmd.env(var, &joined);

        for file in model.files {
            cmd.arg(file.role.flag()).arg(file_path(file));
        }
        // sd.cpp's auto-fit prefers the device reporting the most free memory, which on laptops
        // and APUs is the integrated GPU sharing system RAM (FLUX.1 ran there 6x slower in the
        // GPU test). Pin the model to the GPU the planner works with.
        let device = {
            let listing = Command::new(&binary)
                .arg("--list-devices")
                .env(var, &joined)
                .output()
                .await
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
                .unwrap_or_default();
            let gpu = tokio::task::spawn_blocking(|| {
                crate::modules::hardware::probe_hardware()
                    .gpus
                    .into_iter()
                    .max_by_key(|g| g.total_vram_mb)
                    .map(|g| g.name)
            })
            .await
            .ok()
            .flatten();
            pick_device(&listing, gpu.as_deref())
        };
        let (backend, args) = backend_assignment(model.args, device.as_deref());
        if let Some(backend) = backend {
            tracing::info!("sd-server: --backend {backend}");
            cmd.arg("--backend").arg(backend);
        }
        cmd.args(args)
            .arg("--listen-ip")
            .arg("127.0.0.1")
            .arg("--listen-port")
            .arg(SD_PORT.to_string())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        // SAFETY: prctl only affects the child that is about to exec.
        unsafe {
            cmd.pre_exec(|| {
                libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGTERM);
                Ok(())
            });
        }

        tracing::info!("Starte sd-server mit {}", model.id);
        self.logs.lock().await.clear();
        let mut child = cmd
            .spawn()
            .map_err(|e| crate::err!("backend.localImage.startFailed", error = e))?;
        for stream in [
            child
                .stdout
                .take()
                .map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
            child
                .stderr
                .take()
                .map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
        ]
        .into_iter()
        .flatten()
        {
            let logs = self.logs.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stream).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    tracing::debug!(target: "sd_server", "{line}");
                    let mut guard = logs.lock().await;
                    if guard.len() >= 60 {
                        guard.pop_front();
                    }
                    guard.push_back(line);
                }
            });
        }
        *self.process.lock().await = Some(SdProcess {
            child,
            model_id: model.id.to_string(),
        });

        // The server only starts listening once the model is loaded.
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()
            .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
        let started = std::time::Instant::now();
        while started.elapsed() < SD_READY_TIMEOUT {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if self.loaded_model().await.is_none() {
                let logs = self.logs.lock().await.iter().cloned().collect::<Vec<_>>();
                let tail = logs[logs.len().saturating_sub(12)..].join("\n");
                return Err(crate::err!("backend.localImage.crashed", logs = tail));
            }
            if client
                .get(format!("http://127.0.0.1:{SD_PORT}/sdapi/v1/samplers"))
                .send()
                .await
                .is_ok_and(|r| r.status().is_success())
            {
                tracing::info!(
                    "sd-server bereit nach {:.1}s",
                    started.elapsed().as_secs_f32()
                );
                return Ok(());
            }
        }
        self.stop().await;
        Err(crate::err!("backend.localImage.timeout"))
    }

    async fn txt2img(
        &self,
        model: &CatalogModel,
        req: &GenerationRequest<'_>,
    ) -> Result<Vec<u8>, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(1_800))
            .build()
            .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
        let payload = serde_json::json!({
            "prompt": req.prompt,
            "negative_prompt": req.negative,
            "width": model.width,
            "height": model.height,
            "steps": model.steps,
            "cfg_scale": model.cfg_scale,
            "sampler_name": model.sampler,
            "seed": req.seed,
            "batch_size": 1,
        });
        let response = client
            .post(format!("http://127.0.0.1:{SD_PORT}/sdapi/v1/txt2img"))
            .json(&payload)
            .send()
            .await
            .map_err(|e| crate::err!("backend.localImage.generateFailed", error = e))?;
        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(crate::err!(
                "backend.localImage.generateFailed",
                error = body
            ));
        }
        let json: serde_json::Value = response
            .json()
            .await
            .map_err(|e| crate::err!("backend.image.a1111Parse", error = e))?;
        let b64 = json["images"]
            .get(0)
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::err!("backend.image.a1111NoImages"))?;
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64)
            .map_err(|e| crate::err!("backend.image.base64", error = e))
    }

    /// Generates one image, sharing the GPU with `llama` according to the plan. In swap mode
    /// the chat model is started again in the background, so the image is returned at once.
    /// `on_status` receives each phase (the app forwards it as `local-image-status`).
    pub async fn generate(
        &self,
        on_status: &(impl Fn(LocalImageStatus) + Sync),
        llama: Arc<LlamaServerManager>,
        req: GenerationRequest<'_>,
    ) -> Result<Vec<u8>, String> {
        let _busy = self.busy.lock().await;
        let model = catalog_model(req.model_id)?;
        let emit = |phase: &str, plan: Option<VramPlan>| {
            on_status(LocalImageStatus {
                phase: phase.to_string(),
                plan,
                model_id: Some(model.id.to_string()),
            });
        };
        emit("planning", None);

        let llm_config = llama.running_config().await;
        let image_already_loaded = self.loaded_model().await.as_deref() == Some(model.id);
        let tts_vram = crate::modules::tts_local::engine().loaded_vram_mb().await;
        let decision = {
            let llm = llm_config.clone();
            let image_vram = model.vram_mb;
            tokio::task::spawn_blocking(move || {
                let (total, free) = best_gpu_vram();
                let (llm_vram, total_layers, gpu_layers) = match &llm {
                    Some(cfg) => {
                        let total_layers =
                            crate::modules::gguf::block_count(Path::new(&cfg.model_path));
                        let full = crate::modules::hardware::estimate_llm_vram_mb(
                            &cfg.model_path,
                            total_layers.unwrap_or(0),
                            cfg.context_size,
                            cfg.cache_type_k.as_deref(),
                            cfg.cache_type_v.as_deref(),
                        );
                        let gpu_layers =
                            total_layers.map_or(cfg.gpu_layers, |t| cfg.gpu_layers.min(t));
                        let share = total_layers
                            .filter(|t| *t > 0)
                            .map_or(1.0, |t| f64::from(gpu_layers) / f64::from(t));
                        ((full as f64 * share) as u64, total_layers, gpu_layers)
                    }
                    None => (0, None, 0),
                };
                plan(
                    &PlanInput {
                        total_vram_mb: total,
                        // A loaded image model already occupies part of the free VRAM.
                        free_vram_mb: free.map(|f| {
                            if image_already_loaded {
                                f + image_vram
                            } else {
                                f
                            }
                        }),
                        llm_running: llm.is_some(),
                        llm_vram_mb: llm_vram,
                        llm_gpu_layers: gpu_layers,
                        llm_total_layers: total_layers,
                        image_vram_mb: image_vram,
                        tts_vram_mb: tts_vram,
                    },
                    req.strategy,
                )
            })
            .await
            // Planning failed (no hardware info): free as much as possible to be safe.
            .unwrap_or(VramDecision {
                plan: VramPlan::Swap,
                unload_tts: true,
            })
        };
        let plan = decision.plan;
        tracing::info!("VRAM-Plan für {}: {:?}", model.id, decision);
        if decision.unload_tts {
            // The speech server restarts by itself on the next line it has to speak.
            emit("unloading_tts", Some(plan));
            crate::modules::tts_local::engine().stop().await;
        }

        match (plan, &llm_config) {
            (VramPlan::Swap, Some(_)) => {
                emit("unloading_llm", Some(plan));
                llama.stop().await?;
            }
            (VramPlan::ReduceLlm { gpu_layers }, Some(cfg)) => {
                emit("reducing_llm", Some(plan));
                self.stop().await;
                llama
                    .start(LlamaServerConfig {
                        gpu_layers,
                        ..cfg.clone()
                    })
                    .await?;
            }
            _ => {}
        }

        let result = async {
            emit("loading_model", Some(plan));
            self.ensure_server(model).await?;
            emit("generating", Some(plan));
            self.txt2img(model, &req).await
        }
        .await;

        if plan == VramPlan::Swap {
            self.stop().await;
            if let Some(cfg) = llm_config {
                emit("reloading_llm", Some(plan));
                tokio::spawn(async move {
                    if let Err(e) = llama.start(cfg).await {
                        tracing::warn!(
                            "Chat-Modell konnte nach der Bildgenerierung nicht neu starten: {e}"
                        );
                    }
                });
            }
        }
        emit(if result.is_ok() { "done" } else { "failed" }, Some(plan));
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(total: u64, free: Option<u64>, llm: u64, image: u64) -> PlanInput {
        PlanInput {
            total_vram_mb: total,
            free_vram_mb: free,
            llm_running: true,
            llm_vram_mb: llm,
            llm_gpu_layers: 64,
            llm_total_layers: Some(64),
            image_vram_mb: image,
            tts_vram_mb: 0,
        }
    }

    fn with_tts(mut i: PlanInput, tts: u64) -> PlanInput {
        i.tts_vram_mb = tts;
        i
    }

    fn decide(i: PlanInput, strategy: VramStrategy) -> (VramPlan, bool) {
        let d = plan(&i, strategy);
        (d.plan, d.unload_tts)
    }

    use VramPlan::{Parallel, Swap};
    use VramStrategy::{Auto, ReduceLlm};

    #[test]
    fn keeps_everything_loaded_when_it_fits() {
        // 24 GB: chat (7.5 GB) + FLUX.1 (10 GB) + speech (2 GB) fit together.
        assert_eq!(
            decide(with_tts(input(24_576, None, 7_500, 10_000), 2_000), Auto),
            (Parallel, false)
        );
        // 16 GB with a measured 9 GB free: SDXL fits next to the chat model.
        assert_eq!(
            decide(input(16_384, Some(9_000), 7_000, 7_500), Auto),
            (Parallel, false)
        );
        // No GPU or an explicit "always parallel".
        assert_eq!(
            decide(input(0, None, 7_000, 7_500), VramStrategy::Swap),
            (Parallel, false)
        );
        assert_eq!(
            decide(
                with_tts(input(8_192, None, 7_000, 7_500), 2_000),
                VramStrategy::Parallel
            ),
            (Parallel, false)
        );
    }

    #[test]
    fn unloads_the_small_speech_model_before_the_chat_model() {
        // 24 GB: 24576-1536-7500-2000 = 13540 < 13000+1024, but without speech 15540 fits.
        assert_eq!(
            decide(with_tts(input(24_576, None, 7_500, 13_000), 2_000), Auto),
            (Parallel, true)
        );
        // Measured: 12.1 GB free with everything loaded, 14.1 GB once speech is gone.
        assert_eq!(
            decide(
                with_tts(input(24_576, Some(12_100), 7_500, 13_000), 2_000),
                Auto
            ),
            (Parallel, true)
        );
    }

    #[test]
    fn swaps_the_chat_model_only_when_needed() {
        // 8 GB: chat + SDXL cannot share; speech has to go as well (8192-1536-2000 < 8524).
        assert_eq!(
            decide(with_tts(input(8_192, None, 7_000, 7_500), 2_000), Auto),
            (Swap, true)
        );
        // 16 GB: chat has to go, speech (2 GB) still fits next to SDXL.
        assert_eq!(
            decide(with_tts(input(16_384, None, 7_000, 7_500), 2_000), Auto),
            (Swap, false)
        );
        // 24 GB with FLUX.2 (21.5 GB): swap.
        assert_eq!(
            decide(input(24_576, None, 7_500, 21_500), Auto),
            (Swap, false)
        );
        // "Always swap" is respected even when everything would fit.
        assert_eq!(
            decide(input(49_152, None, 7_000, 7_500), VramStrategy::Swap),
            (Swap, false)
        );
        // Without a chat model there is nothing to swap; only the speech model can make room.
        let mut idle = with_tts(input(8_192, None, 0, 7_500), 2_000);
        idle.llm_running = false;
        assert_eq!(decide(idle, Auto), (Parallel, true));
        idle.tts_vram_mb = 0;
        assert_eq!(decide(idle, Auto), (Parallel, false));
    }

    #[test]
    fn reduces_llm_layers_only_when_enough_stay_on_the_gpu() {
        // 12 GB, 7 GB chat model (64 layers), 7.5 GB SDXL → budget 12288-1536-8524 = 2228 MB,
        // ~20 layers (31 %) → too few, swap.
        assert_eq!(decide(input(12_288, None, 7_000, 7_500), ReduceLlm).0, Swap);
        // 16 GB with Qwen-Image (9.5 GB): budget 16384-1536-10524 = 4324 MB → 39 layers (61 %).
        assert_eq!(
            decide(input(16_384, None, 7_000, 9_500), ReduceLlm).0,
            VramPlan::ReduceLlm { gpu_layers: 39 }
        );
        // A loaded speech model shrinks the budget: 4324-2000 = 2324 MB → 21 layers → swap.
        assert_eq!(
            decide(
                with_tts(input(16_384, None, 7_000, 9_500), 2_000),
                ReduceLlm
            )
            .0,
            Swap
        );
    }

    #[test]
    fn pins_the_model_to_the_dedicated_gpu() {
        let listing = "Vulkan0\tNVIDIA GeForce RTX 4070 Ti SUPER\nVulkan1\tAMD Radeon 890M Graphics (RADV STRIX1)\nCPU\tAMD Ryzen AI 9 HX 470 w/ Radeon 890M\n";
        assert_eq!(
            pick_device(listing, Some("NVIDIA GeForce RTX 4070 Ti SUPER")).as_deref(),
            Some("Vulkan0")
        );
        assert_eq!(pick_device(listing, None), None);
        assert_eq!(pick_device(listing, Some("Unknown GPU")), None);

        let flux = ["--clip-on-cpu", "--vae-tiling", "--diffusion-fa"];
        let (backend, rest) = backend_assignment(&flux, Some("Vulkan0"));
        assert_eq!(
            backend.as_deref(),
            Some("te=cpu,diffusion=Vulkan0,vae=Vulkan0")
        );
        assert_eq!(rest, vec!["--vae-tiling", "--diffusion-fa"]);
        let qwen = ["--offload-to-cpu", "--diffusion-fa"];
        assert_eq!(
            backend_assignment(&qwen, Some("Vulkan0")).0.as_deref(),
            Some("Vulkan0")
        );
        // Without a match sd.cpp decides itself, flags unchanged.
        assert_eq!(backend_assignment(&flux, None), (None, flux.to_vec()));
    }

    #[test]
    fn catalog_is_consistent() {
        for model in CATALOG {
            assert!(!model.files.is_empty(), "{}", model.id);
            for file in model.files {
                assert_eq!(file.sha256.len(), 64, "{}", file.path);
                assert!(file.size > 1_000_000, "{}", file.path);
            }
            let checkpoint = model.files.iter().any(|f| f.role == Role::Checkpoint);
            let diffusion = model.files.iter().any(|f| f.role == Role::Diffusion);
            assert!(checkpoint ^ diffusion, "{}", model.id);
            // Files with the same name must be the same file.
            for other in CATALOG {
                for a in model.files {
                    for b in other.files {
                        if a.file_name() == b.file_name() {
                            assert_eq!(a.sha256, b.sha256, "{}", a.file_name());
                        }
                    }
                }
            }
        }
    }
}
