// Avatar motions: an imported VRMA file gets its use from the name, shows in the settings and
// plays on the 3D avatar when a reply contains the matching roleplay action (*winkt*).
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';
import { makeWaveVrma } from './tools/make-vrma.mjs';

const { browser, mock, home, close } = await launch();
const shot = (name) => browser.saveScreenshot(path.join(screenshotDir, `${name}.png`));
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.setWindowSize(1280, 840);
  const source = path.join(home, 'Wave Hello.vrma');
  writeFileSync(source, makeWaveVrma());
  const imported = await invoke('import_avatar_motion', { sourcePath: source });
  assert.equal(imported.role, 'greeting', 'Verwendung wird nicht aus dem Namen erkannt');

  // The settings list it with its use.
  await browser.$('button=Einstellungen').click();
  const role = await browser.$('select[aria-label="Verwendung von Wave Hello"]');
  await role.waitForDisplayed({ timeout: 10_000 });
  assert.equal(await role.getValue(), 'greeting');
  await role.scrollIntoView({ block: 'center' });
  await shot('58-avatar-bewegungen');

  // Back in the chat the avatar loads it and waves on *winkt*.
  await browser.$('button=Chat').click();
  await browser.$('[data-motions="1"]').waitForExist({ timeout: 30_000, timeoutMsg: 'Bewegung wird im 3D-Avatar nicht geladen' });
  mock.stats.chatReply = '*winkt dir fröhlich zu* "Da bist du ja!"';
  await browser.$('textarea[aria-label="Nachricht"]').setValue('Hallo!');
  await clickSend(browser);
  await browser.$('[data-gesture="greeting"]').waitForExist({ timeout: 20_000, timeoutMsg: 'Geste startet nicht' });
  await browser.pause(500);
  await shot('59-avatar-winkt');
  // After the motion it fades back to the resting pose.
  await browser.$('[data-gesture=""]').waitForExist({ timeout: 10_000, timeoutMsg: 'Geste endet nicht' });
  console.log('Avatar-Bewegungen: Import, Verwendung, Laden und Geste bei *winkt* bestanden.');
} finally {
  await close();
}
