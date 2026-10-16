import { describe, expect, it, vi } from 'vitest';
import { errorFix, type FixContext } from '../utils/errorFixes';

const app = (over: Partial<FixContext> = {}): FixContext => ({
  selectedBackend: 'cloud',
  serverConfig: { model_path: '/m/x.gguf' },
  openSettingsSection: vi.fn(),
  startServer: vi.fn().mockResolvedValue(undefined),
  reopenOnboarding: vi.fn(),
  ...over,
});
const coded = (code: string, params: Record<string, string> = {}) => new Error(JSON.stringify({ code, params }));

describe('error fixes', () => {
  it('sends a rejected key to the cloud settings', () => {
    const ctx = app();
    const fix = errorFix(coded('backend.llm.server', { status: '401 Unauthorized', error: 'bad key' }), ctx)!;
    expect(fix.label).toBe('errorFix.checkKey');
    fix.run();
    expect(ctx.openSettingsSection).toHaveBeenCalledWith('providers');
  });

  it('starts the local AI when it cannot be reached', () => {
    const ctx = app({ selectedBackend: 'local' });
    const fix = errorFix(coded('backend.llm.connect', { url: 'x', error: 'refused' }), ctx)!;
    expect(fix.label).toBe('errorFix.startAi');
    fix.run();
    expect(ctx.startServer).toHaveBeenCalled();
  });

  it('suggests a smaller model when graphics memory runs out', () => {
    expect(errorFix(coded('backend.server.notEnoughVram'), app({ selectedBackend: 'local' }))?.label).toBe('errorFix.smallerModel');
  });

  it('offers the setup when no local model is chosen, and nothing for unknown errors', () => {
    const noModel = app({ selectedBackend: 'local', serverConfig: { model_path: '' } });
    expect(errorFix(coded('backend.llm.connect'), noModel)?.label).toBe('errorFix.setUpAi');
    expect(errorFix(coded('backend.common.fileWrite'), noModel)).toBeNull();
    expect(errorFix(new Error('boom'), noModel)).toBeNull();
    expect(errorFix(new Error('boom'), app())).toBeNull();
    expect(errorFix(coded('backend.llm.server', { status: '500 Internal' }), app())).toBeNull();
  });
});
