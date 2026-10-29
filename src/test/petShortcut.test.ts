import { describe, expect, it } from 'vitest';
import { acceleratorFromKey, formatAccelerator } from '../services/desktopPet';

const press = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('acceleratorFromKey', () => {
  it('builds the combination from modifiers and a letter, digit or named key', () => {
    expect(acceleratorFromKey(press('KeyP', { ctrlKey: true, altKey: true, shiftKey: true }))).toBe('Control+Alt+Shift+P');
    expect(acceleratorFromKey(press('Digit7', { altKey: true }))).toBe('Alt+7');
    expect(acceleratorFromKey(press('F9', { ctrlKey: true }))).toBe('Control+F9');
    expect(acceleratorFromKey(press('Space', { metaKey: true }))).toBe('Super+Space');
  });

  it('waits while only modifiers are held and refuses keys that would swallow typing', () => {
    expect(acceleratorFromKey(press('ControlLeft', { ctrlKey: true }))).toBeNull();
    expect(acceleratorFromKey(press('KeyP'))).toBeNull();
    expect(acceleratorFromKey(press('KeyP', { shiftKey: true }))).toBeNull();
    expect(acceleratorFromKey(press('Comma', { ctrlKey: true }))).toBeNull();
  });
});

describe('formatAccelerator', () => {
  it('writes the keys the way the platform names them', () => {
    expect(formatAccelerator('CommandOrControl+Alt+Shift+P', false)).toBe('Ctrl+Alt+Shift+P');
    expect(formatAccelerator('CommandOrControl+Alt+Shift+P', true)).toBe('Cmd+Option+Shift+P');
    expect(formatAccelerator('Control+Super+F5', false)).toBe('Ctrl+Win+F5');
  });
});
