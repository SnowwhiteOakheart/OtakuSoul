// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { LocalImageSettings } from '../components/integrations/tabs/LocalImageSettings';
import { resetApiMocks } from './mockApi';
import type { ImageGenConfig, ImageModelInfo } from '../types';

const GB = 1024 ** 3;
const model = (over: Partial<ImageModelInfo>): ImageModelInfo => ({
  id: 'animagine-xl-4',
  name: 'Animagine XL 4.0',
  family: 'sdxl',
  vram_mb: 7_500,
  download_bytes: 7 * GB,
  missing_bytes: 7 * GB,
  installed: false,
  license: 'CreativeML Open RAIL++-M',
  recommended: true,
  fits_gpu: true,
  ...over,
});

const config: ImageGenConfig = {
  provider: 'local',
  api_url: '',
  api_key: null,
  positive_prompt_prefix: '',
  negative_prompt: '',
  width: 832,
  height: 1216,
  steps: 28,
  cfg_scale: 5,
  sampler_name: 'euler a',
  seed: -1,
  local_model_id: null,
  vram_strategy: 'auto',
};

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en' });
  vi.mocked(api.onImageModelProgress).mockResolvedValue(() => {});
  vi.mocked(api.onRuntimeProgress).mockResolvedValue(() => {});
  vi.mocked(api.getRuntime).mockResolvedValue(null);
  vi.mocked(api.listRuntimeVariants).mockResolvedValue([]);
});

describe('LocalImageSettings', () => {
  it('downloads a model and selects it when none was chosen', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listImageModels)
      .mockResolvedValueOnce([
        model({}),
        model({ id: 'flux2-dev-q4', name: 'FLUX.2 dev', vram_mb: 21_500, recommended: false, fits_gpu: false, missing_bytes: 10 * GB, download_bytes: 34 * GB }),
      ])
      .mockResolvedValue([model({ installed: true, missing_bytes: 0 })]);
    vi.mocked(api.downloadImageModel).mockResolvedValue(undefined);
    const onChange = vi.fn();
    render(<LocalImageSettings config={config} onChange={onChange} />);

    expect(await screen.findByText('fits your GPU')).toBeInTheDocument();
    // A partly downloaded model offers to resume; one that is too big says so.
    expect(screen.getByRole('button', { name: 'Resume (10.0 GB left)' })).toBeInTheDocument();
    expect(screen.getByText(/Larger than your graphics card/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Download (7.0 GB)' }));
    expect(api.downloadImageModel).toHaveBeenCalledWith('animagine-xl-4');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ local_model_id: 'animagine-xl-4' }));
  });

  it('changes the VRAM strategy', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listImageModels).mockResolvedValue([model({ installed: true, missing_bytes: 0 })]);
    const onChange = vi.fn();
    render(<LocalImageSettings config={config} onChange={onChange} />);

    await user.selectOptions(await screen.findByLabelText('Sharing VRAM with the chat model'), 'swap');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ vram_strategy: 'swap' }));
  });
});
