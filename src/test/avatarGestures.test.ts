import { describe, expect, it } from 'vitest';
import { gestureForReply } from '../utils/avatarGestures';

describe('gestureForReply', () => {
  it('takes the first roleplay action that names a gesture', () => {
    expect(gestureForReply('*winkt dir fröhlich zu* "Hallo!" *lacht*')).toBe('greeting');
    expect(gestureForReply('"Hmm." *tilts her head and thinks*')).toBe('thinking');
    expect(gestureForReply('*nickt langsam*', 'sad')).toBe('nod');
  });

  it('falls back to the emotion and ignores words outside actions', () => {
    expect(gestureForReply('Ich lache nie. *schaut aus dem Fenster*', 'sad')).toBe('sad');
    expect(gestureForReply('She waves.', 'relaxed')).toBeNull();
  });
});
