pub mod commands;
pub mod modules;
pub mod state;

use state::AppState;

/// The asset protocol scope is empty in `tauri.conf.json`; only the app's own data and
/// bundled asset directories are opened here. Files picked through the dialog plugin are
/// added to the scope by the plugin itself.
fn allow_app_asset_dirs(app: &tauri::App) {
    use std::path::PathBuf;
    use tauri::Manager;

    let paths = modules::paths::resolve_app_paths();
    let mut dirs: Vec<PathBuf> = vec![
        PathBuf::from(&paths.data_dir),
        PathBuf::from(&paths.config_dir),
        PathBuf::from(&paths.bundled_presets_dir),
    ];
    if let Some(assets_root) = PathBuf::from(&paths.bundled_vrm_dir).parent() {
        dirs.push(assets_root.to_path_buf());
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        dirs.push(resource_dir);
    }
    if let Some(exe_dir) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(PathBuf::from))
    {
        dirs.push(exe_dir.join("assets"));
        dirs.push(exe_dir.join("..").join("assets"));
    }

    let scope = app.asset_protocol_scope();
    for dir in dirs.into_iter().filter(|d| d.is_dir()) {
        if let Err(e) = scope.allow_directory(&dir, true) {
            tracing::warn!(
                "Asset-Verzeichnis {:?} konnte nicht freigegeben werden: {}",
                dir,
                e
            );
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing subscriber for clean logs
    let _ = tracing_subscriber::fmt().try_init();

    let builder = tauri::Builder::default();

    // Must be registered first: a second launch hands over to the running instance instead
    // of starting another llama-server that would compete for VRAM.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["companion_overlay"])
                .build(),
        );

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            allow_app_asset_dirs(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_hardware_info,
            commands::get_layer_recommendation,
            commands::start_llama_server,
            commands::stop_llama_server,
            commands::get_llama_server_status,
            commands::send_chat_message,
            commands::abort_chat_generation,
            commands::load_character_card,
            commands::load_lorebook,
            commands::list_all_lorebooks,
            commands::save_lorebook,
            commands::delete_lorebook,
            commands::import_lorebook_file,
            commands::export_lorebook_file,
            commands::evaluate_lorebook_context,
            commands::evaluate_multi_lorebooks,
            commands::assemble_prompt,
            commands::read_file_binary,
            commands::get_cognitive_overview,
            commands::update_psychology,
            commands::update_relationship,
            commands::add_episodic_memory,
            commands::add_diary_entry,
            commands::apply_emotional_decay,
            commands::trigger_memory_pipeline,
            commands::get_character_memory_markdown,
            commands::save_character_memory_markdown,
            commands::get_user_memory_markdown,
            commands::save_user_memory_markdown,
            commands::generate_manual_diary_entry,
            commands::import_sow_memory_files,
            commands::backup_memory_state,
            commands::list_memory_backups,
            commands::restore_memory_backup,
            commands::roll_stage_dice,
            commands::get_stage_state,
            commands::list_stage_scenes,
            commands::load_stage_scene,
            commands::save_stage_scene,
            commands::create_stage_scene,
            commands::delete_stage_scene,
            commands::export_stage_markdown,
            commands::stage_list_folders,
            commands::stage_create_folder,
            commands::stage_move_scene_to_folder,
            commands::stage_delete_folder,
            commands::stage_import_scene_json,
            commands::stage_export_scene_json,
            commands::stage_reset_scene,
            commands::stage_edit_message,
            commands::stage_delete_message,
            commands::stage_regenerate_turn,
            commands::stage_get_background_image,
            commands::run_stage_turn,
            commands::undo_stage_turn,
            commands::rest_stage_party,
            commands::use_stage_inventory_item,
            commands::delay_encounter_turn,
            commands::update_world_state,
            commands::set_clock_progress,
            commands::add_clock,
            commands::delete_clock,
            commands::start_encounter,
            commands::end_encounter,
            commands::next_encounter_turn,
            commands::apply_combatant_delta,
            commands::add_combatant_condition,
            commands::get_companion_state,
            commands::apply_hormone_interaction,
            commands::set_hormones,
            commands::request_tool_call,
            commands::resolve_tool_call,
            commands::update_companion_settings,
            commands::add_companion_thought,
            commands::clear_companion_thoughts,
            commands::add_companion_goal,
            commands::mark_companion_goal_completed,
            commands::delete_companion_goal,
            commands::get_companion_environment_snapshot,
            commands::detect_desktop_window,
            commands::list_mcp_servers,
            commands::save_mcp_servers,
            commands::toggle_mcp_server,
            commands::fetch_mcp_server_tools,
            commands::call_mcp_tool,
            commands::list_companion_plugins,
            commands::save_companion_plugin,
            commands::execute_companion_plugin,
            commands::toggle_companion_overlay,
            commands::evaluate_companion_proactive,
            commands::get_app_paths,
            commands::scan_characters,
            commands::scan_models,
            commands::scan_vrm_models,
            commands::load_settings,
            commands::save_settings,
            commands::save_character_card,
            commands::export_character_card,
            commands::delete_character,
            commands::restore_hidden_characters,
            commands::load_personas,
            commands::save_persona,
            commands::delete_persona,
            commands::create_chat_session,
            commands::list_chat_sessions,
            commands::get_chat_session,
            commands::delete_chat_session,
            commands::rename_chat_session,
            commands::update_chat_author_note,
            commands::get_chat_messages,
            commands::add_chat_message,
            commands::update_chat_message,
            commands::add_message_swipe,
            commands::switch_message_swipe,
            commands::delete_chat_message,
            commands::delete_messages_after,
            commands::export_chat_jsonl,
            commands::import_chat_jsonl,
            commands::fetch_openrouter_models,
            commands::load_llm_presets,
            commands::save_llm_preset,
            commands::delete_llm_preset,
            commands::search_hf_models,
            commands::get_hf_model_files,
            commands::download_gguf_model,
            // Voice / TTS
            commands::list_available_voices,
            commands::get_kokoro_installation,
            commands::install_kokoro_model,
            commands::synthesize_speech,
            commands::transcribe_speech,
            commands::get_character_voice_config,
            commands::save_character_voice_config,
            // Live2D & Emotions
            commands::scan_live2d_models,
            commands::get_live2d_catalog,
            commands::download_live2d_model,
            commands::classify_text_emotion,
            commands::import_live2d_model,
            commands::import_sow_live2d_models,
            // Soul Hub (Soul Gateway, Chub AI, Lorebooks, Stage Scenarios)
            commands::fetch_soul_gateway_registry,
            commands::import_soul_gateway_character,
            commands::search_chub_characters,
            commands::get_chub_character_details,
            commands::import_chub_character,
            commands::import_character_from_url,
            commands::fetch_lorebooks_gateway_registry,
            commands::import_lorebook_from_gateway,
            commands::fetch_stages_gateway_registry,
            commands::import_scene_from_gateway,
            // Phase 17: Ecosystem, Backups, Image Gen, Discord, Web Client & AI Assistant
            commands::create_profile_backup,
            commands::list_profile_backups,
            commands::restore_profile_backup,
            commands::delete_profile_backup,
            commands::get_image_gen_config,
            commands::save_image_gen_config,
            commands::build_character_image_prompt,
            commands::generate_image_action,
            commands::list_generated_images,
            commands::set_discord_rpc_enabled,
            commands::get_discord_rpc_enabled,
            commands::update_discord_rpc_activity,
            commands::get_discord_bot_config,
            commands::save_discord_bot_config,
            commands::start_discord_bot,
            commands::stop_discord_bot,
            commands::get_discord_bot_status,
            commands::get_web_server_config,
            commands::save_web_server_config,
            commands::start_web_server,
            commands::stop_web_server,
            commands::get_web_server_status,
            commands::regenerate_web_server_token,
            commands::build_character_wizard_prompt_cmd,
            commands::parse_character_wizard_draft_cmd,
            commands::create_character_from_draft,
            commands::generate_character_draft_llm,
            // Phase 18: Logging & Updates
            commands::get_app_logs,
            commands::clear_app_logs,
            commands::export_app_logs,
            commands::check_for_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OtakuSoul application");
}
