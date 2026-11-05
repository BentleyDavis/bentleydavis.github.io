# AGENTS.md — Walk Tracker

Interval walk timer with server-side walk history. 3 rounds, 21:00 planned
total, halfway "start return" cue at 10:30. Fast/slow 3 min / 3 min.

- HR goals are editable: fast target default 150, recovery drop default 30.
  Recovery is HR-guided and untimed — cue the next round when live HR is
  at or below (round peak − recovery drop).
- HR strap connects via Web Bluetooth in the app, using the standard Heart
  Rate Service from `../shared/ble/hr-strap.js`. Do not build a sideloaded
  Android app for this — that idea was dropped in favour of Web Bluetooth.
- Polar H10 purchase is on hold (decision reminder Nov 6). The Bluetooth
  feature sits dormant until then; nothing needs rebuilding if he buys one.
- Each walk is stored server-side (date, rounds, elapsed, HR goals,
  per-round peaks, timestamped HR samples) and readable via the app's
  actions, so the Exercise Tracker can sync from it.
- Its own Firestore database (name TBD in firestore-architecture.md — do
  not invent one). Plain-JSON model, `onSnapshot()` for live data, shared
  code from `../shared/` only. No credentials in the repo.
