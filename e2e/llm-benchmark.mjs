// Built-in speed test of the local chat model: kept results show up in the server settings (latest
// with rating, earlier ones in a table), clearing empties the list, and without a running model the
// backend refuses to measure. The measurement itself needs a real llama-server (unit tests check
// the timings it reports; see AI.md).
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { launch, saveSettingsAndReload, screenshotDir } from './harness.mjs';

const result = (over) => ({
  id: '1', created_at: '2026-10-25T18:00:00+00:00', model_name: 'gemma-4-12b-it-Q4_K_M', model_path: '/m/gemma-4-12b-it-Q4_K_M.gguf',
  context_size: 32768, gpu_layers: 99, cache_type: 'q8_0', flash_attn: true, lora: null, prompt_tokens: 681, prompt_tps: 2838.1,
  gen_tokens: 128, gen_tps: 85.3, first_token_ms: 240, vram_mb: 9318, rating: 'smooth', ...over,
});
const results = [
  result({ id: '3' }),
  result({ id: '2', created_at: '2026-10-24T18:00:00+00:00', model_name: 'gemma-4-E4B-it-Q4_K_M', gen_tps: 131.6, prompt_tps: 5120.4,
    first_token_ms: 130, lora: 'gemma-4-e4b-heretic.gguf', vram_mb: 5200 }),
  result({ id: '1', created_at: '2026-10-23T18:00:00+00:00', model_name: 'gemma-4-26B-A4B-it-UD-Q4_K_M', gpu_layers: 99, gen_tps: 5.4,
    prompt_tps: 412.7, first_token_ms: 1650, rating: 'slow', vram_mb: 15800 }),
];

const { browser, home, close } = await launch({}, { homeFiles: { 'data/llm_benchmarks.json': JSON.stringify(results) } });
// oxlint-disable-next-line no-underscore-dangle -- Tauri IPC in a disposable profile
const call = async (command, args = {}) => {
  try {
    return await browser.executeAsync((cmd, payload, done) => window.__TAURI_INTERNALS__.invoke(cmd, payload)
      .then((value) => done({ ok: true, value }), (error) => done({ ok: false, error: String(error) })), command, args);
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
};

try {
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });
  const model = path.join(home, 'data', 'models', 'gemma-4-12b-it-Q4_K_M.gguf');
  mkdirSync(path.dirname(model), { recursive: true });
  writeFileSync(model, '');
  const settings = (await call('load_settings')).value;
  await saveSettingsAndReload(browser, { server_config: { ...settings.server_config, model_path: model } });
  await browser.$('textarea[aria-label="Nachricht"]').waitForDisplayed({ timeout: 30_000 });

  const listed = await call('list_llm_benchmarks');
  assert.ok(listed.ok && listed.value.length === 3, `Ergebnisse nicht gelesen: ${JSON.stringify(listed)}`);
  const refused = await call('run_llm_benchmark');
  assert.ok(!refused.ok && refused.error.includes('backend.benchmark.serverNotRunning'), `Messung ohne Modell: ${JSON.stringify(refused)}`);

  await browser.$('button=Einstellungen').click();
  await browser.$('#settings-tab-server').click();
  const card = await browser.$('[data-llm-benchmark]');
  await card.waitForDisplayed({ timeout: 10_000 });
  const latest = await browser.$('[data-bench-latest]').getText();
  assert.ok(latest.includes('85,3') && latest.includes('flüssig'), `Letzte Messung fehlt: ${latest}`);
  assert.ok(latest.includes('2.838') && latest.includes('0,2 s') && latest.includes('9,1 GB'), latest);
  const table = await browser.$('[data-bench-history]').getText();
  assert.ok(table.includes('gemma-4-E4B-it-Q4_K_M') && table.includes('LoRA gemma-4-e4b-heretic') && table.includes('5,4'), table);
  await browser.execute(() => document.querySelector('[data-llm-benchmark]')?.scrollIntoView({ block: 'center' }));
  await browser.pause(400);
  await browser.saveScreenshot(path.join(screenshotDir, '111-llm-benchmark.png'));

  await browser.$('button=Verlauf löschen').click();
  await browser.waitUntil(async () => !(await browser.$('[data-bench-latest]').isExisting()), {
    timeout: 5000,
    timeoutMsg: 'Verlauf nicht gelöscht',
  });
  assert.equal((await call('list_llm_benchmarks')).value.length, 0);
  console.log('LLM-Benchmark: gespeicherte Ergebnisse, Einordnung, Verlauf, Löschen und Sperre ohne laufendes Modell bestanden.');
} finally {
  await close();
}
