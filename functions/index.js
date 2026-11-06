// widgetFeed — Cloud Function (1st gen) serving the phone widget's task list.
//
// GET https://us-central1-apps-5884f.cloudfunctions.net/widgetFeed?token=<WIDGET_TOKEN>
// Returns plain text for the widget, with leaf tasks ordered by priority.
// Waiting and future-dated tasks are excluded until their wait passes.
// Auth is the token in the URL: KWGT's wg() is GET-only and cannot send
// a header or a body, so the token lives in the URL by design. Rotate it
// by redeploying with a new WIDGET_TOKEN env var. The token is never
// stored in this repo.

const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { processTaskUpdate } = require("./recurrence-trigger");
const { createWidgetFeed } = require("./widget-feed/feed");

const app = initializeApp();
const db = getFirestore(app, "apps");

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
    throw err;
  }
});

exports.widgetFeed = functions
  .region("us-central1")
  .https.onRequest(createWidgetFeed(db));
