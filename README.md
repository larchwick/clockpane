# Clockpane

World clocks and a time zone converter in your browser toolbar. For Firefox and Microsoft Edge.

Open the toolbar button to see the time in the places you care about, with the day, the
UTC offset and the difference from your own time. Pick a date and time in any of your zones
and every clock shows what that moment is there, so planning a call across time zones takes
one look.

## Free features

- Up to 5 clocks, each with an optional label ("Tokyo office")
- Search by city or by time zone id (Tokyo, Cluj-Napoca, Asia/Kolkata)
- Converter: pick a date and time in one zone, all clocks follow. "Now" goes back to live time
- Correct daylight saving time everywhere, from the browser's own time zone data
- 12 or 24 hour time, reorder, rename, remove
- Light and dark theme that follows the system

These features stay free and will not move behind Pro.

## Pro (optional, paid)

Pro is a one-time purchase of 7 USD through Gumroad (https://larchwick.gumroad.com/l/sysaii),
for up to 3 browsers, with a 14 day refund window. It adds:

- More clocks: up to 500 per set instead of 5
- Meeting planner: a 24 hour grid for the converter's date with each clock's working hours
  (default 09:00 to 17:00, editable per clock), awake hours and the best hours for everyone.
  Click an hour to load it into the converter
- Named clock sets (up to 50), for example "Team" and "Family", switched from the popup
- JSON export and import of all sets and settings (the license is never exported)
- Toolbar badge with the time of one chosen clock, updated every minute

Pro settings, the license and export and import are on the options page (gear button in the
popup). If Pro is removed, nothing is deleted: the popup shows the first 5 clocks of the active
set and the rest come back when Pro is turned on again.

## Privacy

Clockpane asks for two permissions: `storage`, to remember your clocks in this browser, and
`alarms`, to update the Pro toolbar badge once a minute. It has no content scripts and never
reads the pages you visit. No telemetry, analytics or ads.

The free features work fully offline. The only network request is the Pro license check, and
only when you start it: you paste a key, read a consent screen and press Agree. Clockpane then
asks for the optional permission to reach `https://api.gumroad.com` and sends one request to
`https://api.gumroad.com/v2/licenses/verify` with the public product id, your license key and a
flag saying whether this counts as a new browser. Nothing else is sent, and it never checks
again on its own. "Re-check" on the options page repeats the check without using another of the
3 activations. On Firefox this is declared as optional `authenticationInfo` data collection, so
free users are never asked. See [PRIVACY.md](PRIVACY.md).

## Build from source

Exact versions used for every release:

- Node.js 24.14.0
- npm 11.9.0

```sh
npm ci
npm run build      # dist/firefox and dist/edge, then a check of permissions, network calls, URLs and local paths
npm run package    # dist/zips/clockpane-firefox-<version>.zip and clockpane-edge-<version>.zip
```

There is no bundler, minifier or transpiler. The files in `extension/` are shipped as they are.
`scripts/manifest.mjs` is the only difference between the two builds: Firefox gets
`browser_specific_settings` (add-on id, minimum version 140, `data_collection_permissions`),
Edge gets the same manifest without it.

## Checks

```sh
npm run typecheck  # JSDoc types checked by TypeScript, no output
npm run lint       # ESLint (bans network APIs except one fetch in pro/transport.js) and web-ext lint
npm test           # unit tests (time zones and DST, storage, sets, planner, badge, manifest, license)
npm run e2e        # Playwright: the built add-on in Firefox and the Edge build in Chromium
npm run check      # all of the above
```

`npm run e2e` needs the Playwright browsers (`npx playwright install firefox chromium`).

## Layout

- `extension/` the add-on
  - `popup.html`, `popup.js`, `popup.css` the toolbar popup
  - `options.html`, `options.js`, `options.css` license, sets, working hours, badge, export and import
  - `background.js` the Pro toolbar badge
  - `lib/time.js`, `lib/store.js`, `lib/planner.js`, `lib/badge.js` time zone math and saved state
  - `pro/` the Gumroad license check. `pro/transport.js` is the only file that calls `fetch`
  - icons
- `scripts/` build, manifest per browser, release checks
- `test/`, `e2e/` tests. The end-to-end tests turn Pro on by writing a license record to
  storage, so they need no key and make no network request

## License

MIT, see [LICENSE](LICENSE).
