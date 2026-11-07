# Gen 2 migration follow-up (for AI agents)

Code was migrated to 2nd gen under new names. Gen 2 cannot replace a gen 1
function in place, so the old gen 1 functions still exist until they are deleted.

| Old (gen 1) | New (gen 2) |
|---|---|
| `widgetFeed` | `widgetFeedV2` |
| `museOAuth` | `museOAuthV2` |
| `registerUser` | `registerUserV2` (`onUserCreated`) |

`advanceRecurringTask` was already gen 2 and is unchanged.

## Preconditions

- Project `apps-5884f`, region `us-central1`, Firestore database `apps`.
- The agent needs Firebase/Google credentials and network access to Google
  domains (`*.googleapis.com`, `accounts.google.com`, `*.run.app`,
  `*.pkg.dev`). Check with `firebase functions:list --project apps-5884f`. If
  that fails, stop and report what is missing; do not guess.
- The new functions do not inherit runtime env vars from the gen 1 ones.
  `functions/.env` (gitignored) must define `WIDGET_TOKEN` and
  `FIREBASE_WEB_API_KEY` before deploying. Never print, log, or commit their values.
- Secret `MUSE_OAUTH_CLIENT_SECRET` must exist in Secret Manager and be
  accessible to the function's runtime service account.

## After deploy

1. Run `firebase functions:list --project apps-5884f` and confirm the three V2
   functions are gen 2 and active.
2. Test without exposing secrets:
   - `registerUserV2`: after a test sign-up, `users/{uid}` exists in the `apps`
     database. Delete the test user and document afterwards.
   - `museOAuthV2`: `GET <url>/authorize` with no parameters returns 400 JSON,
     not 403 or 404. A 403 means public invoker access was not applied; grant
     `roles/run.invoker` to `allUsers` on the Cloud Run service.
   - `widgetFeedV2`: a request with a wrong token is rejected; do not call it
     with the real token in logs or output.
3. Check Cloud Run logs for errors (`resource.type="cloud_run_revision"`,
   not `cloud_function`, for gen 2).
4. Replace the `<museOAuthV2 URL from the deploy output>` placeholders in
   `OAUTH.md` with the real URL (it is not a secret; the widget URL contains a
   token and must never be written down).
5. Tell the user, in one message, which external settings still point at old URLs:
   the phone widget (`widgetFeedV2` URL) and the Muse connector authorize,
   token and revoke URLs. Those live outside this repo.
6. Only after the user confirms the new endpoints work, delete the old
   functions: `firebase functions:delete widgetFeed museOAuth registerUser --region us-central1 --project apps-5884f`.
   Deleting `registerUser` early is safe once `registerUserV2` works; leaving it
   causes duplicate (idempotent) writes.
7. Remove this file once all steps are done.

## Why migrate

Gen 1 appears capped below Node 22 (a `firebase-tools` source comment shows the
Google error "Runtime nodejs22 is not supported on GCF Gen1"; not confirmed from
Google docs). In `firebase-tools` runtime metadata, Node 20 was decommissioned
2026-10-30, while Node 22 and Node 24 run until 2028-10-31. Gen 1 therefore cannot
move to a runtime that still receives security patches, so do not add new gen 1
functions or roll back to gen 1. Gen 2 `onUserCreated` replaces `registerUser`.
Re-verify these dates against current Google docs when network access allows.
