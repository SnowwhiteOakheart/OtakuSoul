//! Minimal GGUF header reader: finds the transformer layer count (`<arch>.block_count`)
//! without loading the model, so the VRAM planner can offload a fraction of the layers.

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

const MAGIC: &[u8; 4] = b"GGUF";
/// Stop after this many metadata entries; the block count comes early in real files.
const MAX_ENTRIES: u64 = 4096;

fn read_u32(r: &mut impl Read) -> Option<u32> {
    let mut b = [0u8; 4];
    r.read_exact(&mut b).ok()?;
    Some(u32::from_le_bytes(b))
}

fn read_u64(r: &mut impl Read) -> Option<u64> {
    let mut b = [0u8; 8];
    r.read_exact(&mut b).ok()?;
    Some(u64::from_le_bytes(b))
}

fn read_string(r: &mut impl Read) -> Option<String> {
    let len = read_u64(r)?;
    // Keys and architecture names are short; anything huge means a corrupt header.
    if len > 1 << 20 {
        return None;
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf).ok()?;
    String::from_utf8(buf).ok()
}

fn skip(r: &mut impl Read, bytes: u64) -> Option<()> {
    std::io::copy(&mut r.take(bytes), &mut std::io::sink())
        .ok()
        .filter(|copied| *copied == bytes)
        .map(|_| ())
}

/// Size in bytes of a fixed-size GGUF value type, `None` for strings and arrays.
fn fixed_size(value_type: u32) -> Option<u64> {
    match value_type {
        0 | 1 | 7 => Some(1), // u8, i8, bool
        2 | 3 => Some(2),     // u16, i16
        4..=6 => Some(4),     // u32, i32, f32
        10..=12 => Some(8),   // u64, i64, f64
        _ => None,
    }
}

/// Reads an integer value of any integer type, or skips a non-integer value.
fn read_value(r: &mut impl Read, value_type: u32) -> Option<Option<u64>> {
    match value_type {
        0 | 1 | 7 => {
            let mut b = [0u8; 1];
            r.read_exact(&mut b).ok()?;
            Some(Some(u64::from(b[0])))
        }
        2 | 3 => {
            let mut b = [0u8; 2];
            r.read_exact(&mut b).ok()?;
            Some(Some(u64::from(u16::from_le_bytes(b))))
        }
        4 | 5 => Some(Some(u64::from(read_u32(r)?))),
        10 | 11 => Some(Some(read_u64(r)?)),
        8 => read_string(r).map(|_| None),
        9 => {
            let item_type = read_u32(r)?;
            let count = read_u64(r)?;
            match fixed_size(item_type) {
                Some(size) => skip(r, size.checked_mul(count)?)?,
                None => {
                    for _ in 0..count {
                        read_value(r, item_type)?;
                    }
                }
            }
            Some(None)
        }
        other => skip(r, fixed_size(other)?).map(|_| None),
    }
}

/// Number of transformer blocks of a GGUF model, e.g. 64 for a 27B model.
pub fn block_count(path: &Path) -> Option<u32> {
    let mut r = BufReader::new(File::open(path).ok()?);
    let mut magic = [0u8; 4];
    r.read_exact(&mut magic).ok()?;
    if &magic != MAGIC {
        return None;
    }
    let _version = read_u32(&mut r)?;
    let _tensor_count = read_u64(&mut r)?;
    let kv_count = read_u64(&mut r)?.min(MAX_ENTRIES);
    for _ in 0..kv_count {
        let key = read_string(&mut r)?;
        let value_type = read_u32(&mut r)?;
        let value = read_value(&mut r, value_type)?;
        if key.ends_with(".block_count") {
            return value.and_then(|v| u32::try_from(v).ok());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn string(s: &str) -> Vec<u8> {
        let mut out = (s.len() as u64).to_le_bytes().to_vec();
        out.extend_from_slice(s.as_bytes());
        out
    }

    #[test]
    fn reads_block_count_after_other_metadata() {
        let mut file = b"GGUF".to_vec();
        file.extend_from_slice(&3u32.to_le_bytes());
        file.extend_from_slice(&0u64.to_le_bytes());
        file.extend_from_slice(&3u64.to_le_bytes());
        // general.architecture = "qwen3" (string)
        file.extend(string("general.architecture"));
        file.extend_from_slice(&8u32.to_le_bytes());
        file.extend(string("qwen3"));
        // tokenizer.ggml.tokens = ["a", "b"] (array of strings)
        file.extend(string("tokenizer.ggml.tokens"));
        file.extend_from_slice(&9u32.to_le_bytes());
        file.extend_from_slice(&8u32.to_le_bytes());
        file.extend_from_slice(&2u64.to_le_bytes());
        file.extend(string("a"));
        file.extend(string("b"));
        // qwen3.block_count = 64 (u32)
        file.extend(string("qwen3.block_count"));
        file.extend_from_slice(&4u32.to_le_bytes());
        file.extend_from_slice(&64u32.to_le_bytes());

        let path = std::env::temp_dir().join(format!("otakusoul-gguf-{}.gguf", std::process::id()));
        std::fs::write(&path, &file).unwrap();
        assert_eq!(block_count(&path), Some(64));
        std::fs::write(&path, b"not a gguf").unwrap();
        assert_eq!(block_count(&path), None);
        let _ = std::fs::remove_file(path);
    }
}
