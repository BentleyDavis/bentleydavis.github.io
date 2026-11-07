// widgetFeed — Cloud Function (2nd gen, public invoker) serving the phone widget's task list.
//
// GET <widgetFeed URL from the deploy output>?token=<WIDGET_TOKEN>
// Returns plain text for the widget, with leaf tasks ordered by priority.
// Waiting and future-dated tasks are excluded until their wait passes.
// Auth is the token in the URL: KWGT's wg() is GET-only and cannot send
// a header or a body, so the token lives in the URL by design. Rotate it
// by redeploying with a new WIDGET_TOKEN env var. The token is never
// stored in this repo.

const { onRequest } = require("firebase-functions/v2/https");
const { onUserCreated } = require("firebase-functions/v2/identity");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { processTaskUpdate } = require("./recurrence-trigger");
const { createWidgetFeed } = require("./widget-feed/feed");

const app = initializeApp();
const db = getFirestore(app, "apps");

exports.museOAuth = require("./oauth")(db);

exports.registerUser = onUserCreated({
  region: "us-central1",
  retry: true,
}, (event) =>
  db.collection("users").doc(event.data.uid).set({
    email: event.data.email || null,
    name: event.data.displayName || null,
  }, { merge: true })
);

exports.advanceRecurringTask = onDocumentUpdated({
  document: "tasks/{taskId}",
  database: "apps",
  region: "us-central1",
  retry: true,
}, async (event) => {
  if (!event.data) return;
  try {
    await processTaskUpdate({
      db,
      ref: event.data.after.ref,
      before: event.data.before.data(),
      after: event.data.after.data(),
      now: event.data.after.updateTime.toDate().toISOString(),
    });
  } catch (err) {
    logger.error("Could not advance recurring task", {
      taskId: event.params.taskId,
      error: err,
    });
    // Data errors (bad recurrence shape, missing next) fail identically
    // on every retry: record them on the task so they are visible, and
    // do not retry. Anything else is transient and still throws.
    if (err instanceof TypeError || err instanceof RangeError) {
      await db.collection("tasks").doc(event.params.taskId).update({
        advanceError: {
          message: err.message,
          at: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
        updatedBy: "recurrence",
      });
      return;
    }
    throw err;
  }
});

exports.widgetFeed = onRequest({
  region: "us-central1",
  invoker: "public",
}, createWidgetFeed(db));
