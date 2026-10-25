import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Mic, Square, Stethoscope } from 'lucide-react';
import type { VoiceConfig } from '../../types';
import { api } from '../../services/api';
import { audioPlayer, gainFromVoiceVolume } from '../../services/audioPlayer';
import { SILENT_VISEMES, type Visemes } from '../../services/lipSync';
import { VoiceCapture, type VoiceCaptureResult } from '../../services/voiceCapture';
import { useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { judgeMicCheck, rawLevel, type MicCheckVerdict } from '../../utils/micCheck';

type Phase = 'idle' | 'listening' | 'transcribing' | 'speaking' | 'done' | 'error';

interface MicCheckProps {
  /** The settings being edited (also unsaved ones), so the check tests what is on screen. */
  config: VoiceConfig;
  /** Whose voice repeats the sentence. */
  speakerName: string;
  /** Takes over a suggested VAD threshold. */
  onThreshold: (value: number) => void;
}

/** A test sentence is short; after this the recording stops by itself. */
const MAX_TEST_MS = 15_000;
/** Background noise is measured after this (the first frames include the click). */
const FLOOR_AFTER_MS = 500;

/** Mouth openness and width from the lip-sync shapes (same source as the avatars). */
function mouthShape(visemes: Visemes) {
  const open = Math.min(1, visemes.aa + visemes.oh * 0.8 + visemes.ou * 0.6 + visemes.ee * 0.5 + visemes.ih * 0.35);
  const wide = 1 + visemes.ee * 0.5 + visemes.ih * 0.6 - visemes.ou * 0.45 - visemes.oh * 0.25;
  return { open, wide };
}

/**
 * One-click check of the whole speech chain: speak once → see the voice detection react →
 * read what speech recognition understood → the character repeats it with lip sync.
 * Each step that fails says why and how to fix it.
 */
export function MicCheck({ config, speakerName, onThreshold }: MicCheckProps) {
  const { t } = useTranslation();
  const captureRef = useRef<VoiceCapture | null>(null);
  const runRef = useRef(0);
  const statsRef = useRef({ peak: 0, floor: Number.POSITIVE_INFINITY, speech: false, startedAt: 0 });
  const [phase, setPhase] = useState<Phase>('idle');
  const [level, setLevel] = useState(0);
  const [speechSeen, setSpeechSeen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [transcribeMs, setTranscribeMs] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<MicCheckVerdict | null>(null);
  const [error, setError] = useState('');
  const [visemes, setVisemes] = useState<Visemes>(SILENT_VISEMES);

  const threshold = config.stt.vad_threshold;
  const sttReady = config.stt.engine !== 'disabled';
  const ttsReady = config.engine !== 'disabled';

  useEffect(() => audioPlayer.onAudioFrame((_amplitude, next) => setVisemes(next)), []);
  useEffect(() => () => {
    runRef.current += 1;
    void captureRef.current?.cancel();
  }, []);

  const finish = async (run: number, result: VoiceCaptureResult | null, endedBySilence: boolean) => {
    if (run !== runRef.current) return;
    setLevel(0);
    const stats = statsRef.current;
    const judged = judgeMicCheck({
      peak: stats.peak,
      floor: Number.isFinite(stats.floor) ? stats.floor : 0,
      speechDetected: stats.speech,
      endedBySilence,
    }, threshold);
    setVerdict(judged);
    if (!result || judged.kind === 'silent' || !sttReady) {
      setPhase('done');
      return;
    }

    setPhase('transcribing');
    const started = performance.now();
    try {
      const text = (await api.transcribeSpeech(result.audioBase64, config.stt)).trim();
      if (run !== runRef.current) return;
      setTranscribeMs(Math.round(performance.now() - started));
      setTranscript(text);
      if (!text) {
        setError(t('micCheck.noText'));
        setPhase('error');
        return;
      }
      if (!ttsReady) {
        setPhase('done');
        return;
      }
      setPhase('speaking');
      const audioUrl = await api.synthesizeSpeech(text, config);
      if (run !== runRef.current) return;
      await audioPlayer.playDataUrl(audioUrl, gainFromVoiceVolume(config.volume), config.output_device_id, config.effects);
      await audioPlayer.waitForIdle(60_000);
      if (run === runRef.current) setPhase('done');
    } catch (reason) {
      if (run !== runRef.current) return;
      setError(errorMessage(reason));
      setPhase('error');
    }
  };

  const start = async () => {
    const run = ++runRef.current;
    audioPlayer.stop();
    setError('');
    setTranscript('');
    setTranscribeMs(null);
    setVerdict(null);
    setSpeechSeen(false);
    statsRef.current = { peak: 0, floor: Number.POSITIVE_INFINITY, speech: false, startedAt: performance.now() };
    const capture = new VoiceCapture();
    captureRef.current = capture;
    setPhase('listening');
    try {
      await capture.start({
        inputDeviceId: config.stt.input_device_id,
        vadThreshold: threshold,
        silenceMs: config.stt.vad_silence_ms,
        autoStopOnSilence: true,
        maxDurationMs: MAX_TEST_MS,
        onLevel: (reported, speech) => {
          if (run !== runRef.current) return;
          const stats = statsRef.current;
          const raw = rawLevel(reported, threshold);
          stats.peak = Math.max(stats.peak, raw);
          if (performance.now() - stats.startedAt >= FLOOR_AFTER_MS) stats.floor = Math.min(stats.floor, raw);
          stats.speech = speech;
          setLevel(reported);
          setSpeechSeen(speech);
        },
        onAutoStop: (result) => {
          const stats = statsRef.current;
          const byTime = performance.now() - stats.startedAt >= MAX_TEST_MS - 50;
          void finish(run, result, stats.speech && !byTime);
        },
      });
    } catch (reason) {
      if (run !== runRef.current) return;
      setError(errorMessage(reason));
      setPhase('error');
    }
  };

  const stopNow = async () => {
    const run = runRef.current;
    const result = (await captureRef.current?.stop()) ?? null;
    await finish(run, result, false);
  };

  const cancel = () => {
    runRef.current += 1;
    void captureRef.current?.cancel();
    audioPlayer.stop();
    setLevel(0);
    setPhase('idle');
  };

  const busy = phase === 'transcribing' || phase === 'speaking';
  const { open, wide } = mouthShape(visemes);
  const steps: { key: string; label: string; state: 'wait' | 'active' | 'ok' | 'skip' | 'fail' }[] = [
    {
      key: 'vad',
      label: t('micCheck.stepVad'),
      state: phase === 'listening' ? (speechSeen ? 'ok' : 'active')
        : verdict ? (verdict.kind === 'ok' || verdict.kind === 'tooNoisy' ? 'ok' : 'fail') : 'wait',
    },
    {
      key: 'stt',
      label: t('micCheck.stepStt'),
      state: !sttReady ? 'skip' : phase === 'transcribing' ? 'active'
        : transcript ? 'ok' : phase === 'error' && verdict ? 'fail' : 'wait',
    },
    {
      key: 'tts',
      label: t('micCheck.stepTts', { name: speakerName }),
      state: !ttsReady || !sttReady ? 'skip' : phase === 'speaking' ? 'active'
        : phase === 'done' && transcript ? 'ok' : phase === 'error' && transcript ? 'fail' : 'wait',
    },
  ];

  return (
    <section id="mic-check" aria-labelledby="mic-check-title" className="rounded-lg border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="mic-check-title" className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Stethoscope className="w-4 h-4 text-cyan-300" />{t('micCheck.title')}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">{t('micCheck.intro')}</p>
        </div>
        {phase === 'listening' ? (
          <div className="flex shrink-0 gap-2">
            <button id="mic-check-stop" onClick={() => void stopNow()} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-500">
              <Square className="w-3.5 h-3.5" />{t('micCheck.stop')}
            </button>
            <button onClick={cancel} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">{t('common.cancel')}</button>
          </div>
        ) : (
          <button
            id="mic-check-start"
            onClick={() => void start()}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
            {phase === 'idle' ? t('micCheck.start') : t('micCheck.again')}
          </button>
        )}
      </div>

      {phase !== 'idle' && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                <span>{phase === 'listening' ? t('micCheck.speakNow') : t('micCheck.level')}</span>
                <span className={speechSeen ? 'text-emerald-300' : ''}>{speechSeen ? t('micCheck.speechSeen') : t('micCheck.noSpeechYet')}</span>
              </div>
              {/* The threshold sits at a quarter of the bar (the level is scaled to 4× the threshold). */}
              <div
                className="relative h-2.5 overflow-hidden rounded-full bg-slate-800"
                role="meter"
                aria-label={t('micCheck.level')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(level * 100)}
              >
                <span
                  className={`block h-full transition-[width] duration-75 ${level >= 0.25 ? 'bg-emerald-400' : 'bg-cyan-500'}`}
                  style={{ width: `${Math.round(level * 100)}%` }}
                />
                <span className="absolute inset-y-0 left-1/4 w-0.5 bg-amber-300" title={t('micCheck.thresholdMark')} />
              </div>
            </div>

            <ol className="space-y-1 text-xs">
              {steps.map((step) => (
                <li key={step.key} data-step={step.key} data-state={step.state} className="flex items-center gap-2">
                  {step.state === 'active' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-300" />
                    : step.state === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      : <span className={`inline-block w-3.5 h-3.5 rounded-full border ${step.state === 'fail' ? 'border-rose-400 bg-rose-500/40' : 'border-slate-600'}`} />}
                  <span className={step.state === 'skip' ? 'text-slate-500 line-through' : 'text-slate-300'}>{step.label}</span>
                </li>
              ))}
            </ol>

            {transcript && (
              <blockquote id="mic-check-transcript" className="rounded-lg border border-slate-700 bg-app/60 p-2.5 text-sm text-slate-100">
                „{transcript}“
                {transcribeMs !== null && (
                  <span className="mt-1 block text-[11px] text-slate-500">{t('micCheck.took', { seconds: (transcribeMs / 1000).toFixed(1) })}</span>
                )}
              </blockquote>
            )}
          </div>

          {/* A simple face whose mouth follows the same lip-sync shapes as the avatars. */}
          <svg viewBox="0 0 80 80" className="h-20 w-20 justify-self-center" role="img" aria-label={t('micCheck.mouth')} data-mouth-open={open.toFixed(2)}>
            <circle cx="40" cy="40" r="36" className="fill-slate-800 stroke-slate-600" strokeWidth="2" />
            <circle cx="28" cy="32" r="3.5" className="fill-slate-300" />
            <circle cx="52" cy="32" r="3.5" className="fill-slate-300" />
            <ellipse cx="40" cy="54" rx={9 * wide} ry={1.5 + open * 9} className="fill-rose-400/80" />
          </svg>
        </div>
      )}

      {verdict && verdict.kind !== 'ok' && phase !== 'listening' && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-xs text-amber-100">
          <span>
            {verdict.kind === 'silent' && t('micCheck.silent')}
            {verdict.kind === 'tooQuiet' && t('micCheck.tooQuiet')}
            {verdict.kind === 'tooNoisy' && t('micCheck.tooNoisy')}
          </span>
          {verdict.kind !== 'silent' && verdict.suggested !== threshold && (
            <button
              id="mic-check-apply"
              onClick={() => onThreshold(verdict.suggested)}
              className="rounded-md border border-amber-400/50 px-2 py-1 font-medium hover:bg-amber-900/40"
            >
              {t('micCheck.applyThreshold', { value: verdict.suggested.toFixed(3) })}
            </button>
          )}
        </div>
      )}
      {phase === 'done' && !sttReady && verdict?.kind !== 'silent' && (
        <p className="text-xs text-slate-400">{t('micCheck.needStt')}</p>
      )}
      {phase === 'done' && sttReady && !ttsReady && transcript && (
        <p className="text-xs text-slate-400">{t('micCheck.needTts')}</p>
      )}
      {error && <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-2.5 text-xs text-rose-200 break-words">{error}</p>}
    </section>
  );
}
