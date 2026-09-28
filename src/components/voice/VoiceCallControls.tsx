import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Phone, PhoneOff, Radio } from 'lucide-react';
import { VoiceConfig } from '../../types';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { streamingTts } from '../../services/streamingTts';
import { VoiceCapture, VoiceCaptureResult } from '../../services/voiceCapture';
import { translate, type TranslationKey } from '../../i18n';

type VoiceCallState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';

interface VoiceCallControlsProps {
  config: VoiceConfig | null;
  isGenerating: boolean;
  onDraft: (text: string) => void;
  onSend: (text: string) => Promise<void>;
  onAbort: () => Promise<void>;
  onEnsureAutoTts: () => void;
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
}: VoiceCallControlsProps) {
  const captureRef = useRef(new VoiceCapture());
  const callActiveRef = useRef(false);
  const mountedRef = useRef(true);
  const [callActive, setCallActive] = useState(false);
  const [state, setState] = useState<VoiceCallState>('idle');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');

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

  const beginListening = async (continuous: boolean) => {
    if (!config || config.stt.engine === 'disabled') {
      fail(translate('voice.needStt'));
      return;
    }
    setError('');
    setState('listening');
    try {
      await captureRef.current.start({
        inputDeviceId: config.stt.input_device_id,
        vadThreshold: config.stt.vad_threshold,
        silenceMs: config.stt.vad_silence_ms,
        autoStopOnSilence: continuous,
        maxDurationMs: 60_000,
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

      setState('thinking');
      await onSend(transcript.trim());
      if (!callActiveRef.current) {
        resetToIdle();
        return;
      }
      setState('speaking');
      await streamingTts.waitForIdle();
      if (callActiveRef.current) await beginListening(true);
      else resetToIdle();
    } catch (reason) {
      fail(reason);
    }
  };

  const togglePushToTalk = async () => {
    const continueCall = callActiveRef.current;
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
    updateCallActive(false);
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
    const unsubscribe = audioPlayer.onPlaybackState((playbackState) => {
      if (callActiveRef.current && playbackState === 'playing') setState('speaking');
    });
    return unsubscribe;
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    callActiveRef.current = false;
    void captureRef.current.cancel();
  }, []);

  const busy = state === 'transcribing' || state === 'thinking';
  return (
    <div className="relative flex items-center gap-1">
      {(state !== 'idle' || callActive) && (
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg border border-cyan-500/30 bg-cyan-950/30 text-[11px] text-cyan-200">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />}
          <span>{translate(STATE_LABELS[state])}</span>
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
        disabled={!config || config.stt.engine === 'disabled' || busy}
        className={`p-2.5 rounded-xl border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
          state === 'listening' && !callActive
            ? 'bg-rose-600 border-rose-400 text-white animate-pulse'
            : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
        }`}
        title={translate(state === 'listening' && !callActive ? 'voice.stopRecording' : 'voice.startRecording')}
        aria-label={translate(state === 'listening' && !callActive ? 'voice.stopRecording' : 'voice.startRecording')}
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
