/* dom.js — tiny DOM helpers shared by decoder-ui.js. No dependencies. */
(function (root) {
  "use strict";

  // Create an element with attributes ("class" maps to className), text content,
  // and optional event listeners: on: { click(fn) }.
  function createElement(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;
      if (key.startsWith("on") && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "text") {
        node.textContent = value;
      } else if (key === "class") {
        node.className = value;
      } else {
        node.setAttribute(key, value);
      }
    }
    for (const child of [].concat(children)) {
      if (child == null) continue;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  // Copy text to the clipboard, falling back to a hidden textarea + execCommand
  // when the async Clipboard API is unavailable or denied.
  function copyToClipboard(text) {
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        () => true,
        () => legacyCopy(text)
      );
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    const ta = createElement("textarea", {
      class: "visually-hidden-copy",
      style: "position:fixed;top:0;left:0;opacity:0;"
    });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  root.DomHelpers = { createElement, copyToClipboard };
  if (typeof module !== "undefined" && module.exports) module.exports = root.DomHelpers;
})(typeof window !== "undefined" ? window : globalThis);
