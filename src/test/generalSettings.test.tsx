// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeneralSettings } from '../components/settings/sections/GeneralSettings';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

import { open } from '@tauri-apps/plugin-dialog';

describe('GeneralSettings', () => {
  beforeEach(() => {
    useAppStore.setState({ appLanguage: 'de', scannedVrms: [], scannedLive2ds: [] });
    vi.clearAllMocks();
  });

  it('allows importing legacy Soul of Waifu data', async () => {
    vi.mocked(open).mockResolvedValue('/path/to/legacy');
    vi.mocked(api.runLegacyMigration).mockResolvedValue('Migration erfolgreich.');

    render(<GeneralSettings />);

    const btn = screen.getByRole('button', { name: /Migration \(Soul of Waifu\)/i });
    expect(btn).toBeInTheDocument();
    
    fireEvent.click(btn);

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        title: 'Soul of Waifu Installationsverzeichnis auswählen',
      });
    });

    await waitFor(() => {
      expect(api.runLegacyMigration).toHaveBeenCalledWith('/path/to/legacy');
    });
  });
});
