import { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Download, Image, Loader2, MessageSquare, Mic, TriangleAlert } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { downloadKey } from '../../store/slices/llmSlice';
import { useTranslation, type TranslationKey } from '../../i18n';
import { api } from '../../services/api';
import {
  bundleBytes,
  formatBytes,
  isNoncommercial,
  recommendChat,
  recommendImage,
  recommendTts,
  spaceSuffices,
  ttsCandidates,
  voiceFor,
} from '../../utils/setupBundle';
import { runBundle, useSetupBundle, type BundleKind, type PartStatus } from './setupBundleStore';
import type { DiskSpace, ImageModelInfo, StarterModel, TtsModelInfo } from '../../types';

interface Catalogs {
  starters: StarterModel[];
  images: ImageModelInfo[];
  tts: TtsModelInfo[];
  disk: DiskSpace | null;
}

const NONE = '';
const ICONS = { chat: MessageSquare, image: Image, tts: Mic } as const;
const LABELS: Record<BundleKind, TranslationKey> = { chat: 'setup.partChat', image: 'setup.partImage', tts: 'setup.partTts' };

/**
 * First-run "everything for your PC" card: the chat, image and speech models that fit this
 * machine, preselected, with what they cost on disk, and one question whether to load them now.
 */
export const SetupBundle = () => {
  const { t, currentLanguage } = useTranslation();
  const { hardware, appLanguage, downloadProgress } = useStoreFields('hardware', 'appLanguage', 'downloadProgress');
  const { status, running } = useSetupBundle();
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  useEffect(() => {
    void Promise.all([
      api.listStarterModels().catch(() => []),
      api.listImageModels(false).catch(() => []),
      api.listTtsModels().catch(() => []),
      api.diskSpace().catch(() => null),
    ]).then(([starters, images, tts, disk]) => setCatalogs({ starters: starters ?? [], images: images ?? [], tts: tts ?? [], disk: disk ?? null }));
  }, []);

  const gpu = hardware?.gpus.find((g) => g.total_vram_mb > 0);
  const vram = gpu?.total_vram_mb ?? 0;
  const language = appLanguage.split('-')[0] ?? 'de';
  const recommendedChat = catalogs ? recommendChat(catalogs.starters) : null;
  const recommended = catalogs && {
    chat: recommendedChat,
    image: recommendImage(catalogs.images),
    tts: recommendTts(catalogs.tts, language, vram, recommendedChat?.vram_mb ?? 0),
  };

  // The user's choice per part (an id, or NONE to leave it out); the recommendation until changed.
  const [picked, setPicked] = useState<Partial<Record<BundleKind, string>>>({});
  if (!catalogs || !recommended) {
    return (
      <div className="rounded-xl border border-slate-800 bg-app/60 p-4 text-xs text-slate-400 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('setup.loading')}
      </div>
    );
  }
  const idOf = (kind: BundleKind) => picked[kind] ?? (recommended[kind]?.id ?? NONE);
  const chat = catalogs.starters.find((s) => s.id === idOf('chat')) ?? null;
  const image = catalogs.images.find((m) => m.id === idOf('image')) ?? null;
  const ttsOptions = ttsCandidates(catalogs.tts, language);
  const tts = ttsOptions.find((m) => m.id === idOf('tts')) ?? null;
  const ttsVoice = tts ? voiceFor(tts, language) : null;
  const nothingFits = !recommended.chat && !recommended.image && !recommended.tts;
  if (nothingFits && catalogs.starters.length === 0) return null;

  const chatMissing = chat && !chat.installed ? chat.file.size_bytes + (chat.mmproj && !chat.mmproj_installed ? chat.mmproj.size_bytes : 0) : 0;
  const bytes = bundleBytes([
    { missingBytes: chatMissing, where: 'models' },
    { missingBytes: image?.missing_bytes ?? 0, where: 'data' },
    { missingBytes: tts?.missing_bytes ?? 0, where: 'data' },
  ]);
  const disk = catalogs.disk;
  const sameDisk = disk?.models_mb != null && disk.models_mb === disk.data_mb;
  const enoughSpace = sameDisk
    ? spaceSuffices(bytes.total, disk?.data_mb)
    : spaceSuffices(bytes.models, disk?.models_mb) && spaceSuffices(bytes.data, disk?.data_mb);
  const freeMb = Math.min(disk?.models_mb ?? Infinity, disk?.data_mb ?? Infinity);
  const anything = Boolean(chat || image || tts);
  const allDone = (['chat', 'image', 'tts'] as const).every((k) => (k === 'chat' ? !chat : k === 'image' ? !image : !tts) || status[k].phase === 'done');
  const started = Object.values(status).some((s) => s.phase !== 'idle');

  // The chat download reports through the store like every model download.
  const chatProgress = chat ? downloadProgress[downloadKey(chat.file.filename)] : undefined;
  const statusOf = (kind: BundleKind): PartStatus =>
    kind === 'chat' && status.chat.phase === 'download' && chatProgress ? { phase: 'download', percent: chatProgress.percent } : status[kind];

  const row = (kind: BundleKind, options: { id: string; label: string; fits: boolean }[], detail: string, size: number, installed: boolean) => {
    const Icon = ICONS[kind];
    const part = statusOf(kind);
    const value = idOf(kind);
    return (
      <li key={kind} className="rounded-lg border border-slate-800 bg-app/60 p-3 space-y-1.5" data-setup-part={kind} data-setup-status={part.phase}>
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-accent-300" />
          <label htmlFor={`setup-${kind}`} className="text-sm font-semibold text-slate-100 w-20 shrink-0">
            {t(LABELS[kind])}
          </label>
          <select
            id={`setup-${kind}`}
            value={value}
            disabled={running || started}
            onChange={(e) => setPicked((p) => ({ ...p, [kind]: e.target.value }))}
            aria-describedby={`setup-${kind}-detail`}
            className="min-w-0 flex-1 bg-app border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-accent-500 disabled:opacity-60"
          >
            <option value={NONE}>{t('setup.leaveOut')}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.fits ? '' : ` (${t('setup.tooBig')})`}
              </option>
            ))}
          </select>
          {value !== NONE && (
            <span className="shrink-0 text-xs text-slate-400">{installed ? t('setup.installed') : formatBytes(size, currentLanguage)}</span>
          )}
        </div>
        <p id={`setup-${kind}-detail`} className="text-xs text-slate-400">
          {value === NONE ? t('setup.leftOut') : detail}
        </p>
        {part.phase === 'runtime' && <p className="text-xs text-accent-200 flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('setup.runtime')}</p>}
        {part.phase === 'download' && (
          <div className="space-y-1">
            <p className="text-xs text-accent-200">{t('setup.downloading', { percent: Math.round(part.percent) })}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-accent-500 transition-all" style={{ width: `${part.percent}%` }} />
            </div>
          </div>
        )}
        {part.phase === 'done' && <p className="text-xs text-emerald-300 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />{t('setup.ready')}</p>}
        {part.phase === 'failed' && <p role="alert" className="text-xs text-rose-300">{t('setup.failed', { error: part.error })}</p>}
      </li>
    );
  };

  const description = (map: Record<string, string>) => map[currentLanguage] || map.en || '';
  const gb = (mb: number) => (mb / 1024).toLocaleString(currentLanguage, { maximumFractionDigits: 0 });

  return (
    <section className="rounded-xl border border-accent-500/40 bg-accent-500/10 p-4 space-y-3" data-setup-bundle aria-labelledby="setup-bundle-title">
      <div className="space-y-1">
        <h3 id="setup-bundle-title" className="text-sm font-semibold text-slate-100">{t('setup.title')}</h3>
        <p className="flex items-center gap-1.5 text-xs text-slate-300">
          <Cpu className="h-3.5 w-3.5" />
          {gpu
            ? t('setup.machine', { gpu: gpu.name, vram: gb(gpu.total_vram_mb), ram: gb(hardware?.total_ram_mb ?? 0) })
            : t('setup.machineNoGpu', { ram: gb(hardware?.total_ram_mb ?? 0) })}
        </p>
        <p className="text-xs text-slate-400">{t('setup.text')}</p>
      </div>

      <ul className="space-y-2">
        {row(
          'chat',
          catalogs.starters.map((s) => ({ id: s.id, label: `${s.name} · ${s.file.size_formatted}`, fits: s.fits_gpu })),
          chat ? description(chat.description) : '',
          chatMissing,
          !!chat?.installed && (!chat.mmproj || chat.mmproj_installed),
        )}
        {row(
          'image',
          catalogs.images.map((m) => ({
            id: m.id,
            label: `${m.name} · ${formatBytes(m.download_bytes, currentLanguage)}${isNoncommercial(m.license) ? ` · ${t('setup.noncommercial')}` : ''}`,
            fits: m.fits_gpu,
          })),
          image ? t(isNoncommercial(image.license) ? 'setup.imageDetailNc' : 'setup.imageDetail', { license: image.license }) : '',
          image?.missing_bytes ?? 0,
          !!image?.installed,
        )}
        {row(
          'tts',
          ttsOptions.map((m) => ({ id: m.id, label: `${m.name} · ${formatBytes(m.download_bytes, currentLanguage)}`, fits: true })),
          tts ? t('setup.ttsDetail', { voice: tts.voices.find((v) => v.voice_id === ttsVoice)?.label ?? '–' }) : '',
          tts?.missing_bytes ?? 0,
          !!tts?.installed,
        )}
      </ul>

      {anything && (
        <p className={`text-xs ${enoughSpace ? 'text-slate-300' : 'text-amber-200'} flex items-center gap-1.5`} data-setup-total>
          {!enoughSpace && <TriangleAlert className="h-3.5 w-3.5" />}
          {bytes.total > 0 ? t('setup.total', { size: formatBytes(bytes.total, currentLanguage) }) : t('setup.totalNothing')}
          {Number.isFinite(freeMb) && ` · ${t('setup.free', { size: formatBytes(freeMb * 1024 * 1024, currentLanguage) })}`}
          {!enoughSpace && ` · ${t('setup.notEnoughSpace')}`}
        </p>
      )}

      {allDone && started ? (
        <p role="status" className="flex items-center gap-1.5 text-sm text-emerald-300" data-setup-done>
          <CheckCircle2 className="h-4 w-4" />
          {t('setup.allDone')}
        </p>
      ) : (
        anything && (
          <div className="space-y-2">
            <p className="text-sm text-slate-200">{t('setup.question')}</p>
            <button
              type="button"
              disabled={running || !enoughSpace}
              onClick={() => void runBundle({ chat, image, tts: tts && ttsVoice ? { model: tts, voiceId: ttsVoice } : null })}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500 disabled:opacity-50"
              data-setup-run
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {running ? t('setup.running') : started ? t('setup.retry') : t('setup.yes')}
            </button>
            <p className="text-xs text-slate-400">{t('setup.later')}</p>
          </div>
        )
      )}
    </section>
  );
};
