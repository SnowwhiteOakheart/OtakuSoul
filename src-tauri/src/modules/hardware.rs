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
    pub fits_entirely_in_vram: bool,
    pub estimated_vram_usage_mb: u64,
    pub available_vram_mb: u64,
    pub advice: String,
}

pub fn probe_hardware() -> HardwareInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let os_name = System::name().unwrap_or_else(|| "Unknown OS".to_string());
    let os_version = System::os_version().unwrap_or_else(|| "".to_string());
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
    {
        if output.status.success() {
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

    if total_vram == 0 {
        return LayerRecommendation {
            recommended_layers: 0,
            fits_entirely_in_vram: false,
            estimated_vram_usage_mb: 0,
            available_vram_mb: 0,
            advice: "Keine dedizierte GPU gefunden. Das Modell wird vollständig auf der CPU ausgeführt.".to_string(),
        };
    }

    // Leave a safety margin for OS & WebGL window compositor (1500 MB).
    // Starting a new model stops any existing server, freeing allocated VRAM,
    // so we budget against the maximum capacity available to the LLM.
    let safe_vram = total_vram.saturating_sub(1500);

    // Approximate context overhead: ~1.2MB per 1000 tokens for 8B-14B models
    let context_overhead_mb = ((context_size as u64) * 12) / 10000;
    let total_required_mb = model_size_mb + context_overhead_mb;

    let layers = if total_model_layers == 0 { 33 } else { total_model_layers };

    if safe_vram >= total_required_mb {
        LayerRecommendation {
            recommended_layers: 99, // Offload all layers
            fits_entirely_in_vram: true,
            estimated_vram_usage_mb: total_required_mb,
            available_vram_mb: free_vram,
            advice: format!(
                "Modell passt komplett in den VRAM ({}/{} MB verfügbar). Maximale Inferenzgeschwindigkeit!",
                free_vram, total_vram
            ),
        }
    } else {
        // Calculate partial layer offload
        let mb_per_layer = model_size_mb.checked_div(layers as u64).unwrap_or(150).max(1);
        let allocatable_for_layers = safe_vram.saturating_sub(context_overhead_mb);
        let possible_layers = (allocatable_for_layers / mb_per_layer) as u32;
        let recommended = possible_layers.min(layers);

        let estimated = (recommended as u64 * mb_per_layer) + context_overhead_mb;

        LayerRecommendation {
            recommended_layers: recommended,
            fits_entirely_in_vram: false,
            estimated_vram_usage_mb: estimated,
            available_vram_mb: free_vram,
            advice: format!(
                "Teilweises GPU-Offloading: {} von {} Layern auf die GPU verlagert (~{} MB VRAM).",
                recommended, layers, estimated
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
        let rec = recommend_gpu_layers(7500, 40, 4096);
        println!("Layer recommendation: {} layers, fits: {}", rec.recommended_layers, rec.fits_entirely_in_vram);
        assert!(rec.recommended_layers > 0);
    }
}

