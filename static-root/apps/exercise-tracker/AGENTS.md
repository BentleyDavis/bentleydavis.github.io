# AGENTS.md — Exercise Tracker

Slow-HIT home training tracker. Day A/B program, per-set verdicts and
next-time weights. Rep targets: upper 8–12, legs 10–15. Machines over
dumbbells where the Marcy MWM-990 has the exercise; goblet squat, shoulder
press and RDL stay dumbbell.

- HR data comes from the Hume band, via the Hume Band App / shared BLE —
  do not reimplement the Hume protocol here. That protocol lives only in
  `hume-band/`.
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
