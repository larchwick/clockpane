// Popup controller. Reads and writes storage.local only. No network calls.
// Pro (from a license stored in this browser): unlimited clocks, clock sets, meeting planner.

import {
  cityName, dayShift, diffLabel, formatDay, formatOffset, formatTime, localZone,
  offsetMinutes, resolveZone, searchEntries, searchZones, zonedParts, zonedTimeToDate,
} from './lib/time.js';
import {
  activeSet, addClock, FREE_CLOCK_LIMIT, hiddenClockCount, loadState, moveClock, removeClock, renameClock,
  saveState, setHour12, STORAGE_KEY, switchSet, visibleClocks,
} from './lib/store.js';
import { planDay, summarize } from './lib/planner.js';
import { readTier } from './pro/license.js';
import { LICENSE_STORAGE_KEY } from './pro/storedLicense.js';
import { PRO_PRICE } from './pro/license.js';

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
  tier: $('tier'),
  openOptions: $('open-options'),
  setRow: $('set-row'),
  setSelect: /** @type {HTMLSelectElement} */ ($('set-select')),
  plannerToggle: $('planner-toggle'),
  planner: $('planner'),
  plannerTitle: $('planner-title'),
  plannerGrid: $('planner-grid'),
  plannerSummary: $('planner-summary'),
  pitch: $('pro-pitch'),
  pitchText: $('pro-pitch-text'),
  pitchOpen: $('pro-pitch-open'),
  hiddenNote: $('hidden-note'),
};

/** @type {State} */
let state;
/** @type {import('./lib/store.js').Tier} */
let tier = 'free';
let plannerOpen = false;
/** The clocks this edition shows. @returns {import('./lib/store.js').Clock[]} */
const shown = () => visibleClocks(state, tier);
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
  for (const c of shown()) {
    const o = document.createElement('option');
    o.value = c.zone;
    o.textContent = c.label || cityName(c.zone);
    els.convZone.append(o);
  }
  if (shown().length === 0) {
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
  shown().forEach((c, i) => {
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
    down.disabled = i === shown().length - 1;
    up.addEventListener('click', () => void commit(moveClock(state, c.id, -1).state));
    down.addEventListener('click', () => void commit(moveClock(state, c.id, 1).state));
    li.querySelector('.rename')?.addEventListener('click', () => { editingId = c.id; render(); });
    li.querySelector('.remove')?.addEventListener('click', () => { say(''); void commit(removeClock(state, c.id).state); });
    els.list.append(li);
  });
  const full = tier === 'free' && activeSet(state).clocks.length >= FREE_CLOCK_LIMIT;
  els.addBtn.disabled = full;
  els.addZone.disabled = full;
  els.addLabel.disabled = full;
  els.addZone.placeholder = full ? `${FREE_CLOCK_LIMIT} of ${FREE_CLOCK_LIMIT} clocks in use` : 'Add a city or time zone';
  els.tier.textContent = tier === 'pro' ? 'Pro' : '';
  els.tier.classList.toggle('pro', tier === 'pro');
  els.setRow.hidden = tier !== 'pro';
  if (tier === 'pro') {
    els.setSelect.replaceChildren(...state.sets.map((s) => {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = `${s.name} (${s.clocks.length})`;
      return o;
    }));
    els.setSelect.value = state.active;
  }
  const hidden = hiddenClockCount(state, tier);
  els.hiddenNote.hidden = hidden === 0;
  els.hiddenNote.textContent = hidden === 0 ? '' : `${hidden} more saved ${hidden === 1 ? 'clock is' : 'clocks are'} kept and come back with Pro.`;
  if (full) showPitch(`The free edition holds ${FREE_CLOCK_LIMIT} clocks. Pro (${PRO_PRICE}) has unlimited clocks, clock sets, a meeting planner, export and a toolbar badge.`);
  else if (!(tier === 'free' && plannerOpen)) els.pitch.hidden = true;
  renderZoneSelect();
  renderTimes();
  renderPlanner();
}

/** @param {string} text */
function showPitch(text) {
  els.pitchText.textContent = text;
  els.pitch.hidden = false;
}

function renderPlanner() {
  els.plannerToggle.setAttribute('aria-expanded', String(plannerOpen));
  els.planner.hidden = !(plannerOpen && tier === 'pro');
  if (els.planner.hidden) return;
  const zone = els.convZone.value || here;
  const [y, mo, d] = els.convDate.value.split('-').map(Number);
  if (![y, mo, d].every(Number.isFinite)) return;
  const clocks = shown();
  const plan = planDay({ year: y, month: mo, day: d }, zone, clocks);
  els.plannerTitle.textContent = `${els.convDate.value}, hours in ${cityName(zone)}`;
  const bestSet = new Set();
  for (const r of plan.best) for (const s of plan.slots) if (s.at >= r.from && s.at < r.to && plan.bestCount > 0) bestSet.add(s.at.getTime());
  const pickedAt = pinned ? pinned.getTime() : -1;
  /** @param {HTMLElement} row */
  const cols = (row) => row.style.setProperty('--cols', String(plan.slots.length));
  const head = document.createElement('div');
  head.className = 'pl-row pl-head';
  head.setAttribute('role', 'row');
  cols(head);
  const corner = document.createElement('span');
  corner.className = 'pl-name';
  corner.textContent = cityName(zone);
  head.append(corner);
  for (const s of plan.slots) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pl-cell';
    if (pickedAt >= s.at.getTime() && pickedAt < s.at.getTime() + 3600000) b.classList.add('picked');
    b.textContent = String(s.hour);
    b.title = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')} in ${cityName(zone)}: ${s.working} of ${clocks.length} at work`;
    b.dataset.at = String(s.at.getTime());
    b.addEventListener('click', () => {
      pinned = new Date(s.at.getTime());
      fillConverterInputs();
      renderTimes();
      renderPlanner();
    });
    head.append(b);
  }
  const rows = [head];
  clocks.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'pl-row';
    row.setAttribute('role', 'row');
    cols(row);
    const name = document.createElement('span');
    name.className = 'pl-name';
    name.textContent = c.label || cityName(c.zone);
    row.append(name);
    for (const s of plan.slots) {
      const cell = s.cells[i];
      const el = document.createElement('span');
      el.className = `pl-cell ${cell.status}`;
      if (bestSet.has(s.at.getTime())) el.classList.add('best');
      el.title = `${name.textContent} ${String(cell.hour).padStart(2, '0')}:${String(cell.minute).padStart(2, '0')}`;
      row.append(el);
    }
    rows.push(row);
  });
  els.plannerGrid.replaceChildren(...rows);
  els.plannerSummary.textContent = summarize(plan, clocks.length);
}

function openOptions() {
  void ext.runtime.openOptionsPage();
  window.close();
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
  renderPlanner();
}

async function main() {
  [state, tier] = await Promise.all([loadState(area), readTier(area)]);
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
  els.convZone.addEventListener('change', () => { if (pinned) onPick(); else { fillConverterInputs(); renderPlanner(); } });
  els.convNow.addEventListener('click', () => { pinned = null; fillConverterInputs(); renderTimes(); renderPlanner(); });
  els.openOptions.addEventListener('click', openOptions);
  els.pitchOpen.addEventListener('click', openOptions);
  els.setSelect.addEventListener('change', () => { void commit(switchSet(state, els.setSelect.value).state); });
  els.plannerToggle.addEventListener('click', () => {
    plannerOpen = !plannerOpen;
    if (tier === 'free') {
      if (plannerOpen) showPitch(`The meeting planner is part of Clockpane Pro (${PRO_PRICE}). It shows the hours of a day when everyone on your list is at work.`);
      else els.pitch.hidden = true;
    }
    renderPlanner();
  });
  ext.storage.onChanged.addListener((/** @type {Record<string, unknown>} */ changes, /** @type {string} */ areaName) => {
    if (areaName !== 'local' || !(STORAGE_KEY in changes || LICENSE_STORAGE_KEY in changes)) return;
    void Promise.all([loadState(area), readTier(area)]).then(([s, t]) => {
      if (JSON.stringify(s) === JSON.stringify(state) && t === tier) return;
      state = s;
      tier = t;
      render();
    });
  });
  els.form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const zone = pickZone(els.addZone.value);
    if (!zone) { say('No matching time zone. Try a city like Tokyo or a zone like Europe/Paris.'); return; }
    const change = addClock(state, zone, els.addLabel.value, tier);
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
