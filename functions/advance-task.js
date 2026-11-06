"use strict";

const { Temporal } = require("temporal-polyfill");
const { nextOccurrence } = require("./recurrence");

const TIME_ZONE = "America/Chicago";

function asZonedDateTime(value, field) {
  if (typeof value !== "string") throw new TypeError(`${field} must be an ISO date or datetime`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Temporal.PlainDate.from(value)
      .toZonedDateTime({ timeZone: TIME_ZONE, plainTime: "00:00" });
  }
  return Temporal.Instant.from(value).toZonedDateTimeISO(TIME_ZONE);
}

function maxReference(next, now) {
  const nextDateTime = asZonedDateTime(next, "next");
  const nowDateTime = asZonedDateTime(now, "now");
  return Temporal.ZonedDateTime.compare(nextDateTime, nowDateTime) > 0 ? next : now;
}

function completionBasedPatterns(recurrence, now) {
  const completedAt = asZonedDateTime(now, "now");
  return recurrence.map(pattern => {
    if (pattern.type !== "interval") {
      throw new TypeError('repeatFrom "completion" is only valid for interval patterns');
    }
    const firstDate = completedAt.toPlainDate().add({
      [pattern.unit]: pattern.value,
    });
    return { ...pattern, start: firstDate.toString() };
  });
}

function advanceTask(task, { now, by }) {
  if (!task || typeof task !== "object") throw new TypeError("task must be an object");
  if (task.done !== true || !Array.isArray(task.recurrence) || task.recurrence.length === 0) {
    return null;
  }
  if (typeof task.next !== "string" || task.next.length === 0) {
    throw new TypeError("recurring tasks must have a next date");
  }
  if (typeof now !== "string") throw new TypeError("now must be an ISO datetime string");
  if (typeof by !== "string" || by.length === 0) throw new TypeError("by must identify the completion writer");

  if (task.completedFor != null && task.completedFor !== task.next) {
    return {
      done: false,
      completedFor: null,
      updatedAt: now,
      updatedBy: "recurrence",
    };
  }

  const repeatFrom = task.repeatFrom || "schedule";
  let recurrence = task.recurrence;
  let reference;
  if (repeatFrom === "completion") {
    recurrence = completionBasedPatterns(recurrence, now);
    reference = now;
  } else if (repeatFrom === "schedule") {
    reference = maxReference(task.next, now);
  } else {
    throw new RangeError(`Unsupported repeatFrom mode: ${repeatFrom}`);
  }

  const next = nextOccurrence(recurrence, reference);
  return {
    next,
    done: false,
    completedFor: null,
    lastCompletion: {
      for: task.next,
      at: now,
      by,
      previousNext: task.next,
    },
    updatedAt: now,
    updatedBy: "recurrence",
  };
}

module.exports = { advanceTask };
