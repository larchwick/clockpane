// Installs dist/firefox as a temporary add-on in Playwright's Firefox through the Remote
// Debugging Protocol (as web-ext run does), opens the popup page in a tab, and drives it.
import { resolve } from 'node:path';
import { expect, firefox, test } from '@playwright/test';
import { journeyAfterReload, journeyBeforeReload } from './journey.js';
import { Rdp } from './rdp.js';

const ADDON_ID = 'clockpane@larchwick';
const UUID = '5d1c3a3e-8f0b-4c55-9a51-6c1f2e7b9a10';
const POPUP = `moz-extension://${UUID}/popup.html`;
const PORT = 6000 + Math.floor(Math.random() * 2000);

test('Clockpane popup works in Firefox', async () => {
  const browser = await firefox.launch({
    headless: true,
    args: ['-start-debugger-server', String(PORT)],
    firefoxUserPrefs: {
      'devtools.debugger.remote-enabled': true,
      'devtools.debugger.prompt-connection': false,
      'extensions.webextensions.uuids': JSON.stringify({ [ADDON_ID]: UUID }),
      'intl.locale.requested': 'en-US',
    },
  });
  const rdp = await Rdp.open(PORT);
  try {
    const addon = await rdp.installTemporaryAddon(resolve('dist/firefox'));
    expect(addon.id).toBe(ADDON_ID);
    const page = await browser.newPage();
    await page.goto('about:blank');
    // Playwright loses track of the tab once it turns into an extension page, so the
    // navigation is fire and forget and the page is driven over RDP from here on.
    page.goto(POPUP).catch(() => {});

    let console = await rdp.consoleFor(POPUP);
    const a = await rdp.evaluate(console, `(${journeyBeforeReload.toString()})()`);
    expect(a.initialRows).toBeGreaterThan(0);
    expect(a.badZoneMessage).toContain('No matching time zone');
    expect(a.rows).toBe(5);
    expect(a.addDisabled).toBe(true);
    expect(a.labels).toEqual(['UTC', 'Tokyo office', 'Kolkata', 'New York', 'Paris']);
    expect(a.converted).toEqual(['12:00', '21:00', '17:30', '07:00', '13:00']);
    expect(a.kolkataZone).toContain('UTC+5:30');
    expect(a.tokyoInput).toBe('12:00');
    expect(a.fromTokyo).toEqual(['03:00', '12:00', '08:30', '22:00', '04:00']);
    expect(a.tokyo12h).toMatch(/12:00\s?PM/i);
    expect(a.kolkata12h).toMatch(/8:30\s?AM/i);
    expect(a.mode).toContain('current time');
    expect(a.firstLabel).toBe('Team Tokyo');
    expect(a.network).toEqual([]);

    await rdp.evalOnce(console, 'void setTimeout(() => location.reload(), 50)');
    await new Promise((r) => setTimeout(r, 1500));
    console = await rdp.consoleFor(POPUP);
    const b = await rdp.evaluate(console, `(${journeyAfterReload.toString()})()`);
    expect(b).toEqual({ rows: 5, firstLabel: 'Team Tokyo', hour12: true, addEnabledAfterRemove: true, network: [] });
  } finally {
    rdp.close();
    await browser.close();
  }
});
