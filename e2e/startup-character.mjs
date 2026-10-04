// On start the last opened character shows right away, without the first one of the list
// flashing up before it.
import assert from 'node:assert/strict';
import { launch } from './harness.mjs';

// Not the first character of the bundled list (that one shows when the choice is ignored).
const { browser, close } = await launch({ active_character_id: 'yue' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const shownName = () => browser.execute(() => document.querySelector('span.truncate.max-w-48')?.textContent ?? null);

/** Every name the chat header shows while the interface starts. */
const namesWhileStarting = async () => {
  const seen = [];
  const started = Date.now();
  while (Date.now() - started < 6000) {
    const name = await shownName();
    if (name && seen.at(-1) !== name) seen.push(name);
  }
  return seen;
};

try {
  const first = await namesWhileStarting();
  assert.deepEqual(first, ['Yue'], `beim ersten Start angezeigt: ${first.join(' → ')}`);
  assert.equal((await invoke('load_settings')).active_character_id, 'yue', 'Start hat die Auswahl überschrieben');
  console.log('Startcharakter: direkt der zuletzt geöffnete, kein anderer dazwischen bestanden.');
} finally {
  await close();
}
