import { describe, expect, it } from 'vitest';
import {
  addClock, defaultState, FREE_CLOCK_LIMIT, loadState, MAX_LABEL_LENGTH, moveClock, removeClock,
  renameClock, sanitize, saveState, setHour12, STORAGE_KEY,
} from '../extension/lib/store.js';

const base = () => ({ v: 1, clocks: [{ id: 'c1', zone: 'UTC', label: '' }], hour12: false });

function memoryArea() {
  /** @type {Record<string, unknown>} */
  const data = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (items) => { Object.assign(data, structuredClone(items)); },
  };
}

describe('store', () => {
  it('starts with the local zone and UTC', () => {
    const s = defaultState();
    expect(s.clocks.length).toBeGreaterThanOrEqual(1);
    expect(s.clocks.some((c) => c.zone === 'UTC')).toBe(true);
  });
  it('adds up to the free limit of 5 and then explains why it stops', () => {
    let s = { ...base(), clocks: [] };
    for (const z of ['UTC', 'Asia/Tokyo', 'Europe/Paris', 'America/Chicago', 'Asia/Kolkata']) {
      const r = addClock(s, z);
      expect(r.ok).toBe(true);
      s = r.state;
    }
    expect(s.clocks).toHaveLength(FREE_CLOCK_LIMIT);
    const full = addClock(s, 'Europe/Bucharest');
    expect(full.ok).toBe(false);
    expect(full.ok ? '' : full.error).toMatch(/full/);
    expect(new Set(s.clocks.map((c) => c.id)).size).toBe(5);
  });
  it('rejects unknown zones', () => {
    expect(addClock(base(), 'Nowhere/Here').ok).toBe(false);
  });
  it('removes, moves and renames', () => {
    let s = addClock(base(), 'Asia/Tokyo', 'Office').state;
    s = moveClock(s, s.clocks[1].id, -1).state;
    expect(s.clocks[0].zone).toBe('Asia/Tokyo');
    expect(moveClock(s, s.clocks[0].id, -1).ok).toBe(false);
    s = renameClock(s, s.clocks[0].id, '  Tokyo   team  ').state;
    expect(s.clocks[0].label).toBe('Tokyo team');
    s = renameClock(s, s.clocks[0].id, 'x'.repeat(99)).state;
    expect(s.clocks[0].label).toHaveLength(MAX_LABEL_LENGTH);
    s = removeClock(s, s.clocks[0].id).state;
    expect(s.clocks.map((c) => c.zone)).toEqual(['UTC']);
    expect(removeClock(s, 'nope').ok).toBe(false);
  });
  it('toggles 12 hour time', () => {
    expect(setHour12(base(), true).hour12).toBe(true);
  });
  it('repairs broken storage instead of throwing', () => {
    expect(sanitize(null).clocks.length).toBeGreaterThan(0);
    expect(sanitize({ v: 99, clocks: [] }).clocks.length).toBeGreaterThan(0);
    const s = sanitize({ v: 1, hour12: 'yes', clocks: [{ id: 'a', zone: 'Bad/Zone' }, { id: 'a', zone: 'UTC' }, { id: 'a', zone: 'Asia/Tokyo' }, 7] });
    expect(s.hour12).toBe(false);
    expect(s.clocks.map((c) => c.zone)).toEqual(['UTC', 'Asia/Tokyo']);
    expect(new Set(s.clocks.map((c) => c.id)).size).toBe(2);
    const many = sanitize({ v: 1, clocks: Array.from({ length: 9 }, () => ({ zone: 'UTC' })) });
    expect(many.clocks).toHaveLength(FREE_CLOCK_LIMIT);
  });
  it('saves and loads through storage.local', async () => {
    const area = memoryArea();
    expect((await loadState(area)).clocks.length).toBeGreaterThan(0);
    const s = addClock(base(), 'Asia/Tokyo').state;
    await saveState(area, s);
    expect(area.data[STORAGE_KEY]).toEqual(s);
    expect(await loadState(area)).toEqual(s);
  });
});
