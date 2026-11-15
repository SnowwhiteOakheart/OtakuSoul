// The real pet window (D4): opened from the companion tab, it shows the active figure and takes
// over changes of the main window (here the colour theme); "Ausblenden" closes the window (and its
// webview), and with "open at start" the pet comes back when the main window starts again.
// Also logs the JavaScript heap of both webviews (Chromium/WebView2 only), so a growing pet
// webview shows up between runs.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch({ avatar_mode: '3d' });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const handles = () => browser.getWindowHandles();
const heapMb = () =>
  browser.execute(() => {
    const memory = /** @type {{ usedJSHeapSize?: number }} */ (performance).memory;
    return memory?.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : null;
  });

/** The pet's handle once its webview has loaded the pet interface. */
const petHandle = async (main) => {
  let pet = null;
  await browser.waitUntil(async () => {
    for (const handle of await handles()) {
      if (handle === main) continue;
      await browser.switchToWindow(handle);
      if ((await browser.getUrl()).includes('pet=true')) pet = handle;
    }
    await browser.switchToWindow(main);
    return pet !== null;
  }, { timeout: 30_000, interval: 500, timeoutMsg: 'Pet-Oberfläche lädt nicht' });
  return pet;
};

const openCompanionPetTab = async () => {
  await jsClick(await browser.$('button=Companion'));
  const tab = await browser.$('[role="tab"]*=Desktop-Pet');
  await tab.waitForDisplayed({ timeout: 15_000 });
  await jsClick(tab);
  await browser.$('#setting-desktop-pet').waitForDisplayed({ timeout: 15_000 });
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const main = (await handles())[0];
  // The active figure gets a real 3D model: the pet shows only those.
  const model = await invoke('import_vrm_model', { sourcePath: path.resolve('assets/vrm/Seed-san.vrm') });
  const settings = await invoke('load_settings');
  const characters = await invoke('scan_characters');
  const profile = characters.find((c) => c.id === settings.active_character_id) ?? characters[0];
  profile.card.data.extensions = { ...profile.card.data.extensions, custom_vrm: model.path };
  await invoke('save_character_card', { profile });
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const mainHeapBefore = await heapMb();

  // Open from the companion tab, as a user does.
  await openCompanionPetTab();
  assert.equal(await browser.$('#setting-desktop-pet').getText(), 'Desktop-Pet anzeigen');
  await jsClick(await browser.$('#setting-desktop-pet'));
  await browser.waitUntil(async () => (await handles()).length === 2, { timeout: 20_000, timeoutMsg: 'Pet-Fenster öffnet nicht' });
  const pet = await petHandle(main);

  // The main window sends the figure: the pet loads its 3D model.
  await browser.switchToWindow(pet);
  await browser.$('[data-desktop-pet]').waitForExist({ timeout: 30_000, timeoutMsg: 'Pet-Oberfläche fehlt' });
  await browser.$('[data-motions]').waitForExist({ timeout: 60_000, timeoutMsg: 'Pet zeigt kein 3D-Modell' });
  await browser.pause(2000);
  const petHeap = await heapMb();
  await browser.saveScreenshot(path.join(screenshotDir, '121-pet-fenster.png'));

  // A change in the main window reaches the pet (theme travels with the pet state).
  await browser.switchToWindow(main);
  await jsClick(await browser.$('button=Einstellungen'));
  const sakura = await browser.$('span=Sakura Blossom');
  await sakura.waitForDisplayed({ timeout: 15_000 });
  await jsClick(await sakura.parentElement().parentElement());
  await browser.switchToWindow(pet);
  await browser.waitUntil(async () => (await browser.execute(() => document.documentElement.dataset.theme)) === 'sakura', {
    timeout: 15_000,
    timeoutMsg: 'Pet übernimmt das Farb-Theme des Hauptfensters nicht',
  });

  // Hide: the window and its webview go away (a hidden webview would keep the model in memory).
  await browser.switchToWindow(main);
  await openCompanionPetTab();
  await browser.waitUntil(async () => (await browser.$('#setting-desktop-pet').getAttribute('aria-pressed')) === 'true', {
    timeout: 10_000,
    timeoutMsg: 'Knopf zeigt das offene Pet nicht an',
  });
  assert.equal(await browser.$('#setting-desktop-pet').getText(), 'Ausblenden');
  await jsClick(await browser.$('#setting-desktop-pet'));
  await browser.waitUntil(async () => (await handles()).length === 1, { timeout: 20_000, timeoutMsg: 'Pet-Fenster bleibt nach „Ausblenden“' });

  // Back at the next start with "open at start".
  await browser.switchToWindow(main);
  await browser.execute(() => {
    const key = 'otakusoul.desktopPetPrefs';
    const prefs = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...prefs, openAtStart: true }));
  });
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.waitUntil(async () => (await handles()).length === 2, { timeout: 30_000, timeoutMsg: 'Pet kommt beim Start nicht wieder' });
  const back = await petHandle(main);
  await browser.switchToWindow(back);
  await browser.$('[data-motions]').waitForExist({ timeout: 60_000, timeoutMsg: 'Pet zeigt nach dem Start kein 3D-Modell' });

  // Without "open at start" it stays away after the next start.
  await browser.switchToWindow(main);
  assert.equal(await invoke('toggle_desktop_pet', { enable: false, placement: null }), false);
  await browser.waitUntil(async () => (await handles()).length === 1, { timeout: 20_000 });
  await browser.execute(() => {
    const key = 'otakusoul.desktopPetPrefs';
    const prefs = JSON.parse(localStorage.getItem(key) ?? '{}');
    localStorage.setItem(key, JSON.stringify({ ...prefs, openAtStart: false }));
  });
  await browser.refresh();
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await browser.pause(4000);
  assert.equal((await handles()).length, 1, 'Pet öffnet sich ohne „Beim Start öffnen“');

  const memory = petHeap == null ? 'JS-Heap nicht messbar (kein Chromium)' : `JS-Heap Hauptfenster ${mainHeapBefore} MB, Pet ${petHeap} MB`;
  console.log(`Pet-Fenster: Öffnen, Figur und Theme vom Hauptfenster, Ausblenden, Wiederkehr beim Start bestanden (${memory}).`);
} finally {
  await close();
}
