// Pro journey against the real built extension in Chromium (Edge build). A license is
// written straight into storage.local, the same record a successful Gumroad check stores,
// so no key and no network call are needed. The consent screen is checked to send nothing
// when cancelled.
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { GUMROAD_PRODUCT_ID } from '../extension/pro/gumroad.js';
import { LICENSE_STORAGE_KEY, serializeStoredLicense } from '../extension/pro/storedLicense.js';
import { watchNetwork } from './scenario.js';

export const SEEDED_LICENSE = serializeStoredLicense({
  productId: GUMROAD_PRODUCT_ID, licenseKey: 'E2E-TEST-KEY-0001', saleId: 'e2e', uses: 1, mode: 'activation', checkedAt: '2026-10-27T20:00:00.000Z',
});

/** @param {import('@playwright/test').Page} page */
async function ready(page) {
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
}

/** @param {import('@playwright/test').Page} page @param {string} text */
async function add(page, text) {
  await page.fill('#add-zone', text);
  await page.click('#add-btn');
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} base chrome-extension://<id>
 */
export async function runProScenario(context, base) {
  const options = await context.newPage();
  const net = watchNetwork(options);
  await options.goto(`${base}/options.html`);
  await ready(options);
  await expect(options.locator('#lic-status')).toHaveText('Free edition.');
  await expect(options.locator('#pro')).toHaveAttribute('disabled', '');
  await expect(options.locator('#pro-note')).toBeVisible();
  await expect(options.locator('#buy')).toHaveAttribute('href', 'https://larchwick.gumroad.com/l/sysaii');

  // Consent comes first and Cancel sends nothing.
  await options.fill('#lic-key', 'NOT-A-REAL-KEY');
  await options.click('#lic-activate');
  await expect(options.locator('#consent')).toBeVisible();
  await expect(options.locator('#consent-text')).toContainText('api.gumroad.com');
  await expect(options.locator('#consent-text')).toContainText('It sends nothing else');
  await options.click('#consent-cancel');
  await expect(options.locator('#consent')).toBeHidden();
  await expect(options.locator('#lic-msg')).toHaveText('Cancelled. Nothing was sent.');

  // A stored license turns Pro on, with no network.
  await options.evaluate(([k, v]) => /** @type {any} */ (globalThis).chrome.storage.local.set({ [k]: v }), [LICENSE_STORAGE_KEY, SEEDED_LICENSE]);
  await expect(options.locator('#lic-status')).toHaveText('Pro is active in this browser.');
  await expect(options.locator('#lic-masked')).toHaveText('****0001');
  await expect(options.locator('#pro')).not.toHaveAttribute('disabled');

  const popup = await context.newPage();
  const popupNet = watchNetwork(popup);
  await popup.goto(`${base}/popup.html`);
  await ready(popup);
  await expect(popup.locator('#tier')).toHaveText('Pro');
  const rows = popup.locator('#clocks li.clock');
  while ((await rows.count()) > 0) {
    const n = await rows.count();
    await rows.first().locator('.remove').click();
    await expect(rows).toHaveCount(n - 1);
  }
  for (const z of ['UTC', 'London', 'New York', 'Tokyo', 'Kolkata', 'Paris', 'Sydney']) await add(popup, z);
  await expect(rows).toHaveCount(7);
  await expect(popup.locator('#add-btn')).toBeEnabled();
  await expect(popup.locator('#pro-pitch')).toBeHidden();

  // Meeting planner for 3 Nov 2026 in London: London and New York overlap 14:00 to 17:00.
  await popup.click('#planner-toggle');
  await expect(popup.locator('#planner')).toBeVisible();
  await popup.selectOption('#conv-zone', 'Europe/London');
  await popup.fill('#conv-date', '2026-11-03');
  await popup.fill('#conv-time', '10:00');
  await popup.locator('#conv-time').dispatchEvent('change');
  await expect(popup.locator('#planner-grid .pl-row')).toHaveCount(8);
  await expect(popup.locator('#planner-grid .pl-head .pl-cell')).toHaveCount(24);
  await expect(popup.locator('#planner-summary')).toContainText('No hour suits everyone. Best (');
  await popup.locator('#planner-grid .pl-head .pl-cell', { hasText: /^14$/ }).click();
  await expect(popup.locator('#conv-time')).toHaveValue('14:00');
  await expect(rows.nth(2).locator('.time')).toHaveText('09:00');

  // Sets, working hours and badge from the options page.
  await expect(options.locator('#work-rows tr')).toHaveCount(7);
  await options.locator('#work-rows tr').nth(0).locator('.work-start').fill('08:00');
  await options.locator('#work-rows tr').nth(0).locator('.work-start').dispatchEvent('change');
  await expect(options.locator('#msg')).toHaveText('Working hours saved.');
  await options.selectOption('#badge-clock', { index: 2 });
  await expect(options.locator('#msg')).toContainText('toolbar button');
  await expect.poll(() => popup.evaluate(() => /** @type {any} */ (globalThis).chrome.action.getBadgeText({})), { timeout: 10_000 }).toMatch(/^\d{2}:\d{2}$/);
  const title = await popup.evaluate(() => /** @type {any} */ (globalThis).chrome.action.getTitle({}));
  expect(title).toMatch(/^Clockpane: London \d{2}:\d{2}/);

  await options.fill('#set-name', 'Family');
  await options.click('#set-new');
  await expect(options.locator('#set-select option')).toHaveCount(2);
  await expect(popup.locator('#set-select option')).toHaveCount(2);
  await expect(rows).toHaveCount(0);
  await expect.poll(() => popup.evaluate(() => /** @type {any} */ (globalThis).chrome.action.getBadgeText({}))).toBe('');
  await add(popup, 'Bucharest');
  await expect(rows).toHaveCount(1);
  await popup.selectOption('#set-select', { label: 'My clocks (7)' });
  await expect(rows).toHaveCount(7);

  // Export, then import the same file: the two sets come back as copies.
  const [download] = await Promise.all([options.waitForEvent('download'), options.click('#export')]);
  const path = await download.path();
  const file = JSON.parse(await readFile(path, 'utf8'));
  expect(file.format).toBe('clockpane-export');
  expect(file.sets.map((/** @type {any} */ s) => s.name)).toEqual(['My clocks', 'Family']);
  expect(file.sets[0].clocks[0]).toMatchObject({ zone: 'UTC', workStart: '08:00', workEnd: '17:00' });
  expect(JSON.stringify(file)).not.toContain('E2E-TEST-KEY');
  await options.setInputFiles('#import', path);
  await expect(options.locator('#msg')).toHaveText('Imported 2 sets.');
  await expect(options.locator('#set-select option')).toHaveCount(4);

  // Removing the license keeps the data and shows the first 5 clocks again.
  await options.click('#lic-remove');
  await expect(options.locator('#lic-status')).toHaveText('Free edition.');
  await expect(options.locator('#pro')).toHaveAttribute('disabled', '');
  await expect(popup.locator('#tier')).toHaveText('');
  await expect(rows).toHaveCount(5);
  await expect(popup.locator('#hidden-note')).toHaveText('2 more saved clocks are kept and come back with Pro.');
  await expect(popup.locator('#add-btn')).toBeDisabled();
  await expect(popup.locator('#pro-pitch')).toBeVisible();
  await popup.click('#planner-toggle');
  await expect(popup.locator('#planner')).toBeHidden();

  expect(net).toEqual([]);
  expect(popupNet).toEqual([]);
}
