import { useTranslation, type TranslationKey } from '../../i18n';
import { NO_EFFECTS, VOICE_EFFECT_PRESETS } from '../../services/voiceEffects';
import type { VoiceEffects } from '../../types';

const LABEL = 'mb-1 flex justify-between text-xs font-medium text-slate-300';

interface Slider {
  key: 'pitch_semitones' | 'reverb' | 'echo' | 'robot' | 'highpass_hz' | 'lowpass_hz';
  min: number;
  max: number;
  step: number;
  show: (value: number) => string;
}

const SLIDERS: Slider[] = [
  { key: 'pitch_semitones', min: -12, max: 12, step: 1, show: (v) => `${v > 0 ? '+' : ''}${v}` },
  { key: 'reverb', min: 0, max: 1, step: 0.05, show: (v) => `${Math.round(v * 100)} %` },
  { key: 'echo', min: 0, max: 1, step: 0.05, show: (v) => `${Math.round(v * 100)} %` },
  { key: 'robot', min: 0, max: 1, step: 0.05, show: (v) => `${Math.round(v * 100)} %` },
  { key: 'highpass_hz', min: 0, max: 1000, step: 50, show: (v) => (v ? `${v} Hz` : '–') },
  { key: 'lowpass_hz', min: 0, max: 8000, step: 250, show: (v) => (v ? `${v} Hz` : '–') },
];

/**
 * Sound effects of a voice: presets (robot, radio, ghost …) and the values behind them. They
 * are applied when the voice is played, for every engine.
 */
export const VoiceEffectsPanel = ({ value, onChange }: { value: VoiceEffects | null | undefined; onChange: (effects: VoiceEffects | null) => void }) => {
  const { t } = useTranslation();
  const effects = { ...NO_EFFECTS, ...value };

  const presetButton = (id: string) => {
    const active = id === '' ? !value : !!value && effects.preset === id;
    return (
      <button
        key={id || 'none'}
        type="button"
        aria-pressed={active}
        onClick={() => onChange(id ? { ...VOICE_EFFECT_PRESETS[id]!, preset: id } : null)}
        className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
          active ? 'border-accent-500/60 bg-accent-500/20 text-accent-200' : 'border-slate-700 text-slate-300 hover:bg-slate-800'
        }`}
      >
        {t(`voiceFx.preset.${id || 'none'}` as TranslationKey)}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">{t('voiceFx.intro')}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('voiceFx.presets')}>
        {['', ...Object.keys(VOICE_EFFECT_PRESETS)].map(presetButton)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SLIDERS.map(({ key, min, max, step, show }) => (
          <label key={key} className="block">
            <span className={LABEL}>
              <span>{t(`voiceFx.${key}` as TranslationKey)}</span>
              <span className="font-mono text-slate-400">{show(effects[key])}</span>
            </span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={effects[key]}
              onChange={(e) => onChange({ ...effects, preset: '', [key]: Number(e.target.value) })}
              className="w-full accent-accent-500"
            />
          </label>
        ))}
      </div>
    </div>
  );
};
