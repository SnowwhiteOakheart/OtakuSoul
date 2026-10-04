// English and Russian load on demand: the saved language shows from the start, and switching
// in the settings loads the next one before the interface changes.
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

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
