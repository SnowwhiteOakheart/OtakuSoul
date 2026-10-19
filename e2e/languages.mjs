// English and Russian load on demand: the saved language shows from the start, and switching
// in the settings loads the next one before the interface changes. A language file the app does
// not ship (here Polish in the user folder) shows up without a new build; missing texts come
// from its fallback language.
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

{
  const { browser, close } = await launch({ app_language: 'ru' });
  try {
    await browser.$('button=Интеграции').waitForExist({ timeout: 20_000 });
    await browser.$('button=Настройки').click();
    await browser.$('button*=English').click();
    await browser.$('button=Integrations').waitForExist({ timeout: 5000 });
    await browser.saveScreenshot(path.join(screenshotDir, '29-sprache-englisch.png'));
    console.log('Sprachen: Russisch beim Start, Wechsel zu Englisch bestanden.');
  } finally {
    await close();
  }
}

{
  const polish = {
    __meta: { name: 'Polski', englishName: 'Polish', author: 'E2E', version: '1.0.0', fallback: 'en' },
    'nav.settings': 'Ustawienia',
  };
  const { browser, close } = await launch(
    { app_language: 'pl' },
    { homeFiles: { 'data/locales/ui/pl.json': JSON.stringify(polish) } },
  );
  try {
    await browser.$('button=Ustawienia').waitForExist({ timeout: 20_000 });
    // Not in the file: the English fallback, not German.
    await browser.$('button=Integrations').waitForExist({ timeout: 5000 });
    await browser.$('button=Ustawienia').click();
    await browser.$('button*=Polski').waitForExist({ timeout: 5000 });
    await browser.$('button*=Deutsch').click();
    await browser.$('button=Einstellungen').waitForExist({ timeout: 5000 });
    await browser.saveScreenshot(path.join(screenshotDir, '29-sprache-eigene-datei.png'));
    console.log('Sprachen: eigene Sprachdatei ohne neuen Build erkannt, Rückfall auf Englisch bestanden.');
  } finally {
    await close();
  }
}
