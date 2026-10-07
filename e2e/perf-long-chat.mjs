// Measures how the chat view copes with a long chat: import 1000 messages, open the chat,
// then time keystrokes in the input (every keystroke re-renders the chat view).
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const COUNT = Number(process.env.E2E_MESSAGES ?? 1000);
const { browser, close } = await launch({ cloud_context_tokens: 4096 });
try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const lines = [JSON.stringify({ user_name: 'User', character_name: 'Emilia', chat_metadata: { title: 'Lang' } })];
  for (let i = 0; i < COUNT; i += 1) {
    const user = i % 2 === 0;
    lines.push(JSON.stringify({
      name: user ? 'User' : 'Emilia', is_user: user, send_date: '2026-10-01',
      mes: user ? `Frage ${i}: Wie geht es weiter?` : `*lächelt* "Antwort ${i}: ${'Das ist ein längerer Satz mit *Aktion* und "Rede". '.repeat(4)}"`,
    }));
  }
  const chars = await browser.execute(() => window.__TAURI_INTERNALS__.invoke('scan_characters'));
  const emilia = chars.find((c) => c.card.data.name === 'Emilia');
  await browser.execute(
    (id, jsonl) => window.__TAURI_INTERNALS__.invoke('import_chat_jsonl', { characterId: id, jsonlContent: jsonl, titleOverride: 'Lang' }),
    emilia.id, lines.join('\n'),
  );

  // Reopen the character's chats so the import shows up, then open it.
  await browser.$('button[title^="Gespräche, Author"]').click();
  await browser.execute(() => window.location.reload());
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.$('button[title^="Gespräche, Author"]').click();
  const started = Date.now();
  await browser.$('//aside//*[normalize-space()="Lang"]').click();
  await browser.waitUntil(async () => (await browser.$('body').getText()).includes(`Antwort ${COUNT - 1}:`), { timeout: 60_000 });
  const openMs = Date.now() - started;
  await browser.$('aside button[aria-label="Schließen"]').click();

  // Discrete input events make React render synchronously inside dispatchEvent, so the time
  // around it is the cost of one keystroke.
  const typing = await browser.execute(() => {
    const input = document.querySelector('textarea[aria-label="Nachricht"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    const times = [];
    for (let i = 0; i < 15; i += 1) {
      const t0 = performance.now();
      setter.call(input, 'x'.repeat(i + 1));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      void document.body.offsetHeight; // force layout
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    return { median: times[7], max: times[14], nodes: document.querySelectorAll('*').length };
  });
  await browser.saveScreenshot(path.join(screenshotDir, 'perf-long-chat.png'));
  // Scrolling back renders the oldest messages (virtualized list).
  await browser.execute(() => {
    document.querySelector('[aria-live="polite"]').scrollTop = 0;
  });
  await browser.waitUntil(async () => (await browser.$('body').getText()).includes('Frage 0:'), {
    timeout: 10_000,
    timeoutMsg: 'älteste Nachricht erscheint beim Hochscrollen nicht',
  });
  console.log(JSON.stringify({ messages: COUNT, openMs, keystrokeMedianMs: Math.round(typing.median), keystrokeMaxMs: Math.round(typing.max), domNodes: typing.nodes }));
} finally {
  await close();
}
