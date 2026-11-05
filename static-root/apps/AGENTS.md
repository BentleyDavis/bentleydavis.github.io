# AGENTS.md — Apps (plan)

PLAN — not built yet, except Hume Band (see its folder). This file is
the plan for the web apps on bentleydavis.com. Each app gets its own
folder under `apps/`, including Hume Band, which moved here from
`static-root/hume-band/` on 2026-11-05 (old URL redirects to the new
one). Muse Local is not here — it lives in its own repo,
`BentleyDavis/muse-local`, with its own AGENTS.md.

Plan for each app:
- Build it here, in its own folder, from the reference code in its
  `sample-code/` subfolder (copied from the Muse artifact of the same
  name). The sample code is a fullstack TypeScript/Bun app — it will
  NOT run as static files. Rebuild it as a static site on Firebase:
  plain ES modules, no build step, data in Cloud Firestore.
- The sample code is reference only. Do not ship it as-is, do not
  copy its server or SQLite database, and never copy its `app.db`
  (live user data — never in the repo).
- Once a new app exists and works, do a FINAL DATA SYNC: export the
  data from the Muse artifact and import it into the app's Firestore
  database, then verify counts match before the old artifact is
  retired. That sync has not happened for any app yet.

Shared plan (applies to every app):
- `shared/` will hold general code only. It knows nothing about any
  app: no collection names, no schemas, no database names. An app
  passes those in.
- App-specific code stays in its own folder: its database, collections,
  validation, UI, and its `firestore.rules`. Apps never import each
  other.
- One Firebase project (`muse-browser-extension`), one Auth user base,
  one Firestore database per app. See
  `~/workspace/docs/firestore-architecture.md` (the recorded decisions;
  nothing there is built yet unless it says so).
- Domain model is plain JSON: own IDs, ISO-8601 timestamps. No Firestore
  `Timestamp` or `DocumentReference` in the model.
- Real-time push via `onSnapshot()` is the deliberate exception — do
  not poll from app code. The agent connectivity layer (REST + per-AI
  logins + URL-polled hooks) is separate tech; do not mix the two.
- Security rules: deny by default, hand-created accounts only (no public
  sign-up), shape validation in rules, business logic in app code. Rules
  are public-safe — policy, never secrets. A rules deploy is always
  plan-first: show the diff, Bentley approves, then deploy and verify.
- No credentials, tokens, or keys in the repo or chat — ever.
- No build step: plain ES modules, imported by relative path. Netlify
  auto-deploys from the `11ty` branch; `static-root/` is copied verbatim.
- Do not build, move, or publish an app unasked.
