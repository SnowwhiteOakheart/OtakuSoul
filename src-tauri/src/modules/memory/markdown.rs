//! MEMORY.md / USER.md rendering and parsing (bidirectional sync with the database).

use super::*;

/// Parsers for the MEMORY.md / USER.md sections, compiled once.
pub(super) static MD_HEADER_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^#{1,3}\s+(.+)$").expect("static regex is valid"));
pub(super) static MD_EMOTION_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r"(?i)-\s*\*\*Primary Emotion\*\*:\s*([^(]+?)(?:\s*\(Intensity:\s*(\d+)(?:/5)?\))?$",
    )
    .expect("static regex is valid")
});
pub(super) static MD_TENSION_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Psychological Tension\*\*:\s*(.+)$")
        .expect("static regex is valid")
});
pub(super) static MD_DECAY_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Emotional Decay Counter\*\*:\s*(\d+)")
        .expect("static regex is valid")
});
pub(super) static MD_AGENDA_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Active Agenda\*\*:\s*(.+)$").expect("static regex is valid")
});
pub(super) static MD_FOCUS_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Immediate Focus\*\*:\s*(.+)$").expect("static regex is valid")
});
pub(super) static MD_ROLE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Role in Story\*\*:\s*(.+)$").expect("static regex is valid")
});
pub(super) static MD_ATTR_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Known Attributes\*\*:\s*(.+)$").expect("static regex is valid")
});
pub(super) static MD_TRUST_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Trust Level\*\*:\s*(.+)$").expect("static regex is valid")
});
pub(super) static MD_DYN_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*(?:Dynamic Description|Current Dynamic)\*\*:\s*(.+)$")
        .expect("static regex is valid")
});
pub(super) static MD_TENSION_RE_2: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"(?i)-\s*\*\*Unspoken Tension\*\*:\s*(.+)$").expect("static regex is valid")
});

impl MemoryDb {
    // --- Markdown Rendering & Bidirectional Sync ---

    pub fn render_character_markdown(&self, char_id: &str) -> Result<String, rusqlite::Error> {
        let psych = self.get_or_create_psychology(char_id)?;
        let healing = self.get_healing_logs(char_id, 15)?;

        let mut lines = Vec::new();
        lines.push(format!("# SOUL CACHE: {}", char_id.to_uppercase()));
        lines.push("".to_string());
        lines.push("## CORE IDENTITY & UNBREAKABLE BELIEFS".to_string());
        for belief in &psych.core_identity {
            if !belief.trim().is_empty() {
                lines.push(format!("- {}", belief.trim()));
            }
        }

        lines.push("".to_string());
        lines.push("## INTERNAL STATE & PSYCHOLOGICAL MOMENTUM".to_string());
        lines.push(format!(
            "- **Primary Emotion**: {} (Intensity: {}/5)",
            psych.primary_emotion, psych.intensity
        ));
        lines.push(format!(
            "- **Psychological Tension**: {}",
            psych.psychological_tension
        ));
        lines.push(format!(
            "- **Emotional Decay Counter**: {}/3",
            psych.emotional_decay_counter
        ));

        lines.push("".to_string());
        lines.push("## COGNITIVE DRIVE & ACTIVE AGENDA".to_string());
        lines.push(format!("- **Active Agenda**: {}", psych.active_agenda));
        lines.push(format!("- **Immediate Focus**: {}", psych.immediate_focus));

        lines.push("".to_string());
        lines.push("## UNRESOLVED COGNITIVE DISSONANCE".to_string());
        lines.push(psych.cognitive_dissonance.clone());

        if !healing.is_empty() {
            lines.push("".to_string());
            lines.push("## RESOLVED CONTRADICTIONS (HEALING LOG)".to_string());
            for log in healing {
                lines.push(format!(
                    "- [{}] {}: {}",
                    log.created_at, log.action, log.details
                ));
            }
        }

        Ok(lines.join("\n"))
    }

    pub fn render_user_markdown(
        &self,
        char_id: &str,
        user_name: &str,
    ) -> Result<String, rusqlite::Error> {
        let rel = self.get_or_create_relationship(char_id, user_name)?;

        let mut lines = Vec::new();
        lines.push(format!(
            "# USER PROFILE & RELATIONSHIP MEMORY: {}",
            user_name.to_uppercase()
        ));
        lines.push("".to_string());
        lines.push("## USER IDENTITY & STATUS".to_string());
        lines.push(format!("- **Role in Story**: {}", rel.role_in_story));
        lines.push(format!("- **Known Attributes**: {}", rel.known_attributes));

        lines.push("".to_string());
        lines.push("## RELATIONSHIP METADATA".to_string());
        lines.push(format!("- **Trust Level**: {}", rel.trust_level));
        lines.push(format!(
            "- **Dynamic Description**: {}",
            rel.dynamic_description
        ));
        lines.push(format!("- **Unspoken Tension**: {}", rel.unspoken_tension));

        lines.push("".to_string());
        lines.push("## PREFERENCES & HABITS".to_string());
        for pref in &rel.preferences_habits {
            if !pref.trim().is_empty() {
                lines.push(format!("- {}", pref.trim()));
            }
        }

        lines.push("".to_string());
        lines.push("## SHARED MILESTONES & PROMISES".to_string());
        for m in &rel.shared_milestones {
            if !m.trim().is_empty() {
                lines.push(format!("- {}", m.trim()));
            }
        }

        Ok(lines.join("\n"))
    }

    pub fn parse_and_sync_character_markdown(&self, char_id: &str, md: &str) -> Result<(), String> {
        let conn = self.conn.lock();
        Self::parse_and_sync_character_markdown_on(&conn, char_id, md)
    }

    pub(super) fn parse_and_sync_character_markdown_on(
        conn: &Connection,
        char_id: &str,
        md: &str,
    ) -> Result<(), String> {
        let mut psych =
            Self::get_or_create_psychology_on(conn, char_id).map_err(|e| e.to_string())?;

        let mut section: Option<&str> = None;
        let mut core_identity = Vec::new();
        let mut cognitive_dissonance_lines = Vec::new();

        let header_re = &*MD_HEADER_RE;
        let emotion_re = &*MD_EMOTION_RE;
        let tension_re = &*MD_TENSION_RE;
        let decay_re = &*MD_DECAY_RE;
        let agenda_re = &*MD_AGENDA_RE;
        let focus_re = &*MD_FOCUS_RE;

        for raw_line in md.lines() {
            let line = raw_line.trim();
            if let Some(caps) = header_re.captures(line) {
                let title = caps[1].to_uppercase();
                if title.contains("CORE IDENTITY") || title.contains("BELIEFS") {
                    section = Some("identity");
                } else if title.contains("INTERNAL STATE") {
                    section = Some("state");
                } else if title.contains("COGNITIVE DRIVE") || title.contains("ACTIVE AGENDA") {
                    section = Some("drive");
                } else if title.contains("UNRESOLVED COGNITIVE") || title.contains("DISSONANCE") {
                    section = Some("dissonance");
                } else if title.contains("RESOLVED CONTRADICTIONS") || title.contains("HEALING") {
                    section = Some("healing");
                } else {
                    section = None;
                }
                continue;
            }

            if line.is_empty() {
                continue;
            }

            match section {
                Some("identity") => {
                    if line.starts_with('-') || line.starts_with('*') {
                        let item = line.trim_start_matches(['-', '*', ' ']).trim();
                        if !item.is_empty() {
                            core_identity.push(item.to_string());
                        }
                    }
                }
                Some("state") => {
                    if let Some(caps) = emotion_re.captures(line) {
                        let em = caps[1].trim();
                        if !em.is_empty() {
                            psych.primary_emotion = em.to_string();
                        }
                        if let Some(int_m) = caps.get(2)
                            && let Ok(v) = int_m.as_str().parse::<u32>()
                        {
                            psych.intensity = v.clamp(1, 5);
                        }
                    } else if let Some(caps) = tension_re.captures(line) {
                        psych.psychological_tension = caps[1].trim().to_string();
                    } else if let Some(caps) = decay_re.captures(line)
                        && let Ok(v) = caps[1].parse::<u32>()
                    {
                        psych.emotional_decay_counter = v;
                    }
                }
                Some("drive") => {
                    if let Some(caps) = agenda_re.captures(line) {
                        psych.active_agenda = caps[1].trim().to_string();
                    } else if let Some(caps) = focus_re.captures(line) {
                        psych.immediate_focus = caps[1].trim().to_string();
                    }
                }
                Some("dissonance") => {
                    let cleaned = line.trim_start_matches(['-', '*', ' ']).trim();
                    if !cleaned.is_empty() {
                        cognitive_dissonance_lines.push(cleaned.to_string());
                    }
                }
                _ => {}
            }
        }

        if !core_identity.is_empty() {
            psych.core_identity = core_identity;
        }
        if !cognitive_dissonance_lines.is_empty() {
            psych.cognitive_dissonance = cognitive_dissonance_lines.join("\n");
        }

        Self::update_psychology_on(conn, char_id, &psych).map_err(|e| e.to_string())
    }

    pub fn parse_and_sync_user_markdown(
        &self,
        char_id: &str,
        user_name: &str,
        md: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock();
        Self::parse_and_sync_user_markdown_on(&conn, char_id, user_name, md)
    }

    pub(super) fn parse_and_sync_user_markdown_on(
        conn: &Connection,
        char_id: &str,
        user_name: &str,
        md: &str,
    ) -> Result<(), String> {
        let mut rel = Self::get_or_create_relationship_on(conn, char_id, user_name)
            .map_err(|e| e.to_string())?;

        let mut section: Option<&str> = None;
        let mut prefs = Vec::new();
        let mut milestones = Vec::new();

        let header_re = &*MD_HEADER_RE;
        let role_re = &*MD_ROLE_RE;
        let attr_re = &*MD_ATTR_RE;
        let trust_re = &*MD_TRUST_RE;
        let dyn_re = &*MD_DYN_RE;
        let tension_re = &*MD_TENSION_RE_2;

        for raw_line in md.lines() {
            let line = raw_line.trim();
            if let Some(caps) = header_re.captures(line) {
                let title = caps[1].to_uppercase();
                if title.contains("USER IDENTITY") {
                    section = Some("identity");
                } else if title.contains("RELATIONSHIP") {
                    section = Some("relationship");
                } else if title.contains("PREFERENCES") || title.contains("HABITS") {
                    section = Some("prefs");
                } else if title.contains("MILESTONES") || title.contains("PROMISES") {
                    section = Some("milestones");
                } else {
                    section = None;
                }
                continue;
            }

            if line.is_empty() {
                continue;
            }

            match section {
                Some("identity") => {
                    if let Some(caps) = role_re.captures(line) {
                        rel.role_in_story = caps[1].trim().to_string();
                    } else if let Some(caps) = attr_re.captures(line) {
                        rel.known_attributes = caps[1].trim().to_string();
                    }
                }
                Some("relationship") => {
                    if let Some(caps) = trust_re.captures(line) {
                        rel.trust_level = caps[1].trim().to_string();
                    } else if let Some(caps) = dyn_re.captures(line) {
                        rel.dynamic_description = caps[1].trim().to_string();
                    } else if let Some(caps) = tension_re.captures(line) {
                        rel.unspoken_tension = caps[1].trim().to_string();
                    }
                }
                Some("prefs") => {
                    if line.starts_with('-') || line.starts_with('*') {
                        let item = line.trim_start_matches(['-', '*', ' ']).trim();
                        if !item.is_empty() {
                            prefs.push(item.to_string());
                        }
                    }
                }
                Some("milestones") if (line.starts_with('-') || line.starts_with('*')) => {
                    let item = line.trim_start_matches(['-', '*', ' ']).trim();
                    if !item.is_empty() {
                        milestones.push(item.to_string());
                    }
                }
                _ => {}
            }
        }

        if !prefs.is_empty() {
            rel.preferences_habits = prefs;
        }
        if !milestones.is_empty() {
            rel.shared_milestones = milestones;
        }

        Self::update_relationship_on(conn, char_id, &rel).map_err(|e| e.to_string())
    }
}
