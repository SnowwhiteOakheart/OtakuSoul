// Hub collections: the lorebooks and scenes of one story show as one card, the dialog lists them
// with their characters, and "install everything" brings all of them into the library.
import assert from 'node:assert/strict';
import path from 'node:path';
import zlib from 'node:zlib';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);
const hubBase = mock.url.replace('/v1/chat/completions', '/hub');

/** A 1×1 PNG carrying a V2 card in its `chara` text chunk. */
const cardPng = (name) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const card = { spec: 'chara_card_v2', spec_version: '2.0', data: {
    name, description: `${name} aus der Saga`, personality: 'mutig', scenario: '', first_mes: 'Hallo!', mes_example: '', creator_notes: '',
    system_prompt: '', post_history_instructions: '', alternate_greetings: [], character_version: '1', tags: [], creator: 'snow', extensions: {},
  } };
  const data = Buffer.concat([Buffer.from('chara\0'), Buffer.from(Buffer.from(JSON.stringify(card)).toString('base64'))]);
  const type = Buffer.from('tEXt');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, data])));
  const end = png.length - 12; // before IEND
  return Buffer.concat([png.subarray(0, end), length, type, data, crc, png.subarray(end)]);
};
const lorebook = (name) => ({ name, description: `${name} der Saga`, entries: [{ keys: [name.toLowerCase()], content: `Wissen über ${name}.` }] });
const scene = {
  id: null,
  title: 'Sagenfolge 1',
  description: 'Der Anfang der Saga',
  starting_location: 'Am Tor',
  time_of_day: 'Abend',
  opening_narration: 'Das Tor knarrt.',
  party: ['Saga-Heldin'],
  lorebook: ['Saga – Welt'],
  starting_bg: '',
  extensions: {},
};
const files = {
  'soul_registry.json': { version: '1.0', characters: [{ name: 'Saga-Heldin', author: 'snow', download_url: `${hubBase}/heldin.png`, revision: 1, updated: '2026-10-25' }] },
  'lorebooks_registry.json': {
    version: '1.0',
    lorebooks: [
      { name: 'Saga – Welt', author: 'snow', description: 'Welt der Saga', entry_count: 1, download_url: `${hubBase}/welt.json`, revision: 1, updated: '2026-10-25' },
      { name: 'Saga – Orte', author: 'snow', description: 'Orte der Saga', entry_count: 1, download_url: `${hubBase}/orte.json`, revision: 1, updated: '2026-10-25' },
      { name: 'Einzelband', author: 'snow', description: 'Gehört zu keiner Sammlung', entry_count: 1, download_url: `${hubBase}/einzel.json`, revision: 1, updated: '2026-10-25' },
    ],
  },
  'stages_registry.json': {
    version: '1.0',
    scenes: [{ id: 'saga_ep1', title: 'Sagenfolge 1', author: 'snow', description: 'Der Anfang der Saga', starting_location: 'Am Tor', download_url: `${hubBase}/saga_ep1.json`, revision: 1, updated: '2026-10-25' }],
  },
  'collections_registry.json': {
    version: '1.0',
    collections: [
      {
        id: 'saga',
        title: 'Die Saga',
        author: 'snow',
        description: 'Alles zur Saga in einem Paket.',
        cover_url: '',
        lorebooks: ['Saga – Welt', 'Saga – Orte'],
        scenes: ['saga_ep1'],
        characters: ['Saga-Heldin'],
        revision: 1,
        updated: '2026-10-25',
      },
    ],
  },
  'heldin.png': cardPng('Saga-Heldin'),
  'welt.json': lorebook('Saga – Welt'),
  'orte.json': lorebook('Saga – Orte'),
  'einzel.json': lorebook('Einzelband'),
  'saga_ep1.json': scene,
};

try {
  mock.stats.hubFiles = files;
  await browser.$('button=Hub').waitForExist({ timeout: 20_000 });
  await jsClick(await browser.$('button=Hub'));
  await browser.$('#hub-tab-lorebooks').waitForExist({ timeout: 15_000 });
  await jsClick(await browser.$('#hub-tab-lorebooks'));

  // One card for the story, the unrelated lorebook stays on its own.
  const card = await browser.$('[data-hub-collection="saga"]');
  await card.waitForDisplayed({ timeout: 15_000, timeoutMsg: 'Keine Sammlungskarte' });
  assert.ok(await browser.$('h3=Einzelband').isExisting(), 'Einzelnes Lorebook fehlt');
  assert.ok(!(await browser.$('h3=Saga – Welt').isExisting()), 'Lorebook der Sammlung steht zusätzlich einzeln da');
  // The scenes tab groups the same collection.
  await jsClick(await browser.$('#hub-tab-scenes'));
  await browser.$('[data-hub-collection="saga"]').waitForDisplayed({ timeout: 15_000, timeoutMsg: 'Sammlung fehlt bei den Szenarien' });
  assert.ok(!(await browser.$('h3=Sagenfolge 1').isExisting()), 'Szene der Sammlung steht zusätzlich einzeln da');

  await jsClick(await browser.$('[data-hub-collection="saga"]'));
  const dialog = await browser.$('[data-hub-collection-dialog="saga"]');
  await dialog.waitForDisplayed({ timeout: 10_000 });
  const parts = ['Die Saga', 'Saga – Welt', 'Saga – Orte', 'Sagenfolge 1', 'Saga-Heldin'];
  // The character list loads alongside; the dialog fills in when it arrives.
  await browser.waitUntil(async () => {
    const text = await browser.execute((el) => el.textContent, dialog);
    return parts.every((part) => text.includes(part));
  }, { timeout: 10_000, timeoutMsg: 'Dialog unvollständig' });
  await browser.pause(300);
  await browser.saveScreenshot(path.join(screenshotDir, '86-hub-collection.png'));

  await jsClick(await browser.$('[data-hub-install-all]'));
  await browser.waitUntil(async () => (await browser.$('[data-hub-install-all]').getText()).includes('Alles installiert'), {
    timeout: 20_000,
    timeoutMsg: 'Sammlung nicht vollständig installiert',
  });

  const installed = await invoke('list_installed_hub_items');
  const keys = installed.map((item) => `${item.kind}:${item.hub_id}`).sort();
  assert.deepEqual(keys, ['character:Saga-Heldin', 'lorebook:Saga – Orte', 'lorebook:Saga – Welt', 'scene:saga_ep1']);
  const characters = await invoke('scan_characters');
  assert.ok(characters.some((c) => c.card.data.name === 'Saga-Heldin'), 'Figur nicht in der Bibliothek');
  console.log('hub-collections: ok');
} finally {
  await close();
}
