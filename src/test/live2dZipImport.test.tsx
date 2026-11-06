// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { importLive2dPath } from '../components/avatars/avatarImport';
import { Live2dZipPickerHost } from '../components/avatars/Live2dZipPickerModal';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { Live2dZipCandidate, ScannedLive2d } from '../types';

const mikuCandidates: Live2dZipCandidate[] = [
  {
    entry_path: 'miku_pro/runtime/miku_sample_t04.model3.json',
    name: 'Miku Pro',
    model_file: 'miku_sample_t04.model3.json',
    version: 'cubism3_4',
    motion_count: 8,
  },
  {
    entry_path: 'miku_free/runtime/miku.model3.json',
    name: 'Miku Free',
    model_file: 'miku.model3.json',
    version: 'cubism3_4',
    motion_count: 8,
  },
];

const scanned = (id: string, name: string, file: string): ScannedLive2d => ({
  id,
  name,
  model_path: `/data/live2d/${id}/${file}`,
  preview_image: null,
  version: 'cubism3_4',
  removable: true,
  thumbnail: null,
});

beforeEach(() => {
  resetApiMocks();
  vi.mocked(api.scanLive2dModels).mockResolvedValue([]);
});

describe('Live2D multi-model ZIP import', () => {
  it('imports a single-model ZIP immediately without prompting', async () => {
    vi.mocked(api.inspectLive2dZip).mockResolvedValue([mikuCandidates[0]!]);
    vi.mocked(api.importLive2dModel).mockResolvedValue(
      scanned('miku_pro', 'Miku Pro', 'miku_sample_t04.model3.json'),
    );

    render(<Live2dZipPickerHost />);
    const result = await importLive2dPath('C:\\Downloads\\miku_single.zip');

    expect(result).toBe('/data/live2d/miku_pro/miku_sample_t04.model3.json');
    expect(api.importLive2dModel).toHaveBeenCalledWith(
      'C:\\Downloads\\miku_single.zip',
      'miku_pro/runtime/miku_sample_t04.model3.json',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks the user which model to import when a ZIP holds multiple variants', async () => {
    vi.mocked(api.inspectLive2dZip).mockResolvedValue(mikuCandidates);
    vi.mocked(api.importLive2dModel).mockResolvedValue(
      scanned('miku_free', 'Miku Free', 'miku.model3.json'),
    );

    render(<Live2dZipPickerHost />);
    let pendingResult: Promise<string | null>;
    await act(async () => {
      pendingResult = importLive2dPath('C:\\Users\\Sebas\\Downloads\\miku_ja.zip');
    });

    expect(screen.getByRole('heading', { name: 'Mehrere Live2D-Modelle gefunden' })).toBeInTheDocument();
    expect(screen.getByText(/miku_ja\.zip/)).toBeInTheDocument();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(radios[1]!);
    expect(radios[1]).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Auswahl importieren' }));
    });

    expect(await pendingResult!).toBe('/data/live2d/miku_free/miku.model3.json');
    expect(api.importLive2dModel).toHaveBeenCalledTimes(1);
    expect(api.importLive2dModel).toHaveBeenCalledWith(
      'C:\\Users\\Sebas\\Downloads\\miku_ja.zip',
      'miku_free/runtime/miku.model3.json',
    );
  });

  it('imports all variants when requested', async () => {
    vi.mocked(api.inspectLive2dZip).mockResolvedValue(mikuCandidates);
    vi.mocked(api.importLive2dModel)
      .mockResolvedValueOnce(scanned('miku_pro', 'Miku Pro', 'miku_sample_t04.model3.json'))
      .mockResolvedValueOnce(scanned('miku_free', 'Miku Free', 'miku.model3.json'));
    const ok = vi.spyOn(toast, 'success').mockImplementation(() => {});

    render(<Live2dZipPickerHost />);
    let pendingResult: Promise<string | null>;
    await act(async () => {
      pendingResult = importLive2dPath('/tmp/miku_ja.zip');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Alle importieren (2)' }));
    });

    expect(await pendingResult!).toBe('/data/live2d/miku_pro/miku_sample_t04.model3.json');
    expect(api.importLive2dModel).toHaveBeenCalledTimes(2);
    expect(ok).toHaveBeenCalledWith('2 Live2D-Modelle importiert.');
  });

  it('cancels cleanly without error toast when dismissed', async () => {
    vi.mocked(api.inspectLive2dZip).mockResolvedValue(mikuCandidates);
    const err = vi.spyOn(toast, 'error').mockImplementation(() => {});

    render(<Live2dZipPickerHost />);
    let pendingResult: Promise<string | null>;
    await act(async () => {
      pendingResult = importLive2dPath('/tmp/miku_ja.zip');
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    });

    expect(await pendingResult!).toBeNull();
    expect(api.importLive2dModel).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });
});
