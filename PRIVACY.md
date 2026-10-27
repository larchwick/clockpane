# Clockpane privacy policy

Last updated: 27 October 2026. Applies to Clockpane 0.2.0 and later. Publisher: Larchwick.

## Short version

The free features send nothing anywhere. The paid Pro edition sends your license key to
Gumroad, the shop that sold it, only when you press a button and agree first. There is no
telemetry, analytics, crash reporting or advertising, and Clockpane never reads the web pages
you visit.

## What Clockpane stores

All of this is kept with the browser's `storage.local` on your device. It is not synced, not
uploaded and not shared. Removing the add-on removes it.

- Your clocks (time zone, optional label, order, working hours), clock sets, the 12 or 24 hour
  setting and the toolbar badge choice.
- With Pro: the license key you pasted, the Gumroad sale id and use count from the last check,
  and the time of that check. No name or email is stored.
- A record that you agreed to the license check consent screen, with its date.
- One-way hashes (SHA-256) of license keys already activated in this browser, so a re-activation
  here does not use another of your 3 activations. The key cannot be read back from a hash.

Exported JSON files contain your clocks, sets and settings, never the license.

## What Clockpane sends

Nothing, unless you turn on Pro. The license check works like this:

- You paste a license key on the options page and press Activate. A consent screen explains
  what will be sent. If you press Cancel, nothing is sent and the free features keep working.
- If you press Agree, the browser asks you to allow access to `api.gumroad.com` (an optional
  permission). If you refuse, nothing is sent.
- Clockpane then sends one HTTPS request to `https://api.gumroad.com/v2/licenses/verify` with
  three things: the public Clockpane Pro product id, the license key you pasted, and a yes or no
  flag (`increment_uses_count`) that tells Gumroad whether to count this browser as a new
  activation.
- Nothing else is sent: no clocks, no settings, no browsing data, no name or email.
- Clockpane never checks again on its own, so Pro keeps working offline. The check runs again
  only when you press Re-check, which does not count as a new activation.
- Gumroad receives the request under its own privacy policy (https://gumroad.com/privacy).
  Gumroad also sees your IP address, as with any web request.

On Firefox the add-on declares that it needs no data collection (`data_collection_permissions`
required `["none"]`) and lists `authenticationInfo` as optional data collection, which Firefox
asks about only when you start the license check.

## Removing Pro

"Remove from this browser" on the options page deletes the stored license and gives back the
`api.gumroad.com` permission. Your clocks and sets stay. Gumroad still counts the activation.

## Contact

Questions about this policy or the add-on: open an issue at
https://github.com/larchwick/clockpane/issues. Please never post your license key there.
