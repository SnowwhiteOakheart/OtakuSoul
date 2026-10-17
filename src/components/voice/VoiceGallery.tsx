import { useEffect, useState } from 'react';
import { Check, ChevronDown, Loader2, Play } from 'lucide-react';
import { useTranslation, type TranslationKey } from '../../i18n';
import { api } from '../../services/api';
import { audioPlayer } from '../../services/audioPlayer';
import { errorMessage } from '../../utils/errors';
import type { TtsEngine, VoiceConfig } from '../../types';

/** Edge voices offered per language (the full list has hundreds). */
const EDGE_VOICES_SHOWN = 10;
/** Region whose voices come first for a language. */
const MAIN_REGION: Record<string, string> = { de: 'DE', en: 'US', ru: 'RU', fr: 'FR', es: 'ES', ja: 'JP' };
const GENDER_KEYS: Record<string, TranslationKey> = { female: 'voiceGallery.female', male: 'voiceGallery.male' };

interface GalleryVoice {
  key: string;
  engine: TtsEngine;
  voiceId: string;
  label: string;
  /** Engine or model and language, shown next to the name. */
  detail: string;
  localModelId?: string;
  kokoro?: VoiceConfig['kokoro'];
}

interface VoiceGalleryProps {
  draft: VoiceConfig;
  /** Two-letter code of the reply language; Edge voices are filtered by it. */
  language: string;
  /** Text spoken for a preview of `config`. */
  sampleText: (config: VoiceConfig) => string;
  gain: (config: VoiceConfig) => number;
  onPick: (config: VoiceConfig) => void;
}

/** Voices of every engine that works without a key, to listen to side by side and take over with one click. */
export function VoiceGallery({ draft, language, sampleText, gain, onPick }: VoiceGalleryProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<GalleryVoice[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || voices) return;
    let cancelled = false;
    void (async () => {
      const found: GalleryVoice[] = [];
      const [models, kokoro, edge] = await Promise.all([
        api.listTtsModels().catch(() => []),
        api.getKokoroInstallation().catch(() => null),
        api.listAvailableVoices('edge').catch(() => []),
      ]);
      for (const model of models) {
        // Voice-design models need a description, clone-only models a cloned voice first.
        if (!model.installed || !model.allowed || model.voice_design) continue;
        for (const voice of model.voices) {
          found.push({
            key: `local:${model.id}:${voice.voice_id}`,
            engine: 'local',
            voiceId: voice.voice_id,
            label: voice.voice_id === 'preset:default' ? t('localTts.defaultVoice') : voice.label,
            detail: `${model.name} · ${voice.language || model.languages.join('/')}`,
            localModelId: model.id,
          });
        }
      }
      for (const voice of kokoro?.installed_voices ?? []) {
        found.push({
          key: `kokoro:${voice.id}`,
          engine: 'kokoro',
          voiceId: voice.id,
          label: voice.name,
          detail: `${t('voiceCfg.kokoro')} · ${voice.locale}`,
          kokoro: { ...draft.kokoro, model_path: kokoro!.model_path, voices_path: kokoro!.voices_path },
        });
      }
      // Voices of the main region first (de-DE before de-AT and de-CH).
      const main = `${language}-${MAIN_REGION[language] ?? language}`.toLowerCase();
      const edgeVoices = (edge ?? [])
        .filter((v) => v.locale.toLowerCase().startsWith(language))
        .sort((a, b) => Number(b.locale.toLowerCase() === main) - Number(a.locale.toLowerCase() === main));
      for (const voice of edgeVoices.slice(0, EDGE_VOICES_SHOWN)) {
        const gender = GENDER_KEYS[voice.gender.toLowerCase()];
        found.push({
          key: `edge:${voice.id}`,
          engine: 'edge',
          voiceId: voice.id,
          label: voice.name,
          detail: ['Edge-TTS', voice.locale, gender ? t(gender) : voice.gender].filter(Boolean).join(' · '),
        });
      }
      if (!cancelled) setVoices(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, voices, language, draft.kokoro, t]);

  const configFor = (voice: GalleryVoice): VoiceConfig => ({
    ...draft,
    engine: voice.engine,
    voice_id: voice.voiceId,
    local_model_id: voice.localModelId ?? draft.local_model_id,
    kokoro: voice.kokoro ?? draft.kokoro,
  });

  const listen = async (voice: GalleryVoice) => {
    setPlaying(voice.key);
    setError('');
    try {
      const config = configFor(voice);
      const audio = await api.synthesizeSpeech(sampleText(config), config);
      await audioPlayer.playDataUrl(audio, gain(config), config.output_device_id, config.effects);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPlaying(null);
    }
  };

  const chosen = (voice: GalleryVoice) =>
    draft.engine === voice.engine && draft.voice_id === voice.voiceId && (voice.engine !== 'local' || draft.local_model_id === voice.localModelId);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/40" data-voice-gallery={open ? 'open' : 'closed'}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-200">{t('voiceGallery.title')}</span>
          <span className="block text-xs text-slate-400">{t('voiceGallery.intro')}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-800 px-4 py-3">
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
          {!voices ? (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('voiceGallery.loading')}
            </p>
          ) : voices.length === 0 ? (
            <p className="text-xs text-slate-400">{t('voiceGallery.empty')}</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
              {voices.map((voice) => (
                <li key={voice.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-800/60" data-gallery-voice={voice.key}>
                  <button
                    type="button"
                    onClick={() => void listen(voice)}
                    disabled={playing !== null}
                    aria-label={t('voiceGallery.listenTo', { name: voice.label })}
                    title={t('voiceGallery.listen')}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-slate-700 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                  >
                    {playing === voice.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-200">{voice.label}</span>
                    <span className="block truncate text-[11px] text-slate-400">{voice.detail}</span>
                  </span>
                  {chosen(voice) ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                      <Check className="h-3.5 w-3.5" />
                      {t('voiceGallery.chosen')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onPick(configFor(voice))}
                      className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      {t('voiceGallery.use')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-500">{t('voiceGallery.more')}</p>
        </div>
      )}
    </div>
  );
}
