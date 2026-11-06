"use strict";

const TIME_ZONE = "America/Chicago";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PREFIX = /^\d{4}-\d{2}-\d{2}T/i;
const DATETIME = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.(\d{1,9}))?)?(?:Z|[+-]\d{2}:\d{2})$/i;
const EMOJI = { p1: "🔴", p2: "🟠", p3: "🔵", p4: "⚪" };
const RANK = { p1: 1, p2: 2, p3: 3, p4: 4 };

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function chicagoDate(value) {
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(value).map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseNext(next, today, now) {
  if (typeof next !== "string") return { future: false, dateKey: "" };
  if (DATE_ONLY.test(next)) return { future: next > today, dateKey: next };
  if (!DATETIME_PREFIX.test(next)) return { future: false, dateKey: "" };

  const match = DATETIME.exec(next);
  if (!match) throw new RangeError("Invalid datetime in task next field");
  const calendarTime = Date.parse(`${match[1]}T00:00:00Z`);
  const dueTime = Date.parse(next);
  if (!Number.isFinite(calendarTime) || !Number.isFinite(dueTime) ||
      new Date(calendarTime).toISOString().slice(0, 10) !== match[1]) {
    throw new RangeError("Invalid datetime in task next field");
  }
  const subMillisecond = /[1-9]/.test((match[2] || "").slice(3));
  return {
    future: dueTime > now || (dueTime === now && subMillisecond),
    dateKey: chicagoDate(new Date(dueTime)),
  };
}

function buildWidgetText(tasks, now = new Date()) {
  const nowMillis = now.getTime();
  if (!Number.isFinite(nowMillis)) throw new RangeError("Invalid current time");
  const today = chicagoDate(now);
  const parentIds = new Set(tasks.filter(task => task.parentId).map(task => task.parentId));
  const leaves = [];
  for (const task of tasks) {
    if (parentIds.has(task.id)) continue;
    // One-off completion remains unchanged; recurring Done waits for the advance.
    if (task.done === true && Array.isArray(task.recurrence) && task.recurrence.length > 0) continue;
    const next = parseNext(task.next, today, nowMillis);
    if (!next.future) leaves.push({ task, dateKey: next.dateKey });
  }
  const shown = leaves.sort((a, b) =>
    RANK[a.task.priority] - RANK[b.task.priority] ||
    b.dateKey.localeCompare(a.dateKey) ||
    (a.task.order || 0) - (b.task.order || 0)
  ).slice(0, 45);
  return [
    `Updated ${timeFormatter.format(now)}`,
    ...shown.map(({ task }) =>
      `${EMOJI[task.priority] || "⚪"} ${task.title.slice(0, 55)}`)
  ].join("\n");
}

function createWidgetFeed(db, { now = () => new Date(), logger = console } = {}) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    const token = process.env.WIDGET_TOKEN;
    if (!token) {
      logger.error("WIDGET_TOKEN is not configured");
      res.status(500).send("error");
      return;
    }
    if (req.query.token !== token) {
      res.status(403).send("forbidden");
      return;
    }
    try {
      const snap = await db.collection("tasks").get();
      const tasks = snap.docs.map(doc => doc.data());
      res.type("text/plain").send(buildWidgetText(tasks, now()));
    } catch (err) {
      logger.error(err);
      res.status(500).send("error");
    }
  };
}

module.exports = { buildWidgetText, createWidgetFeed };
