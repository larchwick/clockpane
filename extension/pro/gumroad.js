/**
 * Pure helpers for Pro activation with Gumroad license keys.
 *
 * The check runs only after the user agrees on the consent screen and
 * presses Activate. It sends exactly three form fields to Gumroad: the public product id,
 * the license key the user pasted, and increment_uses_count.
 * Endpoint: POST https://api.gumroad.com/v2/licenses/verify (form encoded). Gumroad says the
 * verify endpoint "does not require an OAuth application", so no secret is shipped.
 *
 * Docs rechecked 2026-10-27: https://gumroad.com/help/article/76-license-keys and
 * https://gumroad.com/api .
 */

export const GUMROAD_VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify';

/** Public Gumroad product id of Clockpane Pro. Not a secret: Gumroad shows it on the product page. @type {string | null} */
export const GUMROAD_PRODUCT_ID = 'hr1yPpDQFFwAmvVhzXReuw==';

/** Gumroad product page. A plain link the user may open, the extension never loads it. */
export const GUMROAD_PRODUCT_URL = 'https://larchwick.gumroad.com/l/sysaii';

/** Host permission requested at activation, optional in the manifest. */
export const GUMROAD_ORIGIN = 'https://api.gumroad.com/*';

/** Price facts shown in the extension and the listings. */
export const PRO_PRICE = '7 USD, one-time';
export const REFUND_DAYS = 14;

/** One purchase may be activated in at most this many browsers. */
export const MAX_MACHINES = 3;

/**
 * @typedef {'activation' | 'recheck'} CheckMode
 * @typedef {{ product_id: string, license_key: string, increment_uses_count: 'true' | 'false' }} VerifyFields
 * @typedef {{ url: string, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, fields: VerifyFields, body: string }} VerifyRequest
 * @typedef {{ productId: string, licenseKey: string, saleId: string, uses: number, mode: CheckMode, checkedAt: string }} StoredLicense
 * @typedef {'not-configured' | 'invalid-key' | 'wrong-product' | 'refunded' | 'disputed' | 'chargebacked' | 'too-many-machines' | 'unavailable' | 'bad-response'} InvalidReason
 * @typedef {{ valid: true, license: StoredLicense } | { valid: false, reason: InvalidReason, message: string }} LicenseCheckResult
 */

/**
 * Builds the verify request, or undefined when the key or product id is empty
 * (so no call can be made while Pro is not configured).
 * @param {string} rawKey
 * @param {CheckMode} mode
 * @param {string | null} [productId]
 * @returns {VerifyRequest | undefined}
 */
export function buildVerifyRequest(rawKey, mode, productId = GUMROAD_PRODUCT_ID) {
  const licenseKey = String(rawKey ?? '').trim();
  const id = String(productId ?? '').trim();
  if (licenseKey.length === 0 || id.length === 0) return undefined;
  /** @type {VerifyFields} */
  const fields = {
    product_id: id,
    license_key: licenseKey,
    increment_uses_count: mode === 'activation' ? 'true' : 'false',
  };
  return {
    url: GUMROAD_VERIFY_URL,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    fields,
    body: new URLSearchParams(fields).toString(),
  };
}

/**
 * @param {InvalidReason} reason
 * @param {string} message
 * @returns {LicenseCheckResult}
 */
function invalid(reason, message) {
  return { valid: false, reason, message };
}

/** @param {unknown} v @returns {Record<string, unknown> | undefined} */
function asRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? /** @type {Record<string, unknown>} */ (v) : undefined;
}

/**
 * Turns Gumroad's HTTP status and JSON body into a result that can be stored as is.
 * Valid only when success is true, the purchase is not refunded, disputed or chargebacked,
 * and on activation the uses count is within MAX_MACHINES. A re-check never fails on the
 * count, because Gumroad also counts rejected activations.
 * @param {number} httpStatus
 * @param {unknown} body
 * @param {{ fields: VerifyFields }} request
 * @param {Date} now
 * @returns {LicenseCheckResult}
 */
export function parseVerifyResponse(httpStatus, body, request, now) {
  if (httpStatus === 404) {
    return invalid('invalid-key', 'Gumroad does not recognize this license key for Clockpane Pro. Check that it was pasted in full.');
  }
  if (httpStatus !== 200) {
    return invalid('unavailable', `Gumroad could not check the key right now (HTTP ${String(httpStatus)}). Nothing was stored. Try again later.`);
  }
  const b = asRecord(body);
  if (b === undefined) return invalid('bad-response', 'Unexpected reply from Gumroad.');
  if (b.success !== true) return invalid('invalid-key', 'Gumroad did not confirm this license key.');
  const purchase = asRecord(b.purchase);
  const uses = b.uses;
  if (purchase === undefined || typeof uses !== 'number' || !Number.isInteger(uses) || uses < 0) {
    return invalid('bad-response', 'Gumroad confirmed the key but the reply was incomplete.');
  }
  if (typeof purchase.product_id === 'string' && purchase.product_id !== request.fields.product_id) {
    return invalid('wrong-product', 'This license key belongs to a different Gumroad product.');
  }
  // Each flag must be present and exactly false. A missing flag is not treated as false.
  if (purchase.refunded !== false) return invalid('refunded', 'This purchase was refunded, so the key is no longer valid.');
  if (purchase.disputed !== false) return invalid('disputed', 'This purchase is disputed, so the key is not valid right now.');
  if (purchase.chargebacked !== false) return invalid('chargebacked', 'This purchase was charged back, so the key is no longer valid.');
  /** @type {CheckMode} */
  const mode = request.fields.increment_uses_count === 'true' ? 'activation' : 'recheck';
  if (mode === 'activation' && uses > MAX_MACHINES) {
    return invalid('too-many-machines', `This key is already active in ${String(MAX_MACHINES)} browsers, the limit for one purchase. Write to support through the GitHub issues page to move it.`);
  }
  return {
    valid: true,
    license: {
      productId: request.fields.product_id,
      licenseKey: request.fields.license_key,
      saleId: typeof purchase.sale_id === 'string' ? purchase.sale_id : '',
      uses,
      mode,
      checkedAt: now.toISOString(),
    },
  };
}
