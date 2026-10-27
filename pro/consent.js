/**
 * Consent screen content and gate for the future license check. Nothing is sent before
 * the user ticks the box and presses Activate. The consent record is local only.
 */

export const CONSENT_STORAGE_KEY = 'clockpane.licenseConsent';
export const CONSENT_VERSION = 1;

/** The exact text the consent screen shows. Keep in sync with PRIVACY.md. */
export const CONSENT_TEXT = Object.freeze([
  'To turn on Pro, Clockpane checks your license key with Gumroad, the shop that sold it.',
  'It sends three things to https://api.gumroad.com/v2/licenses/verify: the Clockpane Pro product id, the license key you paste, and whether this counts as a new browser.',
  'It sends nothing else. No clocks, no browsing data, no name or email.',
  'The check runs once when you press Activate, and again only when you press Re-check.',
  'The result is kept in this browser only. Gumroad handles the request under its own privacy policy.',
]);

/** @param {unknown} raw */
export function hasConsent(raw) {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = /** @type {Record<string, unknown>} */ (raw);
  return r.v === CONSENT_VERSION && r.agreed === true && typeof r.at === 'string';
}

/** @param {Date} now */
export function consentRecord(now) {
  return { v: CONSENT_VERSION, agreed: true, at: now.toISOString() };
}
