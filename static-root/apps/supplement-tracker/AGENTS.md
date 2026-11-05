# AGENTS.md — Supplement Tracker (plan)

PLAN — not built yet on this site. Build a supplement regimen tracker
here, from the reference code in `sample-code/`. The sample code is a fullstack
TypeScript/Bun app with a SQLite database — it will NOT run as static
files. Rebuild it as a static site on Firebase, keeping its behavior.
The Google Sheet "Supplement Tracker" stays the human-readable register
+ Science Watch log; this app is the live system.

What to build:
- Products → ingredients (with optional elemental amounts) → daily
  totals vs ceilings. Daily Totals sums each ingredient across all On
  products (per-serving amount × servings/day). Paused/Off products are
  excluded everywhere: totals, schedule, prep view, Sunday review.
- Ceilings: magnesium 500 mg/day (CRN), EGCG 800 mg/day (EFSA). Flag
  OVER CEILING, do not silently clamp.
- Filler blacklist is editable, seeded with maltodextrin + rice. Flag
  fillers on products; prefer alternatives. Do not invent product URLs —
  a blank beats a guessed link.
- Per-product fields: why taking it, effect actually wanted, "Where I
  saw it" (provenance, links tappable). Acute items get a Weekly/Monthly
  periodic review, grouped into one Sunday batch; nothing is
  auto-enrolled.
- Current multi is Solaray Mega Multi Mineral (Iron-Free): no iron, no
  vitamin C. Valacyclovir is the most important item (1/day maintenance,
  2/day during breakout).

Data and backend (plan):
- Its own Firestore database (name TBD in firestore-architecture.md —
  do not invent one). Plain-JSON model, `onSnapshot()` for live data,
  shared code from `../shared/` only. No credentials in the repo.
- Once this app exists and works, do a FINAL DATA SYNC: export the
  data from the Muse artifact and import it into Firestore, then verify
  counts match before the Muse artifact is retired. Never copy the
  artifact's `app.db` into the repo.
