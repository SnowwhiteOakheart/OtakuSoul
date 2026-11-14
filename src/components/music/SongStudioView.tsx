import { useCallback, useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  ChevronDown,
  FolderOpen,
  Loader2,
  Music,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Undo2,
  Wand2,
} from 'lucide-react';
import { api } from '../../services/api';
import { useTranslation, type TranslationKey } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { confirmDialog, toast } from '../ui/feedback';
import { MusicModelPicker, useMusicModels } from './MusicModelPicker';
import { useSongJob } from './songJobStore';
import type { SongEntry, SongFolder } from '../../types';
import { DEFAULT_DRAFT, INSTRUMENTAL, fromRequest, loadDraft, saveDraft, toRequest, type SongDraft } from './songDraft';

/** Languages ACE-Step's language model sings in (`music_gen::language_name`). */
const VOCAL_LANGUAGES = ['en', 'de', 'ja', 'fr', 'es', 'it', 'pt', 'ko', 'zh', 'ru'];
const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const KEYS = NOTES.flatMap((note) => [`${note} major`, `${note} minor`]);
const TIME_SIGNATURES = ['2', '3', '4', '6'];
const STRUCTURE_TAGS = ['[Intro]', '[Verse]', '[Pre-Chorus]', '[Chorus]', '[Bridge]', '[Outro]'];
const CAPTION_IDEAS = [
  'j-pop, upbeat, bright synths, female vocals, catchy chorus',
  'lofi hip hop, mellow piano, vinyl crackle, relaxed',
  'epic orchestral, choir, taiko drums, cinematic',
  'synthwave, retro 80s, driving bass, neon night drive',
  'acoustic folk, guitar, warm male vocals, campfire',
  'anime opening, energetic rock, electric guitars, powerful vocals',
  'ambient, soft pads, dreamy, slow, no drums',
];

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-60';
const labelClass = 'block text-xs font-semibold text-slate-300';

/**
 * Song Studio: the user's own songs with ACE-Step (the same local engine as the story music),
 * from style prompt, lyrics and fine tuning into a folder of their choice, with a song list.
 */
export const SongStudioView = () => {
  const { t } = useTranslation();
  const music = useMusicModels();
  const { running, progress, finishedRuns, start } = useSongJob();
  const [draft, setDraft] = useState<SongDraft>(loadDraft);
  const [advanced, setAdvanced] = useState(false);
  const [folder, setFolder] = useState<SongFolder | null>(null);
  const [songs, setSongs] = useState<SongEntry[] | null>(null);
  const lyricsRef = useRef<HTMLTextAreaElement>(null);

  const update = (patch: Partial<SongDraft>) =>
    setDraft((current) => {
      const next = { ...current, ...patch };
      saveDraft(next);
      return next;
    });

  const refreshSongs = useCallback(
    () =>
      api
        .listSongs()
        .then(setSongs)
        .catch(() => setSongs([])),
    [],
  );

  useEffect(() => {
    void api.getSongFolder().then(setFolder).catch(() => setFolder(null));
  }, []);
  useEffect(() => {
    void refreshSongs();
  }, [refreshSongs, finishedRuns]);

  const chooseFolder = async () => {
    const picked = await open({ directory: true, defaultPath: folder?.path });
    if (typeof picked !== 'string') return;
    try {
      setFolder(await api.setSongFolder(picked));
      void refreshSongs();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const resetFolder = async () => {
    try {
      setFolder(await api.setSongFolder(null));
      void refreshSongs();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const insertTag = (tag: string) => {
    const area = lyricsRef.current;
    const text = draft.lyrics;
    const at = area?.selectionStart ?? text.length;
    const before = text.slice(0, at);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const inserted = `${prefix}${tag}\n`;
    update({ lyrics: before + inserted + text.slice(at) });
    requestAnimationFrame(() => {
      area?.focus();
      const cursor = at + inserted.length;
      area?.setSelectionRange(cursor, cursor);
    });
  };

  const reuse = (song: SongEntry) => {
    if (!song.request) return;
    const next = fromRequest(song.request, song.seed);
    saveDraft(next);
    setDraft(next);
    toast.success(t('songStudio.reused', { title: song.title }));
  };

  const generate = () => {
    if (!music.chosen) return;
    void start(toRequest(draft, music.chosen.id));
  };

  const canGenerate =
    music.ready && !running && draft.caption.trim().length > 0 && (draft.lyricsMode !== 'own' || draft.lyrics.trim().length > 0);

  const phase = running ? progress?.phase : null;
  const phaseText = phase
    ? progress && progress.track > 0 && ['composing', 'rendering', 'saved'].includes(phase)
      ? t('songStudio.progress', {
          track: progress.track,
          total: progress.total,
          phase: t(`musicGen.phase.${phase}` as TranslationKey),
        })
      : t(`musicGen.phase.${phase}` as TranslationKey)
    : null;

  return (
    <div className="flex-1 flex flex-col h-full bg-app overflow-hidden" data-testid="song-studio">
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center gap-3 select-none">
        <div className="w-10 h-10 rounded-xl bg-linear-to-tr from-accent-600/30 to-fuchsia-600/30 border border-accent-500/40 flex items-center justify-center text-accent-300">
          <Music className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-100">{t('songStudio.title')}</h1>
          <p className="text-xs text-slate-400">{t('songStudio.subtitle')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Form */}
          <section className="space-y-5" aria-label={t('songStudio.formLabel')}>
            <div className="space-y-1.5">
              <label htmlFor="song-title" className={labelClass}>{t('songStudio.songTitle')}</label>
              <input
                id="song-title"
                value={draft.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder={t('songStudio.songTitlePlaceholder')}
                disabled={running}
                className={inputClass}
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="song-caption" className={labelClass}>{t('songStudio.caption')}</label>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => update({ caption: CAPTION_IDEAS[Math.floor(Math.random() * CAPTION_IDEAS.length)] })}
                  className="flex items-center gap-1 text-xs text-accent-300 hover:text-accent-200 disabled:opacity-50"
                >
                  <Wand2 className="w-3.5 h-3.5" /> {t('songStudio.captionIdea')}
                </button>
              </div>
              <textarea
                id="song-caption"
                value={draft.caption}
                onChange={(e) => update({ caption: e.target.value })}
                placeholder={t('songStudio.captionPlaceholder')}
                disabled={running}
                rows={3}
                className={inputClass}
                data-testid="song-caption"
              />
              <p className="text-[11px] text-slate-500">{t('songStudio.captionHint')}</p>
            </div>

            <fieldset className="space-y-2">
              <legend className={labelClass}>{t('songStudio.lyrics')}</legend>
              <div role="radiogroup" className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-app/80 p-1 w-fit">
                {(['auto', 'own', 'instrumental'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={draft.lyricsMode === mode}
                    disabled={running}
                    onClick={() => update({ lyricsMode: mode })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      draft.lyricsMode === mode ? 'bg-accent-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {t(`songStudio.lyricsMode.${mode}` as TranslationKey)}
                  </button>
                ))}
              </div>
              {draft.lyricsMode === 'own' && (
                <>
                  <div className="flex flex-wrap gap-1">
                    {STRUCTURE_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        disabled={running}
                        onClick={() => insertTag(tag)}
                        className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300 hover:bg-slate-700"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  <textarea
                    ref={lyricsRef}
                    value={draft.lyrics}
                    onChange={(e) => update({ lyrics: e.target.value })}
                    placeholder={t('songStudio.lyricsPlaceholder')}
                    aria-label={t('songStudio.lyrics')}
                    disabled={running}
                    rows={10}
                    className={`${inputClass} font-mono text-xs leading-relaxed`}
                  />
                </>
              )}
              <p className="text-[11px] text-slate-500">{t(`songStudio.lyricsHint.${draft.lyricsMode}` as TranslationKey)}</p>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              {draft.lyricsMode !== 'instrumental' && (
                <div className="space-y-1.5">
                  <label htmlFor="song-language" className={labelClass}>{t('songStudio.vocalLanguage')}</label>
                  <select
                    id="song-language"
                    value={draft.vocalLanguage}
                    onChange={(e) => update({ vocalLanguage: e.target.value })}
                    disabled={running}
                    className={inputClass}
                  >
                    <option value="">{t('songStudio.auto')}</option>
                    {VOCAL_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {t(`songStudio.language.${code}` as TranslationKey)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="song-duration" className={labelClass}>
                  {t('songStudio.duration')} <span className="font-mono text-accent-300">{formatDuration(draft.duration)}</span>
                </label>
                <input
                  id="song-duration"
                  type="range"
                  min={10}
                  max={600}
                  step={5}
                  value={draft.duration}
                  onChange={(e) => update({ duration: e.currentTarget.valueAsNumber })}
                  disabled={running}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-accent-500"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="song-bpm" className={labelClass}>{t('songStudio.bpm')}</label>
                <input
                  id="song-bpm"
                  type="number"
                  min={30}
                  max={300}
                  value={draft.bpm ?? ''}
                  placeholder={t('songStudio.auto')}
                  onChange={(e) => {
                    const value = e.currentTarget.valueAsNumber;
                    update({ bpm: Number.isFinite(value) ? Math.round(value) : null });
                  }}
                  disabled={running}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="song-versions" className={labelClass}>{t('songStudio.versions')}</label>
                <select
                  id="song-versions"
                  value={draft.versions}
                  onChange={(e) => update({ versions: Number(e.target.value) })}
                  disabled={running}
                  className={inputClass}
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800">
              <button
                type="button"
                aria-expanded={advanced}
                onClick={() => setAdvanced((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300"
              >
                {t('songStudio.advanced')}
                <ChevronDown className={`w-4 h-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
              </button>
              {advanced && (
                <div className="grid gap-4 border-t border-slate-800 p-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="song-key" className={labelClass}>{t('songStudio.key')}</label>
                    <select id="song-key" value={draft.keyscale} onChange={(e) => update({ keyscale: e.target.value })} disabled={running} className={inputClass}>
                      <option value="">{t('songStudio.auto')}</option>
                      {KEYS.map((key) => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="song-time" className={labelClass}>{t('songStudio.timeSignature')}</label>
                    <select id="song-time" value={draft.timesignature} onChange={(e) => update({ timesignature: e.target.value })} disabled={running} className={inputClass}>
                      <option value="">{t('songStudio.auto')}</option>
                      {TIME_SIGNATURES.map((ts) => (
                        <option key={ts} value={ts}>{`${ts}/4`}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="song-steps" className={labelClass}>{t('songStudio.steps')}</label>
                    <input
                      id="song-steps"
                      type="number"
                      min={1}
                      max={200}
                      value={draft.steps ?? ''}
                      placeholder="50"
                      onChange={(e) => {
                        const value = e.currentTarget.valueAsNumber;
                        update({ steps: Number.isFinite(value) ? Math.round(value) : null });
                      }}
                      disabled={running}
                      className={inputClass}
                    />
                    <p className="text-[11px] text-slate-500">{t('songStudio.stepsHint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="song-temperature" className={labelClass}>
                      {t('songStudio.variance')} <span className="font-mono text-accent-300">{(draft.temperature ?? 0.85).toFixed(2)}</span>
                    </label>
                    <input
                      id="song-temperature"
                      type="range"
                      min={0.3}
                      max={1.2}
                      step={0.05}
                      value={draft.temperature ?? 0.85}
                      onChange={(e) => update({ temperature: e.currentTarget.valueAsNumber })}
                      disabled={running}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-accent-500"
                    />
                    <p className="text-[11px] text-slate-500">{t('songStudio.varianceHint')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="song-seed" className={labelClass}>{t('songStudio.seed')}</label>
                    <input
                      id="song-seed"
                      inputMode="numeric"
                      value={draft.seed}
                      placeholder={t('songStudio.seedRandom')}
                      onChange={(e) => update({ seed: e.target.value.replace(/\D/g, '') })}
                      disabled={running}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={running}
                      onClick={() =>
                        update({
                          duration: DEFAULT_DRAFT.duration,
                          bpm: null,
                          keyscale: '',
                          timesignature: '',
                          seed: '',
                          steps: null,
                          temperature: null,
                          versions: 1,
                        })
                      }
                      className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700 disabled:opacity-60"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> {t('songStudio.resetSettings')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 rounded-xl border border-accent-500/25 bg-accent-950/20 p-3">
              <p className="text-xs font-semibold text-accent-200">{t('musicGen.model')}</p>
              <MusicModelPicker music={music} disabled={running} />
            </div>

            <div className="space-y-1.5">
              <p className={labelClass}>{t('songStudio.folder')}</p>
              <p className="break-all rounded-lg bg-slate-900/70 px-3 py-2 font-mono text-[11px] text-slate-300" data-testid="song-folder">
                {folder?.path ?? '…'}
                {folder?.is_default && <span className="ml-2 font-sans text-slate-500">({t('songStudio.folderDefault')})</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void chooseFolder()} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">
                  <FolderOpen className="w-3.5 h-3.5" /> {t('songStudio.folderChoose')}
                </button>
                {!folder?.is_default && (
                  <button type="button" onClick={() => void resetFolder()} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700">
                    <RotateCcw className="w-3.5 h-3.5" /> {t('songStudio.folderReset')}
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                data-testid="song-generate"
                disabled={!canGenerate}
                onClick={generate}
                className="flex items-center gap-1.5 rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500 disabled:bg-slate-800 disabled:text-slate-400"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {draft.versions > 1 ? t('songStudio.generateMany', { count: draft.versions }) : t('songStudio.generate')}
              </button>
              {running && (
                <button
                  type="button"
                  onClick={() => void api.cancelMusicGeneration()}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-sm font-semibold hover:bg-slate-700"
                >
                  <Square className="w-3.5 h-3.5" /> {t('musicGen.stop')}
                </button>
              )}
            </div>
            {phaseText && (
              <p className="text-xs text-slate-300" role="status" aria-live="polite">
                {phaseText}
              </p>
            )}
            <p className="text-[11px] text-slate-500">{t('musicGen.hint')}</p>
          </section>

          {/* Song list */}
          <SongList songs={songs} onRefresh={refreshSongs} onReuse={reuse} />
        </div>
      </div>
    </div>
  );
};

interface SongListProps {
  songs: SongEntry[] | null;
  onRefresh: () => Promise<void>;
  onReuse: (song: SongEntry) => void;
}

const SongList = ({ songs, onRefresh, onReuse }: SongListProps) => {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [openLyrics, setOpenLyrics] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const toggle = async (song: SongEntry) => {
    if (playing === song.path) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    try {
      const bytes = await api.readFileBinary(song.path);
      const type = song.file_name.toLowerCase().endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
      setAudioUrl(URL.createObjectURL(new Blob([bytes as BlobPart], { type })));
      setPlaying(song.path);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  useEffect(() => {
    if (audioUrl && audioRef.current) void audioRef.current.play().catch(() => setPlaying(null));
  }, [audioUrl]);

  const remove = async (song: SongEntry) => {
    const ok = await confirmDialog({
      title: t('songStudio.deleteTitle'),
      message: t('songStudio.deleteMessage', { title: song.title }),
      confirmLabel: t('songStudio.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    if (playing === song.path) {
      audioRef.current?.pause();
      setPlaying(null);
    }
    try {
      await api.deleteSong(song.file_name);
      await onRefresh();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <section className="space-y-3" aria-label={t('songStudio.library')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-200">{t('songStudio.library')}</h2>
        <div className="flex gap-1">
          <button type="button" onClick={() => void onRefresh()} title={t('songStudio.refresh')} aria-label={t('songStudio.refresh')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => void api.openSongFolder()} title={t('songStudio.folderOpen')} aria-label={t('songStudio.folderOpen')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <FolderOpen className="w-4 h-4" />
          </button>
        </div>
      </div>
      <audio ref={audioRef} src={audioUrl ?? undefined} onEnded={() => setPlaying(null)} controls={!!playing} className={playing ? 'w-full' : 'hidden'}>
        {/* Generated music has no captions; the lyrics are shown below each song. */}
        <track kind="captions" />
      </audio>
      {songs === null ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      ) : songs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-800 p-4 text-xs text-slate-500">{t('songStudio.empty')}</p>
      ) : (
        <ul className="space-y-2" data-testid="song-list">
          {songs.map((song) => (
            <li key={song.path} className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggle(song)}
                  aria-label={playing === song.path ? t('songStudio.pause') : t('songStudio.play')}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white hover:bg-accent-500"
                >
                  {playing === song.path ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100" title={song.file_name}>{song.title}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {new Date(song.modified * 1000).toLocaleString()}
                    {song.request?.caption ? ` · ${song.request.caption}` : ''}
                  </p>
                </div>
                {song.request && (
                  <button type="button" onClick={() => onReuse(song)} title={t('songStudio.reuse')} aria-label={t('songStudio.reuse')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
                    <Undo2 className="w-4 h-4" />
                  </button>
                )}
                <button type="button" onClick={() => void remove(song)} title={t('songStudio.delete')} aria-label={t('songStudio.delete')} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-950/50 hover:text-red-300">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {song.lyrics && song.lyrics !== INSTRUMENTAL && (
                <button
                  type="button"
                  onClick={() => setOpenLyrics(openLyrics === song.path ? null : song.path)}
                  className="mt-1 text-[11px] text-accent-300 hover:text-accent-200"
                  aria-expanded={openLyrics === song.path}
                >
                  {openLyrics === song.path ? t('songStudio.hideLyrics') : t('songStudio.showLyrics')}
                </button>
              )}
              {openLyrics === song.path && (
                <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg bg-app/80 p-2 font-sans text-xs text-slate-300">{song.lyrics}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
