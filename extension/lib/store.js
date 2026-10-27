// Clock list state. Pure functions plus a thin adapter over storage.local.
// Nothing here talks to the network and nothing is synced.

import { isValidZone, localZone } from './time.js';

/** The free edition holds this many clocks. This limit never goes down. */
export const FREE_CLOCK_LIMIT = 5;
export const MAX_LABEL_LENGTH = 40;
export const STORAGE_KEY = 'clockpane';
export const STATE_VERSION = 1;

/**
 * @typedef {{ id: string, zone: string, label: string }} Clock
 * @typedef {{ v: number, clocks: Clock[], hour12: boolean }} State
 * @typedef {{ ok: true, state: State } | { ok: false, state: State, error: string }} Change
 */

/** @returns {State} */
export function defaultState() {
  const here = localZone();
  /** @type {Clock[]} */
  const clocks = [{ id: 'c1', zone: here, label: '' }];
  if (here !== 'UTC') clocks.push({ id: 'c2', zone: 'UTC', label: '' });
  return { v: STATE_VERSION, clocks, hour12: false };
}

/** @param {unknown} label */
function cleanLabel(label) {
  return typeof label === 'string' ? label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH) : '';
}

/**
 * Turns whatever is in storage into a valid state. Unknown or broken data
 * falls back to the defaults instead of throwing.
 * @param {unknown} raw
 * @returns {State}
 */
export function sanitize(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return defaultState();
  const r = /** @type {Record<string, unknown>} */ (raw);
  if (r.v !== STATE_VERSION || !Array.isArray(r.clocks)) return defaultState();
  /** @type {Clock[]} */
  const clocks = [];
  const ids = new Set();
  for (const c of r.clocks) {
    if (typeof c !== 'object' || c === null) continue;
    const cc = /** @type {Record<string, unknown>} */ (c);
    if (typeof cc.zone !== 'string' || !isValidZone(cc.zone)) continue;
    let id = typeof cc.id === 'string' && cc.id.length > 0 && cc.id.length < 40 ? cc.id : '';
    if (!id || ids.has(id)) id = nextId(clocks);
    ids.add(id);
    clocks.push({ id, zone: cc.zone, label: cleanLabel(cc.label) });
    if (clocks.length >= FREE_CLOCK_LIMIT) break;
  }
  return { v: STATE_VERSION, clocks, hour12: r.hour12 === true };
}

/** @param {Clock[]} clocks */
function nextId(clocks) {
  let n = clocks.length + 1;
  const used = new Set(clocks.map((c) => c.id));
  while (used.has(`c${n}`)) n += 1;
  return `c${n}`;
}

/**
 * @param {State} state
 * @param {string} zone
 * @param {string} [label]
 * @returns {Change}
 */
export function addClock(state, zone, label = '') {
  if (!isValidZone(zone)) return { ok: false, state, error: 'Unknown time zone.' };
  if (state.clocks.length >= FREE_CLOCK_LIMIT) {
    return { ok: false, state, error: `The list is full (${FREE_CLOCK_LIMIT} clocks). Remove one to add another.` };
  }
  const clock = { id: nextId(state.clocks), zone, label: cleanLabel(label) };
  return { ok: true, state: { ...state, clocks: [...state.clocks, clock] } };
}

/**
 * @param {State} state
 * @param {string} id
 * @returns {Change}
 */
export function removeClock(state, id) {
  if (!state.clocks.some((c) => c.id === id)) return { ok: false, state, error: 'No such clock.' };
  return { ok: true, state: { ...state, clocks: state.clocks.filter((c) => c.id !== id) } };
}

/**
 * Moves a clock up (-1) or down (+1).
 * @param {State} state
 * @param {string} id
 * @param {-1 | 1} delta
 * @returns {Change}
 */
export function moveClock(state, id, delta) {
  const i = state.clocks.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.clocks.length) return { ok: false, state, error: 'Cannot move further.' };
  const clocks = [...state.clocks];
  [clocks[i], clocks[j]] = [clocks[j], clocks[i]];
  return { ok: true, state: { ...state, clocks } };
}

/**
 * @param {State} state
 * @param {string} id
 * @param {string} label
 * @returns {Change}
 */
export function renameClock(state, id, label) {
  if (!state.clocks.some((c) => c.id === id)) return { ok: false, state, error: 'No such clock.' };
  const clean = cleanLabel(label);
  return { ok: true, state: { ...state, clocks: state.clocks.map((c) => (c.id === id ? { ...c, label: clean } : c)) } };
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
