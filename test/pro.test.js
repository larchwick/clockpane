import { describe, expect, it, vi } from 'vitest';
import { checkLicense, recheckAction } from '../extension/pro/activation.js';
import { CONSENT_TEXT, hasConsent, consentRecord } from '../extension/pro/consent.js';
import {
  buildVerifyRequest, GUMROAD_ORIGIN, GUMROAD_PRODUCT_ID, GUMROAD_PRODUCT_URL, GUMROAD_VERIFY_URL, MAX_MACHINES, parseVerifyResponse,
} from '../extension/pro/gumroad.js';
import { keyHash, maskKey, permissionRequest, readLicense, readTier } from '../extension/pro/license.js';
import { LICENSE_STORAGE_KEY, parseStoredLicense, serializeStoredLicense, tierFromStored } from '../extension/pro/storedLicense.js';

const PID = 'test-product-id';
const now = () => new Date('2026-10-27T20:00:00Z');
const ok = (purchase = {}, uses = 1) => ({ success: true, uses, purchase: { product_id: PID, sale_id: 's1', refunded: false, disputed: false, chargebacked: false, ...purchase } });

describe('Pro configuration', () => {
  it('points at the Clockpane Pro product and the verify endpoint only', () => {
    expect(GUMROAD_PRODUCT_ID).toBe('hr1yPpDQFFwAmvVhzXReuw==');
    expect(GUMROAD_PRODUCT_URL).toBe('https://larchwick.gumroad.com/l/sysaii');
    expect(GUMROAD_VERIFY_URL).toBe('https://api.gumroad.com/v2/licenses/verify');
    expect(GUMROAD_ORIGIN).toBe('https://api.gumroad.com/*');
    expect(MAX_MACHINES).toBe(3);
  });
  it('form encodes the product id with its trailing equals signs', () => {
    const r = /** @type {any} */ (buildVerifyRequest('KEY', 'activation'));
    expect(r.body).toBe('product_id=hr1yPpDQFFwAmvVhzXReuw%3D%3D&license_key=KEY&increment_uses_count=true');
  });
  it('sends nothing without consent, without a key or without a product id', async () => {
    const transport = vi.fn();
    expect((await checkLicense({ rawKey: 'KEY', mode: 'activation', consented: false, transport, now })).reason).toBe('not-configured');
    expect((await checkLicense({ rawKey: '  ', mode: 'activation', consented: true, transport, now })).reason).toBe('invalid-key');
    expect((await checkLicense({ rawKey: 'KEY', mode: 'activation', consented: true, transport, now, productId: null })).reason).toBe('not-configured');
    expect(transport).not.toHaveBeenCalled();
  });
  it('makes exactly one call after consent', async () => {
    const transport = vi.fn(async () => ({ status: 200, body: ok({ product_id: GUMROAD_PRODUCT_ID }) }));
    const r = await checkLicense({ rawKey: 'KEY', mode: 'activation', consented: true, transport, now });
    expect(r.valid).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('consent text names what is sent and where', () => {
    const text = CONSENT_TEXT.join(' ');
    expect(text).toContain('license key');
    expect(text).toContain('product id');
    expect(text).toContain('api.gumroad.com');
    expect(text).toContain('nothing else');
  });
  it('asks Firefox for the authenticationInfo data collection permission', () => {
    expect(permissionRequest(true)).toEqual({ origins: [GUMROAD_ORIGIN], data_collection: ['authenticationInfo'] });
    expect(permissionRequest(false)).toEqual({ origins: [GUMROAD_ORIGIN] });
  });
  it('reads the tier from storage without any network', async () => {
    /** @type {Record<string, unknown>} */
    const data = {};
    const area = { get: async (/** @type {string} */ k) => (k in data ? { [k]: data[k] } : {}), set: async () => {} };
    expect(await readTier(area)).toBe('free');
    const l = { productId: GUMROAD_PRODUCT_ID, licenseKey: 'ABCD-1234', saleId: 's', uses: 1, mode: /** @type {const} */ ('activation'), checkedAt: now().toISOString() };
    data[LICENSE_STORAGE_KEY] = serializeStoredLicense(l);
    expect(await readTier(area)).toBe('pro');
    expect(await readLicense(area)).toEqual(l);
    data[LICENSE_STORAGE_KEY] = serializeStoredLicense({ ...l, productId: 'other' });
    expect(await readTier(area)).toBe('free');
  });
  it('hashes and masks keys', async () => {
    expect(await keyHash(' abc ')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(maskKey('AAAA-BBBB-CCCC-1234')).toBe('****1234');
    expect(maskKey('abc')).toBe('****');
  });
});

describe('Gumroad verify parsing', () => {
  const act = /** @type {any} */ (buildVerifyRequest(' KEY ', 'activation', PID));
  const re = /** @type {any} */ (buildVerifyRequest('KEY', 'recheck', PID));
  it('builds the three documented form fields', () => {
    expect(act.url).toBe(GUMROAD_VERIFY_URL);
    expect(act.body).toBe('product_id=test-product-id&license_key=KEY&increment_uses_count=true');
    expect(re.fields.increment_uses_count).toBe('false');
  });
  it('accepts a clean purchase', () => {
    const r = parseVerifyResponse(200, ok(), act, now());
    expect(r.valid).toBe(true);
  });
  it.each([
    [404, {}, 'invalid-key'],
    [500, {}, 'unavailable'],
    [200, 'nope', 'bad-response'],
    [200, { success: false }, 'invalid-key'],
    [200, { success: true, purchase: {} }, 'bad-response'],
    [200, ok({ product_id: 'other' }), 'wrong-product'],
    [200, ok({ refunded: true }), 'refunded'],
    [200, ok({ disputed: undefined }), 'disputed'],
    [200, ok({ chargebacked: true }), 'chargebacked'],
    [200, ok({}, 4), 'too-many-machines'],
  ])('HTTP %s %j gives %s', (status, body, reason) => {
    const r = parseVerifyResponse(status, body, act, now());
    expect(r.valid ? 'valid' : r.reason).toBe(reason);
  });
  it('does not apply the machine limit on a re-check', () => {
    expect(parseVerifyResponse(200, ok({}, 9), re, now()).valid).toBe(true);
  });
  it('keeps Pro when offline and removes it on a definite no', async () => {
    const offline = await checkLicense({ rawKey: 'K', mode: 'recheck', consented: true, productId: PID, now, transport: async () => { throw new Error('offline'); } });
    expect(recheckAction(offline)).toBe('keep');
    const refunded = await checkLicense({ rawKey: 'K', mode: 'recheck', consented: true, productId: PID, now, transport: async () => ({ status: 200, body: ok({ refunded: true }) }) });
    expect(recheckAction(refunded)).toBe('remove');
  });
});

describe('stored license and consent', () => {
  it('round trips and rejects damaged data', () => {
    const l = { productId: PID, licenseKey: 'k', saleId: 's', uses: 1, mode: /** @type {const} */ ('activation'), checkedAt: now().toISOString() };
    expect(parseStoredLicense(serializeStoredLicense(l))).toEqual(l);
    expect(tierFromStored(serializeStoredLicense(l), PID)).toBe('pro');
    expect(parseStoredLicense('{')).toBeUndefined();
    expect(parseStoredLicense(JSON.stringify({ v: 2, license: l }))).toBeUndefined();
  });
  it('needs an explicit consent record', () => {
    expect(hasConsent(undefined)).toBe(false);
    expect(hasConsent({ v: 1, agreed: 'yes', at: 'x' })).toBe(false);
    expect(hasConsent(consentRecord(now()))).toBe(true);
  });
});
