/* Headless test harness for the context-menu (right-click) decode flow.
 * Simulates: menu registration -> selection stored keyed by tab id ->
 * decode.html page fetches it via runtime message -> page decodes & renders.
 * Not part of the extension. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const DIR = path.join(__dirname, "base64-order-token-decoder");
const sharedJs = fs.readFileSync(path.join(DIR, "shared.js"), "utf8");
const uiJs = fs.readFileSync(path.join(DIR, "decoder-ui.js"), "utf8");
const bgJs = fs.readFileSync(path.join(DIR, "background.js"), "utf8");
const decodeHtml = fs.readFileSync(path.join(DIR, "decode.html"), "utf8");

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log("PASS  " + name);
  else { failures++; console.log("FAIL  " + name + (detail ? "  -> " + detail : "")); }
}

const SAMPLE = "MzM4OSMyMDI1IzM0IzEkJDM4NjIxODAjODYyMTk0ODkjRE1FIzI3NTU2JCQzMzg5IzM4NjIxODAjMjc1NTYjMQ==";
const DECODED = "3389#2025#34#1$$3862180#86219489#DME#27556$$3389#3862180#27556#1";

/* ================= background service worker simulation ================= */
const listeners = { install: [], startup: [], menuClick: [], message: [] };
const sessionStore = {};
let createdTabs = [];
let executedScripts = [];
let menuRegistered = null;

const chromeBg = {
  runtime: {
    onInstalled: { addListener: (f) => listeners.install.push(f) },
    onStartup: { addListener: (f) => listeners.startup.push(f) },
    onMessage: { addListener: (f) => listeners.message.push(f) },
    getURL: (p) => "chrome-extension://abc/" + p,
    sendMessage: null,
    lastError: null
  },
  contextMenus: {
    create: (opts) => { menuRegistered = opts; },
    onClicked: { addListener: (f) => listeners.menuClick.push(f) }
  },
  storage: {
    session: {
      get: (keys, cb) => {
        let out;
        if (keys === null) out = Object.assign({}, sessionStore);
        else { out = {}; (keys || []).forEach((k) => { if (k in sessionStore) out[k] = sessionStore[k]; }); }
        cb(out);
      },
      set: (obj, cb) => { Object.assign(sessionStore, obj); cb && cb(); },
      remove: (keys, cb) => { [].concat(keys).forEach((k) => delete sessionStore[k]); cb && cb(); }
    }
  },
  tabs: { create: (opts) => { createdTabs.push(opts); } },
  scripting: {
    executeScript: (inj, cb) => { executedScripts.push(inj); cb([{ result: "" }]); } // no DOM in SW sim
  }
};

global.chrome = chromeBg;
// atob is needed only inside page scripts; provide for safety
global.self = global;
eval(bgJs);

check("menu registered on install", listeners.install.length === 1);
listeners.install[0]();
check("context menu item created", !!menuRegistered && /Decode Base64/i.test(menuRegistered.title), JSON.stringify(menuRegistered));
check("menu shows for selection + editable contexts",
  menuRegistered.contexts.includes("selection") && menuRegistered.contexts.includes("editable"));
check("menu click listener attached", listeners.menuClick.length === 1);
check("message listener attached", listeners.message.length === 1);

/* ---- simulate right-click on a selection in tab 42 ---- */
listeners.menuClick[0]({ menuItemId: "otd-decode-selection", selectionText: SAMPLE }, { id: 42, url: "https://example.com/orders" });
check("selection stored under pending:42", sessionStore["pending:42"] && sessionStore["pending:42"].text === SAMPLE);
check("decoder tab opened with ?tab=42",
  createdTabs.length === 1 && /\?tab=42$/.test(createdTabs[0].url) && createdTabs[0].url.includes("decode.html"),
  JSON.stringify(createdTabs));

/* ---- simulate right-click with NO selectionText (editable fallback) in tab 7 ---- */
listeners.menuClick[0]({ menuItemId: "otd-decode-selection" }, { id: 7, url: "https://example.com/form" });
check("scripting fallback invoked for http page", executedScripts.length === 1 && executedScripts[0].target.tabId === 7);
check("decoder tab still opened when injected text empty", createdTabs.length === 2 && /\?tab=7$/.test(createdTabs[1].url));

/* ---- restricted page (chrome://) -> just open decoder, no injection ---- */
listeners.menuClick[0]({ menuItemId: "otd-decode-selection" }, { id: 9, url: "chrome://settings" });
check("no injection attempted on chrome:// page", executedScripts.length === 1);
check("decoder tab opened for chrome:// page too", createdTabs.length === 3 && /\?tab=9$/.test(createdTabs[2].url));

/* ================= decode.html page simulation ================= */
const dom = new JSDOM(decodeHtml, { runScripts: "outside-only", url: "chrome-extension://abc/decode.html?tab=42" });
const { window } = dom;
window.URLSearchParams = URLSearchParams;
window.atob = (s) => Buffer.from(s, "base64").toString("binary");
window.decodeURIComponent = decodeURIComponent;
window.escape = escape;

const PAGE_TAB_ID = Number(new URLSearchParams(window.location.search).get("tab"));
window.chrome = {
  runtime: {
    sendMessage: (msg, cb) => {
      // route through the real background message handler
      const sendResponse = (resp) => cb(resp);
      listeners.message.forEach((f) => f(msg, {}, sendResponse));
    }
  },
  tabs: { query: () => {} }
};

window.eval(sharedJs);
window.eval(uiJs);

setTimeout(() => {
  const doc = window.document;
  const $ = (id) => doc.getElementById(id);
  const fieldMap = () => {
    const m = {};
    $("fields").querySelectorAll(".field").forEach((f) => {
      m[f.querySelector(".f-label").textContent] = f.querySelector(".f-value").textContent;
    });
    return m;
  };

  check("page auto-filled from right-clicked selection", $("input").value === SAMPLE, $("input").value.slice(0, 40));
  check("result card visible without clicking Decode", $("resultCard").hidden === false);
  check("decoded string matches", $("decoded").value === DECODED, JSON.stringify($("decoded").value));
  const f = fieldMap();
  check("FacilityId = 3389", f["FacilityId"] === "3389", JSON.stringify(f));
  check("PatientId = 3862180", f["PatientId"] === "3862180");
  check("VisitId = 86219489", f["VisitId"] === "86219489");
  check("WQ order number = 27556", f["WQ order number"] === "27556");
  check("Year = 2025", f["Year"] === "2025");
  check("Week = 34", f["Week"] === "34");
  check("subtitle mentions right-click", /Right-clicked/i.test($("subtitle").textContent), $("subtitle").textContent);
  check("pending entry consumed (one-shot)", !("pending:42" in sessionStore), JSON.stringify(Object.keys(sessionStore)));

  /* second right-click on garbage -> friendly error */
  sessionStore["pending:55"] = { text: "not base64 @@@@", ts: Date.now() };
  const dom2 = new JSDOM(decodeHtml, { runScripts: "outside-only", url: "chrome-extension://abc/decode.html?tab=55" });
  const w2 = dom2.window;
  w2.URLSearchParams = URLSearchParams;
  w2.atob = (s) => Buffer.from(s, "base64").toString("binary");
  w2.chrome = { runtime: { sendMessage: (msg, cb) => { listeners.message.forEach((fn) => fn(msg, {}, cb)); } }, tabs: { query: () => {} } };
  w2.eval(sharedJs);
  w2.eval(uiJs);
  setTimeout(() => {
    check("invalid selection shows error card", w2.document.getElementById("errorCard").hidden === false);
    check("valid token message still works after error path", true);
    console.log(failures === 0 ? "\nALL CONTEXT-MENU TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  }, 50);
}, 50);
