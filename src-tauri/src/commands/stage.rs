//! Soul Stage: scenes, folders, turns, dice, world state, clocks and encounters.

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn roll_stage_dice(
    formula: String,
    target_dc: Option<i32>,
) -> Result<crate::modules::stage::DiceRollResult, String> {
    crate::modules::stage::roll_dice(&formula, target_dc)
}

#[tauri::command]
pub fn get_stage_state(state: State<'_, AppState>) -> crate::modules::stage::SceneState {
    state.stage_engine.get_state()
}

#[tauri::command]
pub fn stage_upsert_npc(
    state: State<'_, AppState>,
    scene_id: String,
    draft: crate::modules::stage::StageNpcDraft,
) -> Result<crate::modules::stage::SceneState, String> {
    let mut scene = state.stage_engine.get_state();
    if scene.definition.id != scene_id {
        scene = crate::modules::stage::load_scene_by_id(&scene_id)?;
    }
    crate::modules::stage::upsert_npc(&mut scene, draft)?;
    crate::modules::stage::save_scene_state(&scene)?;
    state.stage_engine.set_state(scene.clone());
    Ok(scene)
}

#[tauri::command]
pub fn stage_set_npc_active(
    state: State<'_, AppState>,
    scene_id: String,
    npc_id: String,
    active: bool,
) -> Result<crate::modules::stage::SceneState, String> {
    let mut scene = state.stage_engine.get_state();
    if scene.definition.id != scene_id {
        scene = crate::modules::stage::load_scene_by_id(&scene_id)?;
    }
    crate::modules::stage::set_npc_active(&mut scene, &npc_id, active)?;
    crate::modules::stage::save_scene_state(&scene)?;
    state.stage_engine.set_state(scene.clone());
    Ok(scene)
}

#[tauri::command]
pub fn stage_promote_npc(
    state: State<'_, AppState>,
    scene_id: String,
    npc_id: String,
) -> Result<crate::modules::stage::StageNpcPromotion, String> {
    let mut scene = state.stage_engine.get_state();
    if scene.definition.id != scene_id {
        scene = crate::modules::stage::load_scene_by_id(&scene_id)?;
    }
    let character = crate::modules::stage::promote_npc(&mut scene, &npc_id, &state.memory_db)?;
    crate::modules::stage::save_scene_state(&scene)?;
    state.stage_engine.set_state(scene.clone());
    Ok(crate::modules::stage::StageNpcPromotion { scene, character })
}

#[tauri::command]
pub fn list_stage_scenes() -> Result<Vec<crate::modules::stage::ScenePreview>, String> {
    Ok(crate::modules::stage::scan_available_scenes())
}

#[tauri::command]
pub fn load_stage_scene(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    let scene_st = crate::modules::stage::load_scene_by_id(&scene_id)?;
    state.stage_engine.set_state(scene_st.clone());
    Ok(scene_st)
}

#[tauri::command]
pub fn save_stage_scene(
    state: State<'_, AppState>,
    scene_state: crate::modules::stage::SceneState,
) -> Result<(), String> {
    crate::modules::stage::save_scene_state(&scene_state)?;
    state.stage_engine.set_state(scene_state);
    Ok(())
}

#[tauri::command]
pub fn update_stage_scene_definition(
    state: State<'_, AppState>,
    definition: crate::modules::stage::SceneDefinition,
) -> Result<crate::modules::stage::SceneState, String> {
    let active = state.stage_engine.get_state();
    let is_active = active.definition.id == definition.id;
    let mut scene = if is_active {
        active
    } else {
        crate::modules::stage::load_scene_by_id(&definition.id)?
    };
    crate::modules::stage::update_scene_definition(&mut scene, definition);
    crate::modules::stage::save_scene_state(&scene)?;
    if is_active {
        state.stage_engine.set_state(scene.clone());
    }
    Ok(scene)
}

#[tauri::command]
pub fn list_stage_assets() -> std::collections::HashMap<String, Vec<String>> {
    crate::modules::stage::list_stage_assets()
}

/// The scene's ambient sound as `data:` URL.
#[tauri::command]
pub fn get_stage_ambient_audio(name: String) -> Result<String, String> {
    crate::modules::stage::stage_ambient_data_url(&name)
}

#[tauri::command]
pub fn import_stage_asset(file_path: String, kind: String) -> Result<String, String> {
    crate::modules::stage::import_stage_asset(&file_path, &kind)
}

#[tauri::command]
pub fn create_stage_scene(
    state: State<'_, AppState>,
    definition: crate::modules::stage::SceneDefinition,
) -> Result<crate::modules::stage::SceneState, String> {
    let scene_st = crate::modules::stage::create_custom_scene(definition)?;
    state.stage_engine.set_state(scene_st.clone());
    Ok(scene_st)
}

#[tauri::command]
pub fn delete_stage_scene(scene_id: String) -> Result<(), String> {
    crate::modules::stage::delete_scene(&scene_id)
}

#[tauri::command]
pub fn export_stage_markdown(scene_id: String) -> Result<String, String> {
    crate::modules::stage::export_scene_to_markdown(&scene_id)
}

#[tauri::command]
pub fn stage_list_folders() -> Result<Vec<String>, String> {
    crate::modules::stage::list_stage_folders()
}

#[tauri::command]
pub fn stage_create_folder(folder_name: String) -> Result<(), String> {
    crate::modules::stage::create_stage_folder(&folder_name)
}

#[tauri::command]
pub fn stage_move_scene_to_folder(
    state: State<'_, AppState>,
    scene_id: String,
    target_folder: String,
) -> Result<crate::modules::stage::SceneState, String> {
    let res = crate::modules::stage::move_stage_scene_to_folder(&scene_id, &target_folder)?;
    state.stage_engine.set_state(res.clone());
    Ok(res)
}

#[tauri::command]
pub fn stage_delete_folder(folder_name: String) -> Result<(), String> {
    crate::modules::stage::delete_stage_folder(&folder_name)
}

#[tauri::command]
pub fn stage_import_scene_json(
    state: State<'_, AppState>,
    json_content: String,
    target_folder: Option<String>,
) -> Result<crate::modules::stage::SceneState, String> {
    let res =
        crate::modules::stage::import_stage_scene_json(&json_content, target_folder.as_deref())?;
    state.stage_engine.set_state(res.clone());
    Ok(res)
}

#[tauri::command]
pub fn stage_export_scene_json(scene_id: String) -> Result<String, String> {
    crate::modules::stage::export_stage_scene_json(&scene_id)
}

#[tauri::command]
pub fn stage_reset_scene(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    let res = crate::modules::stage::reset_stage_scene(&scene_id)?;
    state.stage_engine.set_state(res.clone());
    Ok(res)
}

#[tauri::command]
pub fn stage_edit_message(
    state: State<'_, AppState>,
    scene_id: String,
    message_id: String,
    new_content: String,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::stage::edit_stage_turn_message(
        &state.stage_engine,
        &scene_id,
        &message_id,
        &new_content,
    )
}

#[tauri::command]
pub fn stage_delete_message(
    state: State<'_, AppState>,
    scene_id: String,
    message_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::stage::delete_stage_turn_message(&state.stage_engine, &scene_id, &message_id)
}

#[tauri::command]
pub async fn stage_regenerate_turn(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    let emit = stream_emitter(&app);
    crate::modules::stage::regenerate_stage_turn(
        &state.stage_engine,
        &state.inference_client,
        &scene_id,
        &emit,
    )
    .await
}

/// Forwards live turn text to the UI as `stage-stream` events.
fn stream_emitter(
    app: &tauri::AppHandle,
) -> impl Fn(crate::modules::stage::StageStreamEvent) + Send + Sync + use<> {
    let app = app.clone();
    move |event| {
        let _ = tauri::Emitter::emit(&app, "stage-stream", event);
    }
}

#[tauri::command]
pub fn stage_get_background_image(name: String) -> Result<String, String> {
    crate::modules::stage::get_stage_background_image(&name)
}

#[tauri::command]
pub async fn run_stage_turn(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    request: crate::modules::stage::StageTurnRequest,
) -> Result<crate::modules::stage::SceneState, String> {
    let emit = stream_emitter(&app);
    let mut scene = crate::modules::stage::execute_stage_turn(
        &state.stage_engine,
        &state.inference_client,
        request,
        &emit,
    )
    .await?;
    sync_party_memory(&app, &state, &mut scene)?;
    Ok(scene)
}

/// Lets party members remember what they lived through in the scene: once enough new lines
/// came together, their filtered view runs through the Soul Memory pipeline in the background.
fn sync_party_memory(
    app: &tauri::AppHandle,
    state: &State<'_, AppState>,
    scene: &mut crate::modules::stage::SceneState,
) -> Result<(), String> {
    use tauri::Manager;
    let batches = crate::modules::stage::take_memory_sync_batches(scene);
    if batches.is_empty() {
        return Ok(());
    }
    crate::modules::stage::save_scene_state(scene)?;
    state.stage_engine.set_state(scene.clone());
    let user_name = if scene.definition.persona.trim().is_empty() {
        "Player".to_string()
    } else {
        scene.definition.persona.clone()
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let llm = crate::modules::stage::StageLlm::from_settings();
        let characters = crate::modules::paths::scan_available_characters();
        let app_state = app.state::<AppState>();
        // One after another: a local model handles a single request at a time anyway.
        for (name, transcript) in batches {
            let Some(character) = characters
                .iter()
                .find(|c| c.card.data.name.eq_ignore_ascii_case(&name))
            else {
                continue;
            };
            let request = crate::modules::soul_memory_pipeline::SoulMemoryPipelineRequest {
                character_id: character.id.clone(),
                user_name: user_name.clone(),
                chat_id: None,
                endpoint_url: llm.endpoint_url.clone(),
                api_key: llm.api_key.clone(),
                model: llm.model.clone(),
                provider: llm.provider.clone(),
                recent_turn_count: None,
                include_diary: Some(false),
                transcript: Some(transcript),
            };
            if let Err(error) = crate::modules::soul_memory_pipeline::execute_soul_memory_pipeline(
                &app_state, request,
            )
            .await
            {
                tracing::warn!("Stage memory sync for {name} failed: {error}");
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub fn undo_stage_turn(
    state: State<'_, AppState>,
    scene_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    state.stage_engine.undo_turn(&scene_id)
}

#[tauri::command]
pub async fn rest_stage_party(
    state: State<'_, AppState>,
    scene_id: String,
    rest_type: String,
) -> Result<crate::modules::stage::SceneState, String> {
    crate::modules::stage::execute_stage_rest(
        &state.stage_engine,
        &state.inference_client,
        &scene_id,
        &rest_type,
    )
    .await
}

#[tauri::command]
pub fn use_stage_inventory_item(
    state: State<'_, AppState>,
    scene_id: String,
    item_id: String,
) -> Result<crate::modules::stage::SceneState, String> {
    state.stage_engine.use_inventory_item(&scene_id, &item_id)
}

#[tauri::command]
pub fn delay_encounter_turn(
    state: State<'_, AppState>,
) -> Result<crate::modules::stage::SceneState, String> {
    let scene = state.stage_engine.delay_turn()?;
    crate::modules::stage::save_scene_state(&scene)?;
    Ok(scene)
}

#[tauri::command]
pub fn update_world_state(
    state: State<'_, AppState>,
    world: crate::modules::stage::WorldState,
) -> Result<(), String> {
    state.stage_engine.update_world(world);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn set_clock_progress(
    state: State<'_, AppState>,
    clock_id: String,
    progress: u32,
) -> Result<(), String> {
    state.stage_engine.set_clock_progress(&clock_id, progress);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn add_clock(
    state: State<'_, AppState>,
    clock: crate::modules::stage::CampaignClock,
) -> Result<(), String> {
    state.stage_engine.add_clock(clock);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn delete_clock(state: State<'_, AppState>, clock_id: String) -> Result<(), String> {
    state.stage_engine.delete_clock(&clock_id);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn start_encounter(state: State<'_, AppState>) -> Result<(), String> {
    state.stage_engine.start_encounter();
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn end_encounter(state: State<'_, AppState>) -> Result<(), String> {
    state.stage_engine.end_encounter();
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn next_encounter_turn(state: State<'_, AppState>) -> Result<(), String> {
    state.stage_engine.next_turn();
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn apply_combatant_delta(
    state: State<'_, AppState>,
    combatant_id: String,
    hp_delta: i32,
    stress_delta: i32,
) -> Result<(), String> {
    state
        .stage_engine
        .apply_combatant_delta(&combatant_id, hp_delta, stress_delta);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}

#[tauri::command]
pub fn add_combatant_condition(
    state: State<'_, AppState>,
    combatant_id: String,
    condition: crate::modules::stage::CombatCondition,
) -> Result<(), String> {
    state.stage_engine.add_condition(&combatant_id, condition);
    crate::modules::stage::save_scene_state(&state.stage_engine.get_state())?;
    Ok(())
}
