import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Download, Loader2, MessageCircle, Play, Trash2, Wand2, X } from 'lucide-react';
import { api } from '../../services/api';
import { guessPlacement, talkingSet, TALKING_PORTRAIT_EVENT } from '../../services/talkingPortrait';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { toast } from '../ui/feedback';
import { ModalOverlay } from '../ui/ModalOverlay';
import type { HeadPlacement } from '../../types/generated/HeadPlacement';
import type { TalkingPortraitStatus } from '../../types/generated/TalkingPortraitStatus';
import type { TalkingSet } from '../../types/generated/TalkingSet';

const PREVIEW_FRAMES = ['aa', 'ih', 'ou', 'ee', 'oh', 'blink'] as const;
const DEFAULT_PLACEMENT: HeadPlacement = { top: 0.02, chin: 0.48, center_x: 0.5 };

/**
 * Sets up the speaking portrait of a character: loads the models (THA3, anime-seg), lets the
 * user frame the head (hair top to chin) on the picture, makes the frames and shows them.
 */
export function TalkingPortraitDialog({ characterId, name, src, onClose }: { characterId: string; name: string; src: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TalkingPortraitStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [placement, setPlacement] = useState<HeadPlacement>(DEFAULT_PLACEMENT);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<TalkingSet | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const pictureRef = useRef<HTMLDivElement>(null);
  /** Height over width of the picture, to draw the head frame in the right proportions. */
  const [aspect, setAspect] = useState(1.25);

  useEffect(() => {
    void api.talkingPortraitStatus().then(setStatus).catch(() => {});
    void api.getTalkingPortraitPlacement(characterId).then((found) => {
      if (found) {
        setPlacement(found);
        setSaved(true);
      }
    });
    const stop = listen<{ done: number; total: number }>('talking-portrait-download', ({ payload }) =>
      setProgress(payload.total ? payload.done / payload.total : null),
    );
    return () => void stop.then((unlisten) => unlisten());
  }, [characterId]);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    try {
      await action();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const download = () =>
    run('download', async () => {
      setStatus(await api.downloadTalkingPortraitModels());
      setProgress(null);
    });

  const guess = () => run('guess', async () => setPlacement(await guessPlacement(src)));

  const make = () =>
    run('make', async () => {
      const set = await talkingSet(src, placement);
      setPreview(set);
      setFrame('aa');
    });

  const save = () =>
    run('save', async () => {
      await api.setTalkingPortraitPlacement(characterId, placement);
      setSaved(true);
      window.dispatchEvent(new CustomEvent(TALKING_PORTRAIT_EVENT, { detail: characterId }));
      toast.success(translate('talkingPortrait.saved', { name }));
    });

  const remove = () =>
    run('remove', async () => {
      await api.setTalkingPortraitPlacement(characterId, null);
      setSaved(false);
      setPreview(null);
      window.dispatchEvent(new CustomEvent(TALKING_PORTRAIT_EVENT, { detail: characterId }));
    });

  /** Dragging a line of the head frame (top, chin) or the frame itself (centre). */
  const drag = (part: 'top' | 'chin' | 'move') => (event: React.PointerEvent) => {
    event.preventDefault();
    const box = pictureRef.current?.getBoundingClientRect();
    if (!box) return;
    const start = { x: event.clientX, y: event.clientY, placement };
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - start.x) / box.width;
      const dy = (e.clientY - start.y) / box.height;
      const p = start.placement;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      setPreview(null);
      if (part === 'top') setPlacement({ ...p, top: clamp(Math.min(p.top + dy, p.chin - 0.05)) });
      else if (part === 'chin') setPlacement({ ...p, chin: clamp(Math.max(p.chin + dy, p.top + 0.05)) });
      else setPlacement({ top: clamp(p.top + dy), chin: clamp(p.chin + dy), center_x: clamp(p.center_x + dx) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ready = !!status?.ready;
  const shown = preview && frame ? preview.frames[frame] : undefined;
  // The frame drawn as a box: as wide as about 0.85 of its height (head with hair), in shares
  // of the picture's width.
  const height = placement.chin - placement.top;
  const width = Math.min(1, height * aspect * 0.85);

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4" data-talking-portrait-dialog>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-accent-400" aria-hidden />
              {t('talkingPortrait.title', { name })}
            </h2>
            <p className="text-xs text-slate-400 mt-1">{t('talkingPortrait.intro')}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close' as TranslationKey)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!ready && status && (
          <div className="rounded-xl border border-slate-800 bg-app p-3 text-xs space-y-2">
            <p className="text-slate-300">{t('talkingPortrait.models', { size: Math.round(status.missing_bytes / 1024 / 1024) })}</p>
            <p className="text-slate-500">{status.licenses.join(' · ')}</p>
            <button type="button" disabled={busy !== null} onClick={() => void download()} className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white font-semibold flex items-center gap-1.5">
              {busy === 'download' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {busy === 'download' && progress !== null ? `${Math.round(progress * 100)} %` : t('talkingPortrait.download')}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-2">{t('talkingPortrait.frameHint')}</p>
            <div ref={pictureRef} className="relative select-none touch-none rounded-xl overflow-hidden border border-slate-800">
              <img src={src} alt={name} draggable={false} className="block w-full h-auto" onLoad={(e) => setAspect(e.currentTarget.naturalHeight / Math.max(1, e.currentTarget.naturalWidth))} />
              {shown && preview && (
                <img
                  src={shown.image}
                  alt=""
                  className="absolute pointer-events-none"
                  style={{
                    left: `${(shown.x / preview.width) * 100}%`,
                    top: `${(shown.y / preview.height) * 100}%`,
                    width: `${(shown.width / preview.width) * 100}%`,
                    height: `${(shown.height / preview.height) * 100}%`,
                  }}
                />
              )}
              {!preview && (
                <div
                  data-head-frame
                  onPointerDown={drag('move')}
                  className="absolute border-2 border-accent-400 bg-accent-400/10 cursor-move"
                  style={{
                    top: `${placement.top * 100}%`,
                    height: `${height * 100}%`,
                    left: `${(placement.center_x - width / 2) * 100}%`,
                    width: `${width * 100}%`,
                  }}
                >
                  <div onPointerDown={drag('top')} className="absolute -top-1.5 inset-x-0 h-3 cursor-ns-resize" aria-label={t('talkingPortrait.top')} />
                  <div onPointerDown={drag('chin')} className="absolute -bottom-1.5 inset-x-0 h-3 cursor-ns-resize" aria-label={t('talkingPortrait.chin')} />
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-accent-200 whitespace-nowrap">{t('talkingPortrait.chin')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2 md:w-48 text-xs">
            <button type="button" disabled={!ready || busy !== null} onClick={() => void guess()} className="w-full px-3 py-1.5 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-1.5">
              {busy === 'guess' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {t('talkingPortrait.guess')}
            </button>
            <button type="button" disabled={!ready || busy !== null} onClick={() => void make()} className="w-full px-3 py-1.5 rounded-lg border border-accent-500/60 text-accent-100 hover:bg-accent-900/40 disabled:opacity-40 flex items-center justify-center gap-1.5">
              {busy === 'make' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {t(busy === 'make' ? 'talkingPortrait.making' : 'talkingPortrait.make')}
            </button>
            {preview && (
              <div className="flex flex-wrap gap-1" role="group" aria-label={t('talkingPortrait.preview')}>
                {PREVIEW_FRAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    disabled={!(name in preview.frames)}
                    aria-pressed={frame === name}
                    onClick={() => setFrame(name)}
                    className={`px-2 py-1 rounded-md border text-[11px] disabled:opacity-30 ${frame === name ? 'border-accent-400 bg-accent-600 text-white' : 'border-slate-700 text-slate-300'}`}
                  >
                    {name}
                  </button>
                ))}
                <button type="button" onClick={() => setPreview(null)} className="px-2 py-1 rounded-md border border-slate-700 text-[11px] text-slate-300">
                  {t('talkingPortrait.editFrame')}
                </button>
              </div>
            )}
            <button type="button" disabled={!ready || busy !== null} onClick={() => void save()} className="w-full px-3 py-2 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-40 text-white font-bold">
              {t('talkingPortrait.save')}
            </button>
            {saved && (
              <button type="button" disabled={busy !== null} onClick={() => void remove()} className="w-full px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-rose-300 flex items-center justify-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                {t('talkingPortrait.remove')}
              </button>
            )}
            <p className="text-[11px] text-slate-500">{t('talkingPortrait.tips')}</p>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
