"use strict";

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { createWidgetFeed } = require("./feed");

admin.initializeApp();
const db = getFirestore(admin.app(), "apps");

exports.widgetFeed = functions
  .region("us-central1")
  .https.onRequest(createWidgetFeed(db));
