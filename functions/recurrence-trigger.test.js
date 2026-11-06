"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { processTaskUpdate } = require("./recurrence-trigger");

function fakeDatabase(current) {
  const updates = [];
  return {
    updates,
    async runTransaction(callback) {
      return callback({
        async get() {
          return {
            exists: current !== null,
            data: () => current,
          };
        },
        update(_ref, patch) {
          updates.push(patch);
          Object.assign(current, patch);
        },
      });
    },
  };
}

const ref = {};
const completed = {
  done: true,
  next: "2026-11-07",
  recurrence: [{ type: "weekly", weekday: "Saturday" }],
  updatedBy: "muse",
};

test("trigger transaction advances a recurring completion once", async () => {
  const current = { ...completed };
  const db = fakeDatabase(current);
  const advanced = await processTaskUpdate({
    db,
    ref,
    before: { done: false },
    after: completed,
    now: "2026-11-07T10:00:00-06:00",
  });
  assert.equal(advanced, true);
  assert.equal(current.next, "2026-11-14");
  assert.equal(current.done, false);

  const duplicate = await processTaskUpdate({
    db,
    ref,
    before: { done: false },
    after: completed,
    now: "2026-11-07T10:00:00-06:00",
  });
  assert.equal(duplicate, false);
  assert.equal(db.updates.length, 1);
});

test("trigger ignores non-recurring, unchanged, and obsolete events", async () => {
  const db = fakeDatabase({ ...completed, done: false });
  assert.equal(await processTaskUpdate({
    db, ref, before: { done: false }, after: completed,
    now: "2026-11-07T10:00:00-06:00",
  }), false);
  assert.equal(await processTaskUpdate({
    db, ref, before: { done: true }, after: completed,
    now: "2026-11-07T10:00:00-06:00",
  }), false);
  assert.equal(await processTaskUpdate({
    db, ref, before: { done: false },
    after: { ...completed, recurrence: undefined },
    now: "2026-11-07T10:00:00-06:00",
  }), false);
  assert.equal(db.updates.length, 0);
});

test("trigger ignores an event for an occurrence that has already advanced", async () => {
  const db = fakeDatabase({ ...completed, next: "2026-11-14" });
  assert.equal(await processTaskUpdate({
    db,
    ref,
    before: { done: false },
    after: completed,
    now: "2026-11-07T10:00:00-06:00",
  }), false);
  assert.equal(db.updates.length, 0);
});

test("trigger resets a stale completion without advancing the task", async () => {
  const stale = {
    ...completed,
    completedFor: "2026-10-31",
  };
  const current = { ...stale };
  const db = fakeDatabase(current);
  assert.equal(await processTaskUpdate({
    db,
    ref,
    before: { done: false },
    after: stale,
    now: "2026-11-07T10:00:00-06:00",
  }), true);
  assert.equal(current.done, false);
  assert.equal(current.next, "2026-11-07");
  assert.equal(current.completedFor, null);
  assert.equal(current.lastCompletion, undefined);
  assert.equal(current.advanceError, null);
});

test("trigger propagates a data error for an interval pattern without start", async () => {
  const bad = {
    ...completed,
    recurrence: [{ type: "interval", unit: "months", value: 1 }],
  };
  const current = { ...bad };
  const db = fakeDatabase(current);
  await assert.rejects(() => processTaskUpdate({
    db,
    ref,
    before: { done: false },
    after: bad,
    now: "2026-11-07T10:00:00-06:00",
  }), /interval start must be an ISO date/);
  assert.equal(db.updates.length, 0);
});

test("trigger advances after an unrelated edit made before the event is processed", async () => {
  const current = { ...completed, title: "Renamed", updatedBy: "another-writer" };
  const db = fakeDatabase(current);
  assert.equal(await processTaskUpdate({
    db,
    ref,
    before: { done: false },
    after: completed,
    now: "2026-11-07T10:00:00-06:00",
  }), true);
  assert.equal(current.title, "Renamed");
  assert.equal(current.next, "2026-11-14");
  assert.equal(current.lastCompletion.by, "muse");
  assert.equal(db.updates.length, 1);
});
