import { describe, expect, it } from 'vitest';
import {
  activeSet, addClock, addSet, defaultState, exportData, FREE_CLOCK_LIMIT, hiddenClockCount, importData, loadState,
  MAX_LABEL_LENGTH, MAX_SETS, moveClock, removeClock, removeSet, renameClock, renameSet, sanitize, saveState, setBadge,
  setHour12, setWorkHours, STATE_VERSION, STORAGE_KEY, switchSet, visibleClocks,
} from '../extension/lib/store.js';

const W = { start: 540, end: 1020 };
/** @returns {import('../extension/lib/store.js').State} */
const base = () => ({ v: 2, hour12: false, sets: [{ id: 's1', name: 'My clocks', clocks: [{ id: 'c1', zone: 'UTC', label: '', work: { ...W } }] }], active: 's1', badge: null });
const ZONES = ['Asia/Tokyo', 'Europe/Paris', 'America/Chicago', 'Asia/Kolkata', 'Europe/Bucharest', 'Australia/Sydney', 'America/Sao_Paulo'];

function memoryArea() {
  /** @type {Record<string, unknown>} */
  const data = {};
  return {
    data,
    get: async (/** @type {string} */ key) => (key in data ? { [key]: data[key] } : {}),
    set: async (/** @type {Record<string, unknown>} */ items) => { Object.assign(data, structuredClone(items)); },
  };
}

/** @param {import('../extension/lib/store.js').State} s @param {number} n @param {'free' | 'pro'} tier */
function fill(s, n, tier) {
  for (const z of ZONES.slice(0, n)) {
    const r = addClock(s, z, '', tier);
    if (!r.ok) return r;
    s = r.state;
  }
  return { ok: true, state: s };
}

describe('store basics', () => {
  it('starts with one set holding the local zone and UTC', () => {
    const s = defaultState();
    expect(s.v).toBe(STATE_VERSION);
    expect(s.sets).toHaveLength(1);
    expect(activeSet(s).clocks.some((c) => c.zone === 'UTC')).toBe(true);
    expect(activeSet(s).clocks[0].work).toEqual(W);
  });
  it('rejects unknown zones', () => {
    expect(addClock(base(), 'Nowhere/Here').ok).toBe(false);
  });
  it('removes, moves and renames', () => {
    let s = addClock(base(), 'Asia/Tokyo', 'Office').state;
    const clocks = () => activeSet(s).clocks;
    s = moveClock(s, clocks()[1].id, -1).state;
    expect(clocks()[0].zone).toBe('Asia/Tokyo');
    expect(moveClock(s, clocks()[0].id, -1).ok).toBe(false);
    s = renameClock(s, clocks()[0].id, '  Tokyo   team  ').state;
    expect(clocks()[0].label).toBe('Tokyo team');
    s = renameClock(s, clocks()[0].id, 'x'.repeat(99)).state;
    expect(clocks()[0].label).toHaveLength(MAX_LABEL_LENGTH);
    s = removeClock(s, clocks()[0].id).state;
    expect(clocks().map((c) => c.zone)).toEqual(['UTC']);
    expect(removeClock(s, 'nope').ok).toBe(false);
  });
  it('toggles 12 hour time', () => {
    expect(setHour12(base(), true).hour12).toBe(true);
  });
  it('saves and loads through storage.local', async () => {
    const area = memoryArea();
    expect(activeSet(await loadState(area)).clocks.length).toBeGreaterThan(0);
    const s = addClock(base(), 'Asia/Tokyo').state;
    await saveState(area, s);
    expect(area.data[STORAGE_KEY]).toEqual(s);
    expect(await loadState(area)).toEqual(s);
  });
});

describe('free and Pro clock limits', () => {
  it('free stops at 5 and explains why', () => {
    const r = fill(base(), 4, 'free');
    expect(activeSet(r.state).clocks).toHaveLength(FREE_CLOCK_LIMIT);
    const full = addClock(r.state, 'Europe/Bucharest');
    expect(full.ok).toBe(false);
    expect(full.ok ? '' : full.error).toMatch(/free edition holds 5 clocks/);
  });
  it('Pro goes past 5', () => {
    const r = fill(base(), 7, 'pro');
    expect(r.ok).toBe(true);
    expect(activeSet(r.state).clocks).toHaveLength(8);
    expect(new Set(activeSet(r.state).clocks.map((c) => c.id)).size).toBe(8);
  });
  it('keeps Pro clocks when Pro lapses and shows the first 5', () => {
    const s = fill(base(), 7, 'pro').state;
    expect(visibleClocks(s, 'free')).toHaveLength(5);
    expect(hiddenClockCount(s, 'free')).toBe(3);
    expect(hiddenClockCount(s, 'pro')).toBe(0);
    expect(visibleClocks(s, 'pro')).toHaveLength(8);
    expect(addClock(s, 'UTC', '', 'free').ok).toBe(false);
    expect(activeSet(sanitize(structuredClone(s))).clocks).toHaveLength(8);
  });
});

describe('Pro sets, working hours and badge', () => {
  it('creates, copies, switches, renames and removes sets', () => {
    let s = addSet(base(), 'Team', false).state;
    expect(s.sets).toHaveLength(2);
    expect(activeSet(s).name).toBe('Team');
    expect(activeSet(s).clocks).toEqual([]);
    s = switchSet(s, 's1').state;
    s = addSet(s, 'Copy', true).state;
    expect(activeSet(s).clocks.map((c) => c.zone)).toEqual(['UTC']);
    expect(addSet(s, '   ', false).ok).toBe(false);
    s = renameSet(s, s.active, 'Family').state;
    expect(activeSet(s).name).toBe('Family');
    s = removeSet(s, s.active).state;
    expect(s.sets.map((x) => x.name)).toEqual(['My clocks', 'Team']);
    expect(s.active).toBe('s1');
    expect(removeSet(removeSet(s, 's2').state, 's1').ok).toBe(false);
    expect(switchSet(s, 'nope').ok).toBe(false);
  });
  it('caps the number of sets', () => {
    let s = base();
    for (let i = 1; i < MAX_SETS; i += 1) s = addSet(s, `Set ${i}`, false).state;
    expect(s.sets).toHaveLength(MAX_SETS);
    expect(addSet(s, 'One more', false).ok).toBe(false);
  });
  it('sets working hours, including a night shift', () => {
    let s = setWorkHours(base(), 'c1', 22 * 60, 6 * 60).state;
    expect(activeSet(s).clocks[0].work).toEqual({ start: 1320, end: 360 });
    expect(setWorkHours(s, 'c1', 600, 600).ok).toBe(false);
    expect(setWorkHours(s, 'c1', -1, 600).ok).toBe(false);
    expect(setWorkHours(s, 'zz', 1, 600).ok).toBe(false);
    s = sanitize({ ...s, sets: [{ ...s.sets[0], clocks: [{ id: 'c1', zone: 'UTC', work: { start: 'x', end: 3 } }] }] });
    expect(activeSet(s).clocks[0].work).toEqual(W);
  });
  it('picks a badge clock and drops it when the clock or set goes away', () => {
    let s = setBadge(base(), 'c1').state;
    expect(s.badge).toBe('c1');
    expect(setBadge(s, 'nope').ok).toBe(false);
    expect(removeClock(s, 'c1').state.badge).toBeNull();
    expect(addSet(s, 'Other', false).state.badge).toBeNull();
    expect(setBadge(s, null).state.badge).toBeNull();
  });
});

describe('migration and repair', () => {
  it('migrates version 1 into one set and keeps every clock', () => {
    const s = sanitize({ v: 1, hour12: true, clocks: [{ id: 'a', zone: 'UTC', label: 'Home' }, { id: 'b', zone: 'Asia/Tokyo', label: '' }] });
    expect(s.v).toBe(2);
    expect(s.hour12).toBe(true);
    expect(s.sets).toHaveLength(1);
    expect(activeSet(s).clocks.map((c) => [c.id, c.zone, c.label])).toEqual([['a', 'UTC', 'Home'], ['b', 'Asia/Tokyo', '']]);
    expect(activeSet(s).clocks[0].work).toEqual(W);
  });
  it('repairs broken storage instead of throwing', () => {
    expect(sanitize(null).sets).toHaveLength(1);
    expect(sanitize({ v: 99, clocks: [] }).sets).toHaveLength(1);
    const s = sanitize({ v: 2, hour12: 'yes', active: 'zz', badge: 'c9', sets: [{ id: 's1', name: '', clocks: [{ id: 'a', zone: 'Bad/Zone' }, { id: 'a', zone: 'UTC' }, { id: 'a', zone: 'Asia/Tokyo' }, 7] }, 'x'] });
    expect(s.hour12).toBe(false);
    expect(s.active).toBe('s1');
    expect(s.badge).toBeNull();
    expect(activeSet(s).name).toBe('Set 1');
    expect(activeSet(s).clocks.map((c) => c.zone)).toEqual(['UTC', 'Asia/Tokyo']);
    expect(new Set(activeSet(s).clocks.map((c) => c.id)).size).toBe(2);
  });
});

describe('export and import', () => {
  it('round trips sets, labels and working hours', () => {
    let s = addClock(base(), 'Asia/Tokyo', 'Office', 'pro').state;
    s = setWorkHours(s, activeSet(s).clocks[1].id, 8 * 60 + 30, 18 * 60).state;
    s = addSet(s, 'Family', false).state;
    s = addClock(s, 'Europe/Paris', 'Mum', 'pro').state;
    const file = JSON.parse(JSON.stringify(exportData(s, new Date('2026-10-27T20:00:00Z'))));
    expect(file.format).toBe('clockpane-export');
    expect(file.exportedAt).toBe('2026-10-27T20:00:00.000Z');
    expect(file.sets[0].clocks[1]).toEqual({ zone: 'Asia/Tokyo', label: 'Office', workStart: '08:30', workEnd: '18:00' });
    expect(JSON.stringify(file)).not.toMatch(/license|key/i);
    const r = importData(defaultState(), file);
    expect(r.ok).toBe(true);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(0);
    const imported = r.state.sets.slice(1);
    expect(imported.map((x) => x.name)).toEqual(['My clocks (imported)', 'Family']);
    expect(imported[0].clocks[1]).toMatchObject({ zone: 'Asia/Tokyo', label: 'Office', work: { start: 510, end: 1080 } });
  });
  it('skips bad clocks, keeps existing data and rejects other files', () => {
    const r = importData(base(), { format: 'clockpane-export', version: 1, sets: [{ name: 'X', clocks: [{ zone: 'UTC', workStart: '25:00' }, { zone: 'Bad/Zone' }] }, 5] });
    expect(r.ok).toBe(true);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(2);
    expect(r.state.sets[0]).toEqual(base().sets[0]);
    expect(r.state.sets[1].clocks[0].work).toEqual(W);
    expect(importData(base(), { format: 'other' }).ok).toBe(false);
    expect(importData(base(), null).ok).toBe(false);
    expect(importData(base(), { format: 'clockpane-export', version: 1, sets: [] }).ok).toBe(false);
  });
});
