# AGENTS.md — Exercise Tracker

Slow-HIT home training tracker. Day A/B program, per-set verdicts and
next-time weights. Rep targets: upper 8–12, legs 10–15. Machines over
dumbbells where the Marcy MWM-990 has the exercise; goblet squat, shoulder
press and RDL stay dumbbell.

Source code lives ONLY in the Muse artifact `exercise-tracker` — no
version of this app is on bentleydavis.com yet. A reference copy of
that code belongs under `sample-code/` here (see apps/AGENTS.md).

- HR data comes from the Hume band, via the Hume Band App / shared BLE —
  do not reimplement the Hume protocol here. That protocol lives only in
  `hume-band/`.
- Live HR (interim approach, 2026-11-05, not yet built): continuous
  buffer reading, HR stream only. Hold the connection during the workout
  and loop START → stream to terminator → take the newest record →
  repeat, with a short pause between passes. This cuts waiting, not
  sampling: the band still writes periodic HR every ~120 s nominal
  (240 s median) and spot HR about every 10 min, so the newest reading
  is 0–4 min old, never second-by-second.
- HR has two populations — tell them apart by exact timestamp join
  with an SpO2 sample, never by the seconds field. The SpO2-coincident
  spot readings track exertion (own the day's max 9 of 10 days); the
  periodic series is trustworthy at rest but reads low under motion
  (even below resting while walking). Session peak comes from spot
  readings, not the periodic max. Always show a reading's age and
  source (spot vs periodic), never a bare number.
- Live HR is for trend and post-set checks, NOT for the automatic
  recovery cue yet: with a ~10 min spot cadence the peak and the 30 bpm
  drop can both be missed. Breathing / full sentences stay the primary
  rest signal. Disconnect and release the BLE connection on stop, so
  the Hume app can sync afterwards.
- Rest is HR-guided, not a fixed timer: rest until HR drops ≥~30 bpm from
  the set peak AND breathing is normal / full sentences are comfortable,
  up to ~5 min.
- Warmup: 3 min easy treadmill walk, then 2–3 slow practice reps per
  exercise at ~half working load, stopping well short of failure.
- Marcy lat pulldown has NO thigh hold-down pad. Front pulldown only: bar
  travels in front of the face/head down to the upper chest, never behind
  the neck. Feet braced on the floor; body lift means the weight is too heavy.
- Alternate upper and lower body to cut idle rest time.
- Its own Firestore database (name TBD in firestore-architecture.md — do
  not invent one). Plain-JSON model, `onSnapshot()` for live data, shared
  code from `../shared/` only. No credentials in the repo.
