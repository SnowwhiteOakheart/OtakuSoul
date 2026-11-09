//! Titelbilder öffentlicher Hub-Welten, vorbereitet für den nativen Renderer.

use crate::hub_catalog::{PUBLIC_BASE, fetch};
use iced::widget::image::Handle;
use image::{ImageFormat, ImageReader, Limits, imageops::FilterType};
use std::collections::{HashSet, VecDeque};
use std::io::Cursor;
use url::Url;

const MAX_DOWNLOAD_BYTES: usize = 4 * 1024 * 1024;
const MAX_SOURCE_EDGE: u32 = 4096;
const MAX_SOURCE_ALLOCATION: u64 = 64 * 1024 * 1024;
const MAX_WIDTH: u32 = 800;
const MAX_HEIGHT: u32 = 480;
const MAX_ACTIVE: usize = 3;
const MAX_CACHED: usize = 32;

/// Raster und Weltansicht teilen sich Anfragen und vorbereitete Bilder.
#[derive(Default)]
pub struct Gallery {
    pending: VecDeque<Url>,
    active: HashSet<Url>,
    completed: VecDeque<(Url, Option<Handle>)>,
}

impl Gallery {
    pub fn get(&self, url: &Url) -> Option<&Handle> {
        self.completed
            .iter()
            .find(|(cached, _)| cached == url)
            .and_then(|(_, image)| image.as_ref())
    }

    pub fn request(&mut self, url: Url) {
        if !self.is_known(&url) && !self.pending.contains(&url) {
            self.pending.push_back(url);
        }
    }

    pub fn prioritize(&mut self, url: Url) {
        if !self.is_known(&url) {
            self.hide(&url);
            self.pending.push_front(url);
        }
    }

    pub fn hide(&mut self, url: &Url) {
        self.pending.retain(|pending| pending != url);
    }

    pub fn clear_pending(&mut self) {
        self.pending.clear();
    }

    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> Option<Url> {
        if self.active.len() >= MAX_ACTIVE {
            return None;
        }
        let url = self.pending.pop_front()?;
        self.active.insert(url.clone());
        Some(url)
    }

    pub fn complete(&mut self, url: Url, handle: Option<Handle>) {
        if self.active.remove(&url) {
            if self.completed.len() >= MAX_CACHED {
                self.completed.pop_front();
            }
            self.completed.push_back((url, handle));
        }
    }

    pub fn retry_failed(&mut self) {
        self.completed.retain(|(_, image)| image.is_some());
    }

    fn is_known(&self, url: &Url) -> bool {
        self.active.contains(url) || self.completed.iter().any(|(cached, _)| cached == url)
    }
}

pub fn address(value: &str) -> Option<Url> {
    // Vor dem Parsen prüfen, damit der URL-Parser keine Pfadabschnitte still normalisiert.
    let relative = value.strip_prefix(PUBLIC_BASE)?.strip_prefix("presets/")?;
    if !relative.split('/').all(safe_segment) {
        return None;
    }
    let url = Url::parse(value).ok()?;
    if url.query().is_some() || url.fragment().is_some() {
        return None;
    }
    let (stem, extension) = url.path_segments()?.next_back()?.rsplit_once('.')?;
    if stem.is_empty()
        || !(extension.eq_ignore_ascii_case("webp") || extension.eq_ignore_ascii_case("png"))
    {
        return None;
    }
    Some(url)
}

fn safe_segment(segment: &str) -> bool {
    !matches!(segment, "" | "." | "..")
        && !segment
            .bytes()
            .any(|byte| byte == b'\\' || byte.is_ascii_control())
        && segment.split('%').skip(1).all(|escape| {
            escape
                .get(..2)
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
                .is_some_and(|byte| {
                    !byte.is_ascii_control() && !matches!(byte, b'.' | b'/' | b'\\' | b'%')
                })
        })
}

pub fn load(url: Url) -> Result<Handle, String> {
    let url = address(url.as_str()).ok_or("Die Adresse des Hub-Titelbilds ist ungültig.")?;
    decode(&fetch(url, MAX_DOWNLOAD_BYTES)?)
}

fn decode(bytes: &[u8]) -> Result<Handle, String> {
    let format = image::guess_format(bytes)
        .ok()
        .filter(|format| matches!(format, ImageFormat::Png | ImageFormat::WebP))
        .ok_or("Das Hub-Titelbild hat kein lesbares PNG- oder WebP-Format.")?;
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_SOURCE_EDGE);
    limits.max_image_height = Some(MAX_SOURCE_EDGE);
    limits.max_alloc = Some(MAX_SOURCE_ALLOCATION);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| "Das Hub-Titelbild ist ungültig oder zu groß.")?;
    let pixels = if image.width() > MAX_WIDTH || image.height() > MAX_HEIGHT {
        image.resize(MAX_WIDTH, MAX_HEIGHT, FilterType::Lanczos3)
    } else {
        image
    }
    .into_rgba8();
    Ok(Handle::from_rgba(
        pixels.width(),
        pixels.height(),
        pixels.into_raw(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::DynamicImage;

    fn cover_url(name: impl std::fmt::Display) -> Url {
        address(&format!("{PUBLIC_BASE}presets/{name}/cover.webp")).unwrap()
    }

    #[test]
    fn gallery_limits_concurrency_and_prioritizes_opened_worlds() {
        let mut gallery = Gallery::default();
        let urls: Vec<_> = (0..5).map(cover_url).collect();
        for url in &urls {
            gallery.request(url.clone());
            gallery.request(url.clone());
        }
        gallery.prioritize(urls[4].clone());
        for index in [4, 0, 1] {
            assert_eq!(gallery.next(), Some(urls[index].clone()));
        }
        assert_eq!(gallery.next(), None);

        gallery.hide(&urls[2]);
        gallery.complete(urls[4].clone(), None);
        assert_eq!(gallery.next(), Some(urls[3].clone()));
        gallery.request(urls[2].clone());
        gallery.clear_pending();
        gallery.request(urls[1].clone());
        gallery.complete(urls[3].clone(), None);
        assert_eq!(gallery.next(), None);
    }

    #[test]
    fn gallery_reuses_loaded_images_and_retries_failures_only_on_request() {
        let mut gallery = Gallery::default();
        let failed = cover_url("failed");
        let loaded = cover_url("loaded");
        let unknown = cover_url("unknown");
        for url in [&failed, &loaded] {
            gallery.request(url.clone());
            assert_eq!(gallery.next().as_ref(), Some(url));
        }
        let handle = Handle::from_rgba(1, 1, vec![0; 4]);
        gallery.complete(failed.clone(), None);
        gallery.complete(loaded.clone(), Some(handle.clone()));
        gallery.complete(unknown.clone(), Some(handle));
        assert!(gallery.get(&failed).is_none());
        assert!(gallery.get(&loaded).is_some());
        assert!(gallery.get(&unknown).is_none());
        gallery.prioritize(failed.clone());
        gallery.prioritize(loaded.clone());
        assert_eq!(gallery.next(), None);

        gallery.retry_failed();
        gallery.request(failed.clone());
        gallery.prioritize(loaded);
        assert_eq!(gallery.next(), Some(failed));
        assert_eq!(gallery.next(), None);
    }

    #[test]
    fn gallery_evicts_the_oldest_completed_result_at_capacity() {
        let mut gallery = Gallery::default();
        let first = cover_url(0);
        for index in 0..=MAX_CACHED {
            let url = cover_url(index);
            gallery.request(url.clone());
            assert_eq!(gallery.next(), Some(url.clone()));
            gallery.complete(url, Some(Handle::from_rgba(1, 1, vec![0; 4])));
        }
        assert!(gallery.get(&first).is_none());
        assert!(gallery.get(&cover_url(1)).is_some());
        gallery.request(first.clone());
        assert_eq!(gallery.next(), Some(first));
    }

    #[test]
    fn only_public_preset_cover_urls_are_accepted() {
        assert!(address(&format!("{PUBLIC_BASE}presets/studio-39/cover.webp")).is_some());
        assert!(address(&format!("{PUBLIC_BASE}presets/Welt%20A/Bild.PNG")).is_some());
        for value in [
            format!("{PUBLIC_BASE}presets/../presets/cover.png"),
            format!("{PUBLIC_BASE}presets/%2e%2e/presets/cover.png"),
            format!("{PUBLIC_BASE}presets/a%2fb/cover.png"),
            format!("{PUBLIC_BASE}presets/a%255cb/cover.png"),
            format!("{PUBLIC_BASE}presets/\\a/cover.png"),
            format!("{PUBLIC_BASE}presets/a//cover.png"),
            format!("{PUBLIC_BASE}presets/a/cover.png?variant=1"),
            format!("{PUBLIC_BASE}presets/a/cover.png#fragment"),
            format!("{PUBLIC_BASE}presets/a/cover.svg"),
            format!("{PUBLIC_BASE}cards_gateway/cover.png"),
            "https://example.org/presets/cover.png".into(),
            "https://user@raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data/main/presets/cover.png".into(),
            "https://raw.githubusercontent.com/SnowwhiteOakheart/otakusoul-data-nsfw/main/presets/cover.png".into(),
        ] {
            assert!(address(&value).is_none(), "{value}");
        }
    }

    #[test]
    fn cover_decode_caps_dimensions_and_returns_rgba() {
        let encode = |width, height, format| {
            let mut buffer = Cursor::new(Vec::new());
            DynamicImage::new_rgba8(width, height)
                .write_to(&mut buffer, format)
                .unwrap();
            buffer.into_inner()
        };
        let oversized = encode(MAX_SOURCE_EDGE + 1, 1, ImageFormat::Png);
        assert!(decode(&oversized).is_err());
        let png = encode(1100, 660, ImageFormat::Png);
        let Handle::Rgba {
            width,
            height,
            pixels,
            ..
        } = decode(&png).unwrap()
        else {
            panic!("Titelbild wurde nicht als RGBA vorbereitet");
        };
        assert_eq!((width, height), (MAX_WIDTH, MAX_HEIGHT));
        assert_eq!(pixels.len(), (width * height * 4) as usize);
        let webp = encode(20, 12, ImageFormat::WebP);
        assert!(matches!(
            decode(&webp).unwrap(),
            Handle::Rgba {
                width: 20,
                height: 12,
                ..
            }
        ));
    }
}
