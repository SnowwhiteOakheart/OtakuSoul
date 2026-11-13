use std::io::Cursor;

use super::pins::BROWSER_USER_AGENT;

pub(super) fn get_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(BROWSER_USER_AGENT)
        .timeout(std::time::Duration::from_secs(35))
        .build()
        .map_err(|e| crate::err!("backend.common.httpClient", error = e))
}

pub(super) fn convert_image_bytes_to_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() >= 8 && &bytes[0..8] == b"\x89PNG\r\n\x1a\n" {
        return Ok(bytes.to_vec());
    }

    let dyn_img = image::load_from_memory(bytes)
        .map_err(|e| crate::err!("backend.common.imageDecode", error = e))?;
    let mut buf = Vec::new();
    dyn_img
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| crate::err!("backend.common.pngConvert", error = e))?;
    Ok(buf)
}

pub(super) fn get_placeholder_png() -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(b"\x89PNG\r\n\x1a\n");
    let ihdr_data = [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0];
    let ihdr_len = (ihdr_data.len() as u32).to_be_bytes();
    let mut ihdr_full = Vec::from(b"IHDR" as &[u8]);
    ihdr_full.extend_from_slice(&ihdr_data);
    let ihdr_crc = crc32fast::hash(&ihdr_full).to_be_bytes();
    out.extend_from_slice(&ihdr_len);
    out.extend_from_slice(&ihdr_full);
    out.extend_from_slice(&ihdr_crc);

    let idat_data = [
        0x78, 0x9c, 0x63, 0x54, 0x33, 0xda, 0xff, 0x00, 0x04, 0x8a, 0x02, 0xec,
    ];
    let idat_len = (idat_data.len() as u32).to_be_bytes();
    let mut idat_full = Vec::from(b"IDAT" as &[u8]);
    idat_full.extend_from_slice(&idat_data);
    let idat_crc = crc32fast::hash(&idat_full).to_be_bytes();
    out.extend_from_slice(&idat_len);
    out.extend_from_slice(&idat_full);
    out.extend_from_slice(&idat_crc);

    out.extend_from_slice(&[0, 0, 0, 0, b'I', b'E', b'N', b'D', 0xae, 0x42, 0x60, 0x82]);
    out
}

// =========================================================================
// 1. Soul Gateway (Kuratierte Waifus & Gefährten)
// =========================================================================

