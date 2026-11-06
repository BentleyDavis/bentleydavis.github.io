"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { nextOccurrence } = require("./recurrence");

test("daily and weekly patterns return a strictly later occurrence", () => {
  assert.equal(nextOccurrence([{ type: "daily" }], "2026-11-05"), "2026-11-06");
  assert.equal(
    nextOccurrence([{ type: "weekly", weekday: "Saturday" }], "2026-11-05"),
    "2026-11-07"
  );
  assert.equal(
    nextOccurrence([{ type: "weekly", weekday: "Saturday" }], "2026-11-07"),
    "2026-11-14"
  );
});

test("monthly nth-weekday skips missing fifth weekdays and supports last", () => {
  assert.equal(
    nextOccurrence([{ type: "monthly", weekday: "Monday", ordinal: 5 }], "2026-02-01"),
    "2026-03-30"
  );
  assert.equal(
    nextOccurrence([{ type: "monthly", weekday: "Saturday", ordinal: -1 }], "2026-11-01"),
    "2026-11-28"
  );
});

test("monthly date constrains to month end", () => {
  assert.equal(
    nextOccurrence([{ type: "monthly", day: 31 }], "2026-02-01"),
    "2026-02-28"
  );
  assert.equal(
    nextOccurrence([{ type: "monthly", day: 31 }], "2026-02-28"),
    "2026-03-31"
  );
});

test("annual date and annual nth-weekday patterns", () => {
  assert.equal(
    nextOccurrence([{ type: "annual", month: 2, day: 7 }], "2026-02-08"),
    "2027-02-07"
  );
  assert.equal(
    nextOccurrence([{ type: "annual", month: 10, weekday: "Saturday", ordinal: -1 }], "2026-11-01"),
    "2027-10-30"
  );
});

test("interval patterns use a fixed start grid for each supported unit", () => {
  assert.equal(
    nextOccurrence([{ type: "interval", unit: "months", value: 1, start: "2026-01-31" }], "2026-02-28"),
    "2026-03-31"
  );
  assert.equal(
    nextOccurrence([{ type: "interval", unit: "weeks", value: 2, start: "2026-01-05" }], "2026-01-12"),
    "2026-01-19"
  );
  assert.equal(
    nextOccurrence([{ type: "interval", unit: "days", value: 3, start: "2026-01-01" }], "2026-01-02"),
    "2026-01-04"
  );
  assert.equal(
    nextOccurrence([{ type: "interval", unit: "years", value: 2, start: "2020-02-29" }], "2025-01-01"),
    "2026-02-28"
  );
});

test("interval weekday snapping uses the anchored grid", () => {
  assert.equal(
    nextOccurrence([{
      type: "interval",
      unit: "months",
      value: 1,
      start: "2026-01-30",
      weekday: "Saturday",
    }], "2026-02-01"),
    "2026-02-28"
  );
  assert.equal(
    nextOccurrence([{
      type: "interval",
      unit: "months",
      value: 1,
      start: "2026-01-30",
      weekday: "Saturday",
    }], "2026-01-30"),
    "2026-01-31"
  );
});

test("interval lookup jumps directly from an old start", () => {
  assert.equal(
    nextOccurrence([{
      type: "interval",
      unit: "weeks",
      value: 2,
      start: "1900-01-01",
    }], "2026-11-05"),
    "2026-11-16"
  );
});

test("compound patterns return the earliest qualifying date", () => {
  assert.equal(
    nextOccurrence([
      { type: "monthly", weekday: "Saturday", ordinal: 2 },
      { type: "monthly", weekday: "Saturday", ordinal: 4 },
    ], "2026-11-05"),
    "2026-11-14"
  );
  assert.equal(
    nextOccurrence([
      { type: "monthly", weekday: "Saturday", ordinal: 2 },
      { type: "monthly", weekday: "Saturday", ordinal: 4 },
    ], "2026-11-14"),
    "2026-11-28"
  );
});

test("time and ordered offsets use Chicago calendar arithmetic across DST", () => {
  assert.equal(
    nextOccurrence([{
      type: "daily",
      time: "08:00",
      offsets: ["-P1D", "-PT2H"],
    }], "2026-03-08T07:00:00-05:00"),
    "2026-03-09T06:00:00-05:00"
  );
  assert.equal(
    nextOccurrence([{
      type: "daily",
      time: "08:00",
      offsets: ["-P1D"],
    }], "2026-03-08T09:00:00-05:00"),
    "2026-03-09T08:00:00-05:00"
  );
});

test("time-only rules return Chicago datetimes and compare with time precision", () => {
  const rule = [{ type: "daily", time: "08:00" }];
  assert.equal(nextOccurrence(rule, "2026-11-05T07:59:00-06:00"), "2026-11-05T08:00:00-06:00");
  assert.equal(nextOccurrence(rule, "2026-11-05T08:00:00-06:00"), "2026-11-06T08:00:00-06:00");
});

test("invalid rules fail explicitly", () => {
  assert.throws(() => nextOccurrence([], "2026-11-05"), /non-empty array/);
  assert.throws(() => nextOccurrence([{ type: "weekly", weekday: "Funday" }], "2026-11-05"), /Unsupported weekday/);
  assert.throws(() => nextOccurrence([{ type: "interval", unit: "days", value: 0, start: "2026-01-01" }], "2026-01-02"), /positive integer/);
});
