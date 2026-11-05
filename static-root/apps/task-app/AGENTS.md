# AGENTS.md — Task App

Editor built 2026-11-05 (`index.html` — sign-in, inline editing,
drag-drop reorder across the P regions, add/delete rows). Widget
endpoint not built yet.

Plan: the future replacement for Todoist + the Task List Google
Sheet here: the frontend on the Firestore SDK, with task data in Cloud
Firestore.

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
- `aiAction`: an instruction to Muse, in Bentley's words ("remind me
  about this on Friday", "check whether this is done and update the
  status"). Muse reads it, does it, then clears the field. The task
  itself stays until it is done and deleted.

Schema (approved 2026-11-05; full draft in
`~/workspace/docs/task-schema.md`, rules in
`~/workspace/docs/task-rules.firestore.rules`):
- Collection `tasks` in the shared `apps` database. Document ID is the
  task's numeric ID as a string (`"1"`, `"6"`). New tasks take max + 1.
- Fields: `id` (same as document ID, immutable), `title` (required,
  non-empty), `parentId` (parent's numeric ID as a string, or null),
  `type` (Personal, Bentley, Mom, CRT, Health), `source` (todoist,
  muse), `sourceId` (`todoist:<id>` or `muse:goal_<id>`), `next` (ISO
  date like `2026-11-09`, or a place like `Belterra`), `status` (next
  step in plain words), `aiAction` (see above), `priority` (`p1`–`p4`,
  required), `order` (number, required — sort key inside a region;
  migration seeds row position × 1000), `createdAt`, `updatedAt`
  (ISO strings), `updatedBy` (who wrote it: `bentley` or the AI login
  name).
- There are no divider documents. `priority` and `order` replace them:
  dragging a row rewrites `order`; dragging across a divider rewrites
  `priority` and `order`.
- The sheet's AI Action column maps to `aiAction`. Done has no field.

Widget data access (final, decided 2026-11-05):
- The phone widget shows the same filtered list as the morning recap
  (leaf tasks needing attention, P1s listed, the rest as counts). It
  needs a way to get that data without talking to Firestore directly.
- Solution: a Cloud Function HTTPS endpoint that reads the task
  collections in the shared `apps` database and returns the display
  list as JSON, already filtered and ordered. The widget polls that
  URL on its own schedule; tapping the widget forces a refresh.
- Auth is the URL itself: a really long, unguessable capability URL
  (same pattern as the per-agent pulse URLs). KWGT's `wg()` is
  GET-only and cannot send a header or a body, so the token lives in
  the URL by design. That is the accepted tradeoff — no Tasker, no
  header/body route. If the URL ever leaks, rotate it. The filtering
  logic lives in one place — the endpoint — so the app, the recap,
  and the widget can never disagree about what the widget shows.
- KWGT cannot render an HTML page. It draws its own canvas (text,
  shapes, images), so formatting lives in the widget, not on the
  server. Android widgets in general cannot host a WebView, so no
  widget app shows a live interactive page. `wg()` can scrape an HTML
  page's data with its jsoup mode, but what it renders is KWGT text.
- KWGT can display a remote image: an image element's Bitmap can be
  a URL, including one pulled out of the JSON feed. So the server can
  render the list as an image (PNG, or SVG for crisp text) and the
  widget shows it — formatting back on the server side.
- Data: the sheet's 40 rows were migrated into Firestore 2026-11-05
  (verified: 7 P1 / 23 P2 / 9 P3 / 1 P4, 15 children of parent 6) —
  Firestore is now the source; edit in the editor, not the sheet.
  Still open: the Todoist-only tasks (14 recurring stay in Todoist;
  1 one-off awaits his call) and how recurring tasks are handled —
  undecided. Order of work (his correction 2026-11-05): in future
  apps, do the data migration last — keep using the old way of
  handling the data until the app is ready.
