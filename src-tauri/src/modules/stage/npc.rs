//! Scene-local NPCs, relevance-ranked memories and promotion to ordinary V2 characters.

use super::*;
use crate::modules::characters::{CharacterCardV2, CharacterData, CharacterProfile};
use crate::modules::memory::MemoryDb;
use std::collections::HashSet;
use std::io::Write;
use ts_rs::TS;

const MEMORY_LIMIT: usize = 200;
const RECALL_LIMIT: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageNpcDraft {
    pub name: String,
    #[serde(default)]
    pub archetype: String,
    #[serde(default)]
    pub personality: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageNpcMemory {
    pub message_id: String,
    pub text: String,
}


impl StageNpc {
    pub fn localized(&self, lang: &str) -> StageNpc {
        let Some(translation) = self.extensions.get(crate::modules::characters::I18N_EXTENSION).and_then(|i18n| i18n.get("translations")).and_then(|t| t.get(lang)) else { return self.clone(); };
        let mut loc = self.clone();
        for &field in &["name", "archetype", "personality"] {
            if let Some(val) = translation.get(field).and_then(|v| v.as_str()) {
                if !val.trim().is_empty() {
                    match field { "name" => loc.name = val.to_string(), "archetype" => loc.archetype = val.to_string(), "personality" => loc.personality = val.to_string(), _ => {} }
                }
            }
        }
        loc
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageNpc {
    pub id: String,
    pub name: String,
    pub archetype: String,
    pub personality: String,
    pub active: bool,
    #[serde(default)]
    pub turn_count: u32,
    #[serde(default)]
    pub memories: Vec<StageNpcMemory>,
    #[serde(default)]
    pub promoted_character_id: Option<String>,
    #[serde(default)]
    pub extensions: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct StageNpcPromotion {
    pub scene: SceneState,
    pub character: CharacterProfile,
}

pub fn npc_archetype(value: &str) -> &'static str {
    match value.trim().to_lowercase().as_str() {
        "innkeeper" => "innkeeper",
        "guard" | "authority figure" | "officer" | "soldier" => "guard",
        "merchant" | "trader" => "merchant",
        "villain" | "antagonist" | "criminal" => "villain",
        "creature" | "monster" => "creature",
        "sage" | "scholar" | "elder" | "healer" => "sage",
        "noble" | "aristocrat" => "noble",
        _ => "citizen",
    }
}

fn avatar_png(archetype: &str) -> &'static [u8] {
    match npc_archetype(archetype) {
        "innkeeper" => include_bytes!("../../../../public/npc/innkeeper.png"),
        "guard" => include_bytes!("../../../../public/npc/guard.png"),
        "merchant" => include_bytes!("../../../../public/npc/merchant.png"),
        "villain" => include_bytes!("../../../../public/npc/villain.png"),
        "creature" => include_bytes!("../../../../public/npc/creature.png"),
        "sage" => include_bytes!("../../../../public/npc/sage.png"),
        "noble" => include_bytes!("../../../../public/npc/noble.png"),
        _ => include_bytes!("../../../../public/npc/citizen.png"),
    }
}

pub fn npc_avatar(archetype: &str) -> String {
    format!(
        "data:image/png;base64,{}",
        BASE64_STANDARD.encode(avatar_png(archetype))
    )
}

pub fn find_npc<'a>(state: &'a SceneState, name: &str) -> Option<&'a StageNpc> {
    state
        .npcs
        .iter()
        .find(|n| n.name.eq_ignore_ascii_case(name) || n.id == name)
}

pub fn upsert_npc(state: &mut SceneState, draft: StageNpcDraft) -> Result<(), String> {
    let name = draft.name.trim();
    if name.is_empty()
        || name.eq_ignore_ascii_case(&state.definition.persona)
        || name.chars().count() > 120
        || ["PLAYER", "GM", "Game Master"]
            .iter()
            .any(|reserved| name.eq_ignore_ascii_case(reserved))
        || state
            .definition
            .party
            .iter()
            .any(|p| p.eq_ignore_ascii_case(name))
    {
        return Err(crate::err!("backend.stage.npcName"));
    }
    let archetype = npc_archetype(&draft.archetype).to_string();
    if let Some(npc) = state
        .npcs
        .iter_mut()
        .find(|n| n.name.eq_ignore_ascii_case(name))
    {
        if npc.promoted_character_id.is_some() {
            return Err(crate::err!("backend.stage.npcPromoted"));
        }
        npc.active = true;
        npc.archetype = archetype;
        if !draft.personality.trim().is_empty() {
            npc.personality = draft.personality.trim().chars().take(4000).collect();
        }
    } else {
        state.npcs.push(StageNpc {
extensions: serde_json::Value::Null,
            id: format!("npc_{:016x}", rand::rng().random::<u64>()),
            name: name.into(),
            archetype,
            personality: draft.personality.trim().chars().take(4000).collect(),
            active: true,
            turn_count: 0,
            memories: Vec::new(),
            promoted_character_id: None,
        });
    }
    Ok(())
}

pub fn set_npc_active(state: &mut SceneState, id: &str, active: bool) -> Result<(), String> {
    let npc = state
        .npcs
        .iter_mut()
        .find(|n| n.id == id || n.name.eq_ignore_ascii_case(id))
        .ok_or_else(|| crate::err!("backend.stage.npcMissing"))?;
    if npc.promoted_character_id.is_some() {
        return Err(crate::err!("backend.stage.npcPromoted"));
    }
    npc.active = active;
    Ok(())
}

/// Only present NPCs observe the new messages, with whispers/thoughts filtered first.
pub fn observe_npcs(state: &mut SceneState, from: usize) {
    let party = &state.definition.party;
    for npc in state.npcs.iter_mut().filter(|n| {
        n.active
            || (n.promoted_character_id.is_some()
                && party.iter().any(|name| name.eq_ignore_ascii_case(&n.name)))
    }) {
        for msg in state.chat_log.iter().skip(from) {
            if npc.memories.iter().any(|m| m.message_id == msg.id) {
                continue;
            }
            npc.memories.push(StageNpcMemory {
                message_id: msg.id.clone(),
                text: line_for(msg, Audience::Character(&npc.name)),
            });
        }
        if npc.memories.len() > MEMORY_LIMIT {
            npc.memories.drain(..npc.memories.len() - MEMORY_LIMIT);
        }
    }
}

/// Keep remembered source lines consistent with edits/deletions/regeneration.
pub fn reconcile_npc_memories(state: &mut SceneState) {
    for npc in &mut state.npcs {
        npc.memories.retain_mut(|memory| {
            let Some(msg) = state.chat_log.iter().find(|m| m.id == memory.message_id) else {
                return false;
            };
            memory.text = line_for(msg, Audience::Character(&npc.name));
            true
        });
    }
}

fn terms(text: &str) -> HashSet<String> {
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.chars().count() > 2)
        .map(str::to_string)
        .collect()
}

/// Lexical relevance (rarer shared words weigh more); recency breaks ties. No extra model.
pub fn recall_npc<'a>(npc: &'a StageNpc, query: &str) -> Vec<&'a StageNpcMemory> {
    let query = terms(query);
    let documents: Vec<_> = npc.memories.iter().map(|m| terms(&m.text)).collect();
    let mut ranked: Vec<_> = documents
        .iter()
        .enumerate()
        .map(|(i, words)| {
            let score: f64 = words
                .intersection(&query)
                .map(|word| {
                    let frequency = documents.iter().filter(|doc| doc.contains(word)).count();
                    ((documents.len() as f64 + 1.0) / (frequency as f64 + 1.0)).ln() + 1.0
                })
                .sum();
            (i, score)
        })
        .collect();
    ranked.sort_by(|(i, a), (j, b)| b.total_cmp(a).then_with(|| j.cmp(i)));
    let has_matches = ranked.first().is_some_and(|(_, score)| *score > 0.0);
    ranked
        .into_iter()
        .filter(|(_, score)| !has_matches || *score > 0.0)
        .take(RECALL_LIMIT)
        .map(|(i, _)| &npc.memories[i])
        .collect()
}

pub fn npc_memory_block(npc: &StageNpc, query: &str) -> String {
    let recalled = recall_npc(npc, query);
    if recalled.is_empty() {
        return String::new();
    }
    format!(
        "\nYour relevant memories from earlier encounters (only what you witnessed):\n{}",
        recalled
            .iter()
            .map(|m| format!("- {}", m.text))
            .collect::<Vec<_>>()
            .join("\n")
    )
}

/// NPCs never receive scene history from encounters where they were absent.
pub(super) fn npc_history_line(
    state: &SceneState,
    msg: &SceneTurnMessage,
    audience: Audience<'_>,
) -> String {
    if let Audience::Character(name) = audience
        && let Some(npc) = find_npc(state, name)
    {
        return npc
            .memories
            .iter()
            .find(|m| m.message_id == msg.id)
            .map_or_else(
                || "[An event you did not witness.]".into(),
                |m| m.text.clone(),
            );
    }
    line_for(msg, audience)
}

fn promotion_card(state: &SceneState, npc: &StageNpc) -> CharacterCardV2 {
    CharacterCardV2 {
        spec: "chara_card_v2".into(),
        spec_version: "2.0".into(),
        data: CharacterData {
            name: npc.name.clone(),
            description: format!("{}\n{}", npc.personality, state.definition.world_context),
            personality: npc.personality.clone(),
            scenario: state.definition.world_context.clone(),
            first_mes: state
                .chat_log
                .iter()
                .rev()
                .find(|m| m.sender_role == "npc" && m.sender_name == npc.name)
                .map(|m| m.content.clone())
                .unwrap_or_default(),
            tags: vec!["Soul Stage".into(), npc.archetype.clone()],
            extensions: serde_json::json!({ "otakusoul_stage_origin": { "scene_id": state.definition.id, "npc_id": npc.id }, "bound_lorebooks": state.definition.lorebook }),
            ..Default::default()
        },
    }
}

/// A create-new write prevents promotion from overwriting an existing character, including
/// hidden cards. The origin marker makes retries after partial failure idempotent.
fn write_promotion(
    state: &SceneState,
    npc: &StageNpc,
    directory: &Path,
) -> Result<CharacterProfile, String> {
    fs::create_dir_all(directory)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    let stem = npc
        .name
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
    if [".", ".."].contains(&stem.as_str()) {
        return Err(crate::err!("backend.stage.npcName"));
    }
    let path = directory.join(format!("{stem}.png"));
    if path.exists() {
        let existing = crate::modules::characters::load_character_from_file(&path)?;
        let origin = &existing.card.data.extensions["otakusoul_stage_origin"];
        if origin["scene_id"].as_str() == Some(&state.definition.id)
            && origin["npc_id"].as_str() == Some(&npc.id)
        {
            return Ok(existing);
        }
        return Err(crate::err!(
            "backend.stage.npcCharacterExists",
            name = npc.name
        ));
    }
    if directory.join(format!("{stem}.json")).exists() {
        return Err(crate::err!(
            "backend.stage.npcCharacterExists",
            name = npc.name
        ));
    }
    let card = promotion_card(state, npc);
    let bytes = crate::modules::characters::inject_character_metadata_png(
        avatar_png(&npc.archetype),
        &card,
    )?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| {
            crate::err!(
                "backend.common.fileWritePath",
                path = path.display(),
                error = e
            )
        })?;
    if let Err(error) = file.write_all(&bytes) {
        let _ = fs::remove_file(&path);
        return Err(crate::err!("backend.common.fileWrite", error = error));
    }
    crate::modules::characters::load_character_from_file(&path)
}

pub fn promote_npc(
    state: &mut SceneState,
    id: &str,
    db: &MemoryDb,
) -> Result<CharacterProfile, String> {
    let npc = find_npc(state, id)
        .cloned()
        .ok_or_else(|| crate::err!("backend.stage.npcMissing"))?;
    let paths = resolve_app_paths();
    let directory = Path::new(&paths.characters_dir);
    let collision = scan_available_characters().iter().any(|ch| {
        ch.card.data.name.eq_ignore_ascii_case(&npc.name)
            && ch.card.data.extensions["otakusoul_stage_origin"]["npc_id"].as_str() != Some(&npc.id)
    });
    if collision {
        return Err(crate::err!(
            "backend.stage.npcCharacterExists",
            name = npc.name
        ));
    }
    let character = write_promotion(state, &npc, directory)?;
    for memory in &npc.memories {
        db.add_episodic_memory(&character.id, "Soul Stage", &memory.text, 3)
            .map_err(|e| crate::err!("backend.stage.npcMemory", error = e))?;
    }
    let promoted = state
        .npcs
        .iter_mut()
        .find(|n| n.id == npc.id)
        .expect("NPC was found above");
    promoted.promoted_character_id = Some(character.id.clone());
    promoted.active = false;
    if !state.definition.party.contains(&npc.name) {
        state.definition.party.push(npc.name);
    }
    ensure_party_vitals(state);
    Ok(character)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn respawn_keeps_identity_and_memory_and_normalizes_archetype() {
        let mut state = StageEngine::new().get_state();
        let draft = StageNpcDraft {
            name: " Mira ".into(),
            archetype: "trader".into(),
            personality: "Helpful".into(),
        };
        upsert_npc(&mut state, draft.clone()).unwrap();
        observe_npcs(&mut state, 0);
        let saved = state.npcs[0].clone();
        set_npc_active(&mut state, &saved.id, false).unwrap();
        upsert_npc(&mut state, draft).unwrap();
        assert_eq!(state.npcs.len(), 1);
        assert_eq!(state.npcs[0].id, saved.id);
        assert_eq!(state.npcs[0].memories.len(), saved.memories.len());
        assert_eq!(state.npcs[0].archetype, "merchant");
        assert_eq!(npc_archetype("invented"), "citizen");
    }

    #[test]
    fn recalls_relevant_old_memory_before_recent_unrelated_memories() {
        let mut state = StageEngine::new().get_state();
        upsert_npc(
            &mut state,
            StageNpcDraft {
                name: "Mira".into(),
                archetype: String::new(),
                personality: String::new(),
            },
        )
        .unwrap();
        let npc = &mut state.npcs[0];
        npc.memories.push(StageNpcMemory {
            message_id: "old".into(),
            text: "Der Saphirschlüssel öffnet das Tor".into(),
        });
        for i in 0..20 {
            npc.memories.push(StageNpcMemory {
                message_id: i.to_string(),
                text: "Die Sonne scheint über dem Markt".into(),
            });
        }
        assert_eq!(recall_npc(npc, "Saphirschlüssel")[0].message_id, "old");
        assert_eq!(recall_npc(npc, "Nichts")[0].message_id, "19");
    }

    #[test]
    fn observes_only_own_secrets_and_reconciles_edits() {
        let mut state = StageEngine::new().get_state();
        upsert_npc(
            &mut state,
            StageNpcDraft {
                name: "Mira".into(),
                archetype: String::new(),
                personality: String::new(),
            },
        )
        .unwrap();
        let mut msg = state.chat_log[0].clone();
        msg.id = "secret".into();
        msg.turn_mode = "whisper".into();
        msg.whisper_target = Some("Ayu".into());
        msg.content = "SECRET".into();
        state.chat_log.push(msg);
        observe_npcs(&mut state, 1);
        assert!(!state.npcs[0].memories[0].text.contains("SECRET"));
        state.chat_log[1].whisper_target = Some("Mira".into());
        reconcile_npc_memories(&mut state);
        assert!(state.npcs[0].memories[0].text.contains("SECRET"));
        assert!(
            !npc_history_line(&state, &state.chat_log[0], Audience::Character("Mira"))
                .contains(&state.chat_log[0].content)
        );
        state.chat_log.pop();
        reconcile_npc_memories(&mut state);
        assert!(state.npcs[0].memories.is_empty());
    }

    #[test]
    fn promotion_png_round_trips_and_never_overwrites_other_cards() {
        let mut state = StageEngine::new().get_state();
        upsert_npc(
            &mut state,
            StageNpcDraft {
                name: "Mira".into(),
                archetype: "sage".into(),
                personality: "Wise".into(),
            },
        )
        .unwrap();
        let directory = std::env::temp_dir().join(format!(
            "otakusoul-npc-{:016x}",
            rand::rng().random::<u64>()
        ));
        let first = write_promotion(&state, &state.npcs[0], &directory).unwrap();
        let retry = write_promotion(&state, &state.npcs[0], &directory).unwrap();
        assert_eq!(first.id, retry.id);
        assert!(first.avatar_data_url.is_some());
        assert_eq!(first.card.data.personality, "Wise");
        state.npcs[0].id = "other".into();
        assert!(write_promotion(&state, &state.npcs[0], &directory).is_err());
        fs::remove_dir_all(directory).unwrap();
    }
}
