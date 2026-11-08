//! Offline-Ausdrucksbilder: bekannte Presets oder eingebettete PNG-/WebP-Daten.
//! Fremde Referenzen bleiben Kartendaten; diese Vorschau lädt sie niemals aus Netz oder CWD.
use base64::{Engine, engine::general_purpose::STANDARD};
use std::fmt;
use std::io::{Cursor, Read};
use std::path::Path;

const MAX_IMAGE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Slot {
    Neutral,
    Happy,
    Sad,
    Angry,
    Surprised,
    Relaxed,
    Blush,
    Teasing,
    Fear,
    Disgust,
    Crying,
    Seductive,
    Aroused,
    Ecstasy,
    Afterglow,
}

pub const SLOTS: [Slot; 15] = [
    Slot::Neutral,
    Slot::Happy,
    Slot::Sad,
    Slot::Angry,
    Slot::Surprised,
    Slot::Relaxed,
    Slot::Blush,
    Slot::Teasing,
    Slot::Fear,
    Slot::Disgust,
    Slot::Crying,
    Slot::Seductive,
    Slot::Aroused,
    Slot::Ecstasy,
    Slot::Afterglow,
];

impl Slot {
    pub fn key(self) -> &'static str {
        match self {
            Self::Neutral => "neutral",
            Self::Happy => "happy",
            Self::Sad => "sad",
            Self::Angry => "angry",
            Self::Surprised => "surprised",
            Self::Relaxed => "relaxed",
            Self::Blush => "blush",
            Self::Teasing => "teasing",
            Self::Fear => "fear",
            Self::Disgust => "disgust",
            Self::Crying => "crying",
            Self::Seductive => "seductive",
            Self::Aroused => "aroused",
            Self::Ecstasy => "ecstasy",
            Self::Afterglow => "afterglow",
        }
    }

    pub fn group(self) -> &'static str {
        match self {
            Self::Neutral
            | Self::Happy
            | Self::Sad
            | Self::Angry
            | Self::Surprised
            | Self::Relaxed => "Grundstimmungen",
            Self::Blush | Self::Teasing | Self::Fear | Self::Disgust | Self::Crying => {
                "Weitere Ausdrücke"
            }
            Self::Seductive | Self::Aroused | Self::Ecstasy | Self::Afterglow => "Romantik",
        }
    }
}

impl fmt::Display for Slot {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Neutral => "Neutral",
            Self::Happy => "Fröhlich",
            Self::Sad => "Traurig",
            Self::Angry => "Wütend",
            Self::Surprised => "Überrascht",
            Self::Relaxed => "Entspannt",
            Self::Blush => "Errötet",
            Self::Teasing => "Neckisch",
            Self::Fear => "Ängstlich",
            Self::Disgust => "Angewidert",
            Self::Crying => "Weinend",
            Self::Seductive => "Verführerisch",
            Self::Aroused => "Erregt",
            Self::Ecstasy => "Ekstase",
            Self::Afterglow => "Nachglühen",
        })
    }
}

macro_rules! bundled_character {
    ($id:literal, $reference:expr) => {{
        match $reference.strip_prefix(concat!("expressions/", $id, "/")) {
            Some("neutral.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/neutral.webp"
                ))
                .as_slice(),
            ),
            Some("happy.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/happy.webp"
                ))
                .as_slice(),
            ),
            Some("sad.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/sad.webp"
                ))
                .as_slice(),
            ),
            Some("angry.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/angry.webp"
                ))
                .as_slice(),
            ),
            Some("surprised.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/surprised.webp"
                ))
                .as_slice(),
            ),
            Some("relaxed.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/relaxed.webp"
                ))
                .as_slice(),
            ),
            Some("blush.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/blush.webp"
                ))
                .as_slice(),
            ),
            Some("teasing.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/teasing.webp"
                ))
                .as_slice(),
            ),
            Some("fear.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/fear.webp"
                ))
                .as_slice(),
            ),
            Some("disgust.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/disgust.webp"
                ))
                .as_slice(),
            ),
            Some("crying.webp") => Some(
                include_bytes!(concat!(
                    "../../presets/characters/expressions/",
                    $id,
                    "/crying.webp"
                ))
                .as_slice(),
            ),
            _ => None,
        }
    }};
}

fn bundled(reference: &str) -> Option<&'static [u8]> {
    bundled_character!("shiori_amane", reference)
        .or_else(|| bundled_character!("sota_minase", reference))
        .or_else(|| bundled_character!("lirwen", reference))
        .or_else(|| bundled_character!("faelion", reference))
}

/// Macht bekannte Presetbilder beim Export unabhängig von den Ressourcen dieser EXE.
/// Fremde Verweise und alle unbekannten Felder bleiben unverändert.
pub fn portable_card(card: &serde_json::Value) -> serde_json::Value {
    let mut card = card.clone();
    let data = if card.get("data").is_some() {
        card.get_mut("data").expect("data wurde gerade geprüft")
    } else {
        &mut card
    };
    if let Some(extensions) = data
        .get_mut("extensions")
        .and_then(serde_json::Value::as_object_mut)
    {
        for key in ["expressions", "custom_expressions", "sow_expressions"] {
            if let Some(expressions) = extensions
                .get_mut(key)
                .and_then(serde_json::Value::as_object_mut)
            {
                for value in expressions.values_mut() {
                    if let Some(bytes) = value.as_str().and_then(bundled) {
                        *value =
                            format!("data:image/webp;base64,{}", STANDARD.encode(bytes)).into();
                    }
                }
            }
        }
    }
    card
}

fn validated_format(bytes: &[u8]) -> Result<image::ImageFormat, String> {
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("Das Ausdrucksbild überschreitet 1 MiB. Bitte eine kleinere PNG- oder WebP-Datei wählen.".into());
    }
    let format = image::guess_format(bytes)
        .map_err(|_| "Das Ausdrucksbild ist keine gültige PNG- oder WebP-Datei.")?;
    if !matches!(format, image::ImageFormat::Png | image::ImageFormat::WebP) {
        return Err("Ausdrucksbilder werden derzeit nur als PNG oder WebP unterstützt.".into());
    }
    let mut reader = image::ImageReader::with_format(Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().map_err(
        |_| "Das Ausdrucksbild ist ungültig oder überschreitet 4096 × 4096 Pixel/64 MiB.",
    )?;
    Ok(format)
}

/// Liefert nur geprüfte eingebettete Daten oder exakt bekannte mitgelieferte Assets.
pub fn preview(reference: &str) -> Result<Vec<u8>, String> {
    if let Some(bytes) = bundled(reference) {
        validated_format(bytes)?;
        return Ok(bytes.to_vec());
    }
    let (encoded, expected) = if let Some(encoded) =
        reference.strip_prefix("data:image/png;base64,")
    {
        (encoded, image::ImageFormat::Png)
    } else if let Some(encoded) = reference.strip_prefix("data:image/webp;base64,") {
        (encoded, image::ImageFormat::WebP)
    } else {
        return Err("Dieser Bildverweis wird offline nicht aufgelöst. Wähle ein PNG-/WebP-Bild zum Einbetten; der vorhandene Verweis bleibt bis dahin erhalten.".into());
    };
    if encoded.len() > MAX_IMAGE_BYTES.div_ceil(3) * 4 {
        return Err("Das eingebettete Ausdrucksbild überschreitet 1 MiB.".into());
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Das eingebettete Ausdrucksbild enthält ungültige Base64-Daten.")?;
    if validated_format(&bytes)? != expected {
        return Err("Das Bildformat stimmt nicht mit dem eingebetteten Datentyp überein.".into());
    }
    Ok(bytes)
}

/// Nur nach ausdrücklicher Dateiauswahl; erhält komprimierte Originalbytes statt neu zu kodieren.
pub fn pick_image(path: &Path) -> Result<String, String> {
    let file =
        std::fs::File::open(path).map_err(|_| "Das Ausdrucksbild konnte nicht geöffnet werden.")?;
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Das Ausdrucksbild konnte nicht vollständig gelesen werden.")?;
    let format = validated_format(&bytes)?;
    let mime = if format == image::ImageFormat::Png {
        "png"
    } else {
        "webp"
    };
    Ok(format!(
        "data:image/{mime};base64,{}",
        STANDARD.encode(bytes)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png() -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 1, 1);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().unwrap();
            writer.write_image_data(&[255, 0, 128, 255]).unwrap();
            writer.finish().unwrap();
        }
        bytes
    }

    #[test]
    fn explicitly_picked_png_roundtrips_without_reencoding() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("portrait.png");
        let bytes = png();
        std::fs::write(&path, &bytes).unwrap();
        let reference = pick_image(&path).unwrap();
        assert!(reference.starts_with("data:image/png;base64,"));
        assert_eq!(preview(&reference).unwrap(), bytes);
    }

    #[test]
    fn malformed_mime_data_and_external_references_are_rejected() {
        for reference in [
            "https://example.invalid/portrait.png",
            "../portrait.png",
            "C:/portrait.png",
            "blob:portrait",
            "data:image/png;base64,???",
        ] {
            assert!(preview(reference).is_err());
        }
        assert!(
            preview(&format!(
                "data:image/webp;base64,{}",
                STANDARD.encode(png())
            ))
            .is_err()
        );
        assert!(
            preview(&format!(
                "data:image/png;base64,{}",
                "A".repeat(MAX_IMAGE_BYTES * 2)
            ))
            .is_err()
        );
    }

    #[test]
    fn known_bundled_webp_is_available_without_the_working_directory() {
        assert!(
            preview("expressions/shiori_amane/happy.webp")
                .unwrap()
                .starts_with(b"RIFF")
        );
        assert!(preview("expressions/shiori_amane/../happy.webp").is_err());
        assert!(preview("expressions/shiori_amane/seductive.webp").is_err());
        assert_eq!(SLOTS.len(), 15);
        assert_eq!(
            SLOTS
                .iter()
                .filter(|slot| slot.group() == "Grundstimmungen")
                .count(),
            6
        );
    }

    #[test]
    fn image_bytes_are_bounded_before_decoding() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("oversized.png");
        std::fs::write(&path, vec![0; MAX_IMAGE_BYTES + 1]).unwrap();
        assert!(pick_image(&path).unwrap_err().contains("1 MiB"));
    }

    #[test]
    fn portable_export_embeds_known_assets_in_all_aliases_and_preserves_other_data() {
        for wrapped in [false, true] {
            let data = serde_json::json!({"name":"Figur","extensions":{
                "expressions":{"happy":"expressions/shiori_amane/happy.webp","foreign":"https://example.invalid/image.webp","number":42},
                "custom_expressions":{"old":"expressions/sota_minase/sad.webp"},
                "sow_expressions":{"legacy":"expressions/lirwen/neutral.webp","local":"../local.webp"},
                "other":{"kept":true}
            }});
            let original = if wrapped {
                serde_json::json!({"data":data,"unknown_top":true})
            } else {
                data
            };
            let snapshot = original.clone();
            let result = portable_card(&original);
            assert_eq!(original, snapshot);
            let extensions = &result.get("data").unwrap_or(&result)["extensions"];
            let expected = format!(
                "data:image/webp;base64,{}",
                STANDARD.encode(bundled("expressions/shiori_amane/happy.webp").unwrap())
            );
            assert_eq!(extensions["expressions"]["happy"], expected);
            assert!(
                extensions["custom_expressions"]["old"]
                    .as_str()
                    .unwrap()
                    .starts_with("data:image/webp;base64,")
            );
            assert!(
                extensions["sow_expressions"]["legacy"]
                    .as_str()
                    .unwrap()
                    .starts_with("data:image/webp;base64,")
            );
            assert_eq!(
                extensions["expressions"]["foreign"],
                "https://example.invalid/image.webp"
            );
            assert_eq!(extensions["expressions"]["number"], 42);
            assert_eq!(extensions["sow_expressions"]["local"], "../local.webp");
            assert_eq!(extensions["other"]["kept"], true);
            if wrapped {
                assert_eq!(result["unknown_top"], true);
            }
        }
    }
}
