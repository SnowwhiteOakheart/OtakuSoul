// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);

import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { RuntimeCard } from '../components/settings/sections/RuntimeCard';
import { resetApiMocks } from './mockApi';

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en' });
  vi.mocked(api.getRuntime).mockResolvedValue(null);
  vi.mocked(api.onRuntimeProgress).mockResolvedValue(() => {});
  vi.mocked(api.listRuntimeVariants).mockResolvedValue([
    { backend: 'cuda-12.8', build: 'b11146', download_bytes: 730 * 1024 * 1024, recommended: true },
    { backend: 'vulkan', build: 'b11146', download_bytes: 29 * 1024 * 1024, recommended: false },
  ]);
});

describe('RuntimeCard', () => {
  it('preselects the recommended build and installs the chosen variant', async () => {
    const user = userEvent.setup();
    vi.mocked(api.installRuntime).mockResolvedValue({
      build: 'b11146',
      backend: 'vulkan',
      server_path: '/data/runtimes/llama.cpp/b11146-vulkan/llama-server',
      library_dirs: [],
    });
    const onInstalled = vi.fn();
    render(<RuntimeCard kind="llama" onInstalled={onInstalled} />);

    const select = await screen.findByRole('combobox', { name: 'Variant' });
    expect(select).toHaveValue('cuda-12.8');
    expect(screen.getByRole('option', { name: /CUDA 12\.8 \(NVIDIA\) · 730 MB · recommended/ })).toBeInTheDocument();

    await user.selectOptions(select, 'vulkan');
    await user.click(screen.getByRole('button', { name: 'Install build b11146' }));

    expect(api.installRuntime).toHaveBeenCalledWith('llama', 'vulkan');
    expect(api.listRuntimeVariants).toHaveBeenCalledWith('llama');
    expect(await screen.findByText(/Installed: build b11146 · Vulkan/)).toBeInTheDocument();
    expect(onInstalled).toHaveBeenCalled();
  });

  it('shows why the builds could not be loaded', async () => {
    vi.mocked(api.listRuntimeVariants).mockRejectedValue(new Error('rate limited'));
    render(<RuntimeCard kind="sd" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limited');
  });
});
