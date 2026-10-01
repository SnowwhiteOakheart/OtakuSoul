use crate::modules::companion::CompanionEngine;
use crate::modules::discord::{DiscordBotManager, DiscordRpcClient};
use crate::modules::inference::InferenceClient;
use crate::modules::llama_manager::LlamaServerManager;
use crate::modules::local_image::LocalImageEngine;
use crate::modules::memory::MemoryDb;
use crate::modules::stage::StageEngine;
use crate::modules::web_server::WebServerManager;
use std::sync::Arc;

pub struct AppState {
    pub llama_manager: Arc<LlamaServerManager>,
    pub local_image: Arc<LocalImageEngine>,
    pub inference_client: Arc<InferenceClient>,
    pub token_counter: Arc<crate::modules::context_window::TokenCounter>,
    pub memory_db: Arc<MemoryDb>,
    pub stage_engine: Arc<StageEngine>,
    pub companion_engine: Arc<CompanionEngine>,
    pub discord_rpc: Arc<DiscordRpcClient>,
    pub discord_bot: Arc<DiscordBotManager>,
    pub web_server: Arc<WebServerManager>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        let db_path = MemoryDb::default_path();
        MemoryDb::apply_pending_restore(&db_path);
        let memory_db = MemoryDb::new(&db_path).unwrap_or_else(|e| {
            tracing::warn!(
                "Could not open SQLite database at {:?}: {}. Falling back to in-memory DB.",
                db_path,
                e
            );
            MemoryDb::new_in_memory().expect("In-memory SQLite database failed to initialize")
        });

        let discord_rpc = Arc::new(DiscordRpcClient::new(None));
        discord_rpc.clone().start_background_worker();

        Self {
            llama_manager: Arc::new(LlamaServerManager::new()),
            local_image: Arc::new(LocalImageEngine::new()),
            inference_client: Arc::new(InferenceClient::new()),
            token_counter: Arc::default(),
            memory_db: Arc::new(memory_db),
            stage_engine: Arc::new(StageEngine::new()),
            companion_engine: Arc::new(CompanionEngine::new()),
            discord_rpc,
            discord_bot: Arc::new(DiscordBotManager::new()),
            web_server: Arc::new(WebServerManager::new()),
        }
    }
}
