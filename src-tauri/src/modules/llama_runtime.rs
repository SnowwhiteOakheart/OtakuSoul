//! Downloads the official llama.cpp server build for this system from GitHub.
//!
//! The app follows the latest *stable* llama.cpp release (e.g. `v0.5.0`), which points to
//! the build it was cut from through its `nightly-tag.txt` asset. Every archive is checked
//! against the SHA-256 digest GitHub publishes for it, unpacked into the data folder and
//! remembered in `current.json`, which [`installed`] reads when the server starts.

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use ts_rs::TS;

const API: &str = "https://api.github.com/repos/ggml-org/llama.cpp/releases";
const DOWNLOAD: &str = "https://github.com/ggml-org/llama.cpp/releases/download";

/// One downloadable build for this system, e.g. `vulkan` or `cuda-12.8`.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LlamaRuntimeVariant {
    /// Backend name from the asset, also used to install it (`cpu`, `vulkan`, `cuda-12.8`, …).
    pub backend: String,
    pub build: String,
    pub download_bytes: u64,
    /// Best match for the detected GPU.
    pub recommended: bool,
}

/// The runtime installed by the app.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LlamaRuntimeInfo {
    pub build: String,
    pub backend: String,
    pub server_path: String,
    /// Folders with shared libraries the server needs on its library search path.
    #[serde(default)]
    pub library_dirs: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct LlamaRuntimeProgress {
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

fn runtime_root() -> PathBuf {
    PathBuf::from(crate::modules::paths::resolve_app_paths().data_dir)
        .join("runtimes")
        .join("llama.cpp")
}

fn manifest_path() -> PathBuf {
    runtime_root().join("current.json")
}

/// The app-installed runtime, if its server binary is still there.
pub fn installed() -> Option<LlamaRuntimeInfo> {
    let info: LlamaRuntimeInfo =
        serde_json::from_str(&std::fs::read_to_string(manifest_path()).ok()?).ok()?;
    Path::new(&info.server_path).is_file().then_some(info)
}

/// Library folders to add to the search path when starting `binary`.
pub fn library_dirs_for(binary: &Path) -> Vec<PathBuf> {
    installed()
        .filter(|info| Path::new(&info.server_path) == binary)
        .map(|info| info.library_dirs.iter().map(PathBuf::from).collect())
        .unwrap_or_default()
}

/// Asset naming of this platform: (`ubuntu`/`win`/`macos`, `x64`/`arm64`, archive extension).
fn platform() -> Option<(&'static str, &'static str, &'static str)> {
    let os = if cfg!(target_os = "linux") {
        "ubuntu"
    } else if cfg!(target_os = "windows") {
        "win"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        return None;
    };
    let arch = if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        return None;
    };
    Some((os, arch, if os == "win" { ".zip" } else { ".tar.gz" }))
}

/// Backend of a server build asset for the given platform, or `None` for other files.
/// `llama-b1-bin-ubuntu-vulkan-x64.tar.gz` → `vulkan`, `llama-b1-bin-ubuntu-x64.tar.gz` → `cpu`.
fn backend_of(name: &str, build: &str, os: &str, arch: &str, ext: &str) -> Option<String> {
    let middle = name
        .strip_prefix(&format!("llama-{build}-bin-{os}-"))?
        .strip_suffix(&format!("{arch}{ext}"))?
        .trim_end_matches('-');
    let backend = match middle {
        "" if os == "macos" => "metal",
        "" => "cpu",
        other => other,
    };
    let supported = matches!(backend, "cpu" | "metal" | "vulkan")
        || backend.starts_with("cuda-")
        || backend.starts_with("rocm-");
    supported.then(|| backend.to_string())
}

/// CUDA builds need the matching CUDA runtime archive next to them.
fn cudart_asset<'a>(assets: &'a [Asset], build: &str, backend: &str) -> Option<&'a Asset> {
    let (os, arch, ext) = platform()?;
    let with_build = format!("cudart-llama-{build}-bin-{os}-{backend}-{arch}{ext}");
    let without_build = format!("cudart-llama-bin-{os}-{backend}-{arch}{ext}");
    assets
        .iter()
        .find(|a| a.name == with_build || a.name == without_build)
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("OtakuSoul/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))
}

/// Build tag of the latest stable release (via its `nightly-tag.txt`), e.g. `b11146`.
async fn stable_build(client: &reqwest::Client) -> Result<String, String> {
    let release: Release = client
        .get(format!("{API}/latest"))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| crate::err!("backend.runtime.releaseFetch", error = e))?
        .json()
        .await
        .map_err(|e| crate::err!("backend.runtime.releaseFetch", error = e))?;
    if release.tag_name.starts_with('b') {
        return Ok(release.tag_name);
    }
    let tag = client
        .get(format!("{DOWNLOAD}/{}/nightly-tag.txt", release.tag_name))
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

async fn build_release(client: &reqwest::Client) -> Result<Release, String> {
    let build = stable_build(client).await?;
    client
        .get(format!("{API}/tags/{build}"))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| crate::err!("backend.runtime.releaseFetch", error = e))?
        .json()
        .await
        .map_err(|e| crate::err!("backend.runtime.releaseFetch", error = e))
}

/// Best backend for the detected hardware among `available`.
fn recommended_backend(available: &[String]) -> Option<String> {
    let hardware = crate::modules::hardware::probe_hardware();
    let vendors: Vec<String> = hardware
        .gpus
        .iter()
        .map(|g| g.vendor.to_lowercase())
        .collect();
    let pick = |prefix: &str| available.iter().find(|b| b.starts_with(prefix)).cloned();
    if vendors.iter().any(|v| v.contains("apple"))
        && let Some(b) = pick("metal")
    {
        return Some(b);
    }
    // The lowest CUDA version (first in sorted order) runs on the widest range of drivers.
    if vendors.iter().any(|v| v.contains("nvidia"))
        && let Some(b) = pick("cuda-")
    {
        return Some(b);
    }
    pick("vulkan")
        .or_else(|| pick("metal"))
        .or_else(|| pick("cpu"))
}

/// Server builds of the current stable llama.cpp release for this system.
pub async fn list_variants() -> Result<Vec<LlamaRuntimeVariant>, String> {
    let (os, arch, ext) = platform().ok_or_else(|| crate::err!("backend.runtime.unsupported"))?;
    let client = client()?;
    let release = build_release(&client).await?;
    let build = release.tag_name.clone();

    let mut variants: Vec<LlamaRuntimeVariant> = release
        .assets
        .iter()
        .filter_map(|asset| {
            let backend = backend_of(&asset.name, &build, os, arch, ext)?;
            let cudart = cudart_asset(&release.assets, &build, &backend).map_or(0, |a| a.size);
            Some(LlamaRuntimeVariant {
                backend,
                build: build.clone(),
                download_bytes: asset.size + cudart,
                recommended: false,
            })
        })
        .collect();
    variants.sort_by(|a, b| a.backend.cmp(&b.backend));

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

fn progress(phase: &str, done: u64, total: u64) -> LlamaRuntimeProgress {
    let percent = if total > 0 {
        (done as f32 / total as f32 * 100.0).min(100.0)
    } else {
        0.0
    };
    LlamaRuntimeProgress {
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
    on_progress: &(impl Fn(LlamaRuntimeProgress) + Sync),
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
            on_progress(progress("download", offset + downloaded, total));
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

/// The server binary and every folder holding shared libraries below `root`.
fn locate_server(root: &Path) -> (Option<PathBuf>, Vec<String>) {
    let server_name = if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    };
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

/// Downloads, verifies and installs the given backend of the current stable build, replacing
/// any runtime the app installed before. Progress goes to the `llama-runtime-progress` event.
pub async fn install<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    backend: &str,
) -> Result<LlamaRuntimeInfo, String> {
    let info = install_into(&runtime_root(), backend, &|p| {
        let _ = app.emit("llama-runtime-progress", p);
    })
    .await?;
    tracing::info!(
        "llama.cpp {} ({}) installiert: {}",
        info.build,
        info.backend,
        info.server_path
    );
    Ok(info)
}

/// [`install`] into `root`, which holds the versioned runtime folders and `current.json`.
async fn install_into(
    root: &Path,
    backend: &str,
    on_progress: &(impl Fn(LlamaRuntimeProgress) + Sync),
) -> Result<LlamaRuntimeInfo, String> {
    let (os, arch, ext) = platform().ok_or_else(|| crate::err!("backend.runtime.unsupported"))?;
    let client = client()?;
    let release = build_release(&client).await?;
    let build = release.tag_name.clone();

    let main = release
        .assets
        .iter()
        .find(|a| backend_of(&a.name, &build, os, arch, ext).as_deref() == Some(backend))
        .ok_or_else(|| crate::err!("backend.runtime.unknownVariant", variant = backend))?;
    let mut assets = vec![main.clone()];
    if let Some(cudart) = cudart_asset(&release.assets, &build, backend) {
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
        download_verified(on_progress, &client, asset, &target, offset, total).await?;
        offset += asset.size;
        archives.push(target);
    }

    on_progress(progress("extract", total, total));
    let install_dir = root.join(format!("{build}-{backend}"));
    let staging = root.join(format!(".staging-{build}-{backend}"));
    let info = tokio::task::spawn_blocking({
        let (install_dir, staging, build, backend) = (
            install_dir.clone(),
            staging.clone(),
            build.clone(),
            backend.to_string(),
        );
        move || -> Result<LlamaRuntimeInfo, String> {
            let _ = std::fs::remove_dir_all(&staging);
            std::fs::create_dir_all(&staging)
                .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
            for archive in &archives {
                extract_archive(archive, &staging)?;
            }
            let _ = std::fs::remove_dir_all(&install_dir);
            std::fs::rename(&staging, &install_dir)
                .map_err(|e| crate::err!("backend.common.dirCreate", error = e))?;
            let (server, library_dirs) = locate_server(&install_dir);
            let server = server.ok_or_else(|| crate::err!("backend.runtime.noServer"))?;
            Ok(LlamaRuntimeInfo {
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
    on_progress(progress("done", total, total));
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_server_builds_per_platform() {
        let b = "b11146";
        assert_eq!(
            backend_of(
                "llama-b11146-bin-ubuntu-x64.tar.gz",
                b,
                "ubuntu",
                "x64",
                ".tar.gz"
            )
            .as_deref(),
            Some("cpu")
        );
        assert_eq!(
            backend_of(
                "llama-b11146-bin-ubuntu-vulkan-x64.tar.gz",
                b,
                "ubuntu",
                "x64",
                ".tar.gz"
            )
            .as_deref(),
            Some("vulkan")
        );
        assert_eq!(
            backend_of(
                "llama-b11146-bin-ubuntu-cuda-12.8-x64.tar.gz",
                b,
                "ubuntu",
                "x64",
                ".tar.gz"
            )
            .as_deref(),
            Some("cuda-12.8")
        );
        assert_eq!(
            backend_of(
                "llama-b11146-bin-macos-arm64.tar.gz",
                b,
                "macos",
                "arm64",
                ".tar.gz"
            )
            .as_deref(),
            Some("metal")
        );
        assert_eq!(
            backend_of(
                "llama-b11146-bin-win-cuda-12.4-x64.zip",
                b,
                "win",
                "x64",
                ".zip"
            )
            .as_deref(),
            Some("cuda-12.4")
        );
        // Other architectures, special backends and helper archives are not offered.
        assert_eq!(
            backend_of(
                "llama-b11146-bin-ubuntu-vulkan-arm64.tar.gz",
                b,
                "ubuntu",
                "x64",
                ".tar.gz"
            ),
            None
        );
        assert_eq!(
            backend_of(
                "llama-b11146-bin-ubuntu-sycl-fp16-x64.tar.gz",
                b,
                "ubuntu",
                "x64",
                ".tar.gz"
            ),
            None
        );
        assert_eq!(
            backend_of(
                "cudart-llama-b11146-bin-ubuntu-cuda-12.8-x64.tar.gz",
                b,
                "ubuntu",
                "x64",
                ".tar.gz"
            ),
            None
        );
        assert_eq!(
            backend_of("llama-b11146-ui.tar.gz", b, "ubuntu", "x64", ".tar.gz"),
            None
        );
    }

    #[test]
    fn finds_server_and_library_folders() {
        let root =
            std::env::temp_dir().join(format!("otakusoul-runtime-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("llama-b1/lib")).unwrap();
        let server = if cfg!(windows) {
            "llama-server.exe"
        } else {
            "llama-server"
        };
        std::fs::write(root.join("llama-b1").join(server), b"").unwrap();
        std::fs::write(root.join("llama-b1/lib/libcudart.so.12"), b"").unwrap();

        let (found, libs) = locate_server(&root);
        assert_eq!(found.unwrap(), root.join("llama-b1").join(server));
        assert_eq!(
            libs,
            vec![root.join("llama-b1/lib").to_string_lossy().to_string()]
        );
        let _ = std::fs::remove_dir_all(root);
    }

    /// Downloads the real CPU build (~16 MB) into a temporary folder:
    /// `cargo test --lib installs_cpu_runtime -- --ignored`
    #[tokio::test]
    #[ignore = "network"]
    async fn installs_cpu_runtime() {
        let root =
            std::env::temp_dir().join(format!("otakusoul-runtime-install-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let variants = list_variants().await.unwrap();
        assert!(variants.iter().any(|v| v.backend == "cpu"), "{variants:?}");

        let last = std::sync::Mutex::new(None);
        let info = install_into(&root, "cpu", &|p| *last.lock().unwrap() = Some(p))
            .await
            .unwrap();
        assert!(Path::new(&info.server_path).is_file());
        assert!(last.lock().unwrap().as_ref().unwrap().finished);
        let status = std::process::Command::new(&info.server_path)
            .arg("--version")
            .env(
                "LD_LIBRARY_PATH",
                Path::new(&info.server_path).parent().unwrap(),
            )
            .output()
            .unwrap();
        assert!(
            status.status.success(),
            "{}",
            String::from_utf8_lossy(&status.stderr)
        );
        let _ = std::fs::remove_dir_all(root);
    }
}
