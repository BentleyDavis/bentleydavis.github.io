// Cloud Functions for the Task App (project apps-5884f).
//
// widgetFeed is NOT exported here: it is deployed from functions/widget-feed/,
// whose handler verifies a Firebase ID token (Bearer) and still accepts the
// legacy ?token= during transition. The no-auth variant that used to be
// exported from this file must not be deployed.

const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { processTaskUpdate } = require("./recurrence-trigger");

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

