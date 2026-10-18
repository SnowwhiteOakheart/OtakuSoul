import { describe, expect, it } from 'vitest';
import { idleSeconds } from '../store/helpers';

describe('idleSeconds ({{idle_duration}})', () => {
  const at = (role: string, created_at: number) => ({ role, created_at });
  it('counts the pause before the latest user message', () => {
    expect(idleSeconds([at('assistant', 100), at('user', 200), at('assistant', 210), at('user', 3810)], 4000)).toBe(3600);
  });
  it('counts from the last user message when swiping or continuing', () => {
    expect(idleSeconds([at('user', 200), at('assistant', 210)], 500)).toBe(300);
  });
  it('has nothing to count without an earlier message', () => {
    expect(idleSeconds([], 500)).toBeUndefined();
    expect(idleSeconds([at('assistant', 100)], 500)).toBeUndefined();
  });
});
