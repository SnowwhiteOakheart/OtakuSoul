//! Turn orchestration: prompts the language model, applies its plan and handles rests.

mod actors;
mod mechanics;
mod narrator;
mod planner;
mod rest;

use super::*;
use ts_rs::TS;

pub use rest::execute_stage_rest;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageTurnRequest {
    pub scene_id: String,
    #[serde(alias = "player_input")]
    pub user_input: String,
    #[serde(default = "default_turn_mode")]
    pub turn_mode: String, // "say" | "do" | "think" | "direct" | "whisper"
    #[serde(default, alias = "target_actor")]
    pub whisper_target: Option<String>,
    #[serde(default)]
    pub force_next_actor: Option<String>,
}

pub(super) struct TurnContext<'a> {
    pub(super) req: &'a StageTurnRequest,
    pub(super) inference: &'a InferenceClient,
    pub(super) memory_db: &'a crate::modules::memory::MemoryDb,
    pub(super) counter: crate::modules::context_window::TokenCounter,
    pub(super) llm: StageLlm,
    pub(super) lang: crate::modules::content_lang::ContentLang,
    pub(super) reply_language: String,
    pub(super) lang_code: String,
    pub(super) user_name: String,
    pub(super) party_list: String,
    pub(super) clean_input: &'a str,
    pub(super) whisper_to: Option<String>,
    pub(super) observation_start: usize,
    pub(super) on_stream: StageStream<'a>,
}

pub async fn execute_stage_turn(
    engine: &StageEngine,
    inference: &InferenceClient,
    memory_db: &crate::modules::memory::MemoryDb,
    req: StageTurnRequest,
    on_stream: StageStream<'_>,
) -> Result<SceneState, String> {
    // A Stage stop request ends the whole turn, not just one call.
    inference.reset_abort();
    let mut state = engine.get_state();
    if state.definition.id != req.scene_id {
        state = load_scene_by_id(&req.scene_id)?;
    }

    // 0. Snapshot for Undo
    engine.push_snapshot(&state.definition.id, state.clone());
    ensure_party_vitals(&mut state);
    // A turn passes: conditions outside combat wear off (in combat they count rounds).
    tick_conditions_outside_combat(&mut state);

    let counter = crate::modules::context_window::TokenCounter::default();

    let user_name = if !state.definition.persona.is_empty() {
        state.definition.persona.clone()
    } else {
        crate::modules::content_lang::ContentLang::current()
            .t("Player")
            .to_string()
    };

    // 1. Append Player Turn Message if non-empty
    let clean_input = req.user_input.trim();
    // A whisper is known only to its recipient, who answers it.
    let whisper_to = whisper_recipient(&req.turn_mode, req.whisper_target.as_deref())
        .filter(|_| !clean_input.is_empty());
    if let Some(to) = &whisper_to {
        add_private_knowledge(
            &mut state,
            to,
            format!("{user_name} whispered to you: {clean_input}"),
        );
    }
    if !clean_input.is_empty() {
        let player_msg = SceneTurnMessage {
            id: format!("msg_{}", Utc::now().timestamp_millis()),
            sender_id: "player".to_string(),
            sender_name: user_name.clone(),
            sender_role: "player".to_string(),
            avatar_url: None,
            content: clean_input.to_string(),
            turn_mode: req.turn_mode.clone(),
            whisper_target: req.whisper_target.clone(),
            event_card: None,
            timestamp: Utc::now().timestamp() as u64,
            bg: None,
            images: Vec::new(),
        };
        state.push_message(player_msg);
    }

    let observation_start = state
        .chat_log
        .len()
        .saturating_sub(usize::from(!clean_input.is_empty()));

    // 2. Build Planner Context & Call LLM for GmPlan
    let lang = crate::modules::content_lang::ContentLang::current();
    let reply_language = crate::modules::content_lang::ContentLang::reply_language_name();
    let lang_code = crate::modules::content_lang::language_code(&reply_language);
    let llm = StageLlm::from_settings();
    let party_list = if state.definition.party.is_empty() {
        "none".to_string()
    } else {
        state.definition.party.join(", ")
    };
    let continues = req.turn_mode == "continue" || clean_input.is_empty();

    let ctx = TurnContext {
        req: &req,
        inference,
        memory_db,
        counter,
        llm,
        lang,
        reply_language,
        lang_code,
        user_name,
        party_list,
        clean_input,
        whisper_to,
        observation_start,
        on_stream,
    };

    let Some(plan) = planner::plan_turn(&ctx, &mut state).await else {
        return finish_turn(engine, state);
    };
    let outcome = mechanics::apply_mechanics(&ctx, &mut state, &plan.gm_plan, &plan.ambient_files);
    if !narrator::narrate_turn(&ctx, &mut state, &plan.gm_plan, outcome, continues).await {
        return finish_turn(engine, state);
    }
    if !actors::run_actor_reactions(
        &ctx,
        &mut state,
        &plan.gm_plan,
        &plan.active_lore_snippets,
        continues,
    )
    .await
    {
        return finish_turn(engine, state);
    }
    let gm_plan = plan.gm_plan;

    let endpoint_url = &ctx.llm.endpoint_url;
    let api_key = &ctx.llm.api_key;
    let model_name = &ctx.llm.model;
    let provider = &ctx.llm.provider;
    let lang = ctx.lang;
    // 6. Update pending choices and save
    if !gm_plan.player_choices.is_empty() {
        state.pending_choices = gm_plan.player_choices;
    } else {
        state.pending_choices = vec![
            TaggedChoice {
                text: lang.t("Advance carefully").to_string(),
                badge: None,
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: lang.t("Secure and search the surroundings").to_string(),
                badge: Some(lang.t("Perception").to_string()),
                action_type: "do".to_string(),
            },
            TaggedChoice {
                text: lang
                    .t("Agree on the next move with the companions")
                    .to_string(),
                badge: None,
                action_type: "say".to_string(),
            },
        ];
    }

    // Long-term upkeep (skipped after "Stop"): archive resolved arcs, check facts now and then.
    if !inference.is_aborted() {
        let llm = StageLlm {
            endpoint_url: endpoint_url.clone(),
            api_key: api_key.clone(),
            model: model_name.clone(),
            provider: provider.clone(),
        };
        archive_resolved_arcs(&mut state, inference, &llm).await;
        audit_facts(&mut state, inference, &llm).await;
    }

    finish_turn(engine, state)
}

/// Persists completed work, including the player line when planning was stopped.
fn finish_turn(engine: &StageEngine, mut state: SceneState) -> Result<SceneState, String> {
    state.current_turn_actor = "PLAYER".to_string();
    state.definition.last_played = Some(Utc::now().to_rfc3339());
    engine.set_state(state.clone());
    save_scene_state(&state)?;
    Ok(state)
}

/// Streams one turn message to the UI (`on_stream`) and returns its full text.
pub(super) async fn stream_message(
    inference: &InferenceClient,
    request: ChatRequest,
    on_stream: StageStream<'_>,
    message_id: &str,
    sender_name: &str,
    sender_role: &str,
    avatar_url: Option<String>,
) -> Result<String, String> {
    let event = |text: String, done: bool| StageStreamEvent {
        message_id: message_id.to_string(),
        sender_name: sender_name.to_string(),
        sender_role: sender_role.to_string(),
        avatar_url: avatar_url.clone(),
        text,
        done,
    };
    let result = inference
        .stream_text(request, |text| on_stream(event(text.to_string(), false)))
        .await;
    on_stream(event(String::new(), true));
    result
}
