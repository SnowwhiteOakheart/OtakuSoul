use super::super::*;
use super::mechanics::MechanicsOutcome;
use super::{TurnContext, stream_message};

pub(super) async fn narrate_turn(
    ctx: &TurnContext<'_>,
    state: &mut SceneState,
    gm_plan: &GmPlan,
    outcome: MechanicsOutcome,
    continues: bool,
) -> bool {
    let TurnContext {
        req,
        inference,
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
        ..
    } = ctx;
    let observation_start = *observation_start;
    let endpoint_url = &llm.endpoint_url;
    let api_key = &llm.api_key;
    let model_name = &llm.model;
    let provider = &llm.provider;
    let localized_def = state.definition.localized(lang_code);
    let MechanicsOutcome {
        dice_outcome_text,
        dice_event_card,
        secondary_event_cards,
    } = outcome;

    let executor_system_prompt = format!(
        r#"[STAGE — GAME MASTER NARRATOR]
You are the game master in the genre "{tone}".
Narrate what happens in this style:
{narrator_style}

Location: {location} ({time_of_day}, {weather})
Party: {party}
Player: {user_name}

Plan to follow:
{narration_plan}
{dice_outcome}

RULES:
- Write gripping, atmospheric narration in {reply_language}, in the present tense.
- If there was a dice check, weave its outcome in logically and dramatically.
- Never speak, think or act for the party members ({party}) or for {user_name}: no dialogue, decisions or feelings of theirs. They react themselves right after you; end on a moment they can respond to.
- Reply ONLY with the narration, without meta comments or addressing the reader."#,
        reply_language = reply_language,
        tone = localized_def.gm_tone,
        narrator_style = localized_def.narrator_style,
        location = state.world.location,
        time_of_day = state.world.time_of_day,
        weather = state.world.weather,
        party = party_list,
        user_name = user_name,
        narration_plan = gm_plan.narration_plan,
        dice_outcome = dice_outcome_text
    );

    let executor_messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: executor_system_prompt,
            attachments: Vec::new(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: if continues {
                "Continue the scene with the next beat; the player is waiting to see what happens."
                    .to_string()
            } else {
                format!(
                    "Narrate what happens after this action: '{}'",
                    match (&whisper_to, req.turn_mode.as_str()) {
                        // The narrator describes only what everyone can perceive.
                        (Some(to), _) => format!(
                            "{user_name} leans close to {to} and whispers something nobody else can hear"
                        ),
                        (None, "think") => format!("{user_name} is silently lost in thought"),
                        _ => clean_input.to_string(),
                    }
                )
            },
            attachments: Vec::new(),
        },
    ];

    let exec_req = ChatRequest {
        endpoint_url: endpoint_url.clone(),
        api_key: api_key.clone(),
        model: model_name.clone(),
        messages: executor_messages,
        sampling: Some(SamplingParams {
            temperature: Some(0.7),
            top_p: Some(0.9),
            max_tokens: Some(1500),
            ..Default::default()
        }),
        reasoning_mode: Some(false),
        provider: provider.clone(),
    };

    let Some(exec_req) =
        super::history::prepare(state, inference, counter, Audience::Narrator, exec_req).await
    else {
        return false;
    };
    let gm_msg_id = format!("msg_{}", Utc::now().timestamp_millis());
    let narration_content = stream_message(
        inference,
        exec_req,
        on_stream,
        &gm_msg_id,
        "Game Master",
        "gm",
        None,
    )
    .await
    .ok()
    // Failed, or stopped before the first word: the planner's outline stands in.
    .filter(|text| !text.trim().is_empty())
    .unwrap_or_else(|| gm_plan.narration_plan.clone());

    let gm_turn_msg = SceneTurnMessage {
        id: gm_msg_id,
        sender_id: "gm".to_string(),
        sender_name: "Game Master".to_string(),
        sender_role: "gm".to_string(),
        avatar_url: None,
        content: narration_content.clone(),
        turn_mode: "do".to_string(),
        whisper_target: None,
        event_card: dice_event_card,
        timestamp: Utc::now().timestamp() as u64,
        bg: None,
        images: Vec::new(),
    };
    state.push_message(gm_turn_msg);

    for (index, (content, card)) in secondary_event_cards.into_iter().enumerate() {
        state.push_message(SceneTurnMessage {
            id: format!("msg_{}_{}", Utc::now().timestamp_millis(), index),
            sender_id: "system".to_string(),
            sender_name: lang.t("Campaign chronicle").to_string(),
            sender_role: "gm".to_string(),
            avatar_url: None,
            content,
            turn_mode: "direct".to_string(),
            whisper_target: None,
            event_card: Some(card),
            timestamp: Utc::now().timestamp() as u64,
            bg: None,
            images: Vec::new(),
        });
    }

    observe_npcs(state, observation_start);

    true
}
