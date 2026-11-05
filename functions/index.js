// widgetFeed — Cloud Function (1st gen) serving the phone widget's task list.
//
// GET https://us-central1-apps-5884f.cloudfunctions.net/widgetFeed?token=<WIDGET_TOKEN>
// Returns the same filtered list as the morning recap: leaf tasks needing
// attention, P1s listed individually, P2/P3/P4 as counts. Waiting and
// future-dated tasks are excluded until their wait passes.
// Auth is the token in the URL: KWGT's wg() is GET-only and cannot send
// a header or a body, so the token lives in the URL by design. Rotate it
// by redeploying with a new WIDGET_TOKEN env var. The token is never
// stored in this repo.

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

admin.initializeApp();
const db = getFirestore(admin.app(), "apps");

exports.museOAuth = require("./oauth")(db);

exports.registerUser = functions
  .region("us-central1")
  .runWith({ failurePolicy: true })
  .auth.user()
  .onCreate((user) =>
    db.collection("users").doc(user.uid).set({
      email: user.email || null,
      name: user.displayName || null,
    }, { merge: true })
  );

// Today's date in the user's timezone — a task whose `next` is a date
// after today is waiting and stays out of the list until then.
function todayChicago() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
}

function isFutureDate(next, today) {
  if (typeof next !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return false; // places like "Belterra" are not dates
  return next > today;
}

exports.widgetFeed = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    // Nothing between the function and the phone may cache this:
    // the widget polls the same URL on its own interval and must get
    // fresh data every time, not a stale copy.
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    if (req.query.token !== process.env.WIDGET_TOKEN) {
      res.status(403).send("forbidden");
      return;
    }
    try {
      const snap = await db.collection("tasks").get();
      const tasks = snap.docs.map((d) => d.data());
      const parentIds = new Set(
        tasks.filter((t) => t.parentId).map((t) => t.parentId)
      );
      const today = todayChicago();
      const leaves = tasks.filter(
        (t) => !parentIds.has(t.id) && !isFutureDate(t.next, today)
      );
      const byPriority = (p) =>
        leaves
          .filter((t) => t.priority === p)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
      const p1 = byPriority("p1").map((t) => ({
        id: t.id,
        title: t.title,
        next: t.next || "",
        status: t.status || "",
      }));
      const counts = {
        p1: p1.length,
        p2: byPriority("p2").length,
        p3: byPriority("p3").length,
        p4: byPriority("p4").length,
      };
      // The widget does as little as possible: the whole display text is
      // built here, in the old app's format — a timestamp line from the
      // function at the top, then every leaf task on its own line with
      // its priority dot at the front, titles cut to 55 chars. All
      // priorities are listed (no counts line); only future/waiting
      // tasks stay out. The KWGT formula is a single wg() call reading
      // `.text`.
      const EMOJI = { p1: "🔴", p2: "🟠", p3: "🔵", p4: "⚪" };
      const RANK = { p1: 1, p2: 2, p3: 3, p4: 4 };
      const dateKey = (next) =>
        typeof next === "string" && /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : "";
      const shown = leaves
        .slice()
        .sort(
          (a, b) =>
            RANK[a.priority] - RANK[b.priority] ||
            dateKey(b.next).localeCompare(dateKey(a.next)) ||
            (a.order || 0) - (b.order || 0)
        )
        .slice(0, 45);
      const stamp = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date());
      const text = [
        `Updated ${stamp}`,
        ...shown.map((t) => `${EMOJI[t.priority] || "⚪"} ${t.title.slice(0, 55)}`),
      ].join("\n");
      res.json({
        generatedAt: new Date().toISOString(),
        p1,
        counts,
        text,
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("error");
    }
  });
