import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { manifestFor } from '../scripts/manifest.mjs';

const base = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));

describe('manifestFor', () => {
  it('adds the Firefox id, minimum version and data collection declaration', () => {
    const m = manifestFor(base, 'firefox');
    expect(m.browser_specific_settings.gecko).toEqual({
      id: 'clockpane@larchwick',
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['none'], optional: ['authenticationInfo'] },
    });
    expect(m.browser_specific_settings.gecko_android.strict_min_version).toBe('142.0');
  });
  it('keeps the Edge build free of Firefox keys', () => {
    const m = manifestFor(base, 'edge');
    expect(m.browser_specific_settings).toBeUndefined();
    expect(m.manifest_version).toBe(3);
  });
  it('asks for storage and alarms, Gumroad only as an optional host, no content scripts', () => {
    for (const t of /** @type {const} */ (['firefox', 'edge'])) {
      const m = manifestFor(base, t);
      expect(m.version).toBe('0.2.0');
      expect(m.permissions).toEqual(['storage', 'alarms']);
      expect(m.optional_host_permissions).toEqual(['https://api.gumroad.com/*']);
      expect(m.host_permissions).toBeUndefined();
      expect(m.content_scripts).toBeUndefined();
      expect(m.web_accessible_resources).toBeUndefined();
      expect(m.options_ui).toEqual({ page: 'options.html', open_in_tab: true });
    }
    expect(manifestFor(base, 'firefox').background).toEqual({ scripts: ['background.js'], type: 'module' });
    expect(manifestFor(base, 'edge').background).toEqual({ service_worker: 'background.js', type: 'module' });
  });
  it('maps a background script to each browser key', () => {
    const withBg = { ...base, background: { script: 'bg.js' } };
    expect(manifestFor(withBg, 'firefox').background).toEqual({ scripts: ['bg.js'], type: 'module' });
    expect(manifestFor(withBg, 'edge').background).toEqual({ service_worker: 'bg.js', type: 'module' });
  });
  it('does not change the shared manifest', () => {
    const copy = structuredClone(base);
    manifestFor(base, 'firefox');
    expect(base).toEqual(copy);
  });
  it('rejects unknown targets', () => {
    expect(() => manifestFor(base, /** @type {any} */ ('safari'))).toThrow();
  });
});
