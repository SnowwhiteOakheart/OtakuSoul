//! Lesende Projektion einer fertigen Profilkopie, kein Ersatz für die Backend-Kartenlogik.
//! Unbekannte Kartenfelder bleiben erhalten. Es werden weder Migrationen noch Schreibbefehle ausgeführt.

use base64::{Engine, engine::general_purpose::STANDARD};
use rusqlite::{Connection, OpenFlags, params};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

const MAX_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_CARD_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone)]
pub struct Profile {
    pub characters: Vec<ProfileCharacter>,
    pub sessions: Vec<Session>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ProfileCharacter {
    pub id: String,
    pub name: String,
    pub description: String,
    pub first_message: String,
    pub card: Value,
    pub portrait: Option<Vec<u8>>,
}

#[derive(Debug, Clone)]
pub struct Session {
    pub id: String,
    pub character_id: String,
    pub title: String,
    pub message_count: usize,
}

#[derive(Debug, Clone)]
pub struct StoredMessage {
    pub role: String,
    pub content: String,
}

fn canonical(path: &Path) -> Result<PathBuf, String> {
    path.canonicalize().map_err(|_| {
        "Der gewählte Profilordner oder eine benötigte Datei ist nicht zugänglich.".into()
    })
}

// Auch noch nicht vorhandene Produktionsordner müssen mit dem kanonischen Ziel
// vergleichbar bleiben (insbesondere Windows' erweitertes Pfadpräfix).
fn normalized_location(path: &Path) -> PathBuf {
    if let Ok(canonical) = path.canonicalize() {
        return canonical;
    }
    if let Some(name) = path.file_name()
        && let Some(parent) = path.parent()
    {
        let parent = if parent.as_os_str().is_empty() {
            Path::new(".")
        } else {
            parent
        };
        return normalized_location(parent).join(name);
    }
    path.to_path_buf()
}

fn paths_overlap(first: &Path, second: &Path) -> bool {
    #[cfg(windows)]
    {
        // Der kanonische vorhandene Teil liefert die tatsächliche Schreibweise;
        // noch fehlende ASCII-App-Verzeichnisse werden unter Windows ohne Beachtung
        // der Groß-/Kleinschreibung verglichen.
        let first = PathBuf::from(first.to_string_lossy().to_ascii_lowercase());
        let second = PathBuf::from(second.to_string_lossy().to_ascii_lowercase());
        first.starts_with(&second) || second.starts_with(&first)
    }
    #[cfg(not(windows))]
    {
        first.starts_with(second) || second.starts_with(first)
    }
}

fn production_overlap(path: &Path) -> bool {
    let path = normalized_location(path);
    let (config, data) = otakusoul_paths::production_dirs();
    [config, data].iter().any(|directory| {
        let directory = normalized_location(directory);
        paths_overlap(&path, &directory)
    })
}

fn profile_root(home: &Path) -> Result<PathBuf, String> {
    let root = canonical(home)?;
    if !root.is_dir() || production_overlap(&root) {
        return Err(
            "Bitte wähle eine getrennte Profilkopie, nicht das produktive OtakuSoul-Profil.".into(),
        );
    }
    Ok(root)
}

fn contained(root: &Path, path: &Path) -> Result<PathBuf, String> {
    let path = canonical(path)?;
    if !path.starts_with(root) || production_overlap(&path) {
        return Err("Eine Datei verweist außerhalb der gewählten Profilkopie.".into());
    }
    Ok(path)
}

fn read_file(root: &Path, path: &Path) -> Result<Vec<u8>, String> {
    let path = contained(root, path)?;
    let file = fs::File::open(path).map_err(|_| "Eine Profildatei konnte nicht gelesen werden.")?;
    let mut bytes = Vec::new();
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Eine Profildatei konnte nicht vollständig gelesen werden.")?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Eine Profildatei überschreitet die Vorschaugrenze von 32 MiB.".into());
    }
    Ok(bytes)
}

fn png_card(bytes: &[u8]) -> Result<Value, String> {
    let decoder = png::Decoder::new_with_limits(
        Cursor::new(bytes),
        png::Limits {
            bytes: MAX_CARD_BYTES,
        },
    );
    let mut reader = decoder
        .read_info()
        .map_err(|_| "Die PNG-Karte ist ungültig oder zu groß.")?;
    // Erfasst auch die vom Backend vor IEND geschriebenen Textchunks, ohne Pixel zu entpacken.
    reader
        .finish()
        .map_err(|_| "Die PNG-Karte ist unvollständig oder ungültig.")?;
    let chunks = &reader.info().uncompressed_latin1_text;
    let chunk = chunks
        .iter()
        .find(|chunk| chunk.keyword == "ccv3")
        .or_else(|| chunks.iter().find(|chunk| chunk.keyword == "chara"))
        .ok_or("Die PNG-Datei enthält keine unterstützte chara/ccv3-Karte.")?;
    if chunk.text.len() > MAX_CARD_BYTES {
        return Err("Die Kartenmetadaten sind für die Vorschau zu groß.".into());
    }
    let json = STANDARD
        .decode(chunk.text.trim())
        .map_err(|_| "Die Kartenmetadaten sind ungültig.")?;
    serde_json::from_slice(&json)
        .map_err(|_| "Die Kartenmetadaten enthalten kein gültiges JSON.".into())
}

fn load_character(root: &Path, path: &Path) -> Result<ProfileCharacter, String> {
    let id = path
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or("Ungültiger Karten-Dateiname.")?
        .to_owned();
    let bytes = read_file(root, path)?;
    let is_png = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("png"));
    let card: Value = if is_png {
        png_card(&bytes)?
    } else {
        if bytes.len() > MAX_CARD_BYTES {
            return Err("Die JSON-Karte ist für die Vorschau zu groß.".into());
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| "Die Charakterkarte enthält kein gültiges JSON.")?
    };
    let data = card.get("data").unwrap_or(&card);
    let name = data
        .get("name")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or("Das Kartenformat wird noch nicht unterstützt oder der Name fehlt.")?
        .to_owned();
    let description = data
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let first_message = data
        .get("first_mes")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let portrait = if is_png {
        Some(bytes)
    } else {
        let sibling = path.with_extension("png");
        if sibling
            .try_exists()
            .map_err(|_| "Das Kartenporträt ist nicht zugänglich.")?
        {
            Some(read_file(root, &sibling)?)
        } else {
            None
        }
    };
    Ok(ProfileCharacter {
        id,
        name,
        description,
        first_message,
        card,
        portrait,
    })
}

fn open_database(root: &Path) -> Result<Connection, String> {
    let path = contained(root, &root.join("data/otakusoul.db"))?;
    let wal = path.with_extension("db-wal");
    if wal
        .try_exists()
        .map_err(|_| "Der Zustand der Datenbankkopie ist nicht lesbar.")?
    {
        let wal = contained(root, &wal)?;
        if fs::metadata(wal)
            .map_err(|_| "Die Datenbankkopie ist nicht zugänglich.")?
            .len()
            > 0
        {
            return Err("Die Kopie enthält ein nichtleeres SQLite-WAL. Bitte die App schließen und eine vollständig abgeschlossene Datenbank kopieren.".into());
        }
    }
    let mut uri = url::Url::from_file_path(path).map_err(|_| "Der Datenbankpfad ist ungültig.")?;
    uri.query_pairs_mut()
        .append_pair("mode", "ro")
        .append_pair("immutable", "1");
    Connection::open_with_flags(
        uri.as_str(),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|_| "Die kopierte Datenbank konnte nicht schreibgeschützt geöffnet werden.".into())
}

pub fn load_profile(home: &Path) -> Result<Profile, String> {
    let root = profile_root(home)?;
    let data = contained(&root, &root.join("data"))?;
    let mut warnings = Vec::new();
    let mut characters = BTreeMap::new();
    let directory = data.join("characters");
    if directory
        .try_exists()
        .map_err(|_| "Der Charakterordner ist nicht zugänglich.")?
    {
        let directory = contained(&root, &directory)?;
        let mut entries = fs::read_dir(directory)
            .map_err(|_| "Der Charakterordner ist nicht lesbar.")?
            .map(|entry| entry.map(|entry| entry.path()))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Der Charakterordner konnte nicht vollständig gelesen werden.")?;
        // JSON gewinnt bei gleichnamigen Karten; ein gewöhnliches Begleit-PNG ist keine zweite Karte.
        entries.sort_by_key(|path| {
            (
                path.extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|e| e.eq_ignore_ascii_case("png")),
                path.clone(),
            )
        });
        for path in entries {
            if !path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    extension.eq_ignore_ascii_case("json") || extension.eq_ignore_ascii_case("png")
                })
            {
                continue;
            }
            let id = path
                .file_stem()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            if characters.contains_key(&id) {
                continue;
            }
            match load_character(&root, &path) {
                Ok(character) => {
                    characters.insert(character.id.clone(), character);
                }
                Err(error) => warnings.push(format!(
                    "Karte {}: {error}",
                    path.file_name().unwrap_or_default().to_string_lossy()
                )),
            }
        }
    }
    let database = data.join("otakusoul.db");
    let sessions = if database
        .try_exists()
        .map_err(|_| "Die Datenbankkopie ist nicht zugänglich.")?
    {
        let connection = open_database(&root)?;
        let mut statement = connection.prepare(
            "SELECT s.id, s.character_id, s.title, (SELECT COUNT(*) FROM chat_messages m WHERE m.chat_id = s.id)
             FROM chat_sessions s ORDER BY s.updated_at DESC, s.id ASC LIMIT 10000"
        ).map_err(|_| "Die Datenbank besitzt kein unterstütztes OtakuSoul-Chatschema.")?;
        let rows = statement
            .query_map([], |row| {
                Ok(Session {
                    id: row.get(0)?,
                    character_id: row.get(1)?,
                    title: row.get(2)?,
                    message_count: row.get::<_, i64>(3)?.max(0) as usize,
                })
            })
            .map_err(|_| "Die Chatliste konnte nicht gelesen werden.")?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|_| "Die Chatliste enthält ungültige Daten.")?
    } else {
        Vec::new()
    };
    if characters.is_empty() && sessions.is_empty() {
        if let Some(warning) = warnings.first() {
            return Err(format!(
                "Die Kopie enthält keine unterstützten Charakterkarten oder Chats. Erste Kartenwarnung: {warning}"
            ));
        }
        return Err("Die Kopie enthält keine unterstützten Charakterkarten oder Chats. Erwartet werden data/characters und optional data/otakusoul.db.".into());
    }
    Ok(Profile {
        characters: characters.into_values().collect(),
        sessions,
        warnings,
    })
}

pub fn load_messages(
    home: &Path,
    session_id: &str,
    limit: usize,
) -> Result<Vec<StoredMessage>, String> {
    let root = profile_root(home)?;
    let connection = open_database(&root)?;
    let mut statement = connection.prepare(
        "SELECT role, content FROM (SELECT role, content, order_index, id FROM chat_messages
         WHERE chat_id = ?1 ORDER BY order_index DESC, id DESC LIMIT ?2) ORDER BY order_index ASC, id ASC"
    ).map_err(|_| "Die Datenbank besitzt kein unterstütztes Nachrichtenschema.")?;
    let rows = statement
        .query_map(params![session_id, limit.min(1000) as i64], |row| {
            Ok(StoredMessage {
                role: row.get(0)?,
                content: row.get(1)?,
            })
        })
        .map_err(|_| "Der Chat konnte nicht gelesen werden.")?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|_| "Der Chat enthält ungültige Nachrichten.".to_string())
}

fn write_new(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| "Eine Beispieldatei existiert bereits oder konnte nicht angelegt werden.")?;
    file.write_all(bytes)
        .map_err(|_| "Eine Beispieldatei konnte nicht geschrieben werden.".into())
}

/// Erzeugt ausschließlich synthetische Daten und mitgelieferte Karten, keine Produktivdaten.
pub fn create_demo_profile(home: &Path) -> Result<(), String> {
    if home.exists() {
        profile_root(home)?;
        if fs::read_dir(home)
            .map_err(|_| "Der Beispielordner ist nicht zugänglich.")?
            .next()
            .is_some()
        {
            return Err(
                "Das Beispielprofil wird nur in einem neuen oder leeren Ordner angelegt.".into(),
            );
        }
    } else {
        // Den künftigen Zielpfad prüfen, nicht seinen Elternordner: ein gemeinsamer
        // Vorfahr des produktiven Profils darf einen getrennten Geschwisterordner enthalten.
        let parent = home
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let parent = normalized_location(parent);
        let name = home
            .file_name()
            .ok_or("Der Beispielordner benötigt einen gültigen Namen.")?;
        let prospective = parent.join(name);
        if production_overlap(&prospective) {
            return Err(
                "Bitte lege das Beispielprofil außerhalb des produktiven Profils an.".into(),
            );
        }
        fs::create_dir_all(home).map_err(|_| "Der Beispielordner konnte nicht angelegt werden.")?;
    }
    let root = profile_root(home)?;
    let characters = root.join("data/characters");
    fs::create_dir_all(&characters)
        .map_err(|_| "Der Beispielordner konnte nicht vorbereitet werden.")?;
    let cards: [(&str, &[u8], &[u8]); 4] = [
        (
            "shiori_amane",
            include_bytes!("../../presets/characters/shiori_amane.json"),
            include_bytes!("../../presets/characters/shiori_amane.png"),
        ),
        (
            "sota_minase",
            include_bytes!("../../presets/characters/sota_minase.json"),
            include_bytes!("../../presets/characters/sota_minase.png"),
        ),
        (
            "lirwen",
            include_bytes!("../../presets/characters/lirwen.json"),
            include_bytes!("../../presets/characters/lirwen.png"),
        ),
        (
            "faelion",
            include_bytes!("../../presets/characters/faelion.json"),
            include_bytes!("../../presets/characters/faelion.png"),
        ),
    ];
    for (id, json, png) in cards {
        write_new(&characters.join(format!("{id}.json")), json)?;
        write_new(&characters.join(format!("{id}.png")), png)?;
    }
    let database = root.join("data/otakusoul.db");
    write_new(&database, &[])?;
    let connection = Connection::open(database)
        .map_err(|_| "Die Beispieldatenbank konnte nicht erstellt werden.")?;
    connection.execute_batch(
        "CREATE TABLE chat_sessions(id TEXT PRIMARY KEY, character_id TEXT NOT NULL, title TEXT NOT NULL, updated_at INTEGER NOT NULL);
         CREATE TABLE chat_messages(id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, order_index INTEGER NOT NULL);
         INSERT INTO chat_sessions VALUES ('demo-shiori', 'shiori_amane', 'Ein Gespräch in der Bibliothek', 1);
         INSERT INTO chat_sessions VALUES ('demo-lirwen', 'lirwen', 'Am Waldrand', 2);
         INSERT INTO chat_messages VALUES ('s1', 'demo-shiori', 'user', 'Hallo Shiori! Was liest Du gerade?', 0);
         INSERT INTO chat_messages VALUES ('s2', 'demo-shiori', 'assistant', 'Ein Buch über Leuchttürme. Möchtest Du mitlesen?', 1);
         INSERT INTO chat_messages VALUES ('l1', 'demo-lirwen', 'assistant', 'Der Pfad führt in den Wald. Bist Du bereit?', 0);"
    ).map_err(|_| "Die Beispielchats konnten nicht erstellt werden.")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_is_read_only_deduplicated_and_never_overwritten() {
        let directory = tempfile::tempdir().unwrap();
        let home = directory.path().join("Profil mit Leerzeichen und ü");
        create_demo_profile(&home).unwrap();
        let path = home.join("data/otakusoul.db");
        let before = fs::read(&path).unwrap();
        let profile = load_profile(&home).unwrap();
        assert_eq!(profile.characters.len(), 4);
        assert_eq!(profile.sessions.len(), 2);
        assert!(profile.warnings.is_empty());
        let shiori = profile
            .characters
            .iter()
            .find(|character| character.id == "shiori_amane")
            .unwrap();
        assert_eq!(shiori.name, "Shiori Amane");
        assert!(!shiori.first_message.is_empty());
        assert!(shiori.card["data"]["extensions"].is_object());
        assert!(shiori.portrait.is_some());
        let messages = load_messages(&home, "demo-shiori", 1).unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].role, "assistant");
        assert_eq!(
            messages[0].content,
            "Ein Buch über Leuchttürme. Möchtest Du mitlesen?"
        );
        assert_eq!(fs::read(path).unwrap(), before);
        assert!(!home.join("data/otakusoul.db-shm").exists());
        assert!(!home.join("data/otakusoul.db-wal").exists());
        assert!(create_demo_profile(&home).is_err());
    }

    #[test]
    fn demo_can_create_missing_application_subdirectories() {
        let directory = tempfile::tempdir().unwrap();
        let home = directory.path().join("native-app/data/preview-profile");
        create_demo_profile(&home).unwrap();
        assert_eq!(load_profile(&home).unwrap().characters.len(), 4);
    }

    #[test]
    fn ordering_unknown_roles_and_sql_parameters_are_preserved() {
        let directory = tempfile::tempdir().unwrap();
        create_demo_profile(directory.path()).unwrap();
        let connection = Connection::open(directory.path().join("data/otakusoul.db")).unwrap();
        connection
            .execute(
                "INSERT INTO chat_messages VALUES ('s3','demo-shiori','tool','Werkzeugausgabe',2)",
                [],
            )
            .unwrap();
        drop(connection);
        let messages = load_messages(directory.path(), "demo-shiori", 2).unwrap();
        assert_eq!(messages[0].role, "assistant");
        assert_eq!(messages[1].role, "tool");
        assert!(
            load_messages(directory.path(), "' OR 1=1 --", 100)
                .unwrap()
                .is_empty()
        );
        assert!(
            load_messages(directory.path(), "demo-shiori", 0)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn missing_empty_and_uncheckpointed_profiles_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        assert!(load_profile(&directory.path().join("missing")).is_err());
        assert!(load_profile(directory.path()).is_err());
        create_demo_profile(directory.path()).unwrap();
        fs::write(directory.path().join("data/otakusoul.db-wal"), b"pending").unwrap();
        assert!(load_profile(directory.path()).unwrap_err().contains("WAL"));
        assert!(load_messages(directory.path(), "demo-shiori", 10).is_err());
    }

    #[test]
    fn damaged_card_warns_without_hiding_valid_cards() {
        let directory = tempfile::tempdir().unwrap();
        create_demo_profile(directory.path()).unwrap();
        fs::write(
            directory.path().join("data/characters/broken.json"),
            b"private invalid text",
        )
        .unwrap();
        let profile = load_profile(directory.path()).unwrap();
        assert_eq!(profile.characters.len(), 4);
        assert_eq!(profile.warnings.len(), 1);
        assert!(!profile.warnings[0].contains("private invalid text"));
    }

    #[test]
    fn invalid_only_card_reports_the_reason_without_its_contents() {
        let directory = tempfile::tempdir().unwrap();
        let cards = directory.path().join("data/characters");
        fs::create_dir_all(&cards).unwrap();
        fs::write(cards.join("broken.json"), b"private invalid text").unwrap();
        let error = load_profile(directory.path()).unwrap_err();
        assert!(error.contains("broken.json"));
        assert!(error.contains("kein gültiges JSON"));
        assert!(!error.contains("private invalid text"));
    }

    #[test]
    fn corrupt_database_fails_without_modifying_the_copy() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("data")).unwrap();
        let path = directory.path().join("data/otakusoul.db");
        let bytes = b"private invalid database";
        fs::write(&path, bytes).unwrap();
        let error = load_profile(directory.path()).unwrap_err();
        assert!(error.contains("Chatschema"));
        assert!(!error.contains("private invalid database"));
        assert_eq!(fs::read(path).unwrap(), bytes);
    }

    #[test]
    fn production_roots_and_descendants_are_rejected_without_writing() {
        let (config, data) = otakusoul_paths::production_dirs();
        for directory in [config, data] {
            let normalized = directory.canonicalize().unwrap_or(directory);
            assert!(production_overlap(&normalized));
            assert!(production_overlap(&normalized.join("native-preview")));
        }
    }

    #[test]
    fn nonexistent_sibling_is_separate_from_production_under_common_parent() {
        let directory = tempfile::tempdir().unwrap();
        let parent = directory.path().canonicalize().unwrap();
        let production = normalized_location(&parent.join("production/config"));
        let sibling = normalized_location(&parent.join("native-preview"));
        assert!(paths_overlap(&parent, &production));
        assert!(!paths_overlap(&sibling, &production));
        assert!(paths_overlap(
            &production,
            &production.join("native-preview")
        ));
    }

    #[cfg(windows)]
    #[test]
    fn windows_symlink_outside_profile_is_not_read_when_available() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let cards = directory.path().join("data/characters");
        fs::create_dir_all(&cards).unwrap();
        let source = outside.path().join("card.json");
        fs::write(&source, r#"{"name":"Außen"}"#).unwrap();
        if let Err(error) = std::os::windows::fs::symlink_file(source, cards.join("outside.json")) {
            // Windows ohne Entwicklermodus/SeCreateSymbolicLinkPrivilege: keine Eskalation.
            if error.kind() == std::io::ErrorKind::PermissionDenied
                || error.raw_os_error() == Some(1314)
            {
                return;
            }
            panic!("Temporärer Symlink konnte nicht angelegt werden: {error}");
        }
        let root = directory.path().canonicalize().unwrap();
        assert!(contained(&root, &cards.join("outside.json")).is_err());
        assert!(load_profile(directory.path()).is_err());
    }

    #[test]
    fn png_v3_and_flat_json_retain_card_ids_and_metadata() {
        let directory = tempfile::tempdir().unwrap();
        let cards = directory.path().join("data/characters");
        fs::create_dir_all(&cards).unwrap();
        let card = serde_json::json!({"spec":"chara_card_v3","data":{"name":"PNG-Figur","description":"Beschreibung","first_mes":"Hallo","extensions":{"unknown":42}}});
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
            encoder.set_color(png::ColorType::Rgb);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().unwrap();
            writer.write_image_data(&[0, 0, 0]).unwrap();
            let text_chunk = png::text_metadata::TEXtChunk::new(
                "ccv3",
                STANDARD.encode(serde_json::to_vec(&card).unwrap()),
            );
            writer.write_text_chunk(&text_chunk).unwrap();
        }
        fs::write(cards.join("png-id.png"), bytes).unwrap();
        fs::write(
            cards.join("flat-id.json"),
            r#"{"name":"Flache Karte","description":"Text"}"#,
        )
        .unwrap();
        let profile = load_profile(directory.path()).unwrap();
        assert_eq!(profile.characters.len(), 2);
        let png = profile
            .characters
            .iter()
            .find(|character| character.id == "png-id")
            .unwrap();
        assert_eq!(png.card, card);
        assert_eq!(png.first_message, "Hallo");
    }

    #[cfg(unix)]
    #[test]
    fn symlink_outside_profile_is_not_read() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let cards = directory.path().join("data/characters");
        fs::create_dir_all(&cards).unwrap();
        let source = outside.path().join("card.json");
        fs::write(&source, r#"{"name":"Außen"}"#).unwrap();
        std::os::unix::fs::symlink(source, cards.join("outside.json")).unwrap();
        assert!(load_profile(directory.path()).is_err());
    }
}
