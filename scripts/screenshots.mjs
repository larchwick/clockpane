// Saves popup screenshots of the Edge build (light and dark, plus the Pro planner) for listings.
// Usage: node scripts/screenshots.mjs <output dir>
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { GUMROAD_PRODUCT_ID } from '../extension/pro/gumroad.js';
import { LICENSE_STORAGE_KEY, serializeStoredLicense } from '../extension/pro/storedLicense.js';

const seedLicense = serializeStoredLicense({
  productId: GUMROAD_PRODUCT_ID ?? 'unused',
  licenseKey: 'SHOTS-KEY-0001',
  saleId: 'shots',
  uses: 1,
  mode: 'activation',
  checkedAt: '2026-11-03T20:00:00.000Z',
});

const out = resolve(process.argv[2] ?? 'screenshots');
const ext = resolve('dist/edge');
const id = [...createHash('sha256').update(ext).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');

const work = { start: 9 * 60, end: 17 * 60 };
/** Five clocks for the free converter shots. Neutral world set. */
const freeClocks = [
  { id: 'c1', zone: 'America/New_York', label: 'New York team', work },
  { id: 'c2', zone: 'Europe/London', label: 'London', work },
  { id: 'c3', zone: 'Asia/Tokyo', label: 'Tokyo office', work },
  { id: 'c4', zone: 'Asia/Kolkata', label: '', work },
  { id: 'c5', zone: 'UTC', label: '', work },
];
/** Six clocks for the Pro planner shot, same cities as a typical meeting set. */
const proClocks = [
  { id: 'c1', zone: 'Europe/London', label: 'London', work },
  { id: 'c2', zone: 'America/New_York', label: 'New York', work },
  { id: 'c3', zone: 'Asia/Kolkata', label: 'Kolkata', work },
  { id: 'c4', zone: 'Asia/Tokyo', label: 'Tokyo', work },
  { id: 'c5', zone: 'Australia/Sydney', label: 'Sydney', work },
  { id: 'c6', zone: 'UTC', label: 'UTC', work },
];

/** @param {typeof freeClocks} clocks */
function stateOf(clocks) {
  return { v: 2, hour12: false, sets: [{ id: 's1', name: 'My clocks', clocks }], active: 's1', badge: null };
}

const profile = await mkdtemp(join(tmpdir(), 'clockpane-shots-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  locale: 'en-US',
  timezoneId: 'America/New_York',
  viewport: { width: 360, height: 900 },
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
try {
  const page = await ctx.newPage();
  const popup = `chrome-extension://${id}/popup.html`;

  await page.goto(popup);
  await page.evaluate((s) => /** @type {any} */ (globalThis).chrome.storage.local.set({ clockpane: s }), stateOf(freeClocks));
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.reload();
    await page.waitForSelector('body[data-ready="true"]');
    await page.selectOption('#conv-zone', 'America/New_York');
    await page.fill('#conv-date', '2026-11-03');
    await page.fill('#conv-time', '16:00');
    await page.locator('#conv-time').dispatchEvent('change');
    await page.locator('body').screenshot({ path: join(out, `popup-converter-${scheme}.png`) });
  }

  await page.evaluate((payload) => {
    const { state, key, license } = payload;
    /** @type {any} */ (globalThis).chrome.storage.local.set({ clockpane: state, [key]: license });
  }, { state: stateOf(proClocks), key: LICENSE_STORAGE_KEY, license: seedLicense });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  await page.waitForSelector('#tier.pro');
  await page.selectOption('#conv-zone', 'Europe/London');
  await page.fill('#conv-date', '2026-11-03');
  await page.fill('#conv-time', '14:00');
  await page.locator('#conv-time').dispatchEvent('change');
  await page.click('#planner-toggle');
  await page.waitForSelector('#planner:not([hidden])');
  await page.locator('body').screenshot({ path: join(out, 'popup-planner-pro.png') });
} finally {
  await ctx.close();
  await rm(profile, { recursive: true, force: true });
}
console.log(`screenshots in ${out}`);
