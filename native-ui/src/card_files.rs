//! Expliziter Kartenexport; keine Profiländerungen und keine Dialogabhängigkeit.
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::Value;
use std::io::{Cursor, Write};
use std::path::Path;

const MAX_JSON_BYTES: usize = 4 * 1024 * 1024;
const MAX_FILE_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug, Clone, Copy)]
pub enum Format {
    Json,
    Png,
}

#[derive(Debug, Clone)]
pub struct Export {
    pub card: Value,
    pub portrait: Option<Vec<u8>>,
}

/// Der Aufrufer hat das Ziel im Speicherdialog gewählt und ein Überschreiben bestätigt.
/// Alle Validierung und Kodierung findet vor dem atomaren Ersetzen statt.
pub fn write(
    path: &Path,
    export: &Export,
    format: Format,
    protected_home: Option<&Path>,
) -> Result<(), String> {
    let target = crate::profile::validate_export_target(path, protected_home)?;
    let card = crate::expressions::portable_card(&export.card);
    let json = serde_json::to_vec_pretty(&card)
        .map_err(|_| "Die Charakterkarte konnte nicht als JSON aufbereitet werden.")?;
    if json.len() > MAX_JSON_BYTES {
        return Err("Die Kartenmetadaten überschreiten die Exportgrenze von 4 MiB.".into());
    }
    let bytes = match format {
        Format::Json => json,
        Format::Png => encode_png(export, &json)?,
    };
    let parent = target.parent().ok_or("Das Exportziel ist ungültig.")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| "Im Zielordner konnte keine temporäre Exportdatei angelegt werden.")?;
    temporary
        .write_all(&bytes)
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|_| "Die Exportdatei konnte nicht vollständig geschrieben werden.")?;
    temporary
        .persist(target)
        .map_err(|_| "Die Exportdatei konnte nicht am gewählten Ziel gespeichert werden.")?;
    Ok(())
}

fn encode_png(export: &Export, json: &[u8]) -> Result<Vec<u8>, String> {
    // Der vorhandene Import begrenzt bereits den Base64-Textchunk auf 4 MiB.
    let metadata = STANDARD.encode(json);
    if metadata.len() > MAX_JSON_BYTES {
        return Err(
            "Die Kartenmetadaten sind für einen PNG-Export zu groß; bitte JSON wählen.".into(),
        );
    }
    let portrait = export
        .portrait
        .as_deref()
        .ok_or("Für einen PNG-Export benötigt der Charakter ein Porträt; bitte JSON wählen.")?;
    if portrait.len() > MAX_FILE_BYTES {
        return Err("Das Porträt überschreitet die Exportgrenze von 32 MiB.".into());
    }
    let mut reader = image::ImageReader::new(Cursor::new(portrait))
        .with_guessed_format()
        .map_err(|_| "Das Hauptporträt hat kein lesbares PNG-/WebP-Format.")?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    reader.limits(limits);
    let portrait = reader
        .decode()
        .map_err(|_| "Das Hauptporträt ist ungültig oder überschreitet 4096 × 4096 Pixel/64 MiB.")?
        .into_rgba8();
    let mut bytes = BoundedBytes(Vec::new());
    {
        let mut encoder = png::Encoder::new(&mut bytes, portrait.width(), portrait.height());
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder
            .add_text_chunk("chara".into(), metadata)
            .map_err(|_| "Die Kartenmetadaten konnten nicht in das PNG eingebettet werden.")?;
        let mut writer = encoder
            .write_header()
            .map_err(|_| "Der PNG-Export konnte nicht begonnen werden.")?;
        writer
            .write_image_data(portrait.as_raw())
            .and_then(|()| writer.finish())
            .map_err(|_| "Der PNG-Export ist fehlgeschlagen oder überschreitet 32 MiB.")?;
    }
    Ok(bytes.0)
}

struct BoundedBytes(Vec<u8>);

impl Write for BoundedBytes {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > MAX_FILE_BYTES.saturating_sub(self.0.len()) {
            return Err(std::io::Error::other("PNG-Exportgrenze überschritten"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    #[test]
    fn all_bundled_cards_export_with_portable_expressions_within_the_budget() {
        let directory = tempfile::tempdir().unwrap();
        for character in crate::model::Preview::default().characters {
            let export = Export {
                card: character.card.unwrap(),
                portrait: character.portrait,
            };
            for (format, extension) in [(Format::Json, "json"), (Format::Png, "png")] {
                let path = directory
                    .path()
                    .join(format!("{}.{extension}", character.id));
                write(&path, &export, format, None).unwrap();
                let imported = crate::profile::import_card_file(&path).unwrap();
                assert_eq!(
                    imported.card,
                    crate::expressions::portable_card(&export.card)
                );
                let expressions = imported.card["data"]["extensions"]["expressions"]
                    .as_object()
                    .unwrap();
                assert_eq!(expressions.len(), 11);
                assert!(expressions.values().all(|value| {
                    value
                        .as_str()
                        .unwrap()
                        .starts_with("data:image/webp;base64,")
                }));
            }
        }
    }
    #[test]
    fn webp_portrait_and_embedded_expression_survive_png_export() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("webp-card.png");
        let mut export = export();
        let bytes = crate::expressions::preview("expressions/shiori_amane/happy.webp").unwrap();
        export.card["data"]["extensions"]["expressions"] = serde_json::json!({"happy":format!("data:image/webp;base64,{}", STANDARD.encode(&bytes))});
        export.portrait = Some(bytes.clone());
        write(&path, &export, Format::Png, None).unwrap();
        let imported = crate::profile::import_card_file(&path).unwrap();
        assert_eq!(imported.card, export.card);
        assert_eq!(
            image::load_from_memory(imported.portrait.as_ref().unwrap())
                .unwrap()
                .into_rgba8(),
            image::load_from_memory(&bytes).unwrap().into_rgba8()
        );
    }

    fn export() -> Export {
        Export {
            card: json!({"spec":"chara_card_v2","spec_version":"2.0","data":{
                "name":"Änne", "description":"Text", "first_mes":"Hallo",
                "alternate_greetings":["Zweite Begrüßung\nmit {{user}}", "Dritte Begrüßung"],
                "extensions":{"foreign":{"kept":42},"selected_lorebook":"book-1","bound_lorebooks":["book-1","unresolved"]},"character_book":{"entries":[]}
            },"foreign_top":true}),
            portrait: None,
        }
    }

    fn portrait() -> Vec<u8> {
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 2, 1);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().unwrap();
            writer
                .write_image_data(&[255, 0, 0, 255, 0, 255, 128, 32])
                .unwrap();
            writer.finish().unwrap();
        }
        bytes
    }

    #[test]
    fn json_roundtrip_preserves_complete_card_and_can_replace_an_export() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("card.json");
        fs::write(&path, b"old exported card").unwrap();
        let export = export();
        write(&path, &export, Format::Json, None).unwrap();
        let imported = crate::profile::import_card_file(&path).unwrap();
        assert_eq!(imported.card, export.card);
        assert_eq!(imported.name, "Änne");
        assert!(imported.portrait.is_none());
    }

    #[test]
    fn png_roundtrip_preserves_pixels_and_current_metadata() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("card.png");
        let mut export = export();
        export.portrait = Some(portrait());
        write(&path, &export, Format::Png, None).unwrap();
        let imported = crate::profile::import_card_file(&path).unwrap();
        assert_eq!(imported.card, export.card);
        let actual = image::load_from_memory(imported.portrait.as_ref().unwrap())
            .unwrap()
            .into_rgba8();
        let expected = image::load_from_memory(export.portrait.as_ref().unwrap())
            .unwrap()
            .into_rgba8();
        assert_eq!(actual, expected);
    }

    #[test]
    fn encoding_error_and_protected_profile_leave_existing_data_untouched() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("card.png");
        fs::write(&path, b"unchanged").unwrap();
        let mut export = export();
        export.portrait = Some(vec![0, 1, 2]);
        assert!(write(&path, &export, Format::Png, None).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"unchanged");
        assert!(write(&path, &export, Format::Json, Some(directory.path())).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"unchanged");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn png_metadata_limit_is_checked_before_replacing_a_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("card.png");
        fs::write(&path, b"unchanged").unwrap();
        let mut export = export();
        export.card["data"]["description"] = "x".repeat(3 * 1024 * 1024).into();
        export.portrait = Some(portrait());
        assert!(write(&path, &export, Format::Png, None).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"unchanged");
    }
}
