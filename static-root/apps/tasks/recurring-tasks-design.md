# Recurring Tasks — Design

Status: design agreed 2026-11-05; steps 1–6 are implemented. The rules,
completion trigger, and widget are deployed, and the catalog schema is
synchronized. Functions unit tests pass. Muse's production trigger check
remains pending. The editor's signed-in UI was checked with mocked task
data; real Firestore writes have not been tested here.

## Scope

- 39 recurring tasks live only in Todoist (pulled 2026-11-05). This design
  moves them into the `tasks` collection.
- Todoist stays the live system for these until the Firestore version is
  verified. Migration is the last step, and Muse does all of it: pulling
  from Todoist, mapping the rules, writing to Firestore, and archiving the
  Todoist copies. The coding agent has no access to the data.

## Rule types in the live data

| Type | Count | Example Todoist rule |
|---|---|---|
| Weekly day-of-week | 15 | every Saturday |
| Monthly nth weekday | 11 | every 2nd Saturday |
| Interval | 7 | every 3 months |
| Annual date / nth weekday | 5 | every February 7 |
| Daily | 1 | every day |

Todoist stores these as free text with no normalization ("every Sun" and
"every sunday"; "every 3 months" and "every 12 weeks"). Muse normalizes
them by hand during migration. Do not auto-parse. Keep the unit as written: 12 weeks
stays 12 weeks, not 3 months.

## Data model

A recurring task is one document with all the usual task fields, plus
these:

```json
{
  "id": "49",
  "title": "Example recurring task",
  "priority": "p2",
  "order": 25000,
  "next": "2026-11-07T08:00:00-06:00",
  "recurrence": [
    { "type": "monthly", "weekday": "Saturday", "ordinal": 1, "time": "08:00" }
  ],
  "repeatFrom": "schedule",
  "done": false,
  "completedFor": null,
  "lastCompletion": {
    "for": "2026-10-03T08:00:00-05:00",
    "at": "2026-10-03T09:12:44-05:00",
    "by": "bentley",
    "previousNext": "2026-10-03T08:00:00-05:00"
  }
}
```

### `next`

`next` keeps its current meaning: a date, a datetime, or a place.

- `YYYY-MM-DD` for a task with no time of day.
- An ISO datetime with offset, `YYYY-MM-DDTHH:MM:SS±HH:MM`, for a task with
  a time. Write it in America/Chicago local time with its offset, so the
  first 10 characters are always the local date. Do not use the Temporal
  bracket form (`[America/Chicago]`), because `Date.parse` rejects it.
- Places such as `Belterra` are still allowed on non-recurring tasks.

A task with a date-only `next` surfaces on the morning of that date. A task
with a datetime `next` stays hidden until that time and surfaces at it.
Everything that decides whether a task is shown must respect the time.

### `recurrence`

An array of anchor patterns. Each one produces candidate occurrences. A
task with several patterns (for example the 2nd and 4th Saturday) has one
object per pattern, and the earliest qualifying candidate across all of
them wins.

- Daily: `{ "type": "daily" }`
- Weekly: `{ "type": "weekly", "weekday": "Saturday" }`
- Monthly nth weekday: `{ "type": "monthly", "weekday": "Saturday", "ordinal": 2 }`
- Monthly date: `{ "type": "monthly", "day": 1 }`
- Annual date: `{ "type": "annual", "month": 2, "day": 7 }`
- Annual nth weekday: `{ "type": "annual", "month": 10, "weekday": "Saturday", "ordinal": -1 }`
- Interval: `{ "type": "interval", "unit": "months", "value": 3, "start": "2026-08-15" }`.
  `unit` is days, weeks, months, or years. An optional `weekday` snaps each
  occurrence to that weekday.

All patterns:

- `ordinal` is 1 to 5, or -1 for the last one. Always a number.
- Optional `time` (`"HH:MM"`, Chicago wall clock). Without it, `next` is a
  date.
- Optional `offsets`: ISO 8601 durations applied in order to the anchor
  datetime, e.g. `["-P1D"]` or `["-P1D", "-PT2H"]`. Computed with
  `Temporal.ZonedDateTime` in America/Chicago, so `P1D` means one calendar
  day across daylight-saving changes.
- A monthly `day` that the month doesn't have (31 in a 30-day month)
  clamps to the last day of that month, which is Temporal's
  `overflow: "constrain"` behavior.

### `repeatFrom`

- `"schedule"` (default): the next occurrence follows the schedule,
  whenever the task was actually done.
- `"completion"`: the next occurrence counts forward from the moment the
  task was marked done (for example, change the filter 3 months after the
  last change). Only valid on `interval` patterns. For weekday or date
  anchors it adds nothing, and it would bring an early completion back
  on the same date.

### Completion fields

- `done`: same as today. Writing `true` is the only thing a client needs
  to do.
- `completedFor` (optional, written by the client together with
  `done: true`): the `next` value the writer believes it is completing.
  If it is present and does not match the current `next`, the advance is
  skipped and `done` is reset, because the completion is stale (a retry,
  a second AI, or an old browser tab). This prevents a double advance.
- `lastCompletion` (written by the server): what the last advance did.
  `previousNext` makes the advance undoable. A client may only clear this
  field as part of an undo that restores exactly `previousNext`.

## How the next occurrence is computed

`nextOccurrence(recurrence, reference)` is a pure function. It returns the
earliest candidate across all patterns that is strictly after `reference`.
For each pattern it produces anchor dates in order, applies the offsets,
and skips any result that is not after `reference`. Use Temporal
(`temporal-polyfill`), since the functions target Node 22, which has no
native Temporal.

### Choosing the reference when a task is completed

- `repeatFrom: "schedule"`: `reference = max(previous next, now)`.
  - Done early (Thursday, for a Saturday task): the reference is Saturday,
    so the next one is the following Saturday. Without this rule the task
    would just come back on the same Saturday.
  - Done on the day: the reference is now, so the next is the next
    occurrence.
  - Done late, after missing several: the reference is now, so the next
    occurrence is in the future and missed ones do not pile up.
- `repeatFrom: "completion"`: `reference = now`, and the result is
  `now + interval` (snapped to `weekday` and given `time` if set).

### Interval rules and their `start` anchor

Interval occurrences sit on a fixed grid, `start + k × interval`, for the
smallest `k` that clears the reference. Counting from a fixed start rather
than from the last date avoids month-end drift: Jan 31 plus 1, 2, 3 months
gives Feb 28, Mar 31, Apr 30, not Feb 28, Mar 28, Apr 28.

Implications to handle:

1. **Default start.** New tasks use `start = createdAt` (local date). That
   is wrong for migrated tasks, because their `createdAt` is the migration
   day. When Muse migrates them, it sets `start` to Todoist's current due date, so
   the grid matches what Todoist would have done.
2. **Start plus weekday.** With `weekday`, each grid point snaps forward
   to that weekday. `start` itself should already fall on that weekday so
   the first occurrence isn't shifted.
3. **Manual change to `next` (postponing).** In schedule mode, a manually
   pushed `next` is a one-time postponement. The next advance uses
   `max(postponed next, now)` as the reference and lands back on the
   original grid. To move the grid itself, change `start`.
4. **Changing the interval or the pattern.** When a pattern is edited,
   reset `start` to the current `next`, so the new rhythm begins from the
   occurrence already planned instead of being recalculated from an old
   creation date.
5. **Completion mode.** The grid does not apply. `start` is ignored after
   the first completion, and the reference is the completion time.
6. **Very old starts.** Compute `k` directly (from the difference in units)
   instead of stepping one occurrence at a time, so a start years in the
   past is still cheap.

## Server-side advance (catching "done" from anyone)

Clients never compute recurrence. The editor, Muse, and the other AIs only
write `done: true` (and `completedFor` if they know it). A Firestore
trigger in `functions/` does the rest:

- Trigger: document updated in `tasks/{id}` on the `apps` database, where
  `done` changed from not-true to `true` and `recurrence` is a non-empty
  array.
- In a transaction:
  1. Re-read the document. Stop if `done` is no longer true, or if `next`
     differs from the value at trigger time (already advanced). Triggers
     can fire more than once, and this function's own write fires the
     trigger again, so this check makes reruns harmless.
  2. If `completedFor` is set and does not equal `next`, write
     `done: false, completedFor: null` and stop.
  3. Compute the new `next`.
  4. Write `next`, `done: false`, `completedFor: null`,
     `lastCompletion: { for, at, by, previousNext }`, `updatedAt`, and
     `updatedBy: "recurrence"`. `by` is the `updatedBy` from the write
     that set `done`.
- Non-recurring tasks are untouched: `done: true` stays as today.
- Confirm that firebase-functions 4.9 supports v2 Firestore triggers on a
  named database (`database: "apps"`); upgrade if it doesn't.

### Undo

In the editor, the checkbox shows checked briefly, then resets when the
advanced snapshot arrives. Show a short "Done — next: Nov 28 · Undo" note
on the row. Undo writes `next = lastCompletion.previousNext` and clears
`lastCompletion`. AIs can do the same through the REST API.

## Schema sync

Per AGENTS.md, update these together:

- Root `database/collections.json`: add `recurrence`, `repeatFrom`,
  `completedFor`, `lastCompletion`; widen `next` to allow datetimes;
  describe the recurring `done` behavior.
- The schema description stored in Firestore. Firestore holds a copy of
  each `collections.json` entry as a document in the `collections`
  collection (the tasks entry is document `collections/tasks`), so AIs
  can read the expected format from the database. Its `tasks` entry must
  be updated to match `collections.json`, changing only the fields above
  and leaving the rest of the document alone.
- Root `firestore.rules`: allow the new fields; only the server may set
  `lastCompletion`. Permit a client to clear it only when restoring
  exactly `previousNext`.
- `AGENTS.md` in this folder.

## Who does what

- **Coding agent** (Copilot in this repository): repository files (code,
  tests, schema files, docs); environment metadata, including the
  `collections/tasks` schema document in Firestore; and deploys of
  Firestore rules and Cloud Functions with the Firebase CLI. It does not
  read or write task data in Firestore or Todoist.
- **Muse**: task data: the Firestore `tasks` collection and Todoist.
- **Bentley**: decisions and sign-off only.

## Steps

Each step is independently buildable and verifiable. Do them in order.
Each one names its owner.

1. **`nextOccurrence` function and tests.** *Coding agent.*
   `functions/recurrence.js` with `nextOccurrence(recurrence, reference)`
   built on `temporal-polyfill`. `node:test` cases for every pattern type,
   ordinal -1, month-end clamping, offsets across a daylight-saving change,
   compound patterns (2nd and 4th Saturday), interval grids with old
   starts, and weekday snapping. Test cases use made-up rules, not live
   data. Verify: `node --test` in `functions/`.
2. **`advanceTask` function and tests.** *Coding agent.* A pure
   `advanceTask(task, { now, by })` that returns the patch to write (or a
   reset for stale `completedFor`). It covers early, on-time, late, and
   missed completions; both `repeatFrom` modes; and the postponed-`next`
   case. Verify: `node --test`.
3. **Schema sync.** *Coding agent:* update `database/collections.json`,
   `firestore.rules`, and AGENTS.md as above. Deploy the rules. Update the
   `collections/tasks` document in Firestore to match the new
   `collections.json` tasks entry, changing only the new and changed
   fields so nothing else in the document is overwritten. Read it back to
   confirm.
4. **Firestore trigger.** *Coding agent:* wire `advanceTask` into a
   transaction-based, retry-safe trigger on the `apps` database. Verify
   transaction behavior with unit tests:
   mark done, then confirm a single advance, a no-op rerun, and a stale
   `completedFor` reset. Deploy the function. *Muse* repeats the same
   check on one test task in production before migration.
5. **Editor.** *Coding agent.* Show the next occurrence and rule summary
   for recurring rows, editable structured patterns, and the
   "Done — next: … · Undo" note. Reset interval `start` to the current
   `next` when recurrence semantics change, while preserving an explicitly
   edited `start`. No recurrence math in the editor beyond display. Check
   the signed-in experience in the browser.
6. **Widget.** *Coding agent.* Look up the rewritten widget and make it
   work with the recurring-task design. Test and deploy it. **Completed.**
7. **Migration mapping, reviewed.** *Muse.* Pull the 39 rules from
   Todoist and hand-write them into structured `recurrence` objects in a
   reviewable file, with interval `start` taken from Todoist's due date.
   Run `nextOccurrence` (from step 1) on each and compare it with Todoist's
   next due date. *Bentley* reviews and signs off on the mapping.
8. **Migrate and cut over.** *Muse.* Write the 39 tasks to Firestore and
   run them alongside Todoist for a few cycles, comparing each advance
   with Todoist's. When they match, *Bentley* approves the cutover and
   Muse archives the Todoist copies.
