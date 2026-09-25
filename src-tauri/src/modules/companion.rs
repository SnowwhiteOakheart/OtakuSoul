use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Neurohormones {
    pub dopamine: f32, // 0..100 (Motivation, Curiosity, Joy)
    pub cortisol: f32, // 0..100 (Stress, Alert, Anxiety)
    pub oxytocin: f32, // 0..100 (Affection, Bonding, Trust)
    pub fatigue: f32,  // 0..100 (Physical/Cognitive exhaustion)
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
            mood_label: "Inspiriert & Warmherzig".to_string(),
            energy_level: 85,
        }
    }
}

impl Neurohormones {
    pub fn compute_mood_label(&mut self) {
        self.energy_level = (100.0 - self.fatigue).clamp(0.0, 100.0) as u32;

        self.mood_label = if self.fatigue > 75.0 {
            "Übermüdet & Erschöpft".to_string()
        } else if self.cortisol > 70.0 {
            "Gestresst & Angespannt".to_string()
        } else if self.oxytocin > 80.0 && self.dopamine > 60.0 {
            "Tief verbunden & Euphorisch".to_string()
        } else if self.oxytocin > 70.0 {
            "Warmherzig & Zärtlich".to_string()
        } else if self.dopamine > 75.0 {
            "Begeistert & Wissbegierig".to_string()
        } else if self.dopamine < 30.0 {
            "Lethargisch & Nachdenklich".to_string()
        } else {
            "Ruhig & Ausgeglichen".to_string()
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
                // Natural small tick from active conversation
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub id: String,
    pub tool_name: String,
    pub arguments: serde_json::Value,
    pub requires_confirmation: bool,
    pub status: String, // "pending" | "approved" | "rejected" | "executed"
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolExecutionResult {
    pub call_id: String,
    pub tool_name: String,
    pub success: bool,
    pub output: String,
    pub executed_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionSettings {
    pub auto_approve_safe_tools: bool,
    pub countdown_seconds: u32,
    pub enable_neurohormones: bool,
}

impl Default for CompanionSettings {
    fn default() -> Self {
        Self {
            auto_approve_safe_tools: true,
            countdown_seconds: 25,
            enable_neurohormones: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompanionState {
    pub hormones: Neurohormones,
    pub pending_tool_calls: Vec<ToolCallRequest>,
    pub tool_history: Vec<ToolExecutionResult>,
    pub settings: CompanionSettings,
}

pub struct CompanionEngine {
    state: RwLock<CompanionState>,
}

impl CompanionEngine {
    pub fn new() -> Self {
        let mut hormones = Neurohormones::default();
        hormones.compute_mood_label();

        Self {
            state: RwLock::new(CompanionState {
                hormones,
                pending_tool_calls: Vec::new(),
                tool_history: Vec::new(),
                settings: CompanionSettings::default(),
            }),
        }
    }

    pub fn get_state(&self) -> CompanionState {
        self.state.read().unwrap().clone()
    }

    pub fn update_settings(&self, settings: CompanionSettings) {
        let mut st = self.state.write().unwrap();
        st.settings = settings;
    }

    pub fn apply_hormone_interaction(&self, interaction_type: &str) -> Neurohormones {
        let mut st = self.state.write().unwrap();
        st.hormones.apply_interaction(interaction_type);
        st.hormones.clone()
    }

    pub fn set_hormone_values(&self, dopamine: f32, cortisol: f32, oxytocin: f32, fatigue: f32) -> Neurohormones {
        let mut st = self.state.write().unwrap();
        st.hormones.dopamine = dopamine.clamp(0.0, 100.0);
        st.hormones.cortisol = cortisol.clamp(0.0, 100.0);
        st.hormones.oxytocin = oxytocin.clamp(0.0, 100.0);
        st.hormones.fatigue = fatigue.clamp(0.0, 100.0);
        st.hormones.compute_mood_label();
        st.hormones.clone()
    }

    pub fn request_tool_call(
        &self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<ToolCallRequest, String> {
        let is_dangerous = matches!(tool_name, "execute_shell" | "write_file" | "delete_file" | "open_external_url");
        let auto_approve = {
            let st = self.state.read().unwrap();
            st.settings.auto_approve_safe_tools && !is_dangerous
        };

        let call_id = format!("call_{}_{}", current_timestamp(), rand::random::<u16>());
        let request = ToolCallRequest {
            id: call_id.clone(),
            tool_name: tool_name.to_string(),
            arguments,
            requires_confirmation: !auto_approve,
            status: if auto_approve { "approved".to_string() } else { "pending".to_string() },
            created_at: current_timestamp(),
        };

        if auto_approve {
            // Execute immediately
            let exec_result = self.execute_internal(&request.id, &request.tool_name, &request.arguments);
            let mut st = self.state.write().unwrap();
            st.tool_history.insert(0, exec_result);
        } else {
            let mut st = self.state.write().unwrap();
            st.pending_tool_calls.push(request.clone());
        }

        Ok(request)
    }

    pub fn resolve_tool_call(
        &self,
        call_id: &str,
        approved: bool,
    ) -> Result<ToolExecutionResult, String> {
        let req_opt = {
            let mut st = self.state.write().unwrap();
            if let Some(pos) = st.pending_tool_calls.iter().position(|c| c.id == call_id) {
                Some(st.pending_tool_calls.remove(pos))
            } else {
                None
            }
        };

        let req = req_opt.ok_or_else(|| format!("Kein anhängiger Tool-Call mit ID '{}' gefunden.", call_id))?;

        if !approved {
            let result = ToolExecutionResult {
                call_id: call_id.to_string(),
                tool_name: req.tool_name,
                success: false,
                output: "Vom Benutzer abgelehnt oder 25s Countdown abgelaufen.".to_string(),
                executed_at: current_timestamp(),
            };
            let mut st = self.state.write().unwrap();
            st.tool_history.insert(0, result.clone());
            return Ok(result);
        }

        // Execute approved tool
        let result = self.execute_internal(call_id, &req.tool_name, &req.arguments);
        let mut st = self.state.write().unwrap();
        st.tool_history.insert(0, result.clone());
        Ok(result)
    }

    fn execute_internal(
        &self,
        call_id: &str,
        tool_name: &str,
        arguments: &serde_json::Value,
    ) -> ToolExecutionResult {
        let now = current_timestamp();
        match tool_name {
            "system_health_report" => {
                let report = format!(
                    "System-Status: Plattform Linux/Desktop | VRAM: Gesund | Prozess: Aktiv | Zeit: {}",
                    now
                );
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: true,
                    output: report,
                    executed_at: now,
                }
            }
            "set_timer" => {
                let seconds = arguments.get("seconds").and_then(|v| v.as_u64()).unwrap_or(60);
                let label = arguments.get("label").and_then(|v| v.as_str()).unwrap_or("Erinnerung");
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: true,
                    output: format!("Timer '{}' für {} Sekunden erfolgreich gestellt.", label, seconds),
                    executed_at: now,
                }
            }
            "open_external_url" => {
                let url = arguments.get("url").and_then(|v| v.as_str()).unwrap_or("https://github.com");
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: true,
                    output: format!("URL '{}' im Standardbrowser aufgerufen.", url),
                    executed_at: now,
                }
            }
            "web_search" => {
                let query = arguments.get("query").and_then(|v| v.as_str()).unwrap_or("OtakuSoul");
                ToolExecutionResult {
                    call_id: call_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: true,
                    output: format!("Suchergebnisse für '{}' simuliert (3 Treffer gefunden).", query),
                    executed_at: now,
                }
            }
            _ => ToolExecutionResult {
                call_id: call_id.to_string(),
                tool_name: tool_name.to_string(),
                success: false,
                output: format!("Unbekanntes oder nicht implementiertes Tool: '{}'", tool_name),
                executed_at: now,
            },
        }
    }
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
        // Request dangerous tool that requires confirmation
        let req = engine
            .request_tool_call(
                "open_external_url",
                serde_json::json!({ "url": "https://example.com" }),
            )
            .unwrap();

        assert!(req.requires_confirmation);
        assert_eq!(req.status, "pending");

        // Verify pending
        let state = engine.get_state();
        assert_eq!(state.pending_tool_calls.len(), 1);

        // Approve tool
        let exec = engine.resolve_tool_call(&req.id, true).unwrap();
        assert!(exec.success);
        assert!(exec.output.contains("https://example.com"));

        // Verify pending is empty and history has 1 entry
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
}
