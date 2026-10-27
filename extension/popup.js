// Popup controller. Reads and writes storage.local only. No network calls.

import {
  cityName, dayShift, diffLabel, formatDay, formatOffset, formatTime, localZone,
  offsetMinutes, resolveZone, searchEntries, searchZones, zonedParts, zonedTimeToDate,
} from './lib/time.js';
import {
  addClock, FREE_CLOCK_LIMIT, loadState, moveClock, removeClock, renameClock, saveState, setHour12,
} from './lib/store.js';

/** @typedef {import('./lib/store.js').State} State */

const g = /** @type {any} */ (globalThis);
const ext = g.browser ?? g.chrome;
/** @type {import('./lib/store.js').StorageArea} */
const area = ext.storage.local;

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const els = {
  hour12: /** @type {HTMLInputElement} */ ($('hour12')),
  convZone: /** @type {HTMLSelectElement} */ ($('conv-zone')),
  convDate: /** @type {HTMLInputElement} */ ($('conv-date')),
  convTime: /** @type {HTMLInputElement} */ ($('conv-time')),
  convNow: $('conv-now'),
  mode: $('mode'),
  list: $('clocks'),
  form: /** @type {HTMLFormElement} */ ($('add-form')),
  addZone: /** @type {HTMLInputElement} */ ($('add-zone')),
  addLabel: /** @type {HTMLInputElement} */ ($('add-label')),
  addBtn: /** @type {HTMLButtonElement} */ ($('add-btn')),
  zoneList: $('zone-list'),
  message: $('message'),
  template: /** @type {HTMLTemplateElement} */ ($('clock-row')),
};

/** @type {State} */
let state;
/** When set, the clocks show this instant instead of now. @type {Date | null} */
let pinned = null;
let editingId = '';
const here = localZone();

/** @param {State} next */
async function commit(next) {
  state = next;
  await saveState(area, state);
  render();
}

/** @param {string} text */
function say(text) {
  els.message.textContent = text;
}

/** @param {number} n */
const pad = (n) => String(n).padStart(2, '0');

function fillConverterInputs() {
  const zone = els.convZone.value || here;
  const p = zonedParts(pinned ?? new Date(), zone);
  els.convDate.value = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  els.convTime.value = `${pad(p.hour)}:${pad(p.minute)}`;
}

function renderZoneSelect() {
  const prev = els.convZone.value;
  els.convZone.replaceChildren();
  for (const c of state.clocks) {
    const o = document.createElement('option');
    o.value = c.zone;
    o.textContent = c.label || cityName(c.zone);
    els.convZone.append(o);
  }
  if (state.clocks.length === 0) {
    const o = document.createElement('option');
    o.value = here;
    o.textContent = cityName(here);
    els.convZone.append(o);
  }
  if ([...els.convZone.options].some((o) => o.value === prev)) els.convZone.value = prev;
}

function renderTimes() {
  const at = pinned ?? new Date();
  for (const li of els.list.querySelectorAll('li.clock')) {
    const zone = /** @type {HTMLElement} */ (li).dataset.zone ?? 'UTC';
    const time = /** @type {HTMLElement} */ (li.querySelector('.time'));
    const day = /** @type {HTMLElement} */ (li.querySelector('.day'));
    const zoneEl = /** @type {HTMLElement} */ (li.querySelector('.zone'));
    time.textContent = formatTime(at, zone, state.hour12);
    const shift = dayShift(at, zone, here);
    const rel = shift === 0 ? '' : shift === 1 ? ' (tomorrow)' : shift === -1 ? ' (yesterday)' : ` (${shift > 0 ? '+' : ''}${shift}d)`;
    day.textContent = formatDay(at, zone) + rel;
    const offset = formatOffset(offsetMinutes(at, zone));
    zoneEl.textContent = [zone, offset === zone ? '' : offset, diffLabel(at, zone, here)].filter(Boolean).join(' · ');
  }
  if (pinned) {
    els.mode.textContent = 'Showing the time you picked. Press Now to go back.';
    els.mode.classList.add('converting');
  } else {
    els.mode.textContent = 'Showing the current time.';
    els.mode.classList.remove('converting');
    if (document.activeElement !== els.convDate && document.activeElement !== els.convTime) fillConverterInputs();
  }
}

function render() {
  els.hour12.checked = state.hour12;
  els.list.replaceChildren();
  state.clocks.forEach((c, i) => {
    const li = /** @type {HTMLElement} */ (els.template.content.firstElementChild?.cloneNode(true));
    li.dataset.id = c.id;
    li.dataset.zone = c.zone;
    const label = /** @type {HTMLElement} */ (li.querySelector('.label'));
    if (editingId === c.id) {
      const input = document.createElement('input');
      input.className = 'label-edit';
      input.value = c.label;
      input.maxLength = 40;
      input.placeholder = cityName(c.zone);
      input.setAttribute('aria-label', 'New label');
      label.replaceChildren(input);
      queueMicrotask(() => input.focus());
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { editingId = ''; void commit(renameClock(state, c.id, input.value).state); }
        if (ev.key === 'Escape') { editingId = ''; render(); }
      });
      input.addEventListener('blur', () => { if (editingId === c.id) { editingId = ''; void commit(renameClock(state, c.id, input.value).state); } });
    } else {
      label.textContent = c.label || cityName(c.zone);
    }
    const up = /** @type {HTMLButtonElement} */ (li.querySelector('.up'));
    const down = /** @type {HTMLButtonElement} */ (li.querySelector('.down'));
    up.disabled = i === 0;
    down.disabled = i === state.clocks.length - 1;
    up.addEventListener('click', () => void commit(moveClock(state, c.id, -1).state));
    down.addEventListener('click', () => void commit(moveClock(state, c.id, 1).state));
    li.querySelector('.rename')?.addEventListener('click', () => { editingId = c.id; render(); });
    li.querySelector('.remove')?.addEventListener('click', () => { say(''); void commit(removeClock(state, c.id).state); });
    els.list.append(li);
  });
  const full = state.clocks.length >= FREE_CLOCK_LIMIT;
  els.addBtn.disabled = full;
  els.addZone.disabled = full;
  els.addLabel.disabled = full;
  els.addZone.placeholder = full ? `${FREE_CLOCK_LIMIT} of ${FREE_CLOCK_LIMIT} clocks in use` : 'Add a city or time zone';
  renderZoneSelect();
  renderTimes();
}

/** @param {string} text */
function pickZone(text) {
  const m = /\(([^()]+)\)\s*$/.exec(text);
  if (m) {
    const z = resolveZone(m[1]);
    if (z) return z.zone;
  }
  const exact = resolveZone(text);
  if (exact) return exact.zone;
  const found = searchZones(text, 2);
  return found.length === 1 ? found[0].zone : null;
}

function onPick() {
  const zone = els.convZone.value || here;
  const [y, mo, d] = els.convDate.value.split('-').map(Number);
  const [h, mi] = els.convTime.value.split(':').map(Number);
  if ([y, mo, d, h, mi].some((n) => !Number.isFinite(n))) return;
  pinned = zonedTimeToDate({ year: y, month: mo, day: d, hour: h, minute: mi }, zone);
  renderTimes();
}

async function main() {
  state = await loadState(area);
  const opts = document.createDocumentFragment();
  for (const e of searchEntries()) {
    const o = document.createElement('option');
    o.value = e.name === e.zone ? e.zone : `${e.name} (${e.zone})`;
    opts.append(o);
  }
  els.zoneList.append(opts);

  els.hour12.addEventListener('change', () => void commit(setHour12(state, els.hour12.checked)));
  els.convDate.addEventListener('change', onPick);
  els.convTime.addEventListener('change', onPick);
  els.convZone.addEventListener('change', () => { if (pinned) onPick(); else fillConverterInputs(); });
  els.convNow.addEventListener('click', () => { pinned = null; fillConverterInputs(); renderTimes(); });
  els.form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const zone = pickZone(els.addZone.value);
    if (!zone) { say('No matching time zone. Try a city like Tokyo or a zone like Europe/Paris.'); return; }
    const change = addClock(state, zone, els.addLabel.value);
    if (!change.ok) { say(change.error); return; }
    say('');
    els.addZone.value = '';
    els.addLabel.value = '';
    void commit(change.state);
  });
  render();
  setInterval(() => { if (!pinned) renderTimes(); }, 1000);
  document.body.dataset.ready = 'true';
}

void main();
