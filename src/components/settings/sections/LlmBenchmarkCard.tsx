import { useEffect, useState } from 'react';
import { Gauge, Loader2, Play, Trash2 } from 'lucide-react';
import { useAppStore, useStoreFields } from '../../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../../i18n';
import { api } from '../../../services/api';
import { errorMessage } from '../../../utils/errors';
import type { BenchmarkResult } from '../../../types';

const RATING_STYLE: Record<string, string> = {
  smooth: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  usable: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
  slow: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
};

type Phase = { kind: 'idle' } | { kind: 'loading' } | { kind: 'running' } | { kind: 'failed'; error: string };

/** The settings a result was measured with, in a few words. */
export function benchmarkSettings(r: BenchmarkResult, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  const parts = [
    t('bench.context', { k: Math.round(r.context_size / 1024) }),
    t('bench.layers', { layers: r.gpu_layers }),
  ];
  if (r.cache_type) parts.push(`KV ${r.cache_type}`);
  if (r.lora) parts.push(`LoRA ${r.lora.replace(/\.gguf$/i, '')}`);
  return parts.join(' · ');
}

/**
 * Speed test of the chosen local chat model: starts it if needed, measures reading and writing
 * speed and keeps the results, so models and settings can be compared.
 */
export const LlmBenchmarkCard = () => {
  const { t, currentLanguage } = useTranslation();
  const { serverConfig, serverStatus } = useStoreFields('serverConfig', 'serverStatus');
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  useEffect(() => {
    api.listLlmBenchmarks().then((list) => setResults(list ?? [])).catch(() => setResults([]));
  }, []);
  if (!serverConfig.model_path) return null;

  const run = async () => {
    try {
      const store = useAppStore.getState();
      await store.fetchServerStatus();
      if (useAppStore.getState().serverStatus.state !== 'running') {
        setPhase({ kind: 'loading' });
        await store.startServer({ quiet: true });
      }
      setPhase({ kind: 'running' });
      const result = await api.runLlmBenchmark();
      setResults((list) => [result, ...list]);
      setPhase({ kind: 'idle' });
    } catch (e) {
      setPhase({ kind: 'failed', error: errorMessage(e) });
    }
  };
  const clear = async () => {
    await api.clearLlmBenchmarks().catch(() => undefined);
    setResults([]);
  };

  const busy = phase.kind === 'loading' || phase.kind === 'running';
  const latest = results[0];
  const number = (value: number, digits = 0) =>
    value.toLocaleString(currentLanguage, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const seconds = (ms: number) => number(ms / 1000, 1);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3" data-llm-benchmark aria-labelledby="bench-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 id="bench-title" className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
            <Gauge className="w-4 h-4 text-accent-300" />
            {t('bench.title')}
          </h3>
          <p className="text-xs text-slate-400">{t('bench.hint')}</p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || serverStatus.state === 'starting'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-accent-500 disabled:opacity-50"
          data-bench-run
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {phase.kind === 'loading' ? t('bench.loading') : phase.kind === 'running' ? t('bench.running') : t('bench.run')}
        </button>
      </div>

      {phase.kind === 'failed' && (
        <p role="alert" className="text-xs text-rose-300">
          {t('bench.failed', { error: phase.error })}
        </p>
      )}

      {latest && (
        <div className="rounded-lg border border-slate-800 bg-app/60 p-3 space-y-1.5" data-bench-latest>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-2xl font-bold text-slate-100 font-mono">{number(latest.gen_tps, 1)}</span>
            <span className="text-xs text-slate-300">{t('bench.genUnit')}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${RATING_STYLE[latest.rating] ?? RATING_STYLE.slow}`} data-bench-rating={latest.rating}>
              {t(`bench.rating.${latest.rating}` as TranslationKey)}
            </span>
          </div>
          <p className="text-xs text-slate-400">{t(`bench.ratingHint.${latest.rating}` as TranslationKey)}</p>
          <p className="text-xs text-slate-300">
            {t('bench.details', {
              prompt: number(latest.prompt_tps),
              first: seconds(latest.first_token_ms),
            })}
            {latest.vram_mb != null && ` · ${t('bench.vram', { gb: number(latest.vram_mb / 1024, 1) })}`}
          </p>
          <p className="text-[11px] text-slate-500">
            {latest.model_name} · {benchmarkSettings(latest, t)}
          </p>
        </div>
      )}

      {results.length > 1 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-300">{t('bench.history')}</h4>
            <button type="button" onClick={() => void clear()} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200">
              <Trash2 className="w-3 h-3" />
              {t('bench.clear')}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] text-slate-300" data-bench-history>
              <thead className="text-slate-500">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-medium">{t('bench.colModel')}</th>
                  <th className="py-1 pr-3 font-medium text-right">{t('bench.colGen')}</th>
                  <th className="py-1 pr-3 font-medium text-right">{t('bench.colPrompt')}</th>
                  <th className="py-1 pr-3 font-medium text-right">{t('bench.colFirst')}</th>
                  <th className="py-1 font-medium text-right">{t('bench.colDate')}</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 10).map((r) => (
                  <tr key={r.id} className="border-t border-slate-800/80 align-top">
                    <td className="py-1 pr-3">
                      <span className="block text-slate-200 break-all">{r.model_name}</span>
                      <span className="block text-slate-500">{benchmarkSettings(r, t)}</span>
                    </td>
                    <td className="py-1 pr-3 text-right font-mono">{number(r.gen_tps, 1)}</td>
                    <td className="py-1 pr-3 text-right font-mono">{number(r.prompt_tps)}</td>
                    <td className="py-1 pr-3 text-right font-mono">{seconds(r.first_token_ms)} s</td>
                    <td className="py-1 text-right text-slate-500">{new Date(r.created_at).toLocaleDateString(currentLanguage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
