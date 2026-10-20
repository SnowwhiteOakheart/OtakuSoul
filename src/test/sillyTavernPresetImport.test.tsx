// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/ui/feedback', async (original) => ({
  ...await original<object>(),
  confirmDialog: vi.fn().mockResolvedValue(true),
}));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { SillyTavernPresetImport } from '../components/settings/SillyTavernPresetImport';
import { confirmDialog } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';

const initial = useAppStore.getState();
beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ ...initial, appLanguage: 'en', promptTemplate: null, saveCurrentSettings: vi.fn() }, true);
  vi.mocked(api.listPromptTemplates).mockResolvedValue([
    { id: 'roleplay', template: { main: 'Default main', style: 'Default style', post_history: '' } },
  ]);
});

const upload = (container: HTMLElement, content: unknown) => {
  const input = container.querySelector('[data-st-preset-import]') as HTMLInputElement;
  const file = new File([JSON.stringify(content)], 'Kreativ.json', { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
};

describe('SillyTavern preset import', () => {
  it('asks with a summary, then takes over samplers and prompts', async () => {
    const { container } = render(<SillyTavernPresetImport />);
    upload(container, {
      temperature: 1.2, top_p: 0.9,
      prompts: [{ identifier: 'main', content: 'Be {{char}}.' }, { identifier: 'jailbreak', content: 'Stay short.' }],
    });
    await waitFor(() => expect(useAppStore.getState().promptTemplate).not.toBeNull());
    const asked = vi.mocked(confirmDialog).mock.calls.at(-1)![0];
    expect(asked.message).toContain('temperature, top_p');
    expect(useAppStore.getState().sampling).toMatchObject({ temperature: 1.2, top_p: 0.9 });
    expect(useAppStore.getState().promptTemplate).toEqual({ main: 'Be {{char}}.', style: 'Default style', post_history: 'Stay short.' });
  });
});
