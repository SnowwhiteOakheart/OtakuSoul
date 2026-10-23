//! The `Sec-MS-GEC` token Microsoft's Edge read-aloud service requires (version 2).
//!
//! Ported from `edge_tts/drm.py` of the edge-tts project by rany2
//! (<https://github.com/rany2/edge-tts>, LGPL-3.0). Since late 2026 the service rejects the
//! older plain SHA-256 token with HTTP 403; version 2 is a SHA-256 with a changed starting state
//! and constants, seeded by the first seven bytes of the input, plus a 64-bit "CS64" checksum.
//! The token is `<16 hex CS64>-<64 hex SHA-256>` over the Windows file time (rounded down to
//! five minutes) followed by the client token.

/// Token version sent as `Sec-MS-GEC-Version` (prefix `2-` = this token, then the Edge version).
pub const SEC_MS_GEC_VERSION: &str = "2-143.0.3650.75";

const WIN_EPOCH: i64 = 11_644_473_600;

const SHA256_INITIAL: [u32; 8] = [
    0x6A09_E667,
    0xBB67_AE85,
    0x3C6E_F372,
    0xA54F_F53A,
    0x510E_527F,
    0x9B05_688C,
    0x1F83_D9AB,
    0x5BE0_CD19,
];
const SHA256_STATE: [u32; 8] = [
    0xFD9F_BEA2,
    0x9124_3CE7,
    0xBE49_9094,
    0xCD2E_1E0A,
    0x6C00_6F49,
    0x04BD_35AB,
    0xFEB0_A7E4,
    0x03EF_FBD2,
];
const SHA256_SCHEDULE: [u32; 14] = [
    0xEB24_BF9E,
    0x1558_691F,
    0xA0C0_9EE2,
    0x0CFA_32BA,
    0xA622_EE8C,
    0xD1DD_9491,
    0xC0DD_25A0,
    0xF9E7_0AB6,
    0xF0C3_1573,
    0x7058_CE4E,
    0x7188_E606,
    0x00E5_AB33,
    0xD258_B060,
    0x7276_6564,
];
const ROUND_CONSTANTS: [u32; 64] = [
    0x428A_2F98,
    0x7137_4491,
    0xB5C0_FBCF,
    0xE9B5_DBA5,
    0x3956_C25B,
    0x59F1_11F1,
    0x923F_82A4,
    0xAB1C_5ED5,
    0xD807_AA98,
    0x1283_5B01,
    0x2431_85BE,
    0x550C_7DC3,
    0x72BE_5D74,
    0x80DE_B1FE,
    0x9BDC_06A7,
    0xC19B_F174,
    0xE49B_69C1,
    0xEFBE_4786,
    0x0FC1_9DC6,
    0x240C_A1CC,
    0x2DE9_2C6F,
    0x4A74_84AA,
    0x5CB0_A9DC,
    0x76F9_88DA,
    0x983E_5152,
    0xA831_C66D,
    0xB003_27C8,
    0xBF59_7FC7,
    0xC6E0_0BF3,
    0xD5A7_9147,
    0x06CA_6351,
    0x1429_2967,
    0x27B7_0A85,
    0x2E1B_2138,
    0x4D2C_6DFC,
    0x5338_0D13,
    0x650A_7354,
    0x766A_0ABB,
    0x81C2_C92E,
    0x9272_2C85,
    0xA2BF_E8A1,
    0xA81A_664B,
    0xC24B_8B70,
    0xC76C_51A3,
    0xD192_E819,
    0xD699_0624,
    0xF40E_3585,
    0x106A_A070,
    0x19A4_C116,
    0x1E37_6C08,
    0x2748_774C,
    0x34B0_BCB5,
    0x391C_0CB3,
    0x4ED8_AA4A,
    0x5B9C_CA4F,
    0x682E_6FF3,
    0x748F_82EE,
    0x78A5_636F,
    0x84C8_7814,
    0x8CC7_0208,
    0x90BE_FFFA,
    0xA450_6CEB,
    0xBEF9_A3F7,
    0xC671_78F2,
];
/// Replaces round constant 14 in the seeded first block.
const SHA256_ADJUSTMENT: u32 = 0xC9DC_06A7;
const SIGMA0_ADJUSTMENT: u32 = 0x059C_0B80;
const SIGMA1_ADJUSTMENT: u32 = 0x000B_92C0;

const CS64_COEFFICIENTS: [(u32, u32); 14] = [
    (0xE82E_91B1, 0xB327_00D0),
    (0x44DE_24C6, 0x88DF_F51D),
    (0x3BEB_65BC, 0x2951_4038),
    (0xC89C_5933, 0xB328_CBDF),
    (0x8D1E_C211, 0xD405_B4D5),
    (0x314E_F5D5, 0x26E5_5F3C),
    (0xE924_91B1, 0x6078_01C6),
    (0xF0A5_B9D5, 0x82B2_C1FB),
    (0x0606_4CF3, 0xFA51_A3DA),
    (0xDA79_FA60, 0x207C_C464),
    (0xBED2_0560, 0x3C3C_74F3),
    (0x89F9_C9F8, 0xD2D1_4B61),
    (0x35FA_38C6, 0xBB04_A2C1),
    (0xCB49_E3C6, 0xC562_6167),
];
const CS64_FACTOR: u32 = 0x8289_3933;
const CS64_ADJUSTMENT0: u32 = 0xF2F9_0B1A;
const CS64_ADJUSTMENT1: u32 = 0x0B1A_0000;

fn sigma0(v: u32) -> u32 {
    v.rotate_right(7) ^ v.rotate_right(18) ^ (v >> 3)
}

fn sigma1(v: u32) -> u32 {
    v.rotate_right(17) ^ v.rotate_right(19) ^ (v >> 10)
}

/// Fills `words` up to 64 entries with the SHA-256 message schedule.
fn expand_schedule(words: &mut Vec<u32>, first: usize) {
    for i in first..64 {
        let value = sigma1(words[i - 2])
            .wrapping_add(words[i - 7])
            .wrapping_add(sigma0(words[i - 15]))
            .wrapping_add(words[i - 16]);
        words.push(value);
    }
}

/// SHA-256 rounds `first_round..64` on `state`; resuming at 14 uses the seeded block's constants.
fn rounds(state: [u32; 8], words: &[u32], first_round: usize) -> [u32; 8] {
    let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = state;
    for (i, &word) in words.iter().enumerate().take(64).skip(first_round) {
        let constant = if first_round == 14 && i == 14 {
            SHA256_ADJUSTMENT
        } else {
            ROUND_CONSTANTS[i]
        };
        let t1 = h
            .wrapping_add(e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25))
            .wrapping_add(g ^ (e & (f ^ g)))
            .wrapping_add(constant)
            .wrapping_add(word);
        let t2 = (a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22))
            .wrapping_add((a & b) | (c & (a | b)));
        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(t1);
        d = c;
        c = b;
        b = a;
        a = t1.wrapping_add(t2);
    }
    [a, b, c, d, e, f, g, h]
}

fn add_states(x: [u32; 8], y: [u32; 8]) -> [u32; 8] {
    std::array::from_fn(|i| x[i].wrapping_add(y[i]))
}

/// The starting state after the seeded first block (the input's first seven bytes).
fn seeded_state(seed: &[u8]) -> [u32; 8] {
    let mut words = vec![0u32; 14];
    words.push(u32::from_be_bytes([0, seed[0], seed[1], seed[2]]));
    words.push(u32::from_be_bytes([seed[3], seed[4], seed[5], seed[6]]));
    for i in 16..30 {
        let mut value = SHA256_SCHEDULE[i - 16];
        if i - 2 >= 14 {
            let s1 = sigma1(words[i - 2]);
            value = value.wrapping_add(if i == 16 { s1 ^ SIGMA1_ADJUSTMENT } else { s1 });
        }
        if i - 7 >= 14 {
            value = value.wrapping_add(words[i - 7]);
        }
        if i - 15 >= 14 {
            let s0 = sigma0(words[i - 15]);
            value = value.wrapping_add(if i == 29 { s0 ^ SIGMA0_ADJUSTMENT } else { s0 });
        }
        words.push(value);
    }
    words.push(
        sigma1(words[28])
            .wrapping_add(words[23])
            .wrapping_add(sigma0(words[15]))
            .wrapping_add(words[14])
            .wrapping_add(SHA256_ADJUSTMENT)
            .wrapping_sub(ROUND_CONSTANTS[14]),
    );
    expand_schedule(&mut words, 31);
    add_states(SHA256_INITIAL, rounds(SHA256_STATE, &words, 14))
}

fn sha256_digest(data: &[u8]) -> [u8; 32] {
    let length = 57 + data.len() as i64;
    let mut padded = data[7..].to_vec();
    padded.push(0x80);
    padded.resize(padded.len() + (55 - length).rem_euclid(64) as usize, 0);
    padded.extend_from_slice(&((length * 8) as u64).to_be_bytes());
    let mut state = seeded_state(&data[..7]);
    for block in padded.chunks(64) {
        let mut words: Vec<u32> = block
            .chunks(4)
            .map(|w| u32::from_be_bytes([w[0], w[1], w[2], w[3]]))
            .collect();
        expand_schedule(&mut words, 16);
        state = add_states(state, rounds(state, &words, 0));
    }
    let mut out = [0u8; 32];
    for (i, word) in state.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

fn rol16(v: u32) -> u32 {
    v.rotate_left(16)
}

/// Little-endian 32-bit words, zero-padded to a whole word and to an even count.
fn words_le_even(data: &[u8]) -> Vec<u32> {
    let mut words: Vec<u32> = data
        .chunks(4)
        .map(|c| {
            let mut w = [0u8; 4];
            w[..c.len()].copy_from_slice(c);
            u32::from_le_bytes(w)
        })
        .collect();
    if words.len() % 2 == 1 {
        words.push(0);
    }
    words
}

fn cs64_digest(data: &[u8], digest: &[u8; 32]) -> (u32, u32) {
    let key_a = u32::from_le_bytes([digest[0], digest[1], digest[2], digest[3]]) | 1;
    let key_b = u32::from_le_bytes([digest[4], digest[5], digest[6], digest[7]]) | 1;
    let factors = [
        key_a.wrapping_mul(CS64_FACTOR),
        key_b.wrapping_mul(CS64_FACTOR),
    ];
    let mut terms: Vec<u32> = CS64_COEFFICIENTS
        .iter()
        .enumerate()
        .map(|(i, (coefficient, _))| coefficient.wrapping_mul(factors[i % 2]))
        .collect();
    let mut offsets: Vec<u32> = CS64_COEFFICIENTS.iter().map(|(_, o)| *o).collect();
    let mut prefixed = vec![0u8];
    prefixed.extend_from_slice(data);
    for (i, word) in words_le_even(&prefixed).into_iter().enumerate() {
        let even = i % 2 == 0;
        let mut term = word.wrapping_mul(if even { key_a } else { key_b });
        let mut offset = rol16(word).wrapping_mul(if even { 0xEF05_69FB } else { 0xC317_13DB });
        if i == 0 {
            term = term.wrapping_add(CS64_ADJUSTMENT0.wrapping_mul(factors[0]));
            offset = offset.wrapping_add(CS64_ADJUSTMENT1);
        }
        terms.push(term);
        offsets.push(offset);
    }
    let (mut swap_acc, mut swap_last, mut state, mut acc) = (0u32, 0u32, 0u32, 0u32);
    for i in (0..terms.len()).step_by(2) {
        let (x, y) = (terms[i], terms[i + 1]);
        let q = rol16(offsets[i].wrapping_add(x)).wrapping_mul(0x76F5_0F34);
        swap_acc = swap_acc.wrapping_add(rol16(q).wrapping_mul(0xC3EF_EA97).wrapping_add(q));
        let q = rol16(offsets[i + 1].wrapping_add(y)).wrapping_mul(0x1881_CE3C);
        swap_last = rol16(q).wrapping_mul(0x35BD_1EC9).wrapping_add(q);
        swap_acc = swap_acc.wrapping_add(swap_last);

        state = state.wrapping_mul(key_a).wrapping_add(x);
        state = rol16(state).wrapping_mul(0xCF98_B111);
        state = rol16(state).wrapping_mul(0x8708_5B9F);
        state = rol16(state).wrapping_mul(0x12CE_B96D);
        state = rol16(state).wrapping_mul(0x257E_1D83);
        acc = acc.wrapping_add(state);
        let mut t = state.wrapping_mul(key_b).wrapping_add(y);
        t = rol16(t).wrapping_mul(0xA274_16F5);
        t = rol16(t).wrapping_mul(0xD383_96FF);
        state = rol16(rol16(t).wrapping_mul(0x7C93_2B89)).wrapping_mul(0xBFA4_9F69);
        acc = acc.wrapping_add(state);
    }
    (swap_last ^ state, swap_acc ^ acc)
}

fn hex_upper(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02X}")).collect()
}

/// The v2 `Sec-MS-GEC` value for a Unix time (valid for the five minutes it falls into).
pub fn sec_ms_gec(unix_timestamp: i64, client_token: &str) -> String {
    let seconds = unix_timestamp + WIN_EPOCH;
    let ticks = (seconds - seconds.rem_euclid(300)) * 10_000_000;
    let data = format!("{ticks}{client_token}");
    let digest = sha256_digest(data.as_bytes());
    let (low, high) = cs64_digest(data.as_bytes(), &digest);
    let mut cs64 = low.to_le_bytes().to_vec();
    cs64.extend_from_slice(&high.to_le_bytes());
    format!("{}-{}", hex_upper(&cs64), hex_upper(&digest))
}

#[cfg(test)]
mod tests {
    const TOKEN: &str = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";

    /// Reference values from the original Python (`generate_sec_ms_gec_v2`).
    #[test]
    fn matches_the_edge_tts_reference() {
        assert_eq!(
            super::sec_ms_gec(1_700_000_000, TOKEN),
            "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2"
        );
        assert_eq!(
            super::sec_ms_gec(1_792_782_000, TOKEN),
            "889FD6929644591F-04E2F3F744337C45DF77ADDD0F1CD21150E21808BE4F88ACED69B569E8F0FD65"
        );
        // Same five-minute window, same token.
        assert_eq!(
            super::sec_ms_gec(1_792_782_299, TOKEN),
            super::sec_ms_gec(1_792_782_000, TOKEN)
        );
        assert_eq!(
            super::sec_ms_gec(1_234_567_890, TOKEN),
            "BA405D1577B8E0CE-61F01E88539977A1A1E969572D82EECFA45FB1E5DEBD122D6ACBAF0054F959E5"
        );
    }
}
