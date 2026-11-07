"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createWidgetFeed } = require("./feed");

test("widget feed accepts a Firebase ID token for an approved member", async () => {
  const previousToken = process.env.WIDGET_TOKEN;
  delete process.env.WIDGET_TOKEN;

  const calls = [];
  const db = {
    collection(name) {
      calls.push(name);
      if (name === "access") {
        return { doc: uid => ({ get: async () => ({ exists: uid === "member-1" }) }) };
      }
      return { get: async () => ({ docs: [] }) };
    },
  };
  const auth = {
    verifyIdToken: async token => {
      assert.equal(token, "firebase-id-token");
      return { uid: "member-1" };
    },
  };
  const response = {
    headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    type(value) { this.contentType = value; return this; },
    status(value) { this.statusCode = value; return this; },
    send(value) { this.body = value; return this; },
  };

  try {
    await createWidgetFeed(db, { auth })({
      headers: { authorization: "Bearer firebase-id-token" },
      query: {},
    }, response);
  } finally {
    if (previousToken === undefined) delete process.env.WIDGET_TOKEN;
    else process.env.WIDGET_TOKEN = previousToken;
  }

  assert.deepEqual(calls, ["access", "tasks"]);
  assert.equal(response.statusCode, undefined);
  assert.equal(response.contentType, "text/plain");
  assert.match(response.body, /^Updated /);
});
