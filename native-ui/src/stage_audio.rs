//! Einmalige Ambient-Vorschau auf dem Standard-Ausgabegerät.
use crate::{stage_media, ui_text::text as label};
use rodio::{Decoder, DeviceSinkBuilder, Player};
use std::{
    io::Cursor,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, Sender, TryRecvError},
    },
    time::Duration,
};

pub struct Preview {
    pub name: String,
    stop: Option<Sender<()>>,
}

impl Preview {
    pub fn new(name: String) -> (Self, Receiver<()>) {
        let (stop, receiver) = mpsc::channel();
        (
            Self {
                name,
                stop: Some(stop),
            },
            receiver,
        )
    }

    pub fn stop(&mut self) {
        self.stop = None;
    }

    pub fn stopping(&self) -> bool {
        self.stop.is_none()
    }
}

pub fn play(
    root: Option<&Path>,
    profile: Option<&Path>,
    name: &str,
    stop: Receiver<()>,
) -> Result<(), String> {
    if cancelled(&stop) {
        return Ok(());
    }
    let (bytes, extension) = stage_media::ambient(root, profile, name)?;
    let source = decode(bytes, &extension)?;
    if cancelled(&stop) {
        return Ok(());
    }
    let device_error = label("gallery.native.ambientDeviceError");
    let failed = Arc::new(AtomicBool::new(false));
    let notify = Arc::clone(&failed);
    let device = DeviceSinkBuilder::from_default_device()
        .map_err(|_| device_error)?
        .with_error_callback(move |_| notify.store(true, Ordering::Relaxed))
        .open_stream()
        .map_err(|_| device_error)?;
    if cancelled(&stop) {
        return Ok(());
    }
    let player = Player::connect_new(device.mixer());
    player.set_volume(0.4);
    player.append(source);
    while !player.empty() {
        if !matches!(
            stop.recv_timeout(Duration::from_millis(40)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ) {
            break;
        }
        if failed.load(Ordering::Relaxed) {
            return Err(device_error.into());
        }
    }
    Ok(())
}

fn cancelled(stop: &Receiver<()>) -> bool {
    !matches!(stop.try_recv(), Err(TryRecvError::Empty))
}

fn decode(bytes: Vec<u8>, extension: &str) -> Result<Decoder<Cursor<Vec<u8>>>, String> {
    Decoder::builder()
        .with_hint(extension)
        .with_byte_len(bytes.len() as u64)
        .with_data(Cursor::new(bytes))
        .build()
        .map_err(|_| label("gallery.native.ambientDecodeError").into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stage_ambient_decoder_reads_pcm_and_rejects_invalid_data() {
        let wave = b"RIFF\x26\0\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0\x40\x1f\0\0\x80\x3e\0\0\x02\0\x10\0data\x02\0\0\0\0\x40";
        let mut decoded = decode(wave.to_vec(), "wav").unwrap();
        assert_eq!(decoded.next(), Some(0.5));
        assert_eq!(decoded.next(), None);
        assert!(decode(b"keine Audioaufnahme".to_vec(), "ogg").is_err());
    }

    #[test]
    fn stage_ambient_cancelled_before_start_skips_file_and_device_access() {
        let (mut preview, stop) = Preview::new("missing.wav".into());
        preview.stop();
        assert!(play(None, None, &preview.name, stop).is_ok());
    }
}
