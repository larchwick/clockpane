/**
 * The only network code in Clockpane. It runs only from the options page after consent.
 * One form encoded POST to the Gumroad verify endpoint, redirects refused, 15 s timeout,
 * and a URL guard. ESLint allows fetch in this file only.
 */

import { GUMROAD_VERIFY_URL } from './gumroad.js';

const TIMEOUT_MS = 15_000;

/** @type {import('./activation.js').Transport} */
export const postVerify = async (request) => {
  if (request.url !== GUMROAD_VERIFY_URL) {
    throw new Error('Refusing to send a license key anywhere but the Gumroad verify endpoint.');
  }
  const response = await fetch(GUMROAD_VERIFY_URL, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
    redirect: 'error',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  /** @type {unknown} */
  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return { status: response.status, body };
};
