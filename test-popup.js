/* Headless test harness for the extension popup (jsdom). Not part of the extension. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const DIR = path.join(__dirname, "base64-order-token-decoder");
const html = fs.readFileSync(path.join(DIR, "popup.html"), "utf8");
const tokensJs = fs.readFileSync(path.join(DIR, "tokens.js"), "utf8");
const sharedJs = fs.readFileSync(path.join(DIR, "shared.js"), "utf8");
const domJs = fs.readFileSync(path.join(DIR, "dom.js"), "utf8");
const uiJs = fs.readFileSync(path.join(DIR, "decoder-ui.js"), "utf8");

const dom = new JSDOM(html, { runScripts: "outside-only", url: "chrome-extension://abc/popup.html" });
const { window } = dom;

// Minimal chrome.* stub (storage.local) so saveState/restoreState work.
const store = {};
window.chrome = {
  storage: {
    local: {
      set: (obj, cb) => { Object.assign(store, obj); cb && cb(); },
      get: (keys, cb) => { const o = {}; keys.forEach(k => { if (k in store) o[k] = store[k]; }); cb(o); }
    }
  }
};

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log("PASS  " + name);
  else { failures++; console.log("FAIL  " + name + (detail ? "  -> " + detail : "")); }
}

window.eval(tokensJs);
window.eval(sharedJs);
window.eval(domJs);
window.eval(uiJs);

const doc = window.document;
const $ = (id) => doc.getElementById(id);
const setInput = (v) => { $("input").value = v; $("decodeBtn").click(); };
const fieldMap = () => {
  const m = {};
  $("fields").querySelectorAll(".field").forEach(f => {
    m[f.querySelector(".f-label").textContent] = f.querySelector(".f-value").textContent;
  });
  return m;
};

/* ---------- Test 1: the user's sample ordertoken ---------- */
const SAMPLE = "MzM4OSMyMDI1IzM0IzEkJDM4NjIxODAjODYyMTk0ODkjRE1FIzI3NTU2JCQzMzg5IzM4NjIxODAjMjc1NTYjMQ==";
setInput(SAMPLE);

check("result card visible", $("resultCard").hidden === false);
check("error card hidden", $("errorCard").hidden === true);
check("decoded string matches",
  $("decoded").value === "3389#2025#34#1$$3862180#86219489#DME#27556$$3389#3862180#27556#1",
  JSON.stringify($("decoded").value));

const f = fieldMap();
check("FacilityId = 3389", f["FacilityId"] === "3389", JSON.stringify(f));
check("PatientId = 3862180", f["PatientId"] === "3862180");
check("VisitId = 86219489", f["VisitId"] === "86219489");
check("WQ order number = 27556", f["WQ order number"] === "27556");
check("Year = 2025", f["Year"] === "2025");
check("Week = 34", f["Week"] === "34");
check("Order type = DME", f["Order type"] === "DME");
check("badge says ordertoken", /ordertoken/.test($("badge").textContent), $("badge").textContent);
check("segments details shown with 3 segments",
  $("segDetails").hidden === false && $("segCount").textContent === "3");
check("no leftover extras (all fields mapped)", $("rawDetails").hidden === true,
  JSON.stringify([...$("extra").children].map(c => c.textContent)));

// Segment chips labelled for all three segments
const segChips = [...$("segments").querySelectorAll(".chip")].map(c => c.textContent.trim());
check("segment 3 cross-check labels present",
  segChips.some(t => t.startsWith("FacilityId (check): 3389")) &&
  segChips.some(t => t.startsWith("PatientId (check): 3862180")) &&
  segChips.some(t => t.startsWith("WQ order number (check): 27556")),
  JSON.stringify(segChips));

/* ---------- Test 2: prefix + whitespace tolerated ("ordertoken: <b64>\n") ---------- */
setInput("ordertoken: MzM4OSMyMDI1IzM0IzEk\nJDM4NjIxODAjODYyMTk0ODkjRE1FIzI3NTU2JCQzMzg5IzM4NjIxODAjMjc1NTYjMQ==\n");
check("prefixed/wrapped input decodes", $("errorCard").hidden === true && fieldMap()["PatientId"] === "3862180",
  $("errMsg").textContent);

/* ---------- Test 3: base64 without padding ---------- */
setInput(Buffer.from("3389#2025#34#1$$3862180#86219489#DME#27556").toString("base64").replace(/=+$/, ""));
check("unpadded base64 decodes", fieldMap()["VisitId"] === "86219489", $("errMsg").textContent);
check("single-segment token hides segment list", $("segDetails").hidden === true);

/* ---------- Test 4: plain non-token base64 still readable ---------- */
setInput(Buffer.from("Hello world from base64").toString("base64"));
check("plain text decoded and shown", $("decoded").value === "Hello world from base64");
check("badge warns it is not an ordertoken", /not an ordertoken/.test($("badge").textContent), $("badge").textContent);

/* ---------- Test 5: invalid input gives a friendly error ---------- */
setInput("this is @@@ not base64 !!!");
check("invalid base64 shows error card", $("errorCard").hidden === false && $("resultCard").hidden === true);
check("error message mentions base64", /base64/i.test($("errMsg").textContent), $("errMsg").textContent);

setInput("");
$("decodeBtn").click();
check("empty input shows 'nothing to decode'", /Nothing to decode/i.test($("errMsg").textContent), $("errMsg").textContent);

/* ---------- Test 6: UTF-8 content ---------- */
setInput(Buffer.from("3389#2025#34#1$$3862180#86219489#DME#27556 • café ✓").toString("base64"));
check("UTF-8 round-trip", $("decoded").value.includes("café ✓"), $("decoded").value);

/* ---------- Test 7: state persistence ---------- */
setInput(SAMPLE);
check("last token saved to storage", store.lastToken === SAMPLE, JSON.stringify(Object.keys(store)));

/* ---------- Test 8: clear button ---------- */
$("clearBtn").click();
check("clear hides results and empties input",
  $("input").value === "" && $("resultCard").hidden === true && $("errorCard").hidden === true);

/* ---------- Test 9: sample button ---------- */
$("sampleBtn").click();
check("sample button loads & decodes", fieldMap()["WQ order number"] === "27556");

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
