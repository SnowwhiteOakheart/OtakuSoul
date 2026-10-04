// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/ui/feedback', async (original) => ({
  ...await original<object>(),
  confirmDialog: vi.fn().mockResolvedValue(true),
}));
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { LocalLoraSettings } from '../components/integrations/tabs/LocalLoraSettings';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { ImageGenConfig, LoraInfo } from '../types';

const MB = 1024 ** 2;
const lora = (over: Partial<LoraInfo>): LoraInfo => ({
  file: 'pastel-anime-xl-latest.safetensors',
  name: 'Pastel Anime XL',
  catalog_id: 'pastel-anime-xl',
  family: 'sdxl',
  installed: false,
  download_bytes: 188 * MB,
  license: 'CreativeML Open RAIL++-M',
  noncommercial: false,
  trigger: '',
  default_weight: 1,
  ...over,
});
const catalog = [
  lora({}),
  lora({ file: 'flux-ghibsky-illustration.safetensors', name: 'GHIBSKY', catalog_id: 'flux-ghibsky', family: 'flux', installed: true, noncommercial: true, trigger: 'GHIBSKY style', default_weight: 0.8 }),
  lora({ file: 'my-style.safetensors', name: 'my-style', catalog_id: null, family: null, installed: true, license: null }),
];
const config = { provider: 'local', local_model_id: 'animagine-xl-4', local_loras: [] } as unknown as ImageGenConfig;

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en' });
  vi.mocked(api.onImageModelProgress).mockResolvedValue(() => {});
  vi.mocked(api.listImageLoras).mockResolvedValue(catalog);
  vi.spyOn(toast, 'success').mockImplementation(() => {});
  vi.spyOn(toast, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('LocalLoraSettings', () => {
  it('shows the LoRAs of the model family and the own files', async () => {
    render(<LocalLoraSettings config={config} onChange={vi.fn()} family="sdxl" />);
    expect(await screen.findByText('Pastel Anime XL')).toBeInTheDocument();
    expect(screen.getByText('my-style')).toBeInTheDocument();
    expect(screen.getByText(/model family unknown/)).toBeInTheDocument();
    expect(screen.queryByText('GHIBSKY')).not.toBeInTheDocument();
    // Not downloaded yet: it can't be chosen.
    expect(screen.getByRole('checkbox', { name: /Pastel Anime XL/ })).toBeDisabled();
  });

  it('marks non-commercial LoRAs and their trigger word', async () => {
    render(<LocalLoraSettings config={config} onChange={vi.fn()} family="flux" />);
    expect(await screen.findByText('non-commercial only')).toBeInTheDocument();
    expect(screen.getByText('Trigger word “GHIBSKY style” is added automatically')).toBeInTheDocument();
  });

  it('downloads a LoRA and chooses it with its default weight', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LocalLoraSettings config={config} onChange={onChange} family="sdxl" />);
    await user.click(await screen.findByRole('button', { name: 'Download Pastel Anime XL' }));
    expect(api.downloadImageLora).toHaveBeenCalledWith('pastel-anime-xl');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      local_loras: [{ file: 'pastel-anime-xl-latest.safetensors', weight: 1 }],
    })));
  });

  it('changes the weight and removes a deleted LoRA from the choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const chosen = { ...config, local_loras: [{ file: 'my-style.safetensors', weight: 1 }] };
    render(<LocalLoraSettings config={chosen} onChange={onChange} family="sdxl" />);
    fireEvent.change(await screen.findByRole('slider'), { target: { value: '-0.5' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      local_loras: [{ file: 'my-style.safetensors', weight: -0.5 }],
    }));

    await user.click(screen.getByRole('button', { name: 'Delete my-style' }));
    await waitFor(() => expect(api.deleteImageLora).toHaveBeenCalledWith('my-style.safetensors'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ local_loras: [] }));
  });
});
