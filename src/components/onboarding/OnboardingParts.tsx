import { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Download, Loader2, MessageCircle, PlugZap, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../../services/api';
import { useStoreFields, useAppStore } from '../../store/useAppStore';
import { llmTarget } from '../../store/helpers';
import { useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { RuntimeCard } from '../settings/sections/RuntimeCard';
import type { CharacterProfile, LlmProviderType, StarterModel } from '../../types';

const SECONDARY_BUTTON =
  'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 text-sm transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-40 disabled:cursor-not-allowed';

type Check = { phase: 'idle' | 'running' } | { phase: 'ok'; text: string } | { phase: 'failed'; error: string };

const CheckResult = ({ check, okLabel }: { check: Check; okLabel: string }) => {
  if (check.phase === 'ok')
    return (
      <p role="status" className="flex items-start gap-1.5 text-xs text-emerald-300">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {okLabel}
      </p>
    );
  if (check.phase === 'failed')
    return (
      <p role="alert" className="flex items-start gap-1.5 text-xs text-rose-300">
        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {check.error}
      </p>
    );
  return null;
};

interface CloudConnectionTestProps {
  provider: LlmProviderType;
  endpoint: string;
  apiKey: string;
  model: string;
}

/**
 * Sends one tiny request with the entered key and model, so a wrong key or model name shows
 * up here and not as the first failed chat. Remount (key) when the inputs change.
 */
export const CloudConnectionTest = ({ provider, endpoint, apiKey, model }: CloudConnectionTestProps) => {
  const { t } = useTranslation();
  const [check, setCheck] = useState<Check>({ phase: 'idle' });

  const run = async () => {
    setCheck({ phase: 'running' });
    try {
      const text = await api.quickReply({
        endpoint_url: endpoint,
        api_key: apiKey.trim() || null,
        model: model.trim() || null,
        provider,
        system: 'This is a connection test. Reply with the single word OK.',
        user: 'OK?',
        max_tokens: 16,
      });
      setCheck({ phase: 'ok', text });
    } catch (e) {
      setCheck({ phase: 'failed', error: errorMessage(e) });
    }
  };

  return (
    <div className="space-y-2 sm:col-span-2">
      <button type="button" onClick={() => void run()} disabled={!apiKey.trim() || check.phase === 'running'} className={SECONDARY_BUTTON}>
        {check.phase === 'running' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
        {check.phase === 'running' ? t('onboarding.testing') : t('onboarding.testConnection')}
      </button>
      <CheckResult check={check} okLabel={t('onboarding.connectionOk')} />
    </div>
  );
};

/**
 * The local path in one place: detected GPU, the llama.cpp runtime and a starter model
 * that fits it (download with progress, selected when done).
 */
export const LocalModelSetup = () => {
  const { t } = useTranslation();
  const { hardware, scannedModels, serverConfig, selectLocalModel, downloadGgufModel, downloadProgress, hfError } = useStoreFields(
    'hardware', 'scannedModels', 'serverConfig', 'selectLocalModel', 'downloadGgufModel', 'downloadProgress', 'hfError',
  );
  const [starters, setStarters] = useState<StarterModel[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const gpu = hardware?.gpus.find((g) => g.total_vram_mb > 0);

  const refresh = () =>
    api
      .listStarterModels()
      .then(setStarters)
      .catch(() => setStarters([]));

  useEffect(() => {
    void refresh();
  }, []);

  const pathOf = (starter: StarterModel) => scannedModels.find((m) => m.path.endsWith(starter.file.filename))?.path;

  const download = async (starter: StarterModel) => {
    setDownloading(starter.id);
    // Selects the model when the download finished; errors land in `hfError`.
    await downloadGgufModel({ ...starter.file, runtime: 'standard' });
    setDownloading(null);
    void refresh();
  };

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Cpu className="h-3.5 w-3.5" />
        {gpu
          ? t('onboarding.gpuDetected', { name: gpu.name, vram: (gpu.total_vram_mb / 1024).toFixed(0) })
          : t('onboarding.noGpu')}
      </p>

      <RuntimeCard kind="llama" />

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('onboarding.starterTitle')}</legend>
        {!starters ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t('onboarding.starterLoading')}
          </p>
        ) : (
          <ul className="space-y-2" aria-label={t('onboarding.starterTitle')}>
            {starters.map((starter) => {
              const path = pathOf(starter);
              const selected = Boolean(path) && serverConfig.model_path === path;
              const progress = downloadProgress[starter.file.filename];
              const isDownloading = downloading === starter.id;
              return (
                <li
                  key={starter.id}
                  className={`rounded-xl border p-3 text-sm space-y-2 ${selected ? 'border-accent-500/70 bg-accent-500/10' : 'border-slate-800 bg-app/60'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-100">{starter.name}</span>
                      {starter.recommended && (
                        <span className="ml-2 rounded border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300">
                          {t('onboarding.starterRecommended')}
                        </span>
                      )}
                      <span className="block text-xs text-slate-400">
                        {t('onboarding.starterMeta', { size: starter.file.size_formatted, vram: (starter.vram_mb / 1024).toFixed(0), license: starter.license })}
                      </span>
                      {!starter.fits_gpu && <span className="block text-xs text-amber-300/90">{t('onboarding.starterTooBig')}</span>}
                    </span>
                    {path ? (
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => void selectLocalModel(path)}
                        className={SECONDARY_BUTTON}
                      >
                        {selected ? <CheckCircle2 className="h-4 w-4 text-accent-300" /> : null}
                        {selected ? t('onboarding.starterSelected') : t('onboarding.starterUse')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void download(starter)}
                        disabled={downloading !== null}
                        aria-label={t('onboarding.starterDownloadLabel', { name: starter.name })}
                        className={SECONDARY_BUTTON}
                      >
                        {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        {t('onboarding.starterDownload', { size: starter.file.size_formatted })}
                      </button>
                    )}
                  </div>
                  {isDownloading && progress && (
                    <div role="status" className="space-y-1 text-xs text-slate-400">
                      <span>{t('onboarding.starterProgress', { percent: progress.percent.toFixed(0) })}</span>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                        <div className="h-full bg-accent-500 transition-all" style={{ width: `${progress.percent}%` }} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {hfError && <p role="alert" className="text-xs text-rose-300">{hfError}</p>}
      </fieldset>
    </div>
  );
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The wizard ends with a real reply of the chosen character: it starts the local server if
 * needed and asks the model for a one-line greeting, so the setup is proven to work.
 */
export const FirstReply = ({ character }: { character: CharacterProfile }) => {
  const { t } = useTranslation();
  const [check, setCheck] = useState<Check>({ phase: 'idle' });
  const name = character.card.data.name;

  const run = async () => {
    setCheck({ phase: 'running' });
    try {
      const store = useAppStore.getState();
      if (store.selectedBackend !== 'cloud' && store.serverStatus.state !== 'running') {
        await store.startServer();
        // Loading a model takes a while; the status says when it is ready or failed.
        for (let i = 0; i < 240; i += 1) {
          await useAppStore.getState().fetchServerStatus();
          const state = useAppStore.getState().serverStatus.state;
          if (state === 'running') break;
          if (state === 'failed') throw new Error(t('onboarding.serverFailed'));
          await wait(1000);
        }
      }
      const current = useAppStore.getState();
      const card = character.card.data;
      const text = await api.quickReply({
        ...llmTarget(current),
        system: `You are ${name}. ${card.description}\n${card.personality}\nStay in character. Answer in ${current.replyLanguage || 'Deutsch'}.`,
        user: t('onboarding.firstReplyPrompt'),
        max_tokens: 160,
      });
      setCheck({ phase: 'ok', text });
    } catch (e) {
      setCheck({ phase: 'failed', error: errorMessage(e) });
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-app/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-300">{t('onboarding.firstReplyIntro', { name })}</p>
        <button type="button" onClick={() => void run()} disabled={check.phase === 'running'} className={SECONDARY_BUTTON}>
          {check.phase === 'running' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : check.phase === 'idle' ? (
            <MessageCircle className="h-4 w-4" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {check.phase === 'running'
            ? t('onboarding.firstReplyRunning')
            : check.phase === 'idle'
              ? t('onboarding.firstReplyButton')
              : t('onboarding.firstReplyAgain')}
        </button>
      </div>
      {check.phase === 'ok' && (
        <figure className="rounded-xl border border-accent-500/30 bg-accent-500/10 p-3">
          <figcaption className="text-xs font-semibold text-accent-200">{name}</figcaption>
          <blockquote className="mt-1 whitespace-pre-wrap text-sm text-slate-100">{check.text}</blockquote>
        </figure>
      )}
      {check.phase === 'failed' && (
        <p role="alert" className="text-xs text-rose-300">
          {t('onboarding.firstReplyFailed', { error: check.error })}
        </p>
      )}
    </div>
  );
};
