# AGENTS.md — Apps (plan)

PLAN — not built yet, except Hume Band (see its folder) and the Task
App editor (see its folder, built 2026-11-05). This file is
the plan for the web apps on bentleydavis.com. Each app gets its own
folder under `apps/`. Muse Local is not here — it lives in its own repo,
`BentleyDavis/muse-local`, with its own AGENTS.md.

Plan for each app:
- Build it here, in its own folder, from the reference code in its
  `sample-code/` subfolder. The sample code is a fullstack TypeScript/Bun
  app — it will NOT run as static files. Rebuild it as a static site on
  Firebase: plain ES modules, no build step, data in Cloud Firestore.
- The sample code is reference only. Do not ship it as-is, do not
  copy its server or SQLite database, and never copy its `app.db`
  (live user data — never in the repo).
- Once a new app exists and works, do a FINAL DATA SYNC: export the
  data from the Muse artifact and import it into its collections in
  the shared `apps` Firestore database, then verify counts match
  before the Muse artifact is retired.

Shared plan (applies to every app):
- Discover app collections through `collections/{collectionName}` in the
  named `apps` database. Expected fields are maintained in root
  `database/collections.json` and the matching live catalog documents.
  Whenever a collection or field is added, renamed, removed, or changes
  type/default/meaning, update both copies and the relevant app guidance
  in the same task. Keep enforced rules distinct from descriptive formats.
  All approved members can read/write the catalog. Never put credentials,
  personal account records, or private backend storage schemas in it.
- Prototype workflow: requirements are still being worked out. Do not
  add or maintain automated tests until requirements settle or the user
  explicitly requests them. Use lightweight manual checks instead.
- `shared/` will hold general code only. It knows nothing about any
  app: no collection names, no schemas, no database names. An app
  passes those in.
- `shared/theme.css` defines shared color and font properties, dark
  native controls, and page-wide defaults. App-specific styles live in
  each app's own CSS file; app pages are isolated from one another.
- App-specific code stays in its own folder: its collections,
  validation, and UI. Apps never import each other. Security rules are
  one file for the whole database, not one per app — rules are
  per-database, and there is only one database.
- One Firebase project (`apps-5884f`, display name "apps"), one Auth
  user base, ONE Firestore database (`apps`, created 2026-11-05) for
  everything. Each domain is its own top-level collection (health,
  task, muse/agent data), kept logically separate so a domain can be
  split into its own database later by a scripted export/import. See
  `~/workspace/docs/firestore-architecture.md` (the recorded decisions;
  nothing there is built yet unless it says so).
- Domain model is plain JSON: own IDs, ISO-8601 timestamps. No Firestore
  `Timestamp` or `DocumentReference` in the model.
- Real-time push via `onSnapshot()` is the deliberate exception — do
  not poll from app code. The agent connectivity layer (REST + per-AI
  logins + URL-polled hooks) is separate tech; do not mix the two.
- Security rules: root `firestore.rules` targets the named `apps` database.
  Access is driven by `access/{firebaseAuthUid}` document existence.
  Members can manage all app data and membership; treat every member as
  an administrator. Auth account creation alone does not grant access.
  `users/{UID}` is the account directory, populated by the `registerUser`
  Auth-created function and an initial backfill. Members can use its
  email/name labels to find UIDs; directory presence never grants access.
  `_oauth` is server-only credential storage, never app data. Muse's
  platform-managed OAuth setup is documented in root `functions/OAUTH.md`;
  helpers must not obtain or print token-endpoint responses.
  Retain the task ID/title/field-count safeguards. Rules
  are public-safe — policy, never secrets. A rules deploy is always
  plan-first: show the diff, Bentley approves, then deploy and verify.
- No credentials, tokens, or keys in the repo or chat — ever.
- No build step: plain ES modules, imported by relative path. Netlify
  auto-deploys from the `11ty` branch; `static-root/` is copied verbatim.
- Do not build, move, or publish an app unasked.
