"use strict";

const { Temporal } = require("temporal-polyfill");

const TIME_ZONE = "America/Chicago";
const WEEKDAYS = {
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
  Sunday: 7,
};

function parseReference(reference) {
  if (typeof reference !== "string") {
    throw new TypeError("reference must be an ISO date or datetime string");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(reference)) {
    return Temporal.PlainDate.from(reference)
      .toZonedDateTime({ timeZone: TIME_ZONE, plainTime: "00:00" });
  }
  return Temporal.Instant.from(reference).toZonedDateTimeISO(TIME_ZONE);
}

function weekdayNumber(weekday) {
  const value = WEEKDAYS[weekday];
  if (!value) throw new RangeError(`Unsupported weekday: ${weekday}`);
  return value;
}

function validateOrdinal(ordinal) {
  if (ordinal !== -1 && (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 5)) {
    throw new RangeError("ordinal must be 1 through 5, or -1 for last");
  }
}

function validatePattern(pattern) {
  if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) {
    throw new TypeError("each recurrence pattern must be an object");
  }
  if (pattern.time !== undefined) {
    if (typeof pattern.time !== "string" || !/^\d{2}:\d{2}$/.test(pattern.time)) {
      throw new TypeError("time must be HH:MM");
    }
    Temporal.PlainTime.from(`${pattern.time}:00`);
  }
  if (pattern.offsets !== undefined) {
    if (!Array.isArray(pattern.offsets)) throw new TypeError("offsets must be an array");
    for (const offset of pattern.offsets) {
      if (typeof offset !== "string") throw new TypeError("each offset must be an ISO 8601 duration");
      Temporal.Duration.from(offset);
    }
  }

  switch (pattern.type) {
    case "daily":
      break;
    case "weekly":
      weekdayNumber(pattern.weekday);
      break;
    case "monthly":
      if (pattern.weekday !== undefined) {
        weekdayNumber(pattern.weekday);
        validateOrdinal(pattern.ordinal);
      } else if (!Number.isInteger(pattern.day) || pattern.day < 1 || pattern.day > 31) {
        throw new RangeError("monthly day must be an integer from 1 through 31");
      }
      break;
    case "annual":
      if (!Number.isInteger(pattern.month) || pattern.month < 1 || pattern.month > 12) {
        throw new RangeError("annual month must be an integer from 1 through 12");
      }
      if (pattern.weekday !== undefined) {
        weekdayNumber(pattern.weekday);
        validateOrdinal(pattern.ordinal);
      } else if (!Number.isInteger(pattern.day) || pattern.day < 1 || pattern.day > 31) {
        throw new RangeError("annual day must be an integer from 1 through 31");
      }
      break;
    case "interval":
      if (!["days", "weeks", "months", "years"].includes(pattern.unit)) {
        throw new RangeError("interval unit must be days, weeks, months, or years");
      }
      if (!Number.isSafeInteger(pattern.value) || pattern.value < 1) {
        throw new RangeError("interval value must be a positive integer");
      }
      if (typeof pattern.start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(pattern.start)) {
        throw new TypeError("interval start must be an ISO date");
      }
      Temporal.PlainDate.from(pattern.start);
      if (pattern.weekday !== undefined) weekdayNumber(pattern.weekday);
      break;
    default:
      throw new RangeError(`Unsupported recurrence type: ${pattern.type}`);
  }
}

function nthWeekday(year, month, weekday, ordinal) {
  const first = Temporal.PlainDate.from({ year, month, day: 1 });
  const daysInMonth = first.daysInMonth;
  if (ordinal === -1) {
    const last = first.with({ day: daysInMonth });
    const daysBack = (last.dayOfWeek - weekdayNumber(weekday) + 7) % 7;
    return last.subtract({ days: daysBack });
  }
  const daysForward = (weekdayNumber(weekday) - first.dayOfWeek + 7) % 7;
  const day = 1 + daysForward + (ordinal - 1) * 7;
  return day <= daysInMonth ? first.with({ day }) : null;
}

function monthDay(year, month, day) {
  const first = Temporal.PlainDate.from({ year, month, day: 1 });
  return first.with({ day: Math.min(day, first.daysInMonth) });
}

function addInterval(start, pattern, index) {
  const amount = index * pattern.value;
  if (!Number.isSafeInteger(amount)) throw new RangeError("interval is too large");
  return start.add({ [pattern.unit]: amount });
}

function firstIntervalDate(pattern, lowerBound) {
  const start = Temporal.PlainDate.from(pattern.start);
  let index = 0;
  if (Temporal.PlainDate.compare(start, lowerBound) < 0) {
    if (pattern.unit === "days" || pattern.unit === "weeks") {
      const days = start.until(lowerBound, { largestUnit: "days" }).days;
      const intervalDays = pattern.value * (pattern.unit === "weeks" ? 7 : 1);
      index = Math.max(0, Math.floor(days / intervalDays));
    } else if (pattern.unit === "months") {
      const months = (lowerBound.year - start.year) * 12 + lowerBound.month - start.month;
      index = Math.max(0, Math.floor(months / pattern.value) - 1);
    } else {
      index = Math.max(0, Math.floor((lowerBound.year - start.year) / pattern.value) - 1);
    }
  }

  while (true) {
    let candidate = addInterval(start, pattern, index);
    if (pattern.weekday) {
      const daysForward = (weekdayNumber(pattern.weekday) - candidate.dayOfWeek + 7) % 7;
      candidate = candidate.add({ days: daysForward });
    }
    if (Temporal.PlainDate.compare(candidate, lowerBound) >= 0) return candidate;
    index++;
  }
}

function firstAnchorDate(pattern, lowerBound) {
  if (pattern.type === "daily") return lowerBound;
  if (pattern.type === "interval") return firstIntervalDate(pattern, lowerBound);
  if (pattern.type === "weekly") {
    const daysForward = (weekdayNumber(pattern.weekday) - lowerBound.dayOfWeek + 7) % 7;
    return lowerBound.add({ days: daysForward });
  }

  const isMonthly = pattern.type === "monthly";
  let year = lowerBound.year;
  let month = isMonthly ? lowerBound.month : pattern.month;
  const lastYear = isMonthly ? year + 2000 : year + 4000;
  while (year <= lastYear) {
    if (isMonthly || year > lowerBound.year || month >= lowerBound.month) {
      const candidate = pattern.weekday
        ? nthWeekday(year, month, pattern.weekday, pattern.ordinal)
        : monthDay(year, month, pattern.day);
      if (candidate && Temporal.PlainDate.compare(candidate, lowerBound) >= 0) return candidate;
    }
    if (isMonthly) {
      if (month === 12) {
        year++;
        month = 1;
      } else {
        month++;
      }
    } else {
      year++;
    }
  }
  throw new RangeError("could not find a recurrence date");
}

function anchorDateTime(pattern, date) {
  const time = pattern.time || "00:00";
  const [hour, minute] = time.split(":").map(Number);
  return Temporal.ZonedDateTime.from({
    timeZone: TIME_ZONE,
    year: date.year,
    month: date.month,
    day: date.day,
    hour,
    minute,
    second: 0,
  }, { disambiguation: "compatible", overflow: "constrain" });
}

function applyOffsets(pattern, date) {
  let result = anchorDateTime(pattern, date);
  for (const offset of pattern.offsets || []) {
    result = result.add(Temporal.Duration.from(offset));
  }
  return result;
}

function anchorSearchStart(pattern, reference) {
  let threshold = reference;
  const offsets = pattern.offsets || [];
  for (let index = offsets.length - 1; index >= 0; index--) {
    threshold = threshold.subtract(Temporal.Duration.from(offsets[index]));
  }
  return threshold.toPlainDate().subtract({ days: 1 });
}

function nextForPattern(pattern, reference) {
  let anchorDate = firstAnchorDate(pattern, anchorSearchStart(pattern, reference));
  for (let attempt = 0; attempt < 100000; attempt++) {
    const candidate = applyOffsets(pattern, anchorDate);
    if (candidate.epochNanoseconds > reference.epochNanoseconds) return candidate;
    anchorDate = firstAnchorDate(pattern, anchorDate.add({ days: 1 }));
  }
  throw new RangeError("could not find a future recurrence");
}

function formatOccurrence(value) {
  if (value.hour === 0 && value.minute === 0 && value.second === 0 &&
      value.millisecond === 0 && value.microsecond === 0 && value.nanosecond === 0) {
    return value.toPlainDate().toString();
  }
  return value.toString({
    smallestUnit: "second",
    calendarName: "never",
    timeZoneName: "never",
  });
}

function nextOccurrence(recurrence, referenceString) {
  if (!Array.isArray(recurrence) || recurrence.length === 0) {
    throw new TypeError("recurrence must be a non-empty array");
  }
  const reference = parseReference(referenceString);
  let earliest = null;
  for (const pattern of recurrence) {
    validatePattern(pattern);
    const candidate = nextForPattern(pattern, reference);
    if (!earliest || candidate.epochNanoseconds < earliest.epochNanoseconds) {
      earliest = candidate;
    }
  }
  return formatOccurrence(earliest);
}

module.exports = { nextOccurrence };
