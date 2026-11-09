//! Titelbilder öffentlicher Hub-Welten, vorbereitet für den nativen Renderer.

use crate::hub_catalog::{PUBLIC_BASE, fetch};
use iced::widget::image::Handle;
use image::{ImageFormat, ImageReader, Limits, imageops::FilterType};
use std::io::Cursor;
use url::Url;

const MAX_DOWNLOAD_BYTES: usize = 4 * 1024 * 1024;
const MAX_SOURCE_EDGE: u32 = 4096;
const MAX_SOURCE_ALLOCATION: u64 = 64 * 1024 * 1024;
const MAX_WIDTH: u32 = 1000;
const MAX_HEIGHT: u32 = 600;

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
