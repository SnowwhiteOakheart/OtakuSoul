import { useEffect, useState } from 'react';
import { Check, Download, FolderOpen, Loader2, Music, RefreshCw } from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { Toggle } from '../ui/Toggle';
import { Slider } from '../ui/Slider';
import { toast } from '../ui/feedback';
import { api } from '../../services/api';
import { MUSIC_MOODS, stageMusic, type MusicMood } from '../../services/stageMusic';
import { useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import type { MusicPackInfo } from '../../types';

interface StageMusicModalProps {
  onClose: () => void;
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  /** Mood the scene calls for and the one whose tracks play (a related one, or null). */
  wanted: MusicMood;
  mood: MusicMood | null;
  trackCount: number;
  /** Reads the music folder again. */
  onReload: () => Promise<void>;
}

/** Stage music: on/off, volume, the mood folders and music packs from the hub. */
export const StageMusicModal = ({ onClose, enabled, onEnabledChange, wanted, mood, trackCount, onReload }: StageMusicModalProps) => {
  const { t, currentLanguage } = useTranslation();
  const [volume, setVolume] = useState(() => Math.round(stageMusic.getVolume() * 100));
  const [packs, setPacks] = useState<MusicPackInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadPacks = () => api.getMusicPacks(currentLanguage).then((list) => setPacks(list ?? [])).catch(() => setPacks([]));
  useEffect(() => {
    void loadPacks();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- read again only when the language changes
  }, [currentLanguage]);

  const moodLabel = (m: MusicMood) => t(`stageMusic.mood.${m}` as 'stageMusic.mood.calm');

  const download = async (pack: MusicPackInfo) => {
    setBusy(pack.id);
    try {
      const count = await api.downloadMusicPack(pack.id);
      toast.success(t('stageMusic.downloaded', { name: pack.name, count }));
      await onReload();
      await loadPacks();
    } catch (error) {
      toast.error(t('stageMusic.downloadFailed', { error: errorMessage(error) }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ModalOverlay onClose={onClose} closeOnBackdrop aria-labelledby="stage-music-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div data-testid="stage-music" className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4 text-sm text-slate-200 shadow-2xl">
        <h2 id="stage-music-title" className="flex items-center gap-2 text-lg font-bold text-slate-100">
          <Music className="w-5 h-5 text-accent-400" /> {t('stageMusic.title')}
        </h2>

        <div className="rounded-xl border border-slate-800 bg-app p-1">
          <Toggle id="stage-music-on" label={t('stageMusic.enabled')} description={t('stageMusic.enabledHint')} checked={enabled} onCheckedChange={onEnabledChange} />
        </div>

        <p className="text-xs text-slate-300" data-testid="stage-music-mood">
          {t('stageMusic.moodNow', { mood: moodLabel(wanted) })}
          {trackCount === 0
            ? ` ${t('stageMusic.noMusic')}`
            : !mood
              ? ` ${t('stageMusic.noTracks')}`
              : mood !== wanted
                ? ` ${t('stageMusic.borrowed', { mood: moodLabel(mood) })}`
                : ''}
        </p>

        <Slider
          label={t('stageMusic.volume')}
          min={0}
          max={100}
          step={5}
          value={volume}
          valueLabel={`${volume} %`}
          onValueChange={(next) => {
            setVolume(next);
            stageMusic.setVolume(next / 100);
          }}
        />

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-slate-400">{t('stageMusic.folderTitle')}</h3>
          <p className="text-xs text-slate-400">{t('stageMusic.folderHint')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {MUSIC_MOODS.map((m) => (
              <li key={m} className="rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px]">
                <span className="font-mono text-slate-300">{m}/</span> <span className="text-slate-400">{moodLabel(m)}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void api.openStageMusicFolder().catch((e: unknown) => toast.error(errorMessage(e)))} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">
              <FolderOpen className="w-3.5 h-3.5" /> {t('stageMusic.openFolder')}
            </button>
            <button type="button" onClick={() => void onReload()} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">
              <RefreshCw className="w-3.5 h-3.5" /> {t('stageMusic.rescan', { count: trackCount })}
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase text-slate-400">{t('stageMusic.packsTitle')}</h3>
          {packs === null ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : packs.length === 0 ? (
            <p className="text-xs text-slate-500">{t('stageMusic.packsEmpty')}</p>
          ) : (
            <ul className="space-y-2">
              {packs.map((pack) => {
                const complete = pack.installed_count >= pack.track_count;
                return (
                  <li key={pack.id} data-music-pack={pack.id} className="rounded-xl border border-slate-800 bg-app p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-100">{pack.name}</p>
                        <p className="text-xs text-slate-400">
                          {pack.author && `${pack.author} · `}
                          {pack.license_url ? (
                            <a href={pack.license_url} target="_blank" rel="noreferrer" className="underline hover:text-slate-200">{pack.license}</a>
                          ) : (
                            pack.license
                          )}
                          {' · '}
                          {t('stageMusic.packMeta', { count: pack.track_count, size: pack.size_mb })}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={complete || busy !== null}
                        onClick={() => void download(pack)}
                        className="shrink-0 flex items-center gap-1.5 rounded-xl bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-500 disabled:bg-slate-800 disabled:text-slate-400"
                      >
                        {busy === pack.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : complete ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                        {busy === pack.id ? t('stageMusic.downloading') : complete ? t('stageMusic.complete') : t('stageMusic.download')}
                      </button>
                    </div>
                    {pack.description && <p className="text-xs text-slate-300">{pack.description}</p>}
                    <p className="text-[11px] text-slate-500">
                      {pack.moods.map((m) => moodLabel(m as MusicMood)).join(' · ')}
                      {pack.installed_count > 0 && !complete && ` · ${t('stageMusic.packInstalled', { installed: pack.installed_count, total: pack.track_count })}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 font-semibold hover:bg-slate-700">
            {t('common.close')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
