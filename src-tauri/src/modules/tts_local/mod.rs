//! Local, multilingual speech synthesis with CrispASR (`crispasr --server`).
//!
//! The app downloads the models of a small catalog, starts one `crispasr` server for the model
//! a character uses and asks it for speech through the OpenAI-compatible
//! `POST /v1/audio/speech`. Voices are either presets shipped with a model or voices the user
//! cloned from their own recording.
//!
//! The repository is public, so licensing is explicit: models with a non-commercial licence
//! (F5-TTS) stay locked until the user allows them, and cloned voices always carry the consent
//! statement the user confirmed. CrispASR watermarks the audio itself (EU AI Act, Art. 50).

mod catalog;
mod cloning;
mod downloads;
mod engine;
mod models;
#[cfg(test)]
mod tests;

pub use catalog::speaks_sound_tags;
pub use cloning::{
    ClonedVoice, REFERENCE_RATE, create_cloned_voice, delete_cloned_voice, list_cloned_voices,
};
pub use downloads::{
    TtsModelProgress, cancel_download, delete_model, download_model, download_model_with,
};
pub use engine::{LocalTtsEngine, engine, synthesize_data_url};
pub use models::{
    DesignedVoice, TtsLocalSettings, TtsModelInfo, TtsVoiceInfo, VoicePrompt, list_models,
    load_settings, save_settings,
};

#[cfg(test)]
use catalog::{CATALOG, Role, catalog_model};
#[cfg(test)]
use cloning::{clone_voice_name, resample_linear, slug};
#[cfg(test)]
use engine::{VoiceChoice, resolve_voice};
#[cfg(test)]
use models::design_description;
