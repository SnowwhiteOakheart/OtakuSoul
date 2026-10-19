// Vorhaben & Versprechen: die Reflexion legt ein echtes Vorhaben mit Datum und eines in der
// Geschichte an; der Reiter zeigt beide, der Prompt nennt sie mit Fälligkeit hinter dem Verlauf.
// „Erledigt“ macht daraus eine Erinnerung und nimmt es aus dem Prompt.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { clickSend, launch, screenshotDir } from './harness.mjs';

const { browser, mock, home, close } = await launch();
const database = path.join(home, 'data', 'otakusoul.db');
const sql = (statement) => execFileSync('sqlite3', [database, statement], { encoding: 'utf8' }).trim();
const jsClick = (element) => browser.execute((el) => el.click(), element);
const pageText = () => browser.execute(() => document.body.innerText);

const tomorrow = new Date(Date.now() + 86_400_000);
const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

const openDrawer = async () => {
  const open = await browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]');
  await open.waitForExist({ timeout: 20_000 });
  await jsClick(open);
  await browser.$('button=Reflexion starten').waitForDisplayed({ timeout: 10_000 });
};
const closeDrawer = async () => {
  await jsClick(await browser.$('button[aria-label="Aktualisieren"] + button[aria-label="Schließen"]'));
  await browser.$('button=Reflexion starten').waitForExist({ reverse: true, timeout: 10_000 });
};
const send = async (text) => {
  const before = mock.stats.chat;
  await browser.$('textarea[aria-label="Nachricht"]').setValue(text);
  await clickSend(browser);
  await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
  await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });
  return String(mock.stats.lastChatMessages.at(-1)?.content ?? '');
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  await openDrawer();
  mock.stats.memoryRouterResult = {
    no_significant_change: false,
    intentions_patch: {
      create: [
        { title: 'Zusammen italienisch kochen', initiator: 'user', time_basis: 'real', due: iso },
        { title: 'Das Buch mitbringen', initiator: 'character', time_basis: 'story', due: iso },
      ],
      resolve: [{ id: 99_999, status: 'fulfilled' }],
    },
  };
  await jsClick(await browser.$('button=Reflexion starten'));
  await browser.$('p*=Reflexion abgeschlossen').waitForDisplayed({ timeout: 20_000 });
  assert.ok(mock.stats.memoryRequests.at(-1).includes('=== CURRENT LOCAL TIME ==='), 'Router kennt die Uhrzeit nicht');

  await jsClick(await browser.$('button[role="tab"]=Vorhaben'));
  await browser.waitUntil(async () => (await browser.$$('[data-intention]')).length === 2, { timeout: 10_000, timeoutMsg: 'Vorhaben fehlen im Reiter' });
  const text = await pageText();
  assert.ok(text.includes('Morgen fällig') && text.includes('In der Geschichte offen'), `Fälligkeit fehlt: ${text}`);
  assert.equal(sql("SELECT due_at IS NULL FROM soul_intentions WHERE title = 'Das Buch mitbringen';"), '1', 'Vorhaben in der Geschichte hat ein Datum');
  await browser.saveScreenshot(path.join(screenshotDir, '105-vorhaben.png'));
  await closeDrawer();

  const after = await send('Was steht bei uns eigentlich an?');
  assert.ok(after.includes('[due tomorrow] Zusammen italienisch kochen'), `Fälliges Vorhaben fehlt im Prompt: ${after}`);
  assert.ok(after.includes('[open in the story] Das Buch mitbringen'), 'Vorhaben in der Geschichte fehlt im Prompt');

  await openDrawer();
  await jsClick(await browser.$('button[role="tab"]=Vorhaben'));
  const cooking = await browser.$('[data-intention]*=Zusammen italienisch kochen');
  await cooking.waitForDisplayed({ timeout: 10_000 });
  await jsClick(await cooking.$('button[aria-label="Erledigt"]'));
  await browser.waitUntil(async () => (await browser.$$('[data-intention]')).length === 1, { timeout: 10_000, timeoutMsg: 'Erledigtes bleibt offen' });
  assert.equal(sql("SELECT category FROM soul_episodic_memory WHERE content = 'Versprechen gehalten: Zusammen italienisch kochen';"), 'promise', 'Keine Erinnerung aus dem Versprechen');
  await closeDrawer();

  const later = await send('Und sonst?');
  assert.ok(!later.includes('] Zusammen italienisch kochen –'), 'Erledigtes Vorhaben steht noch im Prompt');
  console.log('Vorhaben: Reflexion legt sie mit Zeitbezug an, Reiter und Prompt zeigen Fälligkeit, Erledigt wird zur Erinnerung bestanden.');
} finally {
  await close();
}
