import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Ban, CheckCircle2, Clock, ListChecks, Loader2, RotateCcw, X, XCircle } from 'lucide-react';
import { api } from '../services/api';
import { useAppStore, useStoreFields } from '../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../i18n';
import type { BackgroundTask, TaskStatus } from '../store/slices/taskSlice';

const ACTION_BUTTON_CLASS =
  'relative flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/70 p-1.5 text-xs text-slate-400 outline-hidden transition-colors hover:border-accent-500/40 hover:text-accent-200 focus-visible:ring-2 focus-visible:ring-accent-400';
const SMALL_BUTTON =
  'inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400';

/** Image phases before the picture is drawn: the task waits for VRAM, and says why. */
const IMAGE_WAIT_PHASES = ['planning', 'unloading_tts', 'unloading_llm', 'reducing_llm', 'loading_model'];

const STATUS_ICON: Record<TaskStatus, ReactNode> = {
  running: <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-300" aria-hidden />,
  waiting: <Clock className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />,
  done: <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />,
  failed: <XCircle className="h-4 w-4 shrink-0 text-rose-400" aria-hidden />,
  cancelled: <Ban className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />,
};

const isActive = (task: BackgroundTask) => task.status === 'running' || task.status === 'waiting';

/** Feeds progress and image phases from backend events into the task list. */
const useTaskEvents = () => {
  useEffect(() => {
    let isSubscribed = true;
    const unlisteners: Array<() => void> = [];
    const keep = (unlisten: (() => void) | undefined) => {
      if (typeof unlisten !== 'function') return;
      if (isSubscribed) unlisteners.push(unlisten);
      else unlisten();
    };
    const progress = (data: { model_id: string; percent: number }) =>
      useAppStore.getState().setTaskProgress(data.model_id, data.percent);

    void api.onImageModelProgress(progress).then(keep).catch(() => undefined);
    void api.onTtsModelProgress(progress).then(keep).catch(() => undefined);
    void api
      .onLocalImageStatus(({ phase }) => {
        if (phase === 'done' || phase === 'failed') return;
        const waiting = IMAGE_WAIT_PHASES.includes(phase);
        useAppStore.getState().updateActiveTasks('image', {
          status: waiting ? 'waiting' : 'running',
          detail: translate(`localImage.phase.${phase}` as TranslationKey),
        });
      })
      .then(keep)
      .catch(() => undefined);

    return () => {
      isSubscribed = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
};

const TaskRow = ({ task }: { task: BackgroundTask }) => {
  const { t } = useTranslation();
  const downloadProgress = useAppStore((s) => (task.progressKey ? s.downloadProgress[task.progressKey]?.percent : undefined));
  const progress = task.progress ?? (isActive(task) ? downloadProgress : undefined);
  const statusLabel = t(`task.status.${task.status}` as TranslationKey);

  return (
    <li className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/70 p-2.5" data-task-status={task.status}>
      <div className="flex items-start gap-2">
        {STATUS_ICON[task.status]}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-100" title={task.title}>{task.title}</p>
          <p className="text-[11px] text-slate-400">
            {statusLabel}
            {task.status === 'waiting' && task.detail ? ` – ${task.detail}` : ''}
            {task.status === 'running' && task.detail ? ` – ${task.detail}` : ''}
          </p>
        </div>
      </div>
      {isActive(task) && typeof progress === 'number' && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label={task.title}
          className="h-1.5 overflow-hidden rounded-full bg-slate-800"
        >
          <div className="h-full bg-accent-500 transition-all" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      )}
      {task.status === 'failed' && task.error && <p className="text-[11px] text-rose-300 break-words">{task.error}</p>}
      {((isActive(task) && task.cancel) || ((task.status === 'failed' || task.status === 'cancelled') && task.retry)) && (
        <div className="flex justify-end gap-1.5">
          {isActive(task) && task.cancel && (
            <button type="button" onClick={task.cancel} className={SMALL_BUTTON}>
              <X className="h-3 w-3" />
              {t('task.cancel')}
            </button>
          )}
          {(task.status === 'failed' || task.status === 'cancelled') && task.retry && (
            <button type="button" onClick={task.retry} className={SMALL_BUTTON}>
              <RotateCcw className="h-3 w-3" />
              {t('task.retry')}
            </button>
          )}
        </div>
      )}
    </li>
  );
};

/**
 * One place for everything that runs in the background: downloads, reflection, summaries,
 * images and model loading. The header button appears once there is a task and counts the
 * active ones; failures since the list was last opened mark it red.
 */
export const TaskCenter = () => {
  const { t } = useTranslation();
  const { tasks, clearFinishedTasks } = useStoreFields('tasks', 'clearFinishedTasks');
  const [open, setOpen] = useState(false);
  const [seenFailures, setSeenFailures] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useTaskEvents();

  const active = tasks.filter(isActive).length;
  const failures = tasks.filter((task) => task.status === 'failed').length;
  // Failures shown in the open list count as seen.
  const hasNewFailure = !open && failures > seenFailures;
  const toggle = (next: boolean) => {
    setSeenFailures(useAppStore.getState().tasks.filter((task) => task.status === 'failed').length);
    setOpen(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && toggle(false);
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) toggle(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (tasks.length === 0) return null;

  const label = active > 0 ? t('task.openActive', { count: active }) : t('task.open');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => toggle(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        title={label}
        className={ACTION_BUTTON_CLASS}
      >
        {active > 0 ? <Loader2 className="h-4 w-4 animate-spin text-accent-300" /> : <ListChecks className="h-4 w-4" />}
        {active > 0 && <span className="font-mono text-accent-200">{active}</span>}
        {hasNewFailure && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-slate-900" aria-hidden />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('task.title')}
          className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-950/95 p-3 shadow-2xl backdrop-blur space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">{t('task.title')}</h2>
            {tasks.length > active && (
              <button type="button" onClick={clearFinishedTasks} className={SMALL_BUTTON}>
                {t('task.clear')}
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto" aria-label={t('task.title')}>
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
