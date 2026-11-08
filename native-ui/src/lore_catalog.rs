//! Lesende Anzeigeprojektion ausdrücklich geladener Lorebooks, keine Normalisierung/Evaluation.
use serde_json::Value;
use std::path::Path;

#[derive(Debug, Clone)]
pub struct Book {
    pub id: String,
    pub name: String,
    pub description: String,
    pub entries: Vec<Entry>,
    pub raw: Value,
    pub source: String,
}

#[derive(Debug, Clone)]
pub struct Entry {
    pub name: String,
    pub content: String,
    pub enabled: bool,
}

impl Book {
    /// Der gemeinsame Einzeldateileser begrenzt JSON auf 4 MiB und schützt Produktivdateien.
    pub fn read(path: &Path) -> Result<Self, String> {
        let path = path
            .canonicalize()
            .map_err(|_| "Die Lorebook-Datei ist nicht zugänglich.")?;
        if !path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
        {
            return Err("Bitte eine JSON-Lorebook-Datei auswählen.".into());
        }
        let raw = crate::profile::read_standalone_json(&path)?;
        let fallback = path
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
            .unwrap_or_else(|| "Lorebook".into());
        let mut book = Self::from_json(raw, path.to_string_lossy().into_owned(), &fallback)?;
        if book.id.is_empty() {
            book.id = fallback;
        }
        Ok(book)
    }

    /// Nur Anzeigefelder werden projiziert; `raw` bleibt vollständig und unverändert erhalten.
    pub fn from_json(raw: Value, source: String, fallback_name: &str) -> Result<Self, String> {
        let object = raw
            .as_object()
            .ok_or("Das Lorebook enthält kein gültiges JSON-Objekt.")?;
        let id = nonempty(object.get("id")).unwrap_or_default().to_owned();
        let name = nonempty(object.get("name"))
            .unwrap_or_else(|| {
                if fallback_name.trim().is_empty() {
                    "Lorebook"
                } else {
                    fallback_name.trim()
                }
            })
            .to_owned();
        let description = object
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        let values: Vec<&Value> = match object.get("entries") {
            Some(Value::Array(entries)) if entries.len() <= 10_000 => entries.iter().collect(),
            Some(Value::Object(entries)) if entries.len() <= 10_000 => entries.values().collect(),
            Some(Value::Array(_)) | Some(Value::Object(_)) => {
                return Err(
                    "Das Lorebook überschreitet die Vorschaugrenze von 10.000 Einträgen.".into(),
                );
            }
            _ => {
                return Err(
                    "Das Lorebook benötigt einen Eintragsbereich als Array oder Objekt.".into(),
                );
            }
        };
        let entries = values
            .into_iter()
            .enumerate()
            .map(|(index, value)| {
                let entry = value
                    .as_object()
                    .ok_or("Ein Lorebook-Eintrag enthält kein gültiges JSON-Objekt.")?;
                let name = nonempty(entry.get("name"))
                    .or_else(|| nonempty(entry.get("comment")))
                    .map(str::to_owned)
                    .unwrap_or_else(|| format!("Eintrag {}", index + 1));
                let content = entry
                    .get("content")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                let enabled = entry
                    .get("enabled")
                    .and_then(Value::as_bool)
                    .unwrap_or_else(|| {
                        !entry
                            .get("disable")
                            .and_then(Value::as_bool)
                            .unwrap_or_default()
                    });
                Ok(Entry {
                    name,
                    content,
                    enabled,
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        Ok(Self {
            id,
            name,
            description,
            entries,
            raw,
            source,
        })
    }

    pub fn binding_key(&self) -> &str {
        if self.id.is_empty() {
            &self.name
        } else {
            &self.id
        }
    }

    /// Tauri vergleicht Bindungen unabhängig von Großschreibung gegen ID, Namen und Dateipfad.
    pub fn matches_reference(&self, reference: &str) -> bool {
        let reference = reference.trim().to_lowercase();
        !reference.is_empty()
            && [&self.id, &self.name, &self.source].iter().any(|alias| {
                let alias = alias.trim();
                !alias.is_empty() && alias.to_lowercase() == reference
            })
    }
}

fn nonempty(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn array_projection_preserves_unknown_raw_data_and_binding_aliases() {
        let raw = json!({"id":" world-1 ","name":" Welt ","description":"Beschreibung",
            "entries":[{"name":"Ort","content":"Text","enabled":false,"keys":["unberührt"]}],
            "extensions":{"foreign":{"value":42}}});
        let book = Book::from_json(raw.clone(), "C:/Kopie/Welt.json".into(), "Fallback").unwrap();
        assert_eq!(book.raw, raw);
        assert_eq!(book.binding_key(), "world-1");
        assert!(book.matches_reference(" WORLD-1 "));
        assert!(book.matches_reference("welt"));
        assert!(book.matches_reference("c:/kopie/welt.JSON"));
        assert!(!book.matches_reference(""));
        assert!(!book.matches_reference("andere-welt"));
        assert_eq!(book.description, "Beschreibung");
        assert_eq!(book.entries[0].name, "Ort");
        assert_eq!(book.entries[0].content, "Text");
        assert!(!book.entries[0].enabled);
    }

    #[test]
    fn object_entries_show_sillytavern_fields_without_normalizing_them() {
        let raw = json!({"entries":{
            "0":{"comment":" Kommentar ","content":"Lore","disable":true,"constant":true},
            "1":{"disable":true,"enabled":true},
            "2":{"name":" ","content":null}
        }});
        let book = Book::from_json(raw.clone(), String::new(), "Dateiname").unwrap();
        assert_eq!(book.name, "Dateiname");
        assert_eq!(book.binding_key(), "Dateiname");
        assert!(!book.matches_reference(" "));
        assert_eq!(book.entries[0].name, "Kommentar");
        assert!(!book.entries[0].enabled);
        assert!(book.entries[1].enabled);
        assert_eq!(book.entries[2].name, "Eintrag 3");
        assert!(book.entries[2].content.is_empty());
        assert_eq!(book.raw, raw);
    }

    #[test]
    fn invalid_entry_containers_and_values_are_not_silently_hidden() {
        for raw in [
            Value::Null,
            json!([]),
            json!({}),
            json!({"entries":null}),
            json!({"entries":"falsch"}),
            json!({"entries":[42]}),
            json!({"entries":{"broken":false}}),
        ] {
            assert!(Book::from_json(raw, String::new(), "Fallback").is_err());
        }
        let empty = Book::from_json(json!({"entries":[]}), String::new(), " ").unwrap();
        assert_eq!(empty.name, "Lorebook");
        assert!(empty.entries.is_empty());
        assert!(
            Book::from_json(
                json!({"entries":vec![json!({});10_001]}),
                String::new(),
                "Groß"
            )
            .is_err()
        );
    }

    #[test]
    fn explicit_file_loading_does_not_change_the_lorebook() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("book.json");
        let bytes = br#"{"id":"world","name":"Welt","entries":[],"foreign":{"keep":true}}"#;
        std::fs::write(&path, bytes).unwrap();
        let book = Book::read(&path).unwrap();
        assert_eq!(book.binding_key(), "world");
        assert_eq!(book.raw["foreign"]["keep"], true);
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
        for stem in ["first", "second"] {
            let path = directory.path().join(format!("{stem}.json"));
            std::fs::write(&path, br#"{"name":"Gleicher Name","entries":[]}"#).unwrap();
            let book = Book::read(&path).unwrap();
            assert_eq!(book.binding_key(), stem);
            assert!(book.raw.get("id").is_none());
        }
    }
}
