use directories::ProjectDirs;
use std::ffi::OsString;
use std::path::PathBuf;

/// Liefert die normalen Plattformpfade für OtakuSoul, ohne `OTAKUSOUL_HOME` auszuwerten.
///
/// Fällt `ProjectDirs` auf der Plattform aus, werden wie bisher `./config` und `./data`
/// verwendet.
pub fn production_dirs() -> (PathBuf, PathBuf) {
    match ProjectDirs::from("com", "snowwhite", "otakusoul") {
        Some(dirs) => (
            dirs.config_dir().to_path_buf(),
            dirs.data_dir().to_path_buf(),
        ),
        None => (PathBuf::from("./config"), PathBuf::from("./data")),
    }
}

/// Liefert `(config_dir, data_dir)`: Plattformpfade oder bei gesetztem `OTAKUSOUL_HOME`
/// `<home>/config` und `<home>/data` (zum Beispiel für isolierte Tests).
pub fn base_dirs() -> (PathBuf, PathBuf) {
    if let Some(home) = isolated_home() {
        return (home.join("config"), home.join("data"));
    }
    production_dirs()
}

/// Liefert den Profilordner aus `OTAKUSOUL_HOME`, falls ein isoliertes Profil aktiv ist.
pub fn isolated_home() -> Option<PathBuf> {
    isolated_home_from(std::env::var_os("OTAKUSOUL_HOME"))
}

fn isolated_home_from(value: Option<OsString>) -> Option<PathBuf> {
    value.filter(|value| !value.is_empty()).map(PathBuf::from)
}

#[cfg(test)]
mod tests {
    use super::isolated_home_from;
    use std::ffi::OsString;
    use std::path::PathBuf;

    #[test]
    fn isolated_home_ignores_empty_value_without_changing_environment() {
        assert_eq!(isolated_home_from(None), None);
        assert_eq!(isolated_home_from(Some(OsString::new())), None);
        assert_eq!(
            isolated_home_from(Some(OsString::from("profile"))),
            Some(PathBuf::from("profile"))
        );
    }
}
