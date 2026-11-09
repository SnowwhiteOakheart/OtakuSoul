//! Separat gespeicherte Stage-Medien und begrenzte lokale Bildvorschauen.
use crate::{native_store, profile, ui_text::text as label};
use iced::widget::image::Handle;
use image::{ImageFormat, ImageReader, Limits, imageops::FilterType};
use std::{
    fs::{self, File},
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};

const IMAGE_LIMIT: usize = 16 * 1024 * 1024;
const AUDIO_LIMIT: usize = 32 * 1024 * 1024;
const INVALID: &str = "gallery.native.mediaInvalid";
const ACCESS: &str = "gallery.native.mediaAccess";

#[derive(Debug, Clone, Copy)]
pub enum Kind {
    Background,
    Ambient,
}

impl Kind {
    pub fn extensions(self) -> &'static [&'static str] {
        match self {
            Self::Background => &["png", "jpg", "jpeg", "webp"],
            Self::Ambient => &["wav", "mp3", "ogg"],
        }
    }

    pub fn import_label(self) -> &'static str {
        label(match self {
            Self::Background => "sceneEdit.importImage",
            Self::Ambient => "sceneEdit.importAudio",
        })
    }

    pub(super) fn directory(self) -> &'static str {
        match self {
            Self::Background => "backgrounds",
            Self::Ambient => "ambient",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Imported {
    pub name: String,
    pub image: Option<Handle>,
}

pub fn list(root: &Path) -> Result<profile::StageMedia, String> {
    let Some(root) = native_store::store_root(root)? else {
        return Ok(profile::StageMedia::default());
    };
    let names = |kind: Kind| -> Result<Vec<String>, String> {
        let Some(dir) = directory(&root, kind)? else {
            return Ok(Vec::new());
        };
        Ok(profile::stage_media_names(&root, &dir, kind.extensions()))
    };
    Ok(profile::StageMedia {
        backgrounds: names(Kind::Background)?,
        ambient: names(Kind::Ambient)?,
    })
}

pub fn import(root: &Path, kind: Kind, source: &Path) -> Result<Imported, String> {
    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|ext| kind.extensions().contains(&ext.as_str()))
        .ok_or_else(|| label(INVALID))?;
    let (bytes, image) = match kind {
        Kind::Background => {
            let bytes = read(source, IMAGE_LIMIT)?;
            let image = decode_image(&bytes, &extension)?;
            (bytes, Some(image))
        }
        Kind::Ambient => {
            let bytes = read(source, AUDIO_LIMIT)?;
            if !matches_audio(&bytes, &extension) {
                return Err(label(INVALID).into());
            }
            (bytes, None)
        }
    };
    profile::validate_native_store(root)?;
    fs::create_dir_all(root).map_err(|_| label(ACCESS))?;
    let root = native_store::store_root(root)?.ok_or_else(|| label(ACCESS))?;
    fs::create_dir_all(root.join(kind.directory())).map_err(|_| label(ACCESS))?;
    let dir = directory(&root, kind)?.ok_or_else(|| label(ACCESS))?;
    let mut temporary = tempfile::Builder::new()
        .prefix("stage-")
        .suffix(".tmp")
        .tempfile_in(&dir)
        .map_err(|_| label(ACCESS))?;
    let id = temporary
        .path()
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or_else(|| label(ACCESS))?;
    let stem: String = source
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("media")
        .chars()
        .take(40)
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let name = format!("{stem}-{id}.{extension}");
    temporary
        .write_all(&bytes)
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|_| label(ACCESS))?;
    temporary
        .persist_noclobber(dir.join(&name))
        .map_err(|_| label(ACCESS))?;
    Ok(Imported { name, image })
}

pub fn preview(
    root: Option<&Path>,
    profile_home: Option<&Path>,
    name: &str,
) -> Result<Handle, String> {
    let (path, extension) = resolve(Kind::Background, root, profile_home, name)?;
    decode_image(&read(&path, IMAGE_LIMIT)?, &extension)
}

pub fn ambient(
    root: Option<&Path>,
    profile_home: Option<&Path>,
    name: &str,
) -> Result<(Vec<u8>, String), String> {
    let (path, extension) = resolve(Kind::Ambient, root, profile_home, name)?;
    let bytes = read(&path, AUDIO_LIMIT)?;
    if !matches_audio(&bytes, &extension) {
        return Err(label(INVALID).into());
    }
    Ok((bytes, extension))
}

pub fn has_ambient(name: &str) -> bool {
    let name = name.trim();
    !name.is_empty()
        && !["none", "null", "silence"]
            .iter()
            .any(|value| name.eq_ignore_ascii_case(value))
}

fn resolve(
    kind: Kind,
    root: Option<&Path>,
    profile_home: Option<&Path>,
    name: &str,
) -> Result<(PathBuf, String), String> {
    let missing = label(match kind {
        Kind::Background => "gallery.native.mediaMissing",
        Kind::Ambient => "gallery.native.ambientMissing",
    });
    let selected = match kind {
        Kind::Background => !name.is_empty() && !name.eq_ignore_ascii_case("none"),
        Kind::Ambient => has_ambient(name),
    };
    if !valid_name(name) || !selected {
        return Err(missing.into());
    }
    let local = if let Some(root) = root {
        match native_store::store_root(root)? {
            Some(root) => directory(&root, kind)?,
            None => None,
        }
    } else {
        None
    };
    let candidates = std::iter::once(name.to_owned()).chain(
        kind.extensions()
            .iter()
            .filter(|_| matches!(kind, Kind::Background))
            .map(|ext| format!("{name}.{ext}")),
    );
    for candidate in candidates {
        let Some(extension) = Path::new(&candidate)
            .extension()
            .and_then(|ext| ext.to_str())
        else {
            continue;
        };
        let extension = extension.to_ascii_lowercase();
        if !kind.extensions().contains(&extension.as_str()) {
            continue;
        }
        let native = local
            .as_ref()
            .map(|dir| dir.join(&candidate))
            .filter(|path| regular_file(path));
        let path = native.or_else(|| {
            profile_home
                .and_then(|home| profile::stage_media_path(home, kind, &candidate))
                .filter(|path| regular_file(path))
        });
        if let Some(path) = path {
            return Ok((path, extension));
        }
    }
    Err(missing.into())
}

pub fn valid_name(name: &str) -> bool {
    !matches!(name, "." | "..")
        && !name.contains(['/', '\\', ':'])
        && !name.chars().any(char::is_control)
}

fn directory(root: &Path, kind: Kind) -> Result<Option<PathBuf>, String> {
    let directory = root.join(kind.directory());
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.is_dir() && !profile::is_link(&metadata) => Ok(Some(directory)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        _ => Err(label(ACCESS).into()),
    }
}

fn regular_file(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|info| info.is_file() && !profile::is_link(&info))
}

fn read(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    if !fs::metadata(path).is_ok_and(|info| info.is_file()) {
        return Err(label(ACCESS).into());
    }
    let file = File::open(path).map_err(|_| label(ACCESS))?;
    if !file.metadata().is_ok_and(|info| info.is_file()) {
        return Err(label(ACCESS).into());
    }
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| label(ACCESS))?;
    if bytes.len() > limit {
        return Err(label("gallery.native.mediaSize").into());
    }
    Ok(bytes)
}

fn decode_image(bytes: &[u8], extension: &str) -> Result<Handle, String> {
    let format = match extension {
        "png" => ImageFormat::Png,
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "webp" => ImageFormat::WebP,
        _ => return Err(label(INVALID).into()),
    };
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(96 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| label(INVALID))?;
    let image = if image.width() > 960 || image.height() > 440 {
        image.resize(960, 440, FilterType::Triangle)
    } else {
        image
    }
    .into_rgba8();
    Ok(Handle::from_rgba(
        image.width(),
        image.height(),
        image.into_raw(),
    ))
}

fn matches_audio(bytes: &[u8], extension: &str) -> bool {
    match extension {
        "wav" => bytes.len() >= 44 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WAVE",
        "ogg" => bytes.len() >= 28 && bytes.starts_with(b"OggS\0"),
        "mp3" => {
            bytes.len() >= 16
                && (bytes.starts_with(b"ID3") || (bytes[0] == 0xff && bytes[1] & 0xe0 == 0xe0))
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stage_media_import_is_persistent_and_keeps_same_named_images_separate() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("stage");
        let source = temp.path().join("Wald.png");
        assert!(list(&root).unwrap().backgrounds.is_empty());
        assert!(!root.exists());
        image::RgbaImage::from_pixel(2, 2, image::Rgba([255, 0, 0, 255]))
            .save(&source)
            .unwrap();
        let first = import(&root, Kind::Background, &source).unwrap();
        assert!(first.image.is_some());
        let first_path = root.join("backgrounds").join(&first.name);
        let original = fs::read(&first_path).unwrap();
        image::RgbaImage::from_pixel(2, 2, image::Rgba([0, 255, 0, 255]))
            .save(&source)
            .unwrap();
        let second = import(&root, Kind::Background, &source).unwrap();
        assert_ne!(first.name, second.name);
        assert_eq!(fs::read(first_path).unwrap(), original);
        assert_eq!(list(&root).unwrap().backgrounds.len(), 2);
        assert!(preview(Some(&root), None, &second.name).is_ok());
        assert!(preview(Some(&root), None, "../Wald.png").is_err());
    }

    #[test]
    fn stage_media_preview_can_resolve_jpeg_names_in_a_profile_copy() {
        let home = tempfile::tempdir().unwrap();
        let backgrounds = home.path().join("data/backgrounds");
        fs::create_dir_all(&backgrounds).unwrap();
        let path = backgrounds.join("cover.jpeg");
        image::RgbImage::from_pixel(2, 2, image::Rgb([40, 100, 200]))
            .save(path)
            .unwrap();
        assert!(preview(None, Some(home.path()), "cover").is_ok());
    }

    #[test]
    fn stage_media_import_rejects_mismatched_formats_and_keeps_valid_audio_bytes() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("stage");
        let bad_image = temp.path().join("not-an-image.webp");
        let wave = temp.path().join("Wind.wav");
        fs::write(&bad_image, b"keine Bilddatei").unwrap();
        fs::write(&wave, b"keine Tondatei").unwrap();
        assert!(import(&root, Kind::Background, &bad_image).is_err());
        assert!(import(&root, Kind::Ambient, &wave).is_err());
        assert!(!root.exists());
        let bytes = b"RIFF\x26\0\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0\x40\x1f\0\0\x80\x3e\0\0\x02\0\x10\0data\x02\0\0\0\0\0";
        fs::write(&wave, bytes).unwrap();
        let imported = import(&root, Kind::Ambient, &wave).unwrap();
        assert!(imported.image.is_none());
        assert_eq!(
            fs::read(root.join("ambient").join(&imported.name)).unwrap(),
            bytes
        );
        assert_eq!(list(&root).unwrap().ambient, [imported.name]);
    }
}
