import { describe, expect, it, vi } from 'vitest';
import { checkLicense, recheckAction } from '../pro/activation.js';
import { hasConsent, consentRecord } from '../pro/consent.js';
import { buildVerifyRequest, GUMROAD_PRODUCT_ID, GUMROAD_VERIFY_URL, parseVerifyResponse } from '../pro/gumroad.js';
import { FreeLicense, PRO_ENABLED } from '../pro/license.js';
import { parseStoredLicense, serializeStoredLicense, tierFromStored } from '../pro/storedLicense.js';

const PID = 'test-product-id';
const now = () => new Date('2026-10-27T20:00:00Z');
const ok = (purchase = {}, uses = 1) => ({ success: true, uses, purchase: { product_id: PID, sale_id: 's1', refunded: false, disputed: false, chargebacked: false, ...purchase } });

describe('Pro module is off', () => {
  it('has no product id, is disabled and reports Free', () => {
    expect(GUMROAD_PRODUCT_ID).toBeNull();
    expect(PRO_ENABLED).toBe(false);
    expect(FreeLicense.isPro()).toBe(false);
    expect(buildVerifyRequest('KEY', 'activation')).toBeUndefined();
    expect(tierFromStored(serializeStoredLicense({ productId: PID, licenseKey: 'k', saleId: '', uses: 1, mode: 'activation', checkedAt: now().toISOString() }), GUMROAD_PRODUCT_ID)).toBe('free');
  });
  it('sends nothing while not configured or without consent', async () => {
    const transport = vi.fn();
    expect((await checkLicense({ rawKey: 'KEY', mode: 'activation', consented: true, transport, now })).reason).toBe('not-configured');
    expect((await checkLicense({ rawKey: 'KEY', mode: 'activation', consented: false, transport, now, productId: PID })).reason).toBe('not-configured');
    expect((await checkLicense({ rawKey: '  ', mode: 'activation', consented: true, transport, now, productId: PID })).reason).toBe('invalid-key');
    expect(transport).not.toHaveBeenCalled();
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
