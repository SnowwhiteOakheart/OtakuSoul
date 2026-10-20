// Wörter & Wendungen: die Phrasenliste steht als Anweisung am Ende des Prompts, Regex-Skripte (Text und RegEx)
// ändern die Antwort, bevor sie erscheint und gespeichert wird; Skripte für Eingaben ändern die eigene Nachricht,
// „Nur Anzeige“ ändert nur den Chat, „Nur Prompt“ nur das, was die KI liest.
import assert from 'node:assert/strict';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch({
  expert_mode: true,
  avoid_phrases: ['ein Schauer lief'],
  reply_replacements: [
    { find: 'Kyoto', replace: 'Kioto', regex: false },
    { find: '(tausend) rote', replace: '$1 leuchtend rote', regex: true },
    { find: 'morgen', replace: 'übermorgen', regex: false, on_input: true, on_output: false },
    { find: '/Fushimi-Inari/g', replace: 'Fushimi Inari Taisha', regex: true, mode: 'display' },
    { find: 'Was machen', replace: 'PROMPT_ONLY machen', regex: false, on_input: true, on_output: false, mode: 'prompt' },
  ],
});

// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  const input = await browser.$('textarea[aria-label="Nachricht"]');
  await input.waitForDisplayed({ timeout: 30_000 });
  await input.setValue('Was machen wir morgen?');
  const before = mock.stats.chat;
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

  const last = mock.stats.lastChatRequest.messages.at(-1).content;
  assert.ok(last.includes('Never use these words or phrases, not even in other forms: "ein Schauer lief".'), 'Phrasenliste fehlt im Prompt');
  const pageText = () => browser.execute(() => document.body.innerText);
  await browser.waitUntil(async () => (await pageText()).includes('tausend leuchtend rote Tore'), { timeout: 10_000, timeoutMsg: 'RegEx-Regel nicht angewendet' });
  const page = await pageText();
  assert.ok(page.includes('über ganz Kioto') && !page.includes('über ganz Kyoto'), 'Text-Regel nicht angewendet');
  assert.ok(page.includes('Was machen wir übermorgen?'), 'Skript für Eingaben nicht angewendet');
  assert.ok(page.includes('Fushimi Inari Taisha'), 'Nur-Anzeige-Skript nicht angewendet');
  const sent = JSON.stringify(mock.stats.lastChatRequest.messages);
  assert.ok(sent.includes('PROMPT_ONLY machen wir übermorgen?'), 'Nur-Prompt-Skript fehlt im Prompt');
  assert.ok(!page.includes('PROMPT_ONLY'), 'Nur-Prompt-Skript erscheint im Chat');
  const settings = await invoke('load_settings');
  const [session] = await invoke('list_chat_sessions', { characterId: settings.active_character_id });
  const stored = await invoke('get_chat_messages', { chatId: session.id });
  assert.ok(stored.some((m) => m.content.includes('Fushimi-Inari')) && !stored.some((m) => m.content.includes('Fushimi Inari Taisha')),
    'Nur-Anzeige-Skript verändert den gespeicherten Text');

  await browser.$('button=Einstellungen').click();
  await browser.$('button[role="tab"]*=Antwortstil').click();
  const phrases = await browser.$('#settings-avoid-phrases');
  await phrases.waitForDisplayed({ timeout: 10_000 });
  assert.equal(await phrases.getValue(), 'ein Schauer lief');
  assert.equal((await browser.$$('[data-replacement-rule]')).length, 5);
  await phrases.scrollIntoView();
  await browser.saveScreenshot(path.join(screenshotDir, '99-woerter-wendungen.png'));
  await (await browser.$$('[data-replacement-rule]'))[2].scrollIntoView();
  await browser.saveScreenshot(path.join(screenshotDir, '123-regex-skripte.png'));
  console.log('Wörter & Wendungen: Anweisung im Prompt, Regex-Skripte für Antworten, Eingaben, Anzeige und Prompt, Einstellungen bestanden.');
} finally {
  await close();
}
