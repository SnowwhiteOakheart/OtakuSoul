import { describe, expect, it } from 'vitest';
import { providerOption } from '../components/settings/sections/ImageSettings';

describe('providerOption', () => {
  it('maps stored provider spellings to the select options', () => {
    expect(providerOption('Automatic1111')).toBe('automatic1111');
    expect(providerOption('ComfyUI')).toBe('comfy_ui');
    expect(providerOption('local')).toBe('local');
    expect(providerOption('custom')).toBe('custom');
  });
});
