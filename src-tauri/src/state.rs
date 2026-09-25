use std::sync::Arc;
use crate::modules::inference::InferenceClient;
use crate::modules::llama_manager::LlamaServerManager;
use crate::modules::memory::MemoryDb;

pub struct AppState {
    pub llama_manager: Arc<LlamaServerManager>,
    pub inference_client: Arc<InferenceClient>,
    pub memory_db: Arc<MemoryDb>,
}

impl AppState {
    pub fn new() -> Self {
        let db_path = MemoryDb::default_path();
        let memory_db = MemoryDb::new(&db_path).unwrap_or_else(|e| {
            tracing::warn!(
                "Could not open SQLite database at {:?}: {}. Falling back to in-memory DB.",
                db_path,
                e
            );
            MemoryDb::new_in_memory().expect("In-memory SQLite database failed to initialize")
        });

        Self {
            llama_manager: Arc::new(LlamaServerManager::new()),
            inference_client: Arc::new(InferenceClient::new()),
            memory_db: Arc::new(memory_db),
        }
    }
}
