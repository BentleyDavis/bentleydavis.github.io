# Data Plan

## Context provenance
- `Change the walk tracker so it tracks — store walk data like the medicine tracker does, so the data is kept and visible, not just a timer that forgets everything. There needs to be both: the time display and the stored data. It needs to recover its place in case I have to leave and come back. Add to the app goal heart rates. Lower it to 3 rounds.` (verbatim build request; defines the whole scope: fullstack storage + timer + recovery + HR goals + 3 rounds)
- `fast target HR in bpm (default 150 — from his 2026-10-30 walk data where his fast peak hit 158) and recovery drop in bpm (default 30)` (build request; defaults baked into settings seed)
- `If HR will not drop ~30 bpm within ~5 minutes of slow walking, the walk is over for the day.` (build request; drives the 5-minute recovery warning and end-walk path)
- Prior static artifact `~/workspace/ts-spaces/interval-walk-timer/` exists on disk with recorded voice-cue MP3s (voice-warmup/fast/slow/cooldown/return/done.mp3, 18–33 KB each, verified with `ls -la`); the new app reuses those exact recordings as owned build assets so voice cues keep the same voice instead of device TTS.

## Tested sources
### Local scaffold + prior artifact assets
**Used by**: build (schema, actions, client assets)
**Test command**: `ls ~/workspace/ts-spaces/walk-tracker/` and `ls -la ~/workspace/ts-spaces/interval-walk-timer/assets/`; read of scaffold `server/src/schema.ts`, `server/src/actions.ts`, `client/src/App.tsx`, `drizzle/0001_initial.sql`
**Sample output**: scaffold has placeholder `entries` table and listEntries/addEntry actions; prior timer has 6 voice MP3s (warmup, fast, slow, cooldown, return, done)
**Processing**: replace placeholder schema with `walks`, `active_workout`, `settings` tables via a new migration; copy the 6 MP3s into `client/src/assets/` and import them in the client.

## Long-term data behavior
- **Refresh policy**: none — all data is user-generated in the app; no external feed.
- **Growth**: one `walks` row per finished/ended walk; one singleton `active_workout` row overwritten on every workout state transition; one singleton `settings` row.
- **Ordering**: history newest first by walk start time.
- **Time semantics**: walk rows store start/end instants (epoch ms via timestamp_ms) rendered viewer-local; elapsed durations stored as whole seconds; in-progress timing is anchored to a single stored start timestamp plus accumulated pause time, recomputed on load.

## Rejected approaches
- **Tried**: device speechSynthesis for voice cues
  **Why rejected**: prior app already has recorded voice MP3s for exactly these cues; reusing them keeps one consistent voice and matches the spoken-audio guidance (recorded audio over device voices).
- **Tried**: localStorage-only persistence (like the old static timer)
  **Why rejected**: the user's core complaint — data must live server-side like the Supplement Tracker so it is kept, visible, and readable by the assistant through published actions.
