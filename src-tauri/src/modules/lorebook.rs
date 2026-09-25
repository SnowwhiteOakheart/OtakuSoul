use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LorebookEntry {
    pub uid: Option<u64>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub key: Vec<String>,
    #[serde(default)]
    pub exclude_key: Vec<String>,
    pub content: String,
    #[serde(default = "default_trigger")]
    pub trigger_type: String,
    pub probability: Option<u32>,
    pub injection_behavior: Option<String>,
}

fn default_trigger() -> String {
    "keyword".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Lorebook {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub entries: Vec<LorebookEntry>,
}

impl Lorebook {
    pub fn load_from_file(path: &Path) -> Result<Self, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Fehler beim Laden des Lorebooks {:?}: {}", path, e))?;

        serde_json::from_str::<Lorebook>(&content)
            .map_err(|e| format!("Fehler beim Parsen des Lorebooks {:?}: {}", path, e))
    }

    /// Evaluates which entries should be injected based on text context (case-insensitive keyword matching)
    pub fn scan_and_activate(&self, context: &str) -> Vec<LorebookEntry> {
        let lower_context = context.to_lowercase();
        let mut activated = Vec::new();

        for entry in &self.entries {
            // Check exclude keys first
            let is_excluded = entry.exclude_key.iter().any(|k| {
                let trimmed = k.trim().to_lowercase();
                !trimmed.is_empty() && lower_context.contains(&trimmed)
            });

            if is_excluded {
                continue;
            }

            // Always-on entries are injected unconditionally
            if entry.trigger_type.to_lowercase() == "always_on" || entry.key.is_empty() {
                activated.push(entry.clone());
                continue;
            }

            // Check if any trigger key is present in context
            let is_matched = entry.key.iter().any(|k| {
                let trimmed = k.trim().to_lowercase();
                !trimmed.is_empty() && lower_context.contains(&trimmed)
            });

            if is_matched {
                activated.push(entry.clone());
            }
        }

        activated
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lorebook_matching() {
        let path = Path::new("/home/deathtrap/development/Soul-of-Waifu-linux/presets/sakura-succubus-3/lorebooks/sakura-succubus-3-welt.json");
        if path.exists() {
            let lorebook = Lorebook::load_from_file(path).expect("Failed to load lorebook");
            assert_eq!(lorebook.name, "Sakura Succubus 3 – Welt");

            // Test context mentioning "Duft" and "Portal"
            let context = "Der Duft von Hiroki ist sehr intensiv, während wir vor dem Portal stehen.";
            let activated = lorebook.scan_and_activate(context);

            // Should activate:
            // 1. "Grundlage der Welt" (always_on)
            // 2. "Hirokis Duft" (keyword "Duft")
            // 3. "Das Sukkuben-Reich" (keyword "Portal")
            println!("Activated {} lore entries for context", activated.len());
            assert!(activated.len() >= 3);
            let names: Vec<String> = activated.iter().map(|e| e.name.clone()).collect();
            println!("Activated entries: {:?}", names);
        }
    }
}

