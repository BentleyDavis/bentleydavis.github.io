"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { createWidgetFeed } = require("./feed");

const app = initializeApp();
const db = getFirestore(app, "apps");
const auth = getAuth(app);

exports.widgetFeed = onRequest({
  region: "us-central1",
}, createWidgetFeed(db, { auth }));
