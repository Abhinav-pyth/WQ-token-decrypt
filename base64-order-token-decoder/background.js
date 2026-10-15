/* background.js (MV3 service worker)
 * Adds "Decode Base64 / ordertoken" to the right-click context menu.
 * Flow:
 *   1. Register the menu item on install/startup.
 *   2. On click, capture the selected text (from the menu info, or by
 *      scripting into http/https pages for editable fields).
 *   3. Store it in chrome.storage.session keyed by tab id and open
 *      decode.html?tab=<id>, which fetches the entry once and clears it.
 */
"use strict";

const MENU_ID = "otd-decode-selection";
const STORE_PREFIX = "pending:";
const MAX_PENDING = 8; // keep at most this many stored selections around

const store = () => chrome.storage.session;
const pendingKey = (tabId) => STORE_PREFIX + tabId;

/* ---------- context menu registration ---------- */

function registerMenu() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Decode Base64 / ordertoken",
    contexts: ["selection", "editable"]
  });
}

chrome.runtime.onInstalled.addListener(registerMenu);
// Keep the menu available even after browser restarts.
chrome.runtime.onStartup.addListener(registerMenu);

/* ---------- helpers ---------- */

// Drop the oldest pending entries when more than MAX_PENDING are stored.
// Keys are "pending:<tabId>", so numeric sort approximates insertion order.
function cleanupPending() {
  store().get(null).then((items) => {
    const keys = Object.keys(items || {})
      .filter((k) => k.startsWith(STORE_PREFIX))
      .sort((a, b) => Number(a.slice(STORE_PREFIX.length)) - Number(b.slice(STORE_PREFIX.length)));
    if (keys.length <= MAX_PENDING) return;
    return store().remove(keys.slice(0, keys.length - MAX_PENDING));
  }).catch(() => { /* storage unavailable — nothing to clean */ });
}

function storeAndOpen(tabId, text) {
  const entry = {};
  entry[pendingKey(tabId)] = { text, ts: Date.now() };
  cleanupPending();
  return store().set(entry).catch(() => { /* fall through anyway */ })
    .then(() => chrome.tabs.create({ url: chrome.runtime.getURL("decode.html?tab=" + tabId) }));
}

// Just open the decoder page; it will invite a manual paste.
function openDecoderTab(tabId) {
  return chrome.tabs.create({ url: chrome.runtime.getURL("decode.html?tab=" + tabId) });
}

// Injected into the page: prefer an explicit selection inside an editable
// field, then the normal text selection, then the whole field value.
function grabTextFromPage() {
  const active = document.activeElement;
  const EDITABLE_TYPES = /^(text|search|url|tel|password|email|number)$/i;
  const isEditable =
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && EDITABLE_TYPES.test(active.type || ""));

  if (isEditable) {
    try {
      const { selectionStart: s, selectionEnd: e } = active;
      if (typeof s === "number" && typeof e === "number" && e > s) {
        return String(active.value || "").slice(s, e);
      }
    } catch (err) { /* some inputs throw on selection access */ }
  }

  const sel = window.getSelection ? String(window.getSelection() || "") : "";
  if (sel.trim()) return sel;
  return isEditable ? String(active.value || "") : "";
}

async function getSelectedText(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: grabTextFromPage
    });
    const last = results && results[results.length - 1];
    return last && last.result ? String(last.result) : "";
  } catch (e) {
    return ""; // injection not allowed on this page
  }
}

const canScript = (url) => /^https?:\/\//i.test(url || "");

/* ---------- menu click ---------- */

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || typeof tab.id !== "number") return;

  // Fast path: Chrome hands us the selection directly for "selection" menus.
  if (typeof info.selectionText === "string" && info.selectionText.trim()) {
    await storeAndOpen(tab.id, info.selectionText);
    return;
  }

  // Fallback: read the selection from the page ourselves (e.g. editable fields).
  if (canScript(tab.url)) {
    const text = await getSelectedText(tab.id);
    if (text) {
      await storeAndOpen(tab.id, text);
    } else {
      await openDecoderTab(tab.id);
    }
    return;
  }

  // Pages we cannot script (file:// without permission, chrome://, web store…)
  await openDecoderTab(tab.id);
});

/* ---------- decoder page asks for its pending selection ---------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "getPending") return; // ignore unrelated messages
  const key = pendingKey(msg.tabId);
  store().get([key]).then((items) => {
    const entry = items && items[key];
    if (entry) return store().remove(key).then(() => entry); // one-shot: don't leak old tokens
    return null;
  }).then((entry) => {
    sendResponse(entry ? { text: entry.text } : {});
  }).catch(() => sendResponse({}));
  return true; // keep the message channel open for the async response
});
