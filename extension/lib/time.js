// Pure time helpers. Everything uses Intl with IANA zone names, so daylight
// saving rules come from the browser's own time zone data. No network.

/** Extra city names that are not part of an IANA zone id. */
export const CITY_ALIASES = Object.freeze({
  'San Francisco': 'America/Los_Angeles',
  'Seattle': 'America/Los_Angeles',
  'San Jose': 'America/Los_Angeles',
  'Austin': 'America/Chicago',
  'Dallas': 'America/Chicago',
  'Houston': 'America/Chicago',
  'Boston': 'America/New_York',
  'Washington': 'America/New_York',
  'Miami': 'America/New_York',
  'Atlanta': 'America/New_York',
  'Montreal': 'America/Toronto',
  'Munich': 'Europe/Berlin',
  'Frankfurt': 'Europe/Berlin',
  'Hamburg': 'Europe/Berlin',
  'Barcelona': 'Europe/Madrid',
  'Milan': 'Europe/Rome',
  'Geneva': 'Europe/Zurich',
  'Cluj-Napoca': 'Europe/Bucharest',
  'Iasi': 'Europe/Bucharest',
  'Timisoara': 'Europe/Bucharest',
  'Kyiv': 'Europe/Kyiv',
  'Kolkata': 'Asia/Kolkata',
  'Mumbai': 'Asia/Kolkata',
  'Delhi': 'Asia/Kolkata',
  'New Delhi': 'Asia/Kolkata',
  'Bangalore': 'Asia/Kolkata',
  'Bengaluru': 'Asia/Kolkata',
  'Beijing': 'Asia/Shanghai',
  'Shenzhen': 'Asia/Shanghai',
  'Osaka': 'Asia/Tokyo',
  'Abu Dhabi': 'Asia/Dubai',
  'Melbourne': 'Australia/Melbourne',
  'Auckland': 'Pacific/Auckland',
  'Sao Paulo': 'America/Sao_Paulo',
});

/**
 * Returns true when the browser knows the zone.
 * @param {string} zone
 */
export function isValidZone(zone) {
  if (typeof zone !== 'string' || zone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** All zones the browser supports, always including UTC. @returns {string[]} */
export function listZones() {
  /** @type {string[]} */
  let zones = [];
  const intl = /** @type {{ supportedValuesOf?: (key: string) => string[] }} */ (Intl);
  if (typeof intl.supportedValuesOf === 'function') {
    zones = intl.supportedValuesOf('timeZone');
  }
  if (!zones.includes('UTC')) zones = [...zones, 'UTC'];
  return zones;
}

/**
 * City part of a zone id, for display. "America/New_York" becomes "New York".
 * @param {string} zone
 */
export function cityName(zone) {
  const last = zone.split('/').pop() ?? zone;
  return last.replace(/_/g, ' ');
}

/**
 * Search entries for the add box: every zone by its city name plus the aliases.
 * @returns {{ name: string, zone: string }[]}
 */
export function searchEntries() {
  const entries = listZones().map((zone) => ({ name: cityName(zone), zone }));
  for (const [name, zone] of Object.entries(CITY_ALIASES)) {
    if (isValidZone(zone)) entries.push({ name, zone });
  }
  return entries;
}

/**
 * Finds a zone from user text: an exact IANA id, a city name, or an alias.
 * Case and accents are ignored. Returns null when nothing matches.
 * @param {string} text
 * @returns {{ name: string, zone: string } | null}
 */
export function resolveZone(text) {
  const q = normalize(text);
  if (q.length === 0) return null;
  const all = listZones();
  const direct = all.find((z) => normalize(z) === q);
  if (direct) return { name: cityName(direct), zone: direct };
  // Some engines list legacy ids (Asia/Calcutta) but accept the current ones (Asia/Kolkata).
  const id = String(text).trim().replace(/ /g, '_');
  if (id.includes('/') && isValidZone(id)) {
    const zone = /^[A-Z]/.test(id) ? id : new Intl.DateTimeFormat('en-US', { timeZone: id }).resolvedOptions().timeZone;
    return { name: cityName(zone), zone };
  }
  const entries = searchEntries();
  const hit = entries.find((e) => normalize(e.name) === q);
  return hit ?? null;
}

/**
 * Up to `limit` matches for a partial query, best first (prefix before substring).
 * @param {string} text
 * @param {number} [limit]
 */
export function searchZones(text, limit = 8) {
  const q = normalize(text);
  if (q.length === 0) return [];
  const entries = searchEntries();
  const prefix = entries.filter((e) => normalize(e.name).startsWith(q) || normalize(e.zone).startsWith(q));
  const inner = entries.filter((e) => !prefix.includes(e) && (normalize(e.name).includes(q) || normalize(e.zone).includes(q)));
  return [...prefix, ...inner].slice(0, limit);
}

/** @param {string} s */
function normalize(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').trim().toLowerCase();
}

/**
 * Wall clock parts of an instant in a zone.
 * @param {Date} date
 * @param {string} zone
 */
export function zonedParts(date, zone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  /** @type {Record<string, number>} */
  const p = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}

/**
 * Offset of the zone from UTC at that instant, in minutes (east is positive).
 * @param {Date} date
 * @param {string} zone
 */
export function offsetMinutes(date, zone) {
  const p = zonedParts(date, zone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const whole = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - whole) / 60000);
}

/**
 * "UTC+2", "UTC-3:30", "UTC".
 * @param {number} minutes
 */
export function formatOffset(minutes) {
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

/**
 * The instant at which a zone's wall clock shows the given time. In a spring
 * forward gap the time is moved forward by the gap, like most calendars do.
 * In a fall back overlap the earlier instant is used.
 * @param {{ year: number, month: number, day: number, hour: number, minute: number }} wall
 * @param {string} zone
 * @returns {Date}
 */
export function zonedTimeToDate(wall, zone) {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const day = 86400000;
  const before = offsetMinutes(new Date(guess - day), zone);
  const offsets = [...new Set([before, offsetMinutes(new Date(guess), zone), offsetMinutes(new Date(guess + day), zone)])];
  const hits = offsets
    .map((o) => guess - o * 60000)
    .filter((t) => {
      const p = zonedParts(new Date(t), zone);
      return p.year === wall.year && p.month === wall.month && p.day === wall.day && p.hour === wall.hour && p.minute === wall.minute;
    });
  if (hits.length > 0) return new Date(Math.min(...hits));
  // Gap: the wall time does not exist. The offset from before the change lands after the gap.
  return new Date(guess - before * 60000);
}

/**
 * Formats the time of day in a zone.
 * @param {Date} date
 * @param {string} zone
 * @param {boolean} hour12
 * @param {string} [locale]
 */
export function formatTime(date, zone, hour12, locale) {
  return new Intl.DateTimeFormat(locale, { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12 }).format(date);
}

/**
 * Short weekday and date in a zone, like "Tue 27 Oct".
 * @param {Date} date
 * @param {string} zone
 * @param {string} [locale]
 */
export function formatDay(date, zone, locale) {
  return new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

/**
 * Calendar day difference of the zone's date compared with the reference zone's date.
 * @param {Date} date
 * @param {string} zone
 * @param {string} refZone
 * @returns {number} -1, 0 or 1 (or more for exotic zones)
 */
export function dayShift(date, zone, refZone) {
  const a = zonedParts(date, zone);
  const b = zonedParts(date, refZone);
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86400000);
}

/**
 * Hour difference label between two zones at an instant, like "+7h" or "-1:30h".
 * @param {Date} date
 * @param {string} zone
 * @param {string} refZone
 */
export function diffLabel(date, zone, refZone) {
  const d = offsetMinutes(date, zone) - offsetMinutes(date, refZone);
  if (d === 0) return 'same time';
  const sign = d > 0 ? '+' : '-';
  const abs = Math.abs(d);
  const m = abs % 60;
  return `${sign}${Math.floor(abs / 60)}${m ? ':' + String(m).padStart(2, '0') : ''}h`;
}

/** The browser's own zone, falling back to UTC. */
export function localZone() {
  const z = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  return isValidZone(z) ? z : 'UTC';
}
