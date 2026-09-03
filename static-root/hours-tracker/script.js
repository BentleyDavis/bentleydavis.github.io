// Default monthly hours goal used the first time a data file is created.
const DEFAULT_MONTHLY_HOURS = 72;

const DATA_FILE_NAME = "hours-tracker-data.json";

let directoryHandle = null;
let fileHandle = null;
let pendingReconnectHandle = null;

let data = {
    defaultMonthlyHours: DEFAULT_MONTHLY_HOURS,
    monthlyHoursOverrides: {},
    nonWorkDates: [],
};

// Upgrades data saved by older versions of this page to the current shape.
function migrateData() {
    if (data.monthlyHours !== undefined) {
        data.defaultMonthlyHours = data.monthlyHours;
        delete data.monthlyHours;
    }
    if (!data.defaultMonthlyHours) data.defaultMonthlyHours = DEFAULT_MONTHLY_HOURS;
    if (!data.monthlyHoursOverrides) data.monthlyHoursOverrides = {};
    if (!data.nonWorkDates) data.nonWorkDates = [];
}

function monthKey(year, month) {
    return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function getMonthlyGoal(year, month) {
    const override = data.monthlyHoursOverrides[monthKey(year, month)];
    return override !== undefined ? override : data.defaultMonthlyHours;
}

async function setMonthlyGoal(year, month, value) {
    data.monthlyHoursOverrides[monthKey(year, month)] = value;
    render();
    await saveData();
}

function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function isBusinessDay(date, nonWorkDateSet) {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return false;
    return !nonWorkDateSet.has(toISODate(date));
}

// Counts business days in [year, month] from day 1 through endDay (inclusive).
function countBusinessDays(year, month, endDay) {
    const nonWorkDateSet = new Set(data.nonWorkDates);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lastDay = endDay === undefined ? daysInMonth : Math.min(endDay, daysInMonth);
    let count = 0;
    for (let d = 1; d <= lastDay; d++) {
        if (isBusinessDay(new Date(year, month, d), nonWorkDateSet)) count++;
    }
    return count;
}

function formatHours(hours) {
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const decimal = Math.round(hours * 100) / 100;
    return `${h}:${String(m).padStart(2, "0")} (${decimal} hrs)`;
}

function monthLabel(year, month) {
    return new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function render() {
    const today = new Date();
    const thisYear = today.getFullYear();
    const thisMonth = today.getMonth();

    const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
    const lastYear = lastMonthDate.getFullYear();
    const lastMonth = lastMonthDate.getMonth();

    document.getElementById("default-monthly-goal-input").value = data.defaultMonthlyHours;

    // This month
    const thisMonthGoal = getMonthlyGoal(thisYear, thisMonth);
    const thisMonthTotalDays = countBusinessDays(thisYear, thisMonth);
    const thisMonthElapsedDays = countBusinessDays(thisYear, thisMonth, today.getDate());
    const thisMonthRate = thisMonthTotalDays > 0 ? thisMonthGoal / thisMonthTotalDays : 0;
    const thisMonthTarget = thisMonthElapsedDays * thisMonthRate;

    document.getElementById("this-month-title").textContent = `This Month (${monthLabel(thisYear, thisMonth)})`;
    document.getElementById("this-month-total-days").textContent = thisMonthTotalDays;
    document.getElementById("this-month-elapsed-days").textContent = thisMonthElapsedDays;
    document.getElementById("this-month-rate").textContent = formatHours(thisMonthRate);
    document.getElementById("this-month-target").textContent = formatHours(thisMonthTarget);
    document.getElementById("this-month-goal-input").value = thisMonthGoal;
    renderNonWorkDaysForMonth(thisYear, thisMonth, "this-month-nonwork-list");

    // Last month
    const lastMonthGoal = getMonthlyGoal(lastYear, lastMonth);
    const lastMonthTotalDays = countBusinessDays(lastYear, lastMonth);
    const lastMonthRate = lastMonthTotalDays > 0 ? lastMonthGoal / lastMonthTotalDays : 0;

    document.getElementById("last-month-title").textContent = `Last Month (${monthLabel(lastYear, lastMonth)})`;
    document.getElementById("last-month-total-days").textContent = lastMonthTotalDays;
    document.getElementById("last-month-rate").textContent = formatHours(lastMonthRate);
    document.getElementById("last-month-goal-input").value = lastMonthGoal;
    renderNonWorkDaysForMonth(lastYear, lastMonth, "last-month-nonwork-list");
}

function renderNonWorkDaysForMonth(year, month, listElementId) {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    const days = data.nonWorkDates
        .filter((iso) => iso.startsWith(prefix))
        .map((iso) => parseInt(iso.slice(-2), 10))
        .sort((a, b) => a - b);

    const list = document.getElementById(listElementId);
    list.innerHTML = "";
    for (const day of days) {
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = day;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.textContent = "\u00d7";
        removeBtn.addEventListener("click", () => removeNonWorkDay(year, month, day));
        li.append(span, removeBtn);
        list.appendChild(li);
    }
}

async function addNonWorkDayRange(year, month, fromDay, toDay) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const start = Math.max(1, Math.min(fromDay, toDay));
    const end = Math.min(daysInMonth, Math.max(fromDay, toDay));
    for (let day = start; day <= end; day++) {
        const iso = toISODate(new Date(year, month, day));
        if (!data.nonWorkDates.includes(iso)) data.nonWorkDates.push(iso);
    }
    render();
    await saveData();
}

async function removeNonWorkDay(year, month, day) {
    const iso = toISODate(new Date(year, month, day));
    data.nonWorkDates = data.nonWorkDates.filter((d) => d !== iso);
    render();
    await saveData();
}

async function saveData() {
    if (!fileHandle) return;
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
}

const HANDLE_DB_NAME = "hours-tracker-db";
const HANDLE_STORE_NAME = "handles";
const HANDLE_KEY = "directoryHandle";

function openHandleDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(HANDLE_DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(HANDLE_STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function storeDirectoryHandle(handle) {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, "readwrite");
        tx.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function loadStoredDirectoryHandle() {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(HANDLE_STORE_NAME, "readonly");
        const request = tx.objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function connectToDirectory(handle) {
    directoryHandle = handle;
    fileHandle = await directoryHandle.getFileHandle(DATA_FILE_NAME, { create: true });

    const file = await fileHandle.getFile();
    if (file.size > 0) {
        const text = await file.text();
        data = JSON.parse(text);
        migrateData();
    } else {
        await saveData();
    }

    await storeDirectoryHandle(directoryHandle);
    document.getElementById("folder-status").textContent = `Connected to "${directoryHandle.name}". Changes are saved automatically.`;
    document.getElementById("choose-folder-btn").textContent = "Change Folder";
    render();
}

async function chooseFolder() {
    if (!window.showDirectoryPicker) {
        document.getElementById("folder-status").textContent =
            "The File System Access API isn't supported in this browser. Use Chrome or Edge.";
        return;
    }

    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await connectToDirectory(handle);
}

// On load, reconnect automatically if permission is still granted, otherwise
// offer a one-click reconnect (re-requesting permission needs a user gesture).
async function tryReconnect() {
    if (!window.indexedDB || !window.showDirectoryPicker) return;

    let handle;
    try {
        handle = await loadStoredDirectoryHandle();
    } catch (err) {
        console.error(err);
        return;
    }
    if (!handle) return;

    const permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission === "granted") {
        await connectToDirectory(handle);
        return;
    }

    const btn = document.getElementById("choose-folder-btn");
    btn.textContent = `Reconnect to "${handle.name}"`;
    document.getElementById("folder-status").textContent =
        `Previously connected to "${handle.name}". Click reconnect to grant access again.`;
    pendingReconnectHandle = handle;
}

function setupEventListeners() {
    document.getElementById("choose-folder-btn").addEventListener("click", async () => {
        try {
            if (pendingReconnectHandle) {
                const handle = pendingReconnectHandle;
                const permission = await handle.requestPermission({ mode: "readwrite" });
                if (permission === "granted") {
                    pendingReconnectHandle = null;
                    await connectToDirectory(handle);
                }
                return;
            }
            await chooseFolder();
        } catch (err) {
            if (err.name !== "AbortError") console.error(err);
        }
    });

    document.getElementById("default-monthly-goal-input").addEventListener("change", async (event) => {
        const value = parseInt(event.target.value, 10);
        data.defaultMonthlyHours = Number.isFinite(value) ? value : DEFAULT_MONTHLY_HOURS;
        render();
        await saveData();
    });

    document.getElementById("this-month-goal-input").addEventListener("change", async (event) => {
        const value = parseInt(event.target.value, 10);
        if (!Number.isFinite(value)) return;
        const today = new Date();
        await setMonthlyGoal(today.getFullYear(), today.getMonth(), value);
    });

    document.getElementById("last-month-goal-input").addEventListener("change", async (event) => {
        const value = parseInt(event.target.value, 10);
        if (!Number.isFinite(value)) return;
        const lastMonthDate = new Date();
        lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
        await setMonthlyGoal(lastMonthDate.getFullYear(), lastMonthDate.getMonth(), value);
    });

    setupNonWorkForm("this-month-nonwork-form", "this-month-nonwork-from", "this-month-nonwork-to", () => {
        const today = new Date();
        return [today.getFullYear(), today.getMonth()];
    });

    setupNonWorkForm("last-month-nonwork-form", "last-month-nonwork-from", "last-month-nonwork-to", () => {
        const lastMonthDate = new Date();
        lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
        return [lastMonthDate.getFullYear(), lastMonthDate.getMonth()];
    });
}

function setupNonWorkForm(formId, fromId, toId, getYearMonth) {
    document.getElementById(formId).addEventListener("submit", async (event) => {
        event.preventDefault();
        const fromInput = document.getElementById(fromId);
        const toInput = document.getElementById(toId);
        const fromDay = parseInt(fromInput.value, 10);
        const toDay = toInput.value ? parseInt(toInput.value, 10) : fromDay;
        if (!Number.isFinite(fromDay)) return;
        const [year, month] = getYearMonth();
        fromInput.value = "";
        toInput.value = "";
        await addNonWorkDayRange(year, month, fromDay, toDay);
    });
}

setupEventListeners();
render();
tryReconnect().catch((err) => console.error(err));
