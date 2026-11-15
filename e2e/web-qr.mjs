// QR code of the mobile web client: fits inside its white frame and is dark on light (phone
// cameras often can't read inverted codes).
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, screenshotDir } from './harness.mjs';

const { browser, close } = await launch({});
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const invoke = (command, args = {}) => browser.execute((cmd, payload) => window.__TAURI_INTERNALS__.invoke(cmd, payload), command, args);
const jsClick = (element) => browser.execute((el) => el.click(), element);

try {
  await browser.$('button=Integrationen').waitForExist({ timeout: 30_000 });
  const config = await invoke('get_web_server_config');
  await invoke('save_web_server_config', { config: { ...config, host: '127.0.0.1', port: 18_000 + Math.floor(Math.random() * 1000) } });
  await invoke('start_web_server');

  await jsClick(await browser.$('button=Integrationen'));
  const tab = await browser.$('[role="tab"]*=Mobiler Web-Client');
  await tab.waitForExist({ timeout: 15_000 });
  await jsClick(tab);
  const qr = await browser.$('[data-testid="web-qr"] svg');
  await qr.waitForDisplayed({ timeout: 15_000 });
  const box = await browser.execute(() => {
    const frame = document.querySelector('[data-testid="web-qr"]').parentElement.getBoundingClientRect();
    const svg = document.querySelector('[data-testid="web-qr"] svg');
    const code = svg.getBoundingClientRect();
    const fills = [...svg.querySelectorAll('[fill]')].map((e) => e.getAttribute('fill'));
    return { frame: [frame.left, frame.top, frame.right, frame.bottom], code: [code.left, code.top, code.right, code.bottom], fills };
  });
  const [fl, ft, fr, fb] = box.frame;
  const [cl, ct, cr, cb] = box.code;
  assert.ok(cl >= fl && ct >= ft && cr <= fr && cb <= fb, `QR-Code ragt aus dem Rahmen: ${JSON.stringify(box)}`);
  assert.ok(cr - cl >= 120, `QR-Code zu klein: ${cr - cl}px`);
  assert.deepEqual(box.fills.slice(0, 2), ['#ffffff', '#090d16'], 'QR-Code nicht dunkel auf hell');
  await browser.saveScreenshot(path.join(screenshotDir, 'web-qr.png'));
  await invoke('stop_web_server');
  console.log('Web-Client-QR: passt in den Rahmen, dunkel auf hell.');
} finally {
  await close();
}
