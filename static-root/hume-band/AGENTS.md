# AGENTS.md — Hume Band App

Web BLE reader for the Hume band, using the reverse-engineered protocol.
Live at bentleydavis.com/hume-band/ — do not move this folder; the URL
must not break.

- Read-only over BLE. Open in Chrome on the Pixel, not inside another
  app's webview — Bluetooth will not work there.
- Stores synced data persistently so history accumulates across syncs.
  Dedupe on the band's timestamp; re-syncing never duplicates.
- Release the BLE connection after each sync — BLE is one connection at
  a time, and holding it blocks the Hume app from connecting.
- The Hume protocol lives ONLY here. Other apps (e.g. Exercise Tracker)
  consume Hume data through this app / shared BLE, never by copying the
  protocol.
- Protocol-tab forensic labels: the band's "HRV" byte is a device-state
  index, not real HRV; the blood-pressure numbers are generated inside a
  ±10 clamp. Do not present either as a real measurement.
- Visualization and analysis are deferred — capture + storage first.
- Database: `hume`. Plain-JSON model, `onSnapshot()` for live data, shared
  code from `../apps/shared/` only. No credentials in the repo.
