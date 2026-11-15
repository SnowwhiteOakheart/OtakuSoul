// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('../services/api', async () => (await import('./mockApi')).apiModule);
vi.mock('../components/ui/feedback', async (original) => ({
  ...await original<object>(),
  confirmDialog: vi.fn().mockResolvedValue(true),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
import { open } from '@tauri-apps/plugin-dialog';
import { api } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { LocalLoraSettings } from '../components/integrations/tabs/LocalLoraSettings';
import { toast } from '../components/ui/feedback';
import { resetApiMocks } from './mockApi';
import type { LoraInfo } from '../types';

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
  nsfw: false,
  ...over,
});
const catalog = [
  lora({}),
  lora({ file: 'flux-ghibsky-illustration.safetensors', name: 'GHIBSKY', catalog_id: 'flux-ghibsky', family: 'flux', installed: true, noncommercial: true, trigger: 'GHIBSKY style', default_weight: 0.8 }),
  lora({ file: 'my-style.safetensors', name: 'my-style', catalog_id: null, family: null, installed: true, license: null }),
];

beforeEach(() => {
  resetApiMocks();
  useAppStore.setState({ appLanguage: 'en', nsfwEnabled: false, adultConfirmed: false });
  vi.mocked(api.onImageModelProgress).mockResolvedValue(() => {});
  vi.mocked(api.listImageLoras).mockResolvedValue(catalog);
  vi.spyOn(toast, 'success').mockImplementation(() => {});
  vi.spyOn(toast, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('LocalLoraSettings', () => {
  it('shows the LoRAs of the model family and the own files', async () => {
    render(<LocalLoraSettings selected={[]} onSelectedChange={vi.fn()} family="sdxl" />);
    expect(await screen.findByText('Pastel Anime XL')).toBeInTheDocument();
    expect(screen.getByText('my-style')).toBeInTheDocument();
    expect(screen.getByText(/model family unknown/)).toBeInTheDocument();
    expect(screen.queryByText('GHIBSKY')).not.toBeInTheDocument();
    // Not downloaded yet: it can't be chosen.
    expect(screen.getByRole('checkbox', { name: /Pastel Anime XL/ })).toBeDisabled();
  });

  it('marks non-commercial LoRAs and their trigger word', async () => {
    render(<LocalLoraSettings selected={[]} onSelectedChange={vi.fn()} family="flux" />);
    expect(await screen.findByText('non-commercial only')).toBeInTheDocument();
    expect(screen.getByText('Trigger word “GHIBSKY style” is added automatically')).toBeInTheDocument();
  });

  it('downloads a LoRA and chooses it with its default weight', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LocalLoraSettings selected={[]} onSelectedChange={onChange} family="sdxl" />);
    await user.click(await screen.findByRole('button', { name: 'Download Pastel Anime XL' }));
    expect(api.downloadImageLora).toHaveBeenCalledWith('pastel-anime-xl');
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ file: 'pastel-anime-xl-latest.safetensors', weight: 1 }]));
  });

  it('changes the weight and removes a deleted LoRA from the choice', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LocalLoraSettings selected={[{ file: 'my-style.safetensors', weight: 1 }]} onSelectedChange={onChange} family="sdxl" />);
    fireEvent.change(await screen.findByRole('slider'), { target: { value: '-0.5' } });
    expect(onChange).toHaveBeenLastCalledWith([{ file: 'my-style.safetensors', weight: -0.5 }]);

    await user.click(screen.getByRole('button', { name: 'Delete my-style' }));
    await waitFor(() => expect(api.deleteImageLora).toHaveBeenCalledWith('my-style.safetensors'));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('imports an own LoRA for the model family and chooses it; 18+ only with adult content on', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(open).mockResolvedValue('C:\\Downloads\\Flux Uncensored V2.safetensors');
    vi.mocked(api.importImageLora).mockResolvedValue('Flux Uncensored V2.safetensors');
    render(<LocalLoraSettings selected={[]} onSelectedChange={onChange} family="flux" />);
    await user.click(await screen.findByRole('button', { name: 'Add own LoRA …' }));
    const dialog = await screen.findByTestId('own-lora-dialog');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Flux Uncensored V2');
    expect(within(dialog).getByLabelText('Model family')).toHaveValue('flux');
    // Adult content off: no 18+ mark, just the hint.
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(dialog).getByText(/adult content/i)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Trigger words'), 'uncensored');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(api.importImageLora).toHaveBeenCalledWith('C:\\Downloads\\Flux Uncensored V2.safetensors', {
        name: 'Flux Uncensored V2',
        family: 'flux',
        trigger: 'uncensored',
        weight: 1,
        nsfw: false,
      }),
    );
    expect(onChange).toHaveBeenCalledWith([{ file: 'Flux Uncensored V2.safetensors', weight: 1 }]);
  });

  it('offers the 18+ mark with adult content on and shows marked LoRAs', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ nsfwEnabled: true, adultConfirmed: true });
    vi.mocked(api.listImageLoras).mockResolvedValue([
      ...catalog,
      lora({ file: 'uncensored.safetensors', name: 'Uncensored', catalog_id: null, family: 'flux', installed: true, license: null, nsfw: true }),
    ]);
    render(<LocalLoraSettings selected={[]} onSelectedChange={vi.fn()} family="flux" />);
    expect(await screen.findByText('18+')).toBeInTheDocument();
    expect(screen.getByText('Own file · for FLUX.1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit Uncensored' }));
    const dialog = await screen.findByTestId('own-lora-dialog');
    const mark = within(dialog).getByRole('checkbox');
    expect(mark).toBeChecked();
    await user.click(mark);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.updateImageLora).toHaveBeenCalledWith('uncensored.safetensors', expect.objectContaining({ nsfw: false, family: 'flux' })),
    );
  });

  it('hides own LoRAs of another model family and says so when importing one', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const info = vi.spyOn(toast, 'info').mockImplementation(() => {});
    const flux = lora({ file: 'lora.safetensors', name: 'lora', catalog_id: null, family: 'flux', installed: true, license: null });
    vi.mocked(api.listImageLoras).mockResolvedValue([...catalog, flux]);
    vi.mocked(open).mockResolvedValue('C:\\Downloads\\lora.safetensors');
    vi.mocked(api.importImageLora).mockResolvedValue('lora.safetensors');
    render(<LocalLoraSettings selected={[]} onSelectedChange={onChange} family="flux2" />);

    // Only shown with a model of its family.
    await screen.findByText('my-style');
    expect(screen.queryByText('lora')).not.toBeInTheDocument();

    // An import for another family isn't chosen for this model, and says where it went.
    await user.click(screen.getByRole('button', { name: 'Add own LoRA …' }));
    const dialog = await screen.findByTestId('own-lora-dialog');
    await user.selectOptions(within(dialog).getByLabelText('Model family'), 'flux');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(info).toHaveBeenCalledWith(expect.stringContaining('FLUX.1')));
    expect(onChange).not.toHaveBeenCalled();
  });
});
