/**
 * Boundary between the free core and Pro.
 *
 * Rules:
 * 1. Free features never ask for the tier. They work the same with or without Pro.
 * 2. Only Pro features (more than 5 clocks, meeting planner, clock sets, export and import,
 *    toolbar badge) check the tier.
 * 3. The tier comes from a license stored in this browser. The only network call is the
 *    Gumroad check the user starts on the options page after the consent screen.
 *    Reading the tier never touches the network, so Pro keeps working offline.
 */

import { GUMROAD_ORIGIN, GUMROAD_PRODUCT_ID } from './gumroad.js';

export { PRO_PRICE, REFUND_DAYS, GUMROAD_PRODUCT_URL } from './gumroad.js';
import { LICENSE_STORAGE_KEY, parseStoredLicense, tierFromStored } from './storedLicense.js';

/** Hashes of keys already activated in this browser, so activating again does not use a slot. */
export const ACTIVATED_HERE_KEY = 'clockpane.activatedHere';

/** Firefox data collection category for the license key (extensionworkshop.com taxonomy). */
export const DATA_COLLECTION = Object.freeze(['authenticationInfo']);

/**
 * @typedef {import('../lib/store.js').Tier} Tier
 * @typedef {import('../lib/store.js').StorageArea} StorageArea
 */

/**
 * @param {StorageArea} area
 * @returns {Promise<Tier>}
 */
export async function readTier(area) {
  const got = await area.get(LICENSE_STORAGE_KEY);
  const text = got?.[LICENSE_STORAGE_KEY];
  return tierFromStored(typeof text === 'string' ? text : undefined, GUMROAD_PRODUCT_ID);
}

/** @param {StorageArea} area */
export async function readLicense(area) {
  const got = await area.get(LICENSE_STORAGE_KEY);
  const text = got?.[LICENSE_STORAGE_KEY];
  return parseStoredLicense(typeof text === 'string' ? text : undefined);
}

/**
 * The permissions request for activation. Firefox also gets the optional data collection
 * permission declared in its manifest. Must be called directly in a click handler.
 * @param {boolean} isFirefox
 */
export function permissionRequest(isFirefox) {
  return isFirefox ? { origins: [GUMROAD_ORIGIN], data_collection: [...DATA_COLLECTION] } : { origins: [GUMROAD_ORIGIN] };
}

/**
 * Hex SHA-256 of a trimmed key. Only the hash is kept in the "activated here" list.
 * @param {string} key
 */
export async function keyHash(key) {
  const bytes = new TextEncoder().encode(key.trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Masks a key for display: only the last four characters stay visible.
 * @param {string} key
 */
export function maskKey(key) {
  const k = key.trim();
  return k.length <= 4 ? '****' : `****${k.slice(-4)}`;
}
