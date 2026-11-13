use super::http::get_http_client;

pub(super) const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub(super) const HUB_BASE_URL: &str =
    "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main";

/// The adult content repository: a second source, only fetched when NSFW is on and the age was
/// confirmed (`settings::nsfw_allowed`).
const NSFW_HUB_BASE_URL: &str =
    "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data-nsfw/main";

pub(super) fn nsfw_base() -> String {
    std::env::var("OTAKUSOUL_NSFW_HUB_BASE")
        .unwrap_or_else(|_| pinned_base(NSFW_HUB_BASE_URL, |p| p.nsfw.as_deref()))
}

/// How long a reload reads the data repositories at their newest commit: as long as
/// raw.githubusercontent.com may still serve an older copy of `main` (`Cache-Control: max-age=300`).
const PIN_TTL: std::time::Duration = std::time::Duration::from_secs(300);

/// The newest commits a reload in the hub found (`pin_latest_commits`).
struct PinnedCommits {
    at: std::time::Instant,
    main: Option<String>,
    nsfw: Option<String>,
}

static PINNED: std::sync::Mutex<Option<PinnedCommits>> = std::sync::Mutex::new(None);

/// `raw_main` (`…/owner/repo/main`) with `main` swapped for the pinned commit, while one is
/// pinned and fresh; otherwise `raw_main` itself.
fn pinned_base(raw_main: &str, commit: fn(&PinnedCommits) -> Option<&str>) -> String {
    let pinned = PINNED.lock().ok();
    let sha = pinned
        .as_ref()
        .and_then(|guard| guard.as_ref())
        .filter(|p| p.at.elapsed() < PIN_TTL)
        .and_then(commit);
    match (sha, raw_main.strip_suffix("/main")) {
        (Some(sha), Some(repo)) => format!("{repo}/{sha}"),
        _ => raw_main.to_string(),
    }
}

/// Git's ref listing of the repository behind a raw `…/owner/repo/main` address. It names the
/// newest commit of `main` at once, without the API's rate limit.
pub(super) fn git_refs_url(raw_main: &str) -> Option<String> {
    let repo = raw_main
        .strip_prefix("https://raw.githubusercontent.com/")?
        .strip_suffix("/main")?;
    Some(format!(
        "https://github.com/{repo}.git/info/refs?service=git-upload-pack"
    ))
}

/// The commit of `refs/heads/main` in a ref listing (pkt-lines: `003d<sha> refs/heads/main`).
pub(super) fn main_commit(refs: &str) -> Option<String> {
    refs.lines().find_map(|line| {
        let head = line.strip_suffix(" refs/heads/main")?;
        let sha = head.get(head.len().checked_sub(40)?..)?;
        sha.chars()
            .all(|c| c.is_ascii_hexdigit())
            .then(|| sha.to_string())
    })
}

async fn latest_commit(raw_main: &str) -> Option<String> {
    let fetch = async {
        let url = git_refs_url(raw_main).ok_or("keine GitHub-Adresse")?;
        let text = reqwest::Client::builder()
            .user_agent(BROWSER_USER_AGENT)
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| e.to_string())?
            .get(url)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())?;
        main_commit(&text).ok_or_else(|| "kein main-Zweig".to_string())
    };
    match fetch.await {
        Ok(sha) => Some(sha),
        Err(error) => {
            tracing::debug!("Hub: neuester Commit von {raw_main} nicht ermittelt: {error}");
            None
        }
    }
}

/// Reload button in the hub: the lists that follow come from the repositories' newest commits,
/// not from GitHub's cached copy of `main` (up to five minutes old after an upload). Without an
/// answer the hub keeps reading `main`.
pub async fn pin_latest_commits() {
    let nsfw = crate::modules::settings::nsfw_allowed();
    let (main, nsfw) = tokio::join!(latest_commit(HUB_BASE_URL), async {
        if nsfw {
            latest_commit(NSFW_HUB_BASE_URL).await
        } else {
            None
        }
    });
    if let Ok(mut pinned) = PINNED.lock() {
        *pinned = Some(PinnedCommits {
            at: std::time::Instant::now(),
            main,
            nsfw,
        });
    }
}

/// Address of a file in the adult content repository (`OTAKUSOUL_NSFW_HUB_BASE` for E2E).
pub fn nsfw_hub_url(file: &str) -> String {
    format!("{}/{file}", nsfw_base().trim_end_matches('/'))
}

/// The download comes from the adult content repository.
pub(super) fn from_nsfw_source(download_url: &str) -> bool {
    download_url.starts_with(nsfw_base().trim_end_matches('/'))
        || download_url.starts_with(NSFW_HUB_BASE_URL)
}

/// Downloads from the adult repository need NSFW on and a confirmed age.
pub(super) fn ensure_source_allowed(download_url: &str) -> Result<(), String> {
    if from_nsfw_source(download_url) && !crate::modules::settings::nsfw_allowed() {
        return Err(crate::err!("backend.hub.nsfwDisabled"));
    }
    Ok(())
}

/// The entries of a registry in the adult repository; it is optional, so a failure (offline,
/// not yet public) only logs and gives none.
pub(super) async fn nsfw_registry_items(file: &str, key: &str) -> Vec<serde_json::Value> {
    let fetch = async {
        let res = get_http_client()?
            .get(nsfw_hub_url(file))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !res.status().is_success() {
            return Err(format!("HTTP {}", res.status()));
        }
        res.json::<serde_json::Value>()
            .await
            .map_err(|e| e.to_string())
    };
    match fetch.await {
        Ok(value) => value
            .get(key)
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        Err(error) => {
            tracing::warn!("NSFW-Registry {file} nicht erreichbar: {error}");
            Vec::new()
        }
    }
}

/// Whether a registry entry is marked as adult content.
pub(super) fn is_nsfw(entry: &serde_json::Value) -> bool {
    entry.get("nsfw").and_then(|v| v.as_bool()).unwrap_or(false)
}

/// Address of a file in the data repository; `OTAKUSOUL_HUB_BASE` points the hub elsewhere (E2E
/// mock server).
pub fn hub_url(file: &str) -> String {
    let base = std::env::var("OTAKUSOUL_HUB_BASE")
        .unwrap_or_else(|_| pinned_base(HUB_BASE_URL, |p| p.main.as_deref()));
    format!("{}/{file}", base.trim_end_matches('/'))
}

/// Texts of a registry entry in other languages (`translations.<lang>.<field>`); anything that is
/// not a string is left out.
pub(super) fn entry_translations(
    entry: &serde_json::Value,
) -> std::collections::HashMap<String, std::collections::HashMap<String, String>> {
    entry
        .get("translations")
        .and_then(|v| v.as_object())
        .map(|langs| {
            langs
                .iter()
                .filter_map(|(lang, fields)| {
                    let texts: std::collections::HashMap<String, String> = fields
                        .as_object()?
                        .iter()
                        .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                        .collect();
                    (!texts.is_empty()).then(|| (lang.clone(), texts))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Revision and date of a registry entry (entries without them count as revision 1).
pub(super) fn entry_revision(entry: &serde_json::Value) -> (u32, String) {
    let revision = entry
        .get("revision")
        .and_then(|v| v.as_u64())
        .map_or(1, |n| n.max(1) as u32);
    let updated = entry
        .get("updated")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    (revision, updated)
}
