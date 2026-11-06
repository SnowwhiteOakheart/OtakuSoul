//! Contributing own characters and stories to the hub (`otakusoul-data`): a check of what the
//! hub needs, a ZIP package in the repository's layout (card or scene, manifest with licence and
//! age mark, instructions) and the address of a prefilled issue in the data repository. The app
//! holds no GitHub token: the user attaches the package to the issue, the maintainers review it.

use crate::modules::characters::{CharacterProfile, card_png_bytes};
use crate::modules::stage::SceneDefinition;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write as _;
use ts_rs::TS;

/// Licences a contribution may carry (the hub shows them).
pub const LICENSES: [&str; 3] = ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0"];

const HUB_REPO: &str = "SnowwhiteOakheart/otakusoul-data";
const NSFW_HUB_REPO: &str = "SnowwhiteOakheart/otakusoul-data-nsfw";
/// A card picture larger than this is not worth putting into the repository.
const MAX_PICTURE_BYTES: usize = 8 * 1024 * 1024;
/// Key in a card's or scene's `extensions` with the licence ID.
const LICENSE_KEY: &str = "otakusoul_license";

/// What the check found: an error stops the contribution, a warning is worth a look.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct Finding {
    pub error: bool,
    /// Stable code; the interface has the text (`contribute.check.<code>`).
    pub code: String,
    /// Extra detail for the text (a count, a field), may be empty.
    pub detail: String,
}

fn error(code: &str) -> Finding {
    Finding {
        error: true,
        code: code.into(),
        detail: String::new(),
    }
}

fn warning(code: &str, detail: &str) -> Finding {
    Finding {
        error: false,
        code: code.into(),
        detail: detail.into(),
    }
}

/// What the user says about the contribution.
#[derive(Debug, Clone, Deserialize, TS)]
#[ts(export)]
pub struct SubmissionInfo {
    pub license: String,
    pub author: String,
    /// Content for adults: goes to the adult hub and carries `otakusoul_nsfw`.
    pub adult: bool,
}

/// The result of an export: where to open the issue.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ContributionResult {
    pub issue_url: String,
    pub files: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Character,
    Story,
}

impl Kind {
    pub fn parse(kind: &str) -> Result<Self, String> {
        match kind {
            "character" => Ok(Self::Character),
            "story" => Ok(Self::Story),
            _ => Err(crate::err!("backend.contribution.kind", kind = kind)),
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Character => "character",
            Self::Story => "story",
        }
    }
}

fn blank(text: &str) -> bool {
    text.trim().is_empty()
}

fn has_english(extensions: &serde_json::Value) -> bool {
    extensions
        .get(crate::modules::characters::I18N_EXTENSION)
        .and_then(|i| i.get("translations"))
        .and_then(|t| t.get("en"))
        .is_some_and(|en| en.as_object().is_some_and(|o| !o.is_empty()))
}

pub fn check_character(profile: &CharacterProfile) -> Vec<Finding> {
    let data = &profile.card.data;
    let mut found = Vec::new();
    if blank(&data.name) {
        found.push(error("nameMissing"));
    }
    if blank(&data.description) {
        found.push(error("descriptionMissing"));
    }
    if blank(&data.first_mes) {
        found.push(error("firstMessageMissing"));
    }
    match profile.avatar_png_bytes() {
        None => found.push(error("pictureMissing")),
        Some(bytes) if bytes.len() > MAX_PICTURE_BYTES => found.push(error("pictureTooBig")),
        Some(_) => {}
    }
    if blank(&data.personality) {
        found.push(warning("personalityMissing", ""));
    }
    if blank(&data.scenario) {
        found.push(warning("scenarioMissing", ""));
    }
    if data.alternate_greetings.is_empty() {
        found.push(warning("fewGreetings", ""));
    }
    if data.tags.is_empty() {
        found.push(warning("tagsMissing", ""));
    }
    if !has_english(&data.extensions) {
        found.push(warning("noEnglish", ""));
    }
    for link in crate::modules::characters::invalid_model_links(&data.extensions) {
        found.push(Finding {
            error: true,
            code: "modelLinkInvalid".into(),
            detail: link,
        });
    }
    found
}

pub fn check_story(def: &SceneDefinition) -> Vec<Finding> {
    let mut found = Vec::new();
    if blank(&def.title) {
        found.push(error("titleMissing"));
    }
    if blank(&def.description) {
        found.push(error("descriptionMissing"));
    }
    if blank(&def.opening_narration) {
        found.push(error("openingMissing"));
    }
    if blank(&def.starting_location) {
        found.push(error("locationMissing"));
    }
    if def.party.is_empty() && !def.solo_mode {
        found.push(warning("partyMissing", ""));
    }
    if !has_english(&def.extensions) {
        found.push(warning("noEnglish", ""));
    }
    // Companions must exist in the hub or in the app; the maintainers check that, the author is told.
    if !def.party.is_empty() {
        found.push(warning("partyMustExist", &def.party.join(", ")));
    }
    found
}

fn validate_info(info: &SubmissionInfo) -> Result<(), String> {
    if !LICENSES.contains(&info.license.as_str()) {
        return Err(crate::err!(
            "backend.contribution.license",
            license = info.license
        ));
    }
    let author = info.author.trim();
    if author.is_empty() || author.chars().count() > 80 {
        return Err(crate::err!("backend.contribution.author"));
    }
    Ok(())
}

/// A file name of letters, digits, `-` and `_` from a title.
fn slug(title: &str) -> String {
    let mut out: String = title
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    while out.contains("__") {
        out = out.replace("__", "_");
    }
    let out = out.trim_matches('_').to_string();
    if out.is_empty() {
        "beitrag".into()
    } else {
        out.chars().take(60).collect()
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn stamp(extensions: &mut serde_json::Value, info: &SubmissionInfo) {
    if !extensions.is_object() {
        *extensions = serde_json::json!({});
    }
    extensions[LICENSE_KEY] = info.license.clone().into();
    if info.adult {
        crate::modules::nsfw::mark(extensions);
    }
}

/// The card as the repository wants it: a PNG with the card inside, licence and age mark set.
pub fn character_files(
    profile: &CharacterProfile,
    info: &SubmissionInfo,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut profile = profile.clone();
    stamp(&mut profile.card.data.extensions, info);
    if blank(profile.card.data.creator.as_deref().unwrap_or_default()) {
        profile.card.data.creator = Some(info.author.trim().to_string());
    }
    let name = slug(&profile.card.data.name);
    Ok(vec![(
        format!("cards_gateway/{name}.png"),
        card_png_bytes(&profile)?,
    )])
}

/// The scene as the repository wants it: the definition without this computer's traces.
pub fn story_files(
    def: &SceneDefinition,
    info: &SubmissionInfo,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    let mut def = def.clone();
    stamp(&mut def.extensions, info);
    let name = slug(&def.title);
    def.id = name.clone();
    def.folder = String::new();
    def.created_at = String::new();
    def.last_played = None;
    let json = serde_json::to_string_pretty(&def)
        .map_err(|e| crate::err!("backend.contribution.serialize", error = e))?;
    Ok(vec![(
        format!("stages_gateway/{name}.json"),
        json.into_bytes(),
    )])
}

fn repo_of(info: &SubmissionInfo) -> &'static str {
    if info.adult { NSFW_HUB_REPO } else { HUB_REPO }
}

const README: &str = "OtakuSoul – Beitrag fürs Hub / contribution for the hub\n\n\
DE: Öffne das vorbefüllte Issue (oder die Seite „New issue“ im Daten-Repo) und ziehe diese ZIP-Datei hinein.\n\
Die Dateien sind schon im Ordner-Layout des Repositories; wer lieber einen Pull Request macht, legt sie dort\n\
ab und trägt den Eintrag in die passende Registry ein (siehe README des Daten-Repos). EINREICHUNG.json\n\
enthält Prüfsummen, Lizenz, Altersmarke und die Ergebnisse der Prüfung.\n\n\
EN: Open the prefilled issue (or “New issue” in the data repository) and drag this ZIP into it. The files already\n\
follow the repository layout; for a pull request, put them there and add the registry entry (see the data\n\
repository's README). EINREICHUNG.json holds the checksums, licence, age mark and the check results.\n";

/// The package: the files, a manifest and the instructions.
pub fn build_package(
    kind: Kind,
    title: &str,
    info: &SubmissionInfo,
    files: &[(String, Vec<u8>)],
    findings: &[Finding],
) -> Result<Vec<u8>, String> {
    let manifest = serde_json::json!({
        "schema": 1,
        "kind": kind.name(),
        "title": title,
        "author": info.author.trim(),
        "license": info.license,
        "adult": info.adult,
        "target_repo": repo_of(info),
        "app_version": env!("CARGO_PKG_VERSION"),
        "created": chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
        "files": files.iter().map(|(path, bytes)| serde_json::json!({
            "path": path, "bytes": bytes.len(), "sha256": sha256_hex(bytes),
        })).collect::<Vec<_>>(),
        "checks": findings.iter().map(|f| serde_json::json!({
            "severity": if f.error { "error" } else { "warning" }, "code": f.code, "detail": f.detail,
        })).collect::<Vec<_>>(),
    });
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let mut add = |name: &str, bytes: &[u8]| -> Result<(), String> {
        writer
            .start_file(name, options)
            .map_err(|e| e.to_string())?;
        writer.write_all(bytes).map_err(|e| e.to_string())
    };
    for (path, bytes) in files {
        add(path, bytes)?;
    }
    add(
        "EINREICHUNG.json",
        serde_json::to_string_pretty(&manifest)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )?;
    add("README.txt", README.as_bytes())?;
    writer
        .finish()
        .map(std::io::Cursor::into_inner)
        .map_err(|e| e.to_string())
}

/// The prefilled "new issue" page of the data repository for this contribution.
pub fn issue_url(kind: Kind, title: &str, info: &SubmissionInfo, findings: &[Finding]) -> String {
    let warnings = findings.iter().filter(|f| !f.error).count();
    let body = format!(
        "**Art / Kind:** {}\n**Titel / Title:** {}\n**Autor:in / Author:** {}\n**Lizenz / License:** {}\n**Ab 18 / Adult:** {}\n**Warnungen der Prüfung / Check warnings:** {}\n\n\
         ZIP-Paket hier anhängen / attach the ZIP package here:\n\n",
        kind.name(),
        title,
        info.author.trim(),
        info.license,
        if info.adult { "ja / yes" } else { "nein / no" },
        warnings
    );
    format!(
        "https://github.com/{}/issues/new?title={}&body={}&template=einreichung.md",
        repo_of(info),
        urlencoding::encode(&format!("Beitrag: {title}")),
        urlencoding::encode(&body)
    )
}

/// Everything for one contribution: the findings (none of them an error), the package bytes and
/// the issue address. `Err` carries the first error finding's code as a message.
pub fn prepare(
    kind: Kind,
    title: &str,
    info: &SubmissionInfo,
    findings: &[Finding],
    files: Vec<(String, Vec<u8>)>,
) -> Result<(Vec<u8>, ContributionResult), String> {
    validate_info(info)?;
    if let Some(blocker) = findings.iter().find(|f| f.error) {
        return Err(crate::err!(
            "backend.contribution.blocked",
            code = blocker.code
        ));
    }
    let bytes = build_package(kind, title, info, &files, findings)?;
    Ok((
        bytes,
        ContributionResult {
            issue_url: issue_url(kind, title, info, findings),
            files: files.len() as u32 + 2,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read as _;

    fn info(adult: bool) -> SubmissionInfo {
        SubmissionInfo {
            license: "CC0-1.0".into(),
            author: " Sakura ".into(),
            adult,
        }
    }

    fn story() -> SceneDefinition {
        serde_json::from_str(include_str!(
            "../../../presets/stories/scenes/story_frozen_bells.json"
        ))
        .unwrap()
    }

    #[test]
    fn a_complete_story_has_no_errors_and_an_empty_one_is_stopped() {
        assert!(!check_story(&story()).iter().any(|f| f.error));
        let mut empty = story();
        empty.title = " ".into();
        empty.opening_narration = String::new();
        let codes: Vec<_> = check_story(&empty)
            .into_iter()
            .filter(|f| f.error)
            .map(|f| f.code)
            .collect();
        assert_eq!(codes, ["titleMissing", "openingMissing"]);
        assert!(prepare(Kind::Story, "x", &info(false), &check_story(&empty), vec![]).is_err());
    }

    #[test]
    fn the_package_has_the_files_a_manifest_with_checksums_and_the_marks() {
        let mut def = story();
        def.title = "Die Glocken von Frostweiler!".into();
        let files = story_files(&def, &info(true)).unwrap();
        assert_eq!(
            files[0].0,
            "stages_gateway/Die_Glocken_von_Frostweiler.json"
        );
        let scene: serde_json::Value = serde_json::from_slice(&files[0].1).unwrap();
        assert_eq!(scene["extensions"]["otakusoul_license"], "CC0-1.0");
        assert_eq!(scene["extensions"]["otakusoul_nsfw"], true);
        assert_eq!(scene["id"], "Die_Glocken_von_Frostweiler");

        let findings = check_story(&def);
        let (bytes, result) = prepare(
            Kind::Story,
            &def.title,
            &info(true),
            &findings,
            files.clone(),
        )
        .unwrap();
        assert_eq!(result.files, 3);
        let mut book = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut manifest = String::new();
        book.by_name("EINREICHUNG.json")
            .unwrap()
            .read_to_string(&mut manifest)
            .unwrap();
        let manifest: serde_json::Value = serde_json::from_str(&manifest).unwrap();
        assert_eq!(manifest["author"], "Sakura");
        assert_eq!(
            manifest["target_repo"], NSFW_HUB_REPO,
            "adult content goes to the adult hub"
        );
        assert_eq!(manifest["files"][0]["sha256"], sha256_hex(&files[0].1));
        assert!(book.by_name("README.txt").is_ok());
        assert!(
            book.by_name("stages_gateway/Die_Glocken_von_Frostweiler.json")
                .is_ok()
        );
    }

    #[test]
    fn the_issue_address_is_prefilled_and_escaped() {
        let url = issue_url(Kind::Character, "Lirwen & Co <3>", &info(false), &[]);
        assert!(
            url.starts_with(
                "https://github.com/SnowwhiteOakheart/otakusoul-data/issues/new?title="
            )
        );
        assert!(url.contains("Lirwen%20%26%20Co%20%3C3%3E"));
        assert!(!url.contains(' ') && !url.contains('<'));
        assert!(issue_url(Kind::Story, "x", &info(true), &[]).contains("otakusoul-data-nsfw"));
    }

    #[test]
    fn only_known_licences_and_a_reasonable_author_pass() {
        let mut bad = info(false);
        bad.license = "GPL-3.0".into();
        assert!(validate_info(&bad).is_err());
        bad.license = "CC-BY-4.0".into();
        assert!(validate_info(&bad).is_ok());
        bad.author = "  ".into();
        assert!(validate_info(&bad).is_err());
        assert_eq!(slug("Ünï cödé / Ä"), "n_c_d");
        assert_eq!(slug("???"), "beitrag");
    }
}
