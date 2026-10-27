// Pro toolbar badge. Shows the time of one chosen clock on the toolbar button and
// updates it once a minute with the alarms API. Reads storage.local only, no network.
// With the free edition, or with no badge clock chosen, the badge is cleared and no
// alarm is kept.

import { badgeText, badgeTitle, msToNextMinute } from './lib/badge.js';
import { activeSet, loadState, STORAGE_KEY } from './lib/store.js';
import { readTier } from './pro/license.js';
import { LICENSE_STORAGE_KEY } from './pro/storedLicense.js';

const g = /** @type {any} */ (globalThis);
const ext = g.browser ?? g.chrome;
const ALARM = 'clockpane-badge';

async function refresh() {
  const area = ext.storage.local;
  const [state, tier] = await Promise.all([loadState(area), readTier(area)]);
  const clock = tier === 'pro' && state.badge !== null ? activeSet(state).clocks.find((c) => c.id === state.badge) : undefined;
  if (!clock) {
    await ext.action.setBadgeText({ text: '' });
    await ext.action.setTitle({ title: 'Clockpane' });
    await ext.alarms.clear(ALARM);
    return;
  }
  const now = new Date();
  await ext.action.setBadgeBackgroundColor({ color: '#0f5c5c' });
  if (typeof ext.action.setBadgeTextColor === 'function') await ext.action.setBadgeTextColor({ color: '#ffffff' });
  await ext.action.setBadgeText({ text: badgeText(now, clock.zone, state.hour12) });
  await ext.action.setTitle({ title: badgeTitle(now, clock, state.hour12) });
  const existing = await ext.alarms.get(ALARM);
  if (!existing) await ext.alarms.create(ALARM, { when: Date.now() + msToNextMinute(now), periodInMinutes: 1 });
}

ext.alarms.onAlarm.addListener((/** @type {{ name: string }} */ alarm) => {
  if (alarm.name === ALARM) void refresh();
});
ext.storage.onChanged.addListener((/** @type {Record<string, unknown>} */ changes, /** @type {string} */ areaName) => {
  if (areaName === 'local' && (STORAGE_KEY in changes || LICENSE_STORAGE_KEY in changes)) void refresh();
});
ext.runtime.onStartup.addListener(() => void refresh());
ext.runtime.onInstalled.addListener(() => void refresh());
