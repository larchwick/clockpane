# Clockpane privacy policy

Last updated: 27 October 2026. Publisher: Larchwick.

## What Clockpane stores

Your list of clocks (time zone, optional label, order) and the 12 or 24 hour setting. They are
kept with the browser's `storage.local` on your device. They are not synced, not uploaded and
not shared. Removing the add-on removes them.

## What Clockpane sends

Nothing. The current version makes no network requests at all. It has no host permissions,
does not read or change web pages, and has no telemetry, analytics, crash reporting or ads.
On Firefox the add-on declares that it collects no data (`data_collection_permissions:
required ["none"]`).

## Future Pro edition

A paid Pro edition may be sold later through Gumroad. If it is, this policy will be updated
before that version is released, and this is how the license check will work:

- Nothing is sent unless you paste a license key, read a consent screen and press Activate.
  If you cancel, nothing is sent and the free features keep working.
- On Activate, and later only when you press Re-check, Clockpane sends three things to
  Gumroad's license endpoint (`https://api.gumroad.com/v2/licenses/verify`): the public Pro
  product id, the license key you pasted, and whether this counts as a new browser.
- Nothing else is sent: no clocks, no browsing data, no name or email.
- The result is stored in this browser only. Gumroad handles the request under its own privacy
  policy (https://gumroad.com/privacy).
- On Firefox this will be declared as optional data collection, so free users are never asked.

## Contact

Questions about this policy: open an issue on the project's public repository once it is
published, under the publisher name Larchwick.
