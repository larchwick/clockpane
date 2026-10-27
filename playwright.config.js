import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'list',
  projects: [
    { name: 'firefox', testMatch: /firefox\.spec\.js/ },
    { name: 'chromium-edge-build', testMatch: /chromium\.spec\.js/ },
  ],
});
