//! The app owns one lazy ONNX environment. Sessions receive explicit handles; the registry
//! holds only a weak reference so it does not keep the runtime alive after the app closes.

use ort::environment::Environment;
use parking_lot::Mutex;
use std::sync::{Arc, OnceLock, Weak};

#[derive(Default)]
pub struct OnnxRuntime {
    environment: Mutex<Option<Environment>>,
}

fn registry() -> &'static Mutex<Weak<OnnxRuntime>> {
    static RUNTIME: OnceLock<Mutex<Weak<OnnxRuntime>>> = OnceLock::new();
    RUNTIME.get_or_init(Mutex::default)
}

impl OnnxRuntime {
    /// AppState keeps this owner for the entire app lifetime. Extra states share it.
    pub fn shared() -> Arc<Self> {
        let mut registered = registry().lock();
        if let Some(runtime) = registered.upgrade() {
            return runtime;
        }
        let runtime = Arc::new(Self::default());
        *registered = Arc::downgrade(&runtime);
        runtime
    }

    fn environment(&self) -> ort::Result<Environment> {
        let mut environment = self.environment.lock();
        if let Some(environment) = environment.as_ref() {
            return Ok(environment.clone());
        }
        let initialized = ort::init().with_name("otakusoul").build()?;
        *environment = Some(initialized.clone());
        Ok(initialized)
    }
}

pub(crate) fn environment() -> ort::Result<Environment> {
    let runtime = registry()
        .lock()
        .upgrade()
        .ok_or_else(|| ort::Error::new("ONNX runtime owner is not initialized"))?;
    runtime.environment()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Actual sessions from different modules must coexist and survive detector re-opening.
    #[tokio::test]
    #[ignore = "requires local Kokoro, Silero and portrait models"]
    async fn live_onnx_modules_share_environment() {
        let owner = OnnxRuntime::shared();
        let other = OnnxRuntime::shared();
        assert!(Arc::ptr_eq(&owner, &other));
        let config = crate::modules::kokoro::KokoroConfig {
            model_path: std::env::var("OTAKUSOUL_KOKORO_TEST_MODEL").unwrap(),
            voices_path: std::env::var("OTAKUSOUL_KOKORO_TEST_VOICES").unwrap(),
        };
        let audio = crate::modules::kokoro::synthesize("Hello again.", "af_heart", "+0%", &config)
            .await
            .unwrap();
        assert!(audio.len() > 10_000);
        let model = std::path::PathBuf::from(std::env::var("OTAKUSOUL_TEST_SILERO").unwrap());
        let mut first = crate::modules::vad::Detector::open(&model).unwrap();
        let mut second = crate::modules::vad::Detector::open(&model).unwrap();
        for detector in [&mut first, &mut second] {
            let probabilities = detector.push(&[0.0; 1024]).unwrap();
            assert_eq!(probabilities.len(), 2);
            assert!(probabilities.iter().all(|&p| p.is_finite() && p < 0.3));
        }
        let picture = std::fs::read(std::env::var("TALKING_PORTRAIT_IMAGE").unwrap()).unwrap();
        crate::modules::talking_portrait::guess_placement(&picture).unwrap();
        drop(first);
        drop(second);
        let mut reopened = crate::modules::vad::Detector::open(&model).unwrap();
        assert_eq!(reopened.push(&[0.0; 512]).unwrap().len(), 1);
    }
}
