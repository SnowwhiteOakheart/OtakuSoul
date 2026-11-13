mod cleanup;
mod json;
mod models;
mod prompts;
mod runner;
#[cfg(test)]
mod tests;

pub use cleanup::{MemoryCleanupRequest, propose_memory_cleanup};
pub use json::{extract_json_object, parse_router_json};
pub use models::{
    MemoryPipelineRequest, MemoryPipelineResult, RouterCharacterMemoryPatch,
    RouterCognitiveDrivePatch, RouterIntentionCreate, RouterIntentionResolve,
    RouterIntentionsPatch, RouterInternalStatePatch, RouterMemorySupersede,
    RouterRelationshipMetadataPatch, RouterResponse, RouterUserIdentityPatch,
    RouterUserMemoryPatch, SoulMemoryPipelineRequest, SoulMemoryPipelineResult, TopicAction,
    TopicPlan,
};
pub use prompts::{
    ARCHIVIST_SYSTEM_PROMPT, CLEANUP_SYSTEM_PROMPT, DIARY_SYSTEM_PROMPT, ROUTER_SYSTEM_PROMPT,
};
pub use runner::{execute_memory_pipeline, execute_soul_memory_pipeline};

#[cfg(test)]
use runner::{
    HABITS_SOFT_CAP, ROUTER_MEMORY_CHARS, accept_habits_replace, consolidation_task,
    router_memory_line, transcript_speaker,
};
