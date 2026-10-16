// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sidebar } from '../components/Sidebar';

describe('Sidebar', () => {
  it('blendet Beschreibungen standardmäßig aus und merkt die Aktivierung', () => {
    localStorage.setItem('otakusoul.sidebarCollapsed', 'false');
    render(<Sidebar />);

    expect(screen.queryByText('Was möchtest du heute tun?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Beschreibungen zeigen' }));

    expect(screen.getByText('Was möchtest du heute tun?')).toBeInTheDocument();
    expect(localStorage.getItem('navHints')).toBe('true');
    expect(screen.getByRole('button', { name: 'Beschreibungen ausblenden' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('respektiert eine bereits gespeicherte Beschreibungseinstellung', () => {
    localStorage.setItem('otakusoul.sidebarCollapsed', 'false');
    localStorage.setItem('navHints', 'true');

    render(<Sidebar />);

    expect(screen.getByText('Was möchtest du heute tun?')).toBeInTheDocument();
  });
});
