//! Parallel, resumable downloads of large files over HTTP range requests.
//!
//! Hugging Face limits the speed of each connection (October 2026: about 2 MB/s, with 16
//! connections about 140 MB/s), so the missing rest of a file is split into [`SEGMENTS`] ranges
//! that download at the same time. Each range goes into its own file next to the partial file,
//! named `<part>.<start>-<end>.seg`, and only ever grows at its end: a dropped connection or an
//! app restart continues every range where it stopped. When all ranges are complete they are
//! appended to the partial file in one pass that also computes its SHA-256.
//!
//! Separate files instead of writing into one preallocated file: NTFS fills everything before a
//! write far into a new file with zeros first, which would stall the parallel writers.

use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;

use crate::modules::model_files::{MAX_RESUMES, resume_delay};

/// Connections per file.
pub const SEGMENTS: u64 = 8;

/// Below this size a file downloads over one connection.
pub fn min_size() -> u64 {
    if cfg!(test) { 64 * 1024 } else { 64 << 20 }
}

/// How the segmented download ended.
#[derive(Debug, PartialEq, Eq)]
pub enum Outcome {
    /// The partial file holds the whole file; its SHA-256 (lower-case hex).
    Done { sha256: String },
    /// The server ignores range requests; download the file in one piece instead.
    NoRanges,
}

#[derive(Debug, PartialEq, Eq)]
pub enum SegmentError {
    Cancelled,
    /// The connection kept dropping (worth another attempt later).
    Interrupted(String),
    /// The server answered with an error status (not worth retrying).
    Status(u16),
    /// Reading or writing the files failed.
    Io(String),
}

/// One range of the file and the file it is collected in.
struct Segment {
    start: u64,
    /// Inclusive.
    end: u64,
    path: PathBuf,
}

impl Segment {
    fn len(&self) -> u64 {
        self.end - self.start + 1
    }
}

fn segment_files(part: &Path) -> Vec<(u64, u64, PathBuf)> {
    let (Some(dir), Some(name)) = (part.parent(), part.file_name().and_then(|n| n.to_str())) else {
        return Vec::new();
    };
    let prefix = format!("{name}.");
    let mut found: Vec<_> = std::fs::read_dir(dir)
        .map(|entries| entries.flatten().collect::<Vec<_>>())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let range = file_name.strip_prefix(&prefix)?.strip_suffix(".seg")?;
            let (start, end) = range.split_once('-')?;
            Some((start.parse().ok()?, end.parse().ok()?, entry.path()))
        })
        .collect();
    found.sort_by_key(|(start, _, _)| *start);
    found
}

/// Bytes a download already has on disk: the partial file plus its segment files.
pub fn partial_bytes(part: &Path) -> u64 {
    let file_len = |p: &Path| std::fs::metadata(p).map_or(0, |m| m.len());
    file_len(part)
        + segment_files(part)
            .iter()
            .map(|(_, _, p)| file_len(p))
            .sum::<u64>()
}

/// Removes the partial file and its segment files.
pub fn remove_partial(part: &Path) {
    let _ = std::fs::remove_file(part);
    for (_, _, path) in segment_files(part) {
        let _ = std::fs::remove_file(path);
    }
}

/// The ranges still missing after the partial file: the ranges of an earlier run when they
/// cover exactly that rest, otherwise a new split (old segment files are dropped).
fn plan(part: &Path, size: u64) -> Vec<Segment> {
    let have = std::fs::metadata(part).map_or(0, |m| m.len()).min(size);
    let existing = segment_files(part);
    let tiles = !existing.is_empty()
        && existing.first().is_some_and(|(start, _, _)| *start == have)
        && existing.last().is_some_and(|(_, end, _)| *end + 1 == size)
        && existing.windows(2).all(|w| w[0].1 + 1 == w[1].0)
        && existing.iter().all(|(start, end, path)| {
            std::fs::metadata(path).map_or(0, |m| m.len()) <= end - start + 1
        });
    if tiles {
        return existing
            .into_iter()
            .map(|(start, end, path)| Segment { start, end, path })
            .collect();
    }
    for (_, _, path) in existing {
        let _ = std::fs::remove_file(path);
    }
    let rest = size - have;
    if rest == 0 {
        return Vec::new();
    }
    let count = SEGMENTS.min(rest.div_ceil(min_size() / 4).max(1));
    let step = rest.div_ceil(count);
    let name = part
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("download");
    (0..count)
        .map(|i| have + i * step)
        .filter(|start| *start < size)
        .map(|start| {
            let end = (start + step - 1).min(size - 1);
            Segment {
                start,
                end,
                path: part.with_file_name(format!("{name}.{start}-{end}.seg")),
            }
        })
        .collect()
}

/// Shared between the ranges of one download.
struct Shared<'a, C: Fn() -> bool, P: Fn(u64)> {
    is_cancelled: &'a C,
    on_progress: &'a P,
    done: AtomicU64,
    last_emit: Mutex<Instant>,
    no_ranges: AtomicBool,
}

impl<C: Fn() -> bool, P: Fn(u64)> Shared<'_, C, P> {
    fn add(&self, bytes: u64) {
        let done = self.done.fetch_add(bytes, Ordering::SeqCst) + bytes;
        let mut last = self.last_emit.lock().unwrap_or_else(|e| e.into_inner());
        if last.elapsed() >= Duration::from_millis(300) {
            *last = Instant::now();
            (self.on_progress)(done);
        }
    }

    /// Another range found that the server ignores ranges, or the user cancelled.
    fn stopped(&self) -> Option<SegmentError> {
        if (self.is_cancelled)() {
            Some(SegmentError::Cancelled)
        } else if self.no_ranges.load(Ordering::SeqCst) {
            Some(SegmentError::Interrupted("no ranges".into()))
        } else {
            None
        }
    }
}

/// Fills one segment file, resuming after dropped connections.
async fn fetch_segment<C: Fn() -> bool, P: Fn(u64)>(
    client: &reqwest::Client,
    url: &str,
    segment: &Segment,
    shared: &Shared<'_, C, P>,
) -> Result<(), SegmentError> {
    let mut out = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&segment.path)
        .await
        .map_err(|e| SegmentError::Io(e.to_string()))?;
    let mut have = std::fs::metadata(&segment.path).map_or(0, |m| m.len());
    let mut resumes = 0u32;
    let mut resumed_at = have;
    while have < segment.len() {
        if let Some(stop) = shared.stopped() {
            out.flush().await.ok();
            return Err(stop);
        }
        let from = segment.start + have;
        let error = match client
            .get(url)
            .header(
                reqwest::header::RANGE,
                format!("bytes={from}-{}", segment.end),
            )
            .send()
            .await
        {
            Ok(response) if response.status() == reqwest::StatusCode::PARTIAL_CONTENT => {
                let mut stream = response.bytes_stream();
                let mut error = None;
                while let Some(chunk) = stream.next().await {
                    if let Some(stop) = shared.stopped() {
                        out.flush().await.ok();
                        return Err(stop);
                    }
                    match chunk {
                        Ok(chunk) => {
                            // Never write past the range, whatever the server sends.
                            let take = (segment.len() - have).min(chunk.len() as u64) as usize;
                            out.write_all(&chunk[..take])
                                .await
                                .map_err(|e| SegmentError::Io(e.to_string()))?;
                            have += take as u64;
                            shared.add(take as u64);
                            if have == segment.len() {
                                break;
                            }
                        }
                        Err(e) => {
                            error = Some(e.to_string());
                            break;
                        }
                    }
                }
                // Finish the write in flight before this range continues.
                out.flush()
                    .await
                    .map_err(|e| SegmentError::Io(e.to_string()))?;
                match error {
                    None if have == segment.len() => break,
                    None => "Verbindung vorzeitig beendet".to_string(),
                    Some(error) => error,
                }
            }
            Ok(response) if response.status().is_success() => {
                shared.no_ranges.store(true, Ordering::SeqCst);
                return Err(SegmentError::Interrupted("no ranges".into()));
            }
            Ok(response) if response.status().is_client_error() => {
                return Err(SegmentError::Status(response.status().as_u16()));
            }
            Ok(response) => format!("HTTP {}", response.status()),
            Err(e) => e.to_string(),
        };
        // Only attempts in a row without new data count.
        if have > resumed_at {
            resumes = 0;
        }
        resumed_at = have;
        resumes += 1;
        if resumes > MAX_RESUMES {
            return Err(SegmentError::Interrupted(error));
        }
        tracing::warn!(
            "Abschnitt {}-{} unterbrochen ({error}), setze bei {from} fort (Versuch {resumes})",
            segment.start,
            segment.end
        );
        tokio::time::sleep(resume_delay(resumes)).await;
    }
    Ok(())
}

/// Appends the segment files to `part` in order and returns the SHA-256 of the whole file.
fn assemble(part: &Path, segments: &[Segment]) -> std::io::Result<String> {
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 4 << 20];
    if let Ok(mut existing) = std::fs::File::open(part) {
        loop {
            let n = existing.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
    }
    let mut out = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(part)?;
    for segment in segments {
        let mut input = std::fs::File::open(&segment.path)?;
        loop {
            let n = input.read(&mut buf)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            out.write_all(&buf[..n])?;
        }
    }
    out.flush()?;
    out.sync_all()?;
    drop(out);
    for segment in segments {
        std::fs::remove_file(&segment.path)?;
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// Downloads the rest of a `size`-byte file into `part` over [`SEGMENTS`] parallel range
/// requests. `on_progress` gets the bytes on disk so far (at most every 300 ms).
pub async fn download(
    client: &reqwest::Client,
    url: &str,
    part: &Path,
    size: u64,
    is_cancelled: &(impl Fn() -> bool + Sync),
    on_progress: &(impl Fn(u64) + Sync),
) -> Result<Outcome, SegmentError> {
    if std::fs::metadata(part).is_ok_and(|m| m.len() > size) {
        remove_partial(part);
    }
    let segments = plan(part, size);
    let shared = Shared {
        is_cancelled,
        on_progress,
        done: AtomicU64::new(partial_bytes(part)),
        last_emit: Mutex::new(Instant::now()),
        no_ranges: AtomicBool::new(false),
    };
    // All ranges run concurrently on this task; file writes go to the blocking pool.
    let results = futures_util::future::join_all(
        segments
            .iter()
            .map(|segment| fetch_segment(client, url, segment, &shared)),
    )
    .await;
    if shared.no_ranges.load(Ordering::SeqCst) {
        remove_partial(part);
        return Ok(Outcome::NoRanges);
    }
    // Cancel beats a status error beats an interruption.
    let mut failure = None;
    for result in results {
        if let Err(error) = result {
            let rank = |e: &SegmentError| match e {
                SegmentError::Cancelled => 0,
                SegmentError::Status(_) => 1,
                SegmentError::Io(_) => 2,
                SegmentError::Interrupted(_) => 3,
            };
            if failure.as_ref().is_none_or(|f| rank(&error) < rank(f)) {
                failure = Some(error);
            }
        }
    }
    if let Some(error) = failure {
        return Err(error);
    }
    on_progress(size);
    let part = part.to_path_buf();
    let sha256 = tokio::task::spawn_blocking(move || assemble(&part, &segments))
        .await
        .map_err(|e| SegmentError::Io(e.to_string()))?
        .map_err(|e| SegmentError::Io(e.to_string()))?;
    Ok(Outcome::Done { sha256 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::model_files::{noise, serve_flaky, serve_without_ranges};

    fn sha(data: &[u8]) -> String {
        Sha256::digest(data)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect()
    }

    fn temp_part(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("otakusoul-seg-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("model.gguf.part")
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn ranges_survive_dropped_connections() {
        let data = noise(3 << 20);
        let url = serve_flaky(data, 100 * 1024).await;
        let part = temp_part("drops");
        let outcome = download(
            &reqwest::Client::new(),
            &url,
            &part,
            data.len() as u64,
            &|| false,
            &|_| {},
        )
        .await
        .unwrap();
        assert_eq!(outcome, Outcome::Done { sha256: sha(data) });
        assert_eq!(std::fs::read(&part).unwrap(), data);
        assert!(segment_files(&part).is_empty(), "segments are cleaned up");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_cancelled_download_continues_where_it_stopped() {
        let data = noise(2 << 20);
        let url = serve_flaky(data, data.len()).await;
        // An older single-connection download left the first 100 KiB behind.
        let part = temp_part("cancel");
        std::fs::write(&part, &data[..100 * 1024]).unwrap();
        let client = reqwest::Client::new();
        // Cancel after about a third of the chunks (the check runs once per chunk).
        let checks = AtomicU64::new(0);
        let cancel_after_some = || checks.fetch_add(1, Ordering::SeqCst) > 40;
        let result = download(
            &client,
            &url,
            &part,
            data.len() as u64,
            &cancel_after_some,
            &|_| {},
        )
        .await;
        assert_eq!(result, Err(SegmentError::Cancelled));
        let kept = partial_bytes(&part);
        assert!(kept > 100 * 1024, "the ranges keep what they got");

        let outcome = download(&client, &url, &part, data.len() as u64, &|| false, &|_| {})
            .await
            .unwrap();
        assert_eq!(outcome, Outcome::Done { sha256: sha(data) });
        assert_eq!(std::fs::read(&part).unwrap(), data);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn servers_without_ranges_are_reported() {
        let data = noise(1 << 20);
        let url = serve_without_ranges(data).await;
        let part = temp_part("plain");
        let outcome = download(
            &reqwest::Client::new(),
            &url,
            &part,
            data.len() as u64,
            &|| false,
            &|_| {},
        )
        .await
        .unwrap();
        assert_eq!(outcome, Outcome::NoRanges);
        assert_eq!(partial_bytes(&part), 0, "nothing half-done stays behind");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn a_missing_file_is_a_status_error() {
        let part = temp_part("missing");
        let app = axum::Router::new().route(
            "/file",
            axum::routing::get(|| async { axum::http::StatusCode::NOT_FOUND }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let result = download(
            &reqwest::Client::new(),
            &format!("http://{addr}/file"),
            &part,
            1 << 20,
            &|| false,
            &|_| {},
        )
        .await;
        assert_eq!(result, Err(SegmentError::Status(404)));
    }
}
