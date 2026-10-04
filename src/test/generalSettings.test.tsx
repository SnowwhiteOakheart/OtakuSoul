// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeneralSettings } from '../components/settings/sections/GeneralSettings';
import { useAppStore } from '../store/useAppStore';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

describe('GeneralSettings', () => {
  beforeEach(() => {
    useAppStore.setState({ appLanguage: 'de', scannedVrms: [], scannedLive2ds: [] });
    vi.clearAllMocks();
  });

  it('renders GeneralSettings sections and theme picker', () => {
    render(<GeneralSettings />);
    expect(screen.getByText('Farb-Theme')).toBeInTheDocument();
    expect(screen.getByText('System, Logs & Updates')).toBeInTheDocument();
    expect(screen.getByText('Standard-Avatare')).toBeInTheDocument();
  });
});
