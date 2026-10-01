use chrono::Utc;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use tracing::info;
use ts_rs::TS;

use crate::modules::paths::resolve_app_paths;

const IMAGE_GEN_KEY_ACCOUNT: &str = "image_gen_api_key";

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImageGenConfig {
    /// `local` (stable-diffusion.cpp run by the app), `bonsai_image` (PrismML demo server),
    /// `automatic1111`, `comfy_ui`, `dall_e_3`, `novel_ai`; case and separators are ignored.
    pub provider: String,
    pub api_url: String, // e.g. "http://127.0.0.1:7860" or "http://127.0.0.1:8188"
    pub api_key: Option<String>,
    pub positive_prompt_prefix: String,
    pub negative_prompt: String,
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg_scale: f32,
    pub sampler_name: String,
    pub seed: i64,
    /// Catalog id of the local image model (provider "Local").
    #[serde(default)]
    pub local_model_id: Option<String>,
    /// How the local image model shares the GPU with the chat model.
    #[serde(default)]
    pub vram_strategy: crate::modules::local_image::VramStrategy,
}

impl Default for ImageGenConfig {
    fn default() -> Self {
        Self {
            provider: "Automatic1111".to_string(),
            api_url: "http://127.0.0.1:7860".to_string(),
            api_key: None,
            positive_prompt_prefix: "masterpiece, best quality, very aesthetic, anime artstyle, vivid colors, highly detailed".to_string(),
            negative_prompt: "worst quality, low quality, normal quality, lowres, bad anatomy, bad hands, missing fingers, extra digits, poorly drawn face, mutated, deformed, watermark, signature, text, blurry".to_string(),
            width: 512,
            height: 768,
            steps: 24,
            cfg_scale: 7.0,
            sampler_name: "Euler a".to_string(),
            seed: -1,
            local_model_id: None,
            vram_strategy: Default::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GeneratedImageResult {
    pub file_name: String,
    pub file_path: String,
    pub base64_data_url: String,
    pub prompt_used: String,
    pub negative_used: String,
    pub width: u32,
    pub height: u32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct GeneratedImageInfo {
    pub file_name: String,
    pub file_path: String,
    pub size_bytes: u64,
    pub created_at: String,
}

/// Asks the chat model to turn a character or scene plus the recent story into a prompt for
/// the image model. Runs before any VRAM swap, while the chat model is still loaded.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ImagePromptRequest {
    pub endpoint_url: String,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub provider: Option<crate::modules::providers::LlmProviderType>,
    /// `portrait` of a character or `scene` for the stage.
    pub kind: String,
    /// `tags` (SDXL anime models) or `natural` (FLUX, Qwen-Image, Bonsai Image).
    pub style: String,
    pub subject: String,
    pub description: String,
    /// Latest messages or narration, oldest first.
    pub context: Vec<String>,
}

const IMAGE_PROMPT_SYSTEM: &str = r#"You write prompts for an anime image generator.
Reply with the prompt only: one line in English, no quotes, no explanations, no text or speech bubbles in the image.
Describe the {kind} so it matches the current moment of the story: appearance from the description, pose, expression, clothing, location, time of day and lighting from the recent events.
{style}"#;

fn clean_prompt(raw: &str) -> String {
    let line = raw
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
        .unwrap_or_default();
    let line = line
        .strip_prefix("Prompt:")
        .or_else(|| line.strip_prefix("prompt:"))
        .unwrap_or(line)
        .trim()
        .trim_matches(|c| c == '"' || c == '`' || c == '\'');
    line.to_string()
}

/// What the "Local" provider needs from the running app.
pub struct LocalBackend<'a> {
    pub app: &'a tauri::AppHandle,
    pub engine: &'a crate::modules::local_image::LocalImageEngine,
    pub llama: std::sync::Arc<crate::modules::llama_manager::LlamaServerManager>,
}

/// Provider name without case and separators: the settings store `comfy_ui`, older
/// configurations `ComfyUI` - both mean the same backend.
fn normalized_provider(provider: &str) -> String {
    provider
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// Width and height from a PNG header.
fn png_size(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    let read =
        |at: usize| -> Option<u32> { Some(u32::from_be_bytes(bytes[at..at + 4].try_into().ok()?)) };
    Some((read(16)?, read(20)?))
}

pub struct ImageGenerator;

impl ImageGenerator {
    pub fn get_images_dir() -> PathBuf {
        let paths = resolve_app_paths();
        let dir = PathBuf::from(&paths.data_dir).join("generated_images");
        if !dir.exists() {
            let _ = fs::create_dir_all(&dir);
        }
        dir
    }

    pub fn load_config() -> ImageGenConfig {
        let paths = resolve_app_paths();
        let config_path = PathBuf::from(&paths.data_dir).join("image_gen_config.json");
        if config_path.exists()
            && let Ok(content) = fs::read_to_string(&config_path)
            && let Ok(mut cfg) = serde_json::from_str::<ImageGenConfig>(&content)
        {
            if crate::modules::secrets::hydrate_opt(IMAGE_GEN_KEY_ACCOUNT, &mut cfg.api_key) {
                let _ = Self::save_config(&cfg);
            }
            return cfg;
        }
        ImageGenConfig::default()
    }

    pub fn save_config(config: &ImageGenConfig) -> Result<(), String> {
        let paths = resolve_app_paths();
        let config_path = PathBuf::from(&paths.data_dir).join("image_gen_config.json");
        let mut on_disk = config.clone();
        crate::modules::secrets::externalize_opt(IMAGE_GEN_KEY_ACCOUNT, &mut on_disk.api_key);
        let json_str = serde_json::to_string_pretty(&on_disk).map_err(|e| {
            format!(
                "Fehler beim Serialisieren der Bildgenerierungs-Konfiguration: {}",
                e
            )
        })?;
        fs::write(&config_path, json_str).map_err(|e| {
            format!(
                "Fehler beim Speichern der Bildgenerierungs-Konfiguration: {}",
                e
            )
        })?;
        Ok(())
    }

    /// Lets the chat model write an image prompt (see [`ImagePromptRequest`]).
    pub async fn write_image_prompt(
        inference: &crate::modules::inference::InferenceClient,
        request: ImagePromptRequest,
    ) -> Result<String, String> {
        use crate::modules::inference::{ChatMessage, ChatRequest, SamplingParams};
        let tags = request.style == "tags";
        let style = if tags {
            "Use comma-separated Danbooru-style tags (e.g. 1girl, long hair, smile, night, city lights), at most 40 tags."
        } else {
            "Use one or two vivid natural-language sentences, at most 70 words, ending with: anime illustration, detailed."
        };
        let kind = if request.kind == "scene" {
            "scene (environment first, characters small or absent)"
        } else {
            "character portrait (upper body, looking at the viewer)"
        };
        let system = IMAGE_PROMPT_SYSTEM
            .replace("{kind}", kind)
            .replace("{style}", style);
        let context = request
            .context
            .iter()
            .rev()
            .take(6)
            .rev()
            .map(|m| m.chars().take(600).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n---\n");
        let user = format!(
            "Subject: {}\n\nDescription:\n{}\n\nRecent story:\n{}",
            request.subject,
            request.description.chars().take(2_000).collect::<String>(),
            if context.is_empty() {
                "(none)"
            } else {
                &context
            }
        );
        let raw = inference
            .generate_direct(ChatRequest {
                endpoint_url: request.endpoint_url,
                api_key: request.api_key,
                model: request.model,
                messages: vec![
                    ChatMessage {
                        role: "system".to_string(),
                        content: system,
                    },
                    ChatMessage {
                        role: "user".to_string(),
                        content: user,
                    },
                ],
                sampling: Some(SamplingParams {
                    temperature: Some(0.4),
                    max_tokens: Some(220),
                    ..Default::default()
                }),
                reasoning_mode: Some(false),
                provider: request.provider,
            })
            .await?;
        let prompt = clean_prompt(&raw);
        if prompt.is_empty() {
            return Err(crate::err!("backend.image.emptyPrompt"));
        }
        let prefix = Self::load_config().positive_prompt_prefix;
        Ok(if tags && !prefix.trim().is_empty() {
            format!("{}, {prompt}", prefix.trim())
        } else {
            prompt
        })
    }

    /// Copies a generated image into the stage backgrounds folder and returns its name.
    pub fn save_stage_background(file_path: &str) -> Result<String, String> {
        let source = std::path::Path::new(file_path);
        let images_dir = Self::get_images_dir();
        // Only images the app generated may be copied.
        if source.parent().map(|p| p != images_dir).unwrap_or(true) {
            return Err(crate::err!("backend.common.pathMissing", path = file_path));
        }
        let name = source
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| crate::err!("backend.common.pathMissing", path = file_path))?
            .to_string();
        let dir = PathBuf::from(&resolve_app_paths().data_dir).join("backgrounds");
        fs::create_dir_all(&dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
        fs::copy(source, dir.join(&name))
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        Ok(name)
    }

    /// Synthesizes a structured anime / illustration prompt from character card and context.
    pub fn build_character_prompt(
        character_name: &str,
        character_description: Option<&str>,
        emotion: Option<&str>,
        scene_context: Option<&str>,
        user_prompt: Option<&str>,
    ) -> String {
        let config = Self::load_config();
        let mut prompt_parts = Vec::new();

        if !config.positive_prompt_prefix.is_empty() {
            prompt_parts.push(config.positive_prompt_prefix.clone());
        }

        // 1girl / character marker
        prompt_parts.push(format!("1girl, {}", character_name));

        // Emotion tag mapping
        if let Some(emo) = emotion {
            let emo_tag = match emo.to_lowercase().as_str() {
                "curious" => "curious expression, tilted head, wide eyes, looking at viewer",
                "warm" | "affection" => {
                    "gentle smile, blushing cheeks, warm gaze, loving expression"
                }
                "amused" | "playful" => {
                    "playful grin, laughing, mischievous expression, energetic pose"
                }
                "concerned" | "anxious" => {
                    "worried expression, slight frown, furrowed eyebrows, concerned gaze"
                }
                "relaxed" => "relaxed posture, serene smile, peaceful atmosphere, soft lighting",
                "sleepy" => "sleepy eyes, yawning, tired, cozy atmosphere, relaxed",
                "melancholy" | "sad" => "melancholy, looking down, solemn expression, sad gaze",
                "excited" => "sparkling eyes, ecstatic expression, open mouth, vibrant atmosphere",
                _ => "neutral expression, looking at viewer",
            };
            prompt_parts.push(emo_tag.to_string());
        }

        // Extract key visual tags from character description if available
        if let Some(desc) = character_description {
            let visual_tags = Self::extract_visual_traits(desc);
            if !visual_tags.is_empty() {
                prompt_parts.push(visual_tags);
            }
        }

        // Scene context or location
        if let Some(scene) = scene_context
            && !scene.trim().is_empty()
        {
            prompt_parts.push(format!("location: {}, scenic background", scene.trim()));
        }

        // Extra user prompt
        if let Some(extra) = user_prompt
            && !extra.trim().is_empty()
        {
            prompt_parts.push(extra.trim().to_string());
        }

        prompt_parts.join(", ")
    }

    /// Extract visual keywords from character text (hair, eyes, clothing)
    fn extract_visual_traits(desc: &str) -> String {
        let mut traits = Vec::new();
        let lower = desc.to_lowercase();

        // Common hair colors
        for color in &[
            "black hair",
            "white hair",
            "silver hair",
            "blonde hair",
            "brown hair",
            "pink hair",
            "blue hair",
            "purple hair",
            "red hair",
            "green hair",
        ] {
            if lower.contains(color) {
                traits.push(*color);
            }
        }
        // Hair length
        for len in &[
            "long hair",
            "short hair",
            "twintails",
            "ponytail",
            "braid",
            "bob cut",
        ] {
            if lower.contains(len) {
                traits.push(*len);
            }
        }
        // Eye colors
        for eye in &[
            "blue eyes",
            "red eyes",
            "amber eyes",
            "golden eyes",
            "green eyes",
            "purple eyes",
            "brown eyes",
        ] {
            if lower.contains(eye) {
                traits.push(*eye);
            }
        }
        // Clothing / Archetype markers
        for cloth in &[
            "school uniform",
            "sailor uniform",
            "maid outfit",
            "kimono",
            "hoodie",
            "dress",
            "cyberpunk clothing",
            "knight armor",
            "sweater",
        ] {
            if lower.contains(cloth) {
                traits.push(*cloth);
            }
        }

        traits.join(", ")
    }

    /// Main dispatch function for image generation
    pub async fn generate_image(
        prompt: &str,
        negative: Option<&str>,
        custom_config: Option<ImageGenConfig>,
        local: Option<LocalBackend<'_>>,
    ) -> Result<GeneratedImageResult, String> {
        let config = custom_config.unwrap_or_else(Self::load_config);
        let negative_prompt = negative.unwrap_or(&config.negative_prompt);

        info!(
            "Starte Bildgenerierung mit Provider: [{}] | Prompt: {}",
            config.provider, prompt
        );

        let (mut width, mut height) = (config.width, config.height);
        let image_bytes = match normalized_provider(&config.provider).as_str() {
            "local" => {
                let local = local.ok_or_else(|| crate::err!("backend.localImage.unavailable"))?;
                let model_id = config
                    .local_model_id
                    .clone()
                    .ok_or_else(|| crate::err!("backend.localImage.noModel"))?;
                let bytes = local
                    .engine
                    .generate(
                        &|status| {
                            let _ = tauri::Emitter::emit(local.app, "local-image-status", status);
                        },
                        local.llama,
                        crate::modules::local_image::GenerationRequest {
                            model_id: &model_id,
                            strategy: config.vram_strategy,
                            prompt,
                            negative: negative_prompt,
                            seed: config.seed,
                        },
                    )
                    .await?;
                if let Some((w, h)) = png_size(&bytes) {
                    (width, height) = (w, h);
                }
                bytes
            }
            "bonsaiimage" => Self::generate_bonsai(&config, prompt).await?,
            "automatic1111" | "sdwebui" | "forge" => {
                Self::generate_automatic1111(&config, prompt, negative_prompt).await?
            }
            "comfyui" => Self::generate_comfyui(&config, prompt, negative_prompt).await?,
            "dalle3" | "openai" => Self::generate_dalle(&config, prompt).await?,
            "novelai" => Self::generate_novelai(&config, prompt, negative_prompt).await?,
            _ => {
                // Fallback to Automatic1111 API format
                Self::generate_automatic1111(&config, prompt, negative_prompt).await?
            }
        };

        // Save generated image
        let images_dir = Self::get_images_dir();
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
        let file_name = format!("gen_{}_{}.png", timestamp, fastrand::u32(1000..9999));
        let file_path = images_dir.join(&file_name);

        let mut file = File::create(&file_path)
            .map_err(|e| crate::err!("backend.image.fileCreate", error = e))?;
        file.write_all(&image_bytes)
            .map_err(|e| crate::err!("backend.image.fileWrite", error = e))?;

        let base64_str =
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &image_bytes);
        let base64_data_url = format!("data:image/png;base64,{}", base64_str);

        info!("Bild erfolgreich gespeichert unter: {:?}", file_path);

        Ok(GeneratedImageResult {
            file_name,
            file_path: file_path.to_string_lossy().to_string(),
            base64_data_url,
            prompt_used: prompt.to_string(),
            negative_used: negative_prompt.to_string(),
            width,
            height,
            created_at: Utc::now().to_rfc3339(),
        })
    }

    /// Automatic1111 / SD WebUI / Forge API endpoint
    async fn generate_automatic1111(
        config: &ImageGenConfig,
        prompt: &str,
        negative: &str,
    ) -> Result<Vec<u8>, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
            .map_err(|e| e.to_string())?;

        let url = format!("{}/sdapi/v1/txt2img", config.api_url.trim_end_matches('/'));

        let payload = serde_json::json!({
            "prompt": prompt,
            "negative_prompt": negative,
            "steps": config.steps,
            "width": config.width,
            "height": config.height,
            "cfg_scale": config.cfg_scale,
            "sampler_name": config.sampler_name,
            "seed": config.seed,
            "save_images": false,
            "send_images": true
        });

        let mut req = client.post(&url).json(&payload);
        if let Some(ref key) = config.api_key
            && !key.is_empty()
        {
            req = req.header(AUTHORIZATION, format!("Bearer {}", key));
        }

        let resp = req.send().await.map_err(|e| {
            format!(
                "Fehler beim Verbinden mit Automatic1111 unter {}: {}",
                url, e
            )
        })?;

        if !resp.status().is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            return Err(crate::err!("backend.image.a1111Server", error = err_text));
        }

        let json_resp: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| crate::err!("backend.image.a1111Parse", error = e))?;

        let images = json_resp["images"]
            .as_array()
            .ok_or_else(|| crate::err!("backend.image.a1111NoImages"))?;

        if images.is_empty() {
            return Err(crate::err!("backend.image.a1111Empty"));
        }

        let b64_img = images[0]
            .as_str()
            .ok_or_else(|| crate::err!("backend.image.a1111InvalidImage"))?;

        let img_bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64_img)
            .map_err(|e| crate::err!("backend.image.base64", error = e))?;

        Ok(img_bytes)
    }

    /// PrismML's Bonsai Image demo server (`scripts/serve.sh`): `POST /generate` returns a PNG.
    async fn generate_bonsai(config: &ImageGenConfig, prompt: &str) -> Result<Vec<u8>, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
        let url = format!("{}/generate", config.api_url.trim_end_matches('/'));
        // Bonsai Image is a distilled FLUX.2 klein model: few steps, sizes in steps of 16.
        let round = |v: u32| (v.clamp(256, 1536) / 16) * 16;
        let seed = if config.seed < 0 {
            i64::from(fastrand::u32(0..i32::MAX as u32))
        } else {
            config.seed
        };
        let payload = serde_json::json!({
            "prompt": prompt,
            "seed": seed,
            "steps": config.steps.clamp(1, 8),
            "width": round(config.width),
            "height": round(config.height),
        });
        let response = client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| crate::err!("backend.image.bonsaiConnect", url = url, error = e))?;
        if !response.status().is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(crate::err!("backend.image.bonsaiServer", error = body));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|e| crate::err!("backend.image.bonsaiServer", error = e))?;
        Ok(bytes.to_vec())
    }

    /// ComfyUI Native API endpoint
    async fn generate_comfyui(
        config: &ImageGenConfig,
        prompt: &str,
        negative: &str,
    ) -> Result<Vec<u8>, String> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .build()
            .map_err(|e| e.to_string())?;

        let base_url = config.api_url.trim_end_matches('/');

        // Basic default ComfyUI workflow for Text-to-Image
        let client_id = format!("otakusoul_{}", fastrand::u32(10000..99999));
        let seed = if config.seed == -1 {
            fastrand::i64(1..999999999999999)
        } else {
            config.seed
        };

        let workflow = serde_json::json!({
            "prompt": {
                "3": {
                    "class_type": "KSampler",
                    "inputs": {
                        "cfg": config.cfg_scale,
                        "denoise": 1.0,
                        "latent_image": ["5", 0],
                        "model": ["4", 0],
                        "negative": ["7", 0],
                        "positive": ["6", 0],
                        "sampler_name": "euler_ancestral",
                        "scheduler": "karras",
                        "seed": seed,
                        "steps": config.steps
                    }
                },
                "4": {
                    "class_type": "CheckpointLoaderSimple",
                    "inputs": {
                        "ckpt_name": "v1-5-pruned-emaonly.safetensors"
                    }
                },
                "5": {
                    "class_type": "EmptyLatentImage",
                    "inputs": {
                        "batch_size": 1,
                        "height": config.height,
                        "width": config.width
                    }
                },
                "6": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {
                        "clip": ["4", 1],
                        "text": prompt
                    }
                },
                "7": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {
                        "clip": ["4", 1],
                        "text": negative
                    }
                },
                "8": {
                    "class_type": "VAEDecode",
                    "inputs": {
                        "samples": ["3", 0],
                        "vae": ["4", 2]
                    }
                },
                "9": {
                    "class_type": "SaveImage",
                    "inputs": {
                        "filename_prefix": "OtakuSoul",
                        "images": ["8", 0]
                    }
                }
            },
            "client_id": client_id
        });

        let prompt_url = format!("{}/prompt", base_url);
        let resp = client
            .post(&prompt_url)
            .json(&workflow)
            .send()
            .await
            .map_err(|e| crate::err!("backend.image.comfySend", url = prompt_url, error = e))?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(crate::err!("backend.image.comfyPrompt", error = err));
        }

        let json_resp: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| crate::err!("backend.image.comfyJson", error = e))?;

        let prompt_id = json_resp["prompt_id"]
            .as_str()
            .ok_or_else(|| crate::err!("backend.image.comfyNoPromptId"))?;

        // Poll history endpoint until prompt_id is present
        let history_url = format!("{}/history/{}", base_url, prompt_id);
        let mut attempts = 0;
        let mut final_filename = String::new();
        let mut final_subfolder = String::new();
        let mut final_type = "output".to_string();

        while attempts < 60 {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            attempts += 1;

            if let Ok(h_resp) = client.get(&history_url).send().await
                && let Ok(h_json) = h_resp.json::<serde_json::Value>().await
                && let Some(item) = h_json.get(prompt_id)
                && let Some(outputs) = item.get("outputs")
            {
                // Find node with images
                for (_node_id, node_data) in outputs.as_object().into_iter().flatten() {
                    if let Some(imgs) = node_data.get("images").and_then(|i| i.as_array())
                        && let Some(first_img) = imgs.first()
                    {
                        final_filename = first_img["filename"].as_str().unwrap_or("").to_string();
                        final_subfolder = first_img["subfolder"].as_str().unwrap_or("").to_string();
                        final_type = first_img["type"].as_str().unwrap_or("output").to_string();
                        break;
                    }
                }
                if !final_filename.is_empty() {
                    break;
                }
            }
        }

        if final_filename.is_empty() {
            return Err(crate::err!("backend.image.comfyTimeout", id = prompt_id));
        }

        // Fetch image via /view
        let view_url = format!(
            "{}/view?filename={}&subfolder={}&type={}",
            base_url,
            urlencoding::encode(&final_filename),
            urlencoding::encode(&final_subfolder),
            urlencoding::encode(&final_type)
        );

        let img_resp = client
            .get(&view_url)
            .send()
            .await
            .map_err(|e| crate::err!("backend.image.comfyDownload", error = e))?;

        let bytes = img_resp
            .bytes()
            .await
            .map_err(|e| crate::err!("backend.image.comfyRead", error = e))?;

        Ok(bytes.to_vec())
    }

    /// OpenAI DALL-E 3 API
    async fn generate_dalle(config: &ImageGenConfig, prompt: &str) -> Result<Vec<u8>, String> {
        let api_key = config.api_key.as_deref().unwrap_or("");
        if api_key.is_empty() {
            return Err(crate::err!("backend.image.dalleNoKey"));
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;

        let base_url = if config.api_url.contains("openai.com") || config.api_url.is_empty() {
            "https://api.openai.com/v1"
        } else {
            config.api_url.trim_end_matches('/')
        };

        let url = format!("{}/images/generations", base_url);

        let payload = serde_json::json!({
            "model": "dall-e-3",
            "prompt": prompt,
            "n": 1,
            "size": "1024x1024",
            "response_format": "b64_json"
        });

        let resp = client
            .post(&url)
            .header(AUTHORIZATION, format!("Bearer {}", api_key))
            .header(CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| crate::err!("backend.image.dalleConnect", error = e))?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(crate::err!("backend.image.dalleApi", error = err));
        }

        let json_resp: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| crate::err!("backend.image.dalleInvalid", error = e))?;

        let b64 = json_resp["data"][0]["b64_json"]
            .as_str()
            .ok_or_else(|| crate::err!("backend.image.dalleNoImage"))?;

        let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, b64)
            .map_err(|e| crate::err!("backend.image.dalleDecode", error = e))?;

        Ok(bytes)
    }

    /// NovelAI Image Generation API
    async fn generate_novelai(
        config: &ImageGenConfig,
        prompt: &str,
        negative: &str,
    ) -> Result<Vec<u8>, String> {
        let api_key = config.api_key.as_deref().unwrap_or("");
        if api_key.is_empty() {
            return Err(crate::err!("backend.image.novelaiNoKey"));
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?;

        let url = "https://image.novelai.net/ai/generate-image";

        let payload = serde_json::json!({
            "input": prompt,
            "model": "nai-diffusion-3",
            "action": "generate",
            "parameters": {
                "width": config.width,
                "height": config.height,
                "scale": config.cfg_scale,
                "sampler": "k_euler",
                "steps": config.steps,
                "n_samples": 1,
                "uc": negative
            }
        });

        let resp = client
            .post(url)
            .header(AUTHORIZATION, format!("Bearer {}", api_key))
            .header(CONTENT_TYPE, "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| crate::err!("backend.image.novelaiRequest", error = e))?;

        if !resp.status().is_success() {
            let err = resp.text().await.unwrap_or_default();
            return Err(crate::err!("backend.image.novelaiApi", error = err));
        }

        let bytes = resp
            .bytes()
            .await
            .map_err(|e| crate::err!("backend.image.novelaiRead", error = e))?;

        // NovelAI returns a zip archive containing image_0.png
        if let Ok(mut archive) = zip::ZipArchive::new(std::io::Cursor::new(&bytes))
            && let Ok(mut file) = archive.by_name("image_0.png")
        {
            let mut img_buf = Vec::new();
            std::io::Read::read_to_end(&mut file, &mut img_buf)
                .map_err(|e| crate::err!("backend.image.novelaiZip", error = e))?;
            return Ok(img_buf);
        }

        Ok(bytes.to_vec())
    }

    /// Lists all images in the generated_images directory
    pub fn list_generated_images() -> Vec<GeneratedImageInfo> {
        let images_dir = Self::get_images_dir();
        let mut list = Vec::new();

        if let Ok(entries) = fs::read_dir(&images_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let ext = path
                        .extension()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_lowercase();
                    if ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "webp" {
                        let file_name = path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        let size_bytes = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                        let created_at = fs::metadata(&path)
                            .and_then(|m| m.created().or_else(|_| m.modified()))
                            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
                            .unwrap_or_else(|_| Utc::now().to_rfc3339());

                        list.push(GeneratedImageInfo {
                            file_name,
                            file_path: path.to_string_lossy().to_string(),
                            size_bytes,
                            created_at,
                        });
                    }
                }
            }
        }

        // Sort newest first
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        list
    }
}

// Minimal random helper
mod fastrand {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEED: AtomicU64 = AtomicU64::new(88172645463325252);

    fn next() -> u64 {
        let mut s = SEED.load(Ordering::Relaxed);
        s ^= s << 13;
        s ^= s >> 7;
        s ^= s << 17;
        SEED.store(s, Ordering::Relaxed);
        s
    }

    pub fn u32(range: std::ops::Range<u32>) -> u32 {
        let span = range.end - range.start;
        range.start + (next() as u32 % span)
    }

    pub fn i64(range: std::ops::Range<i64>) -> i64 {
        let span = (range.end - range.start) as u64;
        range.start + (next() % span) as i64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_names_match_in_any_spelling() {
        assert_eq!(normalized_provider("comfy_ui"), "comfyui");
        assert_eq!(normalized_provider("ComfyUI"), "comfyui");
        assert_eq!(normalized_provider("DALL-E 3"), "dalle3");
        assert_eq!(normalized_provider("dall_e_3"), "dalle3");
        assert_eq!(normalized_provider("bonsai_image"), "bonsaiimage");
    }

    #[test]
    fn cleans_llm_prompts() {
        assert_eq!(
            clean_prompt("\n  Prompt: \"1girl, smile\"\nExplanation…"),
            "1girl, smile"
        );
        assert_eq!(
            clean_prompt("`a quiet library at dusk`"),
            "a quiet library at dusk"
        );
    }

    #[test]
    fn reads_png_size() {
        let mut png = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR".to_vec();
        png.extend_from_slice(&832u32.to_be_bytes());
        png.extend_from_slice(&1216u32.to_be_bytes());
        assert_eq!(png_size(&png), Some((832, 1216)));
        assert_eq!(png_size(b"GIF89a"), None);
    }
}
