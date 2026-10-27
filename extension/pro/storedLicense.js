/**
 * Local storage format for a Pro license that passed the Gumroad check.
 * Kept in storage.local (never storage.sync). No buyer name or email is stored.
 */

export const STORED_LICENSE_VERSION = 1;
export const LICENSE_STORAGE_KEY = 'clockpane.license';

/**
 * @typedef {import('./gumroad.js').StoredLicense} StoredLicense
 */

/** @param {StoredLicense} license */
export function serializeStoredLicense(license) {
  return JSON.stringify({ v: STORED_LICENSE_VERSION, license });
}

/** @param {unknown} v @returns {v is string} */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Parses stored text back into a license. Anything that is not a complete,
 * current-version record gives undefined, so damaged data falls back to Free.
 * @param {string | undefined} text
 * @returns {StoredLicense | undefined}
 */
export function parseStoredLicense(text) {
  if (typeof text !== 'string' || text.length === 0) return undefined;
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const file = /** @type {Record<string, unknown>} */ (raw);
  if (file.v !== STORED_LICENSE_VERSION) return undefined;
  const l = file.license;
  if (typeof l !== 'object' || l === null || Array.isArray(l)) return undefined;
  const r = /** @type {Record<string, unknown>} */ (l);
  if (
    !isNonEmptyString(r.productId) ||
    !isNonEmptyString(r.licenseKey) ||
    typeof r.saleId !== 'string' ||
    typeof r.uses !== 'number' ||
    !Number.isInteger(r.uses) ||
    r.uses < 0 ||
    (r.mode !== 'activation' && r.mode !== 'recheck') ||
    typeof r.checkedAt !== 'string' ||
    Number.isNaN(Date.parse(r.checkedAt))
  ) {
    return undefined;
  }
  return { productId: r.productId, licenseKey: r.licenseKey, saleId: r.saleId, uses: r.uses, mode: r.mode, checkedAt: r.checkedAt };
}

/**
 * Pro when a stored license exists for the expected product, otherwise Free.
 * With no product id configured this is always Free.
 * @param {string | undefined} storedText
 * @param {string | null} expectedProductId
 */
export function tierFromStored(storedText, expectedProductId) {
  const parsed = parseStoredLicense(storedText);
  return expectedProductId !== null && parsed !== undefined && parsed.productId === expectedProductId ? 'pro' : 'free';
}
