//! Whether music (or any sound) plays on the computer, and its beat, for the desktop pet to
//! nod along. Only the loudness of the default output device is read (Windows' audio meter) –
//! no audio content, no application names. Elsewhere the pet simply gets no such signal.

use std::time::{Duration, Instant};

/// Below this peak (0…1) nothing audible plays.
const AUDIBLE: f32 = 0.02;
/// Sound has to last this long to count as music (a notification sound does not).
const MUSIC_AFTER: Duration = Duration::from_millis(2500);
/// Silence for this long ends the music.
const MUSIC_ENDS_AFTER: Duration = Duration::from_millis(1500);
/// A beat is a peak this much above the recent average …
const BEAT_RATIO: f32 = 1.35;
/// … and at least this loud …
const BEAT_MIN: f32 = 0.06;
/// … and at least this long after the last one (fastest nod: ~210 bpm).
const BEAT_GAP: Duration = Duration::from_millis(280);
/// Weight of the newest peak in the running average.
const AVERAGE_WEIGHT: f32 = 0.08;

/// What a peak sample changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Sample {
    /// Music starts (`Some(true)`) or ends (`Some(false)`) with this sample.
    pub music: Option<bool>,
    /// This sample is a beat.
    pub beat: bool,
}

/// Turns the loudness over time into "music is playing" and beats.
#[derive(Debug, Default)]
pub struct BeatDetector {
    average: f32,
    loud_since: Option<Instant>,
    quiet_since: Option<Instant>,
    last_beat: Option<Instant>,
    music: bool,
}

impl BeatDetector {
    pub fn push(&mut self, peak: f32, now: Instant) -> Sample {
        let mut out = Sample::default();
        if peak >= AUDIBLE {
            self.quiet_since = None;
            let since = *self.loud_since.get_or_insert(now);
            if !self.music && now.duration_since(since) >= MUSIC_AFTER {
                self.music = true;
                out.music = Some(true);
            }
        } else {
            self.loud_since = None;
            let since = *self.quiet_since.get_or_insert(now);
            if self.music && now.duration_since(since) >= MUSIC_ENDS_AFTER {
                self.music = false;
                self.average = 0.0;
                out.music = Some(false);
            }
        }
        if self.music
            && peak >= BEAT_MIN
            && peak > self.average * BEAT_RATIO
            && self
                .last_beat
                .is_none_or(|last| now.duration_since(last) >= BEAT_GAP)
        {
            self.last_beat = Some(now);
            out.beat = true;
        }
        self.average += (peak - self.average) * AVERAGE_WEIGHT;
        out
    }
}

/// Loudness meter of the default output device; reopened by the caller when it fails.
#[cfg(windows)]
pub struct Meter(windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation);

#[cfg(windows)]
impl Meter {
    /// Must be called on the thread that uses the meter.
    pub fn open() -> Option<Self> {
        use windows::Win32::Media::Audio::{
            Endpoints::IAudioMeterInformation, IMMDeviceEnumerator, MMDeviceEnumerator, eConsole,
            eRender,
        };
        use windows::Win32::System::Com::{
            CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        };
        // SAFETY: COM calls on the calling thread; every interface is owned by its wrapper.
        unsafe {
            // Already initialised on this thread is fine.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let device = enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?;
            let meter: IAudioMeterInformation = device.Activate(CLSCTX_ALL, None).ok()?;
            Some(Self(meter))
        }
    }

    /// Current peak (0…1) over all sound the device plays; `None` when the device is gone.
    pub fn peak(&self) -> Option<f32> {
        // SAFETY: plain query on a live interface.
        unsafe { self.0.GetPeakValue().ok() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Feeds `peaks` every 25 ms from `start`.
    fn feed(detector: &mut BeatDetector, start: Instant, peaks: &[f32]) -> Vec<Sample> {
        peaks
            .iter()
            .enumerate()
            .map(|(i, &p)| detector.push(p, start + Duration::from_millis(25 * i as u64)))
            .collect()
    }

    #[test]
    fn a_short_sound_is_no_music() {
        let mut detector = BeatDetector::default();
        let samples = feed(&mut detector, Instant::now(), &[0.4; 40]);
        assert!(samples.iter().all(|s| s.music.is_none() && !s.beat));
    }

    #[test]
    fn lasting_sound_starts_music_and_silence_ends_it() {
        let mut detector = BeatDetector::default();
        let start = Instant::now();
        let on = feed(&mut detector, start, &[0.3; 120]);
        assert_eq!(on.iter().filter(|s| s.music == Some(true)).count(), 1);
        let later = start + Duration::from_millis(25 * 120);
        let off = feed(&mut detector, later, &[0.0; 100]);
        assert_eq!(off.iter().filter(|s| s.music == Some(false)).count(), 1);
    }

    #[test]
    fn peaks_above_the_average_are_beats_but_not_faster_than_the_gap() {
        let mut detector = BeatDetector::default();
        let start = Instant::now();
        // Four seconds of steady sound, then a beat pattern: loud every 500 ms.
        let mut peaks = vec![0.15; 160];
        for i in 0..80 {
            peaks.push(if i % 20 == 0 { 0.8 } else { 0.15 });
        }
        let samples = feed(&mut detector, start, &peaks);
        let beats = samples[160..].iter().filter(|s| s.beat).count();
        assert_eq!(beats, 4);
        // A sustained loud level is no beat.
        assert!(samples[100..160].iter().all(|s| !s.beat));
    }
}
