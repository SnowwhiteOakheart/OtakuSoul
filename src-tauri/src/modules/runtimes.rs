//! Downloads prebuilt server runtimes from GitHub: official llama.cpp, the PrismML llama.cpp
//! fork (needed for Ternary Bonsai's PQ2_0/PTQ1_0 files), stable-diffusion.cpp for local
//! image generation and CrispASR for local speech synthesis.
//!
//! llama.cpp follows its latest *stable* release (e.g. `v0.5.0`), which points to the build it
//! was cut from through its `nightly-tag.txt` asset; the other two use their latest release.
//! Every archive is checked against the SHA-256 digest GitHub publishes for it, unpacked into
//! `runtimes/<kind>` in the data folder and remembered in `current.json`.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use ts_rs::TS;

/// Which runtime to download.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export)]
pub enum RuntimeKind {
    /// Official llama.cpp (`ggml-org/llama.cpp`).
    Llama,
    /// PrismML's llama.cpp fork with the ternary PQ2_0/PTQ1_0 kernels.
    Prism,
    /// stable-diffusion.cpp with `sd-server`.
    Sd,
    /// CrispASR (ggml speech engine) with its `--server` mode for text-to-speech.
    Crisp,
}

impl RuntimeKind {
    const ALL: [RuntimeKind; 4] = [
        RuntimeKind::Llama,
        RuntimeKind::Prism,
        RuntimeKind::Sd,
        RuntimeKind::Crisp,
    ];

    fn repo(self) -> &'static str {
        match self {
            Self::Llama => "ggml-org/llama.cpp",
            Self::Prism => "PrismML-Eng/llama.cpp",
            Self::Sd => "leejet/stable-diffusion.cpp",
            Self::Crisp => "CrispStrobe/CrispASR",
        }
    }

    fn dir_name(self) -> &'static str {
        match self {
            Self::Llama => "llama.cpp",
            Self::Prism => "prism",
            Self::Sd => "sd.cpp",
            Self::Crisp => "crispasr",
        }
    }

    fn server_name(self) -> &'static str {
        match (self, cfg!(windows)) {
            (Self::Sd, true) => "sd-server.exe",
            (Self::Sd, false) => "sd-server",
            (Self::Crisp, true) => "crispasr.exe",
            (Self::Crisp, false) => "crispasr",
            (_, true) => "llama-server.exe",
            (_, false) => "llama-server",
        }
    }

    fn api(self) -> String {
        format!("https://api.github.com/repos/{}/releases", self.repo())
    }

    fn download(self) -> String {
        format!("https://github.com/{}/releases/download", self.repo())
    }
}

/// One downloadable build for this system, e.g. `vulkan` or `cuda-12.8`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RuntimeVariant {
    /// Backend name from the asset, also used to install it (`cpu`, `vulkan`, `cuda-12.8`, …).
    pub backend: String,
    pub build: String,
    pub download_bytes: u64,
    /// Best match for the detected GPU.
    pub recommended: bool,
}

/// A runtime installed by the app.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RuntimeInfo {
    pub build: String,
    pub backend: String,
    pub server_path: String,
    /// Folders with shared libraries the server needs on its library search path.
    #[serde(default)]
    pub library_dirs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RuntimeProgress {
    pub kind: RuntimeKind,
    /// `download`, `extract` or `done`.
    pub phase: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f32,
    pub finished: bool,
}

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize, Clone)]
struct Asset {
    name: String,
    size: u64,
    browser_download_url: String,
    digest: Option<String>,
}

fn runtime_root(kind: RuntimeKind) -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir)
        .join("runtimes")
        .join(kind.dir_name())
}

/// The app-installed runtime of `kind`, if its server binary is still there.
pub fn installed(kind: RuntimeKind) -> Option<RuntimeInfo> {
    let manifest = runtime_root(kind).join("current.json");
    let info: RuntimeInfo = serde_json::from_str(&std::fs::read_to_string(manifest).ok()?).ok()?;
    Path::new(&info.server_path).is_file().then_some(info)
}

/// Library folders to add to the search path when starting `binary`.
pub fn library_dirs_for(binary: &Path) -> Vec<PathBuf> {
    RuntimeKind::ALL
        .into_iter()
        .filter_map(installed)
        .find(|info| Path::new(&info.server_path) == binary)
        .map(|info| info.library_dirs.iter().map(PathBuf::from).collect())
        .unwrap_or_default()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Os {
    Linux,
    Windows,
    Mac,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Platform {
    os: Os,
    arm64: bool,
}

fn platform() -> Option<Platform> {
    let os = if cfg!(target_os = "linux") {
        Os::Linux
    } else if cfg!(target_os = "windows") {
        Os::Windows
    } else if cfg!(target_os = "macos") {
        Os::Mac
    } else {
        return None;
    };
    let arm64 = if cfg!(target_arch = "x86_64") {
        false
    } else if cfg!(target_arch = "aarch64") {
        true
    } else {
        return None;
    };
    Some(Platform { os, arm64 })
}

fn is_supported_backend(backend: &str) -> bool {
    matches!(backend, "cpu" | "metal" | "vulkan")
        || backend.starts_with("cuda-")
        || backend.starts_with("rocm-")
        || backend.starts_with("hip-")
}

/// Backend of a server build asset of `kind` for `platform`, or `None` for other files.
/// llama.cpp/PrismML: `llama-b1-bin-ubuntu-vulkan-x64.tar.gz` → `vulkan`,
/// `llama-b1-bin-ubuntu-x64.tar.gz` → `cpu`.
/// stable-diffusion.cpp: `sd-master-abc-bin-win-cuda12-x64.zip` → `cuda-12`,
/// `sd-master-abc-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip` → `vulkan`.
fn backend_of(kind: RuntimeKind, name: &str, build: &str, platform: Platform) -> Option<String> {
    let backend = match kind {
        RuntimeKind::Llama | RuntimeKind::Prism => {
            let arch = if platform.arm64 { "arm64" } else { "x64" };
            let ext = if platform.os == Os::Windows {
                ".zip"
            } else {
                ".tar.gz"
            };
            let rest = name.strip_prefix(&format!("llama-{build}-bin-"))?;
            let rest = match platform.os {
                // Linux CUDA builds are published as `linux-…`, the others as `ubuntu-…`.
                Os::Linux => rest
                    .strip_prefix("ubuntu-")
                    .or_else(|| rest.strip_prefix("linux-"))?,
                Os::Windows => rest.strip_prefix("win-")?,
                Os::Mac => rest.strip_prefix("macos-")?,
            };
            match rest
                .strip_suffix(&format!("{arch}{ext}"))?
                .trim_end_matches('-')
            {
                "" if platform.os == Os::Mac => "metal".to_string(),
                "" => "cpu".to_string(),
                other => other.to_string(),
            }
        }
        RuntimeKind::Crisp => {
            // crispasr-linux-x86_64-vulkan.tar.gz, crispasr-windows-x86_64-cuda.zip,
            // crispasr-macos-arm64.tar.gz; `libcrispasr-…` and wheels are other files.
            let (os, ext) = match platform.os {
                Os::Linux => ("linux", ".tar.gz"),
                Os::Windows => ("windows", ".zip"),
                Os::Mac => ("macos", ".tar.gz"),
            };
            let arch = if platform.arm64 { "arm64" } else { "x86_64" };
            let rest = name
                .strip_prefix(&format!("crispasr-{os}-{arch}"))?
                .strip_suffix(ext)?;
            match (rest.trim_start_matches('-'), platform.os) {
                ("", Os::Mac) => "metal".to_string(),
                ("", _) | ("cpu", _) => "cpu".to_string(),
                ("cuda", _) => "cuda-12".to_string(),
                ("cuda13", _) => "cuda-13".to_string(),
                ("hip", _) => "hip-amd".to_string(),
                ("vulkan", _) => "vulkan".to_string(),
                // avx512/cpu-legacy special builds and the CUDA-less split archives.
                _ => return None,
            }
        }
        RuntimeKind::Sd => {
            if !name.starts_with("sd-") || !name.ends_with(".zip") {
                return None;
            }
            let rest = name.split_once("-bin-")?.1.strip_suffix(".zip")?;
            match platform.os {
                Os::Linux if !platform.arm64 => {
                    let tail = rest.strip_prefix("Linux-")?.split_once("-x86_64")?.1;
                    match tail.trim_start_matches('-') {
                        "" => "cpu".to_string(),
                        other => other.to_string(),
                    }
                }
                Os::Windows if !platform.arm64 => {
                    let backend = rest.strip_prefix("win-")?.strip_suffix("-x64")?;
                    match backend.strip_prefix("cuda") {
                        Some(version) if !version.is_empty() && !version.starts_with('-') => {
                            format!("cuda-{version}")
                        }
                        _ => backend.to_string(),
                    }
                }
                Os::Mac if platform.arm64 => {
                    rest.starts_with("Darwin-").then(|| "metal".to_string())?
                }
                _ => return None,
            }
        }
    };
    is_supported_backend(&backend).then_some(backend)
}

/// Windows CUDA builds need the matching CUDA runtime archive next to them.
fn cudart_asset<'a>(
    kind: RuntimeKind,
    assets: &'a [Asset],
    build: &str,
    backend: &str,
    platform: Platform,
) -> Option<&'a Asset> {
    let version = backend.strip_prefix("cuda-")?;
    let arch = if platform.arm64 { "arm64" } else { "x64" };
    let names = match (kind, platform.os) {
        (RuntimeKind::Sd, Os::Windows) => vec![format!(
            "cudart-sd-bin-win-cu{}-{arch}.zip",
            version.replace('.', "")
        )],
        (RuntimeKind::Sd, _) => return None,
        // CrispASR's CUDA archives are self-contained.
        (RuntimeKind::Crisp, _) => return None,
        (_, os) => {
            let (os, ext) = match os {
                Os::Windows => ("win", ".zip"),
                Os::Linux => ("ubuntu", ".tar.gz"),
                Os::Mac => ("macos", ".tar.gz"),
            };
            vec![
                format!("cudart-llama-{build}-bin-{os}-{backend}-{arch}{ext}"),
                format!("cudart-llama-bin-{os}-{backend}-{arch}{ext}"),
            ]
        }
    };
    assets.iter().find(|a| names.contains(&a.name))
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("OtakuSoul/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))
}

async fn fetch_release(client: &reqwest::Client, url: String) -> Result<Release, String> {
    client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| crate::err!("backend.runtime.releaseFetch", error = e))?
        .json()
        .await
        .map_err(|e| crate::err!("backend.runtime.releaseFetch", error = e))
}

/// Build tag of the latest stable llama.cpp release (via its `nightly-tag.txt`), e.g. `b11146`.
async fn stable_llama_build(client: &reqwest::Client) -> Result<String, String> {
    let kind = RuntimeKind::Llama;
    let release = fetch_release(client, format!("{}/latest", kind.api())).await?;
    if release.tag_name.starts_with('b') {
        return Ok(release.tag_name);
    }
    let tag = client
        .get(format!(
            "{}/{}/nightly-tag.txt",
            kind.download(),
            release.tag_name
        ))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| crate::err!("backend.runtime.releaseFetch", error = e))?
        .text()
        .await
        .map_err(|e| crate::err!("backend.runtime.releaseFetch", error = e))?;
    let tag = tag.trim();
    if tag.starts_with('b') && tag[1..].chars().all(|c| c.is_ascii_digit()) {
        Ok(tag.to_string())
    } else {
        Err(crate::err!(
            "backend.runtime.noBuild",
            release = release.tag_name
        ))
    }
}

/// The release whose assets are offered for `kind`.
async fn build_release(client: &reqwest::Client, kind: RuntimeKind) -> Result<Release, String> {
    match kind {
        RuntimeKind::Llama => {
            let build = stable_llama_build(client).await?;
            fetch_release(client, format!("{}/tags/{build}", kind.api())).await
        }
        RuntimeKind::Prism | RuntimeKind::Sd | RuntimeKind::Crisp => {
            fetch_release(client, format!("{}/latest", kind.api())).await
        }
    }
}

/// Best backend for the detected hardware among `available`.
fn recommended_backend(available: &[String]) -> Option<String> {
    let vendors: Vec<String> = crate::modules::hardware::probe_hardware()
        .gpus
        .iter()
        .map(|g| g.vendor.to_lowercase())
        .collect();
    let cuda = if cfg!(target_os = "linux") {
        CudaRuntime::System(system_cuda_majors())
    } else {
        CudaRuntime::Bundled
    };
    pick_backend(available, &vendors, &cuda)
}

/// Where a CUDA build finds its runtime libraries.
#[derive(Debug, Clone, PartialEq, Eq)]
enum CudaRuntime {
    /// Windows archives ship (or download) `cudart` themselves.
    Bundled,
    /// Linux builds load `libcudart`/`libcublas` from the system; these major versions exist.
    System(Vec<u32>),
}

/// CUDA major versions whose runtime and cuBLAS the dynamic loader can find (`ldconfig -p`).
fn system_cuda_majors() -> Vec<u32> {
    let listing = std::process::Command::new("ldconfig")
        .arg("-p")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default();
    cuda_majors_in(&listing)
}

fn cuda_majors_in(ldconfig: &str) -> Vec<u32> {
    let majors_of = |lib: &str| -> Vec<u32> {
        ldconfig
            .lines()
            .filter_map(|line| line.split_whitespace().next())
            .filter_map(|name| name.strip_prefix(lib)?.parse().ok())
            .collect()
    };
    let blas = majors_of("libcublas.so.");
    let mut majors: Vec<u32> = majors_of("libcudart.so.")
        .into_iter()
        .filter(|m| blas.contains(m))
        .collect();
    majors.sort_unstable();
    majors.dedup();
    majors
}

fn cuda_major(backend: &str) -> Option<u32> {
    backend
        .strip_prefix("cuda-")?
        .split('.')
        .next()?
        .parse()
        .ok()
}

/// Best backend among `available` for the GPU vendors and the CUDA runtime of this system.
/// A CUDA build whose runtime is missing silently falls back to the CPU, so on Linux it is only
/// recommended when the matching CUDA major version is installed; otherwise Vulkan.
fn pick_backend(available: &[String], vendors: &[String], cuda: &CudaRuntime) -> Option<String> {
    let pick = |prefix: &str| available.iter().find(|b| b.starts_with(prefix)).cloned();
    if vendors.iter().any(|v| v.contains("apple"))
        && let Some(b) = pick("metal")
    {
        return Some(b);
    }
    if vendors.iter().any(|v| v.contains("nvidia")) {
        // The lowest usable CUDA version (first in sorted order) runs on the most drivers.
        let usable = available.iter().find(|b| match (cuda_major(b), cuda) {
            (None, _) => false,
            (Some(_), CudaRuntime::Bundled) => true,
            (Some(major), CudaRuntime::System(majors)) => majors.contains(&major),
        });
        if let Some(b) = usable {
            return Some(b.clone());
        }
    }
    pick("vulkan")
        .or_else(|| pick("metal"))
        .or_else(|| pick("cpu"))
}

/// Server builds of the current release of `kind` for this system.
pub async fn list_variants(kind: RuntimeKind) -> Result<Vec<RuntimeVariant>, String> {
    let platform = platform().ok_or_else(|| crate::err!("backend.runtime.unsupported"))?;
    let client = client()?;
    let release = build_release(&client, kind).await?;
    let build = release.tag_name.clone();

    let mut variants: Vec<RuntimeVariant> = release
        .assets
        .iter()
        .filter_map(|asset| {
            let backend = backend_of(kind, &asset.name, &build, platform)?;
            let cudart = cudart_asset(kind, &release.assets, &build, &backend, platform)
                .map_or(0, |a| a.size);
            Some(RuntimeVariant {
                backend,
                build: build.clone(),
                download_bytes: asset.size + cudart,
                recommended: false,
            })
        })
        .collect();
    variants.sort_by(|a, b| a.backend.cmp(&b.backend));
    variants.dedup_by(|a, b| a.backend == b.backend);

    let backends: Vec<String> = variants.iter().map(|v| v.backend.clone()).collect();
    let recommended = tokio::task::spawn_blocking(move || recommended_backend(&backends))
        .await
        .ok()
        .flatten();
    for variant in &mut variants {
        variant.recommended = Some(&variant.backend) == recommended.as_ref();
    }
    variants.sort_by_key(|v| !v.recommended);
    Ok(variants)
}

fn progress(kind: RuntimeKind, phase: &str, done: u64, total: u64) -> RuntimeProgress {
    let percent = if total > 0 {
        (done as f32 / total as f32 * 100.0).min(100.0)
    } else {
        0.0
    };
    RuntimeProgress {
        kind,
        phase: phase.to_string(),
        downloaded_bytes: done,
        total_bytes: total,
        percent,
        finished: phase == "done",
    }
}

/// Downloads `asset` to `target`, reporting progress relative to the whole installation, and
/// verifies GitHub's SHA-256 digest.
async fn download_verified(
    kind: RuntimeKind,
    on_progress: &(impl Fn(RuntimeProgress) + Sync),
    client: &reqwest::Client,
    asset: &Asset,
    target: &Path,
    offset: u64,
    total: u64,
) -> Result<(), String> {
    let response = client
        .get(&asset.browser_download_url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;
    let mut file = tokio::fs::File::create(target)
        .await
        .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;
    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded = 0u64;
    let mut last_emit = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.map_err(|e| crate::err!("backend.common.downloadInterrupted", error = e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        hasher.update(&chunk);
        downloaded += chunk.len() as u64;
        if last_emit.elapsed().as_millis() >= 250 {
            on_progress(progress(kind, "download", offset + downloaded, total));
            last_emit = std::time::Instant::now();
        }
    }
    file.flush()
        .await
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;

    if let Some(expected) = asset
        .digest
        .as_deref()
        .and_then(|d| d.strip_prefix("sha256:"))
    {
        let actual: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if !actual.eq_ignore_ascii_case(expected) {
            return Err(crate::err!(
                "backend.runtime.checksum",
                file = asset.name,
                expected = expected,
                actual = actual
            ));
        }
    }
    Ok(())
}

/// Unpacks a `.tar.gz` or `.zip` archive into `dest`; both readers refuse paths outside `dest`.
fn extract_archive(archive: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive)
        .map_err(|e| crate::err!("backend.common.zipOpen", error = e))?;
    if archive.extension().and_then(|e| e.to_str()) == Some("zip") {
        zip::ZipArchive::new(file)
            .and_then(|mut zip| zip.extract(dest))
            .map_err(|e| crate::err!("backend.common.unzip", error = e))
    } else {
        tar::Archive::new(flate2::read::GzDecoder::new(file))
            .unpack(dest)
            .map_err(|e| crate::err!("backend.common.unzip", error = e))
    }
}

/// The server binary named `server_name` and every folder holding shared libraries below `root`.
fn locate_server(root: &Path, server_name: &str) -> (Option<PathBuf>, Vec<String>) {
    let mut server = None;
    let mut lib_dirs = std::collections::BTreeSet::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name == server_name && server.is_none() {
                server = Some(path);
            } else if name.ends_with(".dll") || name.ends_with(".dylib") || name.contains(".so") {
                lib_dirs.insert(dir.to_string_lossy().to_string());
            }
        }
    }
    (server, lib_dirs.into_iter().collect())
}

/// ZIP archives do not always keep the executable bit.
fn make_executable(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(meta) = std::fs::metadata(path) {
            let mut perms = meta.permissions();
            perms.set_mode(perms.mode() | 0o755);
            let _ = std::fs::set_permissions(path, perms);
        }
    }
    #[cfg(not(unix))]
    let _ = path;
}

/// Downloads, verifies and installs the given backend of the current release of `kind`,
/// replacing the runtime of that kind the app installed before. Progress goes to the
/// `runtime-progress` event.
pub async fn install<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    kind: RuntimeKind,
    backend: &str,
) -> Result<RuntimeInfo, String> {
    install_with(kind, backend, &|p| {
        let _ = app.emit("runtime-progress", p);
    })
    .await
}

/// [`install`] with a progress callback instead of the Tauri event (tests, tools).
pub async fn install_with(
    kind: RuntimeKind,
    backend: &str,
    on_progress: &(impl Fn(RuntimeProgress) + Sync),
) -> Result<RuntimeInfo, String> {
    let info = install_into(&runtime_root(kind), kind, backend, on_progress).await?;
    tracing::info!(
        "Laufzeit {} {} ({}) installiert: {}",
        kind.dir_name(),
        info.build,
        info.backend,
        info.server_path
    );
    Ok(info)
}

/// [`install`] into `root`, which holds the versioned runtime folders and `current.json`.
async fn install_into(
    root: &Path,
    kind: RuntimeKind,
    backend: &str,
    on_progress: &(impl Fn(RuntimeProgress) + Sync),
) -> Result<RuntimeInfo, String> {
    let platform = platform().ok_or_else(|| crate::err!("backend.runtime.unsupported"))?;
    let client = client()?;
    let release = build_release(&client, kind).await?;
    let build = release.tag_name.clone();

    let main = release
        .assets
        .iter()
        .find(|a| backend_of(kind, &a.name, &build, platform).as_deref() == Some(backend))
        .ok_or_else(|| crate::err!("backend.runtime.unknownVariant", variant = backend))?;
    let mut assets = vec![main.clone()];
    if let Some(cudart) = cudart_asset(kind, &release.assets, &build, backend, platform) {
        assets.push(cudart.clone());
    }
    let total: u64 = assets.iter().map(|a| a.size).sum();

    let downloads = root.join(".downloads");
    tokio::fs::create_dir_all(&downloads)
        .await
        .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;

    let mut archives = Vec::new();
    let mut offset = 0;
    for asset in &assets {
        let target = downloads.join(&asset.name);
        download_verified(kind, on_progress, &client, asset, &target, offset, total).await?;
        offset += asset.size;
        archives.push(target);
    }

    on_progress(progress(kind, "extract", total, total));
    let install_dir = root.join(format!("{build}-{backend}"));
    let staging = root.join(format!(".staging-{build}-{backend}"));
    let info = tokio::task::spawn_blocking({
        let (install_dir, staging, build, backend) = (
            install_dir.clone(),
            staging.clone(),
            build.clone(),
            backend.to_string(),
        );
        move || -> Result<RuntimeInfo, String> {
            let _ = std::fs::remove_dir_all(&staging);
            std::fs::create_dir_all(&staging)
                .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
            for archive in &archives {
                extract_archive(archive, &staging)?;
            }
            let _ = std::fs::remove_dir_all(&install_dir);
            std::fs::rename(&staging, &install_dir)
                .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
            let (server, library_dirs) = locate_server(&install_dir, kind.server_name());
            let server = server.ok_or_else(|| crate::err!("backend.runtime.noServer"))?;
            make_executable(&server);
            Ok(RuntimeInfo {
                build,
                backend,
                server_path: server.to_string_lossy().to_string(),
                library_dirs,
            })
        }
    })
    .await
    .map_err(|e| crate::err!("backend.runtime.installFailed", error = e))??;

    let manifest = serde_json::to_string_pretty(&info)
        .map_err(|e| crate::err!("backend.runtime.installFailed", error = e))?;
    tokio::fs::write(root.join("current.json"), manifest)
        .await
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;

    // Only the new runtime stays; older builds and the downloaded archives are removed.
    if let Ok(entries) = std::fs::read_dir(root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path != install_dir {
                let _ = std::fs::remove_dir_all(path);
            }
        }
    }
    on_progress(progress(kind, "done", total, total));
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    const LINUX: Platform = Platform {
        os: Os::Linux,
        arm64: false,
    };
    const WINDOWS: Platform = Platform {
        os: Os::Windows,
        arm64: false,
    };
    const MAC: Platform = Platform {
        os: Os::Mac,
        arm64: true,
    };

    #[test]
    fn recognizes_llama_server_builds_per_platform() {
        let of = |name: &str, platform| backend_of(RuntimeKind::Llama, name, "b11146", platform);
        assert_eq!(
            of("llama-b11146-bin-ubuntu-x64.tar.gz", LINUX).as_deref(),
            Some("cpu")
        );
        assert_eq!(
            of("llama-b11146-bin-ubuntu-vulkan-x64.tar.gz", LINUX).as_deref(),
            Some("vulkan")
        );
        assert_eq!(
            of("llama-b11146-bin-ubuntu-cuda-12.8-x64.tar.gz", LINUX).as_deref(),
            Some("cuda-12.8")
        );
        assert_eq!(
            of("llama-b11146-bin-linux-cuda-12.8-x64.tar.gz", LINUX).as_deref(),
            Some("cuda-12.8")
        );
        assert_eq!(
            of("llama-b11146-bin-macos-arm64.tar.gz", MAC).as_deref(),
            Some("metal")
        );
        assert_eq!(
            of("llama-b11146-bin-win-cuda-12.4-x64.zip", WINDOWS).as_deref(),
            Some("cuda-12.4")
        );
        // Other architectures, special backends and helper archives are not offered.
        assert_eq!(
            of("llama-b11146-bin-ubuntu-vulkan-arm64.tar.gz", LINUX),
            None
        );
        assert_eq!(
            of("llama-b11146-bin-ubuntu-sycl-fp16-x64.tar.gz", LINUX),
            None
        );
        assert_eq!(
            of("cudart-llama-b11146-bin-ubuntu-cuda-12.8-x64.tar.gz", LINUX),
            None
        );
        assert_eq!(of("llama-b11146-ui.tar.gz", LINUX), None);
    }

    #[test]
    fn recognizes_prism_server_builds() {
        let tag = "prism-b10743-adfffbe";
        let of = |name: &str, platform| backend_of(RuntimeKind::Prism, name, tag, platform);
        assert_eq!(
            of(
                "llama-prism-b10743-adfffbe-bin-linux-cuda-12.4-x64.tar.gz",
                LINUX
            )
            .as_deref(),
            Some("cuda-12.4")
        );
        assert_eq!(
            of(
                "llama-prism-b10743-adfffbe-bin-ubuntu-vulkan-x64.tar.gz",
                LINUX
            )
            .as_deref(),
            Some("vulkan")
        );
        assert_eq!(
            of("llama-prism-b10743-adfffbe-bin-win-cpu-x64.zip", WINDOWS).as_deref(),
            Some("cpu")
        );
        assert_eq!(
            of(
                "llama-prism-b10743-adfffbe-bin-win-hip-radeon-x64.zip",
                WINDOWS
            )
            .as_deref(),
            Some("hip-radeon")
        );
        assert_eq!(
            of(
                "llama-prism-b10743-adfffbe-bin-macos-arm64-kleidiai.tar.gz",
                MAC
            ),
            None
        );
        assert_eq!(of("llama-prism-b10743-adfffbe-xcframework.zip", MAC), None);
    }

    #[test]
    fn recognizes_sd_server_builds() {
        let tag = "master-929-3f8527a";
        let of = |name: &str, platform| backend_of(RuntimeKind::Sd, name, tag, platform);
        assert_eq!(
            of("sd-master-3f8527a-bin-Linux-Ubuntu-24.04-x86_64.zip", LINUX).as_deref(),
            Some("cpu")
        );
        assert_eq!(
            of(
                "sd-master-3f8527a-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip",
                LINUX
            )
            .as_deref(),
            Some("vulkan")
        );
        assert_eq!(
            of(
                "sd-master-3f8527a-bin-Linux-Ubuntu-24.04-x86_64-rocm-7.14.0.zip",
                LINUX
            )
            .as_deref(),
            Some("rocm-7.14.0")
        );
        assert_eq!(
            of("sd-master-3f8527a-bin-win-cuda12-x64.zip", WINDOWS).as_deref(),
            Some("cuda-12")
        );
        assert_eq!(
            of("sd-master-3f8527a-bin-win-vulkan-x64.zip", WINDOWS).as_deref(),
            Some("vulkan")
        );
        assert_eq!(
            of("sd-master-3f8527a-bin-Darwin-macOS-26.6.2-arm64.zip", MAC).as_deref(),
            Some("metal")
        );
        assert_eq!(of("sd-master-3f8527a-bin-win-cuda12-x64.zip", LINUX), None);
        assert_eq!(of("cudart-sd-bin-win-cu12-x64.zip", WINDOWS), None);

        let assets = vec![Asset {
            name: "cudart-sd-bin-win-cu12-x64.zip".into(),
            size: 1,
            browser_download_url: String::new(),
            digest: None,
        }];
        assert!(cudart_asset(RuntimeKind::Sd, &assets, tag, "cuda-12", WINDOWS).is_some());
        assert!(cudart_asset(RuntimeKind::Sd, &assets, tag, "vulkan", WINDOWS).is_none());
    }

    #[test]
    fn finds_server_and_library_folders() {
        let root =
            std::env::temp_dir().join(format!("otakusoul-runtime-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("llama-b1/lib")).unwrap();
        let server = RuntimeKind::Llama.server_name();
        std::fs::write(root.join("llama-b1").join(server), b"").unwrap();
        std::fs::write(root.join("llama-b1/lib/libcudart.so.12"), b"").unwrap();

        let (found, libs) = locate_server(&root, server);
        assert_eq!(found.unwrap(), root.join("llama-b1").join(server));
        assert_eq!(
            libs,
            vec![root.join("llama-b1/lib").to_string_lossy().to_string()]
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recommends_cuda_only_with_a_matching_system_runtime() {
        let ldconfig = "\tlibcudart.so.13 (libc6,x86-64) => /opt/cuda/lib64/libcudart.so.13
\tlibcudart.so (libc6,x86-64) => /opt/cuda/lib64/libcudart.so
\tlibcublas.so.13 (libc6,x86-64) => /opt/cuda/lib64/libcublas.so.13
\tlibcudart.so.12 (libc6,x86-64) => /usr/lib/libcudart.so.12";
        // CUDA 12 has no cuBLAS here, so only 13 counts.
        assert_eq!(cuda_majors_in(ldconfig), vec![13]);

        let nvidia = vec!["nvidia".to_string()];
        let crisp: Vec<String> = ["cpu", "cuda-12", "cuda-13", "hip-amd", "vulkan"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let prism: Vec<String> = ["cpu", "cuda-12.4", "cuda-12.8", "cuda-13.3", "vulkan"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let linux13 = CudaRuntime::System(vec![13]);
        assert_eq!(
            pick_backend(&crisp, &nvidia, &linux13).as_deref(),
            Some("cuda-13")
        );
        assert_eq!(
            pick_backend(&prism, &nvidia, &linux13).as_deref(),
            Some("cuda-13.3")
        );
        // CUDA 12 installed: the lowest matching build.
        let linux12 = CudaRuntime::System(vec![12]);
        assert_eq!(
            pick_backend(&prism, &nvidia, &linux12).as_deref(),
            Some("cuda-12.4")
        );
        // No CUDA runtime at all: Vulkan instead of a silent CPU fallback.
        let none = CudaRuntime::System(vec![]);
        assert_eq!(
            pick_backend(&crisp, &nvidia, &none).as_deref(),
            Some("vulkan")
        );
        // Windows archives bring their runtime along.
        assert_eq!(
            pick_backend(&crisp, &nvidia, &CudaRuntime::Bundled).as_deref(),
            Some("cuda-12")
        );
        // AMD/Intel use Vulkan.
        assert_eq!(
            pick_backend(&crisp, &["amd".to_string()], &linux13).as_deref(),
            Some("vulkan")
        );
    }

    #[test]
    fn recognizes_crispasr_builds() {
        let of = |name: &str, platform| backend_of(RuntimeKind::Crisp, name, "v0.8.39", platform);
        assert_eq!(
            of("crispasr-linux-x86_64.tar.gz", LINUX).as_deref(),
            Some("cpu")
        );
        assert_eq!(
            of("crispasr-linux-x86_64-cuda.tar.gz", LINUX).as_deref(),
            Some("cuda-12")
        );
        assert_eq!(
            of("crispasr-linux-x86_64-cuda13.tar.gz", LINUX).as_deref(),
            Some("cuda-13")
        );
        assert_eq!(
            of("crispasr-linux-x86_64-vulkan.tar.gz", LINUX).as_deref(),
            Some("vulkan")
        );
        assert_eq!(
            of("crispasr-linux-x86_64-hip.tar.gz", LINUX).as_deref(),
            Some("hip-amd")
        );
        assert_eq!(
            of("crispasr-windows-x86_64-cpu.zip", WINDOWS).as_deref(),
            Some("cpu")
        );
        assert_eq!(
            of("crispasr-windows-x86_64-cuda.zip", WINDOWS).as_deref(),
            Some("cuda-12")
        );
        assert_eq!(
            of("crispasr-macos-arm64.tar.gz", MAC).as_deref(),
            Some("metal")
        );
        for other in [
            "crispasr-linux-x86_64-avx512.tar.gz",
            "crispasr-linux-x86_64-cpu-legacy.tar.gz",
            "libcrispasr-linux-x86_64.tar.gz",
            "crispasr-linux-arm64.tar.gz",
        ] {
            assert_eq!(of(other, LINUX), None, "{other}");
        }
        assert_eq!(
            of("crispasr-windows-x86_64-cuda-non-cuda.zip", WINDOWS),
            None
        );
    }

    /// Downloads the real CPU builds into a temporary folder and runs `--version`/`--help`:
    /// `cargo test --lib installs_cpu_runtimes -- --ignored`
    #[tokio::test]
    #[ignore = "network"]
    async fn installs_cpu_runtimes() {
        for (kind, arg) in [
            (RuntimeKind::Llama, "--version"),
            (RuntimeKind::Prism, "--version"),
            (RuntimeKind::Sd, "--help"),
            (RuntimeKind::Crisp, "--version"),
        ] {
            let root = std::env::temp_dir().join(format!(
                "otakusoul-runtime-install-{}-{}",
                kind.dir_name(),
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&root);
            let variants = list_variants(kind).await.unwrap();
            assert!(
                variants.iter().any(|v| v.backend == "cpu"),
                "{kind:?}: {variants:?}"
            );

            let last = std::sync::Mutex::new(None);
            let info = install_into(&root, kind, "cpu", &|p| *last.lock().unwrap() = Some(p))
                .await
                .unwrap();
            assert!(Path::new(&info.server_path).is_file());
            assert!(last.lock().unwrap().as_ref().unwrap().finished);
            let lib_path = std::env::join_paths(
                info.library_dirs
                    .iter()
                    .map(PathBuf::from)
                    .chain(Path::new(&info.server_path).parent().map(Path::to_path_buf)),
            )
            .unwrap();
            let status = std::process::Command::new(&info.server_path)
                .arg(arg)
                .env("LD_LIBRARY_PATH", lib_path)
                .output()
                .unwrap();
            assert!(
                status.status.success(),
                "{kind:?}: {}",
                String::from_utf8_lossy(&status.stderr)
            );
            let _ = std::fs::remove_dir_all(root);
        }
    }
}
