//! Voice activity detection with Silero VAD (ONNX, MIT): tells speech from typing, breathing,
//! noise and music, so the voice call and barge-in react to the user's voice only. The level
//! check in the frontend stays as a fallback while the model is missing.
//!
//! The model (2.3 MB) comes from its source on first use, checked by SHA-256. It reads 16 kHz
//! audio in blocks of 512 samples, each with the 64 samples before it as context, and carries
//! a state from block to block; every recording (`stream`) has its own detector.

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tracing::info;

use crate::modules::paths::resolve_app_paths;

const MODEL_FILE: &str = "silero_vad.onnx";
/// Silero VAD v6.2.3, pinned to its commit.
const MODEL_URL: &str = "https://raw.githubusercontent.com/snakers4/silero-vad/5cd7945676eb32225748052e2e6a0580e4686a08/src/silero_vad/data/silero_vad.onnx";
const MODEL_SHA256: &str = "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3";
const MODEL_SIZE: u64 = 2_327_524;
pub const SAMPLE_RATE: i64 = 16_000;
pub const FRAME: usize = 512;
const CONTEXT: usize = 64;
/// At most this many detectors at once (a forgotten `vad_close` must not pile them up).
const MAX_STREAMS: usize = 4;

fn model_path() -> PathBuf {
    PathBuf::from(resolve_app_paths().data_dir)
        .join("models")
        .join("vad")
        .join(MODEL_FILE)
}

pub fn model_ready() -> bool {
    fs::metadata(model_path()).is_ok_and(|m| m.len() == MODEL_SIZE)
}

/// Loads the model from its source unless it is there (small: read at once, then checked).
pub async fn ensure_model() -> Result<PathBuf, String> {
    let path = model_path();
    if model_ready() {
        return Ok(path);
    }
    let dir = path.parent().expect("model path has a folder");
    fs::create_dir_all(dir).map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    info!("Lade Silero-VAD von {MODEL_URL}");
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))?;
    let response = client
        .get(MODEL_URL)
        .send()
        .await
        .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;
    if !response.status().is_success() {
        return Err(crate::err!(
            "backend.common.downloadStatus",
            status = response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| crate::err!("backend.common.downloadRead", error = e))?;
    if hex(&Sha256::digest(&bytes)) != MODEL_SHA256 {
        return Err(crate::err!("backend.vad.checksum"));
    }
    let partial = path.with_extension("onnx.part");
    fs::write(&partial, &bytes).map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    fs::rename(&partial, &path).map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    Ok(path)
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Cuts a stream of samples into model blocks: 512 new samples after the 64 before them.
#[derive(Debug, Default)]
pub struct Framer {
    pending: Vec<f32>,
    context: Vec<f32>,
}

impl Framer {
    /// The blocks (576 samples each) that are complete after adding `samples`.
    pub fn push(&mut self, samples: &[f32]) -> Vec<Vec<f32>> {
        self.pending.extend_from_slice(samples);
        let mut blocks = Vec::new();
        while self.pending.len() >= FRAME {
            let frame: Vec<f32> = self.pending.drain(..FRAME).collect();
            let mut block = if self.context.is_empty() {
                vec![0.0; CONTEXT]
            } else {
                self.context.clone()
            };
            block.extend_from_slice(&frame);
            self.context = frame[FRAME - CONTEXT..].to_vec();
            blocks.push(block);
        }
        blocks
    }
}

/// Silero for one recording.
pub struct Detector {
    session: ort::session::Session,
    state: ndarray::Array3<f32>,
    framer: Framer,
}

impl Detector {
    pub fn open(path: &std::path::Path) -> Result<Self, String> {
        let session = ort::session::Session::builder()
            .map_err(|e| crate::err!("backend.vad.model", error = e))?
            .with_intra_threads(1)
            .map_err(|e| crate::err!("backend.vad.model", error = e))?
            .commit_from_file(path)
            .map_err(|e| crate::err!("backend.vad.model", error = e))?;
        Ok(Self {
            session,
            state: ndarray::Array3::zeros((2, 1, 128)),
            framer: Framer::default(),
        })
    }

    /// Speech probability (0–1) of every block completed by `samples` (16 kHz mono).
    pub fn push(&mut self, samples: &[f32]) -> Result<Vec<f32>, String> {
        let mut probabilities = Vec::new();
        for block in self.framer.push(samples) {
            let input = ndarray::Array2::from_shape_vec((1, block.len()), block)
                .map_err(|e| e.to_string())?;
            let rate = ndarray::arr0(SAMPLE_RATE);
            let outputs = self
                .session
                .run(ort::inputs![
                    "input" => ort::value::TensorRef::from_array_view(&input).map_err(|e| e.to_string())?,
                    "state" => ort::value::TensorRef::from_array_view(&self.state).map_err(|e| e.to_string())?,
                    "sr" => ort::value::TensorRef::from_array_view(&rate).map_err(|e| e.to_string())?,
                ])
                .map_err(|e| crate::err!("backend.vad.model", error = e))?;
            let (_, output) = outputs["output"]
                .try_extract_tensor::<f32>()
                .map_err(|e| e.to_string())?;
            probabilities.push(output.first().copied().unwrap_or(0.0));
            let (_, state) = outputs["stateN"]
                .try_extract_tensor::<f32>()
                .map_err(|e| e.to_string())?;
            self.state = ndarray::Array3::from_shape_vec((2, 1, 128), state.to_vec())
                .map_err(|e| e.to_string())?;
        }
        Ok(probabilities)
    }
}

fn streams() -> &'static Mutex<HashMap<String, Detector>> {
    static STREAMS: OnceLock<Mutex<HashMap<String, Detector>>> = OnceLock::new();
    STREAMS.get_or_init(Mutex::default)
}

/// Starts a detector for `stream` (loads the model first if needed).
pub async fn open(stream: &str) -> Result<(), String> {
    let path = ensure_model().await?;
    let detector = tokio::task::spawn_blocking(move || Detector::open(&path))
        .await
        .map_err(|e| crate::err!("backend.vad.model", error = e))??;
    let mut map = streams().lock().unwrap_or_else(|e| e.into_inner());
    if map.len() >= MAX_STREAMS && !map.contains_key(stream) {
        map.clear();
    }
    map.insert(stream.to_string(), detector);
    Ok(())
}

/// The highest speech probability of the blocks `samples` completes; `None` while too few.
pub fn process(stream: &str, samples: &[f32]) -> Result<Option<f32>, String> {
    let mut map = streams().lock().unwrap_or_else(|e| e.into_inner());
    let detector = map
        .get_mut(stream)
        .ok_or_else(|| crate::err!("backend.vad.notOpen"))?;
    let probabilities = detector.push(samples)?;
    Ok(probabilities.into_iter().reduce(f32::max))
}

pub fn close(stream: &str) {
    streams()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(stream);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_carry_the_samples_before_them() {
        let mut framer = Framer::default();
        assert!(framer.push(&[1.0; 300]).is_empty());
        let blocks = framer.push(&[2.0; 300]);
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].len(), CONTEXT + FRAME);
        assert!(
            blocks[0][..CONTEXT].iter().all(|&s| s == 0.0),
            "the first block starts with silence"
        );
        assert_eq!(blocks[0][CONTEXT], 1.0);
        let blocks = framer.push(&[3.0; 1000]);
        assert_eq!(blocks.len(), 2);
        // Context = the last 64 samples of the frame before: 2.0 (88 left over from 600 − 512 …).
        assert!(blocks[0][..CONTEXT].iter().all(|&s| s == 2.0));
        assert_eq!(framer.pending.len(), 88 + 1000 - 2 * FRAME);
    }

    /// 16 kHz mono from a 16-bit PCM WAV (the bundled Live2D voice clips: 44.1 kHz stereo).
    fn read_wav(path: &std::path::Path) -> Vec<f32> {
        let bytes = fs::read(path).unwrap();
        let channels = u16::from_le_bytes([bytes[22], bytes[23]]) as usize;
        let rate = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]) as f32;
        let start = bytes.windows(4).position(|w| w == b"data").unwrap() + 8;
        let mono: Vec<f32> = bytes[start..]
            .chunks_exact(2 * channels)
            .map(|frame| {
                frame
                    .chunks_exact(2)
                    .map(|s| i16::from_le_bytes([s[0], s[1]]) as f32 / 32768.0)
                    .sum::<f32>()
                    / channels as f32
            })
            .collect();
        let step = rate / SAMPLE_RATE as f32;
        (0..(mono.len() as f32 / step) as usize)
            .map(|i| mono[(i as f32 * step) as usize])
            .collect()
    }

    /// Needs the model (`OTAKUSOUL_TEST_SILERO=<path to silero_vad.onnx>`) and ONNX Runtime.
    #[test]
    #[ignore = "needs the Silero model file"]
    fn tells_speech_from_noise_and_clicks() {
        let path =
            PathBuf::from(std::env::var("OTAKUSOUL_TEST_SILERO").expect("OTAKUSOUL_TEST_SILERO"));
        assert_eq!(hex(&Sha256::digest(fs::read(&path).unwrap())), MODEL_SHA256);
        let max = |samples: &[f32]| {
            let mut detector = Detector::open(&path).unwrap();
            // Fed in pieces like the recording does.
            samples
                .chunks(1365)
                .flat_map(|chunk| detector.push(chunk).unwrap())
                .fold(0.0f32, f32::max)
        };
        let voice = read_wav(
            &PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../assets/live2d/haru/sounds/haru_normal_01.wav"),
        );
        assert!(max(&voice) > 0.9, "speech");
        let mut seed = 7u32;
        let mut random = || {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (seed >> 8) as f32 / (1u32 << 24) as f32 - 0.5
        };
        let noise: Vec<f32> = (0..32_000).map(|_| random() * 0.15).collect();
        assert!(max(&noise) < 0.3, "noise");
        let clicks: Vec<f32> = (0..32_000)
            .map(|i| if i % 2400 < 80 { random() } else { 0.0 })
            .collect();
        assert!(max(&clicks) < 0.3, "typing");
    }
}
