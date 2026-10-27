// Turns the shared manifest into a per-browser manifest. Pure, unit tested.

export const GECKO_ID = 'clockpane@larchwick';
export const GECKO_MIN = '140.0';
// Firefox for Android only reads data_collection_permissions from 142 on.
export const GECKO_ANDROID_MIN = '142.0';
export const TARGETS = /** @type {const} */ (['firefox', 'edge']);

/**
 * @param {Record<string, any>} base the shared manifest.json
 * @param {'firefox' | 'edge'} target
 * @returns {Record<string, any>}
 */
export function manifestFor(base, target) {
  if (!TARGETS.includes(target)) throw new Error(`Unknown target ${String(target)}`);
  /** @type {Record<string, any>} */
  const m = structuredClone(base);
  delete m.browser_specific_settings;
  // Background: the shared manifest may say { "script": "file.js" }. Firefox MV3 uses
  // background.scripts (event page), Chromium and Edge use background.service_worker.
  if (m.background) {
    const script = m.background.script ?? m.background.service_worker ?? m.background.scripts?.[0];
    if (typeof script !== 'string') throw new Error('background needs one script');
    m.background = target === 'firefox' ? { scripts: [script], type: 'module' } : { service_worker: script, type: 'module' };
  }
  if (target === 'firefox') {
    m.browser_specific_settings = {
      gecko: {
        id: GECKO_ID,
        strict_min_version: GECKO_MIN,
        data_collection_permissions: { required: ['none'] },
      },
      gecko_android: { strict_min_version: GECKO_ANDROID_MIN },
    };
  }
  return m;
}
