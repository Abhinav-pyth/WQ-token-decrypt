/* decoder-ui.js — shared UI logic for the popup and the full-tab decoder page.
 * Requires window.TokenDecoder (from shared.js) to be loaded first.
 */
(function () {
  "use strict";

  var D = window.TokenDecoder;
  var el = function (id) { return document.getElementById(id); };

  var inputEl = el("input");
  var decodedEl = el("decoded");
  var fieldsEl = el("fields");
  var segmentsEl = el("segments");
  var extraEl = el("extra");
  var resultCard = el("resultCard");
  var errorCard = el("errorCard");
  var badgeEl = el("badge");

  /* ---------- rendering ---------- */
  function makeField(node, label, value, hl) {
    var box = document.createElement("div");
    box.className = "field";
    box.title = "Click to copy";
    var l = document.createElement("span");
    l.className = "f-label";
    l.textContent = label;
    var v = document.createElement("span");
    v.className = "f-value" + (hl ? " hl" : "");
    v.textContent = value;
    box.appendChild(l);
    box.appendChild(v);
    box.addEventListener("click", function () { copyText(value, label + " copied"); });
    node.appendChild(box);
  }

  function renderSegments(container, parsed) {
    container.innerHTML = "";
    parsed.segments.forEach(function (fields, idx) {
      var box = document.createElement("div");
      box.className = "seg";
      var head = document.createElement("div");
      head.className = "seg-h";
      head.textContent = "Segment " + (idx + 1);
      box.appendChild(head);

      var labels = D.labelsFor(idx);
      var chips = document.createElement("div");
      chips.className = "chips";
      fields.forEach(function (val, i) {
        var chip = document.createElement("span");
        var known = labels[i];
        chip.className = "chip" + (known ? "" : " extra");
        var b = document.createElement("b");
        b.textContent = (known || "[" + i + "]") + ": ";
        chip.appendChild(b);
        chip.appendChild(document.createTextNode(val === "" ? "(empty)" : val));
        chip.title = "Click to copy";
        chip.addEventListener("click", function () { copyText(val, "Copied"); });
        chips.appendChild(chip);
      });
      box.appendChild(chips);
      container.appendChild(box);
    });
  }

  function showError(message) {
    resultCard.hidden = true;
    errorCard.hidden = false;
    el("errMsg").textContent = message;
  }

  function render(decoded) {
    var parsed = D.parseToken(decoded);
    errorCard.hidden = true;
    resultCard.hidden = false;
    decodedEl.value = decoded;

    badgeEl.className = "badge " + (parsed.looksLikeToken ? "ok" : "warn");
    badgeEl.textContent = parsed.looksLikeToken ? "valid base64 · ordertoken" : "valid base64 · not an ordertoken";

    fieldsEl.innerHTML = "";
    parsed.fields.forEach(function (f) { makeField(fieldsEl, f.label, f.value, f.hl); });
    if (!parsed.fields.length) {
      var none = document.createElement("div");
      none.className = "err-msg";
      none.textContent = "No recognizable token fields were found. The raw decoded text above is still shown.";
      fieldsEl.appendChild(none);
    }

    var multi = parsed.segments.length > 2;   // segments 1 & 2 are already covered by the field cards
    el("segDetails").hidden = !multi;
    el("segCount").textContent = String(parsed.segments.length);
    if (multi) renderSegments(segmentsEl, parsed);

    // "Extra / unparsed" only lists leftovers from the primary segments.
    var extrasAsSegments = [parsed.extras.map(function (e) { return e.value; })];
    el("rawDetails").hidden = parsed.extras.length === 0;
    el("rawSummary").textContent = "Extra / unparsed fields (" + parsed.extras.length + ")";
    if (parsed.extras.length) renderSegments(extraEl, { segments: extrasAsSegments });
  }

  /* ---------- actions ---------- */
  function decode() {
    try {
      var decoded = D.decodeBase64(inputEl.value);
      render(decoded);
      saveState();
    } catch (e) {
      resultCard.hidden = true;
      showError(e.message || String(e));
      saveState();
    }
  }

  function copyText(text, okMessage) {
    if (!text) return;
    var done = function () { toast(okMessage || "Copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    } else {
      legacyCopy(text);
      done();
    }
  }

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  var toastTimer = null;
  function toast(msg) {
    var t = el("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1400);
  }

  /* ---------- persistence (popup remembers last token; tab pages don't) ---------- */
  var STORE_KEY = "lastToken";
  var isTab = location.pathname.indexOf("decode.html") !== -1;

  function hasStorage() {
    try {
      return !isTab && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    } catch (e) { return false; }
  }

  function saveState() {
    try {
      if (hasStorage()) chrome.storage.local.set({ lastToken: inputEl.value });
      else if (!isTab) localStorage.setItem(STORE_KEY, inputEl.value);
    } catch (e) { /* ignore */ }
  }

  function restoreState(cb) {
    var apply = function (token) {
      if (token) { inputEl.value = token; decode(); }
      if (cb) cb();
    };
    try {
      if (hasStorage()) chrome.storage.local.get([STORE_KEY], function (res) { apply(res && res[STORE_KEY]); });
      else if (!isTab) apply(localStorage.getItem(STORE_KEY));
      else if (cb) cb();
    } catch (e) { if (cb) cb(); }
  }

  /* ---------- wiring ---------- */
  el("decodeBtn").addEventListener("click", decode);
  el("sampleBtn").addEventListener("click", function () { inputEl.value = D.SAMPLE; decode(); });
  el("clearBtn").addEventListener("click", function () {
    inputEl.value = "";
    resultCard.hidden = true;
    errorCard.hidden = true;
    decodedEl.value = "";
    fieldsEl.innerHTML = "";
    saveState();
    inputEl.focus();
  });
  el("pasteBtn").addEventListener("click", function () {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (txt) {
        inputEl.value = txt;
        decode();
      }, function () { toast("Clipboard access denied — use Ctrl+V"); inputEl.focus(); });
    } else {
      toast("Use Ctrl+V to paste");
      inputEl.focus();
    }
  });

  Array.prototype.forEach.call(document.querySelectorAll("[data-copy-target]"), function (btn) {
    btn.addEventListener("click", function () {
      var target = el(btn.getAttribute("data-copy-target"));
      copyText(target.value, "Decoded token copied");
    });
  });

  inputEl.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); decode(); }
  });

  var debounceTimer = null;
  inputEl.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      var raw = D.normalize(inputEl.value);
      if (raw.length >= 8 && D.isBase64(raw)) decode();
      else if (!raw) { resultCard.hidden = true; errorCard.hidden = true; }
    }, 350);
  });

  /* ---------- boot ---------- */
  function setSubtitle(text) {
    var s = el("subtitle");
    if (s) s.textContent = text;
  }

  function currentTabId(cb) {
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) return cb(null);
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        cb(tabs && tabs[0] && typeof tabs[0].id === "number" ? tabs[0].id : null);
      });
    } catch (e) { cb(null); }
  }

  function fetchPending(tabId, cb) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return cb(null);
    try {
      chrome.runtime.sendMessage({ type: "getPending", tabId: tabId }, function (resp) {
        cb(resp && resp.text ? resp.text : null);
      });
    } catch (e) { cb(null); }
  }

  if (isTab) {
    // Opened by the context menu: pull the right-clicked selection, then decode.
    var params = new URLSearchParams(location.search);
    var tabIdFromUrl = params.get("tab");
    var doneBoot = function () { restoreState(); inputEl.focus(); };

    var consume = function (tabId) {
      fetchPending(tabId, function (text) {
        if (text && text.trim()) {
          setSubtitle("Right-clicked selection from the page:");
          inputEl.value = text;
          decode();
          saveState();
          doneBoot();
        } else {
          setSubtitle("Paste or select a base64 ordertoken below.");
          doneBoot();
        }
      });
    };

    if (tabIdFromUrl !== null) {
      consume(Number(tabIdFromUrl));
    } else {
      currentTabId(function (tid) {
        if (tid !== null) consume(tid);
        else doneBoot();
      });
    }
  } else {
    // Popup behaviour (unchanged): remember the last token across sessions.
    restoreState();
    inputEl.focus();
  }
})();
