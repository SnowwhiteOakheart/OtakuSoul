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
    // Console, in-app log viewer and rotating log file; level via RUST_LOG.
    modules::logger::init_tracing();

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
        )
        // Signed in-app updates; the public key and manifest URL are in tauri.conf.json.
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .setup(|app| {
            use tauri::Manager;
            if let Ok(resource_dir) = app.path().resource_dir() {
                modules::paths::set_resource_dir(resource_dir);
            }
            allow_app_asset_dirs(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::llm::get_hardware_info,
            commands::llm::get_layer_recommendation,
            commands::llm::start_llama_server,
            commands::llm::stop_llama_server,
            commands::llm::get_llama_server_status,
            commands::llm::get_runtime,
            commands::llm::list_runtime_variants,
            commands::llm::install_runtime,
            commands::chat::send_chat_message,
            commands::chat::abort_chat_generation,
            commands::llm::load_character_card,
            commands::characters::load_lorebook,
            commands::lorebook::list_all_lorebooks,
            commands::lorebook::save_lorebook,
            commands::lorebook::delete_lorebook,
            commands::lorebook::import_lorebook_file,
            commands::lorebook::export_lorebook_file,
            commands::lorebook::evaluate_lorebook_context,
            commands::lorebook::evaluate_multi_lorebooks,
            commands::chat::assemble_prompt,
            commands::app::read_file_binary,
            commands::memory::get_cognitive_overview,
            commands::memory::update_psychology,
            commands::memory::update_relationship,
            commands::memory::add_episodic_memory,
            commands::memory::add_diary_entry,
            commands::memory::apply_emotional_decay,
            commands::memory::trigger_memory_pipeline,
            commands::memory::get_character_memory_markdown,
            commands::memory::save_character_memory_markdown,
            commands::memory::get_user_memory_markdown,
            commands::memory::save_user_memory_markdown,
            commands::memory::generate_manual_diary_entry,
            commands::memory::import_sow_memory_files,
            commands::memory::backup_memory_state,
            commands::memory::list_memory_backups,
            commands::memory::restore_memory_backup,
            commands::stage::roll_stage_dice,
            commands::stage::get_stage_state,
            commands::stage::list_stage_scenes,
            commands::stage::load_stage_scene,
            commands::stage::save_stage_scene,
            commands::stage::create_stage_scene,
            commands::stage::delete_stage_scene,
            commands::stage::export_stage_markdown,
            commands::stage::stage_list_folders,
            commands::stage::stage_create_folder,
            commands::stage::stage_move_scene_to_folder,
            commands::stage::stage_delete_folder,
            commands::stage::stage_import_scene_json,
            commands::stage::stage_export_scene_json,
            commands::stage::stage_reset_scene,
            commands::stage::stage_edit_message,
            commands::stage::stage_delete_message,
            commands::stage::stage_regenerate_turn,
            commands::stage::stage_get_background_image,
            commands::stage::run_stage_turn,
            commands::stage::undo_stage_turn,
            commands::stage::rest_stage_party,
            commands::stage::use_stage_inventory_item,
            commands::stage::delay_encounter_turn,
            commands::stage::update_world_state,
            commands::stage::set_clock_progress,
            commands::stage::add_clock,
            commands::stage::delete_clock,
            commands::stage::start_encounter,
            commands::stage::end_encounter,
            commands::stage::next_encounter_turn,
            commands::stage::apply_combatant_delta,
            commands::stage::add_combatant_condition,
            commands::companion::get_companion_state,
            commands::companion::apply_hormone_interaction,
            commands::companion::set_hormones,
            commands::companion::request_tool_call,
            commands::companion::resolve_tool_call,
            commands::companion::update_companion_settings,
            commands::companion::add_companion_thought,
            commands::companion::clear_companion_thoughts,
            commands::companion::add_companion_goal,
            commands::companion::mark_companion_goal_completed,
            commands::companion::delete_companion_goal,
            commands::companion::get_companion_environment_snapshot,
            commands::companion::detect_desktop_window,
            commands::companion::list_mcp_servers,
            commands::companion::save_mcp_servers,
            commands::companion::toggle_mcp_server,
            commands::companion::fetch_mcp_server_tools,
            commands::companion::call_mcp_tool,
            commands::companion::list_companion_plugins,
            commands::companion::save_companion_plugin,
            commands::companion::execute_companion_plugin,
            commands::companion::toggle_companion_overlay,
            commands::companion::evaluate_companion_proactive,
            commands::app::get_app_paths,
            commands::app::log_frontend,
            commands::app::open_avatar_folder,
            commands::characters::scan_characters,
            commands::app::scan_models,
            commands::app::scan_vrm_models,
            commands::app::import_vrm_model,
            commands::app::load_settings,
            commands::app::save_settings,
            commands::characters::save_character_card,
            commands::characters::export_character_card,
            commands::characters::delete_character,
            commands::characters::restore_hidden_characters,
            commands::characters::load_personas,
            commands::characters::save_persona,
            commands::characters::delete_persona,
            commands::chat::create_chat_session,
            commands::chat::list_chat_sessions,
            commands::chat::get_chat_session,
            commands::chat::delete_chat_session,
            commands::chat::rename_chat_session,
            commands::chat::update_chat_author_note,
            commands::chat::get_chat_messages,
            commands::chat::add_chat_message,
            commands::chat::update_chat_message,
            commands::chat::add_message_swipe,
            commands::chat::switch_message_swipe,
            commands::chat::delete_chat_message,
            commands::chat::delete_messages_after,
            commands::chat::export_chat_jsonl,
            commands::chat::import_chat_jsonl,
            commands::chat::fetch_openrouter_models,
            commands::llm::load_llm_presets,
            commands::llm::save_llm_preset,
            commands::llm::delete_llm_preset,
            commands::llm::search_hf_models,
            commands::llm::get_hf_model_files,
            commands::llm::download_gguf_model,
            // Voice / TTS
            commands::voice::list_available_voices,
            commands::voice::get_kokoro_installation,
            commands::voice::install_kokoro_model,
            commands::voice::synthesize_speech,
            commands::voice::transcribe_speech,
            commands::voice::get_character_voice_config,
            commands::voice::save_character_voice_config,
            // Live2D & Emotions
            commands::avatar::scan_live2d_models,
            commands::avatar::get_live2d_catalog,
            commands::avatar::download_live2d_model,
            commands::avatar::classify_text_emotion,
            commands::avatar::import_live2d_model,
            commands::avatar::import_sow_live2d_models,
            // Soul Hub (Soul Gateway, Chub AI, Lorebooks, Stage Scenarios)
            commands::hub::fetch_soul_gateway_registry,
            commands::hub::import_soul_gateway_character,
            commands::hub::search_chub_characters,
            commands::hub::get_chub_character_details,
            commands::hub::import_chub_character,
            commands::hub::import_character_from_url,
            commands::hub::fetch_lorebooks_gateway_registry,
            commands::hub::import_lorebook_from_gateway,
            commands::hub::fetch_stages_gateway_registry,
            commands::hub::import_scene_from_gateway,
            // Phase 17: Ecosystem, Backups, Image Gen, Discord, Web Client & AI Assistant
            commands::ecosystem::create_profile_backup,
            commands::ecosystem::list_profile_backups,
            commands::ecosystem::restore_profile_backup,
            commands::ecosystem::delete_profile_backup,
            commands::ecosystem::get_image_gen_config,
            commands::ecosystem::save_image_gen_config,
            commands::ecosystem::build_character_image_prompt,
            commands::ecosystem::generate_image_action,
            commands::ecosystem::list_generated_images,
            commands::ecosystem::write_image_prompt,
            commands::ecosystem::save_stage_background,
            commands::ecosystem::list_image_models,
            commands::ecosystem::download_image_model,
            commands::ecosystem::cancel_image_model_download,
            commands::ecosystem::delete_image_model,
            commands::ecosystem::stop_local_image_server,
            commands::ecosystem::set_discord_rpc_enabled,
            commands::ecosystem::get_discord_rpc_enabled,
            commands::ecosystem::update_discord_rpc_activity,
            commands::ecosystem::get_discord_bot_config,
            commands::ecosystem::save_discord_bot_config,
            commands::ecosystem::start_discord_bot,
            commands::ecosystem::stop_discord_bot,
            commands::ecosystem::get_discord_bot_status,
            commands::ecosystem::get_web_server_config,
            commands::ecosystem::save_web_server_config,
            commands::ecosystem::start_web_server,
            commands::ecosystem::stop_web_server,
            commands::ecosystem::get_web_server_status,
            commands::ecosystem::regenerate_web_server_token,
            commands::ecosystem::build_character_wizard_prompt_cmd,
            commands::characters::parse_character_wizard_draft_cmd,
            commands::characters::create_character_from_draft,
            commands::characters::generate_character_draft_llm,
            // Phase 18: Logging & Updates
            commands::characters::get_app_logs,
            commands::app::clear_app_logs,
            commands::app::export_app_logs,
            commands::app::check_for_updates,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OtakuSoul application");
}
