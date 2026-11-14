//! A folder under the system's temp folder for one test, removed again when the test ends –
//! also when it fails. Declare it first in the test: locals drop in reverse order, so open
//! files and databases are closed before the folder goes (Windows can't remove them earlier).

use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

pub struct TestDir(PathBuf);

impl TestDir {
    /// `otakusoul-<name>-<process>-<n>`, created empty.
    pub fn new(name: &str) -> Self {
        static NEXT: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "otakusoul-{name}-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }
}

impl Deref for TestDir {
    type Target = Path;
    fn deref(&self) -> &Path {
        &self.0
    }
}

impl AsRef<Path> for TestDir {
    fn as_ref(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_removed_when_dropped() {
        let path = {
            let dir = TestDir::new("test-dir");
            std::fs::write(dir.join("file.txt"), b"x").unwrap();
            dir.to_path_buf()
        };
        assert!(!path.exists());
    }
}
