# AGENTS.md — Walk Tracker (plan)

PLAN — not built yet on this site. Build an interval walk timer with
server-side walk history here, from the reference code in
`sample-code/`. The
sample code is a fullstack TypeScript/Bun app with a SQLite database —
it will NOT run as static files. Rebuild it as a static site on
Firebase, keeping its behavior.

What to build:
- 3 rounds, 21:00 planned total, halfway "start return" cue at 10:30.
  Fast/slow 3 min / 3 min.
- HR goals are editable: fast target default 150, recovery drop
  default 30. Recovery is HR-guided and untimed — cue the next round
  when live HR is at or below (round peak − recovery drop).
- HR strap connects via Web Bluetooth in the app, using the standard
  Heart Rate Service from `../shared/ble/hr-strap.js`. Do not build a
  sideloaded Android app for this — that idea was dropped in favour of
  Web Bluetooth.
- Polar H10 purchase is on hold (decision reminder Nov 6). The
  Bluetooth feature sits dormant until then; nothing needs rebuilding
  if he buys one.
- Each walk is stored (date, rounds, elapsed, HR goals, per-round
  peaks, timestamped HR samples) and readable via the app's actions,
  so the Exercise Tracker can sync from it.

Data and backend (plan):
- Its own top-level collections in the shared `apps` Firestore
  database (see firestore-architecture.md). Plain-JSON model,
  `onSnapshot()` for live data, shared code from `../shared/` only.
  No credentials in the repo.
- Once this app exists and works, do a FINAL DATA SYNC: export the
  data from the Muse artifact and import it into Firestore, then verify
  counts match before the Muse artifact is retired. Never copy the
  artifact's `app.db` into the repo.
