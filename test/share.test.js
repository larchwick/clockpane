import { describe, expect, it } from 'vitest';
import {
  buildIcs,
  buildMeetingIcs,
  dstWarningsForShare,
  escapeIcsText,
  foldIcsLine,
  formatClockLine,
  formatIcsUtc,
  formatShareText,
} from '../extension/lib/share.js';
import { zonedTimeToDate } from '../extension/lib/time.js';

/** @param {string} zone @param {string} [label] */
const clock = (zone, label = '') => ({ id: zone, zone, label, work: { start: 9 * 60, end: 17 * 60 } });

const clocks = [
  clock('UTC'),
  clock('Asia/Tokyo', 'Tokyo office'),
  clock('Asia/Kolkata'),
  clock('America/New_York', 'New York'),
  clock('Europe/Paris'),
];

// 12:00 UTC on 15 Jan 2026, the same instant the end-to-end converter uses.
const noonUtc = new Date('2026-01-15T12:00:00Z');

/** Undo RFC 5545 line folding so assertions can read a whole DESCRIPTION. */
const unfold = (/** @type {string} */ ics) => ics.replace(/\r\n[ \t]/g, '');

describe('formatClockLine and formatShareText', () => {
  it('uses the label when one is set, otherwise the city name', () => {
    expect(formatClockLine(clock('Asia/Tokyo', 'Tokyo office'), noonUtc, false, 'en-US')).toBe(
      'Tokyo office  Thu, Jan 15  21:00  UTC+9',
    );
    expect(formatClockLine(clock('Asia/Kolkata'), noonUtc, false, 'en-US')).toBe(
      'Kolkata  Thu, Jan 15  17:30  UTC+5:30',
    );
    expect(formatClockLine(clock('UTC'), noonUtc, false, 'en-US')).toBe('UTC  Thu, Jan 15  12:00  UTC');
  });

  it('follows the 12 or 24 hour setting and uses each clock\'s own day', () => {
    expect(formatClockLine(clock('America/New_York', 'New York'), noonUtc, true, 'en-US')).toBe(
      'New York  Thu, Jan 15  7:00 AM  UTC-5',
    );
    expect(formatClockLine(clock('Asia/Tokyo', 'Tokyo office'), noonUtc, true, 'en-US')).toBe(
      'Tokyo office  Thu, Jan 15  9:00 PM  UTC+9',
    );
    // 12:00 on 15 Jan in Tokyo is still 14 Jan in New York.
    const noonTokyo = zonedTimeToDate({ year: 2026, month: 1, day: 15, hour: 12, minute: 0 }, 'Asia/Tokyo');
    expect(formatClockLine(clock('America/New_York', 'New York'), noonTokyo, false, 'en-US')).toBe(
      'New York  Wed, Jan 14  22:00  UTC-5',
    );
  });

  it('prints 24 hour times for every clock in the active set, with no warning lines', () => {
    const text = formatShareText({ clocks, at: noonUtc, hour12: false, locale: 'en-US' });
    expect(text.split('\n')).toEqual([
      'UTC  Thu, Jan 15  12:00  UTC',
      'Tokyo office  Thu, Jan 15  21:00  UTC+9',
      'Kolkata  Thu, Jan 15  17:30  UTC+5:30',
      'New York  Thu, Jan 15  07:00  UTC-5',
      'Paris  Thu, Jan 15  13:00  UTC+1',
    ]);
  });

  it('appends DST warning lines after a blank line', () => {
    const text = formatShareText({
      clocks: [clock('America/New_York', 'New York')],
      at: noonUtc,
      hour12: false,
      locale: 'en-US',
      warnings: ['02:30 does not exist in New York on that date because clocks skip forward. It is shown as the time right after the gap.'],
    });
    expect(text).toBe(
      'New York  Thu, Jan 15  07:00  UTC-5\n\n02:30 does not exist in New York on that date because clocks skip forward. It is shown as the time right after the gap.',
    );
  });
});

describe('dstWarningsForShare', () => {
  const ny = clock('America/New_York', 'New York');
  const tokyo = clock('Asia/Tokyo', 'Tokyo office');

  it('returns the existing gap warning for a typed spring forward time, even after the instant is shifted', () => {
    const wall = { year: 2027, month: 3, day: 14, hour: 2, minute: 30 };
    const at = zonedTimeToDate(wall, 'America/New_York');
    const warnings = dstWarningsForShare({ clocks: [ny, tokyo], at, sourceWall: wall, sourceZone: 'America/New_York' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('does not exist in New York');
    expect(warnings[0]).toContain('02:30');
  });

  it('returns the existing overlap warning for a fall back time, for any clock at that instant', () => {
    const wall = { year: 2027, month: 11, day: 7, hour: 1, minute: 30 };
    const at = zonedTimeToDate(wall, 'America/New_York');
    const warnings = dstWarningsForShare({ clocks: [ny, tokyo], at });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('happens twice in New York');
    expect(warnings[0]).toContain('01:30');
  });

  it('returns nothing on an ordinary time', () => {
    expect(dstWarningsForShare({ clocks: [ny, tokyo], at: noonUtc })).toEqual([]);
  });
});

describe('ICS escaping, line endings, folding and UTC times', () => {
  it('escapes backslash, semicolon, comma and newlines in TEXT', () => {
    expect(escapeIcsText('a;b,c\\d\ne')).toBe('a\\;b\\,c\\\\d\\ne');
    expect(escapeIcsText('line 1\r\nline 2')).toBe('line 1\\nline 2');
  });

  it('formats instants as UTC basic date-times', () => {
    expect(formatIcsUtc(noonUtc)).toBe('20260115T120000Z');
    // 14:00 in Bucharest in winter is 12:00 UTC.
    const bucharest = zonedTimeToDate({ year: 2026, month: 1, day: 15, hour: 14, minute: 0 }, 'Europe/Bucharest');
    expect(formatIcsUtc(bucharest)).toBe('20260115T120000Z');
  });

  it('builds a single VEVENT with CRLF lines, a one hour DTEND, and SUMMARY Meeting', () => {
    const ics = buildIcs({
      start: noonUtc,
      description: 'UTC  Thu, Jan 15  12:00  UTC',
      uid: 'clockpane-test@larchwick',
      dtstamp: noonUtc,
    });
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.includes('\n') && !ics.replace(/\r\n/g, '').includes('\n')).toBe(true);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20260115T120000Z');
    expect(ics).toContain('DTEND:20260115T130000Z');
    expect(ics).toContain('SUMMARY:Meeting');
    expect(ics).toContain('UID:clockpane-test@larchwick');
    expect(ics).toContain('DESCRIPTION:UTC  Thu\\, Jan 15  12:00  UTC');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
  });

  it('folds lines longer than 75 octets and does not split a UTF-8 character', () => {
    const long = `DESCRIPTION:${'A'.repeat(80)}`;
    const folded = foldIcsLine(long);
    const lines = folded.split('\r\n');
    expect(lines.length).toBe(2);
    expect(lines[0].length).toBe(75);
    expect(lines[1].startsWith(' ')).toBe(true);
    expect(lines[1].length).toBe(1 + 80 + 'DESCRIPTION:'.length - 75);
    // São is 4 bytes for ã (UTF-8 C3 A3 is 2 bytes, S and o are 1). Folding must keep the character whole.
    const utf = `SUMMARY:${'x'.repeat(70)}São`;
    const utfFolded = foldIcsLine(utf);
    expect(utfFolded.includes('S\r\n')).toBe(false);
    expect(utfFolded.includes('ã')).toBe(true);
    for (const line of utfFolded.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it('puts per-clock lines and a gap warning in the DESCRIPTION, with commas escaped', () => {
    const wall = { year: 2027, month: 3, day: 14, hour: 2, minute: 30 };
    const at = zonedTimeToDate(wall, 'America/New_York');
    const list = [clock('America/New_York', 'New York'), clock('UTC')];
    const warnings = dstWarningsForShare({ clocks: list, at, sourceWall: wall, sourceZone: 'America/New_York' });
    const ics = buildMeetingIcs({
      clocks: list,
      at,
      hour12: false,
      warnings,
      locale: 'en-US',
      uid: 'clockpane-gap@larchwick',
      dtstamp: at,
    });
    expect(ics).toContain('SUMMARY:Meeting');
    // After the gap, 02:30 in New York is shown as 03:30 EDT (UTC-4), which is 07:30Z.
    expect(ics).toContain(`DTSTART:${formatIcsUtc(at)}`);
    expect(ics).toContain(`DTEND:${formatIcsUtc(new Date(at.getTime() + 3600000))}`);
    expect(unfold(ics)).toContain('does not exist in New York');
    expect(ics).toContain('New York  Sun\\, Mar 14');
    expect(ics).toContain('UTC  Sun\\, Mar 14');
  });

  it('puts an overlap warning in the DESCRIPTION for a fall back time', () => {
    const wall = { year: 2027, month: 11, day: 7, hour: 1, minute: 30 };
    const at = zonedTimeToDate(wall, 'America/New_York');
    const list = [clock('America/New_York', 'New York')];
    const warnings = dstWarningsForShare({ clocks: list, at, sourceWall: wall, sourceZone: 'America/New_York' });
    const ics = buildMeetingIcs({
      clocks: list,
      at,
      hour12: false,
      warnings,
      locale: 'en-US',
      uid: 'clockpane-overlap@larchwick',
      dtstamp: at,
    });
    expect(unfold(ics)).toContain('happens twice in New York');
    expect(unfold(ics)).toContain('01:30');
  });
});
