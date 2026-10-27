// One user journey, run against the real built extension in each browser.
import { expect } from '@playwright/test';

/** Collects any http(s) request the popup makes. The free core must make none. */
export function watchNetwork(page) {
  const seen = [];
  page.on('request', (r) => { if (/^(https?|wss?):/.test(r.url())) seen.push(r.url()); });
  return seen;
}

/** @param {import('@playwright/test').Page} page */
async function add(page, text, label = '') {
  await page.fill('#add-zone', text);
  await page.fill('#add-label', label);
  await page.click('#add-btn');
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} popupUrl
 */
export async function runScenario(page, popupUrl) {
  const requests = watchNetwork(page);
  await page.goto(popupUrl);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');

  const rows = page.locator('#clocks li.clock');
  await expect(rows.first()).toBeVisible();
  // Start from an empty list.
  while ((await rows.count()) > 0) {
    const before = await rows.count();
    await rows.first().locator('.remove').click();
    await expect(rows).toHaveCount(before - 1);
  }

  await add(page, 'UTC');
  await add(page, 'Tokyo', 'Tokyo office');
  await add(page, 'Asia/Kolkata');
  await add(page, 'new york');
  await add(page, 'Nowhere Land');
  await expect(page.locator('#message')).toContainText('No matching time zone');
  await add(page, 'Paris');
  await expect(rows).toHaveCount(5);
  await expect(page.locator('#add-btn')).toBeDisabled();
  await expect(rows.nth(1).locator('.label')).toHaveText('Tokyo office');
  await expect(rows.nth(3).locator('.label')).toHaveText('New York');
  await expect(rows.locator('.label')).toHaveText(['UTC', 'Tokyo office', 'Kolkata', 'New York', 'Paris']);

  // Converter: 12:00 UTC on 15 Jan 2026.
  await page.selectOption('#conv-zone', 'UTC');
  await page.fill('#conv-date', '2026-01-15');
  await page.fill('#conv-time', '12:00');
  await page.locator('#conv-time').dispatchEvent('change');
  await expect(page.locator('#mode')).toContainText('you picked');
  await expect(rows.nth(1).locator('.time')).toHaveText('21:00');
  await expect(rows.nth(2).locator('.time')).toHaveText('17:30');
  await expect(rows.nth(3).locator('.time')).toHaveText('07:00');
  await expect(rows.nth(4).locator('.time')).toHaveText('13:00');
  await expect(rows.nth(2).locator('.zone')).toContainText('UTC+5:30');

  // Switching the base zone reads the same date and time in the new zone: 12:00 in Tokyo is 03:00 UTC.
  await page.selectOption('#conv-zone', 'Asia/Tokyo');
  await expect(page.locator('#conv-time')).toHaveValue('12:00');
  await expect(rows.nth(0).locator('.time')).toHaveText('03:00');
  await expect(rows.nth(1).locator('.time')).toHaveText('12:00');

  await page.check('#hour12');
  await expect(rows.nth(1).locator('.time')).toHaveText(/12:00\s?PM/i);
  await expect(rows.nth(2).locator('.time')).toHaveText(/8:30\s?AM/i);

  await page.click('#conv-now');
  await expect(page.locator('#mode')).toContainText('current time');

  // Reorder and rename.
  await rows.nth(1).locator('.up').click();
  await expect(rows.nth(0).locator('.label')).toHaveText('Tokyo office');
  await rows.nth(0).locator('.rename').click();
  await rows.nth(0).locator('input.label-edit').fill('Team Tokyo');
  await rows.nth(0).locator('input.label-edit').press('Enter');
  await expect(rows.nth(0).locator('.label')).toHaveText('Team Tokyo');

  // Everything survives a reload from storage.local.
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0).locator('.label')).toHaveText('Team Tokyo');
  await expect(page.locator('#hour12')).toBeChecked();

  // Free list stays usable: removing one frees a slot.
  await rows.nth(4).locator('.remove').click();
  await expect(page.locator('#add-btn')).toBeEnabled();

  expect(requests).toEqual([]);
}
