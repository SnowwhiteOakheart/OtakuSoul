import type { SliceCreator } from '../storeTypes';
import { errorCode, errorMessage } from '../../utils/errors';

/** Long-running work the app does besides the chat itself. */
export type TaskKind = 'download' | 'reflection' | 'summary' | 'image' | 'model';
/** `waiting`: queued behind something else (model loading, VRAM being freed); `detail` says what. */
export type TaskStatus = 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';

export interface BackgroundTask {
  id: string;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  /** 0–100 when known. */
  progress?: number | null;
  /** What the task is doing or waiting for. */
  detail?: string | null;
  error?: string | null;
  startedAt: number;
  finishedAt?: number;
  /** Matches progress events: a download's file name or model id. */
  progressKey?: string;
  cancel?: () => void;
  retry?: () => void;
}

export type NewTask = Pick<BackgroundTask, 'kind' | 'title'> &
  Partial<Pick<BackgroundTask, 'status' | 'detail' | 'progress' | 'progressKey' | 'cancel' | 'retry'>>;

/** Finished tasks kept for the list; older ones drop out. */
const KEEP_FINISHED = 8;

export interface TaskSlice {
  tasks: BackgroundTask[];
  startTask: (task: NewTask) => string;
  updateTask: (id: string, patch: Partial<Omit<BackgroundTask, 'id'>>) => void;
  /** Updates the active tasks of a kind (events that don't know the task, e.g. image phases). */
  updateActiveTasks: (kind: TaskKind, patch: Partial<Omit<BackgroundTask, 'id'>>) => void;
  /** Progress events only know the file or model; they update the active task with that key. */
  setTaskProgress: (progressKey: string, progress: number) => void;
  endTask: (id: string, status: Exclude<TaskStatus, 'running' | 'waiting'>, error?: string) => void;
  clearFinishedTasks: () => void;
}

let taskCounter = 0;
const isActive = (task: BackgroundTask) => task.status === 'running' || task.status === 'waiting';

export const createTaskSlice: SliceCreator<TaskSlice> = (set) => ({
  tasks: [],

  startTask: (task) => {
    taskCounter += 1;
    const id = `task-${Date.now()}-${taskCounter}`;
    set((state) => ({ tasks: [{ status: 'running', ...task, id, startedAt: Date.now() }, ...state.tasks] }));
    return id;
  },

  updateTask: (id, patch) =>
    set((state) => ({ tasks: state.tasks.map((task) => (task.id === id && isActive(task) ? { ...task, ...patch } : task)) })),

  updateActiveTasks: (kind, patch) =>
    set((state) => ({ tasks: state.tasks.map((task) => (task.kind === kind && isActive(task) ? { ...task, ...patch } : task)) })),

  setTaskProgress: (progressKey, progress) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.progressKey === progressKey && isActive(task) ? { ...task, progress } : task)),
    })),

  endTask: (id, status, error) =>
    set((state) => {
      const tasks = state.tasks.map((task) =>
        task.id === id ? { ...task, status, error: error ?? null, finishedAt: Date.now(), progress: status === 'done' ? 100 : task.progress } : task,
      );
      const finished = tasks.filter((task) => !isActive(task)).slice(KEEP_FINISHED).map((task) => task.id);
      return { tasks: tasks.filter((task) => !finished.includes(task.id)) };
    }),

  clearFinishedTasks: () => set((state) => ({ tasks: state.tasks.filter(isActive) })),
});

/** A cancelled download reports itself as an error with a `…Cancelled` code. */
const wasCancelled = (error: unknown) => errorCode(error)?.code.endsWith('Cancelled') ?? false;

/**
 * Runs `work` as a background task: shown while it runs, then done, cancelled or failed (with
 * the error). The result and the error are passed through unchanged.
 */
export async function trackTask<T>(
  store: Pick<TaskSlice, 'startTask' | 'endTask'>,
  task: NewTask,
  work: (id: string) => Promise<T>,
): Promise<T> {
  const id = store.startTask(task);
  try {
    const result = await work(id);
    store.endTask(id, 'done');
    return result;
  } catch (error) {
    if (wasCancelled(error)) store.endTask(id, 'cancelled');
    else store.endTask(id, 'failed', errorMessage(error));
    throw error;
  }
}
