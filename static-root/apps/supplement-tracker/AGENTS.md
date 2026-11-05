# AGENTS.md — Supplement Tracker

Supplement regimen tracker. Products → ingredients (with optional elemental
amounts) → daily totals vs ceilings. The Google Sheet "Supplement Tracker"
stays the human-readable register + Science Watch log; this app is the
live system.

- Daily Totals sums each ingredient across all On products (per-serving
  amount × servings/day). Paused/Off products are excluded everywhere:
  totals, schedule, prep view, Sunday review.
- Ceilings: magnesium 500 mg/day (CRN), EGCG 800 mg/day (EFSA). Flag OVER
  CEILING, do not silently clamp.
- Filler blacklist is editable, seeded with maltodextrin + rice. Flag
  fillers on products; prefer alternatives. Do not invent product URLs —
  a blank beats a guessed link.
- Per-product fields: why taking it, effect actually wanted, "Where I saw
  it" (provenance, links tappable). Acute items get a Weekly/Monthly
  periodic review, grouped into one Sunday batch; nothing is auto-enrolled.
- Current multi is Solaray Mega Multi Mineral (Iron-Free): no iron, no
  vitamin C. Valacyclovir is the most important item (1/day maintenance,
  2/day during breakout).
- Its own Firestore database (name TBD in firestore-architecture.md — do
  not invent one). Plain-JSON model, `onSnapshot()` for live data, shared
  code from `../shared/` only. No credentials in the repo.
