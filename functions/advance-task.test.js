"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { advanceTask } = require("./advance-task");

const NOW = "2026-11-05T10:00:00-06:00";

function task(overrides = {}) {
  return {
    done: true,
    next: "2026-11-07",
    recurrence: [{ type: "weekly", weekday: "Saturday" }],
    repeatFrom: "schedule",
    updatedBy: "muse",
    ...overrides,
  };
}

test("schedule mode completed early advances past the scheduled occurrence", () => {
  const patch = advanceTask(task(), { now: NOW, by: "muse" });
  assert.equal(patch.next, "2026-11-14");
  assert.equal(patch.done, false);
  assert.equal(patch.completedFor, null);
});

test("schedule mode completed on time advances to the following occurrence", () => {
  const patch = advanceTask(task(), {
    now: "2026-11-07T10:00:00-06:00",
    by: "bentley",
  });
  assert.equal(patch.next, "2026-11-14");
});

test("schedule mode completed late skips missed occurrences", () => {
  const patch = advanceTask(task({ next: "2026-10-24" }), {
    now: "2026-11-05T10:00:00-06:00",
    by: "muse",
  });
  assert.equal(patch.next, "2026-11-07");
});

test("schedule mode respects a manually postponed next date", () => {
  const patch = advanceTask(task({ next: "2026-11-21" }), {
    now: NOW,
    by: "muse",
  });
  assert.equal(patch.next, "2026-11-28");
});

test("completion mode re-anchors an interval from completion date", () => {
  const patch = advanceTask(task({
    next: "2026-11-05",
    recurrence: [{
      type: "interval",
      unit: "months",
      value: 3,
      start: "2026-08-05",
    }],
    repeatFrom: "completion",
  }), { now: NOW, by: "bentley" });
  assert.equal(patch.next, "2027-02-05");
});

test("completion mode preserves a configured local time and weekday snap", () => {
  const patch = advanceTask(task({
    next: "2026-11-05T08:00:00-06:00",
    recurrence: [{
      type: "interval",
      unit: "weeks",
      value: 1,
      start: "2026-10-29",
      weekday: "Saturday",
      time: "08:00",
    }],
    repeatFrom: "completion",
  }), { now: NOW, by: "bentley" });
  assert.equal(patch.next, "2026-11-14T08:00:00-06:00");
});

test("stale completedFor resets done without advancing", () => {
  const patch = advanceTask(task({
    completedFor: "2026-10-31",
  }), { now: NOW, by: "muse" });
  assert.deepEqual(patch, {
    done: false,
    completedFor: null,
    updatedAt: NOW,
    updatedBy: "recurrence",
  });
});

test("non-recurring and not-done tasks are untouched", () => {
  assert.equal(advanceTask(task({ recurrence: undefined }), { now: NOW, by: "muse" }), null);
  assert.equal(advanceTask(task({ done: false }), { now: NOW, by: "muse" }), null);
});

test("completion metadata records the completed occurrence and writer", () => {
  const previousNext = "2026-11-07";
  const patch = advanceTask(task({ next: previousNext }), { now: NOW, by: "muse" });
  assert.deepEqual(patch.lastCompletion, {
    for: previousNext,
    at: NOW,
    by: "muse",
    previousNext,
  });
});
