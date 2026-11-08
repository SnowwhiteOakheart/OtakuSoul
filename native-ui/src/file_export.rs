//! Gemeinsamer atomarer Dateiexport; keine Dialoge oder formatspezifischen Transformationen.
use serde_json::Value;
use std::io::Write;
use std::path::Path;

const MAX_JSON_BYTES: usize = 4 * 1024 * 1024;

/// Der Aufrufer hat das Ziel ausdrücklich gewählt und ein Überschreiben bestätigt.
/// Erst vollständig schreiben/synchronisieren, danach die Zieldatei atomar ersetzen.
pub fn write_bytes(path: &Path, bytes: &[u8], protected_home: Option<&Path>) -> Result<(), String> {
    let target = crate::profile::validate_export_target(path, protected_home)?;
    let parent = target.parent().ok_or("Das Exportziel ist ungültig.")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| "Im Zielordner konnte keine temporäre Exportdatei angelegt werden.")?;
    temporary
        .write_all(bytes)
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|_| "Die Exportdatei konnte nicht vollständig geschrieben werden.")?;
    temporary
        .persist(target)
        .map_err(|_| "Die Exportdatei konnte nicht am gewählten Ziel gespeichert werden.")?;
    Ok(())
}

/// Exportiert das unveränderte JSON-Dokument ohne Karten-/Bildtransformationen.
pub fn write_json(path: &Path, value: &Value, protected_home: Option<&Path>) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|_| "Die Daten konnten nicht als JSON aufbereitet werden.")?;
    if bytes.len() > MAX_JSON_BYTES {
        return Err("Die JSON-Datei überschreitet die Exportgrenze von 4 MiB.".into());
    }
    write_bytes(path, &bytes, protected_home)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    #[test]
    fn json_roundtrip_preserves_unknown_fields_without_card_transformations() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("book.json");
        let value = json!({"name":"Welt", "entries":[], "foreign":{"keep":42},
            "extensions":{"expressions":{"happy":"expressions/shiori_amane/happy.webp"}}});
        write_json(&path, &value, None).unwrap();
        let read: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(read, value);
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn successful_export_can_replace_an_existing_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("book.json");
        fs::write(&path, b"original").unwrap();
        write_json(&path, &json!({"entries":[]}), None).unwrap();
        let read: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(read, json!({"entries":[]}));
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn invalid_or_protected_targets_leave_existing_data_untouched() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("book.json");
        fs::write(&path, b"original").unwrap();
        assert!(write_bytes(&path, b"new", Some(directory.path())).is_err());
        assert!(write_bytes(&directory.path().join("missing/book.json"), b"new", None).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn oversized_json_does_not_replace_a_file_or_leave_temporary_files() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("book.json");
        fs::write(&path, b"original").unwrap();
        let value = json!({"content":"x".repeat(MAX_JSON_BYTES)});
        assert!(write_json(&path, &value, None).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }
}
