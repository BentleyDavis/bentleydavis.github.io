"use strict";

const functions = require("firebase-functions/v1");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { createWidgetFeed } = require("./feed");

const app = initializeApp();
const db = getFirestore(app, "apps");
const auth = getAuth(app);

exports.widgetFeed = functions
  .region("us-central1")
  .https.onRequest(createWidgetFeed(db, { auth }));
