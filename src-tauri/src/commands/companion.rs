//! Desktop companion: hormones, tool calls, goals, MCP servers, plugins and overlay.

use crate::state::AppState;
use tauri::State;

#[tauri::command]
pub fn get_companion_state(
    state: State<'_, AppState>,
) -> crate::modules::companion::CompanionState {
    state.companion_engine.get_state()
}

#[tauri::command]
pub fn apply_hormone_interaction(
    state: State<'_, AppState>,
    interaction_type: String,
) -> Result<crate::modules::companion::Neurohormones, String> {
    Ok(state
        .companion_engine
        .apply_hormone_interaction(&interaction_type))
}

#[tauri::command]
pub fn set_hormones(
    state: State<'_, AppState>,
    dopamine: f32,
    cortisol: f32,
    oxytocin: f32,
    fatigue: f32,
) -> Result<crate::modules::companion::Neurohormones, String> {
    Ok(state
        .companion_engine
        .set_hormone_values(dopamine, cortisol, oxytocin, fatigue))
}

#[tauri::command]
pub fn request_tool_call(
    state: State<'_, AppState>,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<crate::modules::companion::ToolCallRequest, String> {
    state
        .companion_engine
        .request_tool_call(&tool_name, arguments)
}

#[tauri::command]
pub fn resolve_tool_call(
    state: State<'_, AppState>,
    call_id: String,
    approved: bool,
) -> Result<crate::modules::companion::ToolExecutionResult, String> {
    state.companion_engine.resolve_tool_call(&call_id, approved)
}

#[tauri::command]
pub fn update_companion_settings(
    state: State<'_, AppState>,
    settings: crate::modules::companion::CompanionSettings,
) -> Result<(), String> {
    state.companion_engine.update_settings(settings);
    Ok(())
}

#[tauri::command]
pub fn add_companion_thought(state: State<'_, AppState>, thought: String) -> Result<(), String> {
    state.companion_engine.add_thought(&thought);
    Ok(())
}

#[tauri::command]
pub fn clear_companion_thoughts(state: State<'_, AppState>) -> Result<(), String> {
    state.companion_engine.clear_thoughts();
    Ok(())
}

#[tauri::command]
pub fn add_companion_goal(
    state: State<'_, AppState>,
    summary: String,
    due_minutes: i64,
) -> Result<crate::modules::companion::Goal, String> {
    Ok(state.companion_engine.add_promise(&summary, due_minutes))
}

#[tauri::command]
pub fn mark_companion_goal_completed(
    state: State<'_, AppState>,
    goal_id: String,
) -> Result<(), String> {
    state.companion_engine.mark_goal_completed(&goal_id)
}

#[tauri::command]
pub fn delete_companion_goal(state: State<'_, AppState>, goal_id: String) -> Result<(), String> {
    state.companion_engine.delete_goal(&goal_id)
}

#[tauri::command]
pub fn get_companion_environment_snapshot() -> crate::modules::companion_tools::EnvironmentSnapshot
{
    crate::modules::companion_tools::CompanionTools::get_environment_snapshot()
}

#[tauri::command]
pub fn detect_desktop_window(state: State<'_, AppState>) -> String {
    let title = state.companion_engine.detect_active_window();
    state.companion_engine.set_active_window(&title);
    title
}

#[tauri::command]
pub fn list_mcp_servers(
    state: State<'_, AppState>,
) -> Vec<crate::modules::mcp_client::McpServerConfig> {
    state.companion_engine.mcp().list_servers()
}

#[tauri::command]
pub fn save_mcp_servers(
    state: State<'_, AppState>,
    servers: Vec<crate::modules::mcp_client::McpServerConfig>,
) -> Result<(), String> {
    state.companion_engine.mcp().save_servers(servers)
}

#[tauri::command]
pub fn toggle_mcp_server(
    state: State<'_, AppState>,
    server_id: String,
    enabled: bool,
) -> Result<Vec<crate::modules::mcp_client::McpServerConfig>, String> {
    state
        .companion_engine
        .mcp()
        .toggle_server(&server_id, enabled)
}

#[tauri::command]
pub async fn fetch_mcp_server_tools(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<crate::modules::mcp_client::McpToolInfo>, String> {
    state
        .companion_engine
        .mcp()
        .fetch_server_tools(&server_id)
        .await
}

#[tauri::command]
pub async fn call_mcp_tool(
    state: State<'_, AppState>,
    server_id: String,
    tool_name: String,
    arguments: serde_json::Value,
) -> Result<String, String> {
    state
        .companion_engine
        .mcp()
        .call_mcp_tool(&server_id, &tool_name, arguments)
        .await
}

#[tauri::command]
pub fn list_companion_plugins(
    state: State<'_, AppState>,
) -> Vec<crate::modules::mcp_client::CompanionPlugin> {
    state.companion_engine.mcp().list_plugins()
}

#[tauri::command]
pub fn save_companion_plugin(
    state: State<'_, AppState>,
    plugin: crate::modules::mcp_client::CompanionPlugin,
) -> Result<(), String> {
    state.companion_engine.mcp().save_plugin(plugin)
}

#[tauri::command]
pub async fn execute_companion_plugin(
    state: State<'_, AppState>,
    plugin_id: String,
    arguments: serde_json::Value,
) -> Result<String, String> {
    state
        .companion_engine
        .mcp()
        .execute_plugin(&plugin_id, arguments)
        .await
}

#[tauri::command]
pub async fn toggle_companion_overlay(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    enable: bool,
    click_through: bool,
) -> Result<bool, String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("companion_overlay") {
        if enable {
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.set_ignore_cursor_events(click_through);
        } else {
            let _ = window.hide();
        }
    } else if enable {
        let builder = tauri::WebviewWindowBuilder::new(
            &app,
            "companion_overlay",
            tauri::WebviewUrl::App("index.html?overlay=true".into()),
        )
        .title("OtakuSoul Companion")
        .inner_size(380.0, 560.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .shadow(false);

        let window = builder
            .build()
            .map_err(|e| crate::err!("backend.companion.overlayWindow", error = e))?;
        let _ = window.set_ignore_cursor_events(click_through);
    }
    state.companion_engine.set_overlay_active(enable);
    Ok(enable)
}

#[tauri::command]
pub fn evaluate_companion_proactive(state: State<'_, AppState>) -> Option<(String, String)> {
    state.companion_engine.evaluate_proactive_opportunity()
}
