"use strict";

const { advanceTask } = require("./advance-task");

async function processTaskUpdate({ db, ref, before, after, now }) {
  if (before.done === true || after.done !== true ||
      !Array.isArray(after.recurrence) || after.recurrence.length === 0) {
    return false;
  }

  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return false;
    const current = snapshot.data();
    if (current.done !== true || current.next !== after.next) return false;

    const patch = advanceTask(current, { now, by: after.updatedBy });
    if (!patch) return false;
    transaction.update(ref, patch);
    return true;
  });
}

module.exports = { processTaskUpdate };
