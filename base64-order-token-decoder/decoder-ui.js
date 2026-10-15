/* decoder-ui.js — shared UI logic for the popup and the full-tab decoder page.
 * Requires window.TokenDecoder (shared.js), window.OrderTokenFormat (tokens.js)
 * and window.DomHelpers (dom.js) to be loaded first.
 *
 * Structure:
 *   render     — turns a decoded token into DOM (field cards, segment chips)
 *   actions    — decode / copy / toast / clear / paste
 *   storage    — popup-only "remember last token" persistence
 *   boot       — context-menu handoff on decode.html, restore in the popup
 */
(function () {
  "use strict";

  const D = window.TokenDecoder;
  const { createElement, copyToClipboard } = window.DomHelpers;

  const $ = (id) => document.getElementById(id);
  const els = {
    input: $("input"),
    decoded: $("decoded"),
    fields: $("fields"),
    segments: $("segments"),
    extra: $("extra"),
    resultCard: $("resultCard"),
    errorCard: $("errorCard"),
    errMsg: $("errMsg"),
    badge: $("badge"),
    subtitle: $("subtitle"),
    segDetails: $("segDetails"),
    segCount: $("segCount"),
    rawDetails: $("rawDetails"),
    rawSummary: $("rawSummary")
  };

  /* ---------- rendering ---------- */

  function makeField(label, value, highlight) {
    return createElement("div", {
      class: "field",
      title: "Click to copy",
      onClick: () => copyText(value, label + " copied")
    }, [
      createElement("span", { class: "f-label", text: label }),
      createElement("span", { class: "f-value" + (highlight ? " hl" : ""), text: value })
    ]);
  }

  // One segment block ("Segment N" heading + labelled value chips).
  // `labels` may be empty — unknown positions then show as "[i]" extra chips.
  function renderSegmentBox(container, fields, labels, heading) {
    const chips = createElement("div", { class: "chips" }, fields.map((val, i) => {
      const known = labels[i];
      return createElement("span", {
        class: "chip" + (known ? "" : " extra"),
        title: "Click to copy",
        onClick: () => copyText(val, "Copied")
      }, [
        createElement("b", { text: (known || `[${i}]`) + ": " }),
        val === "" ? "(empty)" : val
      ]);
    }));

    const box = createElement("div", { class: "seg" });
    if (heading) box.appendChild(createElement("div", { class: "seg-h", text: heading }));
    box.appendChild(chips);
    container.appendChild(box);
  }

  function renderSegments(container, parsed) {
    container.innerHTML = "";
    parsed.segments.forEach((fields, idx) => {
      renderSegmentBox(container, fields, D.labelsFor(idx), "Segment " + (idx + 1));
    });
  }

  // The "Extra / unparsed" block reuses the segment layout without headings.
  function renderExtras(container, extras) {
    container.innerHTML = "";
    renderSegmentBox(container, extras.map((e) => e.value), [], null);
  }

  function showError(message) {
    els.resultCard.hidden = true;
    els.errorCard.hidden = false;
    els.errMsg.textContent = message;
  }

  function showResults() {
    els.errorCard.hidden = true;
    els.resultCard.hidden = false;
  }

  function render(decoded) {
    const parsed = D.parseToken(decoded);
    showResults();
    els.decoded.value = decoded;

    const isToken = parsed.looksLikeToken;
    els.badge.className = "badge " + (isToken ? "ok" : "warn");
    els.badge.textContent = isToken ? "valid base64 · ordertoken" : "valid base64 · not an ordertoken";

    els.fields.innerHTML = "";
    for (const f of parsed.fields) els.fields.appendChild(makeField(f.label, f.value, f.hl));
    if (!parsed.fields.length) {
      els.fields.appendChild(createElement("div", {
        class: "err-msg",
        text: "No recognizable token fields were found. The raw decoded text above is still shown."
      }));
    }

    // Segments 1 & 2 are already covered by the field cards; only show the
    // full-segment list when there are more than two of them.
    const multi = parsed.segments.length > 2;
    els.segDetails.hidden = !multi;
    els.segCount.textContent = String(parsed.segments.length);
    if (multi) renderSegments(els.segments, parsed);

    // "Extra / unparsed" only lists leftovers from the primary segments.
    els.rawDetails.hidden = parsed.extras.length === 0;
    els.rawSummary.textContent = "Extra / unparsed fields (" + parsed.extras.length + ")";
    if (parsed.extras.length) renderExtras(els.extra, parsed.extras);
  }

  /* ---------- actions ---------- */

  function decode() {
    try {
      render(D.decodeBase64(els.input.value));
    } catch (e) {
      showError(e.message || String(e));
    }
    saveState();
  }

  let toastTimer = null;
  function toast(msg) {
    let t = $("toast");
    if (!t) {
      t = createElement("div", { id: "toast", class: "toast" });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1400);
  }

  function copyText(text, okMessage) {
    if (!text) return;
    copyToClipboard(text).then(() => toast(okMessage || "Copied"));
  }

  function clearAll() {
    els.input.value = "";
    els.resultCard.hidden = true;
    els.errorCard.hidden = true;
    els.decoded.value = "";
    els.fields.innerHTML = "";
    saveState();
    els.input.focus();
  }

  function loadSample() {
    els.input.value = D.SAMPLE;
    decode();
  }

  function pasteFromClipboard() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then((txt) => {
        els.input.value = txt;
        decode();
      }, () => {
        toast("Clipboard access denied — use Ctrl+V");
        els.input.focus();
      });
    } else {
      toast("Use Ctrl+V to paste");
      els.input.focus();
    }
  }

  /* ---------- persistence (popup remembers last token; tab pages don't) ---------- */

  const STORE_KEY = "lastToken";
  const isTab = location.pathname.includes("decode.html");

  function hasExtensionStorage() {
    try {
      return !isTab && typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
    } catch (e) {
      return false;
    }
  }

  function saveState() {
    try {
      if (hasExtensionStorage()) chrome.storage.local.set({ [STORE_KEY]: els.input.value });
      else if (!isTab) localStorage.setItem(STORE_KEY, els.input.value);
    } catch (e) { /* storage unavailable — ignore */ }
  }

  function restoreState(cb) {
    const apply = (token) => {
      if (token) {
        els.input.value = token;
        decode();
      }
      if (cb) cb();
    };
    try {
      if (hasExtensionStorage()) {
        chrome.storage.local.get([STORE_KEY], (res) => apply(res && res[STORE_KEY]));
      } else if (!isTab) {
        apply(localStorage.getItem(STORE_KEY));
      } else if (cb) {
        cb();
      }
    } catch (e) {
      if (cb) cb();
    }
  }

  /* ---------- wiring ---------- */

  // The input placeholder shows the sample token (single source: tokens.js).
  if (els.input.classList.contains("sample-placeholder")) {
    els.input.placeholder = D.SAMPLE;
  }

  $("decodeBtn").addEventListener("click", decode);
  $("sampleBtn").addEventListener("click", loadSample);
  $("clearBtn").addEventListener("click", clearAll);
  $("pasteBtn").addEventListener("click", pasteFromClipboard);

  for (const btn of document.querySelectorAll("[data-copy-target]")) {
    btn.addEventListener("click", () => copyText($(btn.dataset.copyTarget).value, "Decoded token copied"));
  }

  els.input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
      ev.preventDefault();
      decode();
    }
  });

  // Live-decode while typing once the input plausibly looks like base64.
  let debounceTimer = null;
  els.input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const raw = D.normalize(els.input.value);
      if (raw.length >= 8 && D.isBase64(raw)) {
        decode();
      } else if (!raw) {
        els.resultCard.hidden = true;
        els.errorCard.hidden = true;
      }
    }, 350);
  });

  /* ---------- boot ---------- */

  function setSubtitle(text) {
    if (els.subtitle) els.subtitle.textContent = text;
  }

  function currentTabId(cb) {
    if (typeof chrome === "undefined" || !chrome.tabs || !chrome.tabs.query) return cb(null);
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const id = tabs && tabs[0] && tabs[0].id;
        cb(typeof id === "number" ? id : null);
      });
    } catch (e) {
      cb(null);
    }
  }

  function fetchPending(tabId, cb) {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) return cb(null);
    try {
      chrome.runtime.sendMessage({ type: "getPending", tabId }, (resp) => {
        cb(resp && resp.text ? resp.text : null);
      });
    } catch (e) {
      cb(null);
    }
  }

  if (isTab) {
    // Opened by the context menu: pull the right-clicked selection, then decode.
    const finishBoot = () => {
      restoreState();
      els.input.focus();
    };
    const consume = (tabId) => {
      fetchPending(tabId, (text) => {
        if (text && text.trim()) {
          setSubtitle("Right-clicked selection from the page:");
          els.input.value = text;
          decode();
          finishBoot();
        } else {
          setSubtitle("Paste or select a base64 ordertoken below.");
          finishBoot();
        }
      });
    };

    const tabIdFromUrl = new URLSearchParams(location.search).get("tab");
    if (tabIdFromUrl !== null) {
      consume(Number(tabIdFromUrl));
    } else {
      currentTabId((tid) => (tid !== null ? consume(tid) : finishBoot()));
    }
  } else {
    // Popup behaviour: remember the last token across sessions.
    restoreState();
    els.input.focus();
  }
})();
