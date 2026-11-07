# Tasker widget project

The phone widget that shows the task list. This folder holds the Tasker
project for the Tasks Widget, built from a TypeScript script — not edited by
hand in Tasker.

## Files

- `build_tasker_v2.ts` — the source of truth. A Node script (run with
  `node build_tasker_v2.ts`, Node 24, no build step) that generates the
  project file. It reads the Firebase web API key from the Task App
  (`static-root/apps/tasks/app.js`) and embeds it in the sign-in and
  token-refresh URLs. The key is a public client identifier already in the
  Task App's code. Edit this script, not the XML. Bump `PROJECT_VERSION`
  on every republish; the version lives in the project name.
- `Tasks_Widget.prj.xml` — the built project file. Import it into Tasker
  on the phone (Tasker home icon → Import Project). Rebuilt by the script;
  do not edit by hand.

## What the widget does

Two profiles, four tasks:

- Profile "Tasks Widget Refresh" — every 5 minutes, runs "Update Tasks Widget".
- Profile "Tasker Update Tap" — tapping the update notification runs
  "Install Tasker Update".
- Task "Update Tasks Widget" — reuses the stored Firebase ID token while it
  is under 55 minutes old, refreshes it when older, fetches the task list,
  and draws it in the widget.
- Task "Setup Tasker Login" — asks for the Firebase password once (never
  stored), signs in, and stores the refresh token, ID token, and timestamp
  in Tasker global variables. Tokens survive project delete/re-import
  because project files do not contain global variables.
- Task "Check Tasker Queue" — legacy update-notification logic. The queue
  collection was removed and nothing uses it, so this is inert; removal is
  pending.
- Task "Install Tasker Update" — downloads a new project file and opens it
  for import.

## Calling contract — how the widget calls the feed function

- Endpoint: `https://us-central1-apps-5884f.cloudfunctions.net/widgetFeed`
- Auth: `Authorization: Bearer <Firebase ID token>` for a member account
  (`tasker@eexpression.com`). The token is refreshed via
  `securetoken.googleapis.com` when older than 55 minutes; a 401 means
  refresh the token and retry.
- No URL token: the `?token=` path is legacy and nothing sends it.
- Response: plain text, one line per task; 200 on success.

## Phone setup (for reference)

- Tasker battery: Settings → Apps → Tasker → App battery usage → Unrestricted.
- Import a new project version: delete the existing project first (delete
  its contents too, or tasks/profiles linger), re-download the file, then
  import. Re-importing a same-name project fails.
- The phone currently gets the project file from Google Drive
  (AI > Muse > Tasker). This repo is the source of truth; the Drive copy is
  the published one until the download moves to the site.
