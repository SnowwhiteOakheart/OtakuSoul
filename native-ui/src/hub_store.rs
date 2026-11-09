//! Dauerhafte Originaldownloads für die separate native Hub-Bibliothek.
use crate::{hub_catalog::Kind, profile::validate_hub_store};
use rusqlite::{Connection, OpenFlags, OptionalExtension, Row, TransactionBehavior, params};
use std::{
    fs::{self, File, Metadata},
    io::{self, Read},
    path::{Path, PathBuf},
    time::Duration,
};

const FILE_NAME: &str = "native-hub.sqlite3";
const APPLICATION_ID: i32 = 0x4f534842; // OSHB
const SCHEMA_VERSION: i32 = 1;
const MAX_ITEMS: i64 = 1024;
const MAX_TOTAL_BYTES: i64 = 256 * 1024 * 1024;
const MAX_CHARACTER_BYTES: usize = 32 * 1024 * 1024;
const MAX_LOREBOOK_BYTES: usize = 4 * 1024 * 1024;
const INVALID_STORE: &str = "Die Datei ist keine unterstützte native Hub-Bibliothek.";
const ACCESS_ERROR: &str = "Die native Hub-Bibliothek ist nicht zugänglich.";
const READ_ERROR: &str = "Die native Hub-Bibliothek konnte nicht gelesen werden.";
const WRITE_ERROR: &str = "Der Hub-Inhalt konnte nicht dauerhaft gespeichert werden.";
const CAPACITY_ERROR: &str = "Die native Hub-Bibliothek überschreitet ihre Größenbegrenzung.";
const MISSING_ITEM: &str = "Dieser Hub-Inhalt ist in der nativen Bibliothek nicht installiert.";

#[derive(Debug, Clone)]
pub struct Item {
    pub kind: Kind,
    pub id: String,
    pub revision: u32,
    pub title: String,
    pub filename: String,
    pub bytes: Vec<u8>,
}

pub enum Install {
    Added,
    Existing(Item),
}

pub fn list(root: &Path) -> Result<Vec<Item>, String> {
    validate_hub_store(root)?;
    let Some((path, true)) = database_path(root)? else {
        return Ok(Vec::new());
    };
    let mut connection = open(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let transaction = connection.transaction().map_err(|_| READ_ERROR)?;
    check_version(&transaction)?;
    usage(&transaction)?;
    let mut select = transaction
        .prepare("SELECT kind, id, revision, title, filename, payload FROM items ORDER BY kind, id")
        .map_err(|_| READ_ERROR)?;
    select
        .query_map([], read_item)
        .map_err(|_| READ_ERROR)?
        .map(|row| row.map_err(|_| READ_ERROR.to_owned()))
        .collect()
}

pub fn install(root: &Path, item: &Item) -> Result<Install, String> {
    let kind = validate_item(item)?;
    validate_hub_store(root)?;
    fs::create_dir_all(root).map_err(|_| ACCESS_ERROR)?;
    validate_hub_store(root)?;
    let (path, exists) = database_path(root)?.ok_or(ACCESS_ERROR)?;
    if !exists {
        initialize(&path)?;
    }
    let mut connection = open_existing_for_write(root)?.ok_or(ACCESS_ERROR)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| WRITE_ERROR)?;
    check_version(&transaction)?;
    let (count, bytes) = usage(&transaction)?;
    if let Some(existing) = transaction
        .query_row(
            "SELECT kind, id, revision, title, filename, payload FROM items WHERE kind = ?1 AND id = ?2",
            params![kind, item.id],
            read_item,
        )
        .optional()
        .map_err(|_| READ_ERROR)?
    {
        transaction.commit().map_err(|_| WRITE_ERROR)?;
        return Ok(Install::Existing(existing));
    }
    if count == MAX_ITEMS || bytes + item.bytes.len() as i64 > MAX_TOTAL_BYTES {
        return Err(CAPACITY_ERROR.into());
    }
    transaction
        .execute(
            "INSERT INTO items (kind, id, revision, title, filename, payload) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![kind, item.id, item.revision, item.title, item.filename, item.bytes],
        )
        .map_err(|_| WRITE_ERROR)?;
    transaction.commit().map_err(|_| WRITE_ERROR)?;
    Ok(Install::Added)
}

/// Übernimmt eine neuere Revision und gibt die tatsächlich gespeicherte Revision zurück.
pub fn update(root: &Path, item: &Item) -> Result<u32, String> {
    let kind = validate_item(item)?;
    let mut connection = open_existing_for_write(root)?.ok_or(MISSING_ITEM)?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|_| WRITE_ERROR)?;
    check_version(&transaction)?;
    let (revision, old_size) = transaction
        .query_row(
            "SELECT revision, length(payload) FROM items WHERE kind = ?1 AND id = ?2",
            params![kind, item.id],
            |row| Ok((row.get::<_, u32>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(|_| READ_ERROR)?
        .ok_or(MISSING_ITEM)?;
    if item.revision <= revision {
        return Ok(revision);
    }
    let (_, bytes) = usage(&transaction)?;
    if bytes - old_size + item.bytes.len() as i64 > MAX_TOTAL_BYTES {
        return Err(CAPACITY_ERROR.into());
    }
    transaction
        .execute(
            "UPDATE items SET revision = ?3, title = ?4, filename = ?5, payload = ?6
             WHERE kind = ?1 AND id = ?2",
            params![
                kind,
                item.id,
                item.revision,
                item.title,
                item.filename,
                item.bytes
            ],
        )
        .map_err(|_| WRITE_ERROR)?;
    transaction.commit().map_err(|_| WRITE_ERROR)?;
    Ok(item.revision)
}

fn open_existing_for_write(root: &Path) -> Result<Option<Connection>, String> {
    validate_hub_store(root)?;
    let Some((path, true)) = database_path(root)? else {
        return Ok(None);
    };
    check_header(&path)?;
    open(&path, OpenFlags::SQLITE_OPEN_READ_WRITE).map(Some)
}

fn validate_item(item: &Item) -> Result<i64, String> {
    let (kind, limit) = match item.kind {
        Kind::Characters => (1, MAX_CHARACTER_BYTES),
        Kind::Lorebooks => (2, MAX_LOREBOOK_BYTES),
        _ => return Err("Dieser Hub-Inhalt kann nicht dauerhaft gespeichert werden.".into()),
    };
    if item.bytes.is_empty() || item.bytes.len() > limit {
        return Err(CAPACITY_ERROR.into());
    }
    if item.revision == 0
        || [&item.id, &item.title, &item.filename]
            .iter()
            .any(|value| value.trim().is_empty() || value.len() > 4096)
    {
        return Err("Die Hub-Metadaten sind ungültig oder zu groß.".into());
    }
    Ok(kind)
}

fn read_item(row: &Row<'_>) -> rusqlite::Result<Item> {
    let kind = match row.get(0)? {
        1 => Kind::Characters,
        2 => Kind::Lorebooks,
        value => return Err(rusqlite::Error::IntegralValueOutOfRange(0, value)),
    };
    Ok(Item {
        kind,
        id: row.get(1)?,
        revision: row.get(2)?,
        title: row.get(3)?,
        filename: row.get(4)?,
        bytes: row.get(5)?,
    })
}

fn usage(connection: &Connection) -> Result<(i64, i64), String> {
    let (count, bytes) = connection
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(length(payload)), 0) FROM items",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .map_err(|_| READ_ERROR)?;
    if count > MAX_ITEMS || bytes > MAX_TOTAL_BYTES {
        return Err(CAPACITY_ERROR.into());
    }
    Ok((count, bytes))
}

fn open(path: &Path, flags: OpenFlags) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(path, flags | OpenFlags::SQLITE_OPEN_NOFOLLOW)
        .map_err(|_| ACCESS_ERROR)?;
    connection
        .busy_timeout(Duration::from_secs(3))
        .and_then(|()| connection.pragma_update(None, "trusted_schema", false))
        .map_err(|_| ACCESS_ERROR)?;
    Ok(connection)
}

fn check_version(connection: &Connection) -> Result<(), String> {
    let application = connection
        .pragma_query_value(None, "application_id", |row| row.get::<_, i32>(0))
        .map_err(|_| INVALID_STORE)?;
    let version = connection
        .pragma_query_value(None, "user_version", |row| row.get::<_, i32>(0))
        .map_err(|_| INVALID_STORE)?;
    if application != APPLICATION_ID || version != SCHEMA_VERSION {
        return Err(INVALID_STORE.into());
    }
    Ok(())
}

fn check_header(path: &Path) -> Result<(), String> {
    // Prüft die SQLite-Dateikennung vor einem Schreibzugriff, der ein Journal
    // wiederherstellen könnte. Beide Metafelder liegen im unveränderlichen Dateikopf.
    let mut header = [0; 72];
    File::open(path)
        .and_then(|mut file| file.read_exact(&mut header))
        .map_err(|_| INVALID_STORE)?;
    if &header[..16] != b"SQLite format 3\0"
        || header[60..64] != SCHEMA_VERSION.to_be_bytes()
        || header[68..72] != APPLICATION_ID.to_be_bytes()
    {
        return Err(INVALID_STORE.into());
    }
    Ok(())
}

fn initialize(path: &Path) -> Result<(), String> {
    let temporary = tempfile::NamedTempFile::new_in(path.parent().ok_or(ACCESS_ERROR)?)
        .map_err(|_| WRITE_ERROR)?;
    {
        let mut connection = open(temporary.path(), OpenFlags::SQLITE_OPEN_READ_WRITE)?;
        let transaction = connection.transaction().map_err(|_| WRITE_ERROR)?;
        transaction
            .pragma_update(None, "application_id", APPLICATION_ID)
            .and_then(|()| transaction.pragma_update(None, "user_version", SCHEMA_VERSION))
            .and_then(|()| {
                transaction.execute_batch(
                    "CREATE TABLE items (
                        kind INTEGER NOT NULL CHECK(kind IN (1, 2)),
                        id TEXT NOT NULL CHECK(length(CAST(id AS BLOB)) BETWEEN 1 AND 4096),
                        revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 4294967295),
                        title TEXT NOT NULL CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 4096),
                        filename TEXT NOT NULL CHECK(length(CAST(filename AS BLOB)) BETWEEN 1 AND 4096),
                        payload BLOB NOT NULL CHECK(length(payload) BETWEEN 1 AND
                            CASE kind WHEN 1 THEN 33554432 ELSE 4194304 END),
                        PRIMARY KEY(kind, id)
                    ) STRICT",
                )
            })
            .map_err(|_| WRITE_ERROR)?;
        transaction.commit().map_err(|_| WRITE_ERROR)?;
    }
    match temporary.persist_noclobber(path) {
        Ok(_) => Ok(()),
        Err(error) if error.error.kind() == io::ErrorKind::AlreadyExists => Ok(()),
        Err(_) => Err(WRITE_ERROR.into()),
    }
}

fn database_path(root: &Path) -> Result<Option<(PathBuf, bool)>, String> {
    let Some(metadata) = metadata(root)? else {
        return Ok(None);
    };
    if !metadata.is_dir() || is_link(&metadata) {
        return Err(ACCESS_ERROR.into());
    }
    let root = root.canonicalize().map_err(|_| ACCESS_ERROR)?;
    validate_hub_store(&root)?;
    let path = root.join(FILE_NAME);
    let exists = checked_file(&root, &path)?;
    for suffix in ["-journal", "-wal", "-shm"] {
        checked_file(&root, &root.join(format!("{FILE_NAME}{suffix}")))?;
    }
    Ok(Some((path, exists)))
}

fn checked_file(root: &Path, path: &Path) -> Result<bool, String> {
    let Some(metadata) = metadata(path)? else {
        return Ok(false);
    };
    if is_link(&metadata) || !metadata.is_file() {
        return Err(ACCESS_ERROR.into());
    }
    match path.canonicalize() {
        Ok(resolved) if resolved.parent() == Some(root) => Ok(true),
        // Ein anderer Prozess kann sein SQLite-Journal inzwischen abgeschlossen haben.
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        _ => Err(ACCESS_ERROR.into()),
    }
}

fn metadata(path: &Path) -> Result<Option<Metadata>, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => Ok(Some(metadata)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(ACCESS_ERROR.into()),
    }
}

fn is_link(metadata: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn book(revision: u32) -> Item {
        Item {
            kind: Kind::Lorebooks,
            id: "Welt/Ä".into(),
            revision,
            title: "Testwelt".into(),
            filename: "welt.json".into(),
            bytes: format!("{{\"revision\":{revision}}}").into_bytes(),
        }
    }

    #[test]
    fn missing_library_is_not_created_and_existing_payload_is_preserved() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("native");
        assert!(list(&root).unwrap().is_empty());
        assert!(!root.exists());
        let original = book(1);
        assert!(matches!(install(&root, &original), Ok(Install::Added)));
        let Install::Existing(existing) = install(&root, &book(2)).unwrap() else {
            panic!("Die vorhandene Version muss erhalten bleiben");
        };
        assert_eq!(existing.revision, 1);
        assert_eq!(existing.bytes, original.bytes);
        let loaded = list(&root).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, original.id);
        assert_eq!(loaded[0].bytes, original.bytes);
    }

    #[test]
    fn two_instances_reuse_the_first_complete_installation() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("native");
        let barrier = std::sync::Barrier::new(2);
        let (first, second) = std::thread::scope(|scope| {
            let first = scope.spawn(|| {
                barrier.wait();
                install(&root, &book(1)).unwrap()
            });
            let second = scope.spawn(|| {
                barrier.wait();
                install(&root, &book(2)).unwrap()
            });
            (first.join().unwrap(), second.join().unwrap())
        });
        let winner = match (first, second) {
            (Install::Added, Install::Existing(winner)) => {
                assert_eq!(winner.revision, 1);
                winner
            }
            (Install::Existing(winner), Install::Added) => {
                assert_eq!(winner.revision, 2);
                winner
            }
            _ => panic!("Genau eine Installation muss eingefügt worden sein"),
        };
        assert_eq!(list(&root).unwrap()[0].bytes, winner.bytes);
    }

    #[test]
    fn foreign_databases_are_rejected_without_modifications() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join(FILE_NAME);
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch("CREATE TABLE other (data TEXT)")
            .unwrap();
        drop(connection);
        let original = fs::read(&path).unwrap();
        assert!(list(root.path()).is_err());
        assert!(install(root.path(), &book(1)).is_err());
        assert!(update(root.path(), &book(2)).is_err());
        assert_eq!(fs::read(path).unwrap(), original);
    }

    #[test]
    fn updates_only_replace_a_stored_item_with_a_newer_revision() {
        let root = tempfile::tempdir().unwrap();
        let original = book(1);
        install(root.path(), &original).unwrap();
        let mut newer = book(3);
        newer.title = "Neue Testwelt".into();
        newer.filename = "neue-welt.json".into();
        assert_eq!(update(root.path(), &newer).unwrap(), 3);
        assert_eq!(update(root.path(), &book(2)).unwrap(), 3);
        let mut same = book(3);
        same.bytes = b"other payload".to_vec();
        assert_eq!(update(root.path(), &same).unwrap(), 3);

        let items = list(root.path()).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].kind, original.kind);
        assert_eq!(items[0].id, original.id);
        assert_eq!(items[0].revision, newer.revision);
        assert_eq!(items[0].title, newer.title);
        assert_eq!(items[0].filename, newer.filename);
        assert_eq!(items[0].bytes, newer.bytes);
    }

    #[test]
    fn update_preserves_the_library_when_the_item_is_missing_or_invalid() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().join("native");
        assert!(update(&root, &book(2)).is_err());
        assert!(!root.exists());

        let original = book(1);
        install(&root, &original).unwrap();
        let mut missing = book(2);
        missing.id = "Andere Welt".into();
        assert!(update(&root, &missing).is_err());
        let mut oversized = book(2);
        oversized.bytes.resize(MAX_LOREBOOK_BYTES + 1, 0);
        assert!(update(&root, &oversized).is_err());

        let items = list(&root).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].revision, original.revision);
        assert_eq!(items[0].bytes, original.bytes);
    }

    #[test]
    fn oversized_download_is_rejected_before_creating_the_library() {
        let root = tempfile::tempdir().unwrap();
        let missing = root.path().join("native");
        let mut item = book(1);
        item.bytes.resize(MAX_LOREBOOK_BYTES + 1, 0);
        assert!(install(&missing, &item).is_err());
        assert!(!missing.exists());
    }

    #[cfg(unix)]
    #[test]
    fn database_and_journal_symlinks_are_rejected() {
        let root = tempfile::tempdir().unwrap();
        let foreign = root.path().join("foreign");
        fs::write(&foreign, b"foreign").unwrap();
        let db_link = root.path().join(FILE_NAME);
        std::os::unix::fs::symlink(&foreign, &db_link).unwrap();
        assert!(install(root.path(), &book(1)).is_err());
        fs::remove_file(db_link).unwrap();
        let journal = root.path().join(format!("{FILE_NAME}-journal"));
        std::os::unix::fs::symlink(&foreign, &journal).unwrap();
        assert!(install(root.path(), &book(1)).is_err());
        assert_eq!(fs::read(foreign).unwrap(), b"foreign");
    }
}
