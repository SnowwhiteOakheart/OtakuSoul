import { beforeEach, describe, expect, it } from 'vitest';
import { errorMessage } from '../utils/errors';
import { useAppStore } from '../store/useAppStore';

const coded = (code: string, params: Record<string, string> = {}) => JSON.stringify({ code, params });

beforeEach(() => useAppStore.setState({ appLanguage: 'en' }));

describe('errorMessage', () => {
  it('translates coded backend errors into the interface language', () => {
    expect(errorMessage(coded('backend.voice.elevenApi', { status: '401', error: 'Unauthorized' }))).toBe(
      'ElevenLabs API error 401: Unauthorized'
    );
    useAppStore.setState({ appLanguage: 'de' });
    expect(errorMessage(coded('backend.voice.noText'))).toBe('Kein Text zum Vorlesen vorhanden.');
  });

  it('keeps plain messages and Error objects as they are', () => {
    expect(errorMessage('Etwas ging schief')).toBe('Etwas ging schief');
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('shows code and details for codes the frontend does not know yet', () => {
    expect(errorMessage(coded('backend.future.thing', { error: 'x' }))).toBe('backend.future.thing – x');
  });
});
