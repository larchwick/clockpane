/**
 * Runs one license check through an injected transport. Pure apart from the transport.
 * It needs a recorded consent, and gives a "not configured" result if the product id is ever empty.
 */

import { buildVerifyRequest, GUMROAD_PRODUCT_ID, parseVerifyResponse } from './gumroad.js';

/**
 * @typedef {import('./gumroad.js').CheckMode} CheckMode
 * @typedef {import('./gumroad.js').LicenseCheckResult} LicenseCheckResult
 * @typedef {import('./gumroad.js').VerifyRequest} VerifyRequest
 * @typedef {{ status: number, body: unknown }} TransportResponse
 * @typedef {(request: VerifyRequest) => Promise<TransportResponse>} Transport
 */

/**
 * Makes exactly one verify call, or none when consent is missing, Pro is not configured,
 * or the key is empty. Network failures become 'unavailable' instead of throwing.
 * @param {{ rawKey: string, mode: CheckMode, consented: boolean, transport: Transport, now: () => Date, productId?: string | null }} args
 * @returns {Promise<LicenseCheckResult>}
 */
export async function checkLicense({ rawKey, mode, consented, transport, now, productId = GUMROAD_PRODUCT_ID }) {
  if (productId === null || String(productId).trim() === '') {
    return { valid: false, reason: 'not-configured', message: 'Pro is not available yet. Nothing was sent.' };
  }
  if (!consented) {
    return { valid: false, reason: 'not-configured', message: 'The license check needs your OK on the consent screen first. Nothing was sent.' };
  }
  const request = buildVerifyRequest(rawKey, mode, productId);
  if (request === undefined) {
    return { valid: false, reason: 'invalid-key', message: 'No license key was entered. Nothing was sent.' };
  }
  /** @type {TransportResponse} */
  let response;
  try {
    response = await transport(request);
  } catch {
    return { valid: false, reason: 'unavailable', message: 'Could not reach Gumroad. Check the connection and try again. Nothing was changed.' };
  }
  return parseVerifyResponse(response.status, response.body, request, now());
}

/**
 * What a re-check does with the stored license. A definite "no" removes it. A failed or
 * unclear call keeps it, so being offline never takes Pro away.
 * @param {LicenseCheckResult} result
 * @returns {'update' | 'remove' | 'keep'}
 */
export function recheckAction(result) {
  if (result.valid) return 'update';
  return result.reason === 'unavailable' || result.reason === 'bad-response' || result.reason === 'not-configured' ? 'keep' : 'remove';
}
