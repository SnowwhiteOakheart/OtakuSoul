//! Keeps API keys and tokens in the OS credential store (Secret Service, macOS Keychain,
//! Windows Credential Manager) instead of the plaintext JSON config files.
//!
//! Config structs keep their secret fields so the frontend API stays unchanged; only the
//! on-disk copy is blanked. If no credential store is available the value stays in the
//! file as before, so nothing gets lost on headless or minimal Linux setups.

use std::sync::atomic::{AtomicBool, Ordering};
use tracing::warn;

const SERVICE: &str = "com.snowwhite.otakusoul";

static STORE_WARNING_SHOWN: AtomicBool = AtomicBool::new(false);

fn entry(account: &str) -> Option<keyring::Entry> {
    match keyring::Entry::new(SERVICE, account) {
        Ok(entry) => Some(entry),
        Err(e) => {
            if !STORE_WARNING_SHOWN.swap(true, Ordering::Relaxed) {
                warn!(
                    "Kein Schlüsselbund verfügbar, Zugangsdaten bleiben in den Konfigurationsdateien: {}",
                    e
                );
            }
            None
        }
    }
}

/// Moves `value` into the credential store and blanks it, so the caller can write the
/// struct to disk. An empty value removes the stored credential. On failure the value is
/// left untouched and ends up in the file as a fallback.
pub fn externalize(account: &str, value: &mut String) {
    let Some(entry) = entry(account) else { return };
    if value.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => warn!(
                "Zugangsdaten '{}' konnten nicht gelöscht werden: {}",
                account, e
            ),
        }
        return;
    }
    match entry.set_password(value) {
        Ok(()) => value.clear(),
        Err(e) => warn!(
            "Zugangsdaten '{}' konnten nicht im Schlüsselbund gespeichert werden: {}",
            account, e
        ),
    }
}

/// Same as [`externalize`] for optional fields.
pub fn externalize_opt(account: &str, value: &mut Option<String>) {
    let mut inner = value.take().unwrap_or_default();
    externalize(account, &mut inner);
    *value = (!inner.is_empty()).then_some(inner);
}

/// Fills an empty `value` from the credential store. Returns `true` if the field still
/// held a plaintext secret from the file, i.e. the caller should save once to migrate it.
pub fn hydrate(account: &str, value: &mut String) -> bool {
    if !value.is_empty() {
        return entry(account).is_some();
    }
    if let Some(entry) = entry(account) {
        match entry.get_password() {
            Ok(secret) => *value = secret,
            Err(keyring::Error::NoEntry) => {}
            Err(e) => warn!(
                "Zugangsdaten '{}' konnten nicht gelesen werden: {}",
                account, e
            ),
        }
    }
    false
}

/// Same as [`hydrate`] for optional fields.
pub fn hydrate_opt(account: &str, value: &mut Option<String>) -> bool {
    let mut inner = value.take().unwrap_or_default();
    let needs_migration = hydrate(account, &mut inner);
    *value = (!inner.is_empty()).then_some(inner);
    needs_migration
}
