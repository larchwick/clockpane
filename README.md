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

These features stay free. A paid Pro edition may add more later, but nothing here will move
behind it.

## Privacy

Clockpane asks for one permission, `storage`, to remember your clocks in this browser.
It has no host permissions and no content scripts, never reads the pages you visit, and makes
no network requests. No telemetry, analytics or ads. See [PRIVACY.md](PRIVACY.md).

## Build from source

Exact versions used for every release:

- Node.js 24.14.0
- npm 11.9.0

```sh
npm ci
npm run build      # dist/firefox and dist/edge, then a check for network calls and local paths
npm run package    # dist/zips/clockpane-firefox-<version>.zip and clockpane-edge-<version>.zip
```

There is no bundler, minifier or transpiler. The files in `extension/` are shipped as they are.
`scripts/manifest.mjs` is the only difference between the two builds: Firefox gets
`browser_specific_settings` (add-on id, minimum version 140, `data_collection_permissions`),
Edge gets the same manifest without it.

## Checks

```sh
npm run typecheck  # JSDoc types checked by TypeScript, no output
npm run lint       # ESLint (bans network APIs in the extension) and web-ext lint
npm test           # unit tests (time zones and DST, storage, manifest, license module)
npm run e2e        # Playwright: the built add-on in Firefox and the Edge build in Chromium
npm run check      # all of the above
```

`npm run e2e` needs the Playwright browsers (`npx playwright install firefox chromium`).

## Layout

- `extension/` the add-on: `popup.html`, `popup.js`, `popup.css`, `lib/time.js`, `lib/store.js`, icons
- `scripts/` build, manifest per browser, release checks
- `pro/` a license check for a future Pro edition. It is switched off, not wired in, and not part
  of any build. See `pro/README.md`
- `test/`, `e2e/` tests

## License

MIT, see [LICENSE](LICENSE).
