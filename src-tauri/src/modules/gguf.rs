//! Minimal GGUF header reader: layer count, trained context and the size of the KV cache per
//! token, without loading the model, so the planner can size context and GPU layers.

use std::collections::HashMap;
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

/// A metadata value, as far as the app needs it: numbers, strings and integer arrays.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Int(u64),
    Float(f64),
    Str(String),
    Ints(Vec<u64>),
    Other,
}

impl Value {
    fn as_u32(&self) -> Option<u32> {
        match self {
            Value::Int(v) => u32::try_from(*v).ok(),
            _ => None,
        }
    }
}

/// Reads one value; arrays of strings or floats (the tokenizer's vocabulary) are skipped.
fn read_value(r: &mut impl Read, value_type: u32) -> Option<Value> {
    match value_type {
        0 | 1 | 7 => {
            let mut b = [0u8; 1];
            r.read_exact(&mut b).ok()?;
            Some(Value::Int(u64::from(b[0])))
        }
        2 | 3 => {
            let mut b = [0u8; 2];
            r.read_exact(&mut b).ok()?;
            Some(Value::Int(u64::from(u16::from_le_bytes(b))))
        }
        4 | 5 => Some(Value::Int(u64::from(read_u32(r)?))),
        6 => Some(Value::Float(f64::from(f32::from_bits(read_u32(r)?)))),
        10 | 11 => Some(Value::Int(read_u64(r)?)),
        12 => Some(Value::Float(f64::from_bits(read_u64(r)?))),
        8 => read_string(r).map(Value::Str),
        9 => {
            let item_type = read_u32(r)?;
            let count = read_u64(r)?;
            let integer = matches!(item_type, 0..=5 | 7 | 10 | 11);
            // Per-layer settings are small; long integer arrays (token types, merges) are skipped.
            if integer && count <= 4096 {
                let mut items = Vec::with_capacity(count as usize);
                for _ in 0..count {
                    match read_value(r, item_type)? {
                        Value::Int(v) => items.push(v),
                        _ => return None,
                    }
                }
                return Some(Value::Ints(items));
            }
            match fixed_size(item_type) {
                Some(size) => skip(r, size.checked_mul(count)?)?,
                None => {
                    for _ in 0..count {
                        read_value(r, item_type)?;
                    }
                }
            }
            Some(Value::Other)
        }
        _ => None,
    }
}

/// All metadata of a GGUF file (without loading tensors).
pub fn metadata(path: &Path) -> Option<HashMap<String, Value>> {
    let mut r = BufReader::new(File::open(path).ok()?);
    let mut magic = [0u8; 4];
    r.read_exact(&mut magic).ok()?;
    if &magic != MAGIC {
        return None;
    }
    let _version = read_u32(&mut r)?;
    let _tensor_count = read_u64(&mut r)?;
    let kv_count = read_u64(&mut r)?.min(MAX_ENTRIES);
    let mut values = HashMap::new();
    for _ in 0..kv_count {
        let key = read_string(&mut r)?;
        let value_type = read_u32(&mut r)?;
        let value = read_value(&mut r, value_type)?;
        values.insert(key, value);
    }
    Some(values)
}

/// Number of transformer blocks of a GGUF model, e.g. 64 for a 27B model.
pub fn block_count(path: &Path) -> Option<u32> {
    model_shape(path).map(|shape| shape.layers)
}

/// What the context planner needs to know about a model.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ModelShape {
    pub layers: u32,
    /// Context length the model was trained for (`<arch>.context_length`).
    pub trained_context: Option<u32>,
    /// KV cache bytes per token of context at f16 (layers that see the whole context);
    /// `None` when the attention layout is unknown.
    pub kv_bytes_per_token: Option<u64>,
    /// KV cache bytes per token of the sliding-window layers, which only keep `window` tokens.
    pub swa_bytes_per_token: u64,
    pub window: u32,
}

impl ModelShape {
    /// KV cache in bytes for `context` tokens at f16; `ubatch` is the extra room llama.cpp keeps
    /// in sliding-window caches.
    pub fn kv_bytes(&self, context: u32, ubatch: u32) -> Option<u64> {
        let full = self.kv_bytes_per_token? * u64::from(context);
        let swa_tokens = self.window.saturating_add(ubatch).min(context);
        Some(full + self.swa_bytes_per_token * u64::from(swa_tokens))
    }
}

/// Layers, trained context and KV cache size of a GGUF model.
pub fn model_shape(path: &Path) -> Option<ModelShape> {
    shape_of(&metadata(path)?)
}

fn shape_of(meta: &HashMap<String, Value>) -> Option<ModelShape> {
    let arch = match meta.get("general.architecture") {
        Some(Value::Str(arch)) => arch.clone(),
        _ => meta
            .keys()
            .find_map(|k| k.strip_suffix(".block_count"))?
            .to_string(),
    };
    let get = |name: &str| meta.get(&format!("{arch}.{name}"));
    let int = |name: &str| get(name).and_then(Value::as_u32);
    let layers = int("block_count").filter(|n| *n > 0)?;
    let mut shape = ModelShape {
        layers,
        trained_context: int("context_length").filter(|n| *n > 0),
        ..ModelShape::default()
    };
    // Models that only store a compressed latent (MLA) are not covered by the formula below.
    if get("attention.kv_lora_rank").is_some() {
        return Some(shape);
    }
    let heads = int("attention.head_count").filter(|h| *h > 0);
    let head_dim = heads.zip(int("embedding_length")).map(|(h, e)| e / h);
    let (Some(key), Some(value)) = (
        int("attention.key_length").or(head_dim),
        int("attention.value_length").or(head_dim),
    ) else {
        return Some(shape);
    };
    let window = int("attention.sliding_window").unwrap_or(0);
    let pattern = get("attention.sliding_window_pattern");
    // Hybrid models (Qwen3.5, Qwen3-Next): only every n-th layer has attention, the others
    // keep a small recurrent state.
    let interval = int("full_attention_interval").filter(|n| *n > 1);
    let mut full = 0u64;
    let mut swa = 0u64;
    for layer in 0..layers as usize {
        if interval.is_some_and(|n| (layer + 1) % n as usize != 0) {
            continue;
        }
        let kv_heads = match get("attention.head_count_kv") {
            Some(Value::Ints(per_layer)) => per_layer.get(layer).copied().unwrap_or(0),
            Some(Value::Int(n)) => *n,
            // Without the key the model has as many KV heads as query heads.
            _ => u64::from(heads.unwrap_or(0)),
        };
        let sliding = window > 0
            && match pattern {
                Some(Value::Ints(flags)) => flags.get(layer).is_some_and(|f| *f != 0),
                // Older files without a pattern: Gemma 2 alternates, Gemma 3 has every 6th layer global.
                _ => match arch.as_str() {
                    "gemma2" => layer % 2 == 0,
                    "gemma3" => (layer + 1) % 6 != 0,
                    _ => false,
                },
            };
        let (k, v) = if sliding {
            (
                int("attention.key_length_swa").unwrap_or(key),
                int("attention.value_length_swa").unwrap_or(value),
            )
        } else {
            (key, value)
        };
        let bytes = kv_heads * u64::from(k + v) * 2;
        if sliding {
            swa += bytes;
        } else {
            full += bytes;
        }
    }
    if full + swa > 0 {
        shape.kv_bytes_per_token = Some(full);
        shape.swa_bytes_per_token = swa;
        shape.window = if swa > 0 { window } else { 0 };
    }
    Some(shape)
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

    fn meta(arch: &str, entries: &[(&str, Value)]) -> HashMap<String, Value> {
        let mut map: HashMap<String, Value> = entries
            .iter()
            .map(|(k, v)| (format!("{arch}.{k}"), v.clone()))
            .collect();
        map.insert("general.architecture".into(), Value::Str(arch.into()));
        map
    }

    /// Layouts of real files; the expected sizes match llama.cpp's log (`llama_kv_cache: size`).
    #[test]
    fn kv_cache_follows_the_attention_layout() {
        // Mistral Nemo: 40 layers × 8 KV heads × (128 + 128) × 2 bytes; 16K → 2560 MiB.
        let nemo = shape_of(&meta(
            "llama",
            &[
                ("block_count", Value::Int(40)),
                ("context_length", Value::Int(1_024_000)),
                ("attention.head_count", Value::Int(32)),
                ("attention.head_count_kv", Value::Int(8)),
                ("attention.key_length", Value::Int(128)),
                ("attention.value_length", Value::Int(128)),
            ],
        ))
        .unwrap();
        assert_eq!(nemo.trained_context, Some(1_024_000));
        assert_eq!(nemo.kv_bytes(16_384, 512), Some(2560 << 20));

        // Qwen3.5 (Bonsai): attention only in every 4th of 64 layers; 16K → 1024 MiB.
        let qwen = shape_of(&meta(
            "qwen35",
            &[
                ("block_count", Value::Int(64)),
                ("full_attention_interval", Value::Int(4)),
                ("attention.head_count", Value::Int(24)),
                ("attention.head_count_kv", Value::Int(4)),
                ("attention.key_length", Value::Int(256)),
                ("attention.value_length", Value::Int(256)),
            ],
        ))
        .unwrap();
        assert_eq!(qwen.kv_bytes(16_384, 512), Some(1024 << 20));

        // Gemma 4: 8 global layers (1 KV head × 512) grow with the context, 40 sliding layers
        // keep 1024 + 512 tokens; 16K → 256 MiB + 480 MiB.
        let pattern: Vec<u64> = (0..48).map(|l| u64::from((l + 1) % 6 != 0)).collect();
        let kv_heads: Vec<u64> = pattern
            .iter()
            .map(|&swa| if swa == 1 { 8 } else { 1 })
            .collect();
        let gemma = shape_of(&meta(
            "gemma4",
            &[
                ("block_count", Value::Int(48)),
                ("attention.head_count", Value::Int(16)),
                ("attention.head_count_kv", Value::Ints(kv_heads)),
                ("attention.key_length", Value::Int(512)),
                ("attention.value_length", Value::Int(512)),
                ("attention.key_length_swa", Value::Int(256)),
                ("attention.value_length_swa", Value::Int(256)),
                ("attention.sliding_window", Value::Int(1024)),
                ("attention.sliding_window_pattern", Value::Ints(pattern)),
            ],
        ))
        .unwrap();
        assert_eq!(gemma.kv_bytes(16_384, 512), Some((256 + 480) << 20));
        // A short context needs no full window.
        assert_eq!(gemma.kv_bytes(1_024, 512), Some((16 + 320) << 20));
    }

    #[test]
    fn unknown_layouts_have_no_kv_size() {
        let mla = shape_of(&meta(
            "deepseek2",
            &[
                ("block_count", Value::Int(27)),
                ("attention.head_count", Value::Int(16)),
                ("attention.kv_lora_rank", Value::Int(512)),
                ("embedding_length", Value::Int(2048)),
            ],
        ))
        .unwrap();
        assert_eq!(mla.layers, 27);
        assert_eq!(mla.kv_bytes(4096, 512), None);
    }

    /// Reads a real model: `OTAKUSOUL_GGUF=/path/model.gguf cargo test --lib reads_real_gguf -- --ignored --nocapture`
    #[test]
    #[ignore = "needs a model file"]
    fn reads_real_gguf() {
        let path = std::env::var("OTAKUSOUL_GGUF").expect("OTAKUSOUL_GGUF");
        let meta = metadata(Path::new(&path)).expect("metadata");
        let mut keys: Vec<_> = meta
            .iter()
            .filter(|(k, _)| !k.starts_with("tokenizer."))
            .collect();
        keys.sort_by(|a, b| a.0.cmp(b.0));
        for (key, value) in keys {
            println!("{key} = {value:?}");
        }
        let shape = model_shape(Path::new(&path));
        println!("{path}: {shape:?}");
        assert!(shape.is_some_and(|s| s.layers > 0));
    }
}
