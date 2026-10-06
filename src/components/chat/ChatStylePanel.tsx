import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FolderOpen, RotateCcw } from 'lucide-react';
import { api } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import type { ChatStyle } from '../../types';

export const DEFAULT_CHAT_STYLE: ChatStyle = {
  background: null,
  background_dim: 40,
  text_size: '',
  bubbles: '',
  ambient: null,
  ambient_volume: 35,
};

/** Changes are saved shortly after the last edit (sliders send many). */
const SAVE_DELAY_MS = 400;

const FIELD = 'w-full rounded-lg border border-slate-700 bg-app px-2.5 py-1.5 text-xs text-slate-100';
const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400';
const ICON_BUTTON =
  'shrink-0 rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';

/**
 * Look and sound of the open chat: background picture (dimmed for legibility), text size,
 * bubble style and a looping ambient sound. Pictures and sounds are the Stage library, so
 * imports here are available there too.
 */
export const ChatStylePanel = ({ chatId }: { chatId: string }) => {
  const { t } = useTranslation();
  const saved = useAppStore((s) => s.chatSessions.find((session) => session.id === chatId)?.style);
  const [style, setStyle] = useState<ChatStyle>({ ...DEFAULT_CHAT_STYLE, ...saved });
  const [assets, setAssets] = useState<{ backgrounds: string[]; ambient: string[] }>({ backgrounds: [], ambient: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // An edit not saved yet; closing the panel saves it at once instead of dropping it.
  const pending = useRef<{ style: ChatStyle | null } | null>(null);

  const store = (next: ChatStyle | null) => {
    pending.current = null;
    useAppStore
      .getState()
      .updateChatStyle(chatId, next)
      .catch((e) => toast.error(translate('chatStyle.saveFailed', { error: errorMessage(e) })));
  };

  const loadAssets = () =>
    api
      .listStageAssets()
      .then(setAssets)
      .catch((e) => toast.error(errorMessage(e)));

  useEffect(() => {
    void loadAssets();
    return () => {
      clearTimeout(timer.current);
      if (pending.current) store(pending.current.style);
    };
    // Mount/unmount only; `store` reads the latest state through refs.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = (next: ChatStyle | null) => {
    pending.current = { style: next };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => store(next), SAVE_DELAY_MS);
  };

  const update = (patch: Partial<ChatStyle>) => {
    const next = { ...style, ...patch };
    setStyle(next);
    save(next);
  };

  const importAsset = async (kind: 'backgrounds' | 'ambient') => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters:
        kind === 'backgrounds'
          ? [{ name: t('chatStyle.images'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
          : [{ name: t('chatStyle.sounds'), extensions: ['mp3', 'ogg', 'wav', 'm4a', 'flac'] }],
    });
    if (typeof selected !== 'string') return;
    try {
      const name = await api.importStageAsset(selected, kind);
      await loadAssets();
      update(kind === 'backgrounds' ? { background: name } : { ambient: name });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const options = (keys: string[], prefix: string) =>
    keys.map((key) => (
      <option key={key} value={key}>
        {t(`${prefix}.${key || 'default'}` as TranslationKey)}
      </option>
    ));

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
      <p className="text-slate-400">{t('chatStyle.intro')}</p>

      <div>
        <label htmlFor="chat-style-background" className={LABEL}>{t('chatStyle.background')}</label>
        <div className="flex gap-1.5">
          <select
            id="chat-style-background"
            value={style.background ?? ''}
            onChange={(e) => update({ background: e.target.value || null })}
            className={FIELD}
          >
            <option value="">{t('chatStyle.none')}</option>
            {assets.backgrounds.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button type="button" onClick={() => void importAsset('backgrounds')} title={t('chatStyle.import')} aria-label={t('chatStyle.importBackground')} className={ICON_BUTTON}>
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {style.background && (
        <div>
          <label htmlFor="chat-style-dim" className={`${LABEL} flex justify-between`}>
            <span>{t('chatStyle.dim')}</span>
            <span>{style.background_dim} %</span>
          </label>
          <input
            id="chat-style-dim"
            type="range"
            min={0}
            max={90}
            step={5}
            value={style.background_dim}
            onChange={(e) => update({ background_dim: Number(e.target.value) })}
            className="w-full accent-accent-500"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="chat-style-text" className={LABEL}>{t('chatStyle.textSize')}</label>
          <select id="chat-style-text" value={style.text_size} onChange={(e) => update({ text_size: e.target.value })} className={FIELD}>
            {options(['small', '', 'large'], 'chatStyle.text')}
          </select>
        </div>
        <div>
          <label htmlFor="chat-style-bubbles" className={LABEL}>{t('chatStyle.bubbles')}</label>
          <select id="chat-style-bubbles" value={style.bubbles} onChange={(e) => update({ bubbles: e.target.value })} className={FIELD}>
            {options(['', 'subtle', 'contrast'], 'chatStyle.bubble')}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="chat-style-ambient" className={LABEL}>{t('chatStyle.ambient')}</label>
        <div className="flex gap-1.5">
          <select
            id="chat-style-ambient"
            value={style.ambient ?? ''}
            onChange={(e) => update({ ambient: e.target.value || null })}
            className={FIELD}
          >
            <option value="">{t('chatStyle.none')}</option>
            {assets.ambient.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button type="button" onClick={() => void importAsset('ambient')} title={t('chatStyle.import')} aria-label={t('chatStyle.importAmbient')} className={ICON_BUTTON}>
            <FolderOpen className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {style.ambient && (
        <div>
          <label htmlFor="chat-style-volume" className={`${LABEL} flex justify-between`}>
            <span>{t('chatStyle.volume')}</span>
            <span>{style.ambient_volume} %</span>
          </label>
          <input
            id="chat-style-volume"
            type="range"
            min={0}
            max={100}
            step={5}
            value={style.ambient_volume}
            onChange={(e) => update({ ambient_volume: Number(e.target.value) })}
            className="w-full accent-accent-500"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setStyle(DEFAULT_CHAT_STYLE);
          save(null);
        }}
        className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-slate-300 hover:bg-slate-800"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {t('chatStyle.reset')}
      </button>
    </div>
  );
};
