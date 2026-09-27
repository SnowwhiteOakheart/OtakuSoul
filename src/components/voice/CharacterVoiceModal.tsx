import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Download, FolderOpen, Headphones, Mic, Play, RefreshCw, Save, SlidersHorizontal, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';
import { KokoroDownloadProgress, ScannedVoice, SttEngine, TtsEngine, TtsFilterMode, VoiceConfig } from '../../types';
import { audioPlayer, gainFromVoiceVolume } from '../../services/audioPlayer';
import { ModalOverlay } from '../ui/ModalOverlay';

interface CharacterVoiceModalProps {
  onClose: () => void;
}

const DEFAULT_CONFIG: VoiceConfig = {
  engine: 'edge',
  voice_id: 'de-DE-KatjaNeural',
  rate: '+0%',
  pitch: '+0Hz',
  volume: '+0%',
  filter_mode: 'strip_actions',
  custom_regex: '',
  elevenlabs_api_key: '',
  openai_endpoint: 'http://localhost:8880/v1/audio/speech',
  openai_api_key: '',
  openai_model: 'tts-1',
  openai_instructions: '',
  kokoro: {
    model_path: '',
    voices_path: '',
  },
  output_device_id: '',
  rvc: {
    enabled: false,
    endpoint: '',
    api_key: '',
    model: '',
    pitch: 0,
    index_rate: 0.75,
    protect: 0.33,
  },
  stt: {
    engine: 'disabled',
    whisper_model_path: '',
    endpoint: 'http://localhost:8080/v1/audio/transcriptions',
    api_key: '',
    model: 'whisper-1',
    language: '',
    prompt: '',
    vad_threshold: 0.025,
    vad_silence_ms: 900,
    input_device_id: '',
  },
};

type VoiceTab = 'tts' | 'stt' | 'rvc';

const fieldClass = 'w-full bg-app border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-hidden focus:border-accent-500/60';
const labelClass = 'block text-xs font-medium text-slate-300 mb-1';

function signedValue(value: number, suffix: '%' | 'Hz') {
  return `${value >= 0 ? '+' : ''}${value}${suffix}`;
}

function numericValue(value: string) {
  return Number.parseInt(value.replace(/[%+]|Hz/g, ''), 10) || 0;
}

function testText(config: VoiceConfig) {
  if (config.engine !== 'kokoro') {
    return 'Hallo! Wie geht es dir heute? Das ist ein Test meiner Stimme.';
  }
  return 'Hello! How are you today? This is a test of my voice.';
}

export function CharacterVoiceModal({ onClose }: CharacterVoiceModalProps) {
  const { activeCharacter, activeVoiceConfig, saveVoiceConfigForCharacter } = useAppStore();
  const [tab, setTab] = useState<VoiceTab>('tts');
  const [draft, setDraft] = useState<VoiceConfig>(activeVoiceConfig ?? DEFAULT_CONFIG);
  const [availableVoices, setAvailableVoices] = useState<ScannedVoice[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isInstallingKokoro, setIsInstallingKokoro] = useState(false);
  const [kokoroProgress, setKokoroProgress] = useState<KokoroDownloadProgress | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (activeVoiceConfig) setDraft(activeVoiceConfig);
  }, [activeVoiceConfig]);

  useEffect(() => {
    if (draft.engine === 'disabled') {
      setAvailableVoices([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      setIsLoadingVoices(true);
      api.listAvailableVoices(draft.engine, draft.elevenlabs_api_key, draft.kokoro.voices_path)
        .then(setAvailableVoices)
        .catch((reason) => setError(String(reason)))
        .finally(() => setIsLoadingVoices(false));
    }, draft.engine === 'elevenlabs' ? 450 : 0);
    return () => window.clearTimeout(timeout);
  }, [draft.engine, draft.elevenlabs_api_key, draft.kokoro.voices_path]);

  useEffect(() => {
    if (draft.engine !== 'kokoro' || draft.kokoro.model_path || draft.kokoro.voices_path) return;
    void api.getKokoroInstallation().then((installation) => {
      if (!installation) return;
      setDraft((current) => current.engine === 'kokoro'
        ? {
            ...current,
            voice_id: installation.installed_voices.some((voice) => voice.id === current.voice_id)
              ? current.voice_id
              : installation.installed_voices[0]?.id ?? 'af_heart',
            kokoro: {
              model_path: installation.model_path,
              voices_path: installation.voices_path,
            },
          }
        : current);
    }).catch(() => undefined);
  }, [draft.engine, draft.kokoro.model_path, draft.kokoro.voices_path]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void api.onKokoroDownloadProgress(setKokoroProgress).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => undefined);
  }, []);

  const inputDevices = useMemo(() => devices.filter((device) => device.kind === 'audioinput'), [devices]);
  const outputDevices = useMemo(() => devices.filter((device) => device.kind === 'audiooutput'), [devices]);

  const update = <K extends keyof VoiceConfig>(key: K, value: VoiceConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateStt = <K extends keyof VoiceConfig['stt']>(key: K, value: VoiceConfig['stt'][K]) => {
    setDraft((current) => ({ ...current, stt: { ...current.stt, [key]: value } }));
  };

  const updateRvc = <K extends keyof VoiceConfig['rvc']>(key: K, value: VoiceConfig['rvc'][K]) => {
    setDraft((current) => ({ ...current, rvc: { ...current.rvc, [key]: value } }));
  };

  const updateKokoro = <K extends keyof VoiceConfig['kokoro']>(key: K, value: VoiceConfig['kokoro'][K]) => {
    setDraft((current) => ({ ...current, kokoro: { ...current.kokoro, [key]: value } }));
  };

  const changeEngine = (engine: TtsEngine) => {
    setDraft((current) => {
      let voiceId = current.voice_id;
      if (engine === 'kokoro' && !/^[a-z]{2}_/i.test(voiceId)) voiceId = 'af_heart';
      if (engine === 'edge' && !voiceId.endsWith('Neural')) voiceId = 'de-DE-KatjaNeural';
      if (engine === 'openai' && (voiceId.endsWith('Neural') || /^[a-z]{2}_/i.test(voiceId))) voiceId = 'nova';
      return { ...current, engine, voice_id: voiceId };
    });
    setError('');
  };

  const refreshDevices = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setDevices(await navigator.mediaDevices.enumerateDevices());
    } catch (reason) {
      setError(`Audiogeräte konnten nicht freigegeben werden: ${String(reason)}`);
    }
  };

  const selectWhisperModel = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'whisper.cpp Modell', extensions: ['bin', 'ggml', 'gguf'] }],
    });
    if (typeof selected === 'string') updateStt('whisper_model_path', selected);
  };

  const selectKokoroModel = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Kokoro ONNX-Modell', extensions: ['onnx'] }],
    });
    if (typeof selected === 'string') updateKokoro('model_path', selected);
  };

  const selectKokoroVoices = async () => {
    const selected = await open({ multiple: false, directory: true });
    if (typeof selected === 'string') updateKokoro('voices_path', selected);
  };

  const installKokoro = async () => {
    setIsInstallingKokoro(true);
    setKokoroProgress(null);
    setError('');
    try {
      const installation = await api.installKokoroModel();
      setAvailableVoices(installation.installed_voices);
      setDraft((current) => ({
        ...current,
        voice_id: installation.installed_voices.some((voice) => voice.id === current.voice_id)
          ? current.voice_id
          : installation.installed_voices.find((voice) => voice.id === 'af_heart')?.id
            ?? installation.installed_voices[0]?.id
            ?? 'af_heart',
        kokoro: {
          model_path: installation.model_path,
          voices_path: installation.voices_path,
        },
      }));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setIsInstallingKokoro(false);
    }
  };

  const handleSave = async () => {
    if (!activeCharacter) return;
    setError('');
    try {
      await saveVoiceConfigForCharacter(activeCharacter.id, draft);
      onClose();
    } catch (reason) {
      setError(String(reason));
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setError('');
    try {
      const audioUrl = await api.synthesizeSpeech(
        testText(draft),
        draft,
      );
      await audioPlayer.playDataUrl(
        audioUrl,
        gainFromVoiceVolume(draft.volume),
        draft.output_device_id,
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Stimme & Voice Call</h2>
            <p className="text-xs text-slate-500 mt-0.5">{activeCharacter?.card.data.name ?? 'Charakter'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-800 px-4 gap-1">
          {([
            ['tts', Headphones, 'Sprachausgabe'],
            ['stt', Mic, 'Spracherkennung'],
            ['rvc', SlidersHorizontal, 'RVC'],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-3 py-2.5 text-xs border-b-2 transition-colors ${
                tab === id ? 'border-accent-400 text-accent-200' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {tab === 'tts' && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <label>
                  <span className={labelClass}>TTS-Engine</span>
                  <select value={draft.engine} onChange={(event) => changeEngine(event.target.value as TtsEngine)} className={fieldClass}>
                    <option value="disabled">Deaktiviert</option>
                    <option value="edge">Edge-TTS</option>
                    <option value="kokoro">Kokoro 82M (nativ & offline)</option>
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="openai">OpenAI-kompatibel / lokaler Sidecar</option>
                  </select>
                </label>
                <label>
                  <span className={labelClass}>Ausgabegerät</span>
                  <select value={draft.output_device_id} onChange={(event) => update('output_device_id', event.target.value)} className={fieldClass}>
                    <option value="">Systemstandard</option>
                    {outputDevices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label || `Ausgabe ${index + 1}`}</option>
                    ))}
                  </select>
                </label>
              </div>

              {draft.engine !== 'disabled' && (
                <>
                  {draft.engine === 'elevenlabs' && (
                    <label>
                      <span className={labelClass}>ElevenLabs API-Key</span>
                      <input type="password" value={draft.elevenlabs_api_key} onChange={(event) => update('elevenlabs_api_key', event.target.value)} className={fieldClass} placeholder="xi-api-key" />
                    </label>
                  )}

                  {draft.engine === 'kokoro' && (
                    <div className="space-y-4 rounded-lg border border-emerald-500/25 bg-emerald-950/10 p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-emerald-200">Native Kokoro-ONNX-Inferenz</p>
                          <p className="text-xs text-slate-400 mt-1">Nach der einmaligen Installation läuft die Synthese vollständig offline und ohne Python. Das Standardpaket enthält das quantisierte 82M-Modell und acht US-/UK-Stimmen (~97 MB).</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void installKokoro()}
                          disabled={isInstallingKokoro}
                          className="shrink-0 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium"
                        >
                          <Download className="w-4 h-4" />
                          {isInstallingKokoro ? 'Installiert…' : 'Standardpaket installieren'}
                        </button>
                      </div>

                      {kokoroProgress && (isInstallingKokoro || kokoroProgress.finished) && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span className="truncate pr-3">{kokoroProgress.filename}</span>
                            <span>{kokoroProgress.file_index}/{kokoroProgress.total_files}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, kokoroProgress.percent)}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <label>
                          <span className={labelClass}>ONNX-Modell</span>
                          <div className="flex gap-2">
                            <input value={draft.kokoro.model_path} onChange={(event) => updateKokoro('model_path', event.target.value)} className={fieldClass} placeholder="model_quantized.onnx" />
                            <button type="button" onClick={() => void selectKokoroModel()} className="px-3 rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-950/40" title="ONNX-Modell auswählen"><FolderOpen className="w-4 h-4" /></button>
                          </div>
                        </label>
                        <label>
                          <span className={labelClass}>Stimmenordner</span>
                          <div className="flex gap-2">
                            <input value={draft.kokoro.voices_path} onChange={(event) => updateKokoro('voices_path', event.target.value)} className={fieldClass} placeholder="voices/ mit af_heart.bin …" />
                            <button type="button" onClick={() => void selectKokoroVoices()} className="px-3 rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-950/40" title="Stimmenordner auswählen"><FolderOpen className="w-4 h-4" /></button>
                          </div>
                        </label>
                      </div>

                      <p className="text-xs text-amber-300/80">Diese native Rust-Integration verwendet Kokoros englische G2P-Pipeline. Deutsch wird nur angenähert ausgesprochen; beste Qualität liefern englische Texte.</p>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <label>
                      <span className={labelClass}>Gefundene Stimme {isLoadingVoices && '– lädt…'}</span>
                      <select value={draft.voice_id} onChange={(event) => update('voice_id', event.target.value)} className={fieldClass}>
                        <option value={draft.voice_id}>{draft.voice_id || 'Stimme auswählen'}</option>
                        {availableVoices.filter((voice) => voice.id !== draft.voice_id).map((voice) => (
                          <option key={voice.id} value={voice.id}>{voice.name} · {voice.locale} · {voice.gender}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>Voice-ID (manuell)</span>
                      <input value={draft.voice_id} onChange={(event) => update('voice_id', event.target.value)} className={fieldClass} placeholder={draft.engine === 'kokoro' ? 'af_heart' : 'de-DE-KatjaNeural'} />
                    </label>
                  </div>

                  {draft.engine === 'openai' && (
                    <div className="space-y-4 rounded-lg border border-slate-800 bg-app/40 p-4">
                      <p className="text-xs text-slate-400">Unterstützt OpenAI sowie OpenAI-kompatible Server für Kokoro, Qwen3-TTS, XTTSv2, Silero und AllTalk.</p>
                      <label>
                        <span className={labelClass}>Speech-Endpunkt</span>
                        <input value={draft.openai_endpoint} onChange={(event) => update('openai_endpoint', event.target.value)} className={fieldClass} placeholder="http://localhost:8880/v1/audio/speech" />
                      </label>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <label><span className={labelClass}>Modell</span><input value={draft.openai_model} onChange={(event) => update('openai_model', event.target.value)} className={fieldClass} placeholder="tts-1" /></label>
                        <label><span className={labelClass}>API-Key (optional)</span><input type="password" value={draft.openai_api_key} onChange={(event) => update('openai_api_key', event.target.value)} className={fieldClass} /></label>
                      </div>
                      <label>
                        <span className={labelClass}>Stimm-Anweisungen (für unterstützte Modelle)</span>
                        <textarea value={draft.openai_instructions} onChange={(event) => update('openai_instructions', event.target.value)} className={`${fieldClass} min-h-20 resize-y`} placeholder="Warm, ruhig, leicht verspielt; kurze natürliche Pausen." />
                      </label>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-3 gap-4">
                    {([
                      ['rate', 'Geschwindigkeit', '%', -50, 50],
                      ['pitch', 'Tonhöhe', 'Hz', -20, 20],
                      ['volume', 'Lautstärke', '%', -100, 100],
                    ] as const).map(([key, label, suffix, min, max]) => (
                      <label key={key}>
                        <span className={`${labelClass} flex justify-between`}><span>{label}</span><span>{draft[key]}</span></span>
                        <input type="range" min={min} max={max} value={numericValue(draft[key])} onChange={(event) => update(key, signedValue(Number(event.target.value), suffix))} disabled={draft.engine === 'kokoro' && key === 'pitch'} className="w-full accent-accent-500 disabled:opacity-35" />
                      </label>
                    ))}
                  </div>

                  {draft.engine === 'kokoro' && (
                    <p className="text-xs text-slate-500">Kokoro übernimmt die Geschwindigkeit nativ. Lautstärke wird im Audioplayer angewendet; die Tonhöhenregelung ist für Kokoro nicht verfügbar.</p>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <label>
                      <span className={labelClass}>Vorlesefilter</span>
                      <select value={draft.filter_mode} onChange={(event) => update('filter_mode', event.target.value as TtsFilterMode)} className={fieldClass}>
                        <option value="all">Alles vorlesen</option>
                        <option value="dialogue_only">Nur Dialog in Anführungszeichen</option>
                        <option value="strip_actions">*Aktionen* entfernen</option>
                      </select>
                    </label>
                    <label><span className={labelClass}>Zusätzlicher Ausschluss-RegEx</span><input value={draft.custom_regex} onChange={(event) => update('custom_regex', event.target.value)} className={fieldClass} placeholder="\[System:.*?\]" /></label>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'stt' && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <label>
                  <span className={labelClass}>STT-Engine</span>
                  <select value={draft.stt.engine} onChange={(event) => updateStt('engine', event.target.value as SttEngine)} className={fieldClass}>
                    <option value="disabled">Deaktiviert</option>
                    <option value="native_whisper">Native whisper.cpp (offline)</option>
                    <option value="openai">OpenAI-kompatibler Transkriptions-Endpunkt</option>
                  </select>
                </label>
                <label>
                  <span className={labelClass}>Mikrofon</span>
                  <div className="flex gap-2">
                    <select value={draft.stt.input_device_id} onChange={(event) => updateStt('input_device_id', event.target.value)} className={fieldClass}>
                      <option value="">Systemstandard</option>
                      {inputDevices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label || `Mikrofon ${index + 1}`}</option>
                      ))}
                    </select>
                    <button onClick={() => void refreshDevices()} className="px-3 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800" title="Berechtigung anfragen und Geräte neu laden"><RefreshCw className="w-4 h-4" /></button>
                  </div>
                </label>
              </div>

              {draft.stt.engine === 'native_whisper' && (
                <label>
                  <span className={labelClass}>whisper.cpp-Modell (.bin/.ggml/.gguf)</span>
                  <div className="flex gap-2">
                    <input value={draft.stt.whisper_model_path} onChange={(event) => updateStt('whisper_model_path', event.target.value)} className={fieldClass} placeholder="ggml-small.bin" />
                    <button onClick={() => void selectWhisperModel()} className="px-3 rounded-lg border border-accent-500/40 text-accent-200 hover:bg-accent-950/40">Wählen</button>
                  </div>
                </label>
              )}

              {draft.stt.engine === 'openai' && (
                <div className="space-y-4 rounded-lg border border-slate-800 bg-app/40 p-4">
                  <p className="text-xs text-slate-400">Funktioniert mit OpenAI und lokalen whisper.cpp/Faster-Whisper-Servern, die <code>/v1/audio/transcriptions</code> anbieten.</p>
                  <label><span className={labelClass}>Transkriptions-Endpunkt</span><input value={draft.stt.endpoint} onChange={(event) => updateStt('endpoint', event.target.value)} className={fieldClass} /></label>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label><span className={labelClass}>Modell</span><input value={draft.stt.model} onChange={(event) => updateStt('model', event.target.value)} className={fieldClass} /></label>
                    <label><span className={labelClass}>API-Key (optional)</span><input type="password" value={draft.stt.api_key} onChange={(event) => updateStt('api_key', event.target.value)} className={fieldClass} /></label>
                  </div>
                </div>
              )}

              {draft.stt.engine !== 'disabled' && (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label><span className={labelClass}>Sprache (leer = Auto-Erkennung)</span><input value={draft.stt.language} onChange={(event) => updateStt('language', event.target.value)} className={fieldClass} placeholder="de" /></label>
                    <label><span className={labelClass}>Whisper-Kontext / Schreibweisen</span><input value={draft.stt.prompt} onChange={(event) => updateStt('prompt', event.target.value)} className={fieldClass} placeholder="OtakuSoul, Charakternamen…" /></label>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label><span className={`${labelClass} flex justify-between`}><span>VAD-Empfindlichkeit</span><span>{draft.stt.vad_threshold.toFixed(3)}</span></span><input type="range" min="0.005" max="0.12" step="0.005" value={draft.stt.vad_threshold} onChange={(event) => updateStt('vad_threshold', Number(event.target.value))} className="w-full accent-cyan-500" /></label>
                    <label><span className={`${labelClass} flex justify-between`}><span>Sprechende nach Stille</span><span>{draft.stt.vad_silence_ms} ms</span></span><input type="range" min="300" max="2500" step="100" value={draft.stt.vad_silence_ms} onChange={(event) => updateStt('vad_silence_ms', Number(event.target.value))} className="w-full accent-cyan-500" /></label>
                  </div>
                  <p className="text-xs text-slate-500">Die Web-Audio-VAD erkennt Sprache lokal und sendet nur abgeschlossene Äußerungen an Whisper. Push-to-talk und Voice Call erscheinen danach neben dem Chat-Eingabefeld.</p>
                </>
              )}
            </>
          )}

          {tab === 'rvc' && (
            <>
              <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-app/50 p-3">
                <span><span className="block text-sm text-slate-200">RVC Voice Conversion</span><span className="block text-xs text-slate-500">Wendet nach jeder TTS-Ausgabe ein optionales Stimmenmodell an.</span></span>
                <input type="checkbox" checked={draft.rvc.enabled} onChange={(event) => updateRvc('enabled', event.target.checked)} className="w-4 h-4 accent-accent-500" />
              </label>
              {draft.rvc.enabled && (
                <>
                  <p className="text-xs text-slate-400">Erwarteter Sidecar-Vertrag: Multipart POST mit <code>audio</code>, <code>model</code>, <code>pitch</code>, <code>index_rate</code> und <code>protect</code>; Antwort ist WAV oder MP3.</p>
                  <label><span className={labelClass}>RVC-Endpunkt</span><input value={draft.rvc.endpoint} onChange={(event) => updateRvc('endpoint', event.target.value)} className={fieldClass} placeholder="http://localhost:7865/v1/voice-conversion" /></label>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label><span className={labelClass}>Modell / Stimme</span><input value={draft.rvc.model} onChange={(event) => updateRvc('model', event.target.value)} className={fieldClass} /></label>
                    <label><span className={labelClass}>API-Key (optional)</span><input type="password" value={draft.rvc.api_key} onChange={(event) => updateRvc('api_key', event.target.value)} className={fieldClass} /></label>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <label><span className={`${labelClass} flex justify-between`}><span>Pitch</span><span>{draft.rvc.pitch}</span></span><input type="range" min="-24" max="24" value={draft.rvc.pitch} onChange={(event) => updateRvc('pitch', Number(event.target.value))} className="w-full accent-accent-500" /></label>
                    <label><span className={`${labelClass} flex justify-between`}><span>Index Rate</span><span>{draft.rvc.index_rate.toFixed(2)}</span></span><input type="range" min="0" max="1" step="0.05" value={draft.rvc.index_rate} onChange={(event) => updateRvc('index_rate', Number(event.target.value))} className="w-full accent-accent-500" /></label>
                    <label><span className={`${labelClass} flex justify-between`}><span>Protect</span><span>{draft.rvc.protect.toFixed(2)}</span></span><input type="range" min="0" max="0.5" step="0.01" value={draft.rvc.protect} onChange={(event) => updateRvc('protect', Number(event.target.value))} className="w-full accent-accent-500" /></label>
                  </div>
                </>
              )}
            </>
          )}

          {error && <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200 break-words">{error}</div>}
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-between bg-slate-900">
          <button onClick={() => void handleTest()} disabled={draft.engine === 'disabled' || isTesting} className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg disabled:opacity-50">
            <Play className="w-4 h-4" />{isTesting ? 'Testet…' : 'TTS testen'}
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 hover:bg-slate-800 text-slate-300 rounded-lg">Abbrechen</button>
            <button onClick={() => void handleSave()} className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg shadow-lg shadow-accent-500/20"><Save className="w-4 h-4" />Speichern</button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
