//! Speaking portraits: a still character picture gets mouth shapes and blinking from
//! Talking Head Anime 3 (Pramook Khungurn, CC BY 4.0), run as ONNX on the CPU. The character
//! is cut out (anime-seg ISNet, Apache-2.0), placed as THA3 wants it (512x512, head in the
//! 128 px box of the top half), posed once per mouth shape, and only the pixels a pose changes
//! go back into the full-size original as small patches. The frontend swaps patches with the
//! voice's mouth shapes; nothing runs while it speaks.

use crate::modules::paths::resolve_app_paths;
use base64::Engine;
use image::imageops::FilterType;
use image::{GrayImage, ImageBuffer, Luma, Rgba, RgbaImage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use tauri::Emitter;
use tracing::info;
use ts_rs::TS;

/// Bumped when the frames change, so older cached sets are made again.
const SET_VERSION: u32 = 1;
const THA_SIZE: u32 = 512;
/// THA3 expects the head (hair top to chin) in about this many pixels …
const HEAD_PX: f32 = 150.0;
/// … centred here (the 128 px box in the middle of the top half).
const HEAD_CENTRE: (f32, f32) = (256.0, 128.0);
const SEG_SIZE: u32 = 1024;
const POSE_COUNT: usize = 45;

/// A model file loaded from its source and checked by SHA-256.
struct ModelFile {
    file: &'static str,
    url: &'static str,
    sha256: &'static str,
    size_bytes: u64,
    license: &'static str,
}

const MODELS: [ModelFile; 2] = [
    ModelFile {
        file: "isnetis.onnx",
        url: "https://huggingface.co/skytnt/anime-seg/resolve/main/isnetis.onnx",
        sha256: "f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99",
        size_bytes: 176_069_933,
        license: "Apache-2.0 (skytnt/anime-seg)",
    },
    ModelFile {
        file: "tha3_standard_float.onnx",
        url: "https://github.com/SnowwhiteOakheart/otakusoul-data/releases/download/talking-head-anime-3/tha3_standard_float.onnx",
        sha256: "faa9a4c4dfcc7cb23e30902f085c7ed73ae1e9f8006ac0651fc1992bb124f93e",
        size_bytes: 542_711_914,
        license: "CC BY 4.0 (Pramook Khungurn, Talking Head Anime 3)",
    },
];

/// Where the head lies in the picture, as shares of its width and height, so pictures of one
/// character in other sizes (emotion pictures) use the same framing.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct HeadPlacement {
    /// Top of the hair (share of the height).
    pub top: f32,
    /// Chin (share of the height).
    pub chin: f32,
    /// Middle of the face (share of the width).
    pub center_x: f32,
}

/// The models and whether they are there.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct TalkingPortraitStatus {
    pub ready: bool,
    /// Bytes still to download.
    #[ts(type = "number")]
    pub missing_bytes: u64,
    pub licenses: Vec<String>,
}

/// One frame: a patch over the original at (x, y).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TalkingFrame {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    /// PNG with alpha as data URL (only the changed pixels are opaque).
    pub image: String,
}

/// The frames of one picture: mouth shapes (`aa`, `ih`, `ou`, `ee`, `oh`, each also `_half`)
/// and `blink`, over the picture as it is (neutral).
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TalkingSet {
    pub version: u32,
    pub width: u32,
    pub height: u32,
    pub frames: BTreeMap<String, TalkingFrame>,
}

fn models_dir() -> PathBuf {
    PathBuf::from(resolve_app_paths().data_dir)
        .join("models")
        .join("talking_portrait")
}

fn sets_dir() -> PathBuf {
    PathBuf::from(resolve_app_paths().data_dir).join("talking_portraits")
}

pub fn status() -> TalkingPortraitStatus {
    let dir = models_dir();
    let missing: u64 = MODELS
        .iter()
        .filter(|m| {
            fs::metadata(dir.join(m.file))
                .map(|meta| meta.len() != m.size_bytes)
                .unwrap_or(true)
        })
        .map(|m| m.size_bytes)
        .sum();
    TalkingPortraitStatus {
        ready: missing == 0,
        missing_bytes: missing,
        licenses: MODELS.iter().map(|m| m.license.to_string()).collect(),
    }
}

/// Download progress for the settings (`talking-portrait-download`).
#[derive(Debug, Clone, Serialize)]
struct DownloadProgress {
    done: u64,
    total: u64,
}

/// Loads the missing models from their sources (each checked by SHA-256).
pub async fn download_models(app: tauri::AppHandle) -> Result<TalkingPortraitStatus, String> {
    use futures_util::StreamExt;
    use std::io::Write;
    let dir = models_dir();
    fs::create_dir_all(&dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let total = status().missing_bytes;
    let mut done = 0u64;
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(3600))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
    for model in &MODELS {
        let target = dir.join(model.file);
        if fs::metadata(&target)
            .map(|m| m.len() == model.size_bytes)
            .unwrap_or(false)
        {
            continue;
        }
        info!(
            "Lade Modell für sprechende Porträts: {} von {}",
            model.file, model.url
        );
        let resp = client
            .get(model.url)
            .send()
            .await
            .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;
        if !resp.status().is_success() {
            return Err(crate::err!(
                "backend.common.downloadStatus",
                status = resp.status()
            ));
        }
        let partial = dir.join(format!("{}.part", model.file));
        let mut out = fs::File::create(&partial)
            .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;
        let mut hasher = Sha256::new();
        let mut stream = resp.bytes_stream();
        let mut last_emit = std::time::Instant::now();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| crate::err!("backend.common.downloadRead", error = e))?;
            hasher.update(&chunk);
            out.write_all(&chunk)
                .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
            done += chunk.len() as u64;
            if last_emit.elapsed().as_millis() > 200 {
                last_emit = std::time::Instant::now();
                let _ = app.emit(
                    "talking-portrait-download",
                    DownloadProgress { done, total },
                );
            }
        }
        drop(out);
        let digest: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if digest != model.sha256 {
            let _ = fs::remove_file(&partial);
            return Err(crate::err!(
                "backend.talkingPortrait.checksum",
                name = model.file
            ));
        }
        fs::rename(&partial, &target)
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    }
    let _ = app.emit(
        "talking-portrait-download",
        DownloadProgress { done: total, total },
    );
    Ok(status())
}

// ---------------------------------------------------------------------------------------------
// Placements per character

fn placements_file() -> PathBuf {
    sets_dir().join("placements.json")
}

fn read_placements() -> BTreeMap<String, HeadPlacement> {
    fs::read_to_string(placements_file())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn placement(character_id: &str) -> Option<HeadPlacement> {
    read_placements().remove(character_id)
}

/// Saves (or with `None` removes) a character's head placement.
pub fn set_placement(character_id: &str, placement: Option<HeadPlacement>) -> Result<(), String> {
    let mut all = read_placements();
    match placement {
        Some(p) => {
            if !(0.0..1.0).contains(&p.top)
                || !(p.top..=1.0).contains(&p.chin)
                || !(0.0..=1.0).contains(&p.center_x)
            {
                return Err(crate::err!("backend.talkingPortrait.placement"));
            }
            all.insert(character_id.to_string(), p);
        }
        None => {
            all.remove(character_id);
        }
    }
    fs::create_dir_all(sets_dir())
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    fs::write(
        placements_file(),
        serde_json::to_string_pretty(&all).unwrap_or_default(),
    )
    .map_err(|e| crate::err!("backend.common.fileWrite", error = e))
}

// ---------------------------------------------------------------------------------------------
// Pictures

fn srgb_to_linear(v: f32) -> f32 {
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

fn linear_to_srgb(v: f32) -> f32 {
    let v = v.clamp(0.0, 1.0);
    if v <= 0.003_130_805 {
        v * 12.92
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    }
}

/// Alpha mask of the character (ISNet at 1024 px, letterboxed like skytnt/anime-seg).
fn cut_out(session: &mut ort::session::Session, image: &RgbaImage) -> Result<GrayImage, String> {
    let (w, h) = image.dimensions();
    let scale = SEG_SIZE as f32 / w.max(h) as f32;
    let (nw, nh) = (
        ((w as f32 * scale) as u32).max(1),
        ((h as f32 * scale) as u32).max(1),
    );
    let resized = image::imageops::resize(image, nw, nh, FilterType::Triangle);
    let (top, left) = ((SEG_SIZE - nh) / 2, (SEG_SIZE - nw) / 2);
    let size = SEG_SIZE as usize;
    let mut input = ndarray::Array4::<f32>::zeros((1, 3, size, size));
    for (x, y, p) in resized.enumerate_pixels() {
        for c in 0..3 {
            input[[0, c, (y + top) as usize, (x + left) as usize]] = p[c] as f32 / 255.0;
        }
    }
    let name = session.inputs()[0].name().to_string();
    let outputs = session
        .run(ort::inputs![name.as_str() => ort::value::TensorRef::from_array_view(&input).map_err(|e| e.to_string())?])
        .map_err(|e| e.to_string())?;
    let (_, data) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| e.to_string())?;
    let mask = GrayImage::from_fn(nw, nh, |x, y| {
        let v = data[((y + top) * SEG_SIZE + x + left) as usize];
        Luma([(v.clamp(0.0, 1.0) * 255.0).round() as u8])
    });
    Ok(image::imageops::resize(&mask, w, h, FilterType::Triangle))
}

/// Scale and offset from the original's pixels into THA3's 512 px frame.
fn frame_transform(placement: &HeadPlacement, w: u32, h: u32) -> (f32, f32, f32) {
    let (top, chin, cx) = (
        placement.top * h as f32,
        placement.chin * h as f32,
        placement.center_x * w as f32,
    );
    let scale = HEAD_PX / (chin - top).max(1.0);
    (
        scale,
        HEAD_CENTRE.0 - cx * scale,
        HEAD_CENTRE.1 - (top + chin) / 2.0 * scale,
    )
}

/// The cut-out character placed in THA3's frame, as its input tensor (linear colours, -1..1).
fn tha_input(
    image: &RgbaImage,
    mask: &GrayImage,
    placement: &HeadPlacement,
) -> ndarray::Array4<f32> {
    let (w, h) = image.dimensions();
    let (scale, off_x, off_y) = frame_transform(placement, w, h);
    let mut cut = image.clone();
    for (x, y, p) in cut.enumerate_pixels_mut() {
        p[3] = ((p[3] as u16 * mask.get_pixel(x, y)[0] as u16) / 255) as u8;
    }
    let small = image::imageops::resize(
        &cut,
        ((w as f32 * scale).round() as u32).max(1),
        ((h as f32 * scale).round() as u32).max(1),
        FilterType::Lanczos3,
    );
    let mut frame = RgbaImage::new(THA_SIZE, THA_SIZE);
    image::imageops::overlay(
        &mut frame,
        &small,
        off_x.round() as i64,
        off_y.round() as i64,
    );
    let s = THA_SIZE as usize;
    let mut input = ndarray::Array4::<f32>::zeros((1, 4, s, s));
    for (x, y, p) in frame.enumerate_pixels() {
        if p[3] < 8 {
            for c in 0..4 {
                input[[0, c, y as usize, x as usize]] = -1.0;
            }
            continue;
        }
        for c in 0..3 {
            input[[0, c, y as usize, x as usize]] = srgb_to_linear(p[c] as f32 / 255.0) * 2.0 - 1.0;
        }
        input[[0, 3, y as usize, x as usize]] = p[3] as f32 / 255.0 * 2.0 - 1.0;
    }
    input
}

/// THA3's output as an sRGB picture.
fn tha_output(data: &[f32]) -> RgbaImage {
    let plane = (THA_SIZE * THA_SIZE) as usize;
    RgbaImage::from_fn(THA_SIZE, THA_SIZE, |x, y| {
        let i = (y * THA_SIZE + x) as usize;
        let channel = |c: usize| (data[c * plane + i] + 1.0) / 2.0;
        Rgba([
            (linear_to_srgb(channel(0)) * 255.0).round() as u8,
            (linear_to_srgb(channel(1)) * 255.0).round() as u8,
            (linear_to_srgb(channel(2)) * 255.0).round() as u8,
            (channel(3).clamp(0.0, 1.0) * 255.0).round() as u8,
        ])
    })
}

/// Pose values by name (THA3 order: eyebrows 12, face 27, rotation 6).
fn pose(values: &[(usize, f32)]) -> [f32; POSE_COUNT] {
    let mut p = [0.0; POSE_COUNT];
    for &(i, v) in values {
        p[i] = v;
    }
    p
}

// Indices in THA3's pose vector.
const EYEBROW_TROUBLED: [usize; 2] = [0, 1];
const EYEBROW_ANGRY: [usize; 2] = [2, 3];
const EYEBROW_RAISED: [usize; 2] = [6, 7];
const EYEBROW_HAPPY: [usize; 2] = [8, 9];
const EYE_SURPRISED: [usize; 2] = [16, 17];
const EYE_RELAXED: [usize; 2] = [18, 19];
const EYE_UNIMPRESSED: [usize; 2] = [20, 21];
const MOUTH_LOWERED_CORNER: [usize; 2] = [32, 33];
const MOUTH_RAISED_CORNER: [usize; 2] = [34, 35];

/// The face of an emotion (VRM expression names) for pictures without their own emotion
/// picture: eyebrows, eyes and mouth corners, on which mouth shapes and blinking are laid.
fn emotion_pose(emotion: &str) -> Option<Vec<(usize, f32)>> {
    let both = |[l, r]: [usize; 2], v: f32| [(l, v), (r, v)];
    let parts: Vec<[(usize, f32); 2]> = match emotion {
        "happy" => vec![
            both(EYEBROW_HAPPY, 1.0),
            both(MOUTH_RAISED_CORNER, 0.8),
            both(EYE_RELAXED, 0.25),
        ],
        "sad" => vec![
            both(EYEBROW_TROUBLED, 1.0),
            both(MOUTH_LOWERED_CORNER, 0.7),
            both(EYE_RELAXED, 0.2),
        ],
        "angry" => vec![
            both(EYEBROW_ANGRY, 1.0),
            both(EYE_UNIMPRESSED, 0.4),
            both(MOUTH_LOWERED_CORNER, 0.5),
        ],
        "surprised" => vec![both(EYEBROW_RAISED, 1.0), both(EYE_SURPRISED, 0.8)],
        "relaxed" => vec![
            both(EYE_RELAXED, 0.5),
            both(EYEBROW_HAPPY, 0.3),
            both(MOUTH_RAISED_CORNER, 0.35),
        ],
        _ => return None,
    };
    Some(parts.into_iter().flatten().collect())
}
const MOUTH_AAA: usize = 26;
const MOUTH_III: usize = 27;
const MOUTH_UUU: usize = 28;
const MOUTH_EEE: usize = 29;
const MOUTH_OOO: usize = 30;

/// The frames a set holds: name and pose. With an emotion, every frame carries its face, and
/// `rest` shows it with the mouth closed.
fn frame_poses(emotion: Option<&str>) -> Vec<(&'static str, [f32; POSE_COUNT])> {
    let base = emotion.and_then(emotion_pose).unwrap_or_default();
    let with = |extra: &[(usize, f32)]| {
        let mut values: Vec<(usize, f32)> = base.clone();
        values.extend_from_slice(extra);
        pose(&values)
    };
    let mut frames = Vec::new();
    if !base.is_empty() {
        frames.push(("rest", with(&[])));
    }
    for (name, half, index) in [
        ("aa", "aa_half", MOUTH_AAA),
        ("ih", "ih_half", MOUTH_III),
        ("ou", "ou_half", MOUTH_UUU),
        ("ee", "ee_half", MOUTH_EEE),
        ("oh", "oh_half", MOUTH_OOO),
    ] {
        frames.push((name, with(&[(index, 1.0)])));
        frames.push((half, with(&[(index, 0.5)])));
    }
    // Blinking overrides the emotion's eyes (a later value for the same index wins).
    frames.push((
        "blink",
        with(&[(EYE_RELAXED[0], 1.0), (EYE_RELAXED[1], 1.0)]),
    ));
    frames
}

/// THA3's face box: mouth, eyes and eyebrows change only inside it. The networks for turning
/// the body pass the whole picture and change it slightly everywhere; that is left out.
const FACE_BOX: (u32, u32, u32, u32) = (160, 32, 352, 224);

/// Pixels of the face box where a posed frame visibly differs from the neutral one, grown a
/// little and softened. Compared on THA3's raw output (linear colour, -1..1): in sRGB, tiny
/// differences in dark areas would count as changes.
fn change_mask(frame: &[f32], neutral: &[f32]) -> GrayImage {
    let plane = (THA_SIZE * THA_SIZE) as usize;
    let raw = GrayImage::from_fn(THA_SIZE, THA_SIZE, |x, y| {
        if !in_face(x, y) {
            return Luma([0]);
        }
        let i = (y * THA_SIZE + x) as usize;
        let alpha = |d: &[f32]| ((d[3 * plane + i] + 1.0) / 2.0).clamp(0.0, 1.0);
        // Visible colour only: transparent pixels carry arbitrary colours that differ per pose.
        let colour = |d: &[f32], c: usize| (d[c * plane + i] + 1.0) / 2.0 * alpha(d);
        let diff = (0..3)
            .map(|c| (colour(frame, c) - colour(neutral, c)).abs())
            .fold((alpha(frame) - alpha(neutral)).abs(), f32::max);
        Luma([if diff > CHANGE_THRESHOLD { 255 } else { 0 }])
    });
    // Opening: thin lines along hair and face outlines (the networks shift edges by a pixel)
    // go away, the areas of mouth and eyes stay; then grown a little and softened.
    let opened = dilate(&erode(&raw, 2), 2);
    image::imageops::blur(&dilate(&opened, 4), 2.0)
}

/// Inside the face: an ellipse around eyes and mouth within THA3's face box (hair at its
/// edges flickers between poses).
fn in_face(x: u32, y: u32) -> bool {
    if x < FACE_BOX.0 || x >= FACE_BOX.2 || y < FACE_BOX.1 || y >= FACE_BOX.3 {
        return false;
    }
    let (dx, dy) = ((x as f32 - 256.0) / 64.0, (y as f32 - 144.0) / 80.0);
    dx * dx + dy * dy <= 1.0
}

/// Shrinks white areas by `radius` pixels (square min filter): the inverse of `dilate`.
fn erode(mask: &GrayImage, radius: i64) -> GrayImage {
    let inverted = GrayImage::from_fn(mask.width(), mask.height(), |x, y| {
        Luma([255 - mask.get_pixel(x, y)[0]])
    });
    let grown = dilate(&inverted, radius);
    GrayImage::from_fn(mask.width(), mask.height(), |x, y| {
        Luma([255 - grown.get_pixel(x, y)[0]])
    })
}

/// A change below this (0..1, linear) is the networks' noise, not a pose.
const CHANGE_THRESHOLD: f32 = 0.02;

/// Grows white areas by `radius` pixels (square max filter, separable).
fn dilate(mask: &GrayImage, radius: i64) -> GrayImage {
    let (w, h) = mask.dimensions();
    let pass = |src: &GrayImage, horizontal: bool| {
        GrayImage::from_fn(w, h, |x, y| {
            let mut best = 0;
            for d in -radius..=radius {
                let (sx, sy) = if horizontal {
                    (x as i64 + d, y as i64)
                } else {
                    (x as i64, y as i64 + d)
                };
                if sx >= 0 && sy >= 0 && (sx as u32) < w && (sy as u32) < h {
                    best = best.max(src.get_pixel(sx as u32, sy as u32)[0]);
                }
            }
            Luma([best])
        })
    };
    pass(&pass(mask, true), false)
}

/// The changed part of a posed frame, scaled back to the original's pixels: a patch at (x, y).
fn patch(
    frame: &RgbaImage,
    mask: &GrayImage,
    transform: (f32, f32, f32),
    w: u32,
    h: u32,
) -> Option<(u32, u32, RgbaImage)> {
    let (scale, off_x, off_y) = transform;
    let (mut x0, mut y0, mut x1, mut y1) = (THA_SIZE, THA_SIZE, 0, 0);
    for (x, y, p) in mask.enumerate_pixels() {
        if p[0] > 0 {
            x0 = x0.min(x);
            y0 = y0.min(y);
            x1 = x1.max(x + 1);
            y1 = y1.max(y + 1);
        }
    }
    if x1 <= x0 || y1 <= y0 {
        return None;
    }
    // In the original's pixels (clipped to the picture).
    let to_orig = |v: u32, off: f32| ((v as f32 - off) / scale).round();
    let (ox0, oy0) = (
        to_orig(x0, off_x).max(0.0) as u32,
        to_orig(y0, off_y).max(0.0) as u32,
    );
    let (ox1, oy1) = (
        (to_orig(x1, off_x) as u32).min(w),
        (to_orig(y1, off_y) as u32).min(h),
    );
    if ox1 <= ox0 || oy1 <= oy0 {
        return None;
    }
    let (pw, ph) = (ox1 - ox0, oy1 - oy0);
    // Sample the 512 frame for each patch pixel (bilinear through a resize of the cropped area).
    let fx0 = ox0 as f32 * scale + off_x;
    let fy0 = oy0 as f32 * scale + off_y;
    let fw = (pw as f32 * scale).ceil().max(1.0) as u32;
    let fh = (ph as f32 * scale).ceil().max(1.0) as u32;
    let crop_x = fx0.floor().max(0.0) as u32;
    let crop_y = fy0.floor().max(0.0) as u32;
    let crop_w = fw.min(THA_SIZE - crop_x);
    let crop_h = fh.min(THA_SIZE - crop_y);
    let colour = image::imageops::crop_imm(frame, crop_x, crop_y, crop_w, crop_h).to_image();
    let alpha = image::imageops::crop_imm(mask, crop_x, crop_y, crop_w, crop_h).to_image();
    let colour = image::imageops::resize(&colour, pw, ph, FilterType::Lanczos3);
    let alpha = image::imageops::resize(&alpha, pw, ph, FilterType::Triangle);
    let soft = image::imageops::blur(&alpha, (1.0 / scale).max(1.0));
    let out = ImageBuffer::from_fn(pw, ph, |x, y| {
        let c = colour.get_pixel(x, y);
        let a = (c[3] as u16 * soft.get_pixel(x, y)[0] as u16 / 255) as u8;
        Rgba([c[0], c[1], c[2], a])
    });
    Some((ox0, oy0, out))
}

fn png_data_url(image: &RgbaImage) -> Result<String, String> {
    let mut bytes = Vec::new();
    image
        .write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn session(file: &str) -> Result<ort::session::Session, String> {
    let path = models_dir().join(file);
    if !path.is_file() {
        return Err(crate::err!("backend.talkingPortrait.noModels"));
    }
    let threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    ort::session::Session::builder()
        .map_err(|e| crate::err!("backend.talkingPortrait.model", error = e))?
        .with_intra_threads(threads)
        .map_err(|e| crate::err!("backend.talkingPortrait.model", error = e))?
        .commit_from_file(&path)
        .map_err(|e| crate::err!("backend.talkingPortrait.model", error = e))
}

/// THA3's raw output (linear colour, -1..1) for one pose of a prepared input.
fn pose_frame(
    tha: &mut ort::session::Session,
    input: &ndarray::Array4<f32>,
    values: &[f32; POSE_COUNT],
) -> Result<Vec<f32>, String> {
    let pose = ndarray::Array2::from_shape_vec((1, POSE_COUNT), values.to_vec())
        .map_err(|e| e.to_string())?;
    let outputs = tha
        .run(ort::inputs![
            "image" => ort::value::TensorRef::from_array_view(input).map_err(|e| e.to_string())?,
            "pose" => ort::value::TensorRef::from_array_view(&pose).map_err(|e| e.to_string())?,
        ])
        .map_err(|e| crate::err!("backend.talkingPortrait.model", error = e))?;
    let (_, data) = outputs["output"]
        .try_extract_tensor::<f32>()
        .map_err(|e| e.to_string())?;
    Ok(data.to_vec())
}

/// Cache key of a set: picture, placement, emotion and set version.
fn set_key(bytes: &[u8], placement: &HeadPlacement, emotion: Option<&str>) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    if let Some(emotion) = emotion {
        hasher.update(emotion.as_bytes());
    }
    hasher.update(format!(
        "{:.4}:{:.4}:{:.4}:{SET_VERSION}",
        placement.top, placement.chin, placement.center_x
    ));
    hasher
        .finalize()
        .iter()
        .take(16)
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// The frames for a picture (made once, then read from the cache); with an emotion (VRM
/// expression) the face shows it.
pub fn prepare(
    bytes: &[u8],
    placement: &HeadPlacement,
    emotion: Option<&str>,
) -> Result<TalkingSet, String> {
    let emotion = emotion.filter(|e| emotion_pose(e).is_some());
    let dir = sets_dir();
    let cache = dir.join(format!("{}.json", set_key(bytes, placement, emotion)));
    if let Some(set) = fs::read_to_string(&cache)
        .ok()
        .and_then(|t| serde_json::from_str::<TalkingSet>(&t).ok())
        .filter(|set| set.version == SET_VERSION)
    {
        return Ok(set);
    }
    let image = image::load_from_memory(bytes)
        .map_err(|e| crate::err!("backend.talkingPortrait.image", error = e))?
        .to_rgba8();
    let (w, h) = image.dimensions();
    let started = std::time::Instant::now();
    let mask = cut_out(&mut session(MODELS[0].file)?, &image)?;
    let input = tha_input(&image, &mask, placement);
    let mut tha = session(MODELS[1].file)?;
    let mut run = |values: &[f32; POSE_COUNT]| pose_frame(&mut tha, &input, values);
    let neutral = run(&[0.0; POSE_COUNT])?;
    let transform = frame_transform(placement, w, h);
    let mut frames = BTreeMap::new();
    for (name, values) in frame_poses(emotion) {
        let posed = run(&values)?;
        let mask = change_mask(&posed, &neutral);
        if let Some((x, y, patch)) = patch(&tha_output(&posed), &mask, transform, w, h) {
            frames.insert(
                name.to_string(),
                TalkingFrame {
                    x,
                    y,
                    width: patch.width(),
                    height: patch.height(),
                    image: png_data_url(&patch)?,
                },
            );
        }
    }
    info!(
        "Sprechendes Porträt erzeugt: {} Bilder in {:.1} s",
        frames.len(),
        started.elapsed().as_secs_f32()
    );
    let set = TalkingSet {
        version: SET_VERSION,
        width: w,
        height: h,
        frames,
    };
    fs::create_dir_all(&dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let _ = fs::write(&cache, serde_json::to_string(&set).unwrap_or_default());
    Ok(set)
}

/// Head sizes tried when detecting (chin below the top, in shares of the picture's width): from
/// a whole figure (small head) to a close-up.
const GUESS_SIZES: [f32; 7] = [0.2, 0.28, 0.36, 0.44, 0.52, 0.6, 0.7];

/// Where the head of a picture is: the top of the cut-out figure, and of several head sizes the
/// one at which THA3 visibly opens the mouth (it only does when the head fits its frame).
pub fn guess_placement(bytes: &[u8]) -> Result<HeadPlacement, String> {
    let image = image::load_from_memory(bytes)
        .map_err(|e| crate::err!("backend.talkingPortrait.image", error = e))?
        .to_rgba8();
    let (w, h) = image.dimensions();
    let mask = cut_out(&mut session(MODELS[0].file)?, &image)?;
    let top = (0..h)
        .find(|&y| (0..w).filter(|&x| mask.get_pixel(x, y)[0] > 128).count() as u32 > w / 50)
        .unwrap_or(0);
    // The middle of the figure in a band below the top (the head).
    let centre = |rows: std::ops::Range<u32>| {
        let (mut sum, mut count) = (0u64, 0u64);
        for y in rows {
            for x in 0..w {
                if mask.get_pixel(x, y)[0] > 128 {
                    sum += x as u64;
                    count += 1;
                }
            }
        }
        if count > 0 {
            sum as f32 / count as f32
        } else {
            w as f32 / 2.0
        }
    };
    let candidates: Vec<HeadPlacement> = GUESS_SIZES
        .iter()
        .map(|&size| {
            let chin = (top as f32 + w as f32 * size).min(h as f32);
            let cx = centre(top..(top + ((chin - top as f32) * 0.8) as u32).clamp(top + 1, h));
            HeadPlacement {
                top: top as f32 / h as f32,
                chin: chin / h as f32,
                center_x: cx / w as f32,
            }
        })
        .filter(|p| p.chin > p.top + 0.02)
        .collect();
    let mut tha = session(MODELS[1].file)?;
    let mut best: Option<(u32, HeadPlacement)> = None;
    for placement in candidates {
        let input = tha_input(&image, &mask, &placement);
        let neutral = pose_frame(&mut tha, &input, &[0.0; POSE_COUNT])?;
        let open = pose_frame(&mut tha, &input, &pose(&[(MOUTH_AAA, 1.0)]))?;
        let score = change_mask(&open, &neutral)
            .pixels()
            .filter(|p| p[0] > 128)
            .count() as u32;
        if best.is_none_or(|(s, _)| score > s) {
            best = Some((score, placement));
        }
    }
    best.map(|(_, p)| p)
        .ok_or_else(|| crate::err!("backend.talkingPortrait.placement"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colour_conversions_round_trip() {
        for v in [0.0, 0.02, 0.2, 0.5, 0.9, 1.0] {
            assert!((linear_to_srgb(srgb_to_linear(v)) - v).abs() < 1e-4);
        }
    }

    #[test]
    fn the_head_lands_in_tha3s_box() {
        let placement = HeadPlacement {
            top: 0.0,
            chin: 0.43,
            center_x: 0.5,
        };
        let (scale, off_x, off_y) = frame_transform(&placement, 640, 800);
        let chin_px = 0.43 * 800.0;
        assert!((scale * chin_px - HEAD_PX).abs() < 0.01);
        assert!((320.0 * scale + off_x - 256.0).abs() < 0.01);
        assert!(((0.0 + chin_px) / 2.0 * scale + off_y - 128.0).abs() < 0.01);
    }

    #[test]
    fn a_patch_covers_only_what_changed() {
        let plane = (THA_SIZE * THA_SIZE) as usize;
        // Grey, opaque; a little noise everywhere (as THA3's other networks leave it).
        let neutral: Vec<f32> = (0..4 * plane)
            .map(|i| if i >= 3 * plane { 1.0 } else { -0.2 })
            .collect();
        let mut posed: Vec<f32> = neutral
            .iter()
            .enumerate()
            .map(|(i, v)| v + if i % 7 == 0 { 0.01 } else { 0.0 })
            .collect();
        for y in 180..190 {
            for x in 250..262 {
                posed[(y * THA_SIZE + x) as usize] = 0.6;
            }
        }
        // A one-pixel line along an outline: flicker, not a change.
        for y in 60..200 {
            posed[(y * THA_SIZE + 220) as usize] = 0.6;
        }
        let mask = change_mask(&posed, &neutral);
        assert_eq!(mask.get_pixel(10, 10)[0], 0);
        assert_eq!(mask.get_pixel(200, 60)[0], 0, "noise is no change");
        assert_eq!(mask.get_pixel(220, 120)[0], 0, "a thin line is no change");
        assert!(mask.get_pixel(255, 185)[0] > 200);
        let transform = frame_transform(
            &HeadPlacement {
                top: 0.0,
                chin: 0.43,
                center_x: 0.5,
            },
            640,
            800,
        );
        let (x, y, patch) = patch(&tha_output(&posed), &mask, transform, 640, 800).unwrap();
        // About 25x20 THA pixels → about 2.3x as large in the original, around the mouth.
        assert!(
            patch.width() > 30 && patch.width() < 120,
            "{}",
            patch.width()
        );
        assert!(x > 250 && x < 400 && y > 250 && y < 450, "{x},{y}");
    }

    #[test]
    fn placements_are_checked() {
        assert!(
            set_placement(
                "x",
                Some(HeadPlacement {
                    top: 0.5,
                    chin: 0.2,
                    center_x: 0.5
                })
            )
            .is_err()
        );
    }

    /// With the real models in the data folder: makes a set for a picture and writes the
    /// composited frames next to it. `TALKING_PORTRAIT_IMAGE=<png> cargo test real_models -- --ignored`
    #[test]
    #[ignore]
    fn real_models_make_a_set() {
        let path = std::env::var("TALKING_PORTRAIT_IMAGE").expect("TALKING_PORTRAIT_IMAGE");
        let bytes = fs::read(&path).unwrap();
        let guess = guess_placement(&bytes).unwrap();
        println!("guessed placement {guess:?}");
        let placement = std::env::var("TALKING_PORTRAIT_PLACEMENT")
            .ok()
            .map(|v| {
                let n: Vec<f32> = v.split(',').map(|x| x.parse().unwrap()).collect();
                HeadPlacement {
                    top: n[0],
                    chin: n[1],
                    center_x: n[2],
                }
            })
            .unwrap_or(guess);
        let started = std::time::Instant::now();
        let set = prepare(
            &bytes,
            &placement,
            std::env::var("TALKING_PORTRAIT_EMOTION").ok().as_deref(),
        )
        .unwrap();
        println!(
            "{} frames in {:.1} s",
            set.frames.len(),
            started.elapsed().as_secs_f32()
        );
        let base = image::load_from_memory(&bytes).unwrap().to_rgba8();
        let out = std::env::temp_dir().join("talking-portrait-check");
        fs::create_dir_all(&out).unwrap();
        for (name, frame) in &set.frames {
            let data = frame.image.split_once(",").unwrap().1;
            let png = base64::engine::general_purpose::STANDARD
                .decode(data)
                .unwrap();
            let patch = image::load_from_memory(&png).unwrap().to_rgba8();
            let mut composed = base.clone();
            image::imageops::overlay(&mut composed, &patch, frame.x as i64, frame.y as i64);
            composed.save(out.join(format!("{name}.png"))).unwrap();
            println!(
                "{name}: {}x{} at {},{}",
                frame.width, frame.height, frame.x, frame.y
            );
        }
        assert!(set.frames.contains_key("aa") && set.frames.contains_key("blink"));
    }

    #[test]
    fn every_mouth_shape_has_a_full_and_a_half_frame() {
        let names: Vec<_> = frame_poses(None).into_iter().map(|(n, _)| n).collect();
        for v in ["aa", "ih", "ou", "ee", "oh"] {
            assert!(names.contains(&v) && names.contains(&format!("{v}_half").as_str()));
        }
        assert!(names.contains(&"blink"));
        assert!(!names.contains(&"rest"));
    }

    #[test]
    fn an_emotion_is_laid_under_every_frame() {
        let frames = frame_poses(Some("happy"));
        let rest = frames.iter().find(|(n, _)| *n == "rest").unwrap().1;
        assert!(rest[EYEBROW_HAPPY[0]] > 0.0 && rest[MOUTH_RAISED_CORNER[1]] > 0.0);
        let aa = frames.iter().find(|(n, _)| *n == "aa").unwrap().1;
        assert_eq!(aa[MOUTH_AAA], 1.0);
        assert_eq!(aa[EYEBROW_HAPPY[0]], rest[EYEBROW_HAPPY[0]]);
        // Blinking closes the eyes fully, whatever the emotion set.
        let blink = frames.iter().find(|(n, _)| *n == "blink").unwrap().1;
        assert_eq!(blink[EYE_RELAXED[0]], 1.0);
        assert!(
            frame_poses(Some("neutral"))
                .iter()
                .all(|(n, _)| *n != "rest")
        );
    }
}
