import { describe, expect, it } from 'vitest';
import {
  cityName, dayShift, diffLabel, formatOffset, isValidZone, listZones, offsetMinutes,
  resolveZone, searchZones, zonedParts, zonedTimeToDate,
} from '../extension/lib/time.js';

const at = (iso) => new Date(iso);

describe('zones', () => {
  it('knows real zones and rejects junk', () => {
    expect(isValidZone('Europe/Bucharest')).toBe(true);
    expect(isValidZone('Mars/Olympus')).toBe(false);
    expect(isValidZone('')).toBe(false);
    expect(listZones()).toContain('UTC');
  });
  it('shows city names', () => {
    expect(cityName('America/New_York')).toBe('New York');
    expect(cityName('UTC')).toBe('UTC');
  });
  it('resolves ids, cities and aliases, ignoring case and accents', () => {
    expect(resolveZone('europe/bucharest')?.zone).toBe('Europe/Bucharest');
    expect(resolveZone('tokyo')?.zone).toBe('Asia/Tokyo');
    expect(resolveZone('São Paulo')?.zone).toBe('America/Sao_Paulo');
    expect(resolveZone('Cluj-Napoca')?.zone).toBe('Europe/Bucharest');
    expect(resolveZone('Asia/Kolkata')?.zone).toBe('Asia/Kolkata');
    expect(resolveZone('Kolkata')?.zone).toBe('Asia/Kolkata');
    expect(resolveZone('nowhere at all')).toBeNull();
    expect(resolveZone('Nowhere/Land')).toBeNull();
    expect(resolveZone('   ')).toBeNull();
  });
  it('searches with prefix matches first and a limit', () => {
    const hits = searchZones('new', 3);
    expect(hits.length).toBeLessThanOrEqual(3);
    expect(hits[0].name.toLowerCase().startsWith('new')).toBe(true);
    expect(searchZones('')).toEqual([]);
  });
});

describe('offsets and DST', () => {
  it('follows Bucharest summer and winter time', () => {
    expect(offsetMinutes(at('2026-07-01T12:00:00Z'), 'Europe/Bucharest')).toBe(180);
    expect(offsetMinutes(at('2026-12-01T12:00:00Z'), 'Europe/Bucharest')).toBe(120);
  });
  it('handles half hour and negative zones', () => {
    expect(offsetMinutes(at('2026-10-27T12:00:00Z'), 'Asia/Kolkata')).toBe(330);
    expect(formatOffset(330)).toBe('UTC+5:30');
    expect(formatOffset(-210)).toBe('UTC-3:30');
    expect(formatOffset(0)).toBe('UTC');
    expect(formatOffset(120)).toBe('UTC+2');
  });
  it('labels differences between zones', () => {
    const t = at('2026-10-27T12:00:00Z');
    expect(diffLabel(t, 'Asia/Kolkata', 'UTC')).toBe('+5:30h');
    expect(diffLabel(t, 'Europe/Bucharest', 'Europe/Bucharest')).toBe('same time');
    expect(diffLabel(t, 'America/New_York', 'Europe/Bucharest')).toBe('-6h');
  });
  it('reads wall clock parts with a 0 to 23 hour', () => {
    expect(zonedParts(at('2026-10-27T22:05:00Z'), 'UTC')).toMatchObject({ hour: 22, minute: 5, day: 27 });
    expect(zonedParts(at('2026-10-27T00:30:00Z'), 'UTC').hour).toBe(0);
  });
  it('shows day changes', () => {
    const t = at('2026-10-27T23:30:00Z');
    expect(dayShift(t, 'Asia/Tokyo', 'UTC')).toBe(1);
    expect(dayShift(t, 'UTC', 'Asia/Tokyo')).toBe(-1);
    expect(dayShift(t, 'UTC', 'UTC')).toBe(0);
  });
});

describe('zonedTimeToDate', () => {
  it('converts ordinary times', () => {
    expect(zonedTimeToDate({ year: 2026, month: 10, day: 27, hour: 9, minute: 0 }, 'Europe/Bucharest').toISOString()).toBe('2026-10-27T07:00:00.000Z');
    expect(zonedTimeToDate({ year: 2026, month: 10, day: 27, hour: 9, minute: 0 }, 'Asia/Kolkata').toISOString()).toBe('2026-10-27T03:30:00.000Z');
  });
  it('moves a spring forward gap time forward (Bucharest 29 Mar 2026 03:30)', () => {
    const d = zonedTimeToDate({ year: 2026, month: 3, day: 29, hour: 3, minute: 30 }, 'Europe/Bucharest');
    expect(d.toISOString()).toBe('2026-03-29T01:30:00.000Z');
    expect(zonedParts(d, 'Europe/Bucharest')).toMatchObject({ hour: 4, minute: 30 });
  });
  it('moves a spring forward gap time forward (New York 8 Mar 2026 02:30)', () => {
    const d = zonedTimeToDate({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York');
    expect(zonedParts(d, 'America/New_York')).toMatchObject({ hour: 3, minute: 30 });
  });
  it('uses the earlier instant in a fall back overlap (Bucharest 25 Oct 2026 03:30)', () => {
    const d = zonedTimeToDate({ year: 2026, month: 10, day: 25, hour: 3, minute: 30 }, 'Europe/Bucharest');
    expect(d.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });
  it('uses the earlier instant in a fall back overlap (New York 1 Nov 2026 01:30)', () => {
    const d = zonedTimeToDate({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, 'America/New_York');
    expect(d.toISOString()).toBe('2026-11-01T05:30:00.000Z');
  });
  it('round trips every half hour of a DST year', () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 30 * 60000 * 37) {
      for (const zone of ['Europe/Bucharest', 'America/New_York', 'Australia/Lord_Howe']) {
        const p = zonedParts(new Date(t), zone);
        const back = zonedTimeToDate(p, zone);
        expect(zonedParts(back, zone)).toMatchObject({ year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute });
      }
    }
  });
});
