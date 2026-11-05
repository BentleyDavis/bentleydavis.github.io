# Data Plan

## Context provenance
- `Make an exercise tracker/dashboard and populate it with what I have done do far.` (verbatim build request — populate with the completed work from the parent conversation, not invented history)
- `9 chest at 3 played to failure` corrected to `Actually I think the chest was at 4 plates by accident` (prior user statements in parent conversation — chest press is 9 reps at 4 plates to failure on 2026-10-26)
- `11 squats with 1 35lb weight. To failure` (prior user statement — goblet squat 11 reps, single 35 lb dumbbell, to failure)
- `Leg extension 10 reps at 4 plates` (prior user statement)
- `Dumbbell shoulder press 10lb 10 reps to failure` (prior user statement — 10 lb dumbbells, 10 reps)
- `I did 15 lat pulldowns and might could do more. Probably need to go up to 5 plates next time.` (prior user statement — lat pulldown 15 reps at 4 plates)
- `targets visceral fat and mitochondria. Prefers slow HIT — High-Intensity Training, single-set slow strength work to failure, a few times a week (not HIIT-style cardio intervals) — plus regular interval walking, 3 min fast / 3 min slow, a few times a week.` (MEMORY.md standing context — defines the program model, tempo, and walk type shown as reference)
- `Marcy Home Gym MWM-990, Sunny treadmill (incline to 12, speed to 8 MPH), dumbbells — pairs at 5, 8, and 10 lb, a single 35 lb hex dumbbell, and a pair of 40 lb hex dumbbells, 14 lb medicine ball, blue yoga mat` (MEMORY.md + parent conversation photos — equipment list shown in the tracker)
- `rest until heart rate has dropped at least ~30 bpm from the set peak AND breathing is back to normal / full sentences are comfortable, up to about 5 min` (MEMORY.md — rest rule displayed in the tracker)
- `HIT Day A revised: chest press, goblet squat, leg extension, lat pulldown, shoulder press` and Day B from parent assistant plan (lat pulldown / Romanian deadlift with 40 lb pair, one-arm row with single 35, leg curl, curl with 10s) — used only as upcoming-session templates, not as completed history
- Next-target guidance from MEMORY.md: chest keep 4 plates aim 10-12 before 5 plates (~83 lb front-press); goblet keep 35 aim 12-15 before single 40; leg extension keep 4 aim 11-15 before 5; lat pulldown go to 5 plates (~70 lb) next time; shoulder press keep 10s aim 11-12 — shown as "next time" guidance derived from the logged results

## Tested sources
No external web or API sources. All core content comes from the parent conversation and MEMORY.md handed off with the build request; no fetch was needed or performed.

## Long-term data behavior
- **Refresh policy**: No scheduled refresh; data changes only when the user logs, edits, or deletes sessions in the tracker.
- **Growth**: One session row per workout day plus one entry row per exercise set; walk sessions stored as sessions with walk fields. History grows unbounded, newest first.
- **Ordering**: Sessions by date descending; entries within a session by logged order.
- **Time semantics**: Session date is a calendar date (2026-10-26 for the seeded Day A) in the user's local day; created_at is an instant.
- **Seed**: A post-submit `seedInitialData` action inserts the single 2026-10-26 Day A session with its five reported sets exactly once (guarded by an existence check on date + type), so user edits are never overwritten.

## Rejected approaches
- **Tried**: Treating Day B or interval walks as completed history
  **Why rejected**: The conversation shows only Day A was performed on 2026-10-26; Day B and walks are plans, so they appear as upcoming templates only.
- **Imagery**: Not needed beyond typographic/equipment-list presentation — this is a personal logbook dashboard; no stock or generated photos would depict the user's actual equipment or sessions honestly.
