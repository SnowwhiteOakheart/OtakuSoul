// Comprehensive layout & occlusion sweep for all dialogs, popovers, menus, drawers, and boxes.
// Checks at both default (1280×840) and minimum (960×640) window sizes that every dialog/box fits
// the viewport, is not clipped by overflow ancestors, has no horizontal overflow, and is not
// covered by headers, sidebars, toolbars, or sibling elements (elementFromPoint).
import assert from 'node:assert/strict';
import { clickSend, launch, openSceneLobby } from './harness.mjs';
import { collectBoxProblems, collectDialogProblems, collectSiblingOverlapProblems } from './layout-checks.mjs';

const findings = [];
const jsClick = (element) => browserGlobal.execute((el) => el.click(), element);
let browserGlobal;

const pushFindings = (items) => {
  for (const p of items) {
    console.log(`✘ ${p}`);
    findings.push(p);
  }
};

const recordDialogs = async (browser, where) => {
  await browser.pause(150);
  pushFindings(await collectDialogProblems(browser, where));
};

const recordBox = async (browser, selector, where, opts) => {
  await browser.pause(150);
  pushFindings(await collectBoxProblems(browser, selector, where, opts));
};

const recordSiblings = async (browser, containerSel, itemSel, where) => {
  pushFindings(await collectSiblingOverlapProblems(browser, containerSel, itemSel, where));
};

const waitVisible = async (browser, selector, timeout = 5000) => {
  await browser.waitUntil(async () => {
    for (const el of await browser.$$(selector)) {
      if (await el.isDisplayed().catch(() => false)) return true;
    }
    return false;
  }, { timeout, timeoutMsg: `${selector} wurde nicht sichtbar` });
};

const closeDialogEsc = async (browser, selector = '[role="dialog"]') => {
  await browser.keys('Escape');
  await browser.waitUntil(async () => (await browser.$$(selector)).length === 0, {
    timeout: 5000,
    timeoutMsg: `Dialog (${selector}) schließt nicht mit Escape`,
  }).catch(() => {});
};

// 1. Main app sweep across 1280×840 and minimum window size 960×640.
{
  const { browser, mock, close } = await launch({ expert_mode: true });
  browserGlobal = browser;
  // oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
  const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);

  try {
    await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

    // Send one message so assistant message bubbles & prompt log are populated.
    const input = await browser.$('textarea[aria-label="Nachricht"]');
    const before = mock.stats.chat;
    await input.setValue('Hallo! Kurzer Layout-Test.');
    await clickSend(browser);
    await browser.waitUntil(() => mock.stats.chat > before, { timeout: 20_000 });
    await browser.$('button[aria-label="Nachricht senden"]').waitForExist({ timeout: 20_000 });

    for (const [vw, vh] of [[1280, 840], [960, 640]]) {
      const sizeTag = `${vw}×${vh}`;
      await browser.setWindowSize(vw, vh);
      await browser.pause(250);

      // --- Header & global boxes/dialogs ---
      await recordSiblings(browser, 'header', 'button', `Kopfzeile (${sizeTag})`);

      for (const [label, sel] of [
        ['Hilfe & Glossar', 'button[aria-label="Hilfe & Glossar"]'],
        ['Über die App', 'button[aria-label="Über die App"]'],
        ['System-Logs', 'button[aria-label="System-Logs"]'],
        ['Updates prüfen', 'button[aria-label="Updates prüfen"]'],
        ['Personas verwalten', 'button[aria-label$="Personas verwalten"]'],
      ]) {
        await (await browser.$(sel)).click();
        await waitVisible(browser, '[role="dialog"]');
        await recordDialogs(browser, `${label} (${sizeTag})`);
        await closeDialogEsc(browser);
      }

      // Command palette + listbox box inside it.
      await (await browser.$('button[aria-label^="Befehlspalette"]')).click();
      await browser.$('[role="dialog"] [role="listbox"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Befehlspalette (${sizeTag})`);
      await recordBox(browser, '#command-palette-results', `Befehlspalette-Liste (${sizeTag})`);
      await closeDialogEsc(browser);

      // --- Chat view: menus, popovers, avatar menu, sidebar, guests, memory, voice, prompt log ---
      await (await browser.$('button=Chat')).click();
      await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 10_000 });

      // Volume popover dialog.
      await (await browser.$('button[aria-label="Lautstärke"]')).click();
      await browser.$('[role="dialog"][aria-label="Lautstärke"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Chat-Lautstärke (${sizeTag})`);
      await closeDialogEsc(browser, '[role="dialog"][aria-label="Lautstärke"]');

      // Chat overflow menu.
      await (await browser.$('button[aria-label="Weitere Chat-Aktionen"]')).click();
      await browser.$('[role="menu"]').waitForDisplayed({ timeout: 5000 });
      await recordBox(browser, '[role="menu"]', `Chat-Menü (${sizeTag})`);
      await browser.$('button[role="menuitem"]*=Stimme').click();
      await browser.$('[aria-labelledby="voice-config-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Stimm-Dialog (${sizeTag})`);
      await closeDialogEsc(browser);

      // Prompt log modal (expert mode).
      await (await browser.$('button[aria-label="Weitere Chat-Aktionen"]')).click();
      await browser.$('[role="menu"]').waitForDisplayed({ timeout: 5000 });
      await browser.$('button[role="menuitem"]*=Letzten Prompt').click();
      await browser.$('[aria-labelledby="prompt-log-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Prompt-Protokoll (${sizeTag})`);
      await closeDialogEsc(browser);

      // AdaptiveHud character switcher dropdown & cognitive memory drawer.
      await (await browser.$('button[aria-label="Charakter wechseln"]')).click();
      await browser.$('[role="menu"]').waitForDisplayed({ timeout: 5000 });
      await recordBox(browser, '[role="menu"]', `Charakter-Wechsler (${sizeTag})`);
      await browser.keys('Escape');
      await browser.$('[role="menu"]').waitForExist({ reverse: true, timeout: 3000 });

      await (await browser.$('button[aria-label="Kognitives Gedächtnis öffnen"]')).click();
      await browser.$('[aria-labelledby="memory-drawer-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Gedächtnis-Drawer (${sizeTag})`);
      await closeDialogEsc(browser);

      // Avatar emotion menu & talking portrait dialog.
      await (await browser.$('button[aria-label^="Aktuelle Emotion"]')).click();
      await browser.$('[role="menu"]').waitForDisplayed({ timeout: 5000 });
      await recordBox(browser, '[role="menu"]', `Avatar-Emotionsmenü (${sizeTag})`);
      await browser.keys('Escape');
      await browser.$('[role="menu"]').waitForExist({ reverse: true, timeout: 3000 });

      if (await browser.$('#setting-talking-portrait').isExisting()) {
        await (await browser.$('#setting-talking-portrait')).click();
        await waitVisible(browser, '[role="dialog"]');
        await recordDialogs(browser, `Sprechendes Porträt (${sizeTag})`);
        await closeDialogEsc(browser);
      }

      // Chat sidebar box, its tabs, and the GuestPicker modal opened from inside ChatSidebar.
      await (await browser.$('button[title^="Gespräche, Author"]')).click();
      await browser.$('aside[aria-label]').waitForDisplayed({ timeout: 5000 });
      await recordBox(browser, 'aside[aria-label]', `Chat-Seitenleiste (${sizeTag})`, { checkItems: false });
      await recordSiblings(browser, '[role="tablist"][aria-label="Bereiche"]', '[role="tab"]', `Seitenleisten-Tabs (${sizeTag})`);

      await (await browser.$$('aside [role="tab"]'))[4].click();
      await browser.$('[data-chat-guests]').waitForDisplayed({ timeout: 5000 });
      const inviteButton = await browser.$('[data-chat-guests] button');
      if (await inviteButton.isExisting() && await inviteButton.isEnabled()) {
        await inviteButton.click();
        await browser.$('[aria-labelledby="guest-picker-title"]').waitForDisplayed({ timeout: 5000 });
        await recordDialogs(browser, `Gäste-Auswahl aus Seitenleiste (${sizeTag})`);
        await closeDialogEsc(browser, '[aria-labelledby="guest-picker-title"]');
      }
      await (await browser.$('aside button[aria-label="Schließen"]')).click();
      await browser.$('aside[aria-label]').waitForExist({ reverse: true, timeout: 3000 });

      // RememberMessageDialog from assistant bubble hover bar.
      const rememberButtons = await browser.$$('button[aria-label="Merken"]');
      if (rememberButtons.length > 0) {
        await jsClick(rememberButtons[rememberButtons.length - 1]);
        await browser.$('[data-remember-dialog]').waitForDisplayed({ timeout: 5000 });
        await recordDialogs(browser, `Nachricht merken (${sizeTag})`);
        await closeDialogEsc(browser);
      }

      // --- Characters view ---
      await (await browser.$('button=Charaktere')).click();
      await browser.waitUntil(async () => (await browser.$$('button[aria-label^="Mehr über"]')).length > 0, { timeout: 10_000 });

      await (await browser.$('button[aria-label="Weitere Aktionen"]')).click();
      await browser.$('[role="menu"]').waitForDisplayed({ timeout: 5000 });
      await recordBox(browser, '[role="menu"]', `Charaktere-Menü (${sizeTag})`);
      await browser.keys('Escape');
      await browser.$('[role="menu"]').waitForExist({ reverse: true, timeout: 3000 });

      await jsClick((await browser.$$('button[aria-label^="Mehr über"]'))[0]);
      await browser.$('[data-character-preview]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Charakter-Vorschau (${sizeTag})`);
      await closeDialogEsc(browser);

      await (await browser.$('button*=Leere Karte')).click();
      await browser.$('[aria-labelledby="character-editor-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Charakter-Editor (${sizeTag})`);
      await closeDialogEsc(browser);

      await (await browser.$('button*=Charakter erstellen')).click();
      await browser.$('[aria-labelledby="wizard-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Charakter-Assistent (${sizeTag})`);
      await closeDialogEsc(browser);

      // --- Lorebooks view + EntryEditorModal + ConfirmDialog ---
      await (await browser.$('button=Lorebooks')).click();
      await waitVisible(browser, 'h1, h2', 10_000);
      if (vw === 1280) {
        if (await browser.$('button=Neues Lorebook anlegen').isExisting()) {
          await (await browser.$('button=Neues Lorebook anlegen')).click();
        }
        await browser.$('button*=Eintrag hinzufügen').waitForDisplayed({ timeout: 5000 });
      }
      if (await browser.$('button*=Eintrag hinzufügen').isExisting()) {
        await (await browser.$('button*=Eintrag hinzufügen')).click();
        await waitVisible(browser, '[role="dialog"]');
        await recordDialogs(browser, `Lorebook-Eintrag (${sizeTag})`);
        await closeDialogEsc(browser);
      }

      // --- Hub view: UrlImportModal ---
      await (await browser.$('button=Hub')).click();
      await browser.$('#hub-filter-scenes').waitForDisplayed({ timeout: 10_000 });
      await (await browser.$('button*=URL importieren')).click();
      await waitVisible(browser, '[role="dialog"]');
      await recordDialogs(browser, `Hub-URL-Import (${sizeTag})`);
      await closeDialogEsc(browser);

      // --- Settings view: AdultConfirmDialog ---
      await (await browser.$('button=Einstellungen')).click();
      await browser.$('#setting-expert-mode').waitForDisplayed({ timeout: 10_000 });
      const adultSwitch = await browser.$('#setting-adult-content');
      if (await adultSwitch.isExisting()) {
        await adultSwitch.scrollIntoView({ block: 'center' });
        if ((await adultSwitch.getAttribute('aria-checked')) === 'false') {
          await adultSwitch.click();
          await browser.$('[data-adult-confirm]').waitForDisplayed({ timeout: 5000 });
          await recordDialogs(browser, `Altersbestätigung (${sizeTag})`);
          await closeDialogEsc(browser);
        }
      }

      // --- Stage view: toolbar menus/popovers, world, NPCs, music, clock, skills, gallery, lobby ---
      await (await browser.$('button=Stage')).click();
      await browser.$('[aria-label="Weitere Aktionen für die Geschichte"]').waitForDisplayed({ timeout: 15_000 });

      await (await browser.$('button[aria-label="Weitere Aktionen für die Geschichte"]')).click();
      await browser.$('[role="menu"]').waitForDisplayed({ timeout: 5000 });
      await recordBox(browser, '[role="menu"]', `Stage-Menü (${sizeTag})`);
      await browser.$('button[role="menuitem"]*=Erzählerstimme').click();
      await browser.$('[aria-labelledby="voice-config-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Stage-Erzählerstimme (${sizeTag})`);
      await closeDialogEsc(browser);

      await (await browser.$('[aria-label="Lautstärke"]')).click();
      await browser.$('[role="dialog"][aria-label="Lautstärke"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Stage-Lautstärke (${sizeTag})`);
      await closeDialogEsc(browser, '[role="dialog"][aria-label="Lautstärke"]');

      await (await browser.$('button[aria-label="Musik-Einstellungen"]')).click();
      await browser.$('[aria-labelledby="stage-music-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Stage-Musik (${sizeTag})`);
      await closeDialogEsc(browser);

      await (await browser.$$('button*=NPCs'))[0].click();
      await browser.$('[aria-labelledby="stage-npc-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Stage-NPCs (${sizeTag})`);
      await closeDialogEsc(browser);

      // PartyHeader skills modal (narrative scene).
      const skillButtons = await browser.$$('button[title="Fertigkeiten"]');
      if (skillButtons.length > 0) {
        await skillButtons[0].click();
        await waitVisible(browser, '[role="dialog"]');
        await recordDialogs(browser, `Party-Fertigkeiten (${sizeTag})`);
        await closeDialogEsc(browser);
      }

      // Campaign tab: World editor; Tactics tab: Clock modal.
      await (await browser.$('button[role="tab"]*=Kampagne')).click();
      await (await browser.$('button=Weltzustand bearbeiten')).waitForDisplayed({ timeout: 5000 });
      await (await browser.$('button=Weltzustand bearbeiten')).click();
      await browser.$('[aria-labelledby="stage-world-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Weltzustand-Editor (${sizeTag})`);
      await closeDialogEsc(browser);

      await (await browser.$('button[role="tab"]*=Taktik')).click();
      await (await browser.$('button*=Neue Uhr')).waitForDisplayed({ timeout: 5000 });
      await (await browser.$('button*=Neue Uhr')).click();
      await browser.$('[aria-labelledby="new-clock-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Neue Uhr (${sizeTag})`);
      await closeDialogEsc(browser);

      // Switch back to adventure tab for story gallery & scene lobby.
      await (await browser.$('button[role="tab"]*=Abenteuer')).click();

      // Story gallery, preview, wizard, scene lobby, scene card menu, scene create modal.
      await (await browser.$('button=Geschichten')).click();
      await browser.$('[data-story-gallery]').waitForDisplayed({ timeout: 10_000 });

      await jsClick(await browser.$('[data-gallery-collection="starter_stories"]'));
      await browser.$('[data-story="story_frozen_bells"]').waitForExist({ timeout: 5000 });
      await jsClick(await browser.$('[data-story="story_frozen_bells"]').$('button*=Ansehen'));
      await browser.$('[data-story-preview]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Story-Vorschau (${sizeTag})`);
      await closeDialogEsc(browser);

      await jsClick(await browser.$('[data-story-gallery] header').$('button*=Eigene Geschichte'));
      await browser.$('[data-story-wizard]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Story-Assistent (${sizeTag})`);
      await closeDialogEsc(browser);

      await openSceneLobby(browser);
      await recordDialogs(browser, `Szenen-Lobby (${sizeTag})`);

      // Scene card menu inside scrollable SceneLobbyModal grid.
      const cardMenus = await browser.$$('button[aria-label^="Weitere Aktionen für „"]');
      if (cardMenus.length > 0) {
        await cardMenus[0].click();
        await browser.$('[role="menu"]').waitForDisplayed({ timeout: 5000 });
        await recordBox(browser, '[role="menu"]', `Szenenkarten-Menü (${sizeTag})`);
        await browser.keys('Escape');
        await browser.$('[role="menu"]').waitForExist({ reverse: true, timeout: 3000 });
        assert.equal(await browser.$('#scene-lobby-title').isDisplayed(), true, `Escape auf Szenenkarten-Menü schließt Szenen-Lobby (${sizeTag})`);
      }

      // Nested SceneCreateModal on top of SceneLobbyModal.
      await (await browser.$$('button*=Neue Szene'))[0].click();
      await browser.$('[aria-labelledby="scene-create-title"]').waitForDisplayed({ timeout: 5000 });
      await recordDialogs(browser, `Szene erstellen (${sizeTag})`);
      await closeDialogEsc(browser, '[aria-labelledby="scene-create-title"]');

      await closeDialogEsc(browser, '#scene-lobby-title');

      // Back to Chat for second viewport iteration.
      await (await browser.$('button=Chat')).click();
      await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 10_000 });
    }

    // 5e dialogs (combat panel, Character5eSheet & ContributeDialog) on a 5e scene at 960×640.
    await browser.setWindowSize(960, 640);
    const scene = await invoke('get_stage_state');
    await invoke('save_stage_scene', {
      sceneState: {
        ...scene,
        definition: {
          ...scene.definition,
          rules: { ruleset: '5e', hero_classes: { player: 'fighter', Lirwen: 'fighter' }, control_companions: false },
        },
        combat: { ...scene.combat, is_active: false, combatants: [], events: [] },
      },
    });
    await (await browser.$('button=Stage')).click();
    const stageInput = await browser.$('form textarea');
    await stageInput.waitForDisplayed({ timeout: 15_000 });
    mock.stats.stageEncounter = { action: 'start', enemies: [{ monster: 'goblin', count: 1, hp: 7 }] };
    await stageInput.setValue('Ich ziehe mein Schwert.');
    await browser.keys('Enter');
    const combatPanel = await browser.$('[data-testid="combat-5e"]');
    await combatPanel.waitForDisplayed({ timeout: 30_000 });
    mock.stats.stageEncounter = null;
    await recordBox(browser, '[data-testid="combat-5e"]', '5e-Kampfpanel (960×640)', { checkItems: false });

    await waitVisible(browser, 'button[aria-label^="Charakterbogen von"]', 10_000);
    await (await browser.$$('button[aria-label^="Charakterbogen von"]'))[0].click();
    await browser.$('[aria-labelledby="sheet-title"]').waitForDisplayed({ timeout: 5000 });
    await recordDialogs(browser, '5e-Charakterbogen (960×640)');
    await closeDialogEsc(browser);

    // ContributeDialog on the persisted scene.
    await (await browser.$('button[aria-label="Weitere Aktionen für die Geschichte"]')).click();
    await browser.$('[role="menu"]').waitForDisplayed({ timeout: 5000 });
    await browser.$('button[role="menuitem"]*=beisteuern').click();
    await waitVisible(browser, '[role="dialog"]');
    await recordDialogs(browser, 'Beitrag-Dialog (960×640)');
    await closeDialogEsc(browser);
  } finally {
    await close();
  }
}

// 2. Onboarding wizard at 1280×840 and 960×640.
{
  const { browser, close } = await launch({ onboarding_completed: false });
  browserGlobal = browser;
  try {
    const dialog = await browser.$('[role="dialog"]');
    await dialog.waitForDisplayed({ timeout: 30_000 });
    for (const [vw, vh] of [[1280, 840], [960, 640]]) {
      await browser.setWindowSize(vw, vh);
      await recordDialogs(browser, `Einrichtungs-Assistent (${vw}×${vh})`);
    }
  } finally {
    await close();
  }
}

assert.equal(findings.length, 0, `${findings.length} Dialog-/Box-Befunde:\n${findings.join('\n')}`);
console.log('Dialoge & Boxen: alle Dialoge, Menüs, Popover, Drawer und Leisten bei 1280×840 und 960×640 sauber dargestellt und unverdeckt.');
