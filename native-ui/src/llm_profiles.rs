//! Dauerhafte LLM-Auswahl ohne Geheimnisse oder laufende Prozesszustände.
use crate::{connection, file_export, llm_control::Backend, local_llm, native_store};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs::File, io::Read, path::Path};

const FILE: &str = "profiles.json";
const VERSION: u32 = 1;
const MAX_BYTES: usize = 128 * 1024;
const INVALID: &str =
    "Die gespeicherten LLM-Einstellungen sind ungültig oder haben eine unbekannte Version.";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Preferences {
    pub active: Backend,
    pub models: BTreeMap<Backend, String>,
    pub custom_endpoint: String,
    pub custom_format: connection::Format,
    pub local: local_llm::Config,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Saved {
    version: u32,
    pub revision: u64,
    pub preferences: Preferences,
}

pub fn load(root: &Path) -> Result<Option<Saved>, String> {
    match native_store::store_root(root)? {
        Some(root) => read(&root),
        None => Ok(None),
    }
}

pub fn save(root: &Path, preferences: Preferences, expected: u64) -> Result<u64, String> {
    validate(&preferences)?;
    native_store::with_write_lock(root, "profiles.lock", |root| {
        let current = read(root)?;
        if let Some(existing) = &current
            && existing.preferences == preferences
        {
            return Ok(existing.revision);
        }
        let revision = current.map_or(0, |saved| saved.revision);
        if revision != expected {
            return Err("Eine andere Instanz hat die LLM-Einstellungen geändert. Lade den aktuellen Stand durch einen Neustart.".into());
        }
        let revision = revision.checked_add(1).ok_or(INVALID)?;
        let saved = Saved {
            version: VERSION,
            revision,
            preferences,
        };
        let bytes = serde_json::to_vec_pretty(&saved).map_err(|_| INVALID)?;
        if bytes.len() > MAX_BYTES {
            return Err("Die LLM-Einstellungen sind zu groß.".into());
        }
        file_export::write_bytes(&root.join(FILE), &bytes, None)?;
        Ok(revision)
    })
}

fn read(root: &Path) -> Result<Option<Saved>, String> {
    let path = root.join(FILE);
    if !native_store::regular_file(&path)? {
        return Ok(None);
    }
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|_| INVALID)?
        .take(MAX_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| INVALID)?;
    if bytes.len() > MAX_BYTES {
        return Err(INVALID.into());
    }
    let saved: Saved = serde_json::from_slice(&bytes).map_err(|_| INVALID)?;
    if saved.version != VERSION || saved.revision == 0 {
        return Err(INVALID.into());
    }
    validate(&saved.preferences)?;
    Ok(Some(saved))
}

fn validate(preferences: &Preferences) -> Result<(), String> {
    let endpoint = connection::endpoint(&preferences.custom_endpoint)?;
    if endpoint.query().is_some() || endpoint.fragment().is_some() {
        return Err("Speichere die Endpunkt-URL ohne Abfrageparameter und URL-Fragment. Trage Zugangsdaten im API-Schlüsselfeld ein.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn llm_profiles_save_atomically_and_reject_a_stale_revision() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("llm");
        assert!(load(&root).unwrap().is_none());
        assert!(!root.exists());
        let mut preferences = Preferences {
            active: Backend::OpenRouter,
            models: [(Backend::OpenRouter, "model/a".into())].into(),
            custom_endpoint: "http://127.0.0.1:8080/v1/chat/completions".into(),
            custom_format: connection::Format::OpenAi,
            local: local_llm::Config::default(),
        };
        assert_eq!(save(&root, preferences.clone(), 0).unwrap(), 1);
        assert_eq!(save(&root, preferences.clone(), 0).unwrap(), 1);
        preferences
            .models
            .insert(Backend::OpenRouter, "model/b".into());
        assert!(save(&root, preferences.clone(), 0).is_err());
        assert_eq!(
            load(&root).unwrap().unwrap().preferences.models[&Backend::OpenRouter],
            "model/a"
        );
        assert_eq!(save(&root, preferences.clone(), 1).unwrap(), 2);
        let snapshot = load(&root).unwrap().unwrap();
        assert_eq!(snapshot.preferences, preferences);

        preferences.custom_endpoint += "?key=fixture-secret";
        assert!(save(&root, preferences, 2).is_err());
        let raw = std::fs::read_to_string(root.join(FILE)).unwrap();
        assert!(!raw.contains("fixture-secret"));
        assert_eq!(load(&root).unwrap().unwrap().revision, 2);
    }
}
