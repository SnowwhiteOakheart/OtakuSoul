use std::sync::Arc;
use crate::modules::inference::InferenceClient;
use crate::modules::llama_manager::LlamaServerManager;
use crate::modules::memory::MemoryDb;
use crate::modules::stage::StageEngine;
use crate::modules::companion::CompanionEngine;
use crate::modules::discord::{DiscordRpcClient, DiscordBotManager};
use crate::modules::web_server::WebServerManager;

pub struct AppState {
    pub llama_manager: Arc<LlamaServerManager>,
    pub inference_client: Arc<InferenceClient>,
    pub memory_db: Arc<MemoryDb>,
    pub stage_engine: Arc<StageEngine>,
    pub companion_engine: Arc<CompanionEngine>,
    pub discord_rpc: Arc<DiscordRpcClient>,
    pub discord_bot: Arc<DiscordBotManager>,
    pub web_server: Arc<WebServerManager>,
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

        let discord_rpc = Arc::new(DiscordRpcClient::new(None));
        discord_rpc.clone().start_background_worker();

        Self {
            llama_manager: Arc::new(LlamaServerManager::new()),
            inference_client: Arc::new(InferenceClient::new()),
            memory_db: Arc::new(memory_db),
            stage_engine: Arc::new(StageEngine::new()),
            companion_engine: Arc::new(CompanionEngine::new()),
            discord_rpc,
            discord_bot: Arc::new(DiscordBotManager::new()),
            web_server: Arc::new(WebServerManager::new()),
        }
    }
}
