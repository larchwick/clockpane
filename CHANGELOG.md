# Changelog

## 0.2.0 (27 October 2026)

- Optional paid Pro, 7 USD one-time through Gumroad, for up to 3 browsers: up to 500 clocks per
  set, a meeting planner with working hours, named clock sets, JSON export and import, and a
  toolbar badge with the time of one clock.
- New options page (gear button in the popup) for the license and Pro settings.
- License check: sent to Gumroad only after a consent screen and an optional permission
  request, never in the background. Refunded, disputed and charged back purchases are refused.
- New `alarms` permission for the badge. Optional host permission for `api.gumroad.com`.
- Firefox: optional `authenticationInfo` data collection for the license check.
- The free features are unchanged: 5 clocks, search, converter, DST, 12 or 24 hour time.

## 0.1.0 (not released)

- First version: up to 5 world clocks with labels, city and time zone search, a converter for
  any date and time, 12 or 24 hour time, reorder, rename, remove, light and dark theme.
- Storage permission only, no network requests.
