//! Native Erzählverläufe, getrennt von Szenendefinitionen und Tauri-Spielständen.
use crate::{file_export, stage_play::Round, stage_preview, stage_store};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashSet, fs::File, io::Read, path::Path};

const FILE: &str = "plays.json";
const VERSION: u32 = 1;
const MAX_BYTES: usize = 64 * 1024 * 1024;
const MAX_PLAYS: usize = 512;
const INVALID: &str =
    "Die nativen Stage-Spielstände sind ungültig oder haben eine unbekannte Version.";
const CAPACITY: &str = "Der native Stage-Spielstandspeicher ist voll.";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Preset,
    Own,
    Hub,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Key {
    pub source: Source,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Saved {
    pub key: Key,
    pub rounds: Vec<Round>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hub_definition: Option<Value>,
}

#[derive(Serialize, Deserialize)]
struct Catalog {
    version: u32,
    plays: Vec<Saved>,
}

pub fn list(root: &Path) -> Result<Vec<Saved>, String> {
    match stage_store::store_root(root)? {
        Some(root) => read(&root),
        None => Ok(Vec::new()),
    }
}

pub fn append(root: &Path, pending: Saved, expected: usize) -> Result<usize, String> {
    validate(&pending)?;
    stage_store::with_write_lock(root, "plays.lock", |root| {
        let mut plays = read(root)?;
        let count = expected.checked_add(pending.rounds.len()).ok_or(CAPACITY)?;
        if let Some(stored) = plays.iter_mut().find(|play| play.key == pending.key) {
            if stored.rounds.len() == count && stored.rounds[expected..] == pending.rounds {
                return Ok(count);
            }
            if stored.rounds.len() != expected {
                return Err("Eine andere Instanz hat diesen Spielstand weitergeführt.".into());
            }
            stored.rounds.extend(pending.rounds);
            stored.hub_definition = pending.hub_definition;
        } else {
            if expected != 0 {
                return Err("Der bisherige Spielstand fehlt.".into());
            }
            if plays.len() == MAX_PLAYS {
                return Err(CAPACITY.into());
            }
            plays.push(pending);
        }
        let bytes = serde_json::to_vec(&Catalog {
            version: VERSION,
            plays,
        })
        .map_err(|_| INVALID)?;
        if bytes.len() > MAX_BYTES {
            return Err(CAPACITY.into());
        }
        file_export::write_bytes(&root.join(FILE), &bytes, None)?;
        Ok(count)
    })
}

fn read(root: &Path) -> Result<Vec<Saved>, String> {
    let path = root.join(FILE);
    if !stage_store::regular_file(&path)? {
        return Ok(Vec::new());
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| INVALID)?
        .take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| INVALID)?;
    if bytes.len() > MAX_BYTES {
        return Err(CAPACITY.into());
    }
    let catalog: Catalog = serde_json::from_slice(&bytes).map_err(|_| INVALID)?;
    if catalog.version != VERSION || catalog.plays.len() > MAX_PLAYS {
        return Err(INVALID.into());
    }
    let mut keys = HashSet::new();
    for play in &catalog.plays {
        validate(play)?;
        if !keys.insert(&play.key) {
            return Err(INVALID.into());
        }
    }
    Ok(catalog.plays)
}

fn validate(play: &Saved) -> Result<(), String> {
    if play.key.id.trim().is_empty()
        || play.rounds.is_empty()
        || play
            .rounds
            .iter()
            .any(|round| round.input.trim().is_empty() || round.reply.trim().is_empty())
    {
        return Err(INVALID.into());
    }
    match (play.key.source, &play.hub_definition) {
        (Source::Hub, Some(definition)) => {
            let scene = stage_preview::parse(definition.clone()).map_err(|_| INVALID)?;
            if scene.id != play.key.id {
                return Err(INVALID.into());
            }
        }
        (Source::Hub, None) | (_, Some(_)) => return Err(INVALID.into()),
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stage_play::Mode;

    fn play(source: Source, input: &str) -> Saved {
        Saved {
            key: Key {
                source,
                id: "forest".into(),
            },
            rounds: vec![Round {
                mode: Mode::Act,
                input: input.into(),
                reply: "Der Wald antwortet.".into(),
            }],
            hub_definition: None,
        }
    }

    #[test]
    fn stage_progress_retries_do_not_duplicate_rounds_and_conflicts_preserve_the_winner() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("stage");
        assert!(list(&root).unwrap().is_empty());
        assert!(!root.exists());
        assert_eq!(
            append(&root, play(Source::Own, "Erster Zug"), 0).unwrap(),
            1
        );
        assert_eq!(
            append(&root, play(Source::Own, "Erster Zug"), 0).unwrap(),
            1
        );
        assert_eq!(
            append(&root, play(Source::Own, "Zweiter Zug"), 1).unwrap(),
            2
        );
        assert!(append(&root, play(Source::Own, "Veralteter Zug"), 1).is_err());
        assert_eq!(
            append(&root, play(Source::Preset, "Andere Geschichte"), 0).unwrap(),
            1
        );
        let restored = list(&root).unwrap();
        assert_eq!(restored.len(), 2);
        assert_eq!(restored[0].rounds[1].input, "Zweiter Zug");
        assert_eq!(restored[1].rounds[0].input, "Andere Geschichte");
    }

    #[test]
    fn stage_progress_keeps_unreadable_files_intact() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let broken = b"{\"version\":2,\"plays\":[]}";
        std::fs::write(root.join(FILE), broken).unwrap();
        assert!(list(root).is_err());
        assert!(append(root, play(Source::Own, "Zug"), 0).is_err());
        assert_eq!(std::fs::read(root.join(FILE)).unwrap(), broken);
    }
}
