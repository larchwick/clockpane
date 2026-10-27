// Saves popup screenshots of the Edge build (light and dark) for the authorship proof and listings.
// Usage: node scripts/screenshots.mjs <output dir>
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const out = resolve(process.argv[2] ?? 'screenshots');
const ext = resolve('dist/edge');
const id = [...createHash('sha256').update(ext).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const state = {
  v: 1,
  hour12: false,
  clocks: [
    { id: 'c1', zone: 'Europe/Bucharest', label: 'Home' },
    { id: 'c2', zone: 'America/New_York', label: 'New York team' },
    { id: 'c3', zone: 'Asia/Kolkata', label: '' },
    { id: 'c4', zone: 'Asia/Tokyo', label: 'Tokyo office' },
    { id: 'c5', zone: 'UTC', label: '' },
  ],
};
const profile = await mkdtemp(join(tmpdir(), 'clockpane-shots-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, locale: 'en-US', timezoneId: 'Europe/Bucharest', viewport: { width: 360, height: 600 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
try {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/popup.html`);
  await page.evaluate((s) => /** @type {any} */ (globalThis).chrome.storage.local.set({ clockpane: s }), state);
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await page.waitForSelector('body[data-ready="true"]');
    await page.selectOption('#conv-zone', 'Europe/Bucharest');
    await page.fill('#conv-date', '2026-11-03');
    await page.fill('#conv-time', '16:00');
    await page.locator('#conv-time').dispatchEvent('change');
    await page.locator('body').screenshot({ path: join(out, `popup-converter-${scheme}.png`) });
  }
} finally {
  await ctx.close();
  await rm(profile, { recursive: true, force: true });
}
console.log(`screenshots in ${out}`);
