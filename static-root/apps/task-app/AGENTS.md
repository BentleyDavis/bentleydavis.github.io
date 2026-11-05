# AGENTS.md — Task App (plan)

PLAN — NOT BUILT YET. Do not start building it unasked.

Plan: build the future replacement for Todoist + the Task List Google
Sheet here: the frontend on the Firestore SDK, with task data in Cloud
Firestore. The migration itself is deferred until the task-app build.

Decisions already made:
- Database: the shared `apps` database; task data lives in its own
  top-level collections. One Firebase Auth email/password login per AI, over
  the Firebase REST APIs. No repository/abstraction layer — portability
  via discipline instead: plain-JSON domain model with Bentley's own IDs,
  as few Firestore-specific features as possible, real-time push via
  `onSnapshot()` as the deliberate exception.
- Change notifications use the per-agent timestamp-URL hook design (see
  firestore-architecture.md) — hooks poll their own URL, hold no
  credentials, and wake on a newer timestamp.
- Task records say WHAT, never HOW/WHEN the reminder works. Row position
  is the master priority in the current sheet — never auto-sort/reorder.
  "Task list" means the sheet or Todoist — never Google Tasks.
- When this app is built, the Firestore task-system decisions in
  `~/workspace/docs/firestore-architecture.md` are the spec. Shared code
  from `../shared/` only. No credentials in the repo.

Task model — features this app must carry (described as behavior, not
as the systems they replace):
- Hierarchy: tasks nest under parents, several layers deep. Each task
  has a unique numeric ID; a child points at its parent's ID. A parent
  row is a grouping, not a task — it never appears in a list, never
  counts, never carries a priority of its own.
- Priority is leaf-based: a leaf task's priority comes from where it
  sits between the priority-region dividers (P1, P2, P3, P4). Position
  IS the priority — never auto-sort or reorder. Moving a task between
  regions changes its priority.
- Waiting: a task can wait on a person or a date. Waiting and
  future-dated tasks are excluded from every list and every count until
  the wait passes — then they surface that morning as now pertinent.
  Only tasks needing his attention are ever shown or counted.
- Display: P1 leaf tasks are listed individually; P2/P3/P4 show as
  counts only. The same rule applies everywhere — the morning recap,
  the widget, and this app all agree on what is shown.
- Task records say WHAT, never HOW/WHEN the reminder works. Status
  holds the next step in plain words, no judgment on whether he has
  acted. Each task can link its source system by ID (an external task
  ID or a Muse goal).
- Completion: when a task is done, its key details are recorded first,
  then the task is deleted — never marked complete.

Widget data access:
- The phone widget shows the same filtered list as the morning recap
  (leaf tasks needing attention, P1s listed, the rest as counts). It
  needs a way to get that data without talking to Firestore directly.
- Solution: a Cloud Function HTTPS endpoint that reads the task
  collections in the shared `apps` database and returns the display
  list as JSON, already filtered and ordered. The widget polls that
  URL on its own schedule; tapping the widget forces a refresh.
- The endpoint's URL is long and unguessable (capability URL, same
  pattern as the per-agent pulse URLs). No credentials live on the
  phone, and the filtering logic lives in one place — the endpoint —
  so the app, the recap, and the widget can never disagree about what
  the widget shows.
- Writes from the widget (complete, snooze, re-prioritize) cannot go
  through KWGT's `wg()` — it is GET-only and takes no body. Two ways
  to send an action: encode it in the URL's query params on a GET
  (the endpoint must treat it as idempotent, so a retry or re-fetch
  cannot double-apply it), or have the widget's touch action fire a
  Tasker task whose HTTP Request action POSTs a JSON body to the
  endpoint. The Tasker route is the clean one for real writes.
- KWGT cannot render an HTML page. It draws its own canvas (text,
  shapes, images), so formatting lives in the widget, not on the
  server. Android widgets in general cannot host a WebView, so no
  widget app shows a live interactive page — screenshot widgets
  (e.g. AnyWidget) render the page in the background and show a
  picture of it, which loses tap actions. `wg()` can scrape an HTML
  page's data with its jsoup mode, but what it renders is KWGT text.
- Once this app exists and works, do a FINAL DATA SYNC: export the
  tasks from Todoist + the Task List sheet and import them into
  Firestore, then verify counts match before the old systems are
  retired.
