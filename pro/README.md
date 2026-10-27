# pro/ (not shipped)

Gumroad license module for a future Clockpane Pro. It is disabled and not wired in:

- `GUMROAD_PRODUCT_ID` is `null`, so `checkLicense` returns `not-configured` and sends nothing.
- `PRO_ENABLED` is `false`.
- Nothing in `extension/` imports this folder, and `scripts/build.mjs` copies only `extension/`.
- `scripts/check-dist.mjs` fails the build check if any Gumroad reference or network call reaches `dist/`.

Source: Extension Pro `src/pro/*.ts` at commit `ea8127dca553cb73ca981b7f05909e148034051f`. See `../../proof/clockpane/CHANGES.md` in the bot folder.
