// Pro meeting planner: which hours of one day suit every clock's working hours.
// Pure, unit tested, no storage and no network.

import { zonedParts, zonedTimeToDate } from './time.js';

/** Outside working hours but a reasonable time to be awake. */
export const AWAKE_FROM = 7;
export const AWAKE_UNTIL = 22;

/**
 * @typedef {import('./store.js').Clock} Clock
 * @typedef {import('./store.js').WorkHours} WorkHours
 * @typedef {'work' | 'awake' | 'night'} CellStatus
 * @typedef {{ status: CellStatus, hour: number, minute: number }} Cell
 * @typedef {{ at: Date, hour: number, minute: number, cells: Cell[], working: number }} Slot
 * @typedef {{ from: Date, to: Date, startLabel: string, endLabel: string }} Range
 * @typedef {{ slots: Slot[], best: Range[], bestCount: number }} Plan
 */

/**
 * @param {number} minuteOfDay
 * @param {WorkHours} work
 */
export function inWork(minuteOfDay, work) {
  return work.start < work.end
    ? minuteOfDay >= work.start && minuteOfDay < work.end
    : minuteOfDay >= work.start || minuteOfDay < work.end;
}

/**
 * Status of a clock at an instant. An hour counts as working time when the whole hour
 * that starts at that instant is inside the clock's working hours.
 * @param {Date} at
 * @param {Clock} clock
 * @returns {Cell}
 */
export function cellFor(at, clock) {
  const p = zonedParts(at, clock.zone);
  const m = p.hour * 60 + p.minute;
  const work = inWork(m, clock.work) && inWork((m + 59) % 1440, clock.work);
  /** @type {CellStatus} */
  const status = work ? 'work' : p.hour >= AWAKE_FROM && p.hour < AWAKE_UNTIL ? 'awake' : 'night';
  return { status, hour: p.hour, minute: p.minute };
}

/** @param {number} h @param {number} m */
const label = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

/**
 * Hour by hour plan for one calendar day in the base zone. Days with a clock change have
 * 23 or 25 slots. The best ranges are runs of hours with the most clocks at work.
 * @param {{ year: number, month: number, day: number }} date
 * @param {string} baseZone
 * @param {Clock[]} clocks
 * @returns {Plan}
 */
export function planDay(date, baseZone, clocks) {
  const start = zonedTimeToDate({ ...date, hour: 0, minute: 0 }, baseZone).getTime();
  /** @type {Slot[]} */
  const slots = [];
  for (let t = start; slots.length < 26; t += 3600000) {
    const at = new Date(t);
    const p = zonedParts(at, baseZone);
    if (p.year !== date.year || p.month !== date.month || p.day !== date.day) break;
    const cells = clocks.map((c) => cellFor(at, c));
    slots.push({ at, hour: p.hour, minute: p.minute, cells, working: cells.filter((c) => c.status === 'work').length });
  }
  const bestCount = slots.reduce((m, s) => Math.max(m, s.working), 0);
  /** @type {Range[]} */
  const best = [];
  if (bestCount > 0) {
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i].working !== bestCount) continue;
      let j = i;
      while (j + 1 < slots.length && slots[j + 1].working === bestCount) j += 1;
      const end = new Date(slots[j].at.getTime() + 3600000);
      const e = zonedParts(end, baseZone);
      best.push({ from: slots[i].at, to: end, startLabel: label(slots[i].hour, slots[i].minute), endLabel: label(e.hour, e.minute) });
      i = j;
    }
  }
  return { slots, best, bestCount };
}

/**
 * One line summary of a plan for the popup.
 * @param {Plan} plan
 * @param {number} clockCount
 */
export function summarize(plan, clockCount) {
  if (clockCount === 0) return 'Add clocks to plan a meeting.';
  if (plan.bestCount === 0) return 'No hour of this day falls in anyone\'s working hours.';
  const ranges = plan.best.map((r) => `${r.startLabel}-${r.endLabel}`).join(', ');
  return plan.bestCount === clockCount
    ? `Everyone is at work: ${ranges}.`
    : `No hour suits everyone. Best (${plan.bestCount} of ${clockCount} at work): ${ranges}.`;
}
