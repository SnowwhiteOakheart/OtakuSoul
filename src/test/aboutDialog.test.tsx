// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AboutDialog } from '../components/AboutDialog';
import { APP_NAME } from '../constants/branding';

const mockOpenUrl = vi.fn();
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: (url: string) => mockOpenUrl(url),
}));

describe('AboutDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders app name, version, and highlight features', () => {
    const handleClose = vi.fn();
    render(<AboutDialog onClose={handleClose} />);

    expect(screen.getByRole('heading', { name: APP_NAME })).toBeInTheDocument();
    expect(screen.getByText('Kognitives Gedächtnis')).toBeInTheDocument();
    expect(screen.getByText('Stage-Rollenspiel')).toBeInTheDocument();
    expect(screen.getByText('VRM- & Live2D-Avatare')).toBeInTheDocument();
    expect(screen.getByText('Desktop-Companion')).toBeInTheDocument();
    expect(screen.getByText('Lokale & Cloud-KI')).toBeInTheDocument();
    expect(screen.getByText('Community Hub')).toBeInTheDocument();
  });

  it('renders credits for jofizcd/Soul-of-Waifu and GPLv3 notice', () => {
    const handleClose = vi.fn();
    render(<AboutDialog onClose={handleClose} />);

    expect(screen.getByText('Inspiration & Open-Source-Anerkennung')).toBeInTheDocument();
    expect(screen.getByText(/Soul of Waifu von jofizcd/i)).toBeInTheDocument();
    expect(screen.getByText(/GNU General Public License v3\.0/i)).toBeInTheDocument();
  });

  it('opens external link when clicking the Soul of Waifu button', () => {
    const handleClose = vi.fn();
    render(<AboutDialog onClose={handleClose} />);

    const sowButton = screen.getByRole('button', { name: /Soul-of-Waifu/i });
    fireEvent.click(sowButton);

    expect(mockOpenUrl).toHaveBeenCalledWith('https://github.com/jofizcd/Soul-of-Waifu');
  });

  it('triggers onClose when close button is clicked', () => {
    const handleClose = vi.fn();
    render(<AboutDialog onClose={handleClose} />);

    const closeBtn = screen.getByRole('button', { name: 'Über-Dialog schließen' });
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
