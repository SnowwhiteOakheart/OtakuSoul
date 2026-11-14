//! Image Studio: the user's own images with the app's local image engine (stable-diffusion.cpp,
//! the same models as chat selfies and scene images), saved as `<title>.png` with the request
//! next to it (`<file>.png.json`) in a folder of the user's choice (default: the system's
//! pictures folder plus `OtakuSoul`, see [`crate::modules::studio_files`]).
//!
//! A batch plans the GPU once ([`LocalImageEngine::generate_batch`]); while the music engine works
//! the studio refuses to start, and the other way round.

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Emitter;
use ts_rs::TS;

use crate::modules::image_generator::ImageGenerator;
use crate::modules::llama_manager::LlamaServerManager;
use crate::modules::local_image::{GenerationRequest, LocalImageEngine};
use crate::modules::studio_files::{self, StudioKind};

/// Most images of one request.
const MAX_COUNT: u32 = 8;

/// What the Image Studio asks the local image engine for (`count` images).
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, TS)]
#[serde(default)]
#[ts(export)]
pub struct ImageStudioRequest {
    /// Title (also the file name); empty = date and time.
    pub title: String,
    pub prompt: String,
    /// Empty = the negative prompt of the image settings.
    pub negative: String,
    pub model_id: String,
    /// `1:1`, `2:3`, `3:2`, `9:16`, `16:9`; empty = the model's own size.
    pub aspect: String,
    /// `None` = the model's own value.
    pub steps: Option<u32>,
    pub cfg_scale: Option<f32>,
    /// `None` = random.
    pub seed: Option<i64>,
    /// How many images (1–8), seeds counting up.
    pub count: u32,
}

/// Progress of an Image Studio batch (`image-studio-progress`).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImageStudioProgress {
    /// Image being made (1-based, 0 before the first) and how many this run makes.
    pub index: u32,
    pub total: u32,
    /// Phases of the local engine (`planning`, `unloading_tts`, `unloading_llm`,
    /// `reducing_llm`, `loading_model`, `generating`, `reloading_llm`), then `saved`, `done`,
    /// `failed` or `cancelled`.
    pub phase: String,
    pub file: Option<String>,
    pub error: Option<String>,
}

/// What is written next to an image.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct ImageOrigin {
    pub title: String,
    pub request: Option<ImageStudioRequest>,
    pub seed: Option<i64>,
    pub width: u32,
    pub height: u32,
    pub model: String,
    pub generator: String,
    pub generated: String,
    pub license: String,
}

/// An image in the Image Studio's folder.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export)]
pub struct StudioImage {
    pub file_name: String,
    pub path: String,
    pub title: String,
    pub size_bytes: u64,
    /// UNIX seconds of the last change.
    pub modified: u64,
    /// The request it was made from (only for images of the Image Studio).
    pub request: Option<ImageStudioRequest>,
    pub seed: Option<i64>,
    pub width: u32,
    pub height: u32,
    /// Licence of the model it was made with.
    pub license: String,
}

/// Width and height for `aspect` with about the pixels of the model's own size, in steps of 64
/// (the models are trained near their size; more pixels would also need more VRAM than planned).
pub fn size_for_aspect(native: (u32, u32), aspect: &str) -> (u32, u32) {
    let Some((a, b)) = aspect
        .split_once(':')
        .and_then(|(a, b)| Some((a.trim().parse::<f64>().ok()?, b.trim().parse::<f64>().ok()?)))
        .filter(|(a, b)| *a > 0.0 && *b > 0.0 && a / b <= 4.0 && b / a <= 4.0)
    else {
        return native;
    };
    let pixels = f64::from(native.0) * f64::from(native.1);
    let width = (pixels * a / b).sqrt();
    let height = pixels / width;
    let snap = |v: f64| ((v / 64.0).round() as u32 * 64).max(256);
    (snap(width), snap(height))
}

/// Images in the Image Studio's folder (PNG, JPG, WebP), newest first.
pub fn list() -> Vec<StudioImage> {
    studio_files::list_files::<ImageOrigin>(StudioKind::Images, &["png", "jpg", "jpeg", "webp"])
        .into_iter()
        .map(|file| {
            let stem = file
                .path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let origin = file.origin.unwrap_or_default();
            StudioImage {
                path: file.path.to_string_lossy().into_owned(),
                title: Some(origin.title.clone())
                    .filter(|t| !t.is_empty())
                    .unwrap_or(stem),
                size_bytes: file.size_bytes,
                modified: file.modified,
                request: origin.request,
                seed: origin.seed,
                width: origin.width,
                height: origin.height,
                license: origin.license,
                file_name: file.file_name,
            }
        })
        .collect()
}

/// Generates the request's images into the studio folder; progress goes to `on_progress`.
/// Returns the saved file names.
pub async fn generate(
    on_progress: &(impl Fn(ImageStudioProgress) + Sync),
    llama: Arc<LlamaServerManager>,
    engine: &LocalImageEngine,
    request: &ImageStudioRequest,
) -> Result<Vec<String>, String> {
    if crate::modules::music_gen::engine().is_busy() {
        return Err(crate::err!("backend.studio.musicBusy"));
    }
    if request.prompt.trim().is_empty() {
        return Err(crate::err!("backend.studio.noPrompt"));
    }
    let model = crate::modules::local_image::installed_models()
        .into_iter()
        .find(|m| m.id == request.model_id)
        .ok_or_else(|| crate::err!("backend.localImage.noModel"))?;
    let config = ImageGenerator::load_config();
    let negative = if request.negative.trim().is_empty() {
        config.negative_prompt.clone()
    } else {
        request.negative.trim().to_string()
    };
    let (width, height) = size_for_aspect((model.width, model.height), &request.aspect);
    let total = request.count.clamp(1, MAX_COUNT);
    let base_seed = request
        .seed
        .filter(|s| *s >= 0)
        .unwrap_or_else(|| i64::from(rand::random::<u32>() >> 1));
    let dir = studio_files::prepare_dir(StudioKind::Images)?;
    let title = studio_files::file_title(&request.title, "Bild");
    let emit = |index: u32, phase: &str, file: Option<String>, error: Option<String>| {
        on_progress(ImageStudioProgress {
            index,
            total,
            phase: phase.to_string(),
            file,
            error,
        })
    };

    let prompt = request.prompt.trim().to_string();
    let mut saved = Vec::new();
    let mut on_image = |index: u32, seed: i64, png: Vec<u8>| -> Result<(), String> {
        let name = studio_files::unique_file_name(&dir, &title, "png");
        std::fs::write(dir.join(&name), &png)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        let mut kept = request.clone();
        kept.title = title.clone();
        let origin = ImageOrigin {
            title: if total > 1 {
                format!("{title} ({index})")
            } else {
                title.clone()
            },
            request: Some(kept),
            seed: Some(seed),
            width,
            height,
            model: model.name.clone(),
            generator: "stable-diffusion.cpp (OtakuSoul Bild-Studio)".to_string(),
            generated: chrono::Local::now().format("%Y-%m-%d %H:%M").to_string(),
            license: model.license.clone(),
        };
        let _ = std::fs::write(
            dir.join(format!("{name}.json")),
            serde_json::to_string_pretty(&origin).unwrap_or_default(),
        );
        emit(index, "saved", Some(name.clone()), None);
        saved.push(name);
        Ok(())
    };
    let result = engine
        .generate_batch(
            &|phase, index| emit(index, phase, None, None),
            llama,
            GenerationRequest {
                model_id: &model.id,
                strategy: config.vram_strategy,
                prompt: &prompt,
                negative: &negative,
                seed: base_seed,
                loras: &config.local_loras,
                reference: None,
                size: Some((width, height)),
                steps: request.steps.map(|s| s.clamp(1, 150)),
                cfg_scale: request.cfg_scale.map(|c| c.clamp(0.0, 30.0)),
            },
            total,
            &mut on_image,
        )
        .await;
    let count = saved.len() as u32;
    match &result {
        Ok(_) => emit(count, "done", None, None),
        Err(e) if e.contains("backend.localImage.cancelled") => {
            emit(count, "cancelled", None, Some(e.clone()))
        }
        Err(e) => emit(count, "failed", None, Some(e.clone())),
    }
    result.map(|_| saved)
}

/// Generates and reports progress as the `image-studio-progress` event.
pub async fn generate_with_events<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    llama: Arc<LlamaServerManager>,
    engine: &LocalImageEngine,
    request: &ImageStudioRequest,
) -> Result<Vec<String>, String> {
    generate(
        &|p| {
            let _ = app.emit("image-studio-progress", p);
        },
        llama,
        engine,
        request,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aspect_sizes_keep_the_pixel_count_in_steps_of_64() {
        // SDXL's own 832 × 1216.
        let native = (832, 1216);
        assert_eq!(size_for_aspect(native, ""), native);
        assert_eq!(size_for_aspect(native, "quatsch"), native);
        assert_eq!(size_for_aspect(native, "1:0"), native);
        assert_eq!(size_for_aspect(native, "10:1"), native);
        assert_eq!(size_for_aspect(native, "1:1"), (1024, 1024));
        assert_eq!(size_for_aspect(native, "16:9"), (1344, 768));
        assert_eq!(size_for_aspect(native, "9:16"), (768, 1344));
        for aspect in ["1:1", "2:3", "3:2", "9:16", "16:9"] {
            let (w, h) = size_for_aspect(native, aspect);
            assert_eq!((w % 64, h % 64), (0, 0));
            let ratio = f64::from(w * h) / f64::from(native.0 * native.1);
            assert!((0.9..1.1).contains(&ratio), "{aspect}: {w}×{h}");
        }
        // SD 1.5's own 512 × 768.
        assert_eq!(size_for_aspect((512, 768), "1:1"), (640, 640));
    }

    #[test]
    fn old_requests_still_read() {
        let request: ImageStudioRequest = serde_json::from_str(r#"{"prompt":"sunset"}"#).unwrap();
        assert_eq!(request.prompt, "sunset");
        assert_eq!(request.count, 0);
        assert_eq!(request.aspect, "");
    }
}
