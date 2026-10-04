//! Who speaks next: direct address by name, and an LLM routing call after every beat.

use super::*;

/// Words that put a following name into the vocative ("Hey Ayu", "Hör mal, Sora").
const ATTENTION_MARKERS: &str = "hey|hi|hallo|hör mal|hoer mal|sag mal|warte|okay|also|na|du|listen|wait|well|now|so|\
эй|послушай|подожди|окей|ну|итак|слушай|погоди|стой|слышишь";

/// The name `text` speaks to, if any: `Ayu, …`, `@Ayu`, `Hey Ayu`, `…, Ayu?`. With several
/// matches the one earliest in the text wins.
pub fn detect_direct_address(text: &str, names: &[String]) -> Option<String> {
    let text = text.trim();
    let mut best: Option<(usize, &String)> = None;
    for name in names.iter().filter(|n| !n.trim().is_empty()) {
        let n = regex::escape(name.trim());
        let patterns = [
            format!(r"(?i)^{n}[\s,!?.…:]"),
            format!(r"(?i)@{n}\b"),
            format!(r"(?i)\b(?:{ATTENTION_MARKERS}),?\s+{n}\b"),
            // ", Sora!" addresses Sora; ", Sora hat recht" only mentions him.
            format!(r"(?i),\s+{n}[,!?.…]"),
            format!(r"(?i),\s+{n}[!?.…]?$"),
            format!(r"(?i)^{n}$"),
        ];
        for pattern in patterns {
            if let Ok(re) = Regex::new(&pattern)
                && let Some(found) = re.find(text)
                && best.is_none_or(|(pos, _)| found.start() < pos)
            {
                best = Some((found.start(), name));
            }
        }
    }
    best.map(|(_, name)| name.clone())
}

/// Party members and present NPCs who can speak.
pub fn speaking_cast(state: &SceneState) -> Vec<String> {
    let mut cast = state.definition.party.clone();
    for npc in state
        .npcs
        .iter()
        .filter(|n| n.active && n.promoted_character_id.is_none())
    {
        if !cast.iter().any(|c| c.eq_ignore_ascii_case(&npc.name)) {
            cast.push(npc.name.clone());
        }
    }
    cast
}

/// Speakers of the last messages (oldest first), for fair spotlight.
pub fn recent_speakers(state: &SceneState, limit: usize) -> Vec<String> {
    let mut speakers: Vec<String> = state
        .chat_log
        .iter()
        .rev()
        .filter(|m| m.sender_role != "gm")
        .take(limit)
        .map(|m| m.sender_name.clone())
        .collect();
    speakers.reverse();
    speakers
}

pub fn routing_prompt(
    last_speaker: &str,
    last_text: &str,
    candidates: &[String],
    this_turn: &[String],
    recent: &[String],
) -> String {
    let short: String = last_text.chars().take(400).collect();
    format!(
        r#"[STAGE — ROUTING]
Your only job: decide who speaks next.

{last_speaker} just said: "{short}"

Who may speak: {candidates}, or PLAYER (the human player).
Already spoke this turn (in order): {this_turn}
Recent speakers (oldest → newest): {recent}

Rules, in this order:
1. Direct address: if {last_speaker} addressed someone by name, that person speaks next.
2. Unanswered question: route to whoever would naturally answer it; a question to the player means PLAYER.
3. Natural reaction: a surprising, emotional or threatening moment earns a reaction from someone present.
4. Do not let two characters ping-pong more than twice; characters who said their piece step back.
5. Fair spotlight: prefer someone who has not spoken in a while, unless a rule above applies.
6. When nothing calls for another voice, it is the PLAYER's turn.

Reply ONLY with JSON: {{"next_actor": "<name or PLAYER>"}}"#,
        candidates = candidates.join(", "),
        this_turn = if this_turn.is_empty() {
            "(nobody yet)".to_string()
        } else {
            this_turn.join(" → ")
        },
        recent = if recent.is_empty() {
            "(none)".to_string()
        } else {
            recent.join(", ")
        },
    )
}

/// The routed speaker: a known candidate, or `PLAYER` for anything else.
pub fn parse_routing(raw: &str, candidates: &[String]) -> Option<String> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    let value: serde_json::Value = serde_json::from_str(raw.get(start..=end)?).ok()?;
    let next = value.get("next_actor")?.as_str()?.trim();
    if next.eq_ignore_ascii_case("PLAYER") {
        return Some("PLAYER".to_string());
    }
    candidates
        .iter()
        .find(|c| c.eq_ignore_ascii_case(next))
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names() -> Vec<String> {
        vec!["Ayu Ikue".into(), "Sora".into(), "Shiro".into()]
    }

    #[test]
    fn detects_who_is_addressed() {
        assert_eq!(
            detect_direct_address("Sora, was meinst du?", &names()).as_deref(),
            Some("Sora")
        );
        assert_eq!(
            detect_direct_address("Hey Shiro wach auf", &names()).as_deref(),
            Some("Shiro")
        );
        assert_eq!(
            detect_direct_address("Hör mal, Ayu Ikue, ich brauche Hilfe", &names()).as_deref(),
            Some("Ayu Ikue")
        );
        assert_eq!(
            detect_direct_address("Was sagst du dazu, Sora?", &names()).as_deref(),
            Some("Sora")
        );
        assert_eq!(
            detect_direct_address("@shiro schau mal", &names()).as_deref(),
            Some("Shiro")
        );
        // Names that are only mentioned don't count.
        assert_eq!(
            detect_direct_address("Ich glaube, Sora hat recht.", &names()),
            None
        );
        // Earliest address wins.
        assert_eq!(
            detect_direct_address("Shiro, frag Sora, ob er mitkommt", &names()).as_deref(),
            Some("Shiro")
        );
    }

    #[test]
    fn parses_routing_answers() {
        assert_eq!(
            parse_routing(r#"{"next_actor": "sora"}"#, &names()).as_deref(),
            Some("Sora")
        );
        assert_eq!(
            parse_routing("Sure! {\"next_actor\":\"PLAYER\"}", &names()).as_deref(),
            Some("PLAYER")
        );
        assert_eq!(parse_routing(r#"{"next_actor": "Jibril"}"#, &names()), None);
        assert_eq!(parse_routing("no json", &names()), None);
    }
}
