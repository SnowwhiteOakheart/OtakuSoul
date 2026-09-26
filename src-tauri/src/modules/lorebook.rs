use rand::Rng;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

fn default_trigger() -> String {
    "keyword".to_string()
}

fn default_priority() -> i32 {
    10
}

fn default_true() -> bool {
    true
}

fn default_injection_behavior() -> String {
    "passive".to_string()
}

fn default_scan_depth() -> u32 {
    5
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LorebookEntry {
    pub uid: Option<u64>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub key: Vec<String>,
    #[serde(default)]
    pub secondary_keys: Vec<String>,
    #[serde(default)]
    pub exclude_key: Vec<String>,
    #[serde(default)]
    pub regex_keys: Vec<String>,
    pub content: String,
    #[serde(default = "default_trigger")]
    pub trigger_type: String, // "keyword", "regex", "always_on", "tension"
    pub probability: Option<u32>, // 0-100%
    #[serde(default = "default_priority")]
    pub priority: i32, // Higher numbers injected first
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_injection_behavior")]
    pub injection_behavior: String, // "passive" (lore context) or "active" (directive instruction)
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub match_whole_words: bool,
    #[serde(default)]
    pub chain_requires: Vec<String>, // Names or UIDs required
    #[serde(default)]
    pub chain_activates: Vec<String>, // Names or UIDs force-activated
    #[serde(default)]
    pub tension_threshold: Option<u32>, // Triggers when scene tension >= threshold
}

impl Default for LorebookEntry {
    fn default() -> Self {
        Self {
            uid: None,
            name: String::new(),
            key: Vec::new(),
            secondary_keys: Vec::new(),
            exclude_key: Vec::new(),
            regex_keys: Vec::new(),
            content: String::new(),
            trigger_type: default_trigger(),
            probability: Some(100),
            priority: default_priority(),
            enabled: true,
            injection_behavior: default_injection_behavior(),
            case_sensitive: false,
            match_whole_words: false,
            chain_requires: Vec::new(),
            chain_activates: Vec::new(),
            tension_threshold: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Lorebook {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_scan_depth")]
    pub scan_depth: u32,
    #[serde(default)]
    pub is_global: bool,
    #[serde(default)]
    pub file_path: Option<String>,
    #[serde(default)]
    pub entries: Vec<LorebookEntry>,
}

impl Default for Lorebook {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            description: String::new(),
            scan_depth: default_scan_depth(),
            is_global: false,
            file_path: None,
            entries: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EvaluatedLoreResult {
    pub passive_entries: Vec<LorebookEntry>,
    pub active_entries: Vec<LorebookEntry>,
    pub activated_entry_names: Vec<String>,
    pub triggered_tension_events: Vec<String>,
    pub new_tension: u32,
}

impl Lorebook {
    pub fn load_from_file(path: &Path) -> Result<Self, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| format!("Fehler beim Laden des Lorebooks {:?}: {}", path, e))?;

        let mut book = Self::import_from_json_string(&content, path.file_stem().and_then(|s| s.to_str()))?;
        book.file_path = Some(path.to_string_lossy().to_string());
        if book.id.is_empty() {
            book.id = path
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "lorebook".to_string());
        }
        Ok(book)
    }

    pub fn save_to_file(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let json_str = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Fehler beim Serialisieren des Lorebooks: {}", e))?;
        fs::write(path, json_str)
            .map_err(|e| format!("Fehler beim Schreiben des Lorebooks {:?}: {}", path, e))
    }

    /// Import JSON that can be standard OtakuSoul format, or SillyTavern format with entries array or map
    pub fn import_from_json_string(content: &str, fallback_name: Option<&str>) -> Result<Self, String> {
        let val: serde_json::Value = serde_json::from_str(content)
            .map_err(|e| format!("Ungültiges JSON-Format für Lorebook: {}", e))?;

        let mut name = val
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(fallback_name.unwrap_or("Neues Lorebook"))
            .to_string();
        if name.trim().is_empty() {
            name = fallback_name.unwrap_or("Neues Lorebook").to_string();
        }

        let description = val
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let scan_depth = val
            .get("scan_depth")
            .or_else(|| val.get("n_depth"))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32)
            .unwrap_or_else(default_scan_depth);

        let is_global = val
            .get("is_global")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let id = val
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let mut parsed_entries = Vec::new();

        if let Some(entries_val) = val.get("entries") {
            if let Some(arr) = entries_val.as_array() {
                for item in arr {
                    if let Ok(entry) = serde_json::from_value::<LorebookEntry>(item.clone()) {
                        parsed_entries.push(entry);
                    } else if let Some(entry) = Self::parse_sillytavern_entry(item) {
                        parsed_entries.push(entry);
                    }
                }
            } else if let Some(map) = entries_val.as_object() {
                // SillyTavern dictionary of entries keyed by index or UID
                for (_k, item) in map {
                    if let Ok(entry) = serde_json::from_value::<LorebookEntry>(item.clone()) {
                        parsed_entries.push(entry);
                    } else if let Some(entry) = Self::parse_sillytavern_entry(item) {
                        parsed_entries.push(entry);
                    }
                }
            }
        }

        Ok(Lorebook {
            id,
            name,
            description,
            scan_depth,
            is_global,
            file_path: None,
            entries: parsed_entries,
        })
    }

    fn parse_sillytavern_entry(val: &serde_json::Value) -> Option<LorebookEntry> {
        let name = val
            .get("comment")
            .or_else(|| val.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("Eintrag")
            .to_string();

        let content = val
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let uid = val.get("uid").and_then(|v| v.as_u64());

        let extract_str_vec = |key: &str| -> Vec<String> {
            val.get(key)
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default()
        };

        let key = extract_str_vec("key");
        let secondary_keys = extract_str_vec("secondary_keys");
        let exclude_key = extract_str_vec("exclude_key");
        let regex_keys = extract_str_vec("regex_keys");

        let trigger_type = val
            .get("trigger_type")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| {
                if val.get("constant").and_then(|v| v.as_bool()).unwrap_or(false) {
                    "always_on"
                } else {
                    "keyword"
                }
            })
            .to_string();

        let probability = val
            .get("probability")
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);

        let priority = val
            .get("priority")
            .or_else(|| val.get("order"))
            .and_then(|v| v.as_i64())
            .map(|v| v as i32)
            .unwrap_or_else(default_priority);

        let enabled = val
            .get("enabled")
            .and_then(|v| v.as_bool())
            .or_else(|| {
                val.get("disable").and_then(|d| d.as_bool().map(|b| !b))
            })
            .unwrap_or(true);

        let injection_behavior = val
            .get("injection_behavior")
            .or_else(|| val.get("position"))
            .and_then(|v| v.as_str())
            .unwrap_or("passive")
            .to_string();

        let case_sensitive = val
            .get("case_sensitive")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let match_whole_words = val
            .get("match_whole_words")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        Some(LorebookEntry {
            uid,
            name,
            key,
            secondary_keys,
            exclude_key,
            regex_keys,
            content,
            trigger_type,
            probability,
            priority,
            enabled,
            injection_behavior,
            case_sensitive,
            match_whole_words,
            chain_requires: Vec::new(),
            chain_activates: Vec::new(),
            tension_threshold: None,
        })
    }

    /// Backwards compatible simple scan
    pub fn scan_and_activate(&self, context: &str) -> Vec<LorebookEntry> {
        let res = evaluate_lorebooks(&[self.clone()], context, 0);
        let mut all = res.passive_entries;
        all.extend(res.active_entries);
        all
    }
}

/// Helper to check if a keyword matches context considering case and word boundary settings
fn matches_keyword(context: &str, keyword: &str, case_sensitive: bool, whole_words: bool) -> bool {
    let kw = keyword.trim();
    if kw.is_empty() {
        return false;
    }

    if whole_words {
        let pattern = if case_sensitive {
            format!(r"\b{}\b", regex::escape(kw))
        } else {
            format!(r"(?i)\b{}\b", regex::escape(kw))
        };
        if let Ok(re) = Regex::new(&pattern) {
            return re.is_match(context);
        }
    }

    if case_sensitive {
        context.contains(kw)
    } else {
        context.to_lowercase().contains(&kw.to_lowercase())
    }
}

/// Evaluates multiple lorebooks (e.g. character bound + global) against context and scene tension
pub fn evaluate_lorebooks(
    lorebooks: &[Lorebook],
    context: &str,
    current_tension: u32,
) -> EvaluatedLoreResult {
    let mut candidate_entries: Vec<LorebookEntry> = Vec::new();
    let mut triggered_tension_events = Vec::new();
    let mut new_tension = current_tension;

    // Collect all entries across all active lorebooks
    for lb in lorebooks {
        for entry in &lb.entries {
            if !entry.enabled {
                continue;
            }
            candidate_entries.push(entry.clone());
        }
    }

    let mut initially_activated: Vec<LorebookEntry> = Vec::new();
    let mut rng = rand::thread_rng();

    for entry in &candidate_entries {
        // 1. Check exclude keys first (NOT logic)
        let is_excluded = entry.exclude_key.iter().any(|ex| {
            matches_keyword(context, ex, entry.case_sensitive, entry.match_whole_words)
        });
        if is_excluded {
            continue;
        }

        // 2. Check tension threshold (Tension Event Trigger)
        if let Some(threshold) = entry.tension_threshold {
            if threshold > 0 && current_tension >= threshold {
                // Tension event triggered!
                triggered_tension_events.push(entry.name.clone());
                // Release tension by 25 points per triggered event
                new_tension = new_tension.saturating_sub(25);
                initially_activated.push(entry.clone());
                continue;
            }
        }

        // 3. Always-on trigger
        let trigger_lower = entry.trigger_type.to_lowercase();
        if trigger_lower == "always_on" || (entry.key.is_empty() && entry.regex_keys.is_empty() && entry.trigger_type != "tension") {
            if let Some(prob) = entry.probability {
                if prob < 100 && rng.gen_range(1..=100) > prob {
                    continue;
                }
            }
            initially_activated.push(entry.clone());
            continue;
        }

        // 4. Regex keys matching
        let mut regex_matched = false;
        for pattern in &entry.regex_keys {
            let pat_str = pattern.trim();
            if pat_str.is_empty() {
                continue;
            }
            let re_res = if entry.case_sensitive {
                Regex::new(pat_str)
            } else {
                Regex::new(&format!("(?i){}", pat_str))
            };
            if let Ok(re) = re_res {
                if re.is_match(context) {
                    regex_matched = true;
                    break;
                }
            }
        }

        // 5. Keyword matching (Primary OR logic)
        let primary_matched = entry.key.iter().any(|k| {
            matches_keyword(context, k, entry.case_sensitive, entry.match_whole_words)
        });

        let mut matched = regex_matched || primary_matched;

        // 6. Secondary keys check (AND logic: must match at least one secondary key if list is not empty)
        if matched && !entry.secondary_keys.is_empty() {
            let secondary_matched = entry.secondary_keys.iter().any(|sk| {
                matches_keyword(context, sk, entry.case_sensitive, entry.match_whole_words)
            });
            if !secondary_matched {
                matched = false;
            }
        }

        // 7. Probability roll
        if matched {
            if let Some(prob) = entry.probability {
                if prob < 100 && rng.gen_range(1..=100) > prob {
                    continue;
                }
            }
            initially_activated.push(entry.clone());
        }
    }

    // 8. Resolve Chain Dependencies
    // Map entries by name and UID for lookup
    let mut name_to_entry: HashMap<String, LorebookEntry> = HashMap::new();
    let mut uid_to_entry: HashMap<u64, LorebookEntry> = HashMap::new();
    for entry in &candidate_entries {
        name_to_entry.insert(entry.name.to_lowercase(), entry.clone());
        if let Some(u) = entry.uid {
            uid_to_entry.insert(u, entry.clone());
        }
    }

    // 8a. Chain Activates (force-activate downstream entries)
    let mut active_names: HashSet<String> = initially_activated
        .iter()
        .map(|e| e.name.to_lowercase())
        .collect();
    let mut active_uids: HashSet<u64> = initially_activated
        .iter()
        .filter_map(|e| e.uid)
        .collect();

    let mut chained_additions = Vec::new();
    for entry in &initially_activated {
        for target in &entry.chain_activates {
            let t_lower = target.trim().to_lowercase();
            if let Some(target_entry) = name_to_entry.get(&t_lower) {
                if !active_names.contains(&t_lower) {
                    chained_additions.push(target_entry.clone());
                    active_names.insert(t_lower.clone());
                    if let Some(u) = target_entry.uid {
                        active_uids.insert(u);
                    }
                }
            } else if let Ok(uid_num) = target.trim().parse::<u64>() {
                if let Some(target_entry) = uid_to_entry.get(&uid_num) {
                    if !active_uids.contains(&uid_num) {
                        chained_additions.push(target_entry.clone());
                        active_uids.insert(uid_num);
                        active_names.insert(target_entry.name.to_lowercase());
                    }
                }
            }
        }
    }
    initially_activated.extend(chained_additions);

    // 8b. Chain Requires (filter out entries whose prerequisites are missing)
    let final_activated: Vec<LorebookEntry> = initially_activated
        .into_iter()
        .filter(|entry| {
            if entry.chain_requires.is_empty() {
                return true;
            }
            // All required keys must be active
            entry.chain_requires.iter().all(|req| {
                let req_lower = req.trim().to_lowercase();
                if active_names.contains(&req_lower) {
                    return true;
                }
                if let Ok(uid_num) = req.trim().parse::<u64>() {
                    if active_uids.contains(&uid_num) {
                        return true;
                    }
                }
                false
            })
        })
        .collect();

    // 9. Deduplicate by UID / Name (keeping highest priority)
    let mut deduped_map: HashMap<String, LorebookEntry> = HashMap::new();
    for entry in final_activated {
        let key = if let Some(uid) = entry.uid {
            format!("uid_{}", uid)
        } else {
            format!("name_{}", entry.name.to_lowercase())
        };

        if let Some(existing) = deduped_map.get(&key) {
            if entry.priority > existing.priority {
                deduped_map.insert(key, entry);
            }
        } else {
            deduped_map.insert(key, entry);
        }
    }

    let mut sorted_entries: Vec<LorebookEntry> = deduped_map.into_values().collect();
    // Sort by priority descending (higher numbers first)
    sorted_entries.sort_by(|a, b| b.priority.cmp(&a.priority));

    let activated_entry_names: Vec<String> = sorted_entries.iter().map(|e| e.name.clone()).collect();

    // 10. Split into Passive and Active/Directive entries
    let mut passive_entries = Vec::new();
    let mut active_entries = Vec::new();

    for entry in sorted_entries {
        if entry.injection_behavior.to_lowercase() == "active"
            || entry.injection_behavior.to_lowercase() == "directive"
        {
            active_entries.push(entry);
        } else {
            passive_entries.push(entry);
        }
    }

    EvaluatedLoreResult {
        passive_entries,
        active_entries,
        activated_entry_names,
        triggered_tension_events,
        new_tension,
    }
}

/// Discovers all lorebooks from user lorebooks dir and bundled presets
pub fn list_all_lorebooks(user_lorebooks_dir: &Path, presets_dir: &Path) -> Vec<Lorebook> {
    let mut books = Vec::new();
    let mut seen_ids = HashSet::new();

    // 1. Scan user lorebooks directory
    if user_lorebooks_dir.exists() {
        if let Ok(entries) = fs::read_dir(user_lorebooks_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) == Some("json") {
                    if let Ok(book) = Lorebook::load_from_file(&path) {
                        if !seen_ids.contains(&book.id) {
                            seen_ids.insert(book.id.clone());
                            books.push(book);
                        }
                    }
                }
            }
        }
    }

    // 2. Scan bundled presets directory
    if presets_dir.exists() {
        if let Ok(preset_dirs) = fs::read_dir(presets_dir) {
            for preset_entry in preset_dirs.flatten() {
                let lb_dir = preset_entry.path().join("lorebooks");
                if lb_dir.exists() {
                    if let Ok(lb_files) = fs::read_dir(lb_dir) {
                        for file_entry in lb_files.flatten() {
                            let path = file_entry.path();
                            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                                if let Ok(book) = Lorebook::load_from_file(&path) {
                                    if !seen_ids.contains(&book.id) {
                                        seen_ids.insert(book.id.clone());
                                        books.push(book);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    books.sort_by(|a, b| a.name.cmp(&b.name));
    books
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keyword_matching_with_word_boundaries() {
        // "er" inside "Wasser" should NOT match when match_whole_words = true
        let context = "Hier ist frisches Wasser aus der Quelle.";
        assert!(!matches_keyword(context, "er", false, true));
        // But should match when whole_words = false
        assert!(matches_keyword(context, "er", false, false));
        // "Wasser" should match in both cases
        assert!(matches_keyword(context, "Wasser", false, true));
    }

    #[test]
    fn test_secondary_keys_and_logic() {
        let mut entry = LorebookEntry::default();
        entry.name = "Alchemie-Labor".to_string();
        entry.key = vec!["Trank".to_string(), "Elixier".to_string()];
        entry.secondary_keys = vec!["Brauen".to_string(), "Kessel".to_string()];

        let book = Lorebook {
            id: "test".to_string(),
            name: "Test".to_string(),
            entries: vec![entry],
            ..Default::default()
        };

        // Context only has primary key "Trank" -> should NOT activate
        let res1 = evaluate_lorebooks(&[book.clone()], "Ich nehme einen roten Trank.", 0);
        assert!(res1.passive_entries.is_empty());

        // Context has primary "Trank" AND secondary "Kessel" -> SHOULD activate
        let res2 = evaluate_lorebooks(
            &[book.clone()],
            "Ich bereite den Trank im großen Kessel zu.",
            0,
        );
        assert_eq!(res2.passive_entries.len(), 1);
        assert_eq!(res2.passive_entries[0].name, "Alchemie-Labor");
    }

    #[test]
    fn test_regex_and_exclude_keys() {
        let mut entry = LorebookEntry::default();
        entry.name = "Drachenkunde".to_string();
        entry.regex_keys = vec![r"\b(Drache|Wyrm|Lindwurm)\b".to_string()];
        entry.exclude_key = vec!["Friedlich".to_string()];

        let book = Lorebook {
            id: "test".to_string(),
            name: "Test".to_string(),
            entries: vec![entry],
            ..Default::default()
        };

        // Matches regex "Drache"
        let res1 = evaluate_lorebooks(&[book.clone()], "Ein riesiger Drache kreist am Himmel!", 0);
        assert_eq!(res1.passive_entries.len(), 1);

        // Matches regex "Drache" BUT has exclude key "Friedlich" -> excluded
        let res2 = evaluate_lorebooks(
            &[book],
            "Ein Drache, der aber friedlich neben uns schläft.",
            0,
        );
        assert!(res2.passive_entries.is_empty());
    }

    #[test]
    fn test_tension_accumulator_trigger() {
        let mut entry = LorebookEntry::default();
        entry.name = "Plötzlicher Überfall".to_string();
        entry.trigger_type = "tension".to_string();
        entry.tension_threshold = Some(70);

        let book = Lorebook {
            id: "test".to_string(),
            name: "Test".to_string(),
            entries: vec![entry],
            ..Default::default()
        };

        // Tension 50 < 70 -> no trigger
        let res1 = evaluate_lorebooks(&[book.clone()], "Es ist ruhig im Wald.", 50);
        assert_eq!(res1.triggered_tension_events.len(), 0);
        assert_eq!(res1.new_tension, 50);

        // Tension 80 >= 70 -> triggers event and reduces tension!
        let res2 = evaluate_lorebooks(&[book], "Schritte nähern sich!", 80);
        assert_eq!(res2.triggered_tension_events.len(), 1);
        assert_eq!(res2.triggered_tension_events[0], "Plötzlicher Überfall");
        assert_eq!(res2.new_tension, 55); // 80 - 25 = 55
    }

    #[test]
    fn test_chain_dependencies() {
        let mut entry_a = LorebookEntry::default();
        entry_a.name = "Geheimgang".to_string();
        entry_a.key = vec!["Geheimgang".to_string()];
        entry_a.chain_activates = vec!["Schatzkammer".to_string()];

        let mut entry_b = LorebookEntry::default();
        entry_b.name = "Schatzkammer".to_string();
        entry_b.chain_requires = vec!["Geheimgang".to_string()];

        let book = Lorebook {
            id: "test".to_string(),
            name: "Test".to_string(),
            entries: vec![entry_a, entry_b],
            ..Default::default()
        };

        let res = evaluate_lorebooks(&[book], "Wir entdecken einen alten Geheimgang.", 0);
        assert_eq!(res.activated_entry_names.len(), 2);
        assert!(res.activated_entry_names.contains(&"Geheimgang".to_string()));
        assert!(res.activated_entry_names.contains(&"Schatzkammer".to_string()));
    }

    #[test]
    fn test_active_vs_passive_injection() {
        let mut entry_passive = LorebookEntry::default();
        entry_passive.name = "Weltgeschichte".to_string();
        entry_passive.key = vec!["Geschichte".to_string()];
        entry_passive.injection_behavior = "passive".to_string();

        let mut entry_active = LorebookEntry::default();
        entry_active.name = "Wichtige Verhaltensregel".to_string();
        entry_active.key = vec!["Regel".to_string()];
        entry_active.injection_behavior = "active".to_string();

        let book = Lorebook {
            id: "test".to_string(),
            name: "Test".to_string(),
            entries: vec![entry_passive, entry_active],
            ..Default::default()
        };

        let res = evaluate_lorebooks(&[book], "Kennst du die Geschichte und die Regel?", 0);
        assert_eq!(res.passive_entries.len(), 1);
        assert_eq!(res.passive_entries[0].name, "Weltgeschichte");
        assert_eq!(res.active_entries.len(), 1);
        assert_eq!(res.active_entries[0].name, "Wichtige Verhaltensregel");
    }
}
