# AGENTS.md — Task App

Editor built 2026-11-05 (`index.html` — sign-in, inline editing,
drag-drop reorder across the P regions, add rows, reversible Done). Widget
endpoint `widgetFeedV2` is deployed; its source is in the repository's root
`functions/` directory, separate from the static website.

Children show their parent's title (or its ID if the parent is missing);
parent rows show their direct child count. These labels refresh with
confirmed task snapshots, including parent renames.

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
  the wait passes — then they surface as now pertinent: that morning for
  a date, or at the time itself when one is given.
  Only tasks needing his attention are ever shown or counted.
- Display: the morning recap lists P1 leaf tasks individually and shows
  P2/P3/P4 as counts. The current widget lists eligible leaves at all
  priorities; the editor is an editable table.
- Task records say WHAT, never HOW/WHEN the reminder works. Status
  holds the next step in plain words, no judgment on whether he has
  acted. Each task can link its source system by ID (an external task
  ID or a Muse goal).
- Completion (updated 2026-11-05): a persistent Done checkbox toggles
  completion. Completed tasks stay visible in their existing positions
  and can be unchecked. There is no delete control in the editor.
- `aiAction`: an instruction to Muse, in Bentley's words ("remind me
  about this on Friday", "check whether this is done and update the
  status"). Muse reads it, does it, then clears the field. The task
  itself stays stored, including when marked done.

Schema: root `database/collections.json` and live `collections/tasks`
describe the expected format; root `firestore.rules` defines actual
enforcement. Keep these and this guidance synchronized on schema changes.
- Collection `tasks` in the shared `apps` database. Document ID is the
  task's numeric ID as a string (`"1"`, `"6"`). New tasks take max + 1.
- Fields: `id` (same as document ID, immutable), `title` (required,
  non-empty), `parentId` (parent's numeric ID as a string, or null),
  `type` (Personal, Bentley, Mom, CRT, Health), `source` (todoist,
  muse), `sourceId` (`todoist:<id>` or `muse:goal_<id>`), `next` (ISO
  date, ISO datetime with offset, or a place like `Belterra`), `status` (next
  step in plain words), `aiAction` (see above), `priority` (`p1`–`p4`,
  required), `order` (number, required — sort key inside a region;
  migration seeds row position × 1000), `createdAt`, `updatedAt`
  (ISO strings), `updatedBy` (who wrote it: `bentley` or the AI login
  name). Optional `done` (boolean) defaults to false when absent;
  toggling Done writes it without deleting the task. Recurring tasks also
  have `recurrence` (structured patterns), `repeatFrom` (`schedule` or
  `completion`), and optional `completedFor`. The server advances a
  recurring task when `done` becomes true, resets `done`, and records
  `lastCompletion` for undo; clients may only clear it while restoring
  its `previousNext`.
- Recurrence is computed only on the server (`functions/recurrence.js`,
  `advance-task.js`, `recurrence-trigger.js`, with `node --test`
  coverage). Clients and AIs just write `done: true`, plus `completedFor`
  when they know which `next` they are completing, so retries and stale
  tabs cannot advance twice. The trigger is transactional and safe to
  rerun. The editor shows "Done — next: … · Undo"; Undo restores
  `lastCompletion.previousNext`. Pattern formats and interval `start`
  rules are in the schema's field descriptions.
- There are no divider documents. `priority` and `order` replace them:
  dragging a row rewrites `order`; dragging across a divider rewrites
  `priority` and `order`.
- The sheet's AI Action column maps to `aiAction`.
- The editor subscribes with `onSnapshot()` while signed in and
  unsubscribes on auth changes. Failed writes show an error without
  changing the confirmed task data. Numeric IDs are checked inside a
  transaction before creation to prevent overwrites.
- The heading shows Saving while a write is pending, Saved only after
  Firestore confirms it, or Save failed with a separate error message.
- Rules enforce the types of `done`, `recurrence`, `repeatFrom`, and
  `completedFor`. Only the server can set `lastCompletion`; clients may
  clear it only when restoring its `previousNext`.

Widget data access (final, decided 2026-11-05):
- The phone widget lists eligible leaf tasks with priority dots. It needs
  a way to get that data without talking to Firestore directly.
- Solution: a Cloud Function HTTPS endpoint that reads the task
  collections in the shared `apps` database and returns a formatted
  plain-text list, already filtered and ordered. The widget polls that
  URL on its own schedule; tapping the widget forces a refresh.
- Auth is the URL itself: a really long, unguessable capability URL
  (same pattern as the per-agent pulse URLs). KWGT's `wg()` is
  GET-only and cannot send a header or a body, so the token lives in
  the URL by design. That is the accepted tradeoff — no Tasker, no
  header/body route. If the URL ever leaks, rotate it. The widget's
  filtering logic lives in the endpoint.
- KWGT cannot render an HTML page. It draws its own canvas (text,
  shapes, images), rendering the text formatted by the endpoint.
  Android widgets in general cannot host a WebView, so no
  widget app shows a live interactive page. `wg()` can scrape an HTML
  page's data with its jsoup mode, but what it renders is KWGT text.
- Firestore is the source for non-recurring tasks; edit in the editor,
  not the sheet. Recurring tasks stay in Todoist until Muse migrates them
  and Bentley approves the cutover. Order of work (his correction 2026-11-05):
  in future apps, do the data migration last — keep using the old way
  of handling the data until the app is ready.
