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

/// The main window comes from `tauri.conf.json` (`create: false`) and is built here, so an
/// isolated profile also gets its own webview storage (`localStorage`, IndexedDB, cache).
/// Otherwise test runs would share it with each other and with the real installation.
/// macOS ignores the folder (WKWebView has no per-path data store).
fn create_main_window(app: &tauri::App) -> tauri::Result<()> {
    let Some(config) = app.config().app.windows.iter().find(|w| w.label == "main") else {
        return Ok(());
    };
    let mut builder = tauri::WebviewWindowBuilder::from_config(app, config)?;
    if let Some(home) = modules::paths::isolated_home() {
        builder = builder.data_directory(home.join("webview"));
    }
    builder.build()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Console, in-app log viewer and rotating log file; level via RUST_LOG.
    modules::logger::init_tracing();

    let builder = tauri::Builder::default();

    // An isolated profile (OTAKUSOUL_HOME, end-to-end tests) runs next to a real installation:
    // no single-instance handover and no shared window state.
    #[cfg(desktop)]
    let isolated = crate::modules::paths::isolated_home().is_some();

    // Must be registered first: a second launch hands over to the running instance instead
    // of starting another llama-server that would compete for VRAM.
    #[cfg(desktop)]
    let builder = if isolated {
        builder
    } else {
        builder
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
    };
    // Signed in-app updates; the public key and manifest URL are in tauri.conf.json.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

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
            create_main_window(app)?;
            // Attachment files left by failed or stopped sends; in the background.
            let db = app.state::<AppState>().memory_db.clone();
            std::thread::spawn(move || match db.attachment_references() {
                Ok((files, chats)) => {
                    let removed = modules::attachments::remove_orphans(&files, &chats);
                    if removed > 0 {
                        tracing::info!("{removed} verwaiste Anhänge entfernt");
                    }
                }
                Err(e) => tracing::warn!("Anhänge nicht bereinigt: {e}"),
            });
            if let Some(window) = app.get_webview_window("main") {
                // The window-state plugin is only registered outside an isolated profile.
                #[cfg(desktop)]
                if modules::paths::isolated_home().is_none() {
                    use tauri_plugin_window_state::WindowExt;
                    let _ = window.restore_state(tauri_plugin_window_state::StateFlags::all());
                }
                let _ = window.show();

                // Closing hides the window into the tray (setting `close_to_tray`), the first
                // time after a hint in the interface; otherwise it quits the app.
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        match modules::settings::close_behaviour() {
                            (false, _) => window_clone.app_handle().exit(0),
                            (true, false) => {
                                use tauri::Emitter;
                                let _ = window_clone.emit("close-to-tray-hint", ());
                            }
                            (true, true) => {
                                let _ = window_clone.hide();
                            }
                        }
                    }
                });
            }

            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                if let Some(icon) = app.default_window_icon().cloned() {
                    // In the interface language; the first-close hint refers to "Beenden"/"Quit".
                    let (show_label, quit_label) =
                        match modules::settings::load_app_settings().app_language.as_str() {
                            "en" => ("Show", "Quit"),
                            "ru" => ("Показать", "Выход"),
                            _ => ("Anzeigen", "Beenden"),
                        };
                    let show_i = MenuItem::with_id(app, "show", show_label, true, None::<&str>)?;
                    let quit_i = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;
                    let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

                    let _tray = TrayIconBuilder::new()
                        .menu(&menu)
                        .show_menu_on_left_click(false)
                        .icon(icon)
                        .on_menu_event(|app, event| match event.id.as_ref() {
                            "quit" => {
                                app.exit(0);
                            }
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            _ => {}
                        })
                        .on_tray_icon_event(|tray, event| {
                            if let TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            } = event
                            {
                                let app = tray.app_handle();
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        })
                        .build(app)?;
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::llm::get_hardware_info,
            commands::llm::get_layer_recommendation,
            commands::llm::start_llama_server,
            commands::llm::quick_reply,
            commands::llm::list_starter_models,
            commands::llm::stop_llama_server,
            commands::llm::get_llama_server_status,
            commands::llm::get_runtime,
            commands::llm::get_previous_runtime,
            commands::llm::rollback_runtime,
            commands::llm::list_runtime_variants,
            commands::llm::install_runtime,
            commands::chat::send_chat_message,
            commands::chat::abort_chat_generation,
            commands::chat::get_last_prompt,
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
            commands::chat::list_prompt_templates,
            commands::chat::save_attachment,
            commands::chat::translate_message,
            commands::chat::get_attachment_data_url,
            commands::app::read_file_binary,
            commands::memory::get_cognitive_overview,
            commands::memory::update_psychology,
            commands::memory::update_relationship,
            commands::memory::add_episodic_memory,
            commands::memory::update_episodic_memory,
            commands::memory::forget_episodic_memory,
            commands::memory::set_episodic_memory_pinned,
            commands::memory::confirm_episodic_memory,
            commands::memory::get_memory_history,
            commands::memory::count_memories_from_message,
            commands::memory::add_diary_entry,
            commands::memory::apply_emotional_decay,
            commands::memory::trigger_memory_pipeline,
            commands::memory::get_character_memory_markdown,
            commands::memory::save_character_memory_markdown,
            commands::memory::get_user_memory_markdown,
            commands::memory::save_user_memory_markdown,
            commands::memory::generate_manual_diary_entry,
            commands::memory::backup_memory_state,
            commands::memory::list_memory_backups,
            commands::memory::restore_memory_backup,
            commands::stage::roll_stage_dice,
            commands::stage::get_stage_state,
            commands::stage::stage_upsert_npc,
            commands::stage::stage_set_npc_active,
            commands::stage::stage_promote_npc,
            commands::stage::list_stage_scenes,
            commands::stage::load_stage_scene,
            commands::stage::save_stage_scene,
            commands::stage::create_stage_scene,
            commands::stage::update_stage_scene_definition,
            commands::stage::list_stage_assets,
            commands::stage::import_stage_asset,
            commands::stage::get_stage_ambient_audio,
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
            commands::stage::abort_stage_turn,
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
            commands::stage::stage_set_combatant_skill,
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
            commands::app::hide_main_window,
            commands::app::log_frontend,
            commands::app::open_avatar_folder,
            commands::characters::scan_characters,
            commands::app::scan_models,
            commands::app::scan_loras,
            commands::app::scan_vision_projectors,
            commands::app::scan_vrm_models,
            commands::app::import_vrm_model,
            commands::app::load_settings,
            commands::app::save_settings,
            commands::characters::save_character_card,
            commands::characters::import_character_file,
            commands::characters::export_character_card,
            commands::characters::delete_character,
            commands::characters::restore_hidden_characters,
            commands::characters::load_personas,
            commands::characters::save_persona,
            commands::characters::delete_persona,
            commands::chat::create_chat_session,
            commands::chat::list_chat_sessions,
            commands::chat::update_chat_style,
            commands::chat::get_chat_session,
            commands::chat::delete_chat_session,
            commands::chat::rename_chat_session,
            commands::chat::update_chat_author_note,
            commands::chat::summarize_chat,
            commands::chat::update_chat_summary,
            commands::chat::get_chat_messages,
            commands::chat::list_chat_bookmarks,
            commands::chat::branch_chat,
            commands::chat::set_chat_bookmark,
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
            commands::llm::cancel_gguf_download,
            // Voice / TTS
            commands::voice::list_available_voices,
            commands::voice::get_kokoro_installation,
            commands::voice::install_kokoro_model,
            commands::voice::synthesize_speech,
            commands::voice::transcribe_speech,
            commands::voice::list_tts_models,
            commands::voice::download_tts_model,
            commands::voice::cancel_tts_model_download,
            commands::voice::delete_tts_model,
            commands::voice::get_tts_local_settings,
            commands::voice::save_tts_local_settings,
            commands::voice::list_cloned_voices,
            commands::voice::create_cloned_voice,
            commands::voice::delete_cloned_voice,
            commands::voice::get_character_voice_config,
            commands::voice::save_character_voice_config,
            // Live2D & Emotions
            commands::avatar::scan_live2d_models,
            commands::avatar::get_live2d_catalog,
            commands::avatar::download_live2d_model,
            commands::avatar::classify_text_emotion,
            commands::avatar::import_live2d_model,
            commands::avatar::scan_avatar_motions,
            commands::avatar::import_avatar_motion,
            commands::avatar::set_avatar_motion_role,
            commands::avatar::delete_avatar_motion,
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
            commands::ecosystem::list_image_loras,
            commands::ecosystem::download_image_lora,
            commands::ecosystem::delete_image_lora,
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
        .build(tauri::generate_context!())
        .expect("error while building OtakuSoul application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                stop_model_servers(app);
            }
        });
}

/// Stops the app's model servers before the process ends (tray "Beenden", updater restart).
/// Linux ends them with the app anyway (`PR_SET_PDEATHSIG`); on Windows and macOS they would
/// keep running and hold VRAM. Bounded, so a hanging server can't keep the app alive.
fn stop_model_servers(app: &tauri::AppHandle) {
    use tauri::Manager;
    let state = app.state::<AppState>();
    let (llama, image) = (state.llama_manager.clone(), state.local_image.clone());
    tauri::async_runtime::block_on(async move {
        let stop_all = async {
            let (llm, _, _) = tokio::join!(
                llama.stop(),
                image.stop(),
                modules::tts_local::engine().stop()
            );
            if let Err(e) = llm {
                tracing::warn!("llama-server beim Beenden nicht gestoppt: {e}");
            }
        };
        if tokio::time::timeout(std::time::Duration::from_secs(8), stop_all)
            .await
            .is_err()
        {
            tracing::warn!("Modellserver beim Beenden nicht rechtzeitig gestoppt");
        }
    });
}
