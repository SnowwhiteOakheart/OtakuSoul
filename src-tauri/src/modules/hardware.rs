use serde::{Deserialize, Serialize};
use std::process::Command;
use sysinfo::System;
use ts_rs::TS;

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub total_vram_mb: u64,
    pub free_vram_mb: u64,
    /// Integrated GPU sharing system RAM (e.g. Radeon 890M, Intel Iris); only used when there
    /// is no dedicated one.
    #[serde(default)]
    pub integrated: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct HardwareInfo {
    pub os_name: String,
    pub os_version: String,
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    /// Dedicated GPUs first, largest first.
    pub gpus: Vec<GpuInfo>,
}

impl HardwareInfo {
    /// The GPU models are planned for: the largest dedicated one, else the largest integrated one.
    pub fn primary_gpu(&self) -> Option<&GpuInfo> {
        self.gpus.iter().find(|g| g.total_vram_mb > 0)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
pub struct LayerRecommendation {
    pub recommended_layers: u32,
    pub recommended_context_size: u32,
    /// Context the model was trained for (`0` = unknown); larger contexts make it ramble.
    pub trained_context_size: u32,
    pub fits_entirely_in_vram: bool,
    pub estimated_vram_usage_mb: u64,
    pub available_vram_mb: u64,
    pub estimated_model_vram_mb: u64,
    pub estimated_context_vram_mb: u64,
    pub runtime_overhead_mb: u64,
    pub profile_name: String,
    pub advice: String,
}

#[derive(Debug)]
struct MemoryProfile {
    name: &'static str,
    runtime_overhead_mb: u64,
    /// Estimate when the model file does not describe its attention layout.
    kv_cache_mb_per_1k_tokens: u64,
    /// Exact KV layout from the GGUF header.
    shape: Option<crate::modules::gguf::ModelShape>,
    cache_factor: f64,
    /// The model's trained context, at most the largest choice.
    max_context_size: u32,
    trained_context: Option<u32>,
    recommend_largest_context: bool,
}

/// Room llama.cpp keeps in sliding-window caches next to the window (`-ub`, default 512).
const SWA_UBATCH: u32 = 512;
/// Context the planner aims for with ordinary models: plenty for long role-play chats without
/// slowing every request down.
const GENERIC_TARGET_CONTEXT: u32 = 32_768;

impl MemoryProfile {
    /// VRAM of the KV cache for `context` tokens.
    fn context_mb(&self, context: u32) -> u64 {
        match self
            .shape
            .as_ref()
            .and_then(|s| s.kv_bytes(context, SWA_UBATCH))
        {
            Some(bytes) => (bytes as f64 * self.cache_factor / (1024.0 * 1024.0)).ceil() as u64,
            None => (u64::from(context) * self.kv_cache_mb_per_1k_tokens).div_ceil(1_000),
        }
    }
}

/// Bytes of a cache type next to f16. Quantized types store a scale (and q4_1/q5_1 a minimum)
/// per block of 32 values: q8_0 34 bytes, q4_0/iq4_nl 18, q4_1 20, q5_0 22, q5_1 24 (f16: 64).
fn cache_precision_factor(cache_type: Option<&str>) -> f64 {
    match cache_type.unwrap_or("f16").to_ascii_lowercase().as_str() {
        "q4_1" => 20.0 / 64.0,
        value if value.starts_with("q4") || value.starts_with("iq4") => 18.0 / 64.0,
        "q5_1" => 24.0 / 64.0,
        value if value.starts_with("q5") => 22.0 / 64.0,
        value if value.starts_with("q8") => 34.0 / 64.0,
        "f32" => 2.0,
        _ => 1.0,
    }
}

fn memory_profile(
    model_path: Option<&str>,
    total_model_layers: u32,
    cache_type_k: Option<&str>,
    cache_type_v: Option<&str>,
) -> MemoryProfile {
    let model_name = model_path.unwrap_or_default().to_ascii_lowercase();
    let cache_factor =
        (cache_precision_factor(cache_type_k) + cache_precision_factor(cache_type_v)) / 2.0;
    let shape =
        model_path.and_then(|path| crate::modules::gguf::model_shape(std::path::Path::new(path)));
    let trained_context = shape.as_ref().and_then(|s| s.trained_context);
    let max_context_size = trained_context.unwrap_or(262_144).min(262_144);
    let shape = shape.filter(|s| s.kv_bytes_per_token.is_some());

    if model_name.contains("ternary-bonsai") || model_name.contains("ternary_bonsai") {
        // Calibrated against PrismML's published measurements. Bonsai uses hybrid
        // attention (16 of 64 layers use full attention), so its KV cache grows
        // much more slowly than that of an ordinary dense 27B model. At q4 the
        // resulting estimate is ~10.1 GB at 100K and ~12.8 GB at 262K.
        return MemoryProfile {
            name: "Ternary Bonsai (Hybrid Attention)",
            runtime_overhead_mb: 1_250,
            kv_cache_mb_per_1k_tokens: (64.0 * cache_factor).ceil() as u64,
            shape,
            cache_factor,
            max_context_size,
            trained_context,
            recommend_largest_context: true,
        };
    }

    // Without a readable header: generic GQA estimate, the common 40-layer baseline scaled
    // with the supplied layer count.
    let layers = total_model_layers.max(1) as f64;
    MemoryProfile {
        // Translated by the frontend.
        name: "generic",
        runtime_overhead_mb: 768,
        kv_cache_mb_per_1k_tokens: (128.0 * (layers / 40.0) * cache_factor).ceil() as u64,
        shape,
        cache_factor,
        max_context_size,
        trained_context,
        recommend_largest_context: false,
    }
}

/// VRAM a chat model needs with every layer on the GPU: weights, KV cache for `context_size`
/// tokens and the runtime's own buffers.
pub fn estimate_llm_vram_mb(
    model_path: &str,
    total_model_layers: u32,
    context_size: u32,
    cache_type_k: Option<&str>,
    cache_type_v: Option<&str>,
) -> u64 {
    let profile = memory_profile(
        Some(model_path),
        total_model_layers,
        cache_type_k,
        cache_type_v,
    );
    actual_model_size_mb(0, Some(model_path))
        .saturating_add(profile.runtime_overhead_mb)
        .saturating_add(profile.context_mb(context_size.min(profile.max_context_size)))
}

/// The largest context of the usual choices up to `max_tokens` for which `fits` holds.
fn largest_context_that_fits(max_tokens: u32, fits: impl Fn(u32) -> bool) -> Option<u32> {
    const CONTEXT_CHOICES: [u32; 9] = [
        262_144, 131_072, 65_536, 32_768, 16_384, 8_192, 4_096, 2_048, 1_024,
    ];
    CONTEXT_CHOICES
        .into_iter()
        .find(|choice| *choice <= max_tokens && fits(*choice))
}

/// Programs holding at least this much video memory are named when memory runs short.
const NOTABLE_GPU_USER_MB: u64 = 512;

/// Programs that hold video memory on NVIDIA GPUs (name without path, MB), largest first.
pub fn gpu_memory_users() -> Vec<(String, u64)> {
    let Ok(output) = Command::new("nvidia-smi")
        .args([
            "--query-compute-apps=process_name,used_memory",
            "--format=csv,noheader,nounits",
        ])
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }
    parse_gpu_memory_users(&String::from_utf8_lossy(&output.stdout))
}

fn parse_gpu_memory_users(csv: &str) -> Vec<(String, u64)> {
    let mut users: Vec<(String, u64)> = csv
        .lines()
        .filter_map(|line| {
            let (name, used) = line.rsplit_once(',')?;
            let used = used.trim().parse::<u64>().ok()?;
            let name = name.trim();
            // Linux and Windows (Proton) paths alike; arguments after the program are dropped.
            let program = name.split_whitespace().next().unwrap_or(name);
            let short = program
                .rsplit(['/', '\\'])
                .next()
                .unwrap_or(program)
                .to_string();
            (used >= NOTABLE_GPU_USER_MB && !short.is_empty()).then_some((short, used))
        })
        .collect();
    users.sort_by_key(|(_, used)| std::cmp::Reverse(*used));
    users
}

/// Free space where downloads land, in MB (`None` when the disk is unknown).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct DiskSpace {
    /// Chat models (models folder).
    pub models_mb: Option<u64>,
    /// Image and speech models, adapters (data folder).
    pub data_mb: Option<u64>,
}

/// Free space on the disk that holds `path`: the mount point with the longest matching prefix.
fn free_space_on(mounts: &[(std::path::PathBuf, u64)], path: &std::path::Path) -> Option<u64> {
    mounts
        .iter()
        .filter(|(mount, _)| path.starts_with(mount))
        .max_by_key(|(mount, _)| mount.as_os_str().len())
        .map(|(_, free)| free / (1024 * 1024))
}

pub fn disk_space() -> DiskSpace {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let mounts: Vec<(std::path::PathBuf, u64)> = disks
        .list()
        .iter()
        .map(|d| (d.mount_point().to_path_buf(), d.available_space()))
        .collect();
    let paths = crate::modules::paths::resolve_app_paths();
    let resolve = |p: &str| {
        let path = std::path::Path::new(p);
        let full = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        // Windows: `\\?\C:\…` does not start with the mount point `C:\`.
        let plain = full
            .to_string_lossy()
            .strip_prefix(r"\\?\")
            .map(std::path::PathBuf::from);
        plain.unwrap_or(full)
    };
    DiskSpace {
        models_mb: free_space_on(&mounts, &resolve(&paths.bundled_models_dir)),
        data_mb: free_space_on(&mounts, &resolve(&paths.data_dir)),
    }
}

pub fn probe_hardware() -> HardwareInfo {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();

    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    let os_version = System::os_version().unwrap_or_default();
    let cpu_name = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    let cpu_cores = sys.cpus().len();

    let total_ram_mb = sys.total_memory() / (1024 * 1024);
    let available_ram_mb = sys.available_memory() / (1024 * 1024);

    let mut gpus = Vec::new();

    // 1. Probe NVIDIA via nvidia-smi (Linux & Windows)
    if let Ok(output) = Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total,memory.free",
            "--format=csv,noheader,nounits",
        ])
        .output()
        && output.status.success()
    {
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
            if parts.len() >= 3 {
                let name = parts[0].to_string();
                let total_vram = parts[1].parse::<u64>().unwrap_or(0);
                let free_vram = parts[2].parse::<u64>().unwrap_or(0);

                gpus.push(GpuInfo {
                    name,
                    vendor: "NVIDIA".to_string(),
                    total_vram_mb: total_vram,
                    free_vram_mb: free_vram,
                    integrated: false,
                });
            }
        }
    }

    // AMD, Intel (and NVIDIA without nvidia-smi) via Vulkan, which every current driver ships on
    // Linux and Windows. nvidia-smi stays first for NVIDIA because it measures free VRAM exactly.
    let have_nvidia = !gpus.is_empty();
    gpus.extend(
        vulkan::gpus()
            .into_iter()
            .filter(|g| !(have_nvidia && g.vendor == "NVIDIA")),
    );
    sort_gpus(&mut gpus);

    // 2. macOS Apple Silicon unified memory detection
    #[cfg(target_os = "macos")]
    if gpus.is_empty() {
        // On Apple Silicon, unified memory acts as VRAM
        gpus.push(GpuInfo {
            name: "Apple Silicon Unified Memory".to_string(),
            vendor: "Apple".to_string(),
            total_vram_mb: total_ram_mb,
            free_vram_mb: available_ram_mb,
            integrated: true,
        });
    }

    // 3. Fallback generic GPU if none found
    if gpus.is_empty() {
        gpus.push(GpuInfo {
            name: "System Fallback (CPU/Vulkan)".to_string(),
            vendor: "Generic".to_string(),
            total_vram_mb: 0,
            free_vram_mb: 0,
            integrated: false,
        });
    }

    HardwareInfo {
        os_name,
        os_version,
        cpu_name,
        cpu_cores,
        total_ram_mb,
        available_ram_mb,
        gpus,
    }
}

/// Dedicated GPUs before integrated ones, each group largest first.
fn sort_gpus(gpus: &mut [GpuInfo]) {
    gpus.sort_by_key(|g| (g.integrated, std::cmp::Reverse(g.total_vram_mb)));
}

/// Whether two device names mean the same GPU, ignoring driver suffixes and memory figures:
/// `AMD Radeon 890M Graphics (RADV STRIX1)` from Vulkan is `AMD Radeon 890M Graphics (52254 MiB, …)`
/// in a llama.cpp device listing.
pub fn same_gpu(a: &str, b: &str) -> bool {
    let base = |name: &str| {
        name.split(" (")
            .next()
            .unwrap_or_default()
            .trim()
            .to_lowercase()
    };
    let (a, b) = (base(a), base(b));
    !a.is_empty() && a == b
}

mod vulkan {
    use super::GpuInfo;
    use ash::vk;
    use std::collections::HashSet;

    /// Physical GPUs reported by the Vulkan loader; empty when there is none or no loader.
    pub fn gpus() -> Vec<GpuInfo> {
        // SAFETY: the loader is only used within this function and the instance is destroyed
        // before returning; all handles come from that instance.
        unsafe {
            let Ok(entry) = ash::Entry::load() else {
                return Vec::new();
            };
            let app = vk::ApplicationInfo::default().api_version(vk::API_VERSION_1_1);
            let info = vk::InstanceCreateInfo::default().application_info(&app);
            let Ok(instance) = entry.create_instance(&info, None) else {
                return Vec::new();
            };
            let mut seen = HashSet::new();
            let gpus = instance
                .enumerate_physical_devices()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|device| describe(&instance, device))
                // Two drivers for one card (e.g. RADV and AMDVLK) report the same device twice.
                .filter(|(key, _)| seen.insert(*key))
                .map(|(_, gpu)| gpu)
                .collect();
            instance.destroy_instance(None);
            gpus
        }
    }

    unsafe fn describe(
        instance: &ash::Instance,
        device: vk::PhysicalDevice,
    ) -> Option<((u32, u32, u64), GpuInfo)> {
        let props = unsafe { instance.get_physical_device_properties(device) };
        let integrated = match props.device_type {
            vk::PhysicalDeviceType::DISCRETE_GPU => false,
            vk::PhysicalDeviceType::INTEGRATED_GPU => true,
            // Software rasterizers (llvmpipe) and virtual GPUs.
            _ => return None,
        };
        let name = props
            .device_name_as_c_str()
            .ok()?
            .to_string_lossy()
            .into_owned();
        let has_budget = unsafe { instance.enumerate_device_extension_properties(device) }
            .unwrap_or_default()
            .iter()
            .any(|e| e.extension_name_as_c_str() == Ok(ash::ext::memory_budget::NAME));

        let mut budget = vk::PhysicalDeviceMemoryBudgetPropertiesEXT::default();
        let memory = {
            let mut properties = vk::PhysicalDeviceMemoryProperties2::default();
            if has_budget {
                properties = properties.push_next(&mut budget);
            }
            unsafe { instance.get_physical_device_memory_properties2(device, &mut properties) };
            properties.memory_properties
        };
        // Like ggml: all device-local heaps; on integrated GPUs that includes the shared RAM.
        let (mut total, mut free) = (0u64, 0u64);
        for (i, heap) in memory.memory_heaps_as_slice().iter().enumerate() {
            if heap.flags.contains(vk::MemoryHeapFlags::DEVICE_LOCAL) {
                total += heap.size;
                if has_budget {
                    free += budget.heap_budget[i].saturating_sub(budget.heap_usage[i]);
                }
            }
        }
        let vendor = match props.vendor_id {
            0x10de => "NVIDIA",
            0x1002 => "AMD",
            0x8086 => "Intel",
            0x106b => "Apple",
            _ => "Other",
        };
        const MB: u64 = 1024 * 1024;
        Some((
            (props.vendor_id, props.device_id, total),
            GpuInfo {
                name,
                vendor: vendor.to_string(),
                total_vram_mb: total / MB,
                free_vram_mb: free / MB,
                integrated,
            },
        ))
    }
}

pub fn recommend_gpu_layers(
    model_size_mb: u64,
    total_model_layers: u32,
    context_size: u32,
    model_path: Option<&str>,
    cache_type_k: Option<&str>,
    cache_type_v: Option<&str>,
) -> LayerRecommendation {
    let hw = probe_hardware();
    let best_gpu = hw.primary_gpu();

    let (free_vram, total_vram) = match best_gpu {
        Some(gpu) => (gpu.free_vram_mb, gpu.total_vram_mb),
        None => (0, 0),
    };

    // The file knows its layer count; the caller's number is only a guess from the name.
    let layers = model_path
        .and_then(|path| crate::modules::gguf::block_count(std::path::Path::new(path)))
        .unwrap_or(total_model_layers);
    recommend_gpu_layers_for_vram(
        actual_model_size_mb(model_size_mb, model_path),
        layers,
        context_size,
        free_vram,
        total_vram,
        model_path,
        cache_type_k,
        cache_type_v,
    )
}

fn actual_model_size_mb(fallback_mb: u64, model_path: Option<&str>) -> u64 {
    model_path
        .and_then(|path| crate::modules::gguf::model_size(std::path::Path::new(path)))
        .map(|bytes| bytes.div_ceil(1024 * 1024))
        .filter(|size| *size > 0)
        .unwrap_or(fallback_mb)
}

#[allow(clippy::too_many_arguments)]
fn recommend_gpu_layers_for_vram(
    model_size_mb: u64,
    total_model_layers: u32,
    context_size: u32,
    _free_vram: u64,
    total_vram: u64,
    model_path: Option<&str>,
    cache_type_k: Option<&str>,
    cache_type_v: Option<&str>,
) -> LayerRecommendation {
    let profile = memory_profile(model_path, total_model_layers, cache_type_k, cache_type_v);
    let trained = profile.trained_context.unwrap_or(0);

    if total_vram == 0 {
        return LayerRecommendation {
            recommended_layers: 0,
            recommended_context_size: context_size.min(profile.max_context_size),
            trained_context_size: trained,
            fits_entirely_in_vram: false,
            estimated_vram_usage_mb: 0,
            available_vram_mb: 0,
            estimated_model_vram_mb: model_size_mb,
            estimated_context_vram_mb: 0,
            runtime_overhead_mb: profile.runtime_overhead_mb,
            profile_name: profile.name.to_string(),
            advice: crate::err!("backend.hardware.noGpu"),
        };
    }

    // Leave a safety margin for OS & WebGL window compositor (1500 MB).
    // Starting a new model stops any existing server, freeing allocated VRAM,
    // so we budget against the maximum capacity available to the LLM.
    let safe_vram = total_vram.saturating_sub(1_536);

    let available_for_context = safe_vram
        .saturating_sub(model_size_mb)
        .saturating_sub(profile.runtime_overhead_mb);
    let fits = |context: u32| profile.context_mb(context) <= available_for_context;
    // Bonsai: as much as fits. Other models: up to 32K, never above what the model was
    // trained for; when the model itself does not fit, a modest 8K next to the layers.
    let target = if profile.recommend_largest_context {
        profile.max_context_size
    } else {
        GENERIC_TARGET_CONTEXT.min(profile.max_context_size)
    };
    let recommended_context = largest_context_that_fits(target, fits)
        .filter(|context| *context >= 4_096 || profile.recommend_largest_context)
        .unwrap_or_else(|| 8_192.min(profile.max_context_size));
    let context_overhead_mb = profile.context_mb(recommended_context);
    let total_required_mb = model_size_mb
        .saturating_add(profile.runtime_overhead_mb)
        .saturating_add(context_overhead_mb);

    let layers = if total_model_layers == 0 {
        33
    } else {
        total_model_layers
    };

    if safe_vram >= total_required_mb {
        LayerRecommendation {
            recommended_layers: 99, // Offload all layers
            recommended_context_size: recommended_context,
            trained_context_size: trained,
            fits_entirely_in_vram: true,
            estimated_vram_usage_mb: total_required_mb,
            available_vram_mb: safe_vram,
            estimated_model_vram_mb: model_size_mb,
            estimated_context_vram_mb: context_overhead_mb,
            runtime_overhead_mb: profile.runtime_overhead_mb,
            profile_name: profile.name.to_string(),
            advice: if profile.recommend_largest_context {
                crate::err!(
                    "backend.hardware.bonsaiFits",
                    context = recommended_context / 1_024,
                    used = format!("{:.1}", total_required_mb as f64 / 1_024.0),
                    total = format!("{:.1}", safe_vram as f64 / 1_024.0)
                )
            } else {
                crate::err!(
                    "backend.hardware.modelFits",
                    context = recommended_context / 1_024,
                    used = format!("{:.1}", total_required_mb as f64 / 1_024.0),
                    total = format!("{:.1}", safe_vram as f64 / 1_024.0)
                )
            },
        }
    } else {
        // Calculate partial layer offload
        let mb_per_layer = model_size_mb.div_ceil(u64::from(layers)).max(1);
        let allocatable_for_layers = safe_vram
            .saturating_sub(profile.runtime_overhead_mb)
            .saturating_sub(context_overhead_mb);
        let possible_layers = (allocatable_for_layers / mb_per_layer) as u32;
        let recommended = possible_layers.min(layers);

        let estimated = (u64::from(recommended) * mb_per_layer)
            .saturating_add(profile.runtime_overhead_mb)
            .saturating_add(context_overhead_mb);

        LayerRecommendation {
            recommended_layers: recommended,
            recommended_context_size: recommended_context,
            trained_context_size: trained,
            fits_entirely_in_vram: false,
            estimated_vram_usage_mb: estimated,
            available_vram_mb: safe_vram,
            estimated_model_vram_mb: model_size_mb,
            estimated_context_vram_mb: context_overhead_mb,
            runtime_overhead_mb: profile.runtime_overhead_mb,
            profile_name: profile.name.to_string(),
            advice: crate::err!(
                "backend.hardware.partialOffload",
                layers = recommended,
                total_layers = layers,
                context = recommended_context / 1_024,
                used = format!("{:.1}", estimated as f64 / 1_024.0),
                total = format!("{:.1}", safe_vram as f64 / 1_024.0)
            ),
        }
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn free_space_comes_from_the_deepest_mount() {
        let gb = 1024 * 1024 * 1024;
        let mounts = vec![
            (std::path::PathBuf::from("/"), 20 * gb),
            (std::path::PathBuf::from("/home"), 300 * gb),
            (std::path::PathBuf::from("/home/kai/games"), 5 * gb),
        ];
        let free = |p: &str| super::free_space_on(&mounts, std::path::Path::new(p));
        assert_eq!(free("/home/kai/.local/share/otakusoul"), Some(300 * 1024));
        assert_eq!(free("/home/kai/games/x"), Some(5 * 1024));
        assert_eq!(free("/opt/otakusoul"), Some(20 * 1024));
        assert_eq!(super::free_space_on(&[], std::path::Path::new("/x")), None);
    }

    #[test]
    fn gpu_memory_users_are_named_without_path_and_sorted() {
        let csv = "/usr/bin/kwin_wayland, 119\nS:\\steamapps\\common\\AION2\\Binaries\\Win64\\AION2.exe, 10595\n/opt/x/llama-server --port 8080, 2048\nbroken line\n";
        assert_eq!(
            parse_gpu_memory_users(csv),
            vec![
                ("AION2.exe".to_string(), 10595),
                ("llama-server".to_string(), 2048)
            ]
        );
    }

    use super::*;

    #[test]
    fn test_probe_hardware() {
        let hw = probe_hardware();
        assert!(!hw.cpu_name.is_empty());
        assert!(hw.total_ram_mb > 0);
        assert!(!hw.gpus.is_empty());
        for gpu in &hw.gpus {
            println!(
                "GPU detected: {} ({}, {} of {} MB free, integrated: {})",
                gpu.name, gpu.vendor, gpu.free_vram_mb, gpu.total_vram_mb, gpu.integrated
            );
        }
    }

    fn gpu(name: &str, total: u64, integrated: bool) -> GpuInfo {
        GpuInfo {
            name: name.into(),
            vendor: "AMD".into(),
            total_vram_mb: total,
            free_vram_mb: total,
            integrated,
        }
    }

    #[test]
    fn plans_with_the_dedicated_gpu_even_if_the_igpu_reports_more_memory() {
        let mut gpus = vec![
            gpu("AMD Radeon 890M Graphics (RADV STRIX1)", 52_254, true),
            gpu("AMD Radeon RX 7600 (RADV NAVI33)", 8_176, false),
        ];
        sort_gpus(&mut gpus);
        let hw = HardwareInfo {
            os_name: String::new(),
            os_version: String::new(),
            cpu_name: String::new(),
            cpu_cores: 1,
            total_ram_mb: 0,
            available_ram_mb: 0,
            gpus,
        };
        assert_eq!(hw.primary_gpu().unwrap().total_vram_mb, 8_176);
    }

    #[test]
    fn matches_device_names_across_listings() {
        assert!(same_gpu(
            "AMD Radeon 890M Graphics (RADV STRIX1)",
            "AMD Radeon 890M Graphics (RADV STRIX1) (52254 MiB, 52096 MiB free)"
        ));
        assert!(same_gpu(
            "NVIDIA GeForce RTX 4070 Ti SUPER",
            "NVIDIA GeForce RTX 4070 Ti SUPER (16376 MiB, 14828 MiB free)"
        ));
        assert!(!same_gpu("AMD Radeon RX 7600", "AMD Radeon RX 7600 XT"));
        assert!(!same_gpu("", ""));
    }

    #[test]
    fn test_recommend_gpu_layers() {
        let rec = recommend_gpu_layers_for_vram(
            7500,
            40,
            4096,
            14_000,
            16_000,
            None,
            Some("q4_0"),
            Some("q4_0"),
        );
        println!(
            "Layer recommendation: {} layers, fits: {}",
            rec.recommended_layers, rec.fits_entirely_in_vram
        );
        assert!(rec.recommended_layers > 0);
        assert!(rec.fits_entirely_in_vram);

        let cpu_only =
            recommend_gpu_layers_for_vram(7500, 40, 4096, 0, 0, None, Some("q4_0"), Some("q4_0"));
        assert_eq!(cpu_only.recommended_layers, 0);
    }

    #[test]
    fn bonsai_q4_fits_262k_on_16gb_gpu() {
        let rec = recommend_gpu_layers_for_vram(
            6_872,
            64,
            32_768,
            15_000,
            16_376,
            Some("Ternary-Bonsai-2-27B-PQ2_0.gguf"),
            Some("q4_0"),
            Some("q4_0"),
        );

        assert!(rec.fits_entirely_in_vram);
        assert_eq!(rec.recommended_layers, 99);
        assert_eq!(rec.recommended_context_size, 262_144);
        assert_eq!(rec.estimated_context_vram_mb, 4_719);
        assert!(rec.estimated_vram_usage_mb < rec.available_vram_mb);
    }

    #[test]
    fn bonsai_f16_recommends_smaller_context_on_16gb_gpu() {
        let rec = recommend_gpu_layers_for_vram(
            6_872,
            64,
            262_144,
            15_000,
            16_376,
            Some("Ternary-Bonsai-2-27B-PQ2_0.gguf"),
            Some("f16"),
            Some("f16"),
        );

        assert!(rec.fits_entirely_in_vram);
        assert_eq!(rec.recommended_layers, 99);
        assert_eq!(rec.recommended_context_size, 65_536);
    }

    /// Recommendation for a real model on a 16 GB card:
    /// `OTAKUSOUL_GGUF=/path/model.gguf cargo test --lib real_model_recommendation -- --ignored --nocapture`
    #[test]
    #[ignore = "needs a model file"]
    fn real_model_recommendation() {
        let path = std::env::var("OTAKUSOUL_GGUF").expect("OTAKUSOUL_GGUF");
        let layers = crate::modules::gguf::block_count(std::path::Path::new(&path)).unwrap_or(40);
        for cache in ["f16", "q8_0"] {
            let rec = recommend_gpu_layers_for_vram(
                actual_model_size_mb(0, Some(&path)),
                layers,
                4_096,
                16_376,
                16_376,
                Some(&path),
                Some(cache),
                Some(cache),
            );
            println!(
                "{cache}: context {} (trained {}), layers {}, KV {} MB, total {} / {} MB",
                rec.recommended_context_size,
                rec.trained_context_size,
                rec.recommended_layers,
                rec.estimated_context_vram_mb,
                rec.estimated_vram_usage_mb,
                rec.available_vram_mb
            );
        }
    }
}
