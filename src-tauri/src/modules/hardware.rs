use serde::{Deserialize, Serialize};
use std::process::Command;
use sysinfo::System;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub total_vram_mb: u64,
    pub free_vram_mb: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareInfo {
    pub os_name: String,
    pub os_version: String,
    pub cpu_name: String,
    pub cpu_cores: usize,
    pub total_ram_mb: u64,
    pub available_ram_mb: u64,
    pub gpus: Vec<GpuInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LayerRecommendation {
    pub recommended_layers: u32,
    pub recommended_context_size: u32,
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
    kv_cache_mb_per_1k_tokens: u64,
    max_context_size: u32,
    recommend_largest_context: bool,
}

fn cache_precision_factor(cache_type: Option<&str>) -> f64 {
    match cache_type.unwrap_or("f16").to_ascii_lowercase().as_str() {
        value if value.starts_with("q4") => 0.25,
        value if value.starts_with("q5") => 0.3125,
        value if value.starts_with("q6") => 0.375,
        value if value.starts_with("q8") => 0.5,
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

    if model_name.contains("ternary-bonsai") || model_name.contains("ternary_bonsai") {
        // Calibrated against PrismML's published measurements. Bonsai uses hybrid
        // attention (16 of 64 layers use full attention), so its KV cache grows
        // much more slowly than that of an ordinary dense 27B model. At q4 the
        // resulting estimate is ~10.1 GB at 100K and ~12.8 GB at 262K.
        return MemoryProfile {
            name: "Ternary Bonsai (Hybrid Attention)",
            runtime_overhead_mb: 1_250,
            kv_cache_mb_per_1k_tokens: (64.0 * cache_factor).ceil() as u64,
            max_context_size: 262_144,
            recommend_largest_context: true,
        };
    }

    // Generic GQA estimate. Exact KV requirements depend on the architecture;
    // scale the common 40-layer baseline with the supplied layer count.
    let layers = total_model_layers.max(1) as f64;
    MemoryProfile {
        name: "Standard-GGUF (Schätzwert)",
        runtime_overhead_mb: 768,
        kv_cache_mb_per_1k_tokens: (128.0 * (layers / 40.0) * cache_factor).ceil() as u64,
        max_context_size: 262_144,
        recommend_largest_context: false,
    }
}

fn context_memory_mb(context_size: u32, mb_per_1k_tokens: u64) -> u64 {
    (u64::from(context_size) * mb_per_1k_tokens).div_ceil(1_000)
}

fn largest_context_that_fits(max_tokens: u32, token_capacity: u64) -> u32 {
    const CONTEXT_CHOICES: [u32; 9] = [
        262_144, 131_072, 65_536, 32_768, 16_384, 8_192, 4_096, 2_048, 1_024,
    ];

    CONTEXT_CHOICES
        .into_iter()
        .find(|choice| *choice <= max_tokens && u64::from(*choice) <= token_capacity)
        .unwrap_or(1_024)
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
        && output.status.success() {
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
                    });
                }
            }
        }

    // 2. macOS Apple Silicon unified memory detection
    #[cfg(target_os = "macos")]
    if gpus.is_empty() {
        // On Apple Silicon, unified memory acts as VRAM
        gpus.push(GpuInfo {
            name: "Apple Silicon Unified Memory".to_string(),
            vendor: "Apple".to_string(),
            total_vram_mb: total_ram_mb,
            free_vram_mb: available_ram_mb,
        });
    }

    // 3. Fallback generic GPU if none found
    if gpus.is_empty() {
        gpus.push(GpuInfo {
            name: "System Fallback (CPU/Vulkan)".to_string(),
            vendor: "Generic".to_string(),
            total_vram_mb: 0,
            free_vram_mb: 0,
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

pub fn recommend_gpu_layers(
    model_size_mb: u64,
    total_model_layers: u32,
    context_size: u32,
    model_path: Option<&str>,
    cache_type_k: Option<&str>,
    cache_type_v: Option<&str>,
) -> LayerRecommendation {
    let hw = probe_hardware();
    let best_gpu = hw
        .gpus
        .iter()
        .filter(|g| g.total_vram_mb > 0)
        .max_by_key(|g| g.free_vram_mb);

    let (free_vram, total_vram) = match best_gpu {
        Some(gpu) => (gpu.free_vram_mb, gpu.total_vram_mb),
        None => (0, 0),
    };

    recommend_gpu_layers_for_vram(
        actual_model_size_mb(model_size_mb, model_path),
        total_model_layers,
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
        .and_then(|path| std::fs::metadata(path).ok())
        .map(|metadata| metadata.len().div_ceil(1024 * 1024))
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

    if total_vram == 0 {
        return LayerRecommendation {
            recommended_layers: 0,
            recommended_context_size: context_size,
            fits_entirely_in_vram: false,
            estimated_vram_usage_mb: 0,
            available_vram_mb: 0,
            estimated_model_vram_mb: model_size_mb,
            estimated_context_vram_mb: 0,
            runtime_overhead_mb: profile.runtime_overhead_mb,
            profile_name: profile.name.to_string(),
            advice:
                "Keine dedizierte GPU gefunden. Das Modell wird vollständig auf der CPU ausgeführt."
                    .to_string(),
        };
    }

    // Leave a safety margin for OS & WebGL window compositor (1500 MB).
    // Starting a new model stops any existing server, freeing allocated VRAM,
    // so we budget against the maximum capacity available to the LLM.
    let safe_vram = total_vram.saturating_sub(1_536);

    let requested_context = context_size.max(1_024).min(profile.max_context_size);
    let available_for_context = safe_vram
        .saturating_sub(model_size_mb)
        .saturating_sub(profile.runtime_overhead_mb);
    let token_capacity = available_for_context
        .saturating_mul(1_000)
        .checked_div(profile.kv_cache_mb_per_1k_tokens.max(1))
        .unwrap_or(0);
    let recommended_context = if profile.recommend_largest_context {
        largest_context_that_fits(profile.max_context_size, token_capacity)
    } else {
        requested_context
    };
    let context_overhead_mb =
        context_memory_mb(recommended_context, profile.kv_cache_mb_per_1k_tokens);
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
            fits_entirely_in_vram: true,
            estimated_vram_usage_mb: total_required_mb,
            available_vram_mb: safe_vram,
            estimated_model_vram_mb: model_size_mb,
            estimated_context_vram_mb: context_overhead_mb,
            runtime_overhead_mb: profile.runtime_overhead_mb,
            profile_name: profile.name.to_string(),
            advice: if profile.recommend_largest_context {
                format!(
                    "Bonsai passt vollständig in den VRAM – empfohlen: {}K Kontext mit komprimiertem KV-Cache (~{:.1}/{:.1} GiB).",
                    recommended_context / 1_024,
                    total_required_mb as f64 / 1_024.0,
                    safe_vram as f64 / 1_024.0,
                )
            } else {
                format!(
                    "Modell passt mit {}K Kontext vollständig in den VRAM (~{:.1}/{:.1} GiB).",
                    recommended_context / 1_024,
                    total_required_mb as f64 / 1_024.0,
                    safe_vram as f64 / 1_024.0,
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
            fits_entirely_in_vram: false,
            estimated_vram_usage_mb: estimated,
            available_vram_mb: safe_vram,
            estimated_model_vram_mb: model_size_mb,
            estimated_context_vram_mb: context_overhead_mb,
            runtime_overhead_mb: profile.runtime_overhead_mb,
            profile_name: profile.name.to_string(),
            advice: format!(
                "Teilweises GPU-Offloading: {} von {} Layern bei {}K Kontext (~{:.1}/{:.1} GiB).",
                recommended,
                layers,
                recommended_context / 1_024,
                estimated as f64 / 1_024.0,
                safe_vram as f64 / 1_024.0,
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_probe_hardware() {
        let hw = probe_hardware();
        assert!(!hw.cpu_name.is_empty());
        assert!(hw.total_ram_mb > 0);
        assert!(!hw.gpus.is_empty());
        let gpu = &hw.gpus[0];
        println!("GPU detected: {} ({} MB VRAM)", gpu.name, gpu.total_vram_mb);
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
            6_834,
            64,
            32_768,
            15_000,
            16_376,
            Some("Ternary-Bonsai-27B-PQ2_0.gguf"),
            Some("q4_0"),
            Some("q4_0"),
        );

        assert!(rec.fits_entirely_in_vram);
        assert_eq!(rec.recommended_layers, 99);
        assert_eq!(rec.recommended_context_size, 262_144);
        assert_eq!(rec.estimated_context_vram_mb, 4_195);
        assert!(rec.estimated_vram_usage_mb < rec.available_vram_mb);
    }

    #[test]
    fn bonsai_f16_recommends_smaller_context_on_16gb_gpu() {
        let rec = recommend_gpu_layers_for_vram(
            6_834,
            64,
            262_144,
            15_000,
            16_376,
            Some("Ternary-Bonsai-27B-PQ2_0.gguf"),
            Some("f16"),
            Some("f16"),
        );

        assert!(rec.fits_entirely_in_vram);
        assert_eq!(rec.recommended_layers, 99);
        assert_eq!(rec.recommended_context_size, 65_536);
    }
}
