import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, runTransaction, updateDoc, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBz7SUuyhiNKtCUWetJ051xFdqzc5l4NKE",
  authDomain: "apps-5884f.firebaseapp.com",
  projectId: "apps-5884f",
  storageBucket: "apps-5884f.firebasestorage.app",
  messagingSenderId: "802105454064",
  appId: "1:802105454064:web:2cc2ffc812f30a27cb0135"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, "apps"); // named database — getFirestore(app) alone uses the (default) database, which is empty
const tasksCol = collection(db, "tasks");

const PRIORITIES = ["p1", "p2", "p3", "p4"];
const PRIORITY_LABEL = { p1: "P1", p2: "P2", p3: "P3", p4: "P4" };
const TYPES = ["Personal", "Bentley", "Mom", "CRT", "Health"];
const SOURCES = ["todoist", "muse"];

let tasks = [];
let uid = null;
let unsubscribe = null;
let writing = false;
let dragMode = false;
let dragState = null; // { id, startY, moved, beforeId }
let editingId = null;

const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const saveStatusEl = document.getElementById("save-status");
const appEl = document.getElementById("app");
const overlayEl = document.getElementById("editor-overlay");
const editorFieldsEl = document.getElementById("editor-fields");
const modeToggleEl = document.getElementById("mode-toggle");
const addTaskBtn = document.getElementById("add-task");

function setStatus(msg) { statusEl.textContent = msg; }

function setSaveStatus(state, message) {
  saveStatusEl.dataset.state = state;
  saveStatusEl.textContent = message;
}

function reportError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

async function runAction(label, action) {
  reportError("");
  try {
    await action();
  } catch (err) {
    reportError(`${label}: ${err.message}`);
  }
}

async function writeTasks(action) {
  if (writing) throw new Error("Another change is still saving. Please try again.");
  if (!uid) throw new Error("Sign in before editing tasks.");
  writing = true;
  const savingUid = uid;
  setSaveStatus("saving", "Saving…");
  try {
    await action();
    if (uid === savingUid) setSaveStatus("saved", "Saved");
  } catch (err) {
    if (uid === savingUid) setSaveStatus("failed", "Save failed");
    throw err;
  } finally {
    writing = false;
  }
}

function sortedTasks() {
  return [...tasks].sort((a, b) =>
    a.priority.localeCompare(b.priority) || (a.order - b.order) || Number(a.id) - Number(b.id));
}

function render() {
  appEl.replaceChildren();
  const counts = {};
  for (const t of tasks) counts[t.priority] = (counts[t.priority] || 0) + 1;
  setStatus(`${tasks.length} tasks — P1 ${counts.p1 || 0} · P2 ${counts.p2 || 0} · P3 ${counts.p3 || 0} · P4 ${counts.p4 || 0}.`);
  const tasksById = new Map(tasks.map(t => [t.id, t]));
  for (const t of sortedTasks()) {
    appEl.appendChild(cardEl(t, tasksById.get(t.parentId)));
  }
}

function metaItem(text, cls) {
  const el = document.createElement("span");
  el.className = "meta-item" + (cls ? " " + cls : "");
  el.textContent = text;
  return el;
}

function isOverdue(value) {
  if (typeof value !== "string" || !value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return value < today;
  }
  const t = Date.parse(value);
  return !isNaN(t) && t < Date.now();
}

function formatShortDate(value) {
  if (typeof value !== "string") return value;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return value;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(date);
  const thisYear = new Date().getFullYear() === +y;
  let out = `${month} ${+d}${thisYear ? "" : ", " + y}`;
  if (h !== undefined) {
    let hour = +h;
    const ampm = hour >= 12 ? "PM" : "AM";
    hour = hour % 12 || 12;
    out += ` ${hour}:${mi} ${ampm}`;
  }
  return out;
}

function cardEl(t, parent) {
  const card = document.createElement("div");
  card.className = "card" + (t.done ? " done" : "");
  card.dataset.id = t.id;

  const circle = document.createElement("button");
  circle.type = "button";
  circle.className = `circle ${t.priority}` + (t.done ? " done" : "");
  circle.setAttribute("aria-label", t.done ? "Mark not done" : "Mark done");
  circle.addEventListener("click", e => {
    e.stopPropagation();
    runAction("Could not save Done", () => saveField(t.id, "done", t.done !== true));
  });
  card.appendChild(circle);

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = t.title;
  title.addEventListener("pointerdown", e => onTitlePointerDown(e, t));
  title.addEventListener("pointermove", onTitlePointerMove);
  title.addEventListener("pointerup", onTitlePointerUp);
  title.addEventListener("pointercancel", onTitlePointerUp);
  card.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "card-meta";
  if (t.parentId) {
    meta.appendChild(metaItem(parent ? parent.title : `#${t.parentId}`, "meta-parent"));
  }
  if (t.next) {
    meta.appendChild(metaItem(`📅 ${formatShortDate(t.next)}`, "meta-next" + (isOverdue(t.next) ? " overdue" : "")));
  }
  if (t.recurrence?.length) {
    meta.appendChild(metaItem(`🔁 ${recurrenceSummary(t.recurrence)}`));
  }
  if (t.advanceError?.message) {
    meta.appendChild(metaItem(`⚠ Advance failed: ${t.advanceError.message}`, "meta-error"));
  }
  if (t.type) {
    meta.appendChild(metaItem(`🏷️ ${t.type}`));
  }
  if (t.status) {
    meta.appendChild(metaItem(t.status));
  }
  if (t.lastCompletion?.previousNext) {
    const note = document.createElement("span");
    note.className = "completion";
    const text = document.createElement("span");
    text.textContent = `Done — next: ${formatOccurrence(t.next)}`;
    note.appendChild(text);
    const undo = document.createElement("button");
    undo.type = "button";
    undo.textContent = "Undo";
    undo.addEventListener("click", e => {
      e.stopPropagation();
      runAction("Could not undo completion", () => undoCompletion(t));
    });
    note.appendChild(undo);
    meta.appendChild(note);
  }
  card.appendChild(meta);

  card.addEventListener("click", e => {
    if (dragMode) return;
    if (e.target.closest("button")) return;
    openEditor(t);
  });
  return card;
}

// ---- Drag to reorder (pointer events; only when drag mode is on) ----

function onTitlePointerDown(e, task) {
  if (!dragMode) return;
  e.preventDefault();
  dragState = { id: task.id, startY: e.clientY, moved: false, beforeId: null };
  e.target.setPointerCapture(e.pointerId);
}

function onTitlePointerMove(e) {
  if (!dragState) return;
  if (Math.abs(e.clientY - dragState.startY) <= 8 && !dragState.moved) return;
  if (!dragState.moved) {
    dragState.moved = true;
    document.querySelector(`.card[data-id="${dragState.id}"]`)?.classList.add("dragging");
  }
  // Auto-scroll near the viewport edges while dragging.
  if (e.clientY < 70) window.scrollBy(0, -8);
  else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 8);
  const target = cardAtY(e.clientY);
  document.querySelectorAll(".card.drop-before").forEach(c => c.classList.remove("drop-before"));
  if (target) {
    target.classList.add("drop-before");
    dragState.beforeId = target.dataset.id;
  } else {
    dragState.beforeId = null; // end of the list
  }
}

function cardAtY(y) {
  const cards = [...appEl.querySelectorAll(".card")].filter(c => c.dataset.id !== dragState.id);
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return card;
  }
  return null;
}

function onTitlePointerUp() {
  if (!dragState) return;
  const { id, moved, beforeId } = dragState;
  dragState = null;
  document.querySelectorAll(".card.dragging, .card.drop-before")
    .forEach(c => c.classList.remove("dragging", "drop-before"));
  if (!moved) return;
  if (beforeId === id) return;
  runAction("Could not reorder task", () => reorderTask(id, beforeId));
}

async function reorderTask(draggedId, beforeId) {
  const dragged = tasks.find(t => t.id === draggedId);
  if (!dragged) throw new Error("This task no longer exists.");
  const flat = sortedTasks().filter(t => t.id !== draggedId);
  const idx = beforeId ? flat.findIndex(t => t.id === beforeId) : flat.length;
  if (idx < 0) throw new Error("The drop target no longer exists.");
  // The dropped task takes the priority of the task it lands before,
  // or the last task's priority when dropped at the end.
  const newPriority = idx < flat.length
    ? flat[idx].priority
    : (flat.length ? flat[flat.length - 1].priority : dragged.priority);
  const newList = [...flat.slice(0, idx), dragged, ...flat.slice(idx)];
  const group = newList.filter(t => t.priority === newPriority);
  await writeTasks(async () => {
    const batch = writeBatch(db);
    const now = new Date().toISOString();
    group.forEach((t, i) => {
      const order = (i + 1) * 1000;
      if (t.order !== order || t.priority !== newPriority) {
        batch.update(doc(tasksCol, t.docId), { order, priority: newPriority, updatedAt: now, updatedBy: uid });
      }
    });
    await batch.commit();
  });
}

// ---- Editor overlay ----

function openEditor(task) {
  editingId = task.id;
  editorFieldsEl.replaceChildren();
  const t = tasks.find(x => x.id === task.id) || task;

  editorFieldsEl.appendChild(fieldRow("Title", textInput(t.title, v => saveField(t.id, "title", v))));

  const prioritySel = document.createElement("select");
  for (const p of PRIORITIES) prioritySel.add(new Option(PRIORITY_LABEL[p], p));
  prioritySel.value = t.priority;
  prioritySel.addEventListener("change", () => runAction("Could not save Priority", () => saveField(t.id, "priority", prioritySel.value)));
  editorFieldsEl.appendChild(fieldRow("Priority", prioritySel));

  const typeSel = document.createElement("select");
  for (const value of TYPES) typeSel.add(new Option(value, value));
  typeSel.value = t.type || "Personal";
  typeSel.addEventListener("change", () => runAction("Could not save Type", () => saveField(t.id, "type", typeSel.value)));
  editorFieldsEl.appendChild(fieldRow("Type", typeSel));

  const sourceSel = document.createElement("select");
  for (const value of SOURCES) sourceSel.add(new Option(value, value));
  sourceSel.value = t.source || "muse";
  sourceSel.addEventListener("change", () => runAction("Could not save Source", () => saveField(t.id, "source", sourceSel.value)));
  editorFieldsEl.appendChild(fieldRow("Source", sourceSel));

  const nextInput = document.createElement("input");
  nextInput.value = t.next || "";
  nextInput.placeholder = "YYYY-MM-DD or YYYY-MM-DDTHH:MM";
  nextInput.addEventListener("change", () => {
    const v = nextInput.value.trim();
    if (v && !isNextValue(v)) {
      reportError("Next must be a date (YYYY-MM-DD) or a date and time (YYYY-MM-DDTHH:MM).");
      nextInput.value = t.next || "";
      return;
    }
    runAction("Could not save Next", () => saveField(t.id, "next", v));
  });
  editorFieldsEl.appendChild(fieldRow("Next", nextInput));

  editorFieldsEl.appendChild(fieldRow("Status / next step", textInput(t.status || "", v => saveField(t.id, "status", v))));
  editorFieldsEl.appendChild(fieldRow("AI Action", textInput(t.aiAction || "", v => saveField(t.id, "aiAction", v))));

  const doneRow = document.createElement("div");
  doneRow.className = "field-row";
  const doneCheck = document.createElement("input");
  doneCheck.type = "checkbox";
  doneCheck.checked = t.done === true;
  doneCheck.addEventListener("change", () => runAction("Could not save Done", () => saveField(t.id, "done", doneCheck.checked)));
  doneRow.appendChild(doneCheck);
  const doneLabel = document.createElement("span");
  doneLabel.textContent = "Done";
  doneRow.appendChild(doneLabel);
  const doneWrap = document.createElement("label");
  doneWrap.textContent = "";
  doneWrap.appendChild(doneRow);
  editorFieldsEl.appendChild(doneWrap);

  // Recurrence editor (same JSON patterns + repeat-from as before).
  const recLabel = document.createElement("label");
  recLabel.textContent = "Repeat patterns (JSON)";
  const rules = document.createElement("textarea");
  rules.value = JSON.stringify(t.recurrence || [], null, 2);
  recLabel.appendChild(rules);
  editorFieldsEl.appendChild(recLabel);
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Repeat from";
  const mode = document.createElement("select");
  for (const value of ["schedule", "completion"]) mode.add(new Option(value, value));
  mode.value = t.repeatFrom || "schedule";
  modeLabel.appendChild(mode);
  editorFieldsEl.appendChild(modeLabel);
  const saveRec = document.createElement("button");
  saveRec.type = "button";
  saveRec.textContent = "Save recurrence";
  saveRec.addEventListener("click", () => runAction("Could not save recurrence", () =>
    saveRecurrence(t.id, rules.value, mode.value)));
  editorFieldsEl.appendChild(saveRec);

  overlayEl.hidden = false;
}

function fieldRow(label, control) {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  wrap.appendChild(control);
  return wrap;
}

function textInput(value, onChange) {
  const el = document.createElement("input");
  el.value = value || "";
  el.addEventListener("change", () => onChange(el.value));
  return el;
}

function closeEditor() {
  overlayEl.hidden = true;
  editingId = null;
}

document.getElementById("editor-close").addEventListener("click", closeEditor);
overlayEl.addEventListener("click", e => { if (e.target === overlayEl) closeEditor(); });

// ---- Bottom menu ----

modeToggleEl.addEventListener("click", () => {
  dragMode = !dragMode;
  modeToggleEl.setAttribute("aria-pressed", String(dragMode));
  modeToggleEl.textContent = dragMode ? "Drag: on" : "Drag: off";
  appEl.classList.toggle("drag-mode", dragMode);
});

addTaskBtn.addEventListener("click", () => runAction("Could not add task", async () => {
  const id = await addTask();
  const created = tasks.find(t => t.id === id);
  if (created) openEditor(created);
}));

// ---- Data ----

// Next holds dates and datetimes only. A date is YYYY-MM-DD; a datetime
// is YYYY-MM-DDTHH:MM with optional seconds and offset.
function isNextValue(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ||
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:?\d{2}|Z)?$/.test(v);
}

function recurrenceSummary(recurrence) {
  return recurrence.map(pattern => {
    let rule;
    if (pattern.type === "daily") {
      rule = "every day";
    } else if (pattern.type === "weekly") {
      rule = `every ${pattern.weekday}`;
    } else if (pattern.type === "monthly" && pattern.weekday) {
      const ordinal = pattern.ordinal === -1
        ? "last"
        : `${pattern.ordinal}${pattern.ordinal === 1 ? "st" : pattern.ordinal === 2 ? "nd" : pattern.ordinal === 3 ? "rd" : "th"}`;
      rule = `every ${ordinal} ${pattern.weekday}`;
    } else if (pattern.type === "monthly") {
      rule = `every month on day ${pattern.day}`;
    } else if (pattern.type === "annual" && pattern.weekday) {
      const ordinal = pattern.ordinal === -1
        ? "last"
        : `${pattern.ordinal}${pattern.ordinal === 1 ? "st" : pattern.ordinal === 2 ? "nd" : pattern.ordinal === 3 ? "rd" : "th"}`;
      rule = `every ${ordinal} ${pattern.weekday} in ${monthName(pattern.month)}`;
    } else if (pattern.type === "annual") {
      rule = `every ${monthName(pattern.month)} ${pattern.day}`;
    } else if (pattern.type === "interval") {
      rule = `every ${pattern.value} ${pattern.unit}`;
      if (pattern.weekday) rule += ` on ${pattern.weekday}`;
    } else {
      rule = "invalid recurrence";
    }
    if (pattern.time) rule += ` at ${pattern.time}`;
    if (pattern.offsets?.length) rule += ` (${pattern.offsets.join(", ")})`;
    return rule;
  }).join("; ");
}

function monthName(month) {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(2020, month - 1, 1)));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function formatOccurrence(value) {
  if (typeof value !== "string") return "unknown";
  const date = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!date) return value;
  const parsedDate = new Date(`${date[1]}T12:00:00Z`);
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
  }).format(parsedDate);
  const time = value.match(/T(\d{2}:\d{2})/);
  return time ? `${formattedDate} at ${time[1]}` : formattedDate;
}

async function saveField(id, field, value) {
  if (field === "title" && !String(value).trim()) throw new Error("Task title cannot be empty.");
  const task = tasks.find(t => t.id === id);
  if (!task) throw new Error("This task no longer exists.");
  if ((task[field] ?? (field === "done" ? false : "")) === value) return;
  const patch = {
    [field]: value,
    updatedAt: new Date().toISOString(),
    updatedBy: uid
  };
  if (field === "priority") {
    // Moving to a new priority appends at the end of that priority.
    const maxOrder = Math.max(0, ...tasks.filter(t => t.priority === value && t.id !== id).map(t => t.order || 0));
    patch.order = maxOrder + 1000;
  }
  if (field === "done" && task.recurrence?.length) {
    if (value && (typeof task.next !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(task.next))) {
      throw new Error("Recurring tasks need a date or datetime before they can be completed.");
    }
    patch.completedFor = value ? task.next : null;
  }
  await writeTasks(() => updateDoc(doc(tasksCol, task.docId), patch));
}

async function saveRecurrence(id, rulesText, repeatFrom) {
  const task = tasks.find(t => t.id === id);
  if (!task) throw new Error("This task no longer exists.");
  let recurrence;
  try {
    recurrence = JSON.parse(rulesText);
  } catch (err) {
    throw new Error(`Patterns must be valid JSON: ${err.message}`);
  }
  if (!Array.isArray(recurrence)) throw new Error("Patterns must be a JSON array.");
  if (repeatFrom === "completion" &&
      recurrence.some(pattern => pattern.type !== "interval")) {
    throw new Error('Repeat from "completion" is only valid for interval patterns.');
  }

  const oldRules = stableStringify(task.recurrence || []);
  const newRules = stableStringify(recurrence);
  if (oldRules !== newRules && recurrence.some(pattern => pattern.type === "interval")) {
    if (typeof task.next !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(task.next)) {
      throw new Error("Recurring tasks need a date or datetime before editing an interval pattern.");
    }
    const startDate = task.next.slice(0, 10);
    recurrence = recurrence.map((pattern, index) => {
      if (pattern.type !== "interval") return pattern;
      const oldPattern = task.recurrence?.[index];
      const withoutStart = ({ start, ...rest }) => stableStringify(rest);
      if (!oldPattern) {
        return pattern.start ? pattern : { ...pattern, start: startDate };
      }
      if (withoutStart(oldPattern) !== withoutStart(pattern)) {
        return { ...pattern, start: startDate };
      }
      return pattern;
    });
  }
  await writeTasks(() => updateDoc(doc(tasksCol, task.docId), {
    recurrence,
    repeatFrom,
    updatedAt: new Date().toISOString(),
    updatedBy: uid
  }));
}

async function undoCompletion(task) {
  const completion = task.lastCompletion;
  if (!completion?.previousNext) throw new Error("This completion can no longer be undone.");
  await writeTasks(() => runTransaction(db, async transaction => {
    const ref = doc(tasksCol, task.docId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("This task no longer exists.");
    const current = snapshot.data();
    if (current.next !== task.next || current.lastCompletion?.at !== completion.at ||
        current.lastCompletion?.previousNext !== completion.previousNext) {
      throw new Error("This task changed after the completion. Refresh and try again.");
    }
    transaction.update(ref, {
      next: completion.previousNext,
      lastCompletion: deleteField(),
      updatedAt: new Date().toISOString(),
      updatedBy: uid
    });
  }));
}

async function addTask() {
  let newId = null;
  await writeTasks(async () => {
    const maxId = tasks.reduce((m, t) => Math.max(m, Number(t.id)), 0);
    const maxOrder = Math.max(0, ...tasks.filter(t => t.priority === "p2").map(t => t.order || 0));
    const updatedBy = uid;
    await runTransaction(db, async transaction => {
      let nextId = maxId + 1;
      let ref;
      // Reading the candidate inside the transaction prevents concurrent creates from overwriting it.
      while (true) {
        if (!Number.isSafeInteger(nextId)) throw new Error("Cannot allocate a numeric task ID.");
        ref = doc(tasksCol, String(nextId));
        if (!(await transaction.get(ref)).exists()) break;
        nextId++;
      }
      newId = String(nextId);
      const now = new Date().toISOString();
      transaction.set(ref, { id: newId, title: "New task", parentId: null, type: "Personal", source: "muse", sourceId: null, next: "", status: "", aiAction: "", priority: "p2", order: maxOrder + 1000, createdAt: now, updatedAt: now, updatedBy });
    });
  });
  return newId;
}

// ---- Auth ----

document.getElementById("googleBtn").addEventListener("click", () => runAction("Google sign-in failed", async () => {
  setStatus("Signing in with Google…");
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err.code === "auth/operation-not-allowed") {
      throw new Error("Google sign-in isn't enabled for this project yet. Enable it in Firebase Authentication and try again.");
    }
    throw err;
  }
}));
document.getElementById("signin").addEventListener("submit", e => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  return runAction("Sign-in failed", async () => {
    setStatus("Signing in…");
    await signInWithEmailAndPassword(auth, email, password);
    document.getElementById("password").value = "";
  });
});
document.getElementById("signoutBtn").addEventListener("click", () => runAction("Sign-out failed", () => signOut(auth)));

onAuthStateChanged(auth, user => {
  unsubscribe?.();
  unsubscribe = null;
  tasks = [];
  appEl.replaceChildren();
  appEl.hidden = true;
  reportError("");
  setSaveStatus("", "");
  const who = document.getElementById("who");
  const signin = document.getElementById("signin");
  const signoutBtn = document.getElementById("signoutBtn");
  if (user) {
    uid = user.uid;
    who.textContent = "Signed in as " + (user.email || user.uid) + " ";
    signin.hidden = true;
    signoutBtn.hidden = false;
    setStatus("Loading tasks…");
    unsubscribe = onSnapshot(tasksCol, { includeMetadataChanges: true }, snapshot => {
      if (uid !== user.uid || snapshot.metadata.hasPendingWrites) return;
      tasks = snapshot.docs.map(d => ({ ...d.data(), docId: d.id }));
      appEl.hidden = false;
      render();
    }, err => {
      if (uid !== user.uid) return;
      appEl.hidden = true;
      setStatus("Tasks are unavailable.");
      reportError("Could not load tasks: " + err.message);
    });
  } else {
    uid = null;
    who.textContent = "";
    signin.hidden = false;
    signoutBtn.hidden = true;
    appEl.hidden = true;
    setStatus("Sign in to edit tasks.");
  }
});
