# AGENTS.md — Task App

NOT BUILT YET. Do not start building it unasked.

Future replacement for Todoist + the Task List Google Sheet: the frontend
on the Firestore SDK, with task data in Cloud Firestore. The migration
itself is deferred until the task-app build.

- Database: `tasks`. One Firebase Auth email/password login per AI, over
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
