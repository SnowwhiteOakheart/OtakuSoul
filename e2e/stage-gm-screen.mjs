// Spielleiter-Schirm und Medien während des Zugs: Geheimnisse sieht nur der Planer (ein NPC seine eigenen),
// der Erzähler erst nach dem Aufdecken; Musik/Ort kommen per `stage-stream`-Medienereignis vor der Erzählung;
// ein vom Planer gewünschtes Szenenbild entsteht nur mit eingeschaltetem Schalter; im Editor steht der Schirm eingeklappt.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, mock, close } = await launch();
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

const SECRETS = [
  { id: 'debt', kind: 'motive', about: 'Mira', text: 'SECRET_DEBT: Mira schuldet der Diebesgilde 300 Gold.', revealed: false },
  { id: 'trap', kind: 'trap', about: '', text: 'SECRET_TRAP: Die dritte Stufe ist eine Druckplatte.', revealed: false },
];

/** Sends one turn and waits until it is done. */
const playTurn = async (text) => {
  const before = mock.stats.stagePlanner;
  await browser.$('form textarea').setValue(text);
  await browser.keys('Enter');
  await browser.waitUntil(() => mock.stats.stagePlanner > before, { timeout: 20_000 });
  await browser.$('button=Stopp').waitForExist({ reverse: true, timeout: 40_000 });
};

try {
  await browser.$('button=Stage').waitForExist({ timeout: 20_000 });
  const config = await invoke('get_image_gen_config');
  await invoke('save_image_gen_config', { config: { ...config, provider: 'automatic1111', api_url: mock.url.replace('/v1/chat/completions', '') } });
  const scene = await invoke('get_stage_state');
  await invoke('save_stage_scene', { sceneState: { ...scene, gm_secrets: SECRETS } });

  await browser.$('button=Stage').click();
  await browser.$('form textarea').waitForDisplayed({ timeout: 15_000 });

  // Every `stage-stream` event of the page, in order of arrival.
  await browser.execute(() => {
    // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
    const tauri = window.__TAURI_INTERNALS__;
    window.__stageEvents = [];
    const handler = tauri.transformCallback((event) => window.__stageEvents.push(event.payload));
    return tauri.invoke('plugin:event|listen', { event: 'stage-stream', target: { kind: 'Any' }, handler });
  });

  // Turn 1: Mira appears, the music turns tense, the planner wants a picture (switch is off).
  mock.stats.spawnNpc = { name: 'Mira', archetype: 'merchant', personality: 'freundlich, nervös' };
  mock.stats.musicMood = 'tension';
  mock.stats.sceneImage = true;
  // A new place: the picture is due (otherwise only after a dozen lines).
  mock.stats.location = 'Marktplatz';
  mock.stats.secretUpdates = [{ id: 'Rival Plan', kind: 'goal', about: 'Bram', text: 'SECRET_GOAL: Bram will den Schlüssel stehlen.' }];
  const imagesBefore = mock.stats.imagePrompts?.length ?? 0;
  await playTurn('Ich spreche die Händlerin an.');

  const planner = JSON.stringify(mock.stats.lastPlannerMessages);
  assert.ok(planner.includes('SECRET_DEBT') && planner.includes('SECRET_TRAP'), 'Planer sieht den Schirm nicht');
  const narrator = JSON.stringify(mock.stats.lastNarratorMessages);
  assert.ok(!narrator.includes('SECRET_'), 'Geheimnis erreicht den Erzähler');
  const npc = JSON.stringify(mock.stats.lastNpcMessages ?? []);
  assert.ok(npc.includes('SECRET_DEBT') && !npc.includes('SECRET_TRAP') && !npc.includes('SECRET_GOAL'), 'NPC kennt nicht genau sein eigenes Motiv');
  const companion = JSON.stringify(mock.stats.lastCompanionMessages ?? []);
  assert.ok(!companion.includes('SECRET_'), 'Geheimnis erreicht einen Gefährten');

  let state = await invoke('get_stage_state');
  assert.ok(state.gm_secrets.some((s) => s.id === 'rival_plan' && s.kind === 'goal' && !s.revealed), 'neues Geheimnis des Planers fehlt');
  assert.equal(state.current_music_mood, 'tension');

  const events = await browser.execute(() => window.__stageEvents);
  const mediaIndex = events.findIndex((e) => e.media);
  const firstText = events.findIndex((e) => !e.media && e.text);
  assert.ok(mediaIndex >= 0, 'kein Medienereignis');
  assert.equal(events[mediaIndex].media.current_music_mood, 'tension');
  assert.equal(events[mediaIndex].media.scene_image, true, 'Bildwunsch des Planers fehlt im Ereignis');
  assert.ok(firstText === -1 || mediaIndex < firstText, 'Medienereignis kommt erst nach der Erzählung');
  assert.equal(mock.stats.imagePrompts?.length ?? 0, imagesBefore, 'Szenenbild trotz ausgeschaltetem Schalter');

  // Turn 2: the switch is on, the debt is uncovered.
  mock.stats.secretUpdates = undefined;
  mock.stats.revealSecrets = ['debt'];
  mock.stats.location = 'Gildenhaus';
  await jsClick(await browser.$('button[aria-label="Weitere Aktionen für die Geschichte"]'));
  await browser.$('[role="menuitem"]*=Szenenbilder automatisch: aus').click();
  await playTurn('Ich frage Mira nach ihren Sorgen.');
  await browser.waitUntil(() => (mock.stats.imagePrompts?.length ?? 0) > imagesBefore, {
    timeout: 30_000,
    timeoutMsg: 'automatisches Szenenbild bleibt aus',
  });

  const narrated = JSON.stringify(mock.stats.lastNarratorMessages);
  assert.ok(narrated.includes('SECRET_DEBT') && !narrated.includes('SECRET_TRAP'), 'aufgedecktes Geheimnis fehlt dem Erzähler oder ein anderes leckt');
  state = await invoke('get_stage_state');
  assert.ok(state.gm_secrets.find((s) => s.id === 'debt').revealed, 'Geheimnis nicht aufgedeckt');
  assert.ok(state.lore_cards.some((c) => c.id === 'secret_debt' && c.audience === 'party'), 'aufgedecktes Geheimnis wird kein Gruppenwissen');
  assert.ok(state.chat_log.some((m) => m.event_card?.type === 'discovery' || JSON.stringify(m.event_card ?? {}).includes('SECRET_DEBT')), 'keine Entdeckungskarte');
  mock.stats.revealSecrets = undefined;
  mock.stats.location = undefined;

  // The editor shows the screen folded: no spoiler until it is opened.
  await browser.$('button*=Kampagne').click();
  await browser.$('button=Weltzustand bearbeiten').click();
  await browser.$('#stage-world-title').waitForDisplayed();
  const dialog = await browser.$('[role="dialog"]');
  // Rendered text and the details state: WebKit's driver also reports the folded part in getText().
  const screen = await browser.execute(() => ({
    open: document.querySelector('[data-testid="stage-gm-screen"]')?.open,
    text: document.querySelector('[role="dialog"]')?.innerText ?? '',
  }));
  assert.ok(screen.open === false && !screen.text.includes('SECRET_TRAP'), 'Spielleiter-Schirm nicht eingeklappt');
  await jsClick(await dialog.$('[data-testid="stage-gm-screen"] summary'));
  await (await dialog.$$('textarea[aria-label="Geheimnis"]'))[0].waitForDisplayed({ timeout: 5000 });
  const texts = await dialog.$$('textarea[aria-label="Geheimnis"]');
  assert.equal(texts.length, 3, 'Geheimnisse fehlen im Editor');
  await texts[1].setValue('SECRET_TRAP2: Die Druckplatte löst Pfeile aus.');
  await browser.saveScreenshot(path.join(screenshotDir, '25-spielleiter-schirm.png'));
  await dialog.$('button=Speichern').click();
  await browser.$('#stage-world-title').waitForExist({ reverse: true });
  state = await invoke('get_stage_state');
  assert.ok(state.gm_secrets.some((s) => s.id === 'trap' && s.text.startsWith('SECRET_TRAP2')), 'Bearbeitung des Schirms nicht gespeichert');

  console.log('Spielleiter-Schirm und Medienereignis: ok');
} finally {
  await close();
}
