use std::sync::Arc;
use crate::modules::inference::InferenceClient;
use crate::modules::llama_manager::LlamaServerManager;

pub struct AppState {
    pub llama_manager: Arc<LlamaServerManager>,
    pub inference_client: Arc<InferenceClient>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            llama_manager: Arc::new(LlamaServerManager::new()),
            inference_client: Arc::new(InferenceClient::new()),
        }
    }
}
