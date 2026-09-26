pub mod commands;
pub mod modules;
pub mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing subscriber for clean logs
    let _ = tracing_subscriber::fmt().try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
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
            commands::evaluate_lorebook_context,
            commands::assemble_prompt,
            commands::read_file_binary,
            commands::get_cognitive_overview,
            commands::update_psychology,
            commands::update_relationship,
            commands::add_episodic_memory,
            commands::add_diary_entry,
            commands::apply_emotional_decay,
            commands::roll_stage_dice,
            commands::get_stage_state,
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
            commands::get_app_paths,
            commands::scan_characters,
            commands::scan_models,
            commands::scan_vrm_models,
            commands::load_settings,
            commands::save_settings,
            commands::save_character_card,
            commands::export_character_card,
            commands::delete_character,
            commands::load_personas,
            commands::save_persona,
            commands::delete_persona,
        ])
        .run(tauri::generate_context!())
        .expect("error while running OtakuSoul application");
}
