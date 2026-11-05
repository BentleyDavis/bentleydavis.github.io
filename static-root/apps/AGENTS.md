# AGENTS.md — Apps

Web apps on bentleydavis.com, sharing one Firebase backend. Each app lives
in its own folder under `apps/` (Hume Band stays at `static-root/hume-band/`
so its existing URL does not break). Muse Local is not here — it lives in
its own repo, `BentleyDavis/muse-local`, with its own AGENTS.md.

- `shared/` is general code only. It knows nothing about any app: no
  collection names, no schemas, no database names. An app passes those in.
- App-specific code stays in its own folder: its database, collections,
  validation, UI, and its `firestore.rules`. Apps never import each other.
- One Firebase project (`muse-browser-extension`), one Auth user base, one
  Firestore database per app. See `~/workspace/docs/firestore-architecture.md`
  (the recorded decisions; nothing there is built yet unless it says so).
- Domain model is plain JSON: own IDs, ISO-8601 timestamps. No Firestore
  `Timestamp` or `DocumentReference` in the model.
- Real-time push via `onSnapshot()` is the deliberate exception — do not
  poll from app code. The agent connectivity layer (REST + per-AI logins +
  URL-polled hooks) is separate tech; do not mix the two.
- Security rules: deny by default, hand-created accounts only (no public
  sign-up), shape validation in rules, business logic in app code. Rules
  are public-safe — policy, never secrets. A rules deploy is always
  plan-first: show the diff, Bentley approves, then deploy and verify.
- No credentials, tokens, or keys in the repo or chat — ever.
- No build step: plain ES modules, imported by relative path. Netlify
  auto-deploys from the `11ty` branch; `static-root/` is copied verbatim.
- Do not build, move, or publish an app unasked. The move of the tracker
  apps to this site is deferred until Bentley says go.
