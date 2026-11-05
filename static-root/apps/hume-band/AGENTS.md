# AGENTS.md — Hume Band App

BUILT — this one is done and live. Web BLE reader for the Hume band,
using the reverse-engineered protocol. Live at
bentleydavis.com/apps/hume-band/.
The app is one static `index.html` (no build step). Do not move this
folder unasked.

- Read-only over BLE. Open in Chrome on the Pixel, not inside another
  app's webview — Bluetooth will not work there.
- Stores synced data persistently in the browser (IndexedDB) so history
  accumulates across syncs instead of resetting. Dedupe on the band's
  timestamp: samples key on metric+timestamp+value, daily totals on
  date, sleep segments on segment start. Re-syncing never duplicates.
- Release the BLE connection after each sync (the app disconnects
  automatically when a sync finishes) — BLE is one connection at a time,
  and holding it blocks the Hume app from connecting. Exception: Live
  HR mode (plan below) holds the connection during a workout, then
  releases it on stop.
- The Hume protocol lives ONLY here. Other apps (e.g. Exercise Tracker)
  consume Hume data through this app / shared BLE, never by copying the
  protocol.

## Plans (not built yet)

- Live HR / continuous buffer reading (interim approach, 2026-11-05):
  loop the HR stream (0x55) only — START → stream to terminator →
  take the newest record → short pause → repeat. Do NOT loop all
  streams in Live mode; the full sync is too slow. There is no
  live-stream or recent-only opcode: only START (0x00) and CONTINUE
  (0x02) exist, and the band ignores the START date and returns its
  whole buffer every time. Continuous reading cuts waiting, not
  sampling — periodic HR is ~120 s nominal / 240 s median, spot HR
  about every 10 min, so the newest reading is 0–4 min old.
- HR has two populations: periodic (trustworthy at rest, reads low
  under motion) and SpO2-coincident spot (tracks exertion). Tell them
  apart by exact timestamp join with an SpO2 sample. Deeper protocol
  investigation (btsnoop capture during Hume Activity Mode, to check
  for a faster sampling mode) is deferred.
- Firestore sync (deferred): write synced data into the `hume`
  database when it is built. The JSON export format already matches.
  Plain-JSON model, `onSnapshot()` for live data, shared code from
  `../apps/shared/` only. No credentials in the repo.
- Visualization and analysis are deferred — capture + storage first.

## Protocol (verified against real frames from a real band, 2026-08-02)

- Service `0000fff0-…`, write characteristic `fff6`, notify `fff7`.
- Commands are 16-byte frames: opcode, mode, BCD date/time, checksum in
  byte 15. Only START (0x00) and CONTINUE (0x02, zero date — repeating
  the start date restarts the stream) are ever sent. The firmware's
  erase mode is deliberately NOT implemented anywhere: syncing here
  cannot delete band data, and the Hume app still syncs afterwards
  (reading doesn't consume the ring buffers; the band ignores the
  START date and returns its whole buffer).
- History streams (opcode): HR 0x55, HRV record 0x56, daily totals
  0x51, activity detail (10-min buckets) 0x52, sleep 0x53, temperature
  0x65, SpO2 0x66; rarely filled: dynamic HR 0x54, workout 0x5C,
  HR 1-second 0x5E, manual SpO2 0x60, temperature history 0x62.
  A stream is paged with CONTINUE every 50 frames and read until the
  band's terminator (last byte 0xFF); parse each frame BEFORE the
  terminator check.
- Info queries: device info 0x04, battery 0x13, MAC 0x22, firmware
  0x27, band clock 0x41, step goal 0x4B. Times are the band wall clock
  (BCD, `localTs` yyyyMMddHHmmss) — never apply timezone conversion to
  stored values.
- Decoders are guarded by golden-frame self-tests in the page's
  Protocol tab. If you touch a decoder, the self-test must stay green.

## Forensic labels (Protocol tab — keep them exact)

- The band's "HRV" byte (0x56, byte 9) is a device-state index, not
  real HRV — no RR intervals are ever transmitted. Label it
  "Band State Index".
- The blood-pressure numbers (0x56, bytes 13–14) are generated inside
  a ±10 clamp, not measured. Store raw, label as raw bytes.
- "Vascular" and "stress" bytes (0x56, bytes 10 and 12) carry the same
  value under two names — keep both raw.
- Do not present any of these as a real measurement.

## Data & export

- Export is "Download all data (JSON)" (formatVersion 2: device,
  deviceInfo, samples, daily, sleep, rawFrames hex, syncs census, log)
  plus a samples CSV. Importing a previous JSON merges with the same
  dedupe keys.
