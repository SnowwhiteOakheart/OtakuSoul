use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Emitter;
use ts_rs::TS;

use super::catalog::{TtsModel, catalog_model, models_dir};
use super::engine::engine;
use super::models::load_settings;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct TtsModelProgress {
    pub model_id: String,
    pub file_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f32,
    pub finished: bool,
}

static CANCEL_DOWNLOAD: AtomicBool = AtomicBool::new(false);

pub fn cancel_download() {
    CANCEL_DOWNLOAD.store(true, Ordering::SeqCst);
}

pub(super) fn ensure_allowed(model: &TtsModel) -> Result<(), String> {
    if model.noncommercial && !load_settings().allow_noncommercial {
        return Err(crate::err!(
            "backend.tts.noncommercialLocked",
            model = model.name
        ));
    }
    Ok(())
}

/// Downloads the missing files of `model_id`; progress goes to `tts-model-progress`.
pub async fn download_model<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    model_id: &str,
) -> Result<(), String> {
    download_model_with(model_id, &|p| {
        let _ = app.emit("tts-model-progress", p);
    })
    .await
}

/// [`download_model`] with a progress callback instead of the Tauri event (tests, tools).
pub async fn download_model_with(
    model_id: &str,
    emit: &(impl Fn(TtsModelProgress) + Sync),
) -> Result<(), String> {
    let model = catalog_model(model_id)?;
    ensure_allowed(model)?;
    CANCEL_DOWNLOAD.store(false, Ordering::SeqCst);
    let dir = models_dir();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let client = crate::modules::model_files::http_client()?;
    let total: u64 = model.files.iter().map(|f| f.file.size).sum();
    let mut done: u64 = model
        .files
        .iter()
        .filter(|f| f.file.is_complete(&dir))
        .map(|f| f.file.size)
        .sum();
    let emit_progress = |file_name: &str, bytes: u64, finished: bool| {
        emit(TtsModelProgress {
            model_id: model.id.to_string(),
            file_name: file_name.to_string(),
            downloaded_bytes: bytes,
            total_bytes: total,
            percent: (bytes as f32 / total.max(1) as f32 * 100.0).min(100.0),
            finished,
        });
    };
    for file in model.files.iter().filter(|f| !f.file.is_complete(&dir)) {
        crate::modules::model_files::download_file(
            &client,
            &file.file,
            &dir,
            &CANCEL_DOWNLOAD,
            &|bytes| emit_progress(file.file.file_name(), done + bytes, false),
        )
        .await?;
        done += file.file.size;
    }
    emit_progress("", total, true);
    tracing::info!("Sprachmodell {} heruntergeladen", model.id);
    Ok(())
}

/// Deletes the files of `model_id`.
pub async fn delete_model(model_id: &str) -> Result<(), String> {
    let model = catalog_model(model_id)?;
    let engine = engine();
    if engine.loaded_model().await.as_deref() == Some(model.id) {
        engine.stop().await;
    }
    let dir = models_dir();
    for file in model.files {
        let path = file.file.path_in(&dir);
        let _ = std::fs::remove_file(&path);
        crate::modules::model_files::remove_partial(&path);
    }
    Ok(())
}
