import { useEffect, useState } from 'react';
import { RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { api } from '../../services/api';
import { CHANNEL_KEYS, type ChannelKey, type PuppetInfo } from '../../services/inochi2d/controls';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { MAPPABLE_EMOTIONS } from '../avatar/Inochi2dViewer';
import type { Inochi2dMapping } from '../../types';
import type { LoopRole } from '../../utils/avatarGestures';

interface Props {
  /** Path of the puppet file. */
  path: string;
  /** What the loaded puppet offers (null while it loads in the preview). */
  info: PuppetInfo | null;
}

const EMPTY: Inochi2dMapping = { channels: {}, emotions: {}, loops: {} };
const LOOP_ROLES: LoopRole[] = ['walk', 'sit'];
/** Select value of a parameter axis. */
const SEP = '\u0001';
const encode = (param: string, axis: number) => `${param}${SEP}${axis}`;

/**
 * Hand-made settings of an Inochi2D puppet: which parameter moves mouth, eyes, head … (when the
 * name detection picks the wrong one) and which of its own animations shows an emotion.
 */
export function Inochi2dMappingSettings({ path, info }: Props) {
  const { t, tEmotion } = useTranslation();
  const [mapping, setMapping] = useState<Inochi2dMapping>(EMPTY);
  const [saved, setSaved] = useState<Inochi2dMapping>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getInochi2dMapping(path)
      .then((m) => {
        if (cancelled) return;
        const loaded: Inochi2dMapping = { channels: m.channels ?? {}, emotions: m.emotions ?? {}, loops: m.loops ?? {} };
        setMapping(loaded);
        setSaved(loaded);
      })
      .catch((e) => console.warn('Puppen-Einstellungen nicht lesbar:', e));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const dirty = JSON.stringify(mapping) !== JSON.stringify(saved);

  const store = async (next: Inochi2dMapping, message: TranslationKey) => {
    setBusy(true);
    try {
      await api.setInochi2dMapping(path, next);
      setMapping(next);
      setSaved(next);
      useAppStore.getState().bumpInochi2dMappingRevision();
      toast.success(translate(message));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const channelValue = (key: ChannelKey) => {
    if (!(key in (mapping.channels ?? {}))) return 'auto';
    const chosen = mapping.channels?.[key];
    return chosen ? encode(chosen.param, chosen.axis) : 'none';
  };

  const setChannel = (key: ChannelKey, value: string) => {
    const channels = { ...mapping.channels };
    if (value === 'auto') delete channels[key];
    else if (value === 'none') channels[key] = null;
    else {
      const [param, axis] = value.split(SEP);
      channels[key] = { param: param!, axis: Number(axis) || 0, inverted: mapping.channels?.[key]?.inverted ?? false };
    }
    setMapping({ ...mapping, channels });
  };

  const setInverted = (key: ChannelKey, inverted: boolean) => {
    const chosen = mapping.channels?.[key];
    if (!chosen) return;
    setMapping({ ...mapping, channels: { ...mapping.channels, [key]: { ...chosen, inverted } } });
  };

  const setLoop = (role: LoopRole, value: string) => {
    const loops = { ...mapping.loops };
    if (value === 'auto') delete loops[role];
    else loops[role] = value === 'none' ? '' : value;
    setMapping({ ...mapping, loops });
  };

  const setEmotion = (emotion: string, value: string) => {
    const emotions = { ...mapping.emotions };
    if (value === 'auto') delete emotions[emotion];
    else emotions[emotion] = value === 'none' ? '' : value;
    setMapping({ ...mapping, emotions });
  };

  // `w-0 flex-1`: long option texts must not widen the panel.
  const selectClass =
    'w-0 min-w-0 flex-1 rounded-md border border-slate-700 bg-app px-2 py-1 text-xs text-slate-200 focus:border-accent-500 focus:outline-hidden';

  return (
    <details className="group rounded-lg border border-slate-800 p-3" data-inochi2d-mapping>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-slate-200">
        <SlidersHorizontal className="h-4 w-4 text-accent-300" aria-hidden />
        {t('avatars.inochi2dSetup')}
        {dirty && <span className="ml-auto text-[11px] font-normal text-amber-300">{t('avatars.inochi2dUnsaved')}</span>}
      </summary>
      <p className="mt-2 text-xs text-slate-400">{t('avatars.inochi2dSetupHint')}</p>
      {!info ? (
        <p className="mt-3 text-xs text-slate-500">{t('avatars.inochi2dWaiting')}</p>
      ) : (
        <div className="mt-3 space-y-4">
          <fieldset className="min-w-0 space-y-1.5">
            <legend className="mb-1 text-xs font-semibold text-slate-300">{t('avatars.inochi2dChannels')}</legend>
            {CHANNEL_KEYS.map((key) => {
              const label = t(`inochi2d.channel.${key}` as TranslationKey);
              const value = channelValue(key);
              const detected = info.detected[key];
              return (
                <div key={key} className="flex items-center gap-2" data-inochi2d-channel={key}>
                  <span className="w-32 shrink-0 truncate text-xs text-slate-400" title={label}>{label}</span>
                  <select aria-label={label} value={value} onChange={(e) => setChannel(key, e.target.value)} className={selectClass}>
                    <option value="auto">
                      {detected ? t('avatars.inochi2dAuto', { name: detected }) : t('avatars.inochi2dAutoNone')}
                    </option>
                    <option value="none">{t('avatars.inochi2dNone')}</option>
                    {info.params.flatMap((p) =>
                      (p.isVec2 ? [0, 1] : [0]).map((axis) => (
                        <option key={encode(p.name, axis)} value={encode(p.name, axis)}>
                          {p.isVec2 ? `${p.name} (${axis ? 'y' : 'x'})` : p.name}
                        </option>
                      )),
                    )}
                  </select>
                  <label className={`flex shrink-0 items-center gap-1 text-[11px] ${mapping.channels?.[key] ? 'text-slate-300' : 'invisible'}`}>
                    <input
                      type="checkbox"
                      checked={!!mapping.channels?.[key]?.inverted}
                      onChange={(e) => setInverted(key, e.target.checked)}
                      className="h-3.5 w-3.5 accent-accent-500"
                    />
                    {t('avatars.inochi2dInverted')}
                  </label>
                </div>
              );
            })}
          </fieldset>

          <fieldset className="min-w-0 space-y-1.5">
            <legend className="mb-1 text-xs font-semibold text-slate-300">{t('avatars.inochi2dEmotions')}</legend>
            {info.animations.length === 0 && <p className="text-xs text-slate-500">{t('avatars.inochi2dNoAnimations')}</p>}
            {info.animations.length > 0 &&
              MAPPABLE_EMOTIONS.map((emotion) => {
                const chosen = mapping.emotions?.[emotion];
                const value = chosen === undefined ? 'auto' : chosen === '' ? 'none' : chosen;
                const auto = info.emotionClips[emotion];
                // "teasing" is an extra portrait mood, not one of the GoEmotions.
                const label = emotion === 'teasing' ? t('portrait.teasing') : tEmotion(emotion);
                return (
                  <div key={emotion} className="flex items-center gap-2" data-inochi2d-emotion={emotion}>
                    <span className="w-32 shrink-0 truncate text-xs text-slate-400">{label}</span>
                    <select aria-label={label} value={value} onChange={(e) => setEmotion(emotion, e.target.value)} className={selectClass}>
                      <option value="auto">{auto ? t('avatars.inochi2dAuto', { name: auto }) : t('avatars.inochi2dAutoPose')}</option>
                      <option value="none">{t('avatars.inochi2dPoseOnly')}</option>
                      {info.animations.map((name) => (
                        <option key={name} value={name}>{name.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
          </fieldset>

          {info.animations.length > 0 && (
            <fieldset className="min-w-0 space-y-1.5" data-inochi2d-loops>
              <legend className="mb-1 text-xs font-semibold text-slate-300">{t('avatars.inochi2dLoops')}</legend>
              <p className="text-[11px] text-slate-500">{t('avatars.inochi2dLoopsHint')}</p>
              {LOOP_ROLES.map((role) => {
                const chosen = mapping.loops?.[role];
                const value = chosen === undefined ? 'auto' : chosen === '' ? 'none' : chosen;
                const auto = info.loopClips[role];
                const label = t(`avatars.inochi2dLoop.${role}`);
                return (
                  <div key={role} className="flex items-center gap-2" data-inochi2d-loop={role}>
                    <span className="w-32 shrink-0 truncate text-xs text-slate-400">{label}</span>
                    <select aria-label={label} value={value} onChange={(e) => setLoop(role, e.target.value)} className={selectClass}>
                      <option value="auto">{auto ? t('avatars.inochi2dAuto', { name: auto }) : t('avatars.inochi2dAutoNone')}</option>
                      <option value="none">{t('avatars.inochi2dNone')}</option>
                      {info.animations.map((name) => (
                        <option key={name} value={name}>{name.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </fieldset>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => void store(mapping, 'avatars.inochi2dSaved')}
              className="flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              data-inochi2d-mapping-save
            >
              <Save className="h-3.5 w-3.5" aria-hidden />
              {t('common.save')}
            </button>
            <button
              type="button"
              disabled={busy || (Object.keys(saved.channels ?? {}).length === 0 && Object.keys(saved.emotions ?? {}).length === 0 && Object.keys(saved.loops ?? {}).length === 0)}
              onClick={() => void store(EMPTY, 'avatars.inochi2dResetDone')}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              {t('avatars.inochi2dReset')}
            </button>
          </div>
        </div>
      )}
    </details>
  );
}
