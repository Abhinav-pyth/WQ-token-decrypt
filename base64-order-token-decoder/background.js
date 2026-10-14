/* background.js (MV3 service worker)
 * Adds "Decode Base64 / ordertoken" to the right-click context menu.
 * Strategy:
 *   1. On install, register a selection + editable-context menu item.
 *   2. When clicked, grab the selected text via chrome.scripting.executeScript
 *      (works on http/https pages; no file access unless enabled).
 *   3. Store it keyed by tab id, then open decode.html?tab=<id>, which reads
 *      the value, decodes it, and clears the stored entry.
 */
"use strict";

var MENU_ID = "otd-decode-selection";
var STORE_PREFIX = "pending:";
var MAX_PENDING = 8; // keep at most this many stored selections around

/* ---------- context menu registration ---------- */
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Decode Base64 / ordertoken",
    contexts: ["selection", "editable"]
  });
});

// Keep the menu available even after browser restarts.
chrome.runtime.onStartup.addListener(function () {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Decode Base64 / ordertoken",
    contexts: ["selection", "editable"]
  });
});

/* ---------- helpers ---------- */
function cleanupPending() {
  chrome.storage.session.get(null, function (items) {
    var keys = Object.keys(items || {}).filter(function (k) {
      return k.indexOf(STORE_PREFIX) === 0;
    });
    if (keys.length <= MAX_PENDING) return;
    // Remove the oldest entries (keys are created in increasing order of use,
    // but we can't rely on that — just drop everything beyond the limit).
    keys.sort();
    chrome.storage.session.remove(keys.slice(0, keys.length - MAX_PENDING));
  });
}

function getSelectedText(tabId, cb) {
  chrome.scripting.executeScript(
    {
      target: { tabId: tabId },
      func: function () {
        var active = document.activeElement;
        var isEditable =
          active &&
          (active instanceof HTMLTextAreaElement ||
            (active instanceof HTMLInputElement &&
              /^(text|search|url|tel|password|email|number)$/i.test(active.type || "")));
        if (isEditable) {
          try {
            var s = active.selectionStart;
            var e = active.selectionEnd;
            if (typeof s === "number" && typeof e === "number" && e > s) {
              return String(active.value || "").slice(s, e);
            }
          } catch (err) { /* some inputs throw on selection access */ }
        }
        var sel = window.getSelection ? String(window.getSelection() || "") : "";
        if (sel.trim()) return sel;
        return isEditable ? String(active.value || "") : "";
      }
    },
    function (results) {
      var last = results && results[results.length - 1];
      cb(last && last.result ? String(last.result) : "");
    }
  );
}

function openDecoderTab(tabId) {
  chrome.tabs.create({ url: chrome.runtime.getURL("decode.html?tab=" + tabId) });
}

/* ---------- menu click ---------- */
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId !== MENU_ID || !tab || typeof tab.id !== "number") return;

  var payload = {};
  var key = STORE_PREFIX + tab.id;

  // Fast path: Chrome hands us the selection directly for "selection" menus.
  if (typeof info.selectionText === "string" && info.selectionText.trim()) {
    payload[key] = { text: info.selectionText, ts: Date.now() };
    cleanupPending();
    chrome.storage.session.set(payload, function () {
      if (chrome.runtime.lastError) { /* fall through anyway */ }
      openDecoderTab(tab.id);
    });
    return;
  }

  // Fallback: read the selection from the page ourselves (e.g. editable fields).
  if (tab.url && /^https?:\/\//i.test(tab.url)) {
    getSelectedText(tab.id, function (text) {
      if (!text) {
        openDecoderTab(tab.id); // decoder page will invite manual paste
        return;
      }
      payload[key] = { text: text, ts: Date.now() };
      cleanupPending();
      chrome.storage.session.set(payload, function () {
        openDecoderTab(tab.id);
      });
    });
    return;
  }

  // Pages we cannot script (file:// without permission, chrome://, web store…)
  openDecoderTab(tab.id);
});

/* ---------- decoder page asks for its pending selection ---------- */
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== "getPending") return; // ignore unrelated messages
  var key = STORE_PREFIX + msg.tabId;
  chrome.storage.session.get([key], function (items) {
    var entry = items && items[key];
    if (entry) chrome.storage.session.remove(key); // one-shot: don't leak old tokens
    sendResponse(entry ? { text: entry.text } : {});
  });
  return true; // keep the message channel open for the async response
});
