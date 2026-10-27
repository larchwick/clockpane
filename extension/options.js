// Options page: Pro license (with the consent screen) and the Pro settings.
// The only network request in Clockpane starts here, from the "Agree and check key" or
// "Re-check" buttons, through pro/transport.js. Everything else stays in storage.local.

import { formatDay } from './lib/time.js';
import {
  activeSet, addSet, exportData, importData, loadState, removeSet, renameSet, saveState, setBadge,
  setWorkHours, STORAGE_KEY, switchSet,
} from './lib/store.js';
import { checkLicense, recheckAction } from './pro/activation.js';
import { CONSENT_STORAGE_KEY, CONSENT_TEXT, consentRecord, hasConsent } from './pro/consent.js';
import {
  ACTIVATED_HERE_KEY, GUMROAD_PRODUCT_URL, keyHash, maskKey, permissionRequest, PRO_PRICE,
  readLicense, readTier, REFUND_DAYS,
} from './pro/license.js';
import { LICENSE_STORAGE_KEY, serializeStoredLicense } from './pro/storedLicense.js';
import { postVerify } from './pro/transport.js';

/** @typedef {import('./lib/store.js').State} State */
/** @typedef {import('./lib/store.js').Change} Change */

const SUPPORT_URL = 'https://github.com/larchwick/clockpane/issues';
const PRIVACY_URL = 'https://github.com/larchwick/clockpane/blob/main/PRIVACY.md';

const g = /** @type {any} */ (globalThis);
const ext = g.browser ?? g.chrome;
const area = ext.storage.local;
const isFirefox = typeof ext.runtime.getBrowserInfo === 'function';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const els = {
  status: $('lic-status'),
  free: $('lic-free'),
  pro: $('lic-pro'),
  price: $('price'),
  refundDays: $('refund-days'),
  buy: /** @type {HTMLAnchorElement} */ ($('buy')),
  key: /** @type {HTMLInputElement} */ ($('lic-key')),
  activate: /** @type {HTMLButtonElement} */ ($('lic-activate')),
  masked: $('lic-masked'),
  checked: $('lic-checked'),
  recheck: /** @type {HTMLButtonElement} */ ($('lic-recheck')),
  remove: /** @type {HTMLButtonElement} */ ($('lic-remove')),
  consent: $('consent'),
  consentText: $('consent-text'),
  agree: /** @type {HTMLButtonElement} */ ($('consent-agree')),
  cancel: $('consent-cancel'),
  licMsg: $('lic-msg'),
  proNote: $('pro-note'),
  proBox: /** @type {HTMLFieldSetElement} */ ($('pro')),
  setSelect: /** @type {HTMLSelectElement} */ ($('set-select')),
  setName: /** @type {HTMLInputElement} */ ($('set-name')),
  setRename: $('set-rename'),
  setNew: $('set-new'),
  setCopy: $('set-copy'),
  setDelete: /** @type {HTMLButtonElement} */ ($('set-delete')),
  workRows: $('work-rows'),
  badge: /** @type {HTMLSelectElement} */ ($('badge-clock')),
  exportBtn: $('export'),
  importInput: /** @type {HTMLInputElement} */ ($('import')),
  msg: $('msg'),
  privacy: /** @type {HTMLAnchorElement} */ ($('privacy')),
  support: /** @type {HTMLAnchorElement} */ ($('support')),
};

/** @type {State} */
let state;
/** @type {import('./lib/store.js').Tier} */
let tier = 'free';
/** @type {import('./pro/gumroad.js').StoredLicense | undefined} */
let license;
let busy = false;

/** @param {HTMLElement} el @param {string} text @param {boolean} [bad] */
function tell(el, text, bad = false) {
  el.textContent = text;
  el.classList.toggle('bad', bad);
}

/** @param {number} m */
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** @param {string} v */
const minutes = (v) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};

async function reload() {
  [state, tier, license] = await Promise.all([loadState(area), readTier(area), readLicense(area)]);
  render();
}

/** @param {Change} change @param {string} [okText] */
async function apply(change, okText = '') {
  if (!change.ok) { tell(els.msg, change.error, true); return; }
  state = change.state;
  await saveState(area, state);
  tell(els.msg, okText);
  render();
}

function renderLicense() {
  const pro = tier === 'pro' && license !== undefined;
  els.free.hidden = pro;
  els.pro.hidden = !pro;
  els.status.textContent = pro ? 'Pro is active in this browser.' : 'Free edition.';
  if (pro && license) {
    els.masked.textContent = maskKey(license.licenseKey);
    els.checked.textContent = formatDay(new Date(license.checkedAt), Intl.DateTimeFormat().resolvedOptions().timeZone);
  }
  for (const b of [els.activate, els.agree, els.recheck, els.remove]) b.disabled = busy;
}

function renderPro() {
  const pro = tier === 'pro';
  els.proBox.disabled = !pro;
  els.proNote.hidden = pro;
  els.setSelect.replaceChildren(...state.sets.map((s) => {
    const o = document.createElement('option');
    o.value = s.id;
    o.textContent = `${s.name} (${s.clocks.length} ${s.clocks.length === 1 ? 'clock' : 'clocks'})`;
    return o;
  }));
  els.setSelect.value = state.active;
  els.setDelete.disabled = !pro || state.sets.length < 2;
  if (document.activeElement !== els.setName) els.setName.value = activeSet(state).name;

  const clocks = activeSet(state).clocks;
  els.workRows.replaceChildren(...clocks.map((c) => {
    const tr = document.createElement('tr');
    tr.dataset.id = c.id;
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = c.label ? `${c.label} (${c.zone})` : c.zone;
    tr.append(name);
    for (const which of /** @type {const} */ (['start', 'end'])) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'time';
      input.step = '900';
      input.className = `work-${which}`;
      input.value = hhmm(c.work[which]);
      input.setAttribute('aria-label', `${which === 'start' ? 'Start' : 'End'} of working hours for ${c.label || c.zone}`);
      input.addEventListener('change', () => {
        const row = /** @type {HTMLElement} */ (input.closest('tr'));
        const s = minutes(/** @type {HTMLInputElement} */ (row.querySelector('.work-start')).value);
        const e = minutes(/** @type {HTMLInputElement} */ (row.querySelector('.work-end')).value);
        if (!Number.isFinite(s) || !Number.isFinite(e)) return;
        void apply(setWorkHours(state, c.id, s, e), 'Working hours saved.');
      });
      td.append(input);
      tr.append(td);
    }
    return tr;
  }));
  if (clocks.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'This set has no clocks yet. Add them from the toolbar popup.';
    tr.append(td);
    els.workRows.append(tr);
  }

  const off = document.createElement('option');
  off.value = '';
  off.textContent = 'Nothing (badge off)';
  els.badge.replaceChildren(off, ...clocks.map((c) => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.label ? `${c.label} (${c.zone})` : c.zone;
    return o;
  }));
  els.badge.value = state.badge !== null && clocks.some((c) => c.id === state.badge) ? state.badge : '';
}

function render() {
  renderLicense();
  renderPro();
}

/** @returns {Promise<string[]>} */
async function activatedHere() {
  const got = await area.get(ACTIVATED_HERE_KEY);
  const list = got?.[ACTIVATED_HERE_KEY];
  return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
}

/**
 * Asks the browser for api.gumroad.com (and on Firefox the authenticationInfo data
 * collection permission). Must be the first await in a click handler.
 */
async function askPermission() {
  try {
    return Boolean(await ext.permissions.request(permissionRequest(isFirefox)));
  } catch {
    return false;
  }
}

/** @param {string} key @param {'activation' | 'recheck'} mode */
async function runCheck(key, mode) {
  busy = true;
  renderLicense();
  tell(els.licMsg, 'Checking the key with Gumroad...');
  try {
    const consented = hasConsent((await area.get(CONSENT_STORAGE_KEY))?.[CONSENT_STORAGE_KEY]);
    return await checkLicense({ rawKey: key, mode, consented, transport: postVerify, now: () => new Date() });
  } finally {
    busy = false;
  }
}

async function onAgree() {
  const key = els.key.value.trim();
  if (!key) { els.consent.hidden = true; tell(els.licMsg, 'Paste your license key first. Nothing was sent.', true); return; }
  const granted = await askPermission();
  if (!granted) {
    els.consent.hidden = true;
    tell(els.licMsg, 'The browser did not allow access to api.gumroad.com, so nothing was sent.', true);
    return;
  }
  await area.set({ [CONSENT_STORAGE_KEY]: consentRecord(new Date()) });
  els.consent.hidden = true;
  const hash = await keyHash(key);
  const here = await activatedHere();
  const result = await runCheck(key, here.includes(hash) ? 'recheck' : 'activation');
  if (!result.valid) { tell(els.licMsg, result.message, true); renderLicense(); return; }
  await area.set({
    [LICENSE_STORAGE_KEY]: serializeStoredLicense(result.license),
    [ACTIVATED_HERE_KEY]: here.includes(hash) ? here : [...here, hash],
  });
  els.key.value = '';
  tell(els.licMsg, 'Pro is on. Thank you for supporting Clockpane.');
  await reload();
}

async function onRecheck() {
  const granted = await askPermission();
  if (!license) return;
  if (!granted) { tell(els.licMsg, 'The browser did not allow access to api.gumroad.com, so nothing was sent. Pro stays on.', true); return; }
  if (!hasConsent((await area.get(CONSENT_STORAGE_KEY))?.[CONSENT_STORAGE_KEY])) {
    await area.set({ [CONSENT_STORAGE_KEY]: consentRecord(new Date()) });
  }
  const result = await runCheck(license.licenseKey, 'recheck');
  const action = recheckAction(result);
  if (action === 'update' && result.valid) {
    await area.set({ [LICENSE_STORAGE_KEY]: serializeStoredLicense({ ...result.license, mode: license.mode }) });
    tell(els.licMsg, 'The key is still valid.');
  } else if (action === 'remove' && !result.valid) {
    await area.remove(LICENSE_STORAGE_KEY);
    tell(els.licMsg, `${result.message} Pro was turned off in this browser. Your clocks and sets are kept.`, true);
  } else if (!result.valid) {
    tell(els.licMsg, `${result.message} Pro stays on.`, true);
  }
  await reload();
}

async function onRemove() {
  await area.remove(LICENSE_STORAGE_KEY);
  try {
    await ext.permissions.remove(permissionRequest(isFirefox));
  } catch {
    // Older browsers may not know the data_collection key. The license is gone either way.
  }
  tell(els.licMsg, 'The license was removed from this browser. Your clocks and sets are kept. Gumroad still counts this browser as one of the 3 activations, but activating the same key here again will not use another one. To move it to another browser, ask through the support page (do not post your key there).');
  await reload();
}

function onExport() {
  const data = exportData(state, new Date());
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clockpane-${data.exportedAt.slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  tell(els.msg, 'Export saved to your downloads.');
}

async function onImport() {
  const file = els.importInput.files?.[0];
  els.importInput.value = '';
  if (!file) return;
  if (file.size > 2_000_000) { tell(els.msg, 'That file is too large for a Clockpane export.', true); return; }
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    tell(els.msg, 'That file is not valid JSON.', true);
    return;
  }
  const change = importData(state, raw);
  const skipped = change.skipped ? ` ${change.skipped} could not be read and were skipped.` : '';
  await apply(change, `Imported ${change.added ?? 0} ${change.added === 1 ? 'set' : 'sets'}.${skipped}`);
}

async function main() {
  els.price.textContent = PRO_PRICE;
  els.refundDays.textContent = String(REFUND_DAYS);
  els.buy.href = GUMROAD_PRODUCT_URL;
  els.privacy.href = PRIVACY_URL;
  els.support.href = SUPPORT_URL;
  els.consentText.replaceChildren(...CONSENT_TEXT.map((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    return li;
  }));

  els.activate.addEventListener('click', () => {
    if (!els.key.value.trim()) { tell(els.licMsg, 'Paste your license key first. Nothing was sent.', true); return; }
    tell(els.licMsg, '');
    els.consent.hidden = false;
    els.agree.focus();
  });
  els.key.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') els.activate.click(); });
  els.cancel.addEventListener('click', () => { els.consent.hidden = true; tell(els.licMsg, 'Cancelled. Nothing was sent.'); });
  els.agree.addEventListener('click', () => void onAgree());
  els.recheck.addEventListener('click', () => void onRecheck());
  els.remove.addEventListener('click', () => void onRemove());

  els.setSelect.addEventListener('change', () => void apply(switchSet(state, els.setSelect.value)));
  els.setRename.addEventListener('click', () => void apply(renameSet(state, state.active, els.setName.value), 'Set renamed.'));
  els.setNew.addEventListener('click', () => void apply(addSet(state, els.setName.value, false), 'New set created and made active.'));
  els.setCopy.addEventListener('click', () => void apply(addSet(state, els.setName.value || `${activeSet(state).name} copy`, true), 'Set copied and made active.'));
  els.setDelete.addEventListener('click', () => {
    const name = activeSet(state).name;
    if (!window.confirm(`Delete the set "${name}" and its clocks?`)) return;
    void apply(removeSet(state, state.active), `Deleted "${name}".`);
  });
  els.badge.addEventListener('change', () => void apply(setBadge(state, els.badge.value || null), els.badge.value ? 'The toolbar button now shows this clock.' : 'Badge off.'));
  els.exportBtn.addEventListener('click', onExport);
  els.importInput.addEventListener('change', () => void onImport());

  ext.storage.onChanged.addListener((/** @type {Record<string, unknown>} */ changes, /** @type {string} */ areaName) => {
    if (areaName === 'local' && (STORAGE_KEY in changes || LICENSE_STORAGE_KEY in changes)) void reload();
  });
  await reload();
  document.body.dataset.ready = 'true';
}

void main();
