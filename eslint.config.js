import js from '@eslint/js';
import globals from 'globals';

const noNetwork = [
  'error',
  { name: 'fetch', message: 'The free core makes no network calls. Only extension/pro/transport.js may use fetch.' },
  { name: 'XMLHttpRequest', message: 'No network calls in Clockpane.' },
  { name: 'WebSocket', message: 'No network calls in Clockpane.' },
  { name: 'EventSource', message: 'No network calls in Clockpane.' },
];

export default [
  { ignores: ['node_modules/**', 'dist/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  {
    files: ['extension/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
    rules: { 'no-restricted-globals': noNetwork, 'no-restricted-properties': ['error', { property: 'sendBeacon', message: 'No network calls in Clockpane.' }] },
  },
  { files: ['extension/pro/transport.js'], rules: { 'no-restricted-globals': noNetwork.filter((r) => typeof r !== 'object' || r.name !== 'fetch') } },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.js', 'e2e/**/*.js', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  { files: ['e2e/journey.js'], languageOptions: { globals: { ...globals.browser } } },
];
