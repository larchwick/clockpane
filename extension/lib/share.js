// Share a picked time: plain text for every clock, and a one-event .ics file for Pro.
// Pure helpers. No storage, no network, no permissions.

import { cityName, formatDay, formatOffset, formatTime, offsetMinutes, wallTimeWarning, zonedParts } from './time.js';

/**
 * @typedef {import('./store.js').Clock} Clock
 * @typedef {{ year: number, month: number, day: number, hour: number, minute: number }} Wall
 */

/**
 * One line for one clock: label or city, weekday and date, time, UTC offset.
 * @param {Clock} clock
 * @param {Date} at
 * @param {boolean} hour12
 * @param {string} [locale]
 */
export function formatClockLine(clock, at, hour12, locale) {
  const name = clock.label || cityName(clock.zone);
  const day = formatDay(at, clock.zone, locale);
  const time = formatTime(at, clock.zone, hour12, locale);
  const offset = formatOffset(offsetMinutes(at, clock.zone));
  return `${name}  ${day}  ${time}  ${offset}`;
}

/**
 * Existing 0.2.1 DST warning text for a spring forward gap or fall back overlap,
 * for every clock that has one at this instant. When the user typed a wall time
 * in a source zone, that typed wall is checked too, so a gap that was shifted
 * forward still produces the same warning as the popup.
 * @param {{ clocks: Clock[], at: Date, sourceWall?: Wall, sourceZone?: string }} args
 * @returns {string[]}
 */
export function dstWarningsForShare(args) {
  const { clocks, at, sourceWall, sourceZone } = args;
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  /** @param {Wall} wall @param {string} zone @param {string} label */
  const add = (wall, zone, label) => {
    const text = wallTimeWarning(wall, zone, label);
    if (text && !seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  };
  if (sourceWall && sourceZone) {
    const clock = clocks.find((c) => c.zone === sourceZone);
    add(sourceWall, sourceZone, clock?.label || cityName(sourceZone));
  }
  for (const clock of clocks) {
    const p = zonedParts(at, clock.zone);
    add(
      { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute },
      clock.zone,
      clock.label || cityName(clock.zone),
    );
  }
  return out;
}

/**
 * Plain text: one line per clock, then optional DST warning lines for Pro.
 * @param {{ clocks: Clock[], at: Date, hour12: boolean, warnings?: string[], locale?: string }} args
 */
export function formatShareText(args) {
  const lines = args.clocks.map((clock) => formatClockLine(clock, args.at, args.hour12, args.locale));
  const warnings = (args.warnings ?? []).filter(Boolean);
  if (warnings.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(...warnings);
  }
  return lines.join('\n');
}

/**
 * RFC 5545 TEXT escaping: backslash, semicolon, comma, and newlines.
 * @param {string} text
 */
export function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n');
}

/**
 * Fold one content line to 75 octets, as RFC 5545 section 3.1 requires.
 * The line break itself is not counted. Continuation lines start with a space.
 * @param {string} line
 */
export function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;
  /** @type {string[]} */
  const parts = [];
  let i = 0;
  let limit = 75;
  while (i < bytes.length) {
    let end = Math.min(i + limit, bytes.length);
    while (end > i && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    if (end === i) end = Math.min(i + limit, bytes.length);
    parts.push(decoder.decode(bytes.slice(i, end)));
    i = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

/**
 * A UTC date-time in the ICS basic format, YYYYMMDDTHHMMSSZ.
 * @param {Date} date
 */
export function formatIcsUtc(date) {
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

/**
 * One VEVENT calendar, DTSTART in UTC, default one hour long.
 * @param {{ start: Date, durationMs?: number, summary?: string, description: string, uid: string, dtstamp: Date, prodId?: string }} args
 */
export function buildIcs(args) {
  const durationMs = args.durationMs ?? 3600000;
  const summary = args.summary ?? 'Meeting';
  const prodId = args.prodId ?? '-//Larchwick//Clockpane//EN';
  const end = new Date(args.start.getTime() + durationMs);
  const raw = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${args.uid}`,
    `DTSTAMP:${formatIcsUtc(args.dtstamp)}`,
    `DTSTART:${formatIcsUtc(args.start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(args.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${raw.map(foldIcsLine).join('\r\n')}\r\n`;
}

/**
 * Build the Pro calendar file for a picked instant.
 * @param {{ clocks: Clock[], at: Date, hour12: boolean, warnings?: string[], locale?: string, uid: string, dtstamp: Date, summary?: string }} args
 */
export function buildMeetingIcs(args) {
  const description = formatShareText({
    clocks: args.clocks,
    at: args.at,
    hour12: args.hour12,
    warnings: args.warnings,
    locale: args.locale,
  });
  return buildIcs({
    start: args.at,
    summary: args.summary ?? 'Meeting',
    description,
    uid: args.uid,
    dtstamp: args.dtstamp,
  });
}
