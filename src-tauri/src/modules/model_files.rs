//! Resumable, verified downloads of large model files from Hugging Face, shared by the image
//! and speech model catalogs.
//!
//! A file is written to `<name>.part` and only renamed once its SHA-256 matches. An interrupted
//! or cancelled download keeps the partial file; the next attempt hashes what is there and asks
//! the server for the rest with an HTTP range request.

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// A model file in a Hugging Face repository.
pub struct RemoteFile {
    pub repo: &'static str,
    pub path: &'static str,
    pub size: u64,
    /// Lower-case hex SHA-256; `None` for small files Hugging Face stores without LFS.
    pub sha256: Option<&'static str>,
}

impl RemoteFile {
    pub fn file_name(&self) -> &'static str {
        self.path.rsplit('/').next().unwrap_or(self.path)
    }

    pub fn url(&self) -> String {
        format!(
            "https://huggingface.co/{}/resolve/main/{}",
            self.repo, self.path
        )
    }

    pub fn path_in(&self, dir: &Path) -> PathBuf {
        dir.join(self.file_name())
    }

    pub fn is_complete(&self, dir: &Path) -> bool {
        std::fs::metadata(self.path_in(dir)).is_ok_and(|m| m.len() == self.size)
    }
}

pub fn part_path(target: &Path) -> PathBuf {
    target.with_extension(format!(
        "{}.part",
        target.extension().and_then(|e| e.to_str()).unwrap_or("bin")
    ))
}

pub fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("OtakuSoul/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))
}

/// Downloads `file` into `dir`, reporting the bytes of this file so far through `emit`.
pub async fn download_file(
    client: &reqwest::Client,
    file: &RemoteFile,
    dir: &Path,
    cancel: &AtomicBool,
    emit: &(impl Fn(u64) + Sync),
) -> Result<(), String> {
    download_from(client, &file.url(), file, &file.path_in(dir), cancel, emit).await
}

/// [`download_file`] under another name than the one in the repository (generic names such as
/// `lora.safetensors`).
pub async fn download_file_as(
    client: &reqwest::Client,
    file: &RemoteFile,
    target: &Path,
    cancel: &AtomicBool,
    emit: &(impl Fn(u64) + Sync),
) -> Result<(), String> {
    download_from(client, &file.url(), file, target, cancel, emit).await
}

async fn download_from(
    client: &reqwest::Client,
    url: &str,
    file: &RemoteFile,
    target: &Path,
    cancel: &AtomicBool,
    emit: &(impl Fn(u64) + Sync),
) -> Result<(), String> {
    let part = part_path(target);

    // Hash what an earlier attempt already downloaded, then continue from there.
    let mut hasher = Sha256::new();
    let mut have = 0u64;
    if let Ok(mut existing) = tokio::fs::File::open(&part).await {
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let n = existing
                .read(&mut buf)
                .await
                .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            have += n as u64;
        }
    }
    if have > file.size {
        let _ = tokio::fs::remove_file(&part).await;
        have = 0;
        hasher = Sha256::new();
    }

    let mut request = client.get(url);
    if have > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={have}-"));
    }
    let response = request
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| crate::err!("backend.common.downloadFailed", error = e))?;
    let resumed = have > 0 && response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
    if !resumed {
        have = 0;
        hasher = Sha256::new();
    }
    let mut out = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed)
        .truncate(!resumed)
        .open(&part)
        .await
        .map_err(|e| crate::err!("backend.common.fileCreate", error = e))?;

    let mut stream = response.bytes_stream();
    let mut last_emit = std::time::Instant::now();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            out.flush().await.ok();
            return Err(crate::err!("backend.localImage.downloadCancelled"));
        }
        let chunk =
            chunk.map_err(|e| crate::err!("backend.common.downloadInterrupted", error = e))?;
        out.write_all(&chunk)
            .await
            .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
        hasher.update(&chunk);
        have += chunk.len() as u64;
        if last_emit.elapsed() >= Duration::from_millis(300) {
            emit(have);
            last_emit = std::time::Instant::now();
        }
    }
    out.flush()
        .await
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    drop(out);

    if let Some(expected) = file.sha256 {
        let actual: String = hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        if actual != expected {
            let _ = tokio::fs::remove_file(&part).await;
            return Err(crate::err!(
                "backend.runtime.checksum",
                file = file.file_name(),
                expected = expected,
                actual = actual
            ));
        }
    } else if have != file.size {
        let _ = tokio::fs::remove_file(&part).await;
        return Err(crate::err!(
            "backend.common.downloadInterrupted",
            error = file.file_name()
        ));
    }
    tokio::fs::rename(&part, target)
        .await
        .map_err(|e| crate::err!("backend.common.fileWrite", error = e))?;
    emit(have);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderMap, StatusCode, header};

    const DATA: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

    /// Serves `DATA`, honouring `Range: bytes=N-`.
    async fn serve() -> String {
        let app = axum::Router::new().route(
            "/file",
            axum::routing::get(|headers: HeaderMap| async move {
                let start = headers
                    .get(header::RANGE)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.strip_prefix("bytes="))
                    .and_then(|v| v.trim_end_matches('-').parse::<usize>().ok());
                match start {
                    Some(n) => (StatusCode::PARTIAL_CONTENT, DATA[n..].to_vec()),
                    None => (StatusCode::OK, DATA.to_vec()),
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{addr}/file")
    }

    fn sha(data: &[u8]) -> String {
        Sha256::digest(data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    #[tokio::test]
    async fn resumes_partial_files_and_verifies_them() {
        let url = serve().await;
        let dir = std::env::temp_dir().join(format!("otakusoul-dl-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let digest: &'static str = Box::leak(sha(DATA).into_boxed_str());
        let file = RemoteFile {
            repo: "test/repo",
            path: "sub/model.gguf",
            size: DATA.len() as u64,
            sha256: Some(digest),
        };
        let client = http_client().unwrap();
        let cancel = AtomicBool::new(false);

        // A previous attempt left the first 10 bytes behind.
        std::fs::write(part_path(&file.path_in(&dir)), &DATA[..10]).unwrap();
        download_from(&client, &url, &file, &file.path_in(&dir), &cancel, &|_| {})
            .await
            .unwrap();
        assert_eq!(std::fs::read(file.path_in(&dir)).unwrap(), DATA);
        assert!(file.is_complete(&dir));
        assert!(!part_path(&file.path_in(&dir)).exists());

        // A corrupt partial file fails the checksum and is removed.
        let bad = RemoteFile {
            path: "bad.gguf",
            ..file
        };
        std::fs::write(part_path(&bad.path_in(&dir)), b"XXXXXXXXXX").unwrap();
        assert!(
            download_from(&client, &url, &bad, &bad.path_in(&dir), &cancel, &|_| {})
                .await
                .is_err()
        );
        assert!(!part_path(&bad.path_in(&dir)).exists());

        // Cancelling keeps what was downloaded for the next attempt.
        let cancelled = RemoteFile {
            path: "cancelled.gguf",
            ..bad
        };
        cancel.store(true, Ordering::SeqCst);
        assert!(
            download_from(
                &client,
                &url,
                &cancelled,
                &cancelled.path_in(&dir),
                &cancel,
                &|_| {}
            )
            .await
            .is_err()
        );
        assert!(!cancelled.is_complete(&dir));
        let _ = std::fs::remove_dir_all(dir);
    }
}
