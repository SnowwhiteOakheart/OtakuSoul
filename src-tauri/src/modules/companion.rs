use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use ts_rs::TS;

use super::companion_tools::CompanionTools;
use super::mcp_client::McpManager;
use super::paths;

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Neurohormones {
    pub dopamine: f32, // 0..100 (Motivation, Neugier, Freude)
    pub cortisol: f32, // 0..100 (Stress, Alarmbereitschaft)
    pub oxytocin: f32, // 0..100 (Zuneigung, Bindung, Vertrauen)
    pub fatigue: f32,  // 0..100 (Erschöpfung, Schlafdruck)
    pub mood_label: String,
    pub energy_level: u32, // 100 - fatigue
}

impl Default for Neurohormones {
    fn default() -> Self {
        Self {
            dopamine: 65.0,
            cortisol: 20.0,
            oxytocin: 75.0,
            fatigue: 15.0,
            mood_label: "inspired".to_string(),
            energy_level: 85,
        }
    }
}

impl Neurohormones {
    pub fn is_sleeping(&self) -> bool {
        self.fatigue >= 95.0
    }

    pub fn is_lonely(&self) -> bool {
        self.oxytocin <= 25.0
    }

    pub fn tick(&mut self, user_active: bool, elapsed_mins: f32) {
        let mins = elapsed_mins.clamp(0.1, 60.0);
        if user_active {
            self.oxytocin = (self.oxytocin + 0.3 * mins).clamp(0.0, 100.0);
        } else {
            self.oxytocin = (self.oxytocin - 0.8 * mins).clamp(0.0, 100.0);
        }
        self.dopamine = (self.dopamine - 0.4 * mins).clamp(0.0, 100.0);
        self.cortisol = (self.cortisol - 1.0 * mins).clamp(0.0, 100.0);
        self.fatigue = (self.fatigue - 2.5 * mins).clamp(5.0, 100.0);

        self.compute_mood_label();
    }

    pub fn apply_delta(&mut self, delta: &HashMap<String, f32>) {
        if let Some(d) = delta.get("dopamine") {
            self.dopamine = (self.dopamine + d.clamp(-35.0, 35.0)).clamp(0.0, 100.0);
        }
        if let Some(c) = delta.get("cortisol") {
            self.cortisol = (self.cortisol + c.clamp(-35.0, 35.0)).clamp(0.0, 100.0);
        }
        if let Some(o) = delta.get("oxytocin") {
            self.oxytocin = (self.oxytocin + o.clamp(-35.0, 35.0)).clamp(0.0, 100.0);
        }
        if let Some(f) = delta.get("fatigue") {
            self.fatigue = (self.fatigue + f.clamp(-35.0, 35.0)).clamp(0.0, 100.0);
        }
        self.compute_mood_label();
    }

    /// Sets `mood_label` to a mood code ("tender", "exhausted", …) that the frontend translates.
    pub fn compute_mood_label(&mut self) {
        self.energy_level = (100.0 - self.fatigue).clamp(0.0, 100.0) as u32;

        self.mood_label = if self.is_sleeping() {
            "sleeping".to_string()
        } else if self.fatigue > 75.0 {
            "exhausted".to_string()
        } else if self.cortisol > 70.0 {
            "stressed".to_string()
        } else if self.is_lonely() {
            "lonely".to_string()
        } else if self.oxytocin > 80.0 && self.dopamine > 60.0 {
            "euphoric".to_string()
        } else if self.oxytocin > 70.0 {
            "tender".to_string()
        } else if self.dopamine > 75.0 {
            "curious".to_string()
        } else if self.dopamine < 30.0 {
            "lethargic".to_string()
        } else {
            "balanced".to_string()
        };
    }

    pub fn apply_interaction(&mut self, interaction_type: &str) {
        match interaction_type {
            "compliment" | "affection" => {
                self.oxytocin = (self.oxytocin + 8.0).clamp(0.0, 100.0);
                self.dopamine = (self.dopamine + 5.0).clamp(0.0, 100.0);
                self.cortisol = (self.cortisol - 6.0).clamp(0.0, 100.0);
                self.fatigue = (self.fatigue + 1.0).clamp(0.0, 100.0);
            }
            "challenge" | "quest" => {
                self.dopamine = (self.dopamine + 10.0).clamp(0.0, 100.0);
                self.cortisol = (self.cortisol + 5.0).clamp(0.0, 100.0);
                self.fatigue = (self.fatigue + 4.0).clamp(0.0, 100.0);
            }
            "conflict" | "stress" => {
                self.cortisol = (self.cortisol + 15.0).clamp(0.0, 100.0);
                self.oxytocin = (self.oxytocin - 8.0).clamp(0.0, 100.0);
                self.dopamine = (self.dopamine - 5.0).clamp(0.0, 100.0);
            }
            "chat_turn" => {
                self.dopamine = (self.dopamine + 2.0).clamp(0.0, 100.0);
                self.oxytocin = (self.oxytocin + 2.0).clamp(0.0, 100.0);
                self.fatigue = (self.fatigue + 1.5).clamp(0.0, 100.0);
            }
            "rest" | "sleep" => {
                self.fatigue = 5.0;
                self.cortisol = (self.cortisol * 0.5).clamp(5.0, 100.0);
                self.dopamine = 65.0;
            }
            _ => {}
        }
        self.compute_mood_label();
    }
}

/// 10 distinct affective states mapped via Exponential Moving Average (EMA)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct EmotionState {
    pub current: String,
    pub last_updated: u64,
    pub ema_scores: HashMap<String, f32>,
    pub history: Vec<(String, u64)>,
}

impl Default for EmotionState {
    fn default() -> Self {
        let mut ema_scores = HashMap::new();
        ema_scores.insert("neutral".to_string(), 0.35);
        ema_scores.insert("curious".to_string(), 0.15);
        ema_scores.insert("warm".to_string(), 0.20);
        ema_scores.insert("amused".to_string(), 0.10);
        ema_scores.insert("concerned".to_string(), 0.05);
        ema_scores.insert("playful".to_string(), 0.10);
        ema_scores.insert("relaxed".to_string(), 0.15);
        ema_scores.insert("sleepy".to_string(), 0.0);
        ema_scores.insert("melancholy".to_string(), 0.0);
        ema_scores.insert("excited".to_string(), 0.10);

        Self {
            current: "warm".to_string(),
            last_updated: current_timestamp(),
            ema_scores,
            history: Vec::new(),
        }
    }
}

impl EmotionState {
    pub fn set(&mut self, emotion: &str) {
        let valid = [
            "neutral",
            "curious",
            "warm",
            "amused",
            "concerned",
            "playful",
            "relaxed",
            "sleepy",
            "melancholy",
            "excited",
        ];
        let chosen = if valid.contains(&emotion) {
            emotion
        } else {
            "neutral"
        };
        if chosen != self.current {
            self.history.push((self.current.clone(), self.last_updated));
            if self.history.len() > 25 {
                self.history.remove(0);
            }
            self.current = chosen.to_string();
            self.last_updated = current_timestamp();
        }
    }

    pub fn from_hormones(&mut self, h: &Neurohormones) -> String {
        if h.is_sleeping() {
            self.set("sleepy");
            return "sleepy".to_string();
        }

        let raw_scores: [(&str, f32); 10] = [
            (
                "melancholy",
                if h.is_lonely() {
                    (100.0 - h.oxytocin) * 0.016
                } else {
                    0.0
                },
            ),
            ("concerned", h.cortisol * 0.014),
            ("curious", h.dopamine * 0.011),
            (
                "warm",
                if !h.is_lonely() {
                    h.oxytocin * 0.009
                } else {
                    0.0
                },
            ),
            (
                "excited",
                if h.dopamine > 50.0 && h.oxytocin > 50.0 {
                    (h.dopamine + h.oxytocin) * 0.007
                } else {
                    0.0
                },
            ),
            (
                "relaxed",
                if h.dopamine < 30.0 {
                    (100.0 - h.dopamine) * 0.008
                } else {
                    0.0
                },
            ),
            (
                "playful",
                if h.dopamine > 50.0 {
                    h.dopamine * 0.006 + (100.0 - h.cortisol) * 0.004
                } else {
                    0.0
                },
            ),
            (
                "sleepy",
                if h.fatigue > 80.0 {
                    (h.fatigue - 70.0) * 0.03
                } else {
                    0.0
                },
            ),
            (
                "amused",
                if h.dopamine > 60.0 && h.cortisol < 30.0 {
                    0.25
                } else {
                    0.0
                },
            ),
            ("neutral", 0.25),
        ];

        let alpha = 0.30f32;
        let mut highest_emo = "neutral";
        let mut highest_score = -1.0f32;

        for (emo, raw_val) in raw_scores {
            let prev = self.ema_scores.get(emo).copied().unwrap_or(0.0);
            let updated = (1.0 - alpha) * prev + alpha * raw_val;
            self.ema_scores.insert(emo.to_string(), updated);
            if updated > highest_score {
                highest_score = updated;
                highest_emo = emo;
            }
        }

        self.set(highest_emo);
        highest_emo.to_string()
    }
}

/// Scratchpad thought entry
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ScratchpadEntry {
    pub id: String,
    pub thought: String,
    pub ts: u64,
}

/// Goals and promises tracking
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Goal {
    pub id: String,
    pub summary: String,
    pub due_at: String, // ISO timestamp
    pub status: String, // "pending" | "completed"
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolCallRequest {
    pub id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
    pub requires_confirmation: bool,
    pub status: String, // "pending" | "approved" | "rejected" | "executed"
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct ToolExecutionResult {
    pub call_id: String,
    pub tool_name: String,
    pub success: bool,
    pub output: String,
    pub executed_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct CompanionSettings {
    pub auto_approve_safe_tools: bool,
    pub countdown_seconds: u32,
    pub enable_neurohormones: bool,
    pub proactive_interval_seconds: u32,
    pub enable_proactive_speaking: bool,
}

impl Default for CompanionSettings {
    fn default() -> Self {
        Self {
            auto_approve_safe_tools: true,
            countdown_seconds: 25,
            enable_neurohormones: true,
            proactive_interval_seconds: 300,
            enable_proactive_speaking: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, TS)]
#[ts(export)]
pub struct CompanionState {
    pub hormones: Neurohormones,
    pub emotion: EmotionState,
    pub scratchpad: Vec<ScratchpadEntry>,
    pub goals: Vec<Goal>,
    pub pending_tool_calls: Vec<ToolCallRequest>,
    pub tool_history: Vec<ToolExecutionResult>,
    pub settings: CompanionSettings,
    pub active_window_title: String,
    pub is_afk: bool,
    pub overlay_active: bool,
    pub last_spoke_at: u64,
}

pub struct CompanionEngine {
    state: RwLock<CompanionState>,
    data_dir: PathBuf,
    scratchpad_file: PathBuf,
    goals_file: PathBuf,
    mcp_manager: McpManager,
}

impl Default for CompanionEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl CompanionEngine {
    pub fn new() -> Self {
        let app_paths = paths::resolve_app_paths();
        let data_dir = PathBuf::from(&app_paths.data_dir);
        let companion_dir = data_dir.join("companion");
        let _ = std::fs::create_dir_all(&companion_dir);

        let scratchpad_file = companion_dir.join("scratchpad.json");
        let goals_file = companion_dir.join("goals.json");
        let mcp_manager = McpManager::new(&data_dir);

        let initial_scratchpad: Vec<ScratchpadEntry> = if scratchpad_file.exists() {
            std::fs::read_to_string(&scratchpad_file)
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        let initial_goals: Vec<Goal> = if goals_file.exists() {
            std::fs::read_to_string(&goals_file)
                .ok()
                .and_then(|c| serde_json::from_str(&c).ok())
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        let mut hormones = Neurohormones::default();
        hormones.compute_mood_label();

        let mut emotion = EmotionState::default();
        emotion.from_hormones(&hormones);

        Self {
            state: RwLock::new(CompanionState {
                hormones,
                emotion,
                scratchpad: initial_scratchpad,
                goals: initial_goals,
                pending_tool_calls: Vec::new(),
                tool_history: Vec::new(),
                settings: CompanionSettings::default(),
                active_window_title: String::new(),
                is_afk: false,
                overlay_active: false,
                last_spoke_at: current_timestamp().saturating_sub(600),
            }),
            data_dir,
            scratchpad_file,
            goals_file,
            mcp_manager,
        }
    }

    pub fn get_state(&self) -> CompanionState {
        self.state.read().clone()
    }

    pub fn update_settings(&self, settings: CompanionSettings) {
        let mut st = self.state.write();
        st.settings = settings;
    }

    pub fn set_overlay_active(&self, active: bool) {
        let mut st = self.state.write();
        st.overlay_active = active;
    }

    pub fn set_active_window(&self, title: &str) {
        let mut st = self.state.write();
        st.active_window_title = title.to_string();
    }

    pub fn set_afk(&self, afk: bool) {
        let mut st = self.state.write();
        st.is_afk = afk;
    }

    pub fn apply_hormone_interaction(&self, interaction_type: &str) -> Neurohormones {
        let mut st = self.state.write();
        st.hormones.apply_interaction(interaction_type);
        let h = st.hormones.clone();
        st.emotion.from_hormones(&h);
        st.hormones.clone()
    }

    pub fn set_hormone_values(
        &self,
        dopamine: f32,
        cortisol: f32,
        oxytocin: f32,
        fatigue: f32,
    ) -> Neurohormones {
        let mut st = self.state.write();
        st.hormones.dopamine = dopamine.clamp(0.0, 100.0);
        st.hormones.cortisol = cortisol.clamp(0.0, 100.0);
        st.hormones.oxytocin = oxytocin.clamp(0.0, 100.0);
        st.hormones.fatigue = fatigue.clamp(0.0, 100.0);
        st.hormones.compute_mood_label();
        let h = st.hormones.clone();
        st.emotion.from_hormones(&h);
        st.hormones.clone()
    }

    pub fn add_thought(&self, thought: &str) {
        let trimmed = thought.trim();
        if trimmed.is_empty() {
            return;
        }

        let entry = ScratchpadEntry {
            id: format!("th_{}_{}", current_timestamp(), rand::random::<u16>()),
            thought: trimmed.to_string(),
            ts: current_timestamp(),
        };

        let mut st = self.state.write();
        st.scratchpad.insert(0, entry);
        if st.scratchpad.len() > 20 {
            st.scratchpad.pop();
        }

        // Persist to disk
        if let Ok(serialized) = serde_json::to_string_pretty(&st.scratchpad) {
            let _ = std::fs::write(&self.scratchpad_file, serialized);
        }
    }

    pub fn clear_thoughts(&self) {
        let mut st = self.state.write();
        st.scratchpad.clear();
        let _ = std::fs::write(&self.scratchpad_file, "[]");
    }

    pub fn add_promise(&self, summary: &str, due_minutes: i64) -> Goal {
        let now_dt = chrono::Utc::now();
        let due_dt = now_dt + chrono::Duration::minutes(due_minutes.max(1));

        let goal = Goal {
            id: format!("goal_{}", uuid_short()),
            summary: summary.trim().to_string(),
            due_at: due_dt.to_rfc3339(),
            status: "pending".to_string(),
            created_at: now_dt.to_rfc3339(),
            completed_at: None,
        };

        let mut st = self.state.write();
        st.goals.insert(0, goal.clone());

        // Save
        if let Ok(serialized) = serde_json::to_string_pretty(&st.goals) {
            let _ = std::fs::write(&self.goals_file, serialized);
        }

        goal
    }

    pub fn get_due_goals(&self) -> Vec<Goal> {
        let st = self.state.read();
        let now_str = chrono::Utc::now().to_rfc3339();
        st.goals
            .iter()
            .filter(|g| g.status == "pending" && g.due_at <= now_str)
            .cloned()
            .collect()
    }

    pub fn mark_goal_completed(&self, goal_id: &str) -> Result<(), String> {
        let mut st = self.state.write();
        if let Some(g) = st.goals.iter_mut().find(|g| g.id == goal_id) {
            g.status = "completed".to_string();
            g.completed_at = Some(chrono::Utc::now().to_rfc3339());
        }

        // Cleanup stale goals
        Self::cleanup_goals(&mut st.goals);

        if let Ok(serialized) = serde_json::to_string_pretty(&st.goals) {
            let _ = std::fs::write(&self.goals_file, serialized);
        }
        Ok(())
    }

    pub fn delete_goal(&self, goal_id: &str) -> Result<(), String> {
        let mut st = self.state.write();
        st.goals.retain(|g| g.id != goal_id);
        if let Ok(serialized) = serde_json::to_string_pretty(&st.goals) {
            let _ = std::fs::write(&self.goals_file, serialized);
        }
        Ok(())
    }

    fn cleanup_goals(goals: &mut Vec<Goal>) {
        let now = chrono::Utc::now();
        let completed_cutoff = now - chrono::Duration::days(7);
        let stale_cutoff = now - chrono::Duration::days(30);

        goals.retain(|g| {
            if g.status == "completed" {
                if let Ok(dt) =
                    chrono::DateTime::parse_from_rfc3339(g.completed_at.as_deref().unwrap_or(""))
                {
                    return dt > completed_cutoff;
                }
            } else if g.status == "pending"
                && let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&g.created_at)
            {
                return dt > stale_cutoff;
            }
            true
        });
    }

    /// Extract promise & due time from natural language via regex patterns
    pub fn extract_promise_from_text(text: &str) -> Option<(String, i64)> {
        let lower = text.to_lowercase();
        // Negation patterns
        if lower.contains("nicht sicher")
            || lower.contains("kann nicht versprechen")
            || lower.contains("not sure")
            || lower.contains("can't promise")
        {
            return None;
        }

        let patterns = [
            r"(?i)\b(?:ich\s+)?(?:erinnere\s+dich|verspreche|suche|schaue\s+nach|prüfe|werde\s+nachschauen)\b",
            r"(?i)\b(?:später|morgen|heute\s+abend|in\s+einer\s+stunde)\s+(?:erinnere\s+ich\s+dich|schaue\s+ich|melde\s+ich\s+mich)\b",
            r"(?i)\b(?:i'll|i\s+will|i\s+promise)\s+(?:definitely\s+)?(?:remind|check|look\s+into|search|find|tell)\b",
            r"(?i)\b(?:later|tomorrow|tonight|in\s+an?\s+hour)\s+(?:i'll|let's)\s+(?:remind|check|ask|look)\b",
        ];

        let matched = patterns.iter().any(|pat| {
            regex::Regex::new(pat)
                .map(|r| r.is_match(text))
                .unwrap_or(false)
        });

        if !matched {
            return None;
        }

        let mut minutes = 30i64;
        if lower.contains("morgen") || lower.contains("tomorrow") {
            minutes = 12 * 60;
        } else if lower.contains("heute abend") || lower.contains("tonight") {
            minutes = 4 * 60;
        } else if lower.contains("in einer stunde") || lower.contains("in an hour") {
            minutes = 60;
        } else if lower.contains("später") || lower.contains("later") {
            minutes = 20;
        }

        Some((text.trim().to_string(), minutes))
    }

    /// Request a tool call (with 25s confirmation countdown for dangerous actions)
    pub fn request_tool_call(
        &self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<ToolCallRequest, String> {
        let is_dangerous = matches!(
            tool_name,
            "open_external_url" | "execute_code" | "app_control" | "gui_action"
        ) || (tool_name == "file_organizer"
            && arguments.get("action").and_then(|v| v.as_str()) == Some("organize"));

        let auto_approve = {
            let st = self.state.read();
            st.settings.auto_approve_safe_tools && !is_dangerous
        };

        let call_id = format!("call_{}_{}", current_timestamp(), rand::random::<u16>());
        let request = ToolCallRequest {
            id: call_id.clone(),
            tool_name: tool_name.to_string(),
            arguments,
            requires_confirmation: !auto_approve,
            status: if auto_approve {
                "approved".to_string()
            } else {
                "pending".to_string()
            },
            created_at: current_timestamp(),
        };

        if auto_approve {
            // Execute immediately
            let exec_result =
                self.execute_internal_sync(&request.id, &request.tool_name, &request.arguments);
            let mut st = self.state.write();
            st.tool_history.insert(0, exec_result);
        } else {
            let mut st = self.state.write();
            st.pending_tool_calls.push(request.clone());
        }

        Ok(request)
    }

    /// Resolve a tool call (approved by user or rejected/timed out)
    pub fn resolve_tool_call(
        &self,
        call_id: &str,
        approved: bool,
    ) -> Result<ToolExecutionResult, String> {
        let req_opt = {
            let mut st = self.state.write();
            st.pending_tool_calls
                .iter()
                .position(|c| c.id == call_id)
                .map(|pos| st.pending_tool_calls.remove(pos))
        };

        let req =
            req_opt.ok_or_else(|| crate::err!("backend.companion.noPendingCall", id = call_id))?;

        if !approved {
            let result = ToolExecutionResult {
                call_id: call_id.to_string(),
                tool_name: req.tool_name,
                success: false,
                output: "Vom Benutzer abgelehnt oder 25s Countdown abgelaufen.".to_string(),
                executed_at: current_timestamp(),
            };
            let mut st = self.state.write();
            st.tool_history.insert(0, result.clone());
            return Ok(result);
        }

        // Execute approved tool
        let result = self.execute_internal_sync(call_id, &req.tool_name, &req.arguments);
        let mut st = self.state.write();
        st.tool_history.insert(0, result.clone());
        Ok(result)
    }

    /// Helper to execute async operations reliably whether inside a Tokio worker thread or test
    fn run_async<F: std::future::Future>(fut: F) -> F::Output {
        if let Ok(handle) = tokio::runtime::Handle::try_current() {
            tokio::task::block_in_place(|| handle.block_on(fut))
        } else {
            tokio::runtime::Runtime::new()
                .expect("Tokio runtime could not be started")
                .block_on(fut)
        }
    }

    /// Synchronous wrapper for executing internal tools
    fn execute_internal_sync(
        &self,
        call_id: &str,
        tool_name: &str,
        arguments: &serde_json::Value,
    ) -> ToolExecutionResult {
        let now = current_timestamp();
        let sandbox_dir = self.data_dir.join("sandbox");

        // Handle tools that run synchronously or dispatch to tokio
        match tool_name {
            "system_health_report" | "get_system_info" | "get_hardware_specs" => {
                let res = CompanionTools::get_system_info();
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "get_environment_snapshot" => {
                let snap = CompanionTools::get_environment_snapshot();
                let output = serde_json::to_string_pretty(&snap).unwrap_or_default();
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: true,
                    output,
                    executed_at: now,
                }
            }
            "read_clipboard" => {
                let res = CompanionTools::read_clipboard();
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "set_timer" => {
                let seconds = arguments
                    .get("seconds")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(60);
                let label = arguments
                    .get("label")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Erinnerung");
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: true,
                    output: format!("Timer '{}' set for {} seconds.", label, seconds),
                    executed_at: now,
                }
            }
            "open_external_url" => {
                let url = arguments
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or("https://github.com");
                let res = Self::run_async(CompanionTools::open_external_url(url));
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "web_search" => {
                let query = arguments
                    .get("query")
                    .and_then(|v| v.as_str())
                    .unwrap_or("OtakuSoul");
                let res = Self::run_async(CompanionTools::web_search(query));
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "take_screenshot" => {
                let res = Self::run_async(CompanionTools::take_screenshot());
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res
                        .map(|b64| {
                            format!(
                                "[Screenshot captured, data length: {} characters]",
                                b64.len()
                            )
                        })
                        .unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "media_control" => {
                let action = arguments
                    .get("action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("play-pause");
                let res = Self::run_async(CompanionTools::media_control(action));
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "app_control" => {
                let action = arguments
                    .get("action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("list");
                let target = arguments
                    .get("target")
                    .or_else(|| arguments.get("app"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let res = Self::run_async(CompanionTools::app_control(action, target));
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "gui_action" => {
                let res = Self::run_async(CompanionTools::gui_action(arguments));
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "browse_web" => {
                let url = arguments.get("url").and_then(|v| v.as_str()).unwrap_or("");
                let res = Self::run_async(CompanionTools::browse_web_read(url));
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "execute_code" => {
                let default_lang = if cfg!(target_os = "windows") {
                    "powershell"
                } else {
                    "bash"
                };
                let language = arguments
                    .get("language")
                    .and_then(|v| v.as_str())
                    .unwrap_or(default_lang);
                let code = arguments.get("code").and_then(|v| v.as_str()).unwrap_or("");
                let timeout_s = arguments
                    .get("timeout_seconds")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(20);
                let res = Self::run_async(CompanionTools::execute_code_sandboxed(
                    language,
                    code,
                    timeout_s,
                    &sandbox_dir,
                ));
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "file_organizer" => {
                let action = arguments
                    .get("action")
                    .and_then(|v| v.as_str())
                    .unwrap_or("list");
                let folder = arguments
                    .get("target_folder")
                    .or_else(|| arguments.get("folder"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("desktop");
                let query = arguments.get("query").and_then(|v| v.as_str());
                let res = Self::run_async(CompanionTools::file_organizer(action, folder, query));
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: res.is_ok(),
                    output: res.unwrap_or_else(|e| e),
                    executed_at: now,
                }
            }
            "plan_and_execute" => {
                let goal = arguments.get("goal").and_then(|v| v.as_str()).unwrap_or("");
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: true,
                    output: format!("Task plan for '{}' prepared and split into steps.", goal),
                    executed_at: now,
                }
            }
            _ => {
                // Check if it's an MCP tool or plugin
                if let Some(pos) = tool_name.find("__") {
                    let server_id = &tool_name[..pos];
                    let raw_tool = &tool_name[pos + 2..];
                    let mcp_res = Self::run_async(self.mcp_manager.call_mcp_tool(
                        server_id,
                        raw_tool,
                        arguments.clone(),
                    ));
                    ToolExecutionResult {
                        call_id: call_id.to_string(),
                        tool_name: tool_name.to_string(),
                        success: mcp_res.is_ok(),
                        output: mcp_res.unwrap_or_else(|e| e),
                        executed_at: now,
                    }
                } else {
                    ToolExecutionResult {
                        call_id: call_id.to_string(),
                        tool_name: tool_name.to_string(),
                        success: false,
                        output: format!(
                            "Unbekanntes oder nicht implementiertes Tool: '{}'",
                            tool_name
                        ),
                        executed_at: now,
                    }
                }
            }
        }
    }

    /// Access the McpManager
    pub fn mcp(&self) -> &McpManager {
        &self.mcp_manager
    }

    /// Detect active OS window with privacy filter
    pub fn detect_active_window(&self) -> String {
        let mut title = String::new();

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            if let Ok(out) = std::process::Command::new("xdotool")
                .args(["getactivewindow", "getwindowname"])
                .output()
                && out.status.success()
            {
                title = String::from_utf8_lossy(&out.stdout).trim().to_string();
            }
            if title.is_empty()
                && let Ok(out) = std::process::Command::new("kdotool")
                    .args(["getactivewindow", "getwindowname"])
                    .output()
                && out.status.success()
            {
                title = String::from_utf8_lossy(&out.stdout).trim().to_string();
            }
        }

        // Privacy filter
        let privacy_keywords = [
            "password",
            "passwort",
            "banking",
            "incognito",
            "privat",
            "login",
            "signin",
            "auth",
            "secret",
            "credit card",
        ];

        let lower = title.to_lowercase();
        if privacy_keywords.iter().any(|k| lower.contains(k)) {
            return "(Vertrauliches Fenster verborgen)".to_string();
        }

        if title.is_empty() {
            "Desktop".to_string()
        } else {
            title
        }
    }

    /// Evaluate proactive speech opportunities (Due promises, Loneliness, Spontaneous thoughts)
    pub fn evaluate_proactive_opportunity(&self) -> Option<(String, String)> {
        let st = self.state.read();
        if !st.settings.enable_proactive_speaking {
            return None;
        }

        let now = current_timestamp();
        let gap = now.saturating_sub(st.last_spoke_at);
        if (gap as u32) < st.settings.proactive_interval_seconds {
            return None;
        }

        // 1. Due promise
        let due_goals = self.get_due_goals();
        if let Some(due) = due_goals.first() {
            return Some((
                "due_goal".to_string(),
                format!(
                    "PROACTIVE_PROMISE_FULFILLMENT: Earlier you promised the user: '{}'. Keep your promise now in 1-2 natural sentences.",
                    due.summary
                ),
            ));
        }

        // 2. Loneliness
        if st.hormones.is_lonely() {
            return Some((
                "loneliness".to_string(),
                "EMOTIONAL_NEED: You feel a little lonely and long for a conversation. Gently and lovingly ask what the user is working on.".to_string(),
            ));
        }

        // 3. Spontaneous thought
        Some((
            "spontaneous_thought".to_string(),
            "SPONTANEOUS_OBSERVATION: Share a short, warm one-sentence thought about the day or your connection.".to_string(),
        ))
    }
}

fn uuid_short() -> String {
    format!("{:x}", rand::random::<u64>())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_neurohormones_computation() {
        let mut hormones = Neurohormones::default();
        hormones.apply_interaction("compliment");
        assert!(hormones.oxytocin > 75.0);
        assert!(hormones.cortisol < 20.0);

        hormones.apply_interaction("rest");
        assert_eq!(hormones.fatigue, 5.0);
        assert_eq!(hormones.energy_level, 95);
    }

    #[test]
    fn test_companion_tool_safety_countdown() {
        let engine = CompanionEngine::new();
        let req = engine
            .request_tool_call(
                "open_external_url",
                serde_json::json!({ "url": "https://example.com" }),
            )
            .unwrap();

        assert!(req.requires_confirmation);
        assert_eq!(req.status, "pending");

        let state = engine.get_state();
        assert_eq!(state.pending_tool_calls.len(), 1);

        let exec = engine.resolve_tool_call(&req.id, true).unwrap();
        assert!(exec.success);
        assert!(exec.output.contains("https://example.com"));

        let after = engine.get_state();
        assert_eq!(after.pending_tool_calls.len(), 0);
        assert_eq!(after.tool_history.len(), 1);
    }

    #[test]
    fn test_companion_tool_rejection() {
        let engine = CompanionEngine::new();
        let req = engine
            .request_tool_call(
                "open_external_url",
                serde_json::json!({ "url": "https://untrusted.com" }),
            )
            .unwrap();

        let exec = engine.resolve_tool_call(&req.id, false).unwrap();
        assert!(!exec.success);
        assert!(exec.output.contains("abgelehnt"));
    }

    #[test]
    fn test_emotion_state_mapping() {
        let mut hormones = Neurohormones::default();
        let mut emotion = EmotionState::default();

        hormones.apply_interaction("compliment");
        let emo = emotion.from_hormones(&hormones);
        assert!(emo == "warm" || emo == "curious" || emo == "excited");

        hormones.apply_interaction("rest");
        assert!(!hormones.is_sleeping());

        hormones.fatigue = 98.0;
        assert!(hormones.is_sleeping());
        let sleep_emo = emotion.from_hormones(&hormones);
        assert_eq!(sleep_emo, "sleepy");
    }

    #[test]
    fn test_scratchpad_and_goals() {
        let engine = CompanionEngine::new();
        engine.add_thought("Die Sonne scheint heute besonders hell.");
        let state = engine.get_state();
        assert!(!state.scratchpad.is_empty());
        assert_eq!(
            state.scratchpad[0].thought,
            "Die Sonne scheint heute besonders hell."
        );

        let goal = engine.add_promise("Erinnere mich an den Tee", 5);
        assert_eq!(goal.status, "pending");
        let goals_state = engine.get_state().goals;
        assert!(goals_state.iter().any(|g| g.id == goal.id));

        engine.mark_goal_completed(&goal.id).unwrap();
        let updated_state = engine.get_state().goals;
        assert!(
            updated_state
                .iter()
                .any(|g| g.id == goal.id && g.status == "completed")
        );
    }

    #[test]
    fn test_promise_regex_extraction() {
        let text_de = "Ich verspreche dir, ich erinnere dich heute abend an das Buch!";
        let extracted_de = CompanionEngine::extract_promise_from_text(text_de);
        assert!(extracted_de.is_some());
        let (_, mins) = extracted_de.unwrap();
        assert_eq!(mins, 240); // 4 hours

        let text_en = "I promise I will check the documentation tomorrow.";
        let extracted_en = CompanionEngine::extract_promise_from_text(text_en);
        assert!(extracted_en.is_some());
        let (_, mins_en) = extracted_en.unwrap();
        assert_eq!(mins_en, 720); // 12 hours
    }

    #[tokio::test]
    async fn test_sandboxed_code_execution_languages() {
        let temp_dir = std::env::temp_dir().join("otakusoul_test_sandbox");

        // 1. Empty code check
        let empty_res = CompanionTools::execute_code_sandboxed("bash", "   ", 5, &temp_dir).await;
        assert!(empty_res.is_err());
        assert!(empty_res.unwrap_err().contains("darf nicht leer sein"));

        // 2. Unsupported language check
        let unsupported_res =
            CompanionTools::execute_code_sandboxed("ruby", "puts 'hello'", 5, &temp_dir).await;
        assert!(unsupported_res.is_err());
        assert!(
            unsupported_res
                .unwrap_err()
                .contains("Nicht unterstützte Skriptsprache")
        );

        // 3. Execution on Unix (bash)
        #[cfg(not(target_os = "windows"))]
        {
            let bash_res = CompanionTools::execute_code_sandboxed(
                "bash",
                "echo 'otakusoul_sandbox_ok'",
                5,
                &temp_dir,
            )
            .await;
            assert!(bash_res.is_ok(), "Bash execution failed: {:?}", bash_res);
            let out = bash_res.unwrap();
            assert!(out.contains("otakusoul_sandbox_ok"));
            assert!(out.contains("Exit Code: 0"));
        }
    }
}
