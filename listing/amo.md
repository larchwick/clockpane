# Clockpane, AMO listing text (0.2.0)

## Name

Clockpane (the same as the manifest name)

## Summary

World clocks and a time zone converter in your toolbar. Pick any date and time and see it in every zone. Works offline, no tracking. Optional paid Pro (7 USD once) adds more clocks, a meeting planner, clock sets and a toolbar badge.

## Description

Clockpane shows the time in the places you care about, right from the toolbar. Each clock has the day, the UTC offset and the difference from your own time. Pick a date and time in any of your zones and every clock follows, so planning a call across time zones takes one look.

<b>Free, and staying free</b>
<ul>
<li>Up to 5 clocks, each with an optional label ("Tokyo office")</li>
<li>Search by city or time zone id (Tokyo, Cluj-Napoca, Asia/Kolkata)</li>
<li>Converter for any date and time, "Now" goes back to live time</li>
<li>Correct daylight saving time everywhere, from the browser's own time zone data</li>
<li>12 or 24 hour time, reorder, rename, remove, light and dark theme</li>
</ul>

<b>Pro: paid, optional</b>
Pro is a one-time purchase of 7 USD through Gumroad, for up to 3 browsers, with a 14 day refund window. Payment is required to turn on these features:
<ul>
<li>Up to 500 clocks per set instead of 5</li>
<li>Meeting planner: a 24 hour grid with each clock's working hours and the best hours for everyone</li>
<li>Named clock sets, for example "Team" and "Family"</li>
<li>JSON export and import of your clocks and settings</li>
<li>Toolbar badge with the time of one chosen clock</li>
</ul>
If Pro is removed, nothing is deleted. The first 5 clocks stay visible and the rest come back with Pro.

<b>What Clockpane sends</b>
The free features send nothing. They work fully offline.
The Pro license check is the only network request, and it runs only when you start it. You paste your key and press Activate. A consent screen shows what will be sent, and Cancel sends nothing. If you agree, Firefox asks for access to api.gumroad.com, and Clockpane sends one HTTPS request to https://api.gumroad.com/v2/licenses/verify with three things: the public Pro product id, your license key, and a yes or no flag telling Gumroad whether to count this browser as a new activation. Nothing else is sent: no clocks, no settings, no browsing data, no name or email. It never checks again on its own. Re-check repeats it only when you press it.

<b>Permissions</b>
<ul>
<li>Storage: to keep your clocks and settings in this browser</li>
<li>Alarms: to update the Pro toolbar badge once a minute</li>
<li>Optional, only for the license check: access to api.gumroad.com, and the "authentication information" data collection permission</li>
</ul>
No content scripts. Clockpane never reads the pages you visit. No telemetry, analytics or ads.

Source code: https://github.com/larchwick/clockpane (MIT)

## Categories

- Other

## Tags

- time zone
- world clock
- clock
- meeting planner
- converter
- offline

## Support

- Support site: https://github.com/larchwick/clockpane/issues
- Support email: none
- Homepage: https://github.com/larchwick/clockpane

## License

MIT License

## Privacy policy

Paste the text of PRIVACY.md (https://github.com/larchwick/clockpane/blob/main/PRIVACY.md) into the AMO privacy policy field.

## Version notes (0.2.0)

Optional paid Pro (7 USD one-time through Gumroad): up to 500 clocks per set, meeting planner with working hours, named clock sets, JSON export and import, toolbar badge. New options page. The license check runs only after a consent screen, sends only the product id, the license key and the activation flag to api.gumroad.com, and never runs in the background. New alarms permission for the badge. The free features are unchanged.
