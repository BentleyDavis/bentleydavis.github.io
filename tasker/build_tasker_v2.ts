/**
 * Build the redesigned Tasks Widget Tasker project (v2.0).
 *
 * TypeScript port of build_tasker_v2.py. Run with Node 24, no build step:
 *   node build_tasker_v2.ts
 * (Node 24 strips types natively; this file uses only erasable syntax.)
 *
 * Single-file project with Firebase login + Firestore queue.
 *
 * Reads the Firebase web API key from the Task App config
 * (~/workspace/bentleydavis-apps/static-root/apps/tasks/app.js) and embeds it
 * in the sign-in / token-refresh URLs. The key is a public client identifier
 * already in the app's client code. It is never printed.
 *
 * Writes:
 *   - Tasks_Widget.prj.xml  (project: 2 profiles + 4 tasks)
 *
 * Calling contract — how the widget calls the feed function:
 *   - Endpoint: https://us-central1-apps-5884f.cloudfunctions.net/widgetFeed
 *   - Auth: Authorization header with a Bearer Firebase ID token for a
 *     member account (tasker@eexpression.com). The token is refreshed via
 *     securetoken.googleapis.com when older than 55 minutes; a 401 means
 *     refresh the token and retry.
 *   - No URL token: the ?token= path is legacy and nothing sends it.
 *   - Response: plain text, one line per task; 200 on success.
 *
 * The output must stay byte-identical to the Python version (same XML
 * serializer semantics: tab indent, self-closing empty elements, ElementTree
 * escaping). Verify after any change by rebuilding and diffing against the
 * previous file with the cdate/edate timestamps normalised.
 *
 * Action codes verified against:
 *   - The existing Tasks_Widget.prj.xml template (HTTP Request 339, If 37,
 *     End If 38, Flash 548, Stop 137, Variable Set 547,
 *     Widget v2 461, Time profile rep 2 = minutes).
 *   - The hermes-tasker official action catalog (Tasker 6.7.6-beta), data
 *     extracted to /tmp/tasker_actions.json: Variable Query 595,
 *     JavaScriptlet 129, Notify 523, Perform Task 130, Open File 102,
 *     Variable Clear 549, Variable Split 590.
 *   - Condition operator codes (jitumaatgit tasker-automation skill, confirmed
 *     against the template op 9 and the mcp_server.prj.xml op 12):
 *     0=eq 1=ne 2=Matches 3=!Match 4=~R 5=!~R 6=< 7=> 8=== 9=!= 10=Even
 *     11=Odd 12=Set 13=NotSet. Ops 6-11 numeric only; 0-3 for strings.
 *   - A real exported HTTP Request POST (dceluis/tasker-mcp
 *     dist/mcp_server.prj.xml): Method arg1 = 1 for POST (0 = GET), Headers
 *     arg3 "key:value" lines, Body arg5.
 *   - The hermes-tasker project-xml-contract.md (Profile/Project/Task order,
 *     pids/tids) and a real exported Event profile (mcp_server.prj.xml:
 *     Profile flags 8, Event with <code>, <pri>0</pri>, args).
 *   - The official Tasker tour page: tapping a Tasker notification fires a
 *     "Notification Click" event (event code 2000, catalog).
 *
 * Flagged for phone verification (see final report):
 *   - Variable Query Input Type: 129 was WRONG (guessed from Android's
 *     InputType constants). Tasker 6.4 uses a 0-7 index; 129 crashed Setup
 *     with ArrayIndexOutOfBoundsException (length=8; index=129) on 2026-11-06.
 *     Set to 0 = default plain text. Password is visible while typing; to
 *     mask it, change Input Type to Pass Code in the action on the phone.
 *     Do NOT guess another index — the Pass Code index was never verified.
 *   - Notification Click profile flags (8) and the empty Owner Application
 *     arg. If tapping the update notification does not run Install, this
 *     profile needs correcting.
 *   - JavaScriptlet setLocal propagation (standard pattern; a 6.7.6-beta-only
 *     report claims it fails there, but the project targets Tasker 6.4).
 */
import * as fs from "node:fs";

const OUT_DIR = "/home/hatch/workspace/tasker";
const APP_JS = "/home/hatch/workspace/bentleydavis-apps/static-root/apps/tasks/app.js";

// --- Firebase web API key (public client identifier; never printed) ---------
const appJs = fs.readFileSync(APP_JS, "utf-8");
const keyMatch = /apiKey:\s*"([^"]+)"/.exec(appJs);
if (!keyMatch) throw new Error("Firebase apiKey not found in app.js");
const API_KEY = keyMatch[1];
if (!API_KEY.startsWith("AIza") || API_KEY.length !== 39) {
  throw new Error("unexpected apiKey shape");
}

const FEED_URL = "https://us-central1-apps-5884f.cloudfunctions.net/widgetFeed";
const SIGNIN_URL =
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
  API_KEY;
const REFRESH_URL = "https://securetoken.googleapis.com/v1/token?key=" + API_KEY;
const QUEUE_URL =
  "https://firestore.googleapis.com/v1/projects/apps-5884f/" +
  "databases/apps/documents/taskerQueue";
const BATCHWRITE_URL =
  "https://firestore.googleapis.com/v1/projects/apps-5884f/" +
  "databases/apps/documents:batchWrite";
const TASKER_EMAIL = "tasker@eexpression.com";
const PROJECT_VERSION = "2.3";
const UPDATE_FILE = "/sdcard/Tasker/Updates/Tasks_Widget.prj.xml";
const NOTIFY_TITLE = "Tasker Update Available";
const WIDGET_NAME = "Tasks Widget";
const PROJECT_NAME = "Tasks Widget v" + PROJECT_VERSION;

const NOW_MS = String(Date.now());

// The layout is built at runtime by a JavaScriptlet (v2.3): the static
// "%TASKS_FEED_JSON" placeholder was never substituted by Widget v2, so the
// task now builds the whole layout JSON from the feed text and passes it as
// a single variable. The JS below is the JavaScriptlet body. It deliberately
// mirrors the working "Parse token response" JavaScriptlet: it reads the
// built-in lowercase http_data (not the uppercase %TASKS_FEED) and stores the
// result with setLocal under a lowercase name, because the v2.2 variant that
// read TASKS_FEED and used setGlobal never set %TASKS_LAYOUT_JSON (confirmed
// empty in the phone's Vars tab while %TASKS_FEED held the feed text).
const LAYOUT_BUILDER_JS =
  "var layout = {type:'Column',backgroundColor:'#000000',fillMaxSize:true," +
  "horizontalAlignment:'Start',verticalAlignment:'Top',scrolling:true,padding:12," +
  "children:[{type:'Text',text:http_data,color:'#F7F7F7',textSize:'14'," +
  "align:'Start',fontFamily:'Monospace',task:'Update Tasks Widget'}]};" +
  "setLocal('tasks_layout_json', JSON.stringify(layout));";

// --- XML builder -----------------------------------------------------------
// Mirrors Python's xml.etree.ElementTree output exactly:
// tab indentation, self-closing empty elements, ElementTree escaping
// (text: & < > ; attributes: & < > " tab newline CR).

interface XmlElement {
  tag: string;
  attrs: Record<string, string>;
  text: string | null;
  children: XmlElement[];
}

function el(
  parent: XmlElement,
  tag: string,
  text: string | null = null,
  attrs: Record<string, string> = {},
): XmlElement {
  const e: XmlElement = { tag, attrs, text, children: [] };
  parent.children.push(e);
  return e;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#9;")
    .replace(/\n/g, "&#10;")
    .replace(/\r/g, "&#13;");
}

function serializeElement(element: XmlElement, level: number): string {
  const indent = "\t".repeat(level);
  const attrs = Object.entries(element.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join("");
  const hasChildren = element.children.length > 0;
  const hasText = element.text !== null && element.text !== "";
  if (!hasChildren && !hasText) {
    return `${indent}<${element.tag}${attrs} />`;
  }
  if (!hasChildren) {
    return `${indent}<${element.tag}${attrs}>${escapeText(element.text ?? "")}</${element.tag}>`;
  }
  const inner = element.children.map((c) => serializeElement(c, level + 1)).join("\n");
  return `${indent}<${element.tag}${attrs}>\n${inner}\n${indent}</${element.tag}>`;
}

function serializeDocument(root: XmlElement): string {
  // ElementTree does not write a trailing newline after the root element.
  return serializeElement(root, 0);
}

// --- XML helpers -----------------------------------------------------------

function bundleArg(
  parent: XmlElement,
  arg: number,
  relevantVarsText: string | null = null,
): XmlElement {
  const b = el(parent, "Bundle", null, { sr: `arg${arg}` });
  const vals = el(b, "Vals", null, { sr: "val" });
  if (relevantVarsText !== null) {
    el(vals, "net.dinglisch.android.tasker.RELEVANT_VARIABLES", relevantVarsText);
    el(vals, "net.dinglisch.android.tasker.RELEVANT_VARIABLES-type", "[Ljava.lang.String;");
  }
  return b;
}

function intArg(parent: XmlElement, arg: number, val: number): XmlElement {
  return el(parent, "Int", null, { sr: `arg${arg}`, val: String(val) });
}

function strArg(parent: XmlElement, arg: number, text = ""): XmlElement {
  return el(parent, "Str", text, { sr: `arg${arg}`, ve: "3" });
}

function appArg(
  parent: XmlElement,
  arg: number,
  appClass: string,
  appPkg: string,
  label: string,
): XmlElement {
  // Owner Application for Notification Click (Event 2000): Tasker expects
  // an <App> object here, not a <Str>. An empty <Str> fails import with
  // "unpack object: expected object type App, seen Str" and the project
  // then refers to a non-existing profile ID. The notification is posted
  // by Tasker itself, so the owner is Tasker.
  const a = el(parent, "App", null, { sr: `arg${arg}` });
  el(a, "appClass", appClass);
  el(a, "appPkg", appPkg);
  el(a, "label", label);
  return a;
}

function action(
  task: XmlElement,
  index: number,
  code: number,
  seContinue = false,
  label: string | null = null,
): XmlElement {
  const a = el(task, "Action", null, { sr: `act${index}`, ve: "7" });
  el(a, "code", String(code));
  if (label !== null) {
    el(a, "label", label);
  }
  if (seContinue) {
    el(a, "se", "false");
  }
  return a;
}

function condIf(
  task: XmlElement,
  index: number,
  lhs: string,
  op: number,
  rhs = "",
): XmlElement {
  // An If action (37) with a single condition.
  const a = action(task, index, 37);
  const cl = el(a, "ConditionList", null, { sr: "if" });
  const cond = el(cl, "Condition", null, { sr: "c0", ve: "3" });
  el(cond, "lhs", lhs);
  el(cond, "op", String(op));
  el(cond, "rhs", rhs);
  return a;
}

function flash(task: XmlElement, index: number, text: string, long = 0): XmlElement {
  const a = action(task, index, 548);
  strArg(a, 0, text);
  intArg(a, 1, long);
  intArg(a, 2, 1); // Tasker Layout
  return a;
}

function varSet(
  task: XmlElement,
  index: number,
  name: string,
  to: string,
  doMaths = 0,
): XmlElement {
  const a = action(task, index, 547);
  strArg(a, 0, name);
  strArg(a, 1, to);
  intArg(a, 2, 0); // Recurse Variables
  intArg(a, 3, doMaths); // Do Maths
  intArg(a, 4, 0); // Append
  intArg(a, 5, 3); // Max Rounding Digits
  intArg(a, 6, 0); // Structure Output
  return a;
}

interface HttpRequestOptions {
  headers?: string;
  body?: string;
  saveTo?: string;
  followRedirects?: number;
  timeout?: number;
  label?: string | null;
}

function httpRequest(
  task: XmlElement,
  index: number,
  method: number,
  url: string,
  opts: HttpRequestOptions = {},
): XmlElement {
  // HTTP Request (339). method: 0=GET, 1=POST (confirmed by real exports).
  const a = action(task, index, 339, true, opts.label ?? null);
  bundleArg(a, 0, HTTP_RELEVANT_VARS);
  intArg(a, 1, method);
  strArg(a, 2, url);
  strArg(a, 3, opts.headers ?? "");
  strArg(a, 4, ""); // Query Parameters
  strArg(a, 5, opts.body ?? "");
  strArg(a, 6, ""); // File To Send
  strArg(a, 7, opts.saveTo ?? ""); // File/Directory To Save With Output
  intArg(a, 8, opts.timeout ?? 30);
  intArg(a, 9, 0); // Trust Any Certificate
  intArg(a, 10, opts.followRedirects ?? 0);
  intArg(a, 11, 0); // Use Cookies
  intArg(a, 12, 0); // Structure Output (off: plain text)
  return a;
}

interface JavascriptletOptions {
  label?: string | null;
  timeout?: number;
}

function javascriptlet(
  task: XmlElement,
  index: number,
  code: string,
  opts: JavascriptletOptions = {},
): XmlElement {
  const a = action(task, index, 129, false, opts.label ?? null);
  strArg(a, 0, code);
  strArg(a, 1, ""); // Libraries
  intArg(a, 2, 1); // Auto Exit
  intArg(a, 3, opts.timeout ?? 10);
  return a;
}

// RELEVANT_VARIABLES metadata copied from a real exported HTTP Request action
// (generic Tasker metadata describing %http_data etc.; not user data).
const HTTP_RELEVANT_VARS =
  '<StringArray sr=""><_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES0>' +
  "%http_cookies, Cookies\n\nThe cookies the server sent in the response in the " +
  "Cookie:COOKIE_VALUE format. You can use this directly in the 'Headers' field " +
  "of the HTTP Request action" +
  "</_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES0>" +
  "<_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES1>%http_data\n\nData\n\n" +
  "Data that the server responded from the HTTP request." +
  "</_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES1>" +
  "<_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES2>%http_file_output\n\n" +
  "File Output\n\nWill always contain the file's full path even if you specified " +
  "a directory as the File to save." +
  "</_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES2>" +
  "<_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES3>%http_response_code\n\n" +
  "Response Code\n\nResponse Headers\n\nThe HTTP Headers the server sent in the " +
  "response. Each header is in the 'key:value' format" +
  "</_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES3>" +
  "<_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES4>%http_response_length\n\n" +
  "Response Length\n\nThe size of the response in bytes" +
  "</_array_net.dinglisch.android.tasker.RELEVANT_VARIABLES4></StringArray>";

// --- Tasks -----------------------------------------------------------------

function taskUpdate(parent: XmlElement): XmlElement {
  // Task 2: Update Tasks Widget — token cache + fetch + display + queue.
  const task = el(parent, "Task", null, { sr: "task2" });
  el(task, "cdate", NOW_MS);
  el(task, "edate", NOW_MS);
  el(task, "id", "2");
  el(task, "nme", "Update Tasks Widget");
  el(task, "pri", "6");
  let i = 0;
  // Guard: no ID token yet
  condIf(task, i, "%TASKER_ID_TOKEN", 13); i++; // NotSet
  flash(task, i, "Run Setup Tasker Login to sign in"); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  // Token age (seconds since the ID token was stored)
  varSet(task, i, "%token_age", "%TIMES - %TASKER_TOKEN_TIME", 1); i++;
  // Refresh when older than 55 minutes
  condIf(task, i, "%token_age", 7, "3300"); i++; // >
  httpRequest(task, i, 1, REFRESH_URL, {
    headers: "Content-Type:application/x-www-form-urlencoded",
    body: "grant_type=refresh_token&refresh_token=%TASKER_REFRESH_TOKEN",
    label: "Refresh ID token",
  }); i++;
  condIf(task, i, "%http_response_code", 9, "200"); i++; // !=
  flash(task, i, "Sign-in expired — run Setup Tasker Login"); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  javascriptlet(task, i,
    "var resp = JSON.parse(http_data);\n" +
    "setLocal('id_token', resp.id_token);\n" +
    "if (resp.refresh_token) { setLocal('refresh_token', resp.refresh_token); }",
    { label: "Parse token response" }); i++;
  condIf(task, i, "%id_token", 13); i++; // NotSet
  flash(task, i, "Token refresh failed"); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  varSet(task, i, "%TASKER_ID_TOKEN", "%id_token"); i++;
  condIf(task, i, "%refresh_token", 12); i++; // Set
  varSet(task, i, "%TASKER_REFRESH_TOKEN", "%refresh_token"); i++;
  action(task, i, 38); i++; // End If
  varSet(task, i, "%TASKER_TOKEN_TIME", "%TIMES"); i++;
  action(task, i, 38); i++; // End If (age)
  // Fetch the feed with the ID token
  httpRequest(task, i, 0, FEED_URL, {
    headers: "Authorization:Bearer %TASKER_ID_TOKEN",
    label: "Fetch task list",
  }); i++;
  condIf(task, i, "%http_response_code", 9, "200"); i++; // !=
  flash(task, i, "Tasks widget update failed (code %http_response_code)"); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  varSet(task, i, "%TASKS_FEED", "%http_data"); i++;
  javascriptlet(task, i, LAYOUT_BUILDER_JS, { label: "Build layout JSON" }); i++;
  const a = action(task, i, 461); i++; // Widget v2
  bundleArg(a, 0);
  strArg(a, 1, WIDGET_NAME);
  strArg(a, 2, "Custom");
  for (let arg = 3; arg < 13; arg++) {
    strArg(a, arg);
  }
  strArg(a, 13, "%tasks_layout_json");
  intArg(a, 14, 0);
  strArg(a, 15);
  intArg(a, 16, 1);
  // Poll the update queue (runs after a successful widget update)
  const q = action(task, i, 130); i++; // Perform Task
  strArg(q, 0, "Check Tasker Queue");
  intArg(q, 1, 6); // Priority
  strArg(q, 2); // Parameter 1
  strArg(q, 3); // Parameter 2
  strArg(q, 4); // Return Value Variable
  intArg(q, 5, 0); // Stop (keep running parent)
  intArg(q, 6, 0); // Local Variable Passthrough
  strArg(q, 7); // Limit Passthrough To
  intArg(q, 8, 0); // Reset Return Variable
  intArg(q, 9, 0); // Allow Overwrite Variables
  intArg(q, 10, 0); // Structure Output
  return task;
}

function taskSetup(parent: XmlElement): XmlElement {
  // Task 3: Setup Tasker Login — password prompt + sign-in + store tokens.
  const task = el(parent, "Task", null, { sr: "task3" });
  el(task, "cdate", NOW_MS);
  el(task, "edate", NOW_MS);
  el(task, "id", "3");
  el(task, "nme", "Setup Tasker Login");
  el(task, "pri", "6");
  let i = 0;
  // Prompt for the Firebase password (local variable only, never stored)
  const a = action(task, i, 595, false, "Ask for Firebase password"); i++;
  strArg(a, 0, "Tasker Firebase password"); // Title
  strArg(a, 1, "%pass"); // Variable (local)
  intArg(a, 2, 0); // Input Type: 0 = default plain text (password visible while typing)
  strArg(a, 3); // Default
  strArg(a, 4); // Background Image
  strArg(a, 5, "Variable Query"); // Layout
  intArg(a, 6, 120); // Timeout (Seconds)
  intArg(a, 7, 0); // Show Over Keyguard
  condIf(task, i, "%pass", 13); i++; // NotSet
  flash(task, i, "Sign-in cancelled"); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  const body =
    '{"email":"' + TASKER_EMAIL + '","password":"%pass",' +
    '"returnSecureToken":true}';
  httpRequest(task, i, 1, SIGNIN_URL, {
    headers: "Content-Type:application/json",
    body,
    label: "Sign in to Firebase",
  }); i++;
  condIf(task, i, "%http_response_code", 9, "200"); i++; // !=
  flash(task, i, "Sign-in failed (code %http_response_code)"); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  javascriptlet(task, i,
    "var resp = JSON.parse(http_data);\n" +
    "setLocal('id_token', resp.idToken);\n" +
    "setLocal('refresh_token', resp.refreshToken);",
    { label: "Parse sign-in response" }); i++;
  condIf(task, i, "%id_token", 13); i++; // NotSet
  flash(task, i, "Sign-in response unreadable"); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  varSet(task, i, "%TASKER_ID_TOKEN", "%id_token"); i++;
  varSet(task, i, "%TASKER_REFRESH_TOKEN", "%refresh_token"); i++;
  varSet(task, i, "%TASKER_TOKEN_TIME", "%TIMES"); i++;
  const c = action(task, i, 549); i++; // Variable Clear
  strArg(c, 0, "%pass");
  intArg(c, 1, 0);
  intArg(c, 2, 0);
  intArg(c, 3, 0);
  flash(task, i, "Signed in — Tasks widget is ready"); i++;
  return task;
}

function taskQueue(parent: XmlElement): XmlElement {
  // Task 4: Check Tasker Queue — poll taskerQueue, notify once, self-clean.
  const task = el(parent, "Task", null, { sr: "task4" });
  el(task, "cdate", NOW_MS);
  el(task, "edate", NOW_MS);
  el(task, "id", "4");
  el(task, "nme", "Check Tasker Queue");
  el(task, "pri", "6");
  let i = 0;
  varSet(task, i, "%installed_version", PROJECT_VERSION); i++;
  condIf(task, i, "%TASKER_ID_TOKEN", 13); i++; // NotSet
  action(task, i, 137); i++; // Stop (silent)
  action(task, i, 38); i++; // End If
  httpRequest(task, i, 0, QUEUE_URL, {
    headers: "Authorization:Bearer %TASKER_ID_TOKEN",
    label: "List taskerQueue",
  }); i++;
  condIf(task, i, "%http_response_code", 9, "200"); i++; // !=
  action(task, i, 137); i++; // Stop (silent)
  action(task, i, 38); i++; // End If
  javascriptlet(task, i,
    "var resp = JSON.parse(http_data);\n" +
    "if (!resp.documents || resp.documents.length == 0) {\n" +
    "  setLocal('queue_empty', 'true');\n" +
    "} else {\n" +
    "  var doc = resp.documents[0];\n" +
    "  var f = doc.fields || {};\n" +
    "  setLocal('queue_version', f.version ? f.version.stringValue : '');\n" +
    "  setLocal('queue_url', f.url ? f.url.stringValue : '');\n" +
    "  setLocal('queue_notes', f.notes ? f.notes.stringValue : '');\n" +
    "  var parts = (doc.name || '').split('/');\n" +
    "  setLocal('queue_docid', parts[parts.length - 1]);\n" +
    "}",
    { label: "Parse queue response" }); i++;
  condIf(task, i, "%queue_empty", 12); i++; // Set
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  // Installed version caught up: delete the item (self-cleaning)
  condIf(task, i, "%queue_version", 0, "%installed_version"); i++; // eq
  const delBody =
    '{"writes":[{"delete":"projects/apps-5884f/databases/apps/' +
    'documents/taskerQueue/%queue_docid"}]}';
  httpRequest(task, i, 1, BATCHWRITE_URL, {
    headers: "Content-Type:application/json\nAuthorization:Bearer %TASKER_ID_TOKEN",
    body: delBody,
    label: "Delete caught-up queue item",
  }); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  // New version available: notify once per version
  condIf(task, i, "%queue_version", 1, "%TASKER_NOTIFIED_VERSION"); i++; // ne
  const n = action(task, i, 523, false, "Notify update ready"); i++;
  strArg(n, 0, NOTIFY_TITLE);
  strArg(n, 1, "Version %queue_version is ready — tap to install.");
  strArg(n, 2); // Icon
  intArg(n, 3, 0); // Number
  intArg(n, 4, 0); // Permanent
  intArg(n, 5, 3); // Priority
  intArg(n, 6, 0); // Repeat Alert
  intArg(n, 7, 0); // LED Colour
  intArg(n, 8, 0); // LED Rate
  strArg(n, 9); // Sound File
  strArg(n, 10); // Vibration Pattern
  strArg(n, 11); // Category
  strArg(n, 12); // Intensity Pattern
  intArg(n, 13, 0); // Live Update
  strArg(n, 14); // Short Critical Text
  strArg(n, 15); // Group
  varSet(task, i, "%TASKER_NOTIFIED_VERSION", "%queue_version"); i++;
  varSet(task, i, "%TASKER_UPDATE_URL", "%queue_url"); i++;
  action(task, i, 38); i++; // End If
  return task;
}

function taskInstall(parent: XmlElement): XmlElement {
  // Task 5: Install Tasker Update — download + open for Import.
  const task = el(parent, "Task", null, { sr: "task5" });
  el(task, "cdate", NOW_MS);
  el(task, "edate", NOW_MS);
  el(task, "id", "5");
  el(task, "nme", "Install Tasker Update");
  el(task, "pri", "6");
  let i = 0;
  condIf(task, i, "%TASKER_UPDATE_URL", 13); i++; // NotSet
  flash(task, i, "No Tasker update is waiting"); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  httpRequest(task, i, 0, "%TASKER_UPDATE_URL", {
    saveTo: UPDATE_FILE,
    followRedirects: 1,
    label: "Download new project file",
  }); i++;
  condIf(task, i, "%http_response_code", 9, "200"); i++; // !=
  flash(task, i, "Download failed (code %http_response_code)"); i++;
  action(task, i, 137); i++; // Stop
  action(task, i, 38); i++; // End If
  const c = action(task, i, 549); i++; // Variable Clear
  strArg(c, 0, "%TASKER_UPDATE_URL");
  intArg(c, 1, 0);
  intArg(c, 2, 0);
  intArg(c, 3, 0);
  const o = action(task, i, 102, false, "Open file to import"); i++; // Open File
  strArg(o, 0, UPDATE_FILE);
  strArg(o, 1, ""); // Mime Type (let Android infer from .prj.xml)
  return task;
}

// --- Profiles --------------------------------------------------------------

function profileRefresh(parent: XmlElement): XmlElement {
  const prof = el(parent, "Profile", null, { sr: "prof1", ve: "2" });
  el(prof, "cdate", NOW_MS);
  el(prof, "edate", NOW_MS);
  el(prof, "flags", "40");
  el(prof, "id", "1");
  el(prof, "mid0", "2");
  el(prof, "nme", "Tasks Widget Refresh");
  const t = el(prof, "Time", null, { sr: "con0" });
  el(t, "fh", "-1");
  el(t, "fm", "-1");
  el(t, "rep", "2"); // Repeat type: Minutes
  el(t, "repval", "5"); // every 5 minutes
  el(t, "th", "-1");
  el(t, "tm", "-1");
  return prof;
}

function profileUpdateTap(parent: XmlElement): XmlElement {
  // Profile 2: tapping the update notification runs Install Tasker Update.
  const prof = el(parent, "Profile", null, { sr: "prof2", ve: "2" });
  el(prof, "cdate", NOW_MS);
  el(prof, "edate", NOW_MS);
  el(prof, "flags", "8");
  el(prof, "id", "2");
  el(prof, "mid0", "5");
  el(prof, "nme", "Tasker Update Tap");
  const ev = el(prof, "Event", null, { sr: "con0", ve: "2" });
  el(ev, "code", "2000"); // Notification Click
  el(ev, "pri", "0");
  appArg(ev, 0, "net.dinglisch.android.taskerm.Tasker",
    "net.dinglisch.android.taskerm", "Tasker"); // Owner Application
  strArg(ev, 1, NOTIFY_TITLE);
  return prof;
}

function buildProject(parent: XmlElement): XmlElement {
  const proj = el(parent, "Project", null, { sr: "proj0", ve: "2" });
  el(proj, "cdate", NOW_MS);
  el(proj, "edate", NOW_MS);
  el(proj, "name", PROJECT_NAME);
  el(proj, "pids", "1,2");
  el(proj, "tids", "2,3,4,5");
  return proj;
}

const root: XmlElement = {
  tag: "TaskerData",
  attrs: { sr: "", dvi: "1", tv: "6.4" },
  text: null,
  children: [],
};
profileRefresh(root);
profileUpdateTap(root);
buildProject(root);
taskUpdate(root);
taskSetup(root);
taskQueue(root);
taskInstall(root);
fs.writeFileSync(OUT_DIR + "/Tasks_Widget.prj.xml", serializeDocument(root), "utf-8");
console.log("wrote", OUT_DIR + "/Tasks_Widget.prj.xml");
