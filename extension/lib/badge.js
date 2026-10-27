// Pro toolbar badge text. Pure, unit tested.

import { cityName, formatDay, formatTime, zonedParts } from './time.js';

/**
 * Short time for the toolbar badge: "14:05" in 24-hour mode, "2:05" in 12-hour mode
 * (the badge has room for about four characters, the tooltip has the full text).
 * @param {Date} at
 * @param {string} zone
 * @param {boolean} hour12
 */
export function badgeText(at, zone, hour12) {
  const p = zonedParts(at, zone);
  const mm = String(p.minute).padStart(2, '0');
  if (!hour12) return `${String(p.hour).padStart(2, '0')}:${mm}`;
  const h = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h}:${mm}`;
}

/**
 * Tooltip for the toolbar button while the badge is on.
 * @param {Date} at
 * @param {{ zone: string, label: string }} clock
 * @param {boolean} hour12
 */
export function badgeTitle(at, clock, hour12) {
  return `Clockpane: ${clock.label || cityName(clock.zone)} ${formatTime(at, clock.zone, hour12)}, ${formatDay(at, clock.zone)}`;
}

/** Milliseconds until the next whole minute. @param {Date} now */
export function msToNextMinute(now) {
  return 60000 - (now.getTime() % 60000);
}
