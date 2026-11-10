// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VolumePopover } from '../components/ui/VolumePopover';
import { stageMusic } from '../services/stageMusic';
import { audioPlayer } from '../services/audioPlayer';
import { soundFx } from '../services/soundFx';

describe('VolumePopover', () => {
  beforeEach(() => {
    stageMusic.setVolume(0.6);
    audioPlayer.setVolume(1.0);
    soundFx.setVolume(0.5);
    soundFx.setMuted(false);
  });

  it('renders trigger button and opens popover on click', async () => {
    const user = userEvent.setup();
    render(<VolumePopover showSoundFx />);

    const trigger = screen.getByRole('button', { name: /Lautstärke/i });
    expect(trigger).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: /Lautstärke/i });
    expect(dialog).toBeInTheDocument();

    // Check sliders for Musik, Stimmen and Soundeffekte
    expect(screen.getByText('Musik')).toBeInTheDocument();
    expect(screen.getByText('Stimmen (TTS)')).toBeInTheDocument();
    expect(screen.getByText('Soundeffekte')).toBeInTheDocument();
  });

  it('changes music and tts volume via sliders', async () => {
    const user = userEvent.setup();
    render(<VolumePopover />);

    await user.click(screen.getByRole('button', { name: /Lautstärke/i }));

    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(2); // Musik, Stimmen

    // Change music slider to 80%
    fireEvent.change(sliders[0]!, { target: { value: '80' } });
    expect(stageMusic.getVolume()).toBeCloseTo(0.8);

    // Change voice slider to 40%
    fireEvent.change(sliders[1]!, { target: { value: '40' } });
    expect(audioPlayer.getVolume()).toBeCloseTo(0.4);
  });

  it('closes on Escape key', async () => {
    const user = userEvent.setup();
    render(<VolumePopover />);

    const trigger = screen.getByRole('button', { name: /Lautstärke/i });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
