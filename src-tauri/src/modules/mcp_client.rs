use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub transport: String, // "stdio" | "http" | "sse"
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub url: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub server_id: String,
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompanionPlugin {
    pub id: String,
    pub name: String,
    pub description: String,
    pub command: String,
    pub args: Vec<String>,
    pub requires_approval: bool,
    pub parameters_schema: serde_json::Value,
}

pub struct McpManager {
    servers_file: PathBuf,
    plugins_dir: PathBuf,
    cached_servers: RwLock<Vec<McpServerConfig>>,
}

impl McpManager {
    pub fn new(data_dir: &Path) -> Self {
        let companion_dir = data_dir.join("companion");
        let _ = std::fs::create_dir_all(&companion_dir);
        let plugins_dir = companion_dir.join("plugins");
        let _ = std::fs::create_dir_all(&plugins_dir);
        let servers_file = companion_dir.join("mcp_servers.json");

        let initial_servers = if servers_file.exists() {
            match std::fs::read_to_string(&servers_file) {
                Ok(content) => {
                    serde_json::from_str(&content).unwrap_or_else(|_| Self::default_servers())
                }
                Err(_) => Self::default_servers(),
            }
        } else {
            let defaults = Self::default_servers();
            if let Ok(serialized) = serde_json::to_string_pretty(&defaults) {
                let _ = std::fs::write(&servers_file, serialized);
            }
            defaults
        };

        Self {
            servers_file,
            plugins_dir,
            cached_servers: RwLock::new(initial_servers),
        }
    }

    fn default_servers() -> Vec<McpServerConfig> {
        vec![
            McpServerConfig {
                id: "filesystem".to_string(),
                name: "Filesystem MCP".to_string(),
                transport: "stdio".to_string(),
                command: Some("npx".to_string()),
                args: Some(vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-filesystem".to_string(),
                    "/home/deathtrap/development".to_string(),
                ]),
                env: None,
                url: None,
                enabled: false,
            },
            McpServerConfig {
                id: "brave-search".to_string(),
                name: "Brave Search MCP".to_string(),
                transport: "stdio".to_string(),
                command: Some("npx".to_string()),
                args: Some(vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-brave-search".to_string(),
                ]),
                env: Some(HashMap::from([(
                    "BRAVE_API_KEY".to_string(),
                    "".to_string(),
                )])),
                url: None,
                enabled: false,
            },
        ]
    }

    pub fn list_servers(&self) -> Vec<McpServerConfig> {
        self.cached_servers.read().unwrap().clone()
    }

    pub fn save_servers(&self, servers: Vec<McpServerConfig>) -> Result<(), String> {
        let serialized = serde_json::to_string_pretty(&servers)
            .map_err(|e| crate::err!("backend.mcp.serialize", error = e))?;
        std::fs::write(&self.servers_file, serialized).map_err(|e| {
            crate::err!(
                "backend.common.fileWritePath",
                path = format!("{:?}", self.servers_file),
                error = e
            )
        })?;
        *self.cached_servers.write().unwrap() = servers;
        Ok(())
    }

    pub fn toggle_server(&self, id: &str, enabled: bool) -> Result<Vec<McpServerConfig>, String> {
        let mut servers = self.list_servers();
        if let Some(srv) = servers.iter_mut().find(|s| s.id == id) {
            srv.enabled = enabled;
        }
        self.save_servers(servers)?;
        Ok(self.list_servers())
    }

    /// Query tools from an enabled stdio MCP server using JSON-RPC 2.0
    pub async fn fetch_server_tools(&self, server_id: &str) -> Result<Vec<McpToolInfo>, String> {
        let server = {
            let list = self.cached_servers.read().unwrap();
            list.iter().find(|s| s.id == server_id).cloned()
        };

        let server =
            server.ok_or_else(|| crate::err!("backend.mcp.serverMissing", id = server_id))?;
        if !server.enabled {
            return Ok(Vec::new());
        }

        if server.transport == "stdio" {
            let cmd_str = server.command.as_deref().unwrap_or("npx");
            let args = server.args.unwrap_or_default();

            let mut child = Command::new(cmd_str)
                .args(&args)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .spawn()
                .map_err(|e| {
                    format!(
                        "MCP Server-Prozess '{}' konnte nicht gestartet werden: {}",
                        cmd_str, e
                    )
                })?;

            let mut stdin = child.stdin.take().ok_or("Konnte stdin nicht öffnen.")?;
            let stdout = child.stdout.take().ok_or("Konnte stdout nicht öffnen.")?;
            let mut reader = BufReader::new(stdout).lines();

            // 1. Initialize Request
            let init_req = serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": { "name": "OtakuSoul", "version": "0.1.0" }
                }
            });

            stdin
                .write_all(format!("{}\n", init_req).as_bytes())
                .await
                .map_err(|e| crate::err!("backend.mcp.sendInitialize", error = e))?;

            // Read initialize response
            let _ =
                tokio::time::timeout(std::time::Duration::from_secs(4), reader.next_line()).await;

            // 2. tools/list Request
            let tools_req = serde_json::json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list",
                "params": {}
            });

            stdin
                .write_all(format!("{}\n", tools_req).as_bytes())
                .await
                .map_err(|e| crate::err!("backend.mcp.sendToolsList", error = e))?;

            let line_res =
                tokio::time::timeout(std::time::Duration::from_secs(5), reader.next_line()).await;
            let _ = child.kill().await;

            if let Ok(Ok(Some(line))) = line_res
                && let Ok(val) = serde_json::from_str::<serde_json::Value>(&line)
                && let Some(tools_arr) = val.pointer("/result/tools").and_then(|v| v.as_array())
            {
                let mut result = Vec::new();
                for t in tools_arr {
                    result.push(McpToolInfo {
                        server_id: server_id.to_string(),
                        name: t
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        description: t
                            .get("description")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        input_schema: t
                            .get("inputSchema")
                            .cloned()
                            .unwrap_or(serde_json::json!({})),
                    });
                }
                return Ok(result);
            }
        }

        Ok(Vec::new())
    }

    /// Execute a tool on an MCP server via JSON-RPC 2.0
    pub async fn call_mcp_tool(
        &self,
        server_id: &str,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> Result<String, String> {
        let server = {
            let list = self.cached_servers.read().unwrap();
            list.iter().find(|s| s.id == server_id).cloned()
        };

        let server =
            server.ok_or_else(|| crate::err!("backend.mcp.serverMissing", id = server_id))?;
        let cmd_str = server.command.as_deref().unwrap_or("npx");
        let args = server.args.unwrap_or_default();

        let mut child = Command::new(cmd_str)
            .args(&args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| crate::err!("backend.mcp.process", command = cmd_str, error = e))?;

        let mut stdin = child.stdin.take().ok_or("Konnte stdin nicht öffnen.")?;
        let stdout = child.stdout.take().ok_or("Konnte stdout nicht öffnen.")?;
        let mut reader = BufReader::new(stdout).lines();

        // 1. Initialize
        let init_req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": { "name": "OtakuSoul", "version": "0.1.0" }
            }
        });
        stdin
            .write_all(format!("{}\n", init_req).as_bytes())
            .await
            .map_err(|e| crate::err!("backend.mcp.sendInitialize", error = e))?;
        let _ = tokio::time::timeout(std::time::Duration::from_secs(4), reader.next_line()).await;

        // 2. Call tool
        let call_req = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        });

        stdin
            .write_all(format!("{}\n", call_req).as_bytes())
            .await
            .map_err(|e| crate::err!("backend.mcp.sendToolsCall", error = e))?;

        let line_res =
            tokio::time::timeout(std::time::Duration::from_secs(20), reader.next_line()).await;
        let _ = child.kill().await;

        match line_res {
            Ok(Ok(Some(line))) => {
                let val: serde_json::Value = serde_json::from_str(&line)
                    .map_err(|e| crate::err!("backend.mcp.invalidJson", error = e))?;
                if let Some(err) = val.get("error") {
                    return Err(crate::err!("backend.mcp.error", error = err));
                }
                if let Some(content) = val.pointer("/result/content") {
                    return Ok(serde_json::to_string_pretty(content)
                        .unwrap_or_else(|_| content.to_string()));
                }
                Ok(line)
            }
            Ok(Ok(None)) => Err(crate::err!("backend.mcp.closed")),
            Ok(Err(e)) => Err(crate::err!("backend.mcp.readResponse", error = e)),
            Err(_) => Err(crate::err!("backend.mcp.timeout")),
        }
    }

    /// List user-installed companion plugins
    pub fn list_plugins(&self) -> Vec<CompanionPlugin> {
        let mut plugins = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&self.plugins_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json")
                    && let Ok(content) = std::fs::read_to_string(&path)
                    && let Ok(plugin) = serde_json::from_str::<CompanionPlugin>(&content)
                {
                    plugins.push(plugin);
                }
            }
        }
        plugins
    }

    /// Save or register a companion plugin
    pub fn save_plugin(&self, plugin: CompanionPlugin) -> Result<(), String> {
        let path = self.plugins_dir.join(format!("{}.json", plugin.id));
        let serialized = serde_json::to_string_pretty(&plugin)
            .map_err(|e| crate::err!("backend.mcp.pluginSerialize", error = e))?;
        std::fs::write(&path, serialized)
            .map_err(|e| crate::err!("backend.mcp.pluginWrite", error = e))?;
        Ok(())
    }

    /// Execute a plugin tool
    pub async fn execute_plugin(
        &self,
        plugin_id: &str,
        args: serde_json::Value,
    ) -> Result<String, String> {
        let plugins = self.list_plugins();
        let plugin = plugins
            .into_iter()
            .find(|p| p.id == plugin_id)
            .ok_or_else(|| crate::err!("backend.mcp.pluginMissing", id = plugin_id))?;

        let args_str = serde_json::to_string(&args).unwrap_or_default();
        let output = Command::new(&plugin.command)
            .args(&plugin.args)
            .env("PLUGIN_ARGUMENTS", args_str)
            .output()
            .await
            .map_err(|e| {
                crate::err!(
                    "backend.mcp.pluginCommand",
                    command = plugin.command,
                    error = e
                )
            })?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if output.status.success() {
            Ok(if stdout.is_empty() {
                "Plugin erfolgreich ausgeführt (keine Ausgabe).".to_string()
            } else {
                stdout
            })
        } else {
            Err(crate::err!(
                "backend.mcp.pluginExit",
                code = output.status.code().unwrap_or(-1),
                stdout = stdout,
                stderr = stderr
            ))
        }
    }
}
