//! VRoid Hub: sign in with the user's own account (OAuth with PKCE and a fixed loopback
//! redirect), list the models they uploaded or liked, and use them as 3D avatars.
//!
//! pixiv's developer terms allow a model only for the signed-in user it is licensed to, and no
//! use or sharing outside the app. So a downloaded VRM is kept encrypted (AES-256-GCM, the key in
//! the OS credential store) in `<data>/vroid/<user id>/`, decrypted only in memory for the viewer,
//! and deleted when the user signs out or the model is no longer available to them. Without a
//! credential store no model file is written; it is then loaded from VRoid Hub each time.
//!
//! A model is known to the rest of the app as the path `vroid:<model id>` (format `vroid` in the
//! avatar list); `read_file_binary` hands such a path to [`model_bytes`].
//!
//! The client secret is baked into release builds from the `VROID_CLIENT_SECRET` environment
//! variable (a GitHub Actions secret); builds without it hide the sign-in.

use base64::Engine;
use ring::aead::{AES_256_GCM, Aad, LessSafeKey, NONCE_LEN, Nonce, UnboundKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::net::TcpListener;
use tokio::sync::Notify;
use tracing::warn;
use ts_rs::TS;

const HUB: &str = "https://hub.vroid.com";
/// VRoid Hub's own header, required on every API request.
const API_VERSION: &str = "11";
/// Application ID of OtakuSoul on VRoid Hub (public).
const CLIENT_ID: &str = "f-gDzdEkE8LVgYq9Qv7j_Z2d-6-_gekmc-pzU_eYaYI";
const CLIENT_SECRET: Option<&str> = option_env!("VROID_CLIENT_SECRET");
/// Registered redirect (must match exactly, so the port is fixed).
const REDIRECT_PORT: u16 = 47823;
const REDIRECT_PATH: &str = "/vroidhub/callback";
/// Path prefix of a VRoid Hub model in the avatar list and on character cards.
pub const PATH_PREFIX: &str = "vroid:";
const TOKEN_ACCOUNT: &str = "vroid_hub_token";
const CACHE_KEY_ACCOUNT: &str = "vroid_hub_cache_key";
/// Start of an encrypted model file (format version 1).
const MAGIC: &[u8] = b"OSVROID1";
const LOGIN_TIMEOUT: Duration = Duration::from_secs(5 * 60);
/// Largest model accepted from VRoid Hub.
const MAX_MODEL_BYTES: u64 = 512 * 1024 * 1024;
/// Pages read per list (100 models each).
const MAX_PAGES: usize = 5;

static CANCEL: LazyLock<Notify> = LazyLock::new(Notify::new);
/// Signed-in tokens; also the only copy when there is no credential store.
static TOKEN: LazyLock<Mutex<Option<Token>>> = LazyLock::new(|| Mutex::new(load_token()));

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Token {
    access_token: String,
    refresh_token: String,
    /// Unix seconds.
    expires_at: u64,
}

/// The signed-in VRoid Hub account.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct VroidAccount {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
}

/// Whether VRoid Hub can be used and who is signed in.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct VroidStatus {
    /// This build carries the client secret (official releases).
    pub configured: bool,
    pub account: Option<VroidAccount>,
    /// Model files are stored encrypted; `false` without a credential store (loaded each time).
    pub cache_available: bool,
}

/// One line of the "Model Data Conditions of Use" (VRoid's display guidelines).
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[ts(export)]
pub struct VroidCondition {
    /// `avatarUse`, `violentActs`, `sexualActs`, `politicalReligious`, `antisocialHate`,
    /// `corporateUse`, `individualCommercial`, `redistribution`, `alterations`,
    /// `redistributionAltered`, `attribution`.
    pub label: String,
    /// `allow`, `disallow`, `notSet`, `nonprofit`, `required` or `notRequired`.
    pub value: String,
}

/// A model of the signed-in user (own upload or liked) as the app lists it.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct VroidModel {
    pub id: String,
    /// Model name, else the character's name.
    pub name: String,
    pub character_name: String,
    pub author_name: String,
    pub portrait_url: Option<String>,
    /// The model's page on VRoid Hub.
    pub page_url: String,
    /// Uploaded by the signed-in user.
    pub own: bool,
    /// `0.0` or `1.0`.
    pub vrm_version: String,
    #[ts(type = "number")]
    pub size_mb: u64,
    pub conditions: Vec<VroidCondition>,
    /// The author must be named wherever the model is shown.
    pub credit_required: bool,
    /// Added to the app's avatars.
    #[serde(default)]
    pub added: bool,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn secret() -> Option<&'static str> {
    CLIENT_SECRET.filter(|s| !s.trim().is_empty())
}

fn redirect_uri() -> String {
    format!("http://127.0.0.1:{REDIRECT_PORT}{REDIRECT_PATH}")
}

/// Model ids are numbers; anything else never becomes part of a file name.
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 40
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

/// The model id of a `vroid:<id>` path.
pub fn model_id_of(path: &str) -> Option<&str> {
    path.strip_prefix(PATH_PREFIX).filter(|id| valid_id(id))
}

// ---------- folders ----------

fn root_dir() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir).join("vroid")
}

fn account_file() -> PathBuf {
    root_dir().join("account.json")
}

fn load_account() -> Option<VroidAccount> {
    serde_json::from_str(&std::fs::read_to_string(account_file()).ok()?).ok()
}

fn models_dir(account: &VroidAccount) -> Option<PathBuf> {
    valid_id(&account.id).then(|| root_dir().join(&account.id))
}

fn meta_file(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

fn model_file(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.vrm.enc"))
}

// ---------- tokens and cache key ----------

fn load_token() -> Option<Token> {
    serde_json::from_str(&crate::modules::secrets::read(TOKEN_ACCOUNT)?).ok()
}

fn store_token(token: Option<Token>) {
    match &token {
        Some(t) => {
            if let Ok(json) = serde_json::to_string(t) {
                crate::modules::secrets::write(TOKEN_ACCOUNT, &json);
            }
        }
        None => crate::modules::secrets::remove(TOKEN_ACCOUNT),
    }
    if let Ok(mut slot) = TOKEN.lock() {
        *slot = token;
    }
}

fn signed_in() -> bool {
    TOKEN.lock().map(|t| t.is_some()).unwrap_or(false)
}

/// The cache key from the credential store, created on first use; `None` without a store.
fn cache_key() -> Option<LessSafeKey> {
    let base64 = base64::engine::general_purpose::STANDARD;
    let bytes = match crate::modules::secrets::read(CACHE_KEY_ACCOUNT)
        .and_then(|k| base64.decode(k).ok())
        .filter(|k| k.len() == 32)
    {
        Some(bytes) => bytes,
        None => {
            let fresh = rand::random::<[u8; 32]>();
            if !crate::modules::secrets::write(CACHE_KEY_ACCOUNT, &base64.encode(fresh)) {
                return None;
            }
            fresh.to_vec()
        }
    };
    UnboundKey::new(&AES_256_GCM, &bytes)
        .ok()
        .map(LessSafeKey::new)
}

/// Encrypts a model; the id is bound in as associated data (a file renamed to another id fails).
fn seal(key: &LessSafeKey, id: &str, plain: &[u8]) -> Option<Vec<u8>> {
    let nonce = rand::random::<[u8; NONCE_LEN]>();
    let mut body = plain.to_vec();
    key.seal_in_place_append_tag(
        Nonce::assume_unique_for_key(nonce),
        Aad::from(id.as_bytes()),
        &mut body,
    )
    .ok()?;
    let mut out = Vec::with_capacity(MAGIC.len() + NONCE_LEN + body.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&body);
    Some(out)
}

fn open(key: &LessSafeKey, id: &str, sealed: &[u8]) -> Option<Vec<u8>> {
    let rest = sealed.strip_prefix(MAGIC)?;
    if rest.len() < NONCE_LEN {
        return None;
    }
    let (nonce, body) = rest.split_at(NONCE_LEN);
    let nonce = Nonce::try_assume_unique_for_key(nonce).ok()?;
    let mut body = body.to_vec();
    let plain_len = key
        .open_in_place(nonce, Aad::from(id.as_bytes()), &mut body)
        .ok()?
        .len();
    body.truncate(plain_len);
    Some(body)
}

// ---------- HTTP ----------

fn client(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))
}

/// `application/x-www-form-urlencoded` body (OAuth endpoints).
fn form_body(fields: &[(&str, &str)]) -> String {
    let mut url = reqwest::Url::parse("http://localhost/").expect("valid URL");
    url.query_pairs_mut().extend_pairs(fields);
    url.query().unwrap_or_default().to_string()
}

fn post_form(
    client: &reqwest::Client,
    url: String,
    fields: &[(&str, &str)],
) -> reqwest::RequestBuilder {
    client
        .post(url)
        .header("X-Api-Version", API_VERSION)
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .body(form_body(fields))
}

/// Error text of an OAuth or API answer (`error_description`, `error.message` or the body).
async fn failure(response: reqwest::Response) -> String {
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let json: Option<Value> = serde_json::from_str(&body).ok();
    json.as_ref()
        .and_then(|j| {
            j["error_description"]
                .as_str()
                .or_else(|| j["error"]["message"].as_str())
                .or_else(|| j["error"].as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| format!("{status} {}", body.chars().take(200).collect::<String>()))
}

/// Swaps a code or refresh token for tokens.
async fn token_request(form: &[(&str, &str)]) -> Result<Token, String> {
    let secret = secret().ok_or_else(|| crate::err!("backend.vroid.notConfigured"))?;
    let mut fields = vec![("client_id", CLIENT_ID), ("client_secret", secret)];
    fields.extend_from_slice(form);
    let response = post_form(
        &client(Duration::from_secs(30))?,
        format!("{HUB}/oauth/token"),
        &fields,
    )
    .send()
    .await
    .map_err(|e| crate::err!("backend.vroid.request", error = e))?;
    if !response.status().is_success() {
        return Err(crate::err!(
            "backend.vroid.token",
            error = failure(response).await
        ));
    }
    let json: Value = response
        .json()
        .await
        .map_err(|e| crate::err!("backend.vroid.token", error = e))?;
    let access_token = json["access_token"]
        .as_str()
        .filter(|t| !t.is_empty())
        .ok_or_else(|| crate::err!("backend.vroid.token", error = "no access_token"))?;
    Ok(Token {
        access_token: access_token.to_string(),
        refresh_token: json["refresh_token"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        expires_at: now() + json["expires_in"].as_u64().unwrap_or(3600),
    })
}

/// A valid access token, refreshed when it runs out; signed out when that fails.
async fn access_token() -> Result<String, String> {
    let token = TOKEN
        .lock()
        .ok()
        .and_then(|t| t.clone())
        .ok_or_else(|| crate::err!("backend.vroid.signedOut"))?;
    if token.expires_at > now() + 60 {
        return Ok(token.access_token);
    }
    if token.refresh_token.is_empty() {
        sign_out_locally();
        return Err(crate::err!("backend.vroid.signedOut"));
    }
    match token_request(&[
        ("grant_type", "refresh_token"),
        ("refresh_token", &token.refresh_token),
    ])
    .await
    {
        Ok(mut fresh) => {
            if fresh.refresh_token.is_empty() {
                fresh.refresh_token = token.refresh_token;
            }
            let access = fresh.access_token.clone();
            store_token(Some(fresh));
            Ok(access)
        }
        Err(e) => {
            warn!("VRoid-Hub-Anmeldung abgelaufen: {e}");
            sign_out_locally();
            Err(crate::err!("backend.vroid.signedOut"))
        }
    }
}

/// An API answer's `data`; a 401 signs out, a 429 asks to wait.
async fn send_api(request: reqwest::RequestBuilder) -> Result<Value, String> {
    let token = access_token().await?;
    let response = request
        .header("X-Api-Version", API_VERSION)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| crate::err!("backend.vroid.request", error = e))?;
    match response.status().as_u16() {
        200..=299 => {}
        401 => {
            sign_out_locally();
            return Err(crate::err!("backend.vroid.signedOut"));
        }
        429 => return Err(crate::err!("backend.vroid.rateLimited")),
        _ => {
            return Err(crate::err!(
                "backend.vroid.request",
                error = failure(response).await
            ));
        }
    }
    response
        .json()
        .await
        .map_err(|e| crate::err!("backend.vroid.request", error = e))
}

async fn api_get(url: &str) -> Result<Value, String> {
    send_api(client(Duration::from_secs(30))?.get(url)).await
}

/// All models of a paged list (`_links.next.href`), up to `MAX_PAGES`.
async fn api_list(first: String) -> Result<Vec<Value>, String> {
    let mut url = first;
    let mut all = Vec::new();
    for _ in 0..MAX_PAGES {
        let page = api_get(&url).await?;
        if let Some(items) = page["data"].as_array() {
            all.extend(items.iter().cloned());
        }
        match page["_links"]["next"]["href"].as_str() {
            Some(next) if !next.is_empty() => {
                url = if next.starts_with("http") {
                    next.to_string()
                } else {
                    format!("{HUB}{next}")
                };
            }
            _ => break,
        }
    }
    Ok(all)
}

// ---------- conditions of use ----------

fn condition(label: &str, value: &str) -> VroidCondition {
    VroidCondition {
        label: label.into(),
        value: value.into(),
    }
}

/// `true`/`false`/missing → allow/disallow/notSet (VRM 1.0 flags).
fn flag(value: &Value) -> &'static str {
    match value.as_bool() {
        Some(true) => "allow",
        Some(false) => "disallow",
        None => "notSet",
    }
}

/// `allow`/`disallow`/`default` (VRM 0.0 fields).
fn allow_field(value: &Value) -> &'static str {
    match value.as_str() {
        Some("allow") => "allow",
        Some("disallow") => "disallow",
        _ => "notSet",
    }
}

/// The conditions as VRoid's guidelines list them, from `vrm_meta` (VRM 1.0) or `license` (0.0).
fn conditions(model: &Value) -> (String, Vec<VroidCondition>) {
    let version = &model["latest_character_model_version"];
    let spec = version["spec_version"].as_str().unwrap_or_default();
    let meta = &version["vrm_meta"];
    if spec.starts_with('1') && meta.is_object() {
        let avatar = match meta["avatarPermission"].as_str() {
            Some("everyone") => "allow",
            Some("onlySeparatelyLicensedPerson" | "onlyAuthor") => "disallow",
            _ => "notSet",
        };
        let commercial = meta["commercialUsage"].as_str();
        let corporate = match commercial {
            Some("corporation") => "allow",
            Some("personalProfit" | "personalNonProfit") => "disallow",
            _ => "notSet",
        };
        let individual = match commercial {
            Some("corporation" | "personalProfit") => "allow",
            Some("personalNonProfit") => "disallow",
            _ => "notSet",
        };
        let modification = meta["modification"].as_str();
        let alterations = match modification {
            Some("allowModification" | "allowModificationRedistribution") => "allow",
            Some("prohibited") => "disallow",
            _ => "notSet",
        };
        let altered = match modification {
            Some("allowModificationRedistribution") => "allow",
            Some("allowModification" | "prohibited") => "disallow",
            _ => "notSet",
        };
        let credit = match meta["creditNotation"].as_str() {
            Some("required") => "required",
            Some("unnecessary") => "notRequired",
            _ => "notSet",
        };
        return (
            "1.0".into(),
            vec![
                condition("avatarUse", avatar),
                condition("violentActs", flag(&meta["allowExcessivelyViolentUsage"])),
                condition("sexualActs", flag(&meta["allowExcessivelySexualUsage"])),
                condition(
                    "politicalReligious",
                    flag(&meta["allowPoliticalOrReligiousUsage"]),
                ),
                condition("antisocialHate", flag(&meta["allowAntisocialOrHateUsage"])),
                condition("corporateUse", corporate),
                condition("individualCommercial", individual),
                condition("redistribution", flag(&meta["allowRedistribution"])),
                condition("alterations", alterations),
                condition("redistributionAltered", altered),
                condition("attribution", credit),
            ],
        );
    }
    let license = &model["license"];
    if !license.is_object() {
        return (
            if spec.is_empty() { "0.0" } else { spec }.into(),
            Vec::new(),
        );
    }
    let avatar = match license["characterization_allowed_user"].as_str() {
        Some("everyone") => "allow",
        Some("author") => "disallow",
        _ => "notSet",
    };
    let individual = match license["personal_commercial_use"].as_str() {
        Some("profit") => "allow",
        Some("nonprofit") => "nonprofit",
        Some("disallow") => "disallow",
        _ => "notSet",
    };
    let credit = match license["credit"].as_str() {
        Some("necessary") => "required",
        Some("unnecessary") => "notRequired",
        _ => "notSet",
    };
    (
        "0.0".into(),
        vec![
            condition("avatarUse", avatar),
            condition("violentActs", allow_field(&license["violent_expression"])),
            condition("sexualActs", allow_field(&license["sexual_expression"])),
            condition(
                "corporateUse",
                allow_field(&license["corporate_commercial_use"]),
            ),
            condition("individualCommercial", individual),
            condition("redistribution", allow_field(&license["redistribution"])),
            condition("alterations", allow_field(&license["modification"])),
            condition("attribution", credit),
        ],
    )
}

/// A `CharacterModelSerializer` as the app lists it.
fn to_model(json: &Value, own_user: &str) -> Option<VroidModel> {
    let id = json["id"].as_str()?.to_string();
    if !valid_id(&id) {
        return None;
    }
    let character = &json["character"];
    let character_name = character["name"].as_str().unwrap_or_default().to_string();
    let name = json["name"]
        .as_str()
        .filter(|n| !n.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| character_name.clone());
    let author_id = character["user"]["id"].as_str().unwrap_or_default();
    let (vrm_version, conditions) = conditions(json);
    let credit_required = conditions
        .iter()
        .any(|c| c.label == "attribution" && c.value == "required");
    let version = &json["latest_character_model_version"];
    let size = version["original_file_size"].as_u64().unwrap_or(0);
    Some(VroidModel {
        page_url: format!(
            "{HUB}/characters/{}/models/{id}",
            character["id"].as_str().unwrap_or_default()
        ),
        id,
        name: if name.is_empty() {
            "VRoid".into()
        } else {
            name
        },
        character_name,
        author_name: character["user"]["name"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        portrait_url: json["portrait_image"]["sq300"]["url"]
            .as_str()
            .or_else(|| json["portrait_image"]["w300"]["url"].as_str())
            .map(str::to_string),
        own: !own_user.is_empty() && author_id == own_user,
        vrm_version,
        size_mb: size.div_ceil(1024 * 1024),
        conditions,
        credit_required,
        added: false,
    })
}

// ---------- sign-in ----------

/// Whether VRoid Hub can be used and who is signed in.
pub fn status() -> VroidStatus {
    VroidStatus {
        configured: secret().is_some(),
        account: signed_in().then(load_account).flatten(),
        cache_available: cache_key().is_some(),
    }
}

/// Sign-in in the system browser; returns the account once VRoid Hub sent the user back.
pub async fn login(app: &tauri::AppHandle, language: &str) -> Result<VroidAccount, String> {
    use tauri_plugin_opener::OpenerExt;
    if secret().is_none() {
        return Err(crate::err!("backend.vroid.notConfigured"));
    }
    let listener = TcpListener::bind(("127.0.0.1", REDIRECT_PORT))
        .await
        .map_err(|e| crate::err!("backend.vroid.portBusy", port = REDIRECT_PORT, error = e))?;
    let (verifier, challenge) = crate::modules::openrouter_auth::pkce_pair();
    let state = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(rand::random::<[u8; 16]>());
    let mut url = reqwest::Url::parse(&format!("{HUB}/oauth/authorize")).expect("valid URL");
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", &redirect_uri())
        .append_pair("scope", "default")
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256");
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| crate::err!("backend.openrouter.browser", error = e))?;

    let listeners = [listener];
    let code = tokio::select! {
        code = crate::modules::openrouter_auth::wait_for_code(&listeners, REDIRECT_PATH, &state, language) => code?,
        _ = tokio::time::sleep(LOGIN_TIMEOUT) => return Err(crate::err!("backend.openrouter.timeout")),
        _ = CANCEL.notified() => return Err(crate::err!("backend.openrouter.cancelled")),
    };
    drop(listeners);
    let redirect = redirect_uri();
    let token = token_request(&[
        ("grant_type", "authorization_code"),
        ("code", &code),
        ("redirect_uri", &redirect),
        ("code_verifier", &verifier),
    ])
    .await?;
    store_token(Some(token));
    let account = fetch_account().await?;
    // Another account than before: its models are not this one's.
    if load_account().is_some_and(|old| old.id != account.id) {
        let _ = std::fs::remove_dir_all(root_dir());
    }
    std::fs::create_dir_all(root_dir())
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    let json = serde_json::to_string_pretty(&account)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    std::fs::write(account_file(), json)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    Ok(account)
}

/// Ends a waiting sign-in.
pub fn cancel() {
    CANCEL.notify_waiters();
}

async fn fetch_account() -> Result<VroidAccount, String> {
    let json = api_get(&format!("{HUB}/api/account")).await?;
    let user = &json["data"]["user_detail"]["user"];
    let id = user["id"]
        .as_str()
        .filter(|id| valid_id(id))
        .ok_or_else(|| crate::err!("backend.vroid.request", error = "no account id"))?;
    Ok(VroidAccount {
        id: id.to_string(),
        name: user["name"].as_str().unwrap_or_default().to_string(),
        icon: user["icon"]["sq170"]["url"].as_str().map(str::to_string),
    })
}

/// Forgets tokens, account and every stored model (with names and preview pictures).
fn sign_out_locally() {
    store_token(None);
    let data_dir = PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir);
    if let Some(dir) = load_account().as_ref().and_then(models_dir) {
        for id in stored_ids(&dir) {
            crate::modules::avatar_library::forget(
                &data_dir,
                crate::modules::avatar_library::AvatarKind::Vrm,
                &format!("{PATH_PREFIX}{id}"),
            );
        }
    }
    let _ = std::fs::remove_dir_all(root_dir());
}

/// Signs out: revokes the token at VRoid Hub (best effort) and removes everything stored.
pub async fn logout() {
    let token = TOKEN.lock().ok().and_then(|t| t.clone());
    if let (Some(token), Some(secret), Ok(client)) =
        (token, secret(), client(Duration::from_secs(10)))
    {
        let _ = post_form(
            &client,
            format!("{HUB}/oauth/revoke"),
            &[
                ("client_id", CLIENT_ID),
                ("client_secret", secret),
                ("token", token.access_token.as_str()),
            ],
        )
        .bearer_auth(&token.access_token)
        .send()
        .await;
    }
    sign_out_locally();
}

// ---------- models ----------

fn stored_ids(dir: &Path) -> Vec<String> {
    std::fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            name.strip_suffix(".json")
                .filter(|id| valid_id(id))
                .map(str::to_string)
        })
        .collect()
}

fn stored_meta(dir: &Path, id: &str) -> Option<VroidModel> {
    serde_json::from_str(&std::fs::read_to_string(meta_file(dir, id)).ok()?).ok()
}

fn remove_stored(dir: &Path, id: &str) {
    let _ = std::fs::remove_file(model_file(dir, id));
    let _ = std::fs::remove_file(meta_file(dir, id));
    let data_dir = PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir);
    crate::modules::avatar_library::forget(
        &data_dir,
        crate::modules::avatar_library::AvatarKind::Vrm,
        &format!("{PATH_PREFIX}{id}"),
    );
}

/// Models the user uploaded or liked; models added earlier that are no longer available to the
/// user are removed from the app.
pub async fn models() -> Result<Vec<VroidModel>, String> {
    let account = load_account().ok_or_else(|| crate::err!("backend.vroid.signedOut"))?;
    let own = api_list(format!(
        "{HUB}/api/account/character_models?count=100&publication=all"
    ))
    .await?;
    let hearts = api_list(format!(
        "{HUB}/api/hearts?count=100&application_id={CLIENT_ID}"
    ))
    .await?;
    let mut list: Vec<VroidModel> = Vec::new();
    for json in own.iter().chain(hearts.iter()) {
        if let Some(model) = to_model(json, &account.id)
            && !list.iter().any(|m| m.id == model.id)
        {
            list.push(model);
        }
    }
    if let Some(dir) = models_dir(&account) {
        for id in stored_ids(&dir) {
            if !list.iter().any(|m| m.id == id) {
                remove_stored(&dir, &id);
            }
        }
        for model in &mut list {
            model.added = meta_file(&dir, &model.id).is_file();
        }
    }
    Ok(list)
}

/// Checks in the background after the start that the added models are still available.
pub async fn sync() {
    if signed_in()
        && load_account().is_some()
        && let Err(e) = models().await
    {
        warn!("VRoid-Hub-Modelle nicht abgeglichen: {e}");
    }
}

/// Downloads a model through a download license (only for the signed-in user).
async fn download(id: &str) -> Result<Vec<u8>, String> {
    let api = client(Duration::from_secs(30))?;
    let license = send_api(
        api.post(format!("{HUB}/api/download_licenses"))
            .json(&serde_json::json!({ "character_model_id": id })),
    )
    .await?;
    let license_id = license["data"]["id"]
        .as_str()
        .filter(|l| valid_id(l))
        .ok_or_else(|| crate::err!("backend.vroid.download", error = "no license"))?;
    let token = access_token().await?;
    let response = api
        .get(format!("{HUB}/api/download_licenses/{license_id}/download"))
        .header("X-Api-Version", API_VERSION)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| crate::err!("backend.vroid.download", error = e))?;
    // A redirect to a signed storage URL; the token must not go along.
    let location = response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|l| l.to_str().ok())
        .map(str::to_string);
    let Some(location) = location else {
        return Err(crate::err!(
            "backend.vroid.download",
            error = failure(response).await
        ));
    };
    let mut file = client(Duration::from_secs(10 * 60))?
        .get(&location)
        .send()
        .await
        .map_err(|e| crate::err!("backend.vroid.download", error = e))?;
    if !file.status().is_success() {
        return Err(crate::err!("backend.vroid.download", error = file.status()));
    }
    let file_type = file
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|t| t.to_str().ok())
        .map(str::to_string);
    if file.content_length().is_some_and(|l| l > MAX_MODEL_BYTES) {
        return Err(crate::err!("backend.vroid.tooLarge"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = file
        .chunk()
        .await
        .map_err(|e| crate::err!("backend.vroid.download", error = e))?
    {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > MAX_MODEL_BYTES {
            return Err(crate::err!("backend.vroid.tooLarge"));
        }
    }
    let content_type = file_type.unwrap_or_default();
    unpack_vrm(bytes).map_err(|found| {
        warn!("VRoid-Download ist kein VRM ({content_type}): {found}");
        crate::err!(
            "backend.vroid.download",
            error = format!("not a VRM file ({content_type}, {found})")
        )
    })
}

/// The VRM (binary glTF) in a download: as it is, gzip-compressed or inside a ZIP archive.
/// `Err` names what arrived instead (first bytes), for the error message and the log.
fn unpack_vrm(bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    use std::io::Read;
    if bytes.starts_with(b"glTF") {
        return Ok(bytes);
    }
    if bytes.starts_with(&[0x1f, 0x8b]) {
        let mut plain = Vec::new();
        flate2::read::GzDecoder::new(bytes.as_slice())
            .take(MAX_MODEL_BYTES + 1)
            .read_to_end(&mut plain)
            .map_err(|e| format!("gzip: {e}"))?;
        if plain.len() as u64 > MAX_MODEL_BYTES {
            return Err("gzip: too large".into());
        }
        return unpack_vrm(plain);
    }
    if bytes.starts_with(b"PK\x03\x04") {
        let mut archive =
            zip::ZipArchive::new(std::io::Cursor::new(&bytes)).map_err(|e| format!("zip: {e}"))?;
        let names: Vec<String> = archive.file_names().map(str::to_string).collect();
        let name = names
            .iter()
            .find(|n| n.to_ascii_lowercase().ends_with(".vrm"))
            .ok_or_else(|| format!("zip without .vrm: {}", names.join(", ")))?;
        let entry = archive.by_name(name).map_err(|e| format!("zip: {e}"))?;
        let mut plain = Vec::new();
        entry
            .take(MAX_MODEL_BYTES + 1)
            .read_to_end(&mut plain)
            .map_err(|e| format!("zip: {e}"))?;
        return if plain.starts_with(b"glTF") {
            Ok(plain)
        } else {
            Err(format!("zip entry {name} is no glTF"))
        };
    }
    let head: Vec<String> = bytes.iter().take(8).map(|b| format!("{b:02x}")).collect();
    Err(format!(
        "{} bytes, starts with {}",
        bytes.len(),
        head.join(" ")
    ))
}

/// Stores the model encrypted (when there is a key); returns the bytes for immediate use.
async fn fetch_and_store(dir: &Path, id: &str) -> Result<Vec<u8>, String> {
    let bytes = download(id).await?;
    if let Some(key) = cache_key() {
        match seal(&key, id, &bytes) {
            Some(sealed) => {
                if let Err(e) = std::fs::write(model_file(dir, id), sealed) {
                    warn!("VRoid-Modell nicht zwischengespeichert: {e}");
                }
            }
            None => warn!("VRoid-Modell nicht verschlüsselt, nicht gespeichert"),
        }
    }
    Ok(bytes)
}

/// Adds a model to the app's avatars (its details, and the encrypted file).
pub async fn add(id: &str) -> Result<crate::modules::paths::ScannedVrm, String> {
    if !valid_id(id) {
        return Err(crate::err!("backend.vroid.notFound"));
    }
    let account = load_account().ok_or_else(|| crate::err!("backend.vroid.signedOut"))?;
    let dir = models_dir(&account).ok_or_else(|| crate::err!("backend.vroid.signedOut"))?;
    let detail = api_get(&format!("{HUB}/api/character_models/{id}")).await?;
    let mut model = to_model(&detail["data"]["character_model"], &account.id)
        .ok_or_else(|| crate::err!("backend.vroid.notFound"))?;
    model.added = true;
    std::fs::create_dir_all(&dir)
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
    fetch_and_store(&dir, id).await?;
    let json = serde_json::to_string_pretty(&model)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    std::fs::write(meta_file(&dir, id), json)
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    let mut vrms = crate::modules::paths::label_vrms(vec![scanned(&model)]);
    Ok(vrms.remove(0))
}

/// Takes a model out of the app (VRoid Hub keeps it).
pub fn remove(id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err(crate::err!("backend.vroid.notFound"));
    }
    if let Some(dir) = load_account().as_ref().and_then(models_dir) {
        remove_stored(&dir, id);
    }
    Ok(())
}

/// Details of an added model (conditions of use, author) for the avatar manager.
pub fn added_model(id: &str) -> Option<VroidModel> {
    let dir = load_account().as_ref().and_then(models_dir)?;
    valid_id(id).then(|| stored_meta(&dir, id)).flatten()
}

fn scanned(model: &VroidModel) -> crate::modules::paths::ScannedVrm {
    crate::modules::paths::ScannedVrm {
        name: model.name.clone(),
        path: format!("{PATH_PREFIX}{}", model.id),
        size_mb: model.size_mb,
        format: "vroid".into(),
        triangles: 0,
        removable: false,
        thumbnail: None,
    }
}

/// Added models for the avatar list (only while signed in).
pub fn added_vrms() -> Vec<crate::modules::paths::ScannedVrm> {
    if !signed_in() {
        return Vec::new();
    }
    let Some(dir) = load_account().as_ref().and_then(models_dir) else {
        return Vec::new();
    };
    let mut models: Vec<VroidModel> = stored_ids(&dir)
        .iter()
        .filter_map(|id| stored_meta(&dir, id))
        .collect();
    models.sort_by_key(|m| m.name.to_lowercase());
    models.iter().map(scanned).collect()
}

/// The VRM of a `vroid:<id>` path, decrypted in memory; loaded again from VRoid Hub when there
/// is no readable stored copy.
pub async fn model_bytes(path: &str) -> Result<Vec<u8>, String> {
    let id = model_id_of(path).ok_or_else(|| crate::err!("backend.vroid.notFound"))?;
    if !signed_in() {
        return Err(crate::err!("backend.vroid.signedOut"));
    }
    let dir = load_account()
        .as_ref()
        .and_then(models_dir)
        .ok_or_else(|| crate::err!("backend.vroid.signedOut"))?;
    if !meta_file(&dir, id).is_file() {
        return Err(crate::err!("backend.vroid.notFound"));
    }
    if let (Ok(sealed), Some(key)) = (std::fs::read(model_file(&dir, id)), cache_key()) {
        if let Some(plain) = open(&key, id, &sealed) {
            return Ok(plain);
        }
        warn!("Gespeichertes VRoid-Modell {id} nicht lesbar, wird neu geladen");
    }
    fetch_and_store(&dir, id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn key(byte: u8) -> LessSafeKey {
        LessSafeKey::new(UnboundKey::new(&AES_256_GCM, &[byte; 32]).unwrap())
    }

    #[test]
    fn a_sealed_model_opens_only_with_its_key_and_id() {
        let plain = b"glTF\x02\x00\x00\x00 some model bytes".to_vec();
        let sealed = seal(&key(7), "123", &plain).unwrap();
        assert!(sealed.starts_with(MAGIC));
        assert!(!sealed.windows(4).any(|w| w == b"some"));
        assert_eq!(open(&key(7), "123", &sealed).unwrap(), plain);
        assert!(open(&key(8), "123", &sealed).is_none());
        assert!(open(&key(7), "124", &sealed).is_none());
        let mut broken = sealed.clone();
        *broken.last_mut().unwrap() ^= 1;
        assert!(open(&key(7), "123", &broken).is_none());
        assert!(open(&key(7), "123", b"plain").is_none());
    }

    #[test]
    fn only_plain_ids_become_paths() {
        assert_eq!(
            model_id_of("vroid:5225889348359061944"),
            Some("5225889348359061944")
        );
        assert_eq!(model_id_of("vroid:../x"), None);
        assert_eq!(model_id_of("vroid:"), None);
        assert_eq!(model_id_of("/home/a.vrm"), None);
    }

    #[test]
    fn vrm0_conditions_follow_the_guidelines() {
        let model = json!({
            "id": "42",
            "name": null,
            "character": { "id": "7", "name": "Nanami", "user": { "id": "9", "name": "Dahlia" } },
            "portrait_image": { "sq300": { "url": "https://img/p.png" } },
            "license": {
                "characterization_allowed_user": "everyone",
                "violent_expression": "allow",
                "sexual_expression": "disallow",
                "corporate_commercial_use": "disallow",
                "personal_commercial_use": "nonprofit",
                "redistribution": "disallow",
                "modification": "default",
                "credit": "necessary"
            },
            "latest_character_model_version": { "spec_version": "0.0", "original_file_size": 1_572_864 }
        });
        let parsed = to_model(&model, "1").unwrap();
        assert_eq!(parsed.name, "Nanami");
        assert_eq!(parsed.author_name, "Dahlia");
        assert_eq!(
            parsed.page_url,
            "https://hub.vroid.com/characters/7/models/42"
        );
        assert!(!parsed.own);
        assert!(parsed.credit_required);
        assert_eq!(parsed.size_mb, 2);
        let values: Vec<(&str, &str)> = parsed
            .conditions
            .iter()
            .map(|c| (c.label.as_str(), c.value.as_str()))
            .collect();
        assert_eq!(
            values,
            vec![
                ("avatarUse", "allow"),
                ("violentActs", "allow"),
                ("sexualActs", "disallow"),
                ("corporateUse", "disallow"),
                ("individualCommercial", "nonprofit"),
                ("redistribution", "disallow"),
                ("alterations", "notSet"),
                ("attribution", "required"),
            ]
        );
    }

    #[test]
    fn vrm1_conditions_add_the_newer_lines() {
        let model = json!({
            "id": "43",
            "name": "Sommer",
            "character": { "id": "7", "name": "Nanami", "user": { "id": "1", "name": "Ich" } },
            "latest_character_model_version": {
                "spec_version": "1.0",
                "vrm_meta": {
                    "avatarPermission": "onlyAuthor",
                    "allowExcessivelyViolentUsage": false,
                    "allowExcessivelySexualUsage": false,
                    "allowPoliticalOrReligiousUsage": false,
                    "allowAntisocialOrHateUsage": false,
                    "commercialUsage": "personalProfit",
                    "allowRedistribution": true,
                    "modification": "allowModification",
                    "creditNotation": "unnecessary"
                }
            }
        });
        let parsed = to_model(&model, "1").unwrap();
        assert!(parsed.own);
        assert_eq!(parsed.vrm_version, "1.0");
        let value = |label: &str| {
            parsed
                .conditions
                .iter()
                .find(|c| c.label == label)
                .map(|c| c.value.clone())
                .unwrap()
        };
        assert_eq!(parsed.conditions.len(), 11);
        assert_eq!(value("avatarUse"), "disallow");
        assert_eq!(value("corporateUse"), "disallow");
        assert_eq!(value("individualCommercial"), "allow");
        assert_eq!(value("redistribution"), "allow");
        assert_eq!(value("alterations"), "allow");
        assert_eq!(value("redistributionAltered"), "disallow");
        assert_eq!(value("attribution"), "notRequired");
        assert!(!parsed.credit_required);
    }

    #[test]
    fn a_download_is_unpacked_to_its_vrm() {
        use std::io::Write;
        let vrm = b"glTF\x02\x00\x00\x00model".to_vec();
        assert_eq!(unpack_vrm(vrm.clone()).unwrap(), vrm);

        let mut gz = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        gz.write_all(&vrm).unwrap();
        assert_eq!(unpack_vrm(gz.finish().unwrap()).unwrap(), vrm);

        let mut zipped = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        zipped
            .start_file("readme.txt", zip::write::SimpleFileOptions::default())
            .unwrap();
        zipped.write_all(b"hi").unwrap();
        zipped
            .start_file("Nanami.VRM", zip::write::SimpleFileOptions::default())
            .unwrap();
        zipped.write_all(&vrm).unwrap();
        let zipped = zipped.finish().unwrap().into_inner();
        assert_eq!(unpack_vrm(zipped).unwrap(), vrm);

        let other = unpack_vrm(b"\x00\x01\x02\x03 rest".to_vec()).unwrap_err();
        assert!(other.contains("00 01 02 03"), "{other}");
    }

    #[test]
    fn foreign_ids_are_skipped() {
        assert!(to_model(&json!({ "id": "../../etc" }), "1").is_none());
    }
}
