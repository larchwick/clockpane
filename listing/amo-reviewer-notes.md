# Notes for the AMO reviewer, Clockpane 0.2.0

## Source and build

- No bundler, minifier, transpiler or generated code. Every file in the package is the plain,
  readable file from `extension/` in https://github.com/larchwick/clockpane, so no separate
  source package is attached.
- No remote code. Every script is in the package and loaded as an ES module. No `eval`, no
  `new Function`, no remote scripts, no content scripts.
- To rebuild the exact package (Ubuntu 24.04, Node.js 24.14.0, npm 11.9.0):

  ```sh
  npm ci
  npm run package   # dist/zips/clockpane-firefox-0.2.0.zip
  ```

  `scripts/build.mjs` copies `extension/` to `dist/firefox` and writes the manifest with
  `scripts/manifest.mjs`, which adds only `browser_specific_settings` (add-on id, minimum
  version, `data_collection_permissions`). `scripts/check-dist.mjs` then checks the result.

## Paid features and the license check

- Pro is a one-time Gumroad purchase (7 USD). The listing says so.
- There is no test key. All Pro code paths can be read in the source:
  - `pro/gumroad.js`: the public product id, the request body, and the reply check (success
    true, not refunded, disputed or charged back, at most 3 uses on activation).
  - `pro/transport.js`: the only `fetch` in the add-on. HTTPS POST to
    `https://api.gumroad.com/v2/licenses/verify` only, `redirect: "error"`, 15 second timeout.
  - `pro/activation.js`: runs only with a recorded consent and a key.
  - `pro/consent.js`: the consent text shown before anything is sent.
  - `options.js`: Activate shows the consent screen. Agree first calls
    `permissions.request` for `https://api.gumroad.com/*` (with `data_collection:
    ["authenticationInfo"]` on Firefox), then sends the one request. Cancel sends nothing.
  - `pro/license.js` and `pro/storedLicense.js`: the stored result. There is no background
    or periodic check. A check only runs when the user presses Activate or Re-check.
- To see Pro without a key, write a license record to storage, as the end-to-end tests do
  (`e2e/proScenario.js`, `SEEDED_LICENSE`). In the options page console:

  ```js
  browser.storage.local.set({ 'clockpane.license': JSON.stringify({ v: 1, license: { productId: 'hr1yPpDQFFwAmvVhzXReuw==', licenseKey: 'REVIEW-0001', saleId: 'review', uses: 1, mode: 'activation', checkedAt: new Date().toISOString() } }) })
  ```

## Permissions

- `storage`: clocks, sets and settings in `storage.local`.
- `alarms`: refreshes the Pro toolbar badge once a minute (`background.js`).
- Optional host permission `https://api.gumroad.com/*`: requested only on Agree for the license
  check, released again by "Remove from this browser".
- `data_collection_permissions`: required `["none"]`, optional `["authenticationInfo"]` for
  the license key sent to Gumroad.

## Tests

`npm run check` runs TypeScript type checks, ESLint, `web-ext lint`, unit tests (Vitest) and
end-to-end tests (Playwright, the built add-on in Firefox and the Edge build in Chromium).
