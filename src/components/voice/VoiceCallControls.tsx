import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Phone, PhoneOff, Radio } from 'lucide-react';
import { VoiceConfig } from '../../types';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { streamingTts } from '../../services/streamingTts';
import { BARGE_IN_DEFAULTS, VoiceCapture, VoiceCaptureResult } from '../../services/voiceCapture';
import { translate, type TranslationKey } from '../../i18n';

type VoiceCallState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

interface VoiceCallControlsProps {
  config: VoiceConfig | null;
  isGenerating: boolean;
  onDraft: (text: string) => void;
  onSend: (text: string) => Promise<void>;
  onAbort: () => Promise<void>;
  onEnsureAutoTts: () => void;
  /** Barge-in: the user interrupted the reply after hearing `heard` of it. */
  onInterrupted?: (heard: string) => Promise<void>;
}

const STATE_LABELS: Record<VoiceCallState, TranslationKey> = {
  idle: 'voice.state.idle',
  listening: 'voice.state.listening',
  transcribing: 'voice.state.transcribing',
  thinking: 'voice.state.thinking',
  speaking: 'voice.state.speaking',
  error: 'voice.state.error',
};

export function VoiceCallControls({
  config,
  isGenerating,
  onDraft,
  onSend,
  onAbort,
  onEnsureAutoTts,
  onInterrupted,
}: VoiceCallControlsProps) {
  const captureRef = useRef(new VoiceCapture());
  const callActiveRef = useRef(false);
  const mountedRef = useRef(true);
  /** Counts turns: an interruption or a new utterance makes older steps stop. */
  const turnRef = useRef(0);
  const generatingRef = useRef(isGenerating);
  /** The send of the current turn (resolves once the reply is stored, also after an abort). */
  const sendingRef = useRef<Promise<void> | null>(null);
  /** Abort and cutting of an interrupted reply; the next send waits for it. */
  const interruptionRef = useRef<Promise<void> | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [state, setState] = useState<VoiceCallState>('idle');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [interrupted, setInterrupted] = useState(false);

  const updateCallActive = (active: boolean) => {
    callActiveRef.current = active;
    setCallActive(active);
  };

  const resetToIdle = () => {
    if (!mountedRef.current) return;
    setState('idle');
    setLevel(0);
  };

  const fail = (reason: unknown) => {
    if (!mountedRef.current) return;
    const message = reason instanceof Error ? reason.message : String(reason);
    setError(message);
    setState('error');
    setLevel(0);
    updateCallActive(false);
  };

  /**
   * The user speaks while the character thinks or talks: her voice stops at once, the reply is
   * aborted and cut after what was heard; the recording goes on as the user's next turn.
   */
  const interrupt = () => {
    turnRef.current += 1;
    const heard = streamingTts.heard();
    streamingTts.cancel();
    if (mountedRef.current) {
      setState('listening');
      setInterrupted(true);
    }
    const sending = sendingRef.current;
    const wasGenerating = generatingRef.current;
    const work = (async () => {
      if (wasGenerating) await onAbort().catch((reason) => console.warn('Abbruch beim Unterbrechen fehlgeschlagen:', reason));
      await sending?.catch(() => undefined);
      if (heard && onInterrupted) {
        await onInterrupted(heard).catch((reason) => console.warn('Unterbrochene Antwort nicht markiert:', reason));
      }
    })();
    interruptionRef.current = work;
    void work.finally(() => {
      if (interruptionRef.current === work) interruptionRef.current = null;
    });
  };

  const beginListening = async (continuous: boolean, listenAlong = false) => {
    if (!config || config.stt.engine === 'disabled') {
      fail(translate('voice.needStt'));
      return;
    }
    setError('');
    if (!listenAlong) setState('listening');
    try {
      await captureRef.current.start({
        inputDeviceId: config.stt.input_device_id,
        vadThreshold: config.stt.vad_threshold,
        silenceMs: config.stt.vad_silence_ms,
        autoStopOnSilence: continuous,
        maxDurationMs: 60_000,
        bargeIn: listenAlong ? { ...BARGE_IN_DEFAULTS, onBargeIn: interrupt } : undefined,
        onLevel: (nextLevel) => {
          if (mountedRef.current) setLevel(nextLevel);
        },
        onAutoStop: (result) => {
          if (result) void processRecording(result, true);
          else if (callActiveRef.current) void beginListening(true);
          else resetToIdle();
        },
      });
    } catch (reason) {
      fail(reason);
    }
  };

  const processRecording = async (recording: VoiceCaptureResult, autoSend: boolean) => {
    if (!config) return;
    const turn = ++turnRef.current;
    setLevel(0);
    setState('transcribing');
    try {
      const transcript = await api.transcribeSpeech(recording.audioBase64, config.stt);
      if (!transcript.trim()) throw new Error(translate('voice.noSpeech'));
      if (!autoSend) {
        onDraft(transcript.trim());
        resetToIdle();
        return;
      }

      // An interrupted reply is aborted and cut first, so it is complete before the next turn.
      await interruptionRef.current;
      if (turn !== turnRef.current) return;
      setInterrupted(false);
      setState('thinking');
      // Listening along while the character answers, so the user can cut in.
      const listenAlong = callActiveRef.current && config.stt.barge_in !== false;
      if (listenAlong) await beginListening(true, true);
      const sending = onSend(transcript.trim());
      sendingRef.current = sending;
      await sending;
      if (turn !== turnRef.current) return;
      if (!callActiveRef.current) {
        await captureRef.current.cancel();
        resetToIdle();
        return;
      }
      setState('speaking');
      await streamingTts.waitForIdle();
      if (turn !== turnRef.current) return;
      if (!callActiveRef.current) {
        resetToIdle();
      } else if (captureRef.current.isArmed()) {
        // She finished without being interrupted: the same recording now waits for the user's turn.
        captureRef.current.disarm();
        setState('listening');
      } else if (!captureRef.current.isActive()) {
        await beginListening(true);
      }
    } catch (reason) {
      if (turn === turnRef.current) fail(reason);
    }
  };

  const togglePushToTalk = async () => {
    const continueCall = callActiveRef.current;
    // In a call while the character answers: the microphone button interrupts her.
    if (captureRef.current.isArmed()) {
      interrupt();
      captureRef.current.disarm();
      return;
    }
    if (captureRef.current.isActive()) {
      const result = await captureRef.current.stop();
      if (result) await processRecording(result, continueCall);
      else resetToIdle();
      return;
    }
    if (isGenerating || audioPlayer.isBusy()) {
      streamingTts.cancel();
      if (isGenerating) await onAbort();
    }
    await beginListening(continueCall);
  };

  const stopCall = async () => {
    turnRef.current += 1;
    updateCallActive(false);
    setInterrupted(false);
    if (captureRef.current.isActive()) await captureRef.current.cancel();
    streamingTts.cancel();
    if (isGenerating) await onAbort();
    resetToIdle();
  };

  const toggleCall = async () => {
    if (callActiveRef.current) {
      await stopCall();
      return;
    }
    if (!config || config.stt.engine === 'disabled' || config.engine === 'disabled') {
      fail(translate('voice.callNeedsEngines'));
      return;
    }
    updateCallActive(true);
    onEnsureAutoTts();
    await beginListening(true);
  };

  useEffect(() => {
    generatingRef.current = isGenerating;
  }, [isGenerating]);

  useEffect(() => {
    const unsubscribe = audioPlayer.onPlaybackState((playbackState) => {
      if (callActiveRef.current && playbackState === 'playing') setState('speaking');
    });
    return unsubscribe;
  }, []);

  // Set on every mount: StrictMode and hidden views run the cleanup once and mount again.
  useEffect(() => {
    mountedRef.current = true;
    const capture = captureRef.current;
    return () => {
      mountedRef.current = false;
      callActiveRef.current = false;
      turnRef.current += 1;
      void capture.cancel();
    };
  }, []);

  const busy = state === 'transcribing' || state === 'thinking';
  // While she answers in a call, the microphone button cuts in (barge-in).
  const canCutIn = callActive && config?.stt.barge_in !== false && (state === 'thinking' || state === 'speaking');
  const micLabel: TranslationKey = canCutIn ? 'voice.interrupt'
    : state === 'listening' && !callActive ? 'voice.stopRecording' : 'voice.startRecording';
  return (
    <div className="relative flex items-center gap-1" data-call-state={state} data-interrupted={interrupted ? 'true' : undefined}>
      {(state !== 'idle' || callActive) && (
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg border border-cyan-500/30 bg-cyan-950/30 text-[11px] text-cyan-200">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />}
          <span>{translate(interrupted && state === 'listening' ? 'voice.state.interrupted' : STATE_LABELS[state])}</span>
          {state === 'listening' && (
            <span className="w-12 h-1 rounded-full bg-slate-800 overflow-hidden">
              <span
                className="block h-full bg-cyan-400 transition-[width] duration-75"
                style={{ width: `${Math.round(level * 100)}%` }}
              />
            </span>
          )}
        </div>
      )}
      <button
        onClick={() => void togglePushToTalk()}
        disabled={!config || config.stt.engine === 'disabled' || (busy && !canCutIn)}
        className={`p-2.5 rounded-xl border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
          state === 'listening' && !callActive
            ? 'bg-rose-600 border-rose-400 text-white animate-pulse'
            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
        }`}
        title={translate(micLabel)}
        aria-label={translate(micLabel)}
      >
        {state === 'listening' && !callActive ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
      </button>
      <button
        onClick={() => void toggleCall()}
        disabled={!config || config.stt.engine === 'disabled'}
        className={`p-2.5 rounded-xl border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
          callActive
            ? 'bg-cyan-600 border-cyan-400 text-white shadow-md shadow-cyan-500/20'
            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-cyan-200'
        }`}
        title={translate(callActive ? 'voice.endCall' : 'voice.startCall')}
        aria-label={translate(callActive ? 'voice.endCall' : 'voice.startCall')}
        aria-pressed={callActive}
      >
        {callActive ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
      </button>
      {error && (
        <div role="alert" className="absolute bottom-full right-0 mb-2 w-72 rounded-lg border border-rose-500/40 bg-rose-950/95 p-2 text-xs text-rose-200 shadow-xl">
          {error}
        </div>
      )}
    </div>
  );
}
