import { describe, expect, it } from 'vitest';
import { cellFor, inWork, planDay, summarize } from '../extension/lib/planner.js';

/** @param {string} zone @param {number} [start] @param {number} [end] */
const clock = (zone, start = 540, end = 1020) => ({ id: zone, zone, label: '', work: { start, end } });

describe('planner', () => {
  it('knows day and night shifts', () => {
    expect(inWork(540, { start: 540, end: 1020 })).toBe(true);
    expect(inWork(1020, { start: 540, end: 1020 })).toBe(false);
    expect(inWork(1380, { start: 1320, end: 360 })).toBe(true);
    expect(inWork(300, { start: 1320, end: 360 })).toBe(true);
    expect(inWork(720, { start: 1320, end: 360 })).toBe(false);
  });
  it('marks an hour as work only when the whole hour is inside', () => {
    expect(cellFor(new Date('2026-10-27T09:00:00Z'), clock('UTC')).status).toBe('work');
    expect(cellFor(new Date('2026-10-27T16:30:00Z'), clock('UTC')).status).toBe('awake');
    expect(cellFor(new Date('2026-10-27T03:00:00Z'), clock('UTC')).status).toBe('night');
  });
  it('finds the overlap of London and New York', () => {
    const plan = planDay({ year: 2026, month: 11, day: 3 }, 'Europe/London', [clock('Europe/London'), clock('America/New_York')]);
    expect(plan.slots).toHaveLength(24);
    expect(plan.bestCount).toBe(2);
    expect(plan.best.map((r) => `${r.startLabel}-${r.endLabel}`)).toEqual(['14:00-17:00']);
    expect(summarize(plan, 2)).toBe('Everyone is at work: 14:00-17:00.');
  });
  it('reports the best partial overlap when nobody overlaps fully', () => {
    const plan = planDay({ year: 2026, month: 11, day: 3 }, 'UTC', [clock('America/Los_Angeles'), clock('Asia/Tokyo'), clock('Europe/Berlin')]);
    expect(plan.bestCount).toBe(2);
    expect(summarize(plan, 3)).toMatch(/^No hour suits everyone\. Best \(2 of 3 at work\)/);
  });
  it('handles 23 and 25 hour days', () => {
    expect(planDay({ year: 2026, month: 3, day: 29 }, 'Europe/Bucharest', [clock('UTC')]).slots).toHaveLength(23);
    expect(planDay({ year: 2026, month: 10, day: 25 }, 'Europe/Bucharest', [clock('UTC')]).slots).toHaveLength(25);
  });
  it('handles a half hour zone and an empty list', () => {
    const plan = planDay({ year: 2026, month: 11, day: 3 }, 'UTC', [clock('Asia/Kolkata')]);
    expect(plan.best[0].startLabel).toBe('04:00');
    expect(plan.slots[4].cells[0]).toMatchObject({ hour: 9, minute: 30, status: 'work' });
    expect(summarize(planDay({ year: 2026, month: 11, day: 3 }, 'UTC', []), 0)).toBe('Add clocks to plan a meeting.');
  });
});
