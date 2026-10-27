// Clock sets and settings. Pure functions plus a thin adapter over storage.local.
// Nothing here talks to the network and nothing is synced.
//
// The free edition shows and edits the first FREE_CLOCK_LIMIT clocks of one set. Pro lifts
// the clock limit and adds more sets. Data is never deleted when Pro ends: clocks beyond the
// free limit and extra sets stay saved and come back when Pro is active again.

import { isValidZone, localZone } from './time.js';

/** The free edition holds this many clocks. This limit never goes down. */
export const FREE_CLOCK_LIMIT = 5;
/** Storage guard for Pro and for imports. Far above any real use. */
export const MAX_CLOCKS_PER_SET = 500;
export const MAX_SETS = 50;
export const MAX_LABEL_LENGTH = 40;
export const MAX_SET_NAME_LENGTH = 40;
export const STORAGE_KEY = 'clockpane';
export const STATE_VERSION = 2;
export const DEFAULT_WORK = Object.freeze({ start: 9 * 60, end: 17 * 60 });
export const EXPORT_FORMAT = 'clockpane-export';
export const EXPORT_VERSION = 1;

/**
 * @typedef {{ start: number, end: number }} WorkHours minutes after local midnight, end may be smaller than start (night shift)
 * @typedef {{ id: string, zone: string, label: string, work: WorkHours }} Clock
 * @typedef {{ id: string, name: string, clocks: Clock[] }} ClockSet
 * @typedef {{ v: number, hour12: boolean, sets: ClockSet[], active: string, badge: string | null }} State
 * @typedef {{ ok: true, state: State } | { ok: false, state: State, error: string }} Change
 * @typedef {'free' | 'pro'} Tier
 */

/** @returns {State} */
export function defaultState() {
  const here = localZone();
  /** @type {Clock[]} */
  const clocks = [{ id: 'c1', zone: here, label: '', work: { ...DEFAULT_WORK } }];
  if (here !== 'UTC') clocks.push({ id: 'c2', zone: 'UTC', label: '', work: { ...DEFAULT_WORK } });
  return { v: STATE_VERSION, hour12: false, sets: [{ id: 's1', name: 'My clocks', clocks }], active: 's1', badge: null };
}

/** @param {unknown} label @param {number} max */
function cleanText(label, max) {
  return typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** @param {unknown} v */
function isMinute(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 24 * 60;
}

/** @param {unknown} raw @returns {WorkHours} */
export function cleanWork(raw) {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_WORK };
  const r = /** @type {Record<string, unknown>} */ (raw);
  if (!isMinute(r.start) || !isMinute(r.end) || r.start === r.end) return { ...DEFAULT_WORK };
  return { start: /** @type {number} */ (r.start), end: /** @type {number} */ (r.end) };
}

/**
 * @param {{ id: string }[]} items
 * @param {string} prefix
 */
function nextId(items, prefix) {
  let n = items.length + 1;
  const used = new Set(items.map((c) => c.id));
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** @param {unknown} v */
function okId(v) {
  return typeof v === 'string' && v.length > 0 && v.length < 40 ? v : '';
}

/** @param {unknown} list @returns {Clock[]} */
function cleanClocks(list) {
  /** @type {Clock[]} */
  const clocks = [];
  if (!Array.isArray(list)) return clocks;
  const ids = new Set();
  for (const c of list) {
    if (typeof c !== 'object' || c === null) continue;
    const cc = /** @type {Record<string, unknown>} */ (c);
    if (typeof cc.zone !== 'string' || !isValidZone(cc.zone)) continue;
    let id = okId(cc.id);
    if (!id || ids.has(id)) id = nextId(clocks, 'c');
    ids.add(id);
    clocks.push({ id, zone: cc.zone, label: cleanText(cc.label, MAX_LABEL_LENGTH), work: cleanWork(cc.work) });
    if (clocks.length >= MAX_CLOCKS_PER_SET) break;
  }
  return clocks;
}

/**
 * Turns whatever is in storage into a valid state. Version 1 (one list of clocks) is
 * migrated to one set. Unknown or broken data falls back to the defaults instead of throwing.
 * @param {unknown} raw
 * @returns {State}
 */
export function sanitize(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return defaultState();
  const r = /** @type {Record<string, unknown>} */ (raw);
  if (r.v === 1 && Array.isArray(r.clocks)) {
    return { v: STATE_VERSION, hour12: r.hour12 === true, sets: [{ id: 's1', name: 'My clocks', clocks: cleanClocks(r.clocks) }], active: 's1', badge: null };
  }
  if (r.v !== STATE_VERSION || !Array.isArray(r.sets)) return defaultState();
  /** @type {ClockSet[]} */
  const sets = [];
  for (const s of r.sets) {
    if (typeof s !== 'object' || s === null) continue;
    const ss = /** @type {Record<string, unknown>} */ (s);
    let id = okId(ss.id);
    if (!id || sets.some((x) => x.id === id)) id = nextId(sets, 's');
    sets.push({ id, name: cleanText(ss.name, MAX_SET_NAME_LENGTH) || `Set ${sets.length + 1}`, clocks: cleanClocks(ss.clocks) });
    if (sets.length >= MAX_SETS) break;
  }
  if (sets.length === 0) return defaultState();
  const active = sets.some((s) => s.id === r.active) ? /** @type {string} */ (r.active) : sets[0].id;
  const activeClocks = /** @type {ClockSet} */ (sets.find((s) => s.id === active)).clocks;
  const badge = typeof r.badge === 'string' && activeClocks.some((c) => c.id === r.badge) ? r.badge : null;
  return { v: STATE_VERSION, hour12: r.hour12 === true, sets, active, badge };
}

/** @param {State} state @returns {ClockSet} */
export function activeSet(state) {
  return state.sets.find((s) => s.id === state.active) ?? state.sets[0];
}

/** @param {Tier} tier */
export function clockLimit(tier) {
  return tier === 'pro' ? MAX_CLOCKS_PER_SET : FREE_CLOCK_LIMIT;
}

/**
 * The clocks this tier can see and edit in the active set.
 * @param {State} state
 * @param {Tier} tier
 */
export function visibleClocks(state, tier) {
  const clocks = activeSet(state).clocks;
  return tier === 'pro' ? clocks : clocks.slice(0, FREE_CLOCK_LIMIT);
}

/** Clocks kept in storage that the free edition does not show. @param {State} state @param {Tier} tier */
export function hiddenClockCount(state, tier) {
  if (tier === 'pro') return 0;
  const inActive = Math.max(0, activeSet(state).clocks.length - FREE_CLOCK_LIMIT);
  return inActive;
}

/**
 * @param {State} state
 * @param {(clocks: Clock[]) => Clock[]} fn
 * @returns {State}
 */
function withClocks(state, fn) {
  const set = activeSet(state);
  const clocks = fn(set.clocks);
  const badge = state.badge !== null && clocks.some((c) => c.id === state.badge) ? state.badge : null;
  return { ...state, badge, sets: state.sets.map((s) => (s.id === set.id ? { ...s, clocks } : s)) };
}

/**
 * @param {State} state
 * @param {string} zone
 * @param {string} [label]
 * @param {Tier} [tier]
 * @returns {Change}
 */
export function addClock(state, zone, label = '', tier = 'free') {
  if (!isValidZone(zone)) return { ok: false, state, error: 'Unknown time zone.' };
  const limit = clockLimit(tier);
  if (activeSet(state).clocks.length >= limit) {
    const error = tier === 'pro'
      ? `This set is full (${limit} clocks).`
      : `The free edition holds ${FREE_CLOCK_LIMIT} clocks. Remove one to add another, or get Pro for unlimited clocks.`;
    return { ok: false, state, error };
  }
  return { ok: true, state: withClocks(state, (clocks) => [...clocks, { id: nextId(clocks, 'c'), zone, label: cleanText(label, MAX_LABEL_LENGTH), work: { ...DEFAULT_WORK } }]) };
}

/** @param {State} state @param {string} id */
function has(state, id) {
  return activeSet(state).clocks.some((c) => c.id === id);
}

/**
 * @param {State} state
 * @param {string} id
 * @returns {Change}
 */
export function removeClock(state, id) {
  if (!has(state, id)) return { ok: false, state, error: 'No such clock.' };
  return { ok: true, state: withClocks(state, (clocks) => clocks.filter((c) => c.id !== id)) };
}

/**
 * Moves a clock up (-1) or down (+1).
 * @param {State} state
 * @param {string} id
 * @param {-1 | 1} delta
 * @returns {Change}
 */
export function moveClock(state, id, delta) {
  const list = activeSet(state).clocks;
  const i = list.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return { ok: false, state, error: 'Cannot move further.' };
  return {
    ok: true,
    state: withClocks(state, (clocks) => {
      const next = [...clocks];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    }),
  };
}

/**
 * @param {State} state
 * @param {string} id
 * @param {string} label
 * @returns {Change}
 */
export function renameClock(state, id, label) {
  if (!has(state, id)) return { ok: false, state, error: 'No such clock.' };
  const clean = cleanText(label, MAX_LABEL_LENGTH);
  return { ok: true, state: withClocks(state, (clocks) => clocks.map((c) => (c.id === id ? { ...c, label: clean } : c))) };
}

/**
 * Pro: working hours of one clock, in minutes after its local midnight.
 * @param {State} state
 * @param {string} id
 * @param {number} start
 * @param {number} end
 * @returns {Change}
 */
export function setWorkHours(state, id, start, end) {
  if (!has(state, id)) return { ok: false, state, error: 'No such clock.' };
  if (!isMinute(start) || !isMinute(end) || start === end) return { ok: false, state, error: 'Start and end must be different times.' };
  return { ok: true, state: withClocks(state, (clocks) => clocks.map((c) => (c.id === id ? { ...c, work: { start, end } } : c))) };
}

/**
 * @param {State} state
 * @param {boolean} hour12
 * @returns {State}
 */
export function setHour12(state, hour12) {
  return { ...state, hour12: hour12 === true };
}

/**
 * Pro: the clock shown on the toolbar badge, or null for no badge.
 * @param {State} state
 * @param {string | null} id
 * @returns {Change}
 */
export function setBadge(state, id) {
  if (id !== null && !has(state, id)) return { ok: false, state, error: 'No such clock.' };
  return { ok: true, state: { ...state, badge: id } };
}

/**
 * Pro: adds a named set, empty or with a copy of the active set's clocks, and switches to it.
 * @param {State} state
 * @param {string} name
 * @param {boolean} copyActive
 * @returns {Change}
 */
export function addSet(state, name, copyActive) {
  const clean = cleanText(name, MAX_SET_NAME_LENGTH);
  if (!clean) return { ok: false, state, error: 'Give the set a name.' };
  if (state.sets.length >= MAX_SETS) return { ok: false, state, error: `There can be at most ${MAX_SETS} sets.` };
  const id = nextId(state.sets, 's');
  const clocks = copyActive ? activeSet(state).clocks.map((c) => ({ ...c, work: { ...c.work } })) : [];
  return { ok: true, state: { ...state, sets: [...state.sets, { id, name: clean, clocks }], active: id, badge: null } };
}

/**
 * @param {State} state
 * @param {string} id
 * @returns {Change}
 */
export function switchSet(state, id) {
  if (!state.sets.some((s) => s.id === id)) return { ok: false, state, error: 'No such set.' };
  if (id === state.active) return { ok: true, state };
  return { ok: true, state: { ...state, active: id, badge: null } };
}

/**
 * @param {State} state
 * @param {string} id
 * @param {string} name
 * @returns {Change}
 */
export function renameSet(state, id, name) {
  const clean = cleanText(name, MAX_SET_NAME_LENGTH);
  if (!clean) return { ok: false, state, error: 'Give the set a name.' };
  if (!state.sets.some((s) => s.id === id)) return { ok: false, state, error: 'No such set.' };
  return { ok: true, state: { ...state, sets: state.sets.map((s) => (s.id === id ? { ...s, name: clean } : s)) } };
}

/**
 * @param {State} state
 * @param {string} id
 * @returns {Change}
 */
export function removeSet(state, id) {
  if (!state.sets.some((s) => s.id === id)) return { ok: false, state, error: 'No such set.' };
  if (state.sets.length === 1) return { ok: false, state, error: 'The last set cannot be removed.' };
  const sets = state.sets.filter((s) => s.id !== id);
  const switching = state.active === id;
  return { ok: true, state: { ...state, sets, active: switching ? sets[0].id : state.active, badge: switching ? null : state.badge } };
}

/** @param {number} m */
function hhmm(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** @param {unknown} v @returns {number | undefined} */
function parseHhmm(v) {
  const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
  if (!m) return undefined;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : undefined;
}

/**
 * Pro: everything the user set up, as a plain JSON object. Holds no license data.
 * @param {State} state
 * @param {Date} now
 */
export function exportData(state, now) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    hour12: state.hour12,
    sets: state.sets.map((s) => ({
      name: s.name,
      clocks: s.clocks.map((c) => ({ zone: c.zone, label: c.label, workStart: hhmm(c.work.start), workEnd: hhmm(c.work.end) })),
    })),
  };
}

/**
 * Pro: adds the sets from an export file next to the existing ones. Never replaces or
 * deletes anything. Unknown zones are skipped and counted.
 * @param {State} state
 * @param {unknown} raw parsed JSON
 * @returns {Change & { added?: number, skipped?: number }}
 */
export function importData(state, raw) {
  const r = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? /** @type {Record<string, unknown>} */ (raw) : null;
  if (!r || r.format !== EXPORT_FORMAT || r.version !== EXPORT_VERSION || !Array.isArray(r.sets)) {
    return { ok: false, state, error: 'This is not a Clockpane export file.' };
  }
  let sets = [...state.sets];
  let added = 0;
  let skipped = 0;
  for (const s of r.sets) {
    if (sets.length >= MAX_SETS) { skipped += 1; continue; }
    if (typeof s !== 'object' || s === null) { skipped += 1; continue; }
    const ss = /** @type {Record<string, unknown>} */ (s);
    const list = Array.isArray(ss.clocks) ? ss.clocks : [];
    const mapped = list.map((c) => {
      const cc = typeof c === 'object' && c !== null ? /** @type {Record<string, unknown>} */ (c) : {};
      return { zone: cc.zone, label: cc.label, work: { start: parseHhmm(cc.workStart), end: parseHhmm(cc.workEnd) } };
    });
    const clocks = cleanClocks(mapped);
    skipped += Math.max(0, Math.min(list.length, MAX_CLOCKS_PER_SET) - clocks.length);
    let name = cleanText(ss.name, MAX_SET_NAME_LENGTH) || 'Imported';
    if (sets.some((x) => x.name === name)) name = `${name} (imported)`.slice(0, MAX_SET_NAME_LENGTH);
    sets = [...sets, { id: nextId(sets, 's'), name, clocks }];
    added += 1;
  }
  if (added === 0) return { ok: false, state, error: 'The file has no sets that could be added.' };
  return { ok: true, state: { ...state, sets }, added, skipped };
}

/**
 * @typedef {{ get: (key: string) => Promise<Record<string, unknown>>, set: (items: Record<string, unknown>) => Promise<void> }} StorageArea
 */

/** @param {StorageArea} area */
export async function loadState(area) {
  const got = await area.get(STORAGE_KEY);
  return got && STORAGE_KEY in got ? sanitize(got[STORAGE_KEY]) : defaultState();
}

/**
 * @param {StorageArea} area
 * @param {State} state
 */
export async function saveState(area, state) {
  await area.set({ [STORAGE_KEY]: state });
}
