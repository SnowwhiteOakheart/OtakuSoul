//! Live2D models and emotion classification.

#[tauri::command]
pub fn scan_live2d_models() -> Vec<crate::modules::live2d::ScannedLive2d> {
    crate::modules::live2d::scan_available_live2d_models()
}

#[tauri::command]
pub fn get_live2d_catalog() -> Vec<crate::modules::live2d::Live2dCatalogItem> {
    crate::modules::live2d::get_live2d_catalog()
}

#[tauri::command]
pub async fn download_live2d_model(model_id: String) -> Result<String, String> {
    crate::modules::live2d::download_live2d_model(&model_id).await
}

#[tauri::command]
pub fn classify_text_emotion(text: String) -> crate::modules::emotions::EmotionResult {
    crate::modules::emotions::classify_emotion(&text)
}

#[tauri::command]
pub fn import_live2d_model(
    source_path: String,
) -> Result<crate::modules::live2d::ScannedLive2d, String> {
    crate::modules::live2d::import_live2d_model(&source_path)
}
