use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_notes: Option<String>,
    pub release_url: String,
    pub published_at: Option<String>,
}

#[derive(Deserialize)]
struct GitHubReleaseResponse {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
}

pub async fn check_for_app_updates() -> Result<UpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let url = "https://api.github.com/repos/SnowwhiteOakheart/OtakuSoul/releases/latest";

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .user_agent("OtakuSoul-Desktop-App")
        .build()
        .map_err(|e| format!("Fehler beim Initialisieren des HTTP-Clients: {}", e))?;

    let res = client.get(url).send().await;

    match res {
        Ok(response) => {
            if response.status().is_success()
                && let Ok(rel) = response.json::<GitHubReleaseResponse>().await
            {
                let clean_tag = rel.tag_name.trim_start_matches('v').to_string();
                let has_update = is_version_newer(&clean_tag, &current_version);
                return Ok(UpdateInfo {
                    current_version,
                    latest_version: clean_tag,
                    has_update,
                    release_notes: rel.body,
                    release_url: rel.html_url,
                    published_at: rel.published_at,
                });
            }
        }
        Err(e) => {
            tracing::warn!("Update-Prüfung fehlgeschlagen: {}", e);
        }
    }

    // Fallback if no network or no release found yet
    Ok(UpdateInfo {
        current_version: current_version.clone(),
        latest_version: current_version,
        has_update: false,
        release_notes: None,
        release_url: "https://github.com/SnowwhiteOakheart/OtakuSoul/releases".to_string(),
        published_at: None,
    })
}

fn is_version_newer(latest: &str, current: &str) -> bool {
    let parse_semver = |s: &str| -> Vec<u32> {
        s.split('.')
            .map(|part| {
                part.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
            })
            .filter_map(|part| part.parse::<u32>().ok())
            .collect()
    };

    let l = parse_semver(latest);
    let c = parse_semver(current);

    if l.len() >= 3 && c.len() >= 3 {
        if l[0] > c[0] {
            return true;
        }
        if l[0] == c[0] && l[1] > c[1] {
            return true;
        }
        if l[0] == c[0] && l[1] == c[1] && l[2] > c[2] {
            return true;
        }
    }
    false
}
