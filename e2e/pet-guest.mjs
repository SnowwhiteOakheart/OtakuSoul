// Guest pet: a second, decorative pet window next to the pet. Opens the pet, then the guest
// with a character of the library, and checks that both windows exist, that the guest shows its
// own figure (its own interface with `guest=true`), keeps its own place and size, closes with the
// pet, and that touching it does not change the companion's hormones.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch({ avatar_mode: '3d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const handles = () => browser.getWindowHandles();
const urlOf = async (handle) => {
  await browser.switchToWindow(handle);
  return browser.getUrl();
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const main = (await handles())[0];
  const characters = await invoke('scan_characters');
  assert.ok(characters.length >= 2, `zu wenig Figuren: ${characters.length}`);
  // The guest gets a character with a real 3D model (the library's figures have none).
  const model = await invoke('import_vrm_model', { sourcePath: path.resolve('assets/vrm/Seed-san.vrm') });
  const profile = characters[1];
  profile.card.data.extensions = { ...profile.card.data.extensions, custom_vrm: model.path };
  const saved = await invoke('save_character_card', { profile });
  await browser.execute((id) => localStorage.setItem('otakusoul.desktopPetGuestCharacter', id), saved.id);
  // The interface reads the library anew (the card was saved behind its back).
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  // Without the pet there is no guest.
  assert.equal(await invoke('toggle_pet_guest', { enable: true, placement: null }), false, 'Gast ohne Pet geöffnet');
  assert.equal((await handles()).length, 1);

  // The pet opens, then the guest.
  assert.equal(await invoke('toggle_desktop_pet', { enable: true, placement: { width: 300, height: 440 } }), true);
  await browser.waitUntil(async () => (await handles()).length === 2, { timeout: 20_000, timeoutMsg: 'Pet-Fenster fehlt' });
  assert.equal(await invoke('toggle_pet_guest', { enable: true, placement: { width: 260, height: 380 } }), true);
  await browser.waitUntil(async () => (await handles()).length === 3, { timeout: 20_000, timeoutMsg: 'Gast-Fenster fehlt' });

  // The new webview shows about:blank until it has loaded.
  let urls = [];
  await browser.waitUntil(async () => {
    urls = [];
    for (const handle of await handles()) urls.push([handle, await urlOf(handle)]);
    return urls.some(([, url]) => url.includes('guest=true'));
  }, { timeout: 30_000, interval: 500, timeoutMsg: 'Gast-Oberfläche lädt nicht' });
  const guest = urls.find(([, url]) => url.includes('guest=true'))?.[0];
  const pet = urls.find(([, url]) => url.includes('pet=true') && !url.includes('guest=true'))?.[0];
  assert.ok(guest && pet, `Fenster nicht erkannt: ${JSON.stringify(urls)}`);

  // The guest has its own interface and asks for its figure; the main window answers with the chosen character.
  await browser.switchToWindow(guest);
  await browser.$('[data-desktop-pet]').waitForExist({ timeout: 30_000, timeoutMsg: 'Gast-Oberfläche fehlt' });
  assert.equal(await browser.execute(() => window.innerWidth), 260, 'Gast hat nicht seine eigene Größe');
  // The pet's window keeps the pet's size.
  await browser.switchToWindow(pet);
  assert.equal(await browser.execute(() => window.innerWidth), 300, 'Pet hat die Größe des Gastes');

  // The guest got a figure: its state names the chosen character (shown in the status of its own store).
  await browser.switchToWindow(guest);
  await browser.$('[data-motions]').waitForExist({ timeout: 60_000, timeoutMsg: 'Gast zeigt kein 3D-Modell' });
  await browser.pause(3000);
  await browser.saveScreenshot(path.join(screenshotDir, '120-gast-pet.png'));

  // Touching the guest changes nothing about the companion's hormones.
  await browser.switchToWindow(main);
  const before = await invoke('get_companion_state');
  await browser.switchToWindow(guest);
  const rect = await browser.execute(() => [window.innerWidth, window.innerHeight]);
  await browser.execute(
    (x, y) => {
      const target = document.elementFromPoint(x, y) ?? document.body;
      for (const type of ['pointerdown', 'pointerup']) {
        target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, screenX: x, screenY: y }));
      }
    },
    rect[0] / 2,
    rect[1] * 0.3,
  );
  await browser.pause(1500);
  await browser.switchToWindow(main);
  const after = await invoke('get_companion_state');
  assert.deepEqual(after.hormones, before.hormones, 'Berühren des Gastes verändert die Hormone');

  // Closing the guest leaves the pet; closing the pet takes a new guest with it.
  assert.equal(await invoke('toggle_pet_guest', { enable: false, placement: null }), false);
  await browser.waitUntil(async () => (await handles()).length === 2, { timeout: 20_000, timeoutMsg: 'Gast bleibt offen' });
  assert.equal(await invoke('toggle_pet_guest', { enable: true, placement: { width: 260, height: 380 } }), true);
  await browser.waitUntil(async () => (await handles()).length === 3, { timeout: 20_000 });
  assert.equal(await invoke('toggle_desktop_pet', { enable: false, placement: null }), false);
  await browser.waitUntil(async () => (await handles()).length === 1, { timeout: 20_000, timeoutMsg: 'Gast bleibt ohne Pet offen' });
  console.log('Gast-Pet: eigenes Fenster, eigene Größe, keine Hormonwirkung und Schließen mit dem Pet bestanden.');
} finally {
  await close();
}
