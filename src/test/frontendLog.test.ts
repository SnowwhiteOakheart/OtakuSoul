import { describe, expect, it, vi } from 'vitest';
import { createForwarder, formatLogArgs } from '../services/frontendLog';

describe('formatLogArgs', () => {
  it('joins strings, serializes objects and keeps error stacks', () => {
    const error = new Error('kaputt');
    const line = formatLogArgs(['Speichern fehlgeschlagen:', { id: 3 }, error]);
    expect(line).toContain('Speichern fehlgeschlagen: {"id":3}');
    expect(line).toContain('kaputt');
  });

  it('survives circular objects', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatLogArgs([circular])).toBe('[object Object]');
  });
});

describe('createForwarder', () => {
  it('limits entries per minute and resets afterwards', () => {
    let time = 0;
    const send = vi.fn();
    const forward = createForwarder(send, () => time);

    for (let i = 0; i < 100; i++) forward('error', [`fehler ${i}`]);
    expect(send).toHaveBeenCalledTimes(60);

    time = 60_000;
    forward('warn', ['wieder da']);
    expect(send).toHaveBeenLastCalledWith('warn', 'wieder da');
  });

  it('drops entries logged while sending instead of looping', () => {
    const send = vi.fn();
    const forward = createForwarder((level, message) => {
      send(level, message);
      forward('error', ['Fehler beim Senden']);
    });
    forward('error', ['erster Fehler']);
    expect(send).toHaveBeenCalledOnce();
  });
});
