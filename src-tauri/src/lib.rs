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
        ])
        .run(tauri::generate_context!())
        .expect("error while running OtakuSoul application");
}
