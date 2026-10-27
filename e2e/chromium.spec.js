// Loads dist/edge (the Edge build) into Playwright's Chromium as an unpacked extension.
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, test } from '@playwright/test';
import { runProScenario } from './proScenario.js';
import { runScenario } from './scenario.js';

const extPath = resolve('dist/edge');

/** Chromium's id for an unpacked extension: SHA-256 of the path, first 32 hex digits mapped to a-p. */
function unpackedId(path) {
  return [...createHash('sha256').update(path).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join('');
}

test('Clockpane popup works in Chromium (Edge build)', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'clockpane-chromium-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    locale: 'en-US',
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  try {
    const page = await context.newPage();
    await runScenario(page, `chrome-extension://${unpackedId(extPath)}/popup.html`);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('Clockpane Pro works in Chromium (Edge build)', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'clockpane-chromium-pro-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    locale: 'en-US',
    acceptDownloads: true,
    args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
  });
  try {
    await runProScenario(context, `chrome-extension://${unpackedId(extPath)}`);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
});
