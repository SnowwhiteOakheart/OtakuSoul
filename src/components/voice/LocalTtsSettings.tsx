import { useEffect, useRef, useState } from 'react';
import { Check, Download, Loader2, Mic, ShieldAlert, Square, Trash2, Upload, Wand2, X } from 'lucide-react';
import { api } from '../../services/api';
import { translate, useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { confirmDialog, toast } from '../ui/feedback';
import { RuntimeCard } from '../settings/sections/RuntimeCard';
import { VoiceCapture, floatSamplesToBase64, resampleMono } from '../../services/voiceCapture';
import type { ClonedVoice, TtsLocalSettings, TtsModelInfo, TtsModelProgress, VoiceConfig } from '../../types';

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(2);
/** Sample rate of recordings and uploads for voice cloning (VoiceCapture records at 16 kHz). */
const CLONE_RATE = 16_000;
const CLONE_LANGUAGES = ['de', 'en', 'ru', 'ja', 'zh', 'fr', 'es', 'it', 'pt', 'ko'];

const fieldClass =
  'w-full bg-app border border-slate-800 rounded-lg p-2.5 text-sm text-slate-200 outline-hidden focus:border-accent-500/60';
const labelClass = 'block text-xs font-medium text-slate-300 mb-1';

/** Decodes an audio file to mono float samples at `rate`. */
async function decodeAudioFile(file: File, rate: number): Promise<Float32Array> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const mono = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) mono[i]! += data[i]! / buffer.numberOfChannels;
    }
    return resampleMono(mono, buffer.sampleRate, rate);
  } finally {
    void context.close();
  }
}

const base64ToFloat = (b64: string) => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
};

interface LocalTtsSettingsProps {
  config: VoiceConfig;
  onChange: (config: VoiceConfig) => void;
}

/**
 * Local multilingual speech (CrispASR): runtime, model catalog with licence notes, the
 * opt-in for non-commercial models, voice choice and cloning a voice from a recording.
 */
export const LocalTtsSettings = ({ config, onChange }: LocalTtsSettingsProps) => {
  const { t } = useTranslation();
  const [models, setModels] = useState<TtsModelInfo[] | null>(null);
  const [settings, setSettings] = useState<TtsLocalSettings | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState<TtsModelProgress | null>(null);

  const refresh = () =>
    Promise.all([api.listTtsModels(), api.getTtsLocalSettings()])
      .then(([list, s]) => {
        setModels(list);
        setSettings(s);
      })
      .catch((e: unknown) => toast.error(errorMessage(e)));

  useEffect(() => {
    void refresh();
    let unlisten: (() => void) | undefined;
    api
      .onTtsModelProgress(setProgress)
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const saveSettings = async (next: TtsLocalSettings) => {
    setSettings(next);
    try {
      await api.saveTtsLocalSettings(next);
      void refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const toggleNoncommercial = async (allow: boolean) => {
    if (allow) {
      const confirmed = await confirmDialog({
        title: translate('localTts.ncConfirmTitle'),
        message: translate('localTts.ncConfirmText'),
        confirmLabel: translate('localTts.ncConfirm'),
      });
      if (!confirmed) return;
    }
    if (settings) await saveSettings({ ...settings, allow_noncommercial: allow });
  };

  const handleDownload = async (model: TtsModelInfo) => {
    setDownloading(model.id);
    setProgress(null);
    try {
      await api.downloadTtsModel(model.id);
      toast.success(translate('localTts.downloaded', { name: model.name }));
      if (!config.local_model_id) onChange({ ...config, local_model_id: model.id, voice_id: model.voices[0]?.voice_id ?? '' });
    } catch (e) {
      toast.error(translate('localTts.downloadFailed', { error: errorMessage(e) }));
    } finally {
      setDownloading(null);
      void refresh();
    }
  };

  const handleDelete = async (model: TtsModelInfo) => {
    const confirmed = await confirmDialog({
      title: translate('localTts.deleteTitle', { name: model.name }),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await api.deleteTtsModel(model.id);
      if (config.local_model_id === model.id) onChange({ ...config, local_model_id: null });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      void refresh();
    }
  };

  const selected = models?.find((m) => m.id === config.local_model_id);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-500/30 bg-sky-950/20 p-3 text-xs text-sky-100/90 flex gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 text-sky-300 mt-0.5" />
        <p>{t('localTts.notice')}</p>
      </div>

      <RuntimeCard kind="crisp" />

      <div className="rounded-lg border border-slate-800 bg-app/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-200">{t('localTts.modelsTitle')}</p>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={settings?.allow_noncommercial ?? false}
              onChange={(e) => void toggleNoncommercial(e.target.checked)}
              className="accent-accent-500"
            />
            {t('localTts.allowNc')}
          </label>
        </div>

        {!models ? (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('localTts.loading')}
          </p>
        ) : (
          <ul className="space-y-2" aria-label={t('localTts.modelsTitle')}>
            {models.map((model) => {
              const isSelected = config.local_model_id === model.id;
              const usable = model.installed && model.allowed;
              return (
                <li
                  key={model.id}
                  className={`rounded-lg border p-3 text-xs space-y-2 ${
                    isSelected ? 'border-accent-500/60 bg-accent-900/15' : 'border-slate-800 bg-app/60'
                  } ${model.allowed ? '' : 'opacity-60'}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <label className="flex items-start gap-2 min-w-0 cursor-pointer">
                      <input
                        type="radio"
                        name="local-tts-model"
                        checked={isSelected}
                        disabled={!usable}
                        onChange={() =>
                          onChange({ ...config, local_model_id: model.id, voice_id: model.voices[0]?.voice_id ?? '' })
                        }
                        className="mt-0.5 accent-accent-500"
                      />
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-100">{model.name}</span>
                        {model.noncommercial && (
                          <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            {t('localTts.ncBadge')}
                          </span>
                        )}
                        <span className="block text-slate-400 mt-0.5">
                          {t('localTts.meta', {
                            license: model.license,
                            languages: model.languages.join(', '),
                            size: gb(model.download_bytes),
                          })}
                          {model.cloning ? ` · ${t('localTts.canClone')}` : ''}
                        </span>
                        {!model.allowed && <span className="block text-amber-300/90 mt-0.5">{t('localTts.ncLocked')}</span>}
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {model.installed ? (
                        <>
                          <span className="flex items-center gap-1 text-emerald-300">
                            <Check className="w-3.5 h-3.5" />
                            {t('localTts.installed')}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleDelete(model)}
                            aria-label={t('localTts.delete', { name: model.name })}
                            title={t('localTts.delete', { name: model.name })}
                            className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : downloading === model.id ? (
                        <button
                          type="button"
                          onClick={() => void api.cancelTtsModelDownload()}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          {t('localTts.cancel')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleDownload(model)}
                          disabled={downloading !== null || !model.allowed}
                          className="px-2.5 py-1 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {t('localTts.download', { size: gb(model.missing_bytes) })}
                        </button>
                      )}
                    </div>
                  </div>
                  {downloading === model.id && progress?.model_id === model.id && (
                    <div role="status" className="space-y-1 text-slate-400">
                      <span>
                        {progress.file_name} · {gb(progress.downloaded_bytes)} / {gb(progress.total_bytes)} GB
                      </span>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-accent-500 transition-all" style={{ width: `${progress.percent}%` }} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected && (
        <label className="block">
          <span className={labelClass}>{t('localTts.voice')}</span>
          <select
            value={config.voice_id}
            onChange={(e) => onChange({ ...config, voice_id: e.target.value })}
            className={fieldClass}
          >
            {selected.voices.length === 0 && <option value="">{t('localTts.needsClone')}</option>}
            {selected.voices.map((voice) => (
              <option key={voice.voice_id} value={voice.voice_id}>
                {voice.voice_id === 'preset:default' ? t('localTts.defaultVoice') : voice.label}
                {voice.cloned ? ` · ${t('localTts.clonedTag')}` : ''} · {voice.language}
              </option>
            ))}
          </select>
        </label>
      )}

      {settings && (
        <label className="flex items-start gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={settings.spoken_disclaimer}
            onChange={(e) => void saveSettings({ ...settings, spoken_disclaimer: e.target.checked })}
            className="mt-0.5 accent-accent-500"
          />
          <span>
            {t('localTts.spokenDisclaimer')}
            <span className="block text-slate-500">{t('localTts.spokenDisclaimerHint')}</span>
          </span>
        </label>
      )}

      <VoiceCloneSection sttConfig={config.stt} onChanged={() => void refresh()} />
    </div>
  );
};

/** Lists cloned voices and creates new ones from a recording or an audio file. */
const VoiceCloneSection = ({
  sttConfig,
  onChanged,
}: {
  sttConfig: VoiceConfig['stt'];
  onChanged: () => void;
}) => {
  const { t } = useTranslation();
  const [voices, setVoices] = useState<ClonedVoice[]>([]);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('de');
  const [refText, setRefText] = useState('');
  const [consent, setConsent] = useState(false);
  const [samples, setSamples] = useState<Float32Array | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const capture = useRef<VoiceCapture | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadVoices = () =>
    api
      .listClonedVoices()
      .then(setVoices)
      .catch(() => setVoices([]));

  useEffect(() => {
    void loadVoices();
    return () => void capture.current?.cancel();
  }, []);

  const seconds = samples ? samples.length / CLONE_RATE : 0;

  const toggleRecording = async () => {
    try {
      if (isRecording) {
        const result = await capture.current?.stop();
        setIsRecording(false);
        if (result) setSamples(base64ToFloat(result.audioBase64));
        return;
      }
      capture.current = new VoiceCapture();
      await capture.current.start({ inputDeviceId: sttConfig.input_device_id || undefined, maxDurationMs: 30_000 });
      setIsRecording(true);
    } catch (e) {
      setIsRecording(false);
      toast.error(errorMessage(e));
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setSamples(await decodeAudioFile(file, CLONE_RATE));
    } catch (e) {
      toast.error(translate('localTts.decodeFailed', { error: errorMessage(e) }));
    }
  };

  const transcribe = async () => {
    if (!samples) return;
    setIsBusy(true);
    try {
      setRefText((await api.transcribeSpeech(floatSamplesToBase64(samples), { ...sttConfig, language })).trim());
    } catch (e) {
      toast.error(translate('localTts.transcribeFailed', { error: errorMessage(e) }));
    } finally {
      setIsBusy(false);
    }
  };

  const save = async () => {
    if (!samples) return;
    setIsBusy(true);
    try {
      await api.createClonedVoice({
        name,
        samplesBase64: floatSamplesToBase64(samples),
        sampleRate: CLONE_RATE,
        refText,
        language,
        consent,
      });
      toast.success(translate('localTts.cloneSaved', { name }));
      setName('');
      setRefText('');
      setConsent(false);
      setSamples(null);
      void loadVoices();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setIsBusy(false);
    }
  };

  const remove = async (voice: ClonedVoice) => {
    const confirmed = await confirmDialog({
      title: translate('localTts.cloneDeleteTitle', { name: voice.name }),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    await api.deleteClonedVoice(voice.id).catch((e: unknown) => toast.error(errorMessage(e)));
    void loadVoices();
    onChanged();
  };

  const canSave = Boolean(samples) && name.trim() && refText.trim() && consent && seconds >= 3 && seconds <= 30;

  return (
    <div className="rounded-lg border border-slate-800 bg-app/40 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-accent-400" />
          {t('localTts.cloneTitle')}
        </p>
        <p className="text-xs text-slate-400 mt-1">{t('localTts.cloneIntro')}</p>
      </div>

      {voices.length > 0 && (
        <ul className="space-y-1 text-xs" aria-label={t('localTts.clonedVoices')}>
          {voices.map((voice) => (
            <li key={voice.id} className="flex items-center justify-between gap-2 rounded bg-slate-900/60 px-2.5 py-1.5">
              <span className="text-slate-200 truncate">
                {voice.name} · {voice.language} · {voice.duration_secs.toFixed(1)} s
              </span>
              <button
                type="button"
                onClick={() => void remove(voice)}
                aria-label={t('localTts.cloneDelete', { name: voice.name })}
                title={t('localTts.cloneDelete', { name: voice.name })}
                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <label>
          <span className={labelClass}>{t('localTts.cloneName')}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
        </label>
        <label>
          <span className={labelClass}>{t('localTts.cloneLanguage')}</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className={fieldClass}>
            {CLONE_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => void toggleRecording()}
          className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
            isRecording ? 'bg-rose-600 border-rose-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
        >
          {isRecording ? <Square className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          {isRecording ? t('localTts.stopRecording') : t('localTts.record')}
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 flex items-center gap-1.5"
        >
          <Upload className="w-3.5 h-3.5" />
          {t('localTts.upload')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          className="hidden"
          aria-label={t('localTts.upload')}
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        {samples && (
          <span className={seconds < 3 || seconds > 30 ? 'text-amber-300' : 'text-slate-400'}>
            {t('localTts.sampleLength', { seconds: seconds.toFixed(1) })}
          </span>
        )}
      </div>

      <div>
        <div className={`${labelClass} flex items-center justify-between`}>
          <label htmlFor="clone-ref-text">{t('localTts.refText')}</label>
          <button
            type="button"
            onClick={() => void transcribe()}
            disabled={!samples || isBusy || sttConfig.engine === 'disabled'}
            title={sttConfig.engine === 'disabled' ? t('localTts.transcribeNeedsStt') : undefined}
            className="text-accent-300 hover:text-accent-200 disabled:opacity-40"
          >
            {t('localTts.transcribe')}
          </button>
        </div>
        <textarea
          id="clone-ref-text"
          value={refText}
          onChange={(e) => setRefText(e.target.value)}
          className={`${fieldClass} min-h-16 resize-y`}
          placeholder={t('localTts.refTextPlaceholder')}
        />
      </div>

      <label className="flex items-start gap-2 text-xs text-slate-200">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-accent-500" />
        <span>{t('localTts.consent')}</span>
      </label>

      <button
        type="button"
        onClick={() => void save()}
        disabled={!canSave || isBusy}
        className="px-3.5 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5"
      >
        {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {t('localTts.cloneSave')}
      </button>
    </div>
  );
};
