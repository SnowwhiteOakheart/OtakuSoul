import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { FolderOpen, Loader2, Sparkles } from 'lucide-react';
import { useAppStore, useStoreFields } from '../../../store/useAppStore';
import { downloadKey } from '../../../store/slices/llmSlice';
import { translate, useTranslation } from '../../../i18n';
import { api } from '../../../services/api';
import type { ChatLora } from '../../../types';

/** Catalog adapters made for the model at `modelPath` (matched by the catalog file name). */
export function lorasForModel(loras: ChatLora[], modelPath: string): ChatLora[] {
  const file = modelPath.split(/[\\/]/).pop() ?? '';
  return file ? loras.filter((lora) => lora.base_files.includes(file)) : [];
}

const CUSTOM = '__custom__';

/**
 * LoRA adapter for the local chat model: simple choice among the catalog adapters made for it,
 * own files and the strength in expert mode. Adapters for adults come from the backend only while
 * 18+ is on.
 */
export const ChatLoraPicker = () => {
  const { t, currentLanguage } = useTranslation();
  const { serverConfig, expertMode, nsfwEnabled, adultConfirmed, activeDownloads, downloadProgress } = useStoreFields(
    'serverConfig', 'expertMode', 'nsfwEnabled', 'adultConfirmed', 'activeDownloads', 'downloadProgress',
  );
  const [loras, setLoras] = useState<ChatLora[]>([]);
  useEffect(() => {
    api.listChatLoras().then(setLoras).catch(() => setLoras([]));
  }, [nsfwEnabled, adultConfirmed]);

  const scale = serverConfig.lora_scale ?? 1;
  // While the slider is dragged; saved (and the server restarted) only when it is let go.
  const [draft, setDraft] = useState<number | null>(null);
  const draftScale = draft ?? scale;

  const fitting = lorasForModel(loras, serverConfig.model_path);
  const path = serverConfig.lora_path ?? '';
  const chosen = fitting.find((lora) => lora.path === path) ?? null;
  const value = chosen ? chosen.id : path ? CUSTOM : '';
  // Simple mode shows the choice only for models with adapters (or one already chosen).
  if (!serverConfig.model_path || (!expertMode && fitting.length === 0 && !path)) return null;

  const loading = fitting.find((lora) => activeDownloads[downloadKey(`${lora.id}.gguf`)]);
  const progress = loading ? downloadProgress[`${loading.id}.gguf`] : undefined;
  const store = () => useAppStore.getState();

  const choose = (next: string) => {
    if (next === value) return;
    if (next === '') return void store().setChatLora(null, 1);
    const lora = fitting.find((item) => item.id === next);
    if (!lora) return;
    if (lora.installed) return void store().setChatLora(lora.path, lora.scale);
    void store().downloadChatLora(lora, serverConfig.model_path).then(() =>
      api.listChatLoras().then(setLoras).catch(() => undefined),
    );
  };

  const browse = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: translate('settings.fileFilterGguf'), extensions: ['gguf'] }],
      });
      if (selected && typeof selected === 'string') await store().setChatLora(selected, scale);
    } catch (e) {
      console.error('Failed to browse LoRA adapter:', e);
    }
  };

  const commitScale = () => {
    if (draft === null) return;
    setDraft(null);
    if (path && draft !== scale) void store().setChatLora(path, draft);
  };
  const text = (map: Record<string, string> | undefined) => (map ? map[currentLanguage] || map.en || '' : '');

  return (
    <div className="space-y-1.5" data-chat-lora>
      <label htmlFor="settings-chat-lora" className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-accent-300" />
        {t('settings.chatLora')}
      </label>
      <div className="flex gap-2">
        <select
          id="settings-chat-lora"
          aria-describedby="settings-chat-lora-hint"
          value={value}
          disabled={Boolean(loading)}
          onChange={(e) => choose(e.target.value)}
          className="flex-1 bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-accent-500 disabled:opacity-60"
        >
          <option value="">{t('settings.chatLoraNone')}</option>
          {fitting.map((lora) => (
            <option key={lora.id} value={lora.id}>
              {t(lora.kind === 'uncensor' ? 'settings.chatLoraUncensor' : 'settings.chatLoraStyle', { name: lora.name })}
              {lora.installed ? '' : ` – ${t('settings.chatLoraDownload', { size: lora.size_formatted })}`}
            </option>
          ))}
          {value === CUSTOM && <option value={CUSTOM}>{path.split(/[\\/]/).pop()}</option>}
        </select>
        {expertMode && (
          <button
            type="button"
            onClick={() => void browse()}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">{t('settings.browseFile')}</span>
          </button>
        )}
      </div>
      {loading && (
        <p className="text-xs text-accent-200 flex items-center gap-1.5" data-chat-lora-loading>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {t('settings.chatLoraLoading', { percent: Math.round(progress?.percent ?? 0) })}
        </p>
      )}
      <p id="settings-chat-lora-hint" className="text-xs text-slate-400" data-chat-lora-hint>
        {chosen ? text(chosen.description) : t('settings.chatLoraHint')}
      </p>
      {chosen && chosen.license_kind !== 'open' && (
        <p className="text-xs text-amber-200/90" data-chat-lora-license={chosen.license_kind}>
          <span className="font-semibold">
            {t(chosen.license_kind === 'noncommercial' ? 'onboarding.licenseNoncommercial' : 'onboarding.licenseRestricted')}
          </span>{' '}
          {text(chosen.license_note) || t('onboarding.licenseRestrictedHint')}{' '}
          <button type="button" onClick={() => void openUrl(chosen.license_url).catch(() => {})} className="underline hover:text-amber-100">
            {t('onboarding.licenseView')}
          </button>
        </p>
      )}
      {expertMode && path && (
        <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5 text-xs" data-chat-lora-scale>
          <div className="flex justify-between">
            <label htmlFor="settings-chat-lora-scale" className="text-slate-300 font-medium">
              {t('settings.chatLoraScale')}
            </label>
            <span className="font-mono text-accent-300 font-bold">{draftScale.toFixed(2)}</span>
          </div>
          <input
            id="settings-chat-lora-scale"
            aria-describedby="settings-chat-lora-scale-hint"
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={draftScale}
            onChange={(e) => setDraft(parseFloat(e.target.value))}
            onPointerUp={commitScale}
            onKeyUp={commitScale}
            onBlur={commitScale}
            className="w-full accent-accent-500"
          />
          <div id="settings-chat-lora-scale-hint" className="text-[11px] text-slate-400">{t('settings.chatLoraScaleHint')}</div>
        </div>
      )}
    </div>
  );
};
