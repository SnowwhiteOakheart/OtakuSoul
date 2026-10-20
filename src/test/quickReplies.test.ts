import { describe, expect, it } from 'vitest';
import { fillQuickReply, importSillyTavernQuickReplies, usesInput } from '../utils/quickReplies';

describe('quick replies', () => {
  it('fills in the character, the user and the typed text', () => {
    const values = { char: 'Shiori', user: 'Kai', input: 'mehr Dialog' };
    expect(fillQuickReply('*nickt {{Char}} zu* Weiter, {{user}}! ({{input}}) {{scenario}}', values))
      .toBe('*nickt Shiori zu* Weiter, Kai! (mehr Dialog) {{scenario}}');
    expect(usesInput('((Bitte {{INPUT}}))')).toBe(true);
    expect(usesInput('Weiter')).toBe(false);
  });

  it('imports SillyTavern quick reply sets without their slash commands', () => {
    const v2 = importSillyTavernQuickReplies({
      version: 2, name: 'Rollenspiel',
      qrList: [
        { label: 'Weiter', message: 'Erzähl weiter.' },
        { label: 'Würfeln', message: '/roll 1d20 | /send Ich würfle {{pipe}}' },
        { label: '', message: 'Beschreibe die Umgebung genauer, bitte.' },
        { label: 'Leer', message: '  ' },
      ],
    });
    expect(v2.replies).toEqual([
      { label: 'Weiter', message: 'Erzähl weiter.', mode: 'send' },
      { label: 'Beschreibe die Umgebung', message: 'Beschreibe die Umgebung genauer, bitte.', mode: 'send' },
    ]);
    expect(v2.skipped).toBe(2);
    expect(importSillyTavernQuickReplies({ quickReplySlots: [{ label: 'Hi', mes: 'Hallo!' }] }).replies)
      .toEqual([{ label: 'Hi', message: 'Hallo!', mode: 'send' }]);
    expect(() => importSillyTavernQuickReplies({ scriptName: 'kein Set' })).toThrow();
  });
});
