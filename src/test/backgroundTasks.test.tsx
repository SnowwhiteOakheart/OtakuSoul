// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { trackTask } from '../store/slices/taskSlice';
import { downloadImageModelTask } from '../services/downloadTasks';
import { TaskCenter } from '../components/TaskCenter';
import { resetApiMocks } from './mockApi';
import type { ServerStatus } from '../types';

const status = (state: ServerStatus['state'], error_message: string | null = null): ServerStatus => ({
  state,
  port: 48596,
  pid: null,
  model_name: null,
  error_message,
  recent_logs: [],
});

const tasks = () => useAppStore.getState().tasks;

describe('background tasks', () => {
  beforeEach(() => {
    resetApiMocks();
    vi.mocked(api.onImageModelProgress).mockResolvedValue(() => undefined);
    vi.mocked(api.onTtsModelProgress).mockResolvedValue(() => undefined);
    vi.mocked(api.onLocalImageStatus).mockResolvedValue(() => undefined);
    useAppStore.setState({ tasks: [] });
  });

  it('marks finished, failed and cancelled work and passes results and errors on', async () => {
    const store = useAppStore.getState();
    await expect(trackTask(store, { kind: 'summary', title: 'ok' }, async () => 42)).resolves.toBe(42);
    await expect(trackTask(store, { kind: 'reflection', title: 'bad' }, async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    const cancelled = JSON.stringify({ code: 'backend.localImage.downloadCancelled', params: {} });
    await expect(trackTask(store, { kind: 'download', title: 'stop' }, async () => Promise.reject(cancelled))).rejects.toBe(cancelled);

    const byTitle = Object.fromEntries(tasks().map((task) => [task.title, task]));
    expect(byTitle.ok?.status).toBe('done');
    expect(byTitle.bad).toMatchObject({ status: 'failed', error: 'boom' });
    expect(byTitle.stop?.status).toBe('cancelled');
  });

  it('keeps only the latest finished tasks but every active one', () => {
    const store = useAppStore.getState();
    const running = store.startTask({ kind: 'download', title: 'still running' });
    for (let i = 0; i < 12; i += 1) store.endTask(store.startTask({ kind: 'summary', title: `t${i}` }), 'done');
    expect(tasks().filter((task) => task.status === 'done')).toHaveLength(8);
    expect(tasks().some((task) => task.id === running)).toBe(true);
    useAppStore.getState().clearFinishedTasks();
    expect(tasks().map((task) => task.id)).toEqual([running]);
  });

  it('waits while the model loads and ends with the server status', async () => {
    vi.mocked(api.getLlamaServerStatus).mockResolvedValue(status('starting'));
    useAppStore.setState({ serverConfig: { ...useAppStore.getState().serverConfig, model_path: '/models/qwen3-8b.gguf' } });
    await useAppStore.getState().startServer();
    expect(tasks()[0]).toMatchObject({ kind: 'model', status: 'waiting', title: expect.stringContaining('qwen3-8b.gguf') });

    vi.mocked(api.getLlamaServerStatus).mockResolvedValue(status('failed', 'out of memory'));
    await useAppStore.getState().fetchServerStatus();
    expect(tasks()[0]).toMatchObject({ status: 'failed', error: 'out of memory' });
  });

  it('shows progress, cancels and retries a download from the list', async () => {
    let finish: (error?: unknown) => void = () => undefined;
    vi.mocked(api.downloadImageModel).mockImplementation(
      () => new Promise<void>((resolve, reject) => (finish = (error) => (error ? reject(error) : resolve()))),
    );
    const download = downloadImageModelTask('animagine', 'Animagine XL').catch(() => undefined);
    useAppStore.getState().setTaskProgress('animagine', 40);

    render(<TaskCenter />);
    await userEvent.click(screen.getByRole('button', { name: /Hintergrundaufgaben – 1 aktiv/ }));
    expect(screen.getByRole('progressbar', { name: 'Download: Animagine XL' })).toHaveAttribute('aria-valuenow', '40');

    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(api.cancelImageModelDownload).toHaveBeenCalled();
    finish(JSON.stringify({ code: 'backend.localImage.downloadCancelled', params: {} }));
    await download;

    expect(await screen.findByText(/Abgebrochen/)).toBeInTheDocument();
    vi.mocked(api.downloadImageModel).mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Wiederholen' }));
    expect(api.downloadImageModel).toHaveBeenCalledTimes(2);
  });
});
