import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Download, FolderOpen, Headphones, Mic, Play, RefreshCw, Save, SlidersHorizontal, X } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { api } from '../../services/api';
import { KokoroDownloadProgress, ScannedVoice, SttEngine, TtsEngine, TtsFilterMode, VoiceConfig } from '../../types';
import { audioPlayer, gainFromVoiceVolume } from '../../services/audioPlayer';
import { ModalOverlay } from '../ui/ModalOverlay';
import { LocalTtsSettings } from './LocalTtsSettings';
import { translate, useTranslation } from '../../i18n';

interface CharacterVoiceModalProps {
  onClose: () => void;
  /** Whose voice to edit; default is the active chat character (e.g. the Soul Stage narrator). */
  target?: { id: string; name: string };
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
  local_model_id: null,
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
    return translate('voiceCfg.testText');
  }
  return 'Hello! How are you today? This is a test of my voice.';
}

export function CharacterVoiceModal({ onClose, target }: CharacterVoiceModalProps) {
  const { t } = useTranslation();
  const { activeCharacter, activeVoiceConfig, saveVoiceConfigForCharacter } = useStoreFields(
    'activeCharacter', 'activeVoiceConfig', 'saveVoiceConfigForCharacter',
  );
  const [tab, setTab] = useState<VoiceTab>('tts');
  const [draft, setDraft] = useState<VoiceConfig>(activeVoiceConfig ?? DEFAULT_CONFIG);
  const [availableVoices, setAvailableVoices] = useState<ScannedVoice[]>([]);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isInstallingKokoro, setIsInstallingKokoro] = useState(false);
  const [kokoroProgress, setKokoroProgress] = useState<KokoroDownloadProgress | null>(null);
  const [error, setError] = useState('');

  /* oxlint-disable react/set-state-in-effect -- A newly loaded character voice profile replaces the modal draft. */
  // By id, so a parent passing a fresh object each render doesn't reload over the user's edits.
  const targetId = target?.id;
  useEffect(() => {
    if (!targetId && activeVoiceConfig) setDraft(activeVoiceConfig);
  }, [activeVoiceConfig, targetId]);
  /* oxlint-enable react/set-state-in-effect */
  useEffect(() => {
    if (!targetId) return;
    let subscribed = true;
    api.getCharacterVoiceConfig(targetId).then((config) => {
      if (subscribed) setDraft(config);
    }).catch(() => {});
    return () => {
      subscribed = false;
    };
  }, [targetId]);

  useEffect(() => {
    // Local voices come with the model catalog (LocalTtsSettings).
    if (draft.engine === 'disabled' || draft.engine === 'local') {
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
      if (engine === 'local' && !/^(preset|clone):/.test(voiceId)) voiceId = 'preset:default';
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
      setError(translate('voiceCfg.devicesFailed', { error: String(reason) }));
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
      filters: [{ name: translate('voiceCfg.onnxFilter'), extensions: ['onnx'] }],
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
    const id = target?.id ?? activeCharacter?.id;
    if (!id) return;
    setError('');
    try {
      await saveVoiceConfigForCharacter(id, draft);
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
    <ModalOverlay onClose={onClose} aria-labelledby="voice-config-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h2 id="voice-config-title" className="text-xl font-semibold text-slate-100">{t('voiceCfg.title')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{target?.name ?? activeCharacter?.card.data.name ?? t('voiceCfg.characterFallback')}</p>
          </div>
          <button onClick={onClose} title={t('common.close')} aria-label={t('common.close')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div role="tablist" aria-label={t('voiceCfg.tabs')} className="flex border-b border-slate-800 px-4 gap-1">
          {([
            ['tts', Headphones, t('voiceCfg.tabTts')],
            ['stt', Mic, t('voiceCfg.tabStt')],
            ['rvc', SlidersHorizontal, 'RVC'],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
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
                  <span className={labelClass}>{t('voiceCfg.ttsEngine')}</span>
                  <select value={draft.engine} onChange={(event) => changeEngine(event.target.value as TtsEngine)} className={fieldClass}>
                    <option value="disabled">{t('voiceCfg.disabled')}</option>
                    <option value="edge">Edge-TTS</option>
                    <option value="local">{t('voiceCfg.local')}</option>
                    <option value="kokoro">{t('voiceCfg.kokoro')}</option>
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="openai">{t('voiceCfg.openaiCompatible')}</option>
                  </select>
                </label>
                <label>
                  <span className={labelClass}>{t('voiceCfg.outputDevice')}</span>
                  <select value={draft.output_device_id} onChange={(event) => update('output_device_id', event.target.value)} className={fieldClass}>
                    <option value="">{t('voiceCfg.systemDefault')}</option>
                    {outputDevices.map((device, index) => (
                      <option key={device.deviceId} value={device.deviceId}>{device.label || t('voiceCfg.outputN', { n: index + 1 })}</option>
                    ))}
                  </select>
                </label>
              </div>

              {draft.engine !== 'disabled' && (
                <>
                  {draft.engine === 'elevenlabs' && (
                    <label>
                      <span className={labelClass}>{t('voiceCfg.elevenKey')}</span>
                      <input type="password" value={draft.elevenlabs_api_key} onChange={(event) => update('elevenlabs_api_key', event.target.value)} className={fieldClass} placeholder="xi-api-key" />
                    </label>
                  )}

                  {draft.engine === 'local' && <LocalTtsSettings config={draft} onChange={setDraft} />}

                  {draft.engine === 'kokoro' && (
                    <div className="space-y-4 rounded-lg border border-emerald-500/25 bg-emerald-950/10 p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-emerald-200">{t('voiceCfg.kokoroTitle')}</p>
                          <p className="text-xs text-slate-400 mt-1">{t('voiceCfg.kokoroText')}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void installKokoro()}
                          disabled={isInstallingKokoro}
                          className="shrink-0 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium"
                        >
                          <Download className="w-4 h-4" />
                          {isInstallingKokoro ? t('voiceCfg.installing') : t('voiceCfg.installDefault')}
                        </button>
                      </div>

                      {kokoroProgress && (isInstallingKokoro || kokoroProgress.finished) && (
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span className="truncate pr-3">{kokoroProgress.finished ? t('voiceCfg.kokoroInstalled') : kokoroProgress.filename}</span>
                            <span>{kokoroProgress.file_index}/{kokoroProgress.total_files}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, kokoroProgress.percent)}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <label>
                          <span className={labelClass}>{t('voiceCfg.onnxModel')}</span>
                          <div className="flex gap-2">
                            <input value={draft.kokoro.model_path} onChange={(event) => updateKokoro('model_path', event.target.value)} className={fieldClass} placeholder="model_quantized.onnx" />
                            <button type="button" onClick={() => void selectKokoroModel()} className="px-3 rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-950/40" title={t('voiceCfg.chooseOnnx')}><FolderOpen className="w-4 h-4" /></button>
                          </div>
                        </label>
                        <label>
                          <span className={labelClass}>{t('voiceCfg.voicesDir')}</span>
                          <div className="flex gap-2">
                            <input value={draft.kokoro.voices_path} onChange={(event) => updateKokoro('voices_path', event.target.value)} className={fieldClass} placeholder="voices/ (af_heart.bin …)" />
                            <button type="button" onClick={() => void selectKokoroVoices()} className="px-3 rounded-lg border border-emerald-500/40 text-emerald-200 hover:bg-emerald-950/40" title={t('voiceCfg.chooseVoicesDir')}><FolderOpen className="w-4 h-4" /></button>
                          </div>
                        </label>
                      </div>

                      <p className="text-xs text-amber-300/80">{t('voiceCfg.kokoroNote')}</p>
                    </div>
                  )}

                  {draft.engine !== 'local' && (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label>
                      <span className={labelClass}>{t('voiceCfg.foundVoice')} {isLoadingVoices && t('voiceCfg.loading')}</span>
                      <select value={draft.voice_id} onChange={(event) => update('voice_id', event.target.value)} className={fieldClass}>
                        <option value={draft.voice_id}>{draft.voice_id || t('voiceCfg.chooseVoice')}</option>
                        {availableVoices.filter((voice) => voice.id !== draft.voice_id).map((voice) => (
                          <option key={voice.id} value={voice.id}>{voice.name} · {voice.locale} · {voice.gender}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelClass}>{t('voiceCfg.voiceId')}</span>
                      <input value={draft.voice_id} onChange={(event) => update('voice_id', event.target.value)} className={fieldClass} placeholder={draft.engine === 'kokoro' ? 'af_heart' : 'de-DE-KatjaNeural'} />
                    </label>
                  </div>
                  )}

                  {draft.engine === 'openai' && (
                    <div className="space-y-4 rounded-lg border border-slate-800 bg-app/40 p-4">
                      <p className="text-xs text-slate-400">{t('voiceCfg.openaiText')}</p>
                      <label>
                        <span className={labelClass}>{t('voiceCfg.speechEndpoint')}</span>
                        <input value={draft.openai_endpoint} onChange={(event) => update('openai_endpoint', event.target.value)} className={fieldClass} placeholder="http://localhost:8880/v1/audio/speech" />
                      </label>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <label><span className={labelClass}>{t('voiceCfg.model')}</span><input value={draft.openai_model} onChange={(event) => update('openai_model', event.target.value)} className={fieldClass} placeholder="tts-1" /></label>
                        <label><span className={labelClass}>{t('voiceCfg.apiKeyOptional')}</span><input type="password" value={draft.openai_api_key} onChange={(event) => update('openai_api_key', event.target.value)} className={fieldClass} /></label>
                      </div>
                      <label>
                        <span className={labelClass}>{t('voiceCfg.instructions')}</span>
                        <textarea value={draft.openai_instructions} onChange={(event) => update('openai_instructions', event.target.value)} className={`${fieldClass} min-h-20 resize-y`} placeholder={t('voiceCfg.instructionsPlaceholder')} />
                      </label>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-3 gap-4">
                    {([
                      ['rate', t('voiceCfg.rate'), '%', -50, 50],
                      ['pitch', t('voiceCfg.pitch'), 'Hz', -20, 20],
                      ['volume', t('voiceCfg.volume'), '%', -100, 100],
                    ] as const).map(([key, label, suffix, min, max]) => (
                      <label key={key}>
                        <span className={`${labelClass} flex justify-between`}><span>{label}</span><span>{draft[key]}</span></span>
                        <input type="range" min={min} max={max} value={numericValue(draft[key])} onChange={(event) => update(key, signedValue(Number(event.target.value), suffix))} disabled={(draft.engine === 'kokoro' || draft.engine === 'local') && key === 'pitch'} className="w-full accent-accent-500 disabled:opacity-35" />
                      </label>
                    ))}
                  </div>

                  {draft.engine === 'kokoro' && (
                    <p className="text-xs text-slate-500">{t('voiceCfg.kokoroRateNote')}</p>
                  )}

                  <div className="grid sm:grid-cols-2 gap-4">
                    <label>
                      <span className={labelClass}>{t('voiceCfg.filter')}</span>
                      <select value={draft.filter_mode} onChange={(event) => update('filter_mode', event.target.value as TtsFilterMode)} className={fieldClass}>
                        <option value="all">{t('voiceCfg.filterAll')}</option>
                        <option value="dialogue_only">{t('voiceCfg.filterDialogue')}</option>
                        <option value="strip_actions">{t('voiceCfg.filterActions')}</option>
                      </select>
                    </label>
                    <label><span className={labelClass}>{t('voiceCfg.customRegex')}</span><input value={draft.custom_regex} onChange={(event) => update('custom_regex', event.target.value)} className={fieldClass} placeholder="\[System:.*?\]" /></label>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'stt' && (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <label>
                  <span className={labelClass}>{t('voiceCfg.sttEngine')}</span>
                  <select value={draft.stt.engine} onChange={(event) => updateStt('engine', event.target.value as SttEngine)} className={fieldClass}>
                    <option value="disabled">{t('voiceCfg.disabled')}</option>
                    <option value="native_whisper">{t('voiceCfg.nativeWhisper')}</option>
                    <option value="openai">{t('voiceCfg.openaiStt')}</option>
                  </select>
                </label>
                <label>
                  <span className={labelClass}>{t('voiceCfg.microphone')}</span>
                  <div className="flex gap-2">
                    <select value={draft.stt.input_device_id} onChange={(event) => updateStt('input_device_id', event.target.value)} className={fieldClass}>
                      <option value="">{t('voiceCfg.systemDefault')}</option>
                      {inputDevices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label || t('voiceCfg.micN', { n: index + 1 })}</option>
                      ))}
                    </select>
                    <button onClick={() => void refreshDevices()} className="px-3 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800" title={t('voiceCfg.refreshDevices')}><RefreshCw className="w-4 h-4" /></button>
                  </div>
                </label>
              </div>

              {draft.stt.engine === 'native_whisper' && (
                <label>
                  <span className={labelClass}>{t('voiceCfg.whisperModel')}</span>
                  <div className="flex gap-2">
                    <input value={draft.stt.whisper_model_path} onChange={(event) => updateStt('whisper_model_path', event.target.value)} className={fieldClass} placeholder="ggml-small.bin" />
                    <button onClick={() => void selectWhisperModel()} className="px-3 rounded-lg border border-accent-500/40 text-accent-200 hover:bg-accent-950/40">{t('voiceCfg.choose')}</button>
                  </div>
                </label>
              )}

              {draft.stt.engine === 'openai' && (
                <div className="space-y-4 rounded-lg border border-slate-800 bg-app/40 p-4">
                  <p className="text-xs text-slate-400">{t('voiceCfg.sttText')}</p>
                  <label><span className={labelClass}>{t('voiceCfg.sttEndpoint')}</span><input value={draft.stt.endpoint} onChange={(event) => updateStt('endpoint', event.target.value)} className={fieldClass} /></label>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label><span className={labelClass}>{t('voiceCfg.model')}</span><input value={draft.stt.model} onChange={(event) => updateStt('model', event.target.value)} className={fieldClass} /></label>
                    <label><span className={labelClass}>{t('voiceCfg.apiKeyOptional')}</span><input type="password" value={draft.stt.api_key} onChange={(event) => updateStt('api_key', event.target.value)} className={fieldClass} /></label>
                  </div>
                </div>
              )}

              {draft.stt.engine !== 'disabled' && (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label><span className={labelClass}>{t('voiceCfg.sttLanguage')}</span><input value={draft.stt.language} onChange={(event) => updateStt('language', event.target.value)} className={fieldClass} placeholder="de" /></label>
                    <label><span className={labelClass}>{t('voiceCfg.sttPrompt')}</span><input value={draft.stt.prompt} onChange={(event) => updateStt('prompt', event.target.value)} className={fieldClass} placeholder={t('voiceCfg.sttPromptPlaceholder')} /></label>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label><span className={`${labelClass} flex justify-between`}><span>{t('voiceCfg.vad')}</span><span>{draft.stt.vad_threshold.toFixed(3)}</span></span><input type="range" min="0.005" max="0.12" step="0.005" value={draft.stt.vad_threshold} onChange={(event) => updateStt('vad_threshold', Number(event.target.value))} className="w-full accent-cyan-500" /></label>
                    <label><span className={`${labelClass} flex justify-between`}><span>{t('voiceCfg.vadSilence')}</span><span>{draft.stt.vad_silence_ms} ms</span></span><input type="range" min="300" max="2500" step="100" value={draft.stt.vad_silence_ms} onChange={(event) => updateStt('vad_silence_ms', Number(event.target.value))} className="w-full accent-cyan-500" /></label>
                  </div>
                  <p className="text-xs text-slate-500">{t('voiceCfg.vadText')}</p>
                </>
              )}
            </>
          )}

          {tab === 'rvc' && (
            <>
              <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-app/50 p-3">
                <span><span className="block text-sm text-slate-200">{t('voiceCfg.rvcTitle')}</span><span className="block text-xs text-slate-500">{t('voiceCfg.rvcText')}</span></span>
                <input type="checkbox" checked={draft.rvc.enabled} onChange={(event) => updateRvc('enabled', event.target.checked)} className="w-4 h-4 accent-accent-500" />
              </label>
              {draft.rvc.enabled && (
                <>
                  <p className="text-xs text-slate-400">{t('voiceCfg.rvcContract')}</p>
                  <label><span className={labelClass}>{t('voiceCfg.rvcEndpoint')}</span><input value={draft.rvc.endpoint} onChange={(event) => updateRvc('endpoint', event.target.value)} className={fieldClass} placeholder="http://localhost:7865/v1/voice-conversion" /></label>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label><span className={labelClass}>{t('voiceCfg.rvcModel')}</span><input value={draft.rvc.model} onChange={(event) => updateRvc('model', event.target.value)} className={fieldClass} /></label>
                    <label><span className={labelClass}>{t('voiceCfg.apiKeyOptional')}</span><input type="password" value={draft.rvc.api_key} onChange={(event) => updateRvc('api_key', event.target.value)} className={fieldClass} /></label>
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
            <Play className="w-4 h-4" />{isTesting ? t('voiceCfg.testing') : t('voiceCfg.test')}
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 hover:bg-slate-800 text-slate-300 rounded-lg">{t('common.cancel')}</button>
            <button onClick={() => void handleSave()} className="flex items-center gap-2 px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white rounded-lg shadow-lg shadow-accent-500/20"><Save className="w-4 h-4" />{t('voiceCfg.save')}</button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
