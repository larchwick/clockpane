// The Firefox journey runs inside the extension page, because Playwright's Firefox
// cannot attach to moz-extension pages. It drives the same DOM a user does (clicks,
// input and change events) and returns what it saw. Each function is sent as source
// text, so it must not use anything from this module's scope.

/** Part 1: clear, add five clocks, convert, toggle 12h, reorder, rename. */
export async function journeyBeforeReload() {
  const $ = (s) => /** @type {any} */ (document.querySelector(s));
  const rows = () => [...document.querySelectorAll('#clocks li.clock')];
  const until = async (pred, what) => {
    for (let i = 0; i < 200; i++) {
      if (pred()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const set = (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const text = (i, cls) => rows()[i].querySelector(cls).textContent.trim();
  const add = async (zone, label = '') => {
    const n = rows().length;
    set($('#add-zone'), zone);
    set($('#add-label'), label);
    $('#add-btn').click();
    await until(() => rows().length === n + 1 || $('#message').textContent !== '', `add ${zone}`);
  };
  const seen = {};
  await until(() => document.body.dataset.ready === 'true', 'ready');
  seen.initialRows = rows().length;
  while (rows().length > 0) {
    const n = rows().length;
    rows()[0].querySelector('.remove').click();
    await until(() => rows().length === n - 1, 'remove');
  }
  await add('UTC');
  await add('Tokyo', 'Tokyo office');
  await add('Asia/Kolkata');
  await add('new york');
  await add('Nowhere Land');
  seen.badZoneMessage = $('#message').textContent;
  await add('Paris');
  seen.rows = rows().length;
  seen.addDisabled = $('#add-btn').disabled;
  seen.labels = rows().map((_, i) => text(i, '.label'));

  set($('#conv-zone'), 'UTC');
  set($('#conv-date'), '2026-01-15');
  set($('#conv-time'), '12:00');
  await until(() => $('#mode').textContent.includes('you picked'), 'converter');
  seen.converted = rows().map((_, i) => text(i, '.time'));
  seen.kolkataZone = text(2, '.zone');
  set($('#conv-zone'), 'Asia/Tokyo');
  await until(() => text(0, '.time') === '03:00', 'base zone switch');
  seen.tokyoInput = $('#conv-time').value;
  seen.fromTokyo = rows().map((_, i) => text(i, '.time'));

  $('#hour12').click();
  await until(() => /PM/i.test(text(1, '.time')), '12h');
  seen.tokyo12h = text(1, '.time');
  seen.kolkata12h = text(2, '.time');
  $('#conv-now').click();
  seen.mode = $('#mode').textContent;

  rows()[1].querySelector('.up').click();
  await until(() => text(0, '.label') === 'Tokyo office', 'move');
  rows()[0].querySelector('.rename').click();
  await until(() => !!document.querySelector('input.label-edit'), 'rename input');
  const input = $('input.label-edit');
  input.value = 'Team Tokyo';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await until(() => text(0, '.label') === 'Team Tokyo', 'rename');
  seen.firstLabel = text(0, '.label');
  // Give storage.local a moment, then report any network use seen by the page.
  await new Promise((r) => setTimeout(r, 200));
  seen.network = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => !u.startsWith('moz-extension:'));
  return seen;
}

/** Part 2, after a reload: the state came back from storage.local. */
export async function journeyAfterReload() {
  const $ = (s) => /** @type {any} */ (document.querySelector(s));
  for (let i = 0; i < 200 && document.body?.dataset.ready !== 'true'; i++) await new Promise((r) => setTimeout(r, 25));
  const rows = [...document.querySelectorAll('#clocks li.clock')];
  const seen = { rows: rows.length, firstLabel: rows[0]?.querySelector('.label')?.textContent, hour12: $('#hour12').checked };
  rows[4].querySelector('.remove').click();
  for (let i = 0; i < 200 && $('#add-btn').disabled; i++) await new Promise((r) => setTimeout(r, 25));
  seen.addEnabledAfterRemove = !$('#add-btn').disabled;
  seen.network = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => !u.startsWith('moz-extension:'));
  return seen;
}

/**
 * Part 3, Pro: a license record is written to storage.local (what a successful check
 * stores), then more than five clocks, the planner and the toolbar badge are used, and
 * removing the license brings back the free view without losing data.
 * @param {string} licenseKey storage key for the license
 * @param {string} licenseValue serialized license record
 */
export async function journeyPro(licenseKey, licenseValue) {
  const api = /** @type {any} */ (globalThis).browser;
  const $ = (s) => /** @type {any} */ (document.querySelector(s));
  const rows = () => [...document.querySelectorAll('#clocks li.clock')];
  const until = async (pred, what) => {
    for (let i = 0; i < 400; i++) {
      if (await pred()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`timed out waiting for ${what}`);
  };
  const set = (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const seen = {};
  await until(() => document.body.dataset.ready === 'true', 'ready');
  await api.storage.local.set({ [licenseKey]: licenseValue });
  await until(() => $('#tier').textContent === 'Pro', 'pro tier');
  seen.tier = $('#tier').textContent;
  for (const z of ['London', 'Sydney', 'Bucharest']) {
    const n = rows().length;
    set($('#add-zone'), z);
    set($('#add-label'), '');
    $('#add-btn').click();
    await until(() => rows().length === n + 1, `add ${z}`);
  }
  seen.rows = rows().length;
  seen.addEnabled = !$('#add-btn').disabled;

  $('#planner-toggle').click();
  set($('#conv-zone'), 'UTC');
  set($('#conv-date'), '2026-11-03');
  set($('#conv-time'), '10:00');
  await until(() => document.querySelectorAll('#planner-grid .pl-row').length === rows().length + 1, 'planner');
  seen.plannerRows = document.querySelectorAll('#planner-grid .pl-row').length;
  seen.plannerVisible = !$('#planner').hidden;

  const stored = (await api.storage.local.get('clockpane')).clockpane;
  const active = stored.sets.find((s) => s.id === stored.active);
  await api.storage.local.set({ clockpane: { ...stored, badge: active.clocks[0].id } });
  let badge = '';
  await until(async () => { badge = await api.action.getBadgeText({}); return /^\d{1,2}:\d{2}$/.test(badge); }, 'badge');
  seen.badgeOk = true;

  await api.storage.local.remove(licenseKey);
  await until(() => $('#tier').textContent === '' && rows().length === 5, 'free again');
  seen.freeRows = rows().length;
  seen.hiddenNote = $('#hidden-note').textContent;
  await until(async () => (await api.action.getBadgeText({})) === '', 'badge off');
  seen.badgeOff = true;
  seen.network = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => !u.startsWith('moz-extension:'));
  return seen;
}
