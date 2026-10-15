/* shared.js — base64 decoding + ordertoken parsing, shared by the popup and
 * the context-menu decoder page. Requires tokens.js (window.OrderTokenFormat)
 * to be loaded first. Attaches helpers to window (and exports for tests when
 * module.exports exists). Runs fully offline.
 */
(function (root) {
  "use strict";

  const F = root.OrderTokenFormat;

  /* ---------- normalize / validate ---------- */

  // Strip an optional "ordertoken:"/"ordertoken=" prefix and all whitespace so
  // pasted, line-wrapped values decode cleanly.
  function normalize(raw) {
    return String(raw || "")
      .replace(/^ordertoken\s*[:=]\s*/i, "")
      .replace(/\s+/g, "");
  }

  // Loose sanity check before attempting atob(); padding is optional here.
  function isBase64(s) {
    const body = String(s || "").replace(/=+$/, "");
    return body.length > 0 && /^[A-Za-z0-9+/_-]+$/.test(body);
  }

  // Interpret a binary string as latin-1 characters (lossless fallback when
  // the decoded bytes are not valid UTF-8).
  function toLatin1(bin) {
    let out = "";
    for (let i = 0; i < bin.length; i++) out += String.fromCharCode(bin.charCodeAt(i) & 0xff);
    return out;
  }

  /* ---------- base64 decode with clear errors ---------- */

  function decodeBase64(rawB64) {
    const b64 = normalize(rawB64).replace(/-/g, "+").replace(/_/g, "/");
    if (!b64) throw new Error("Nothing to decode — paste a base64 ordertoken first.");
    if (!isBase64(b64)) {
      throw new Error("The input does not look like base64 (allowed characters: A–Z, a–z, 0–9, +, / and “=” padding).");
    }

    let bin;
    try {
      bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
    } catch (e) {
      throw new Error("Invalid base64 padding or characters — cannot decode.");
    }

    try {
      return decodeURIComponent(escape(bin)); // UTF-8 aware
    } catch (e) {
      return toLatin1(bin);                   // non-UTF-8 fallback (latin-1 style)
    }
  }

  /* ---------- token parsing ---------- */

  // Year/week live right after the facility id in segment 1; find the year by
  // shape ("20xx") instead of trusting a fixed position.
  function findYear(fields) {
    return fields.findIndex((f) => /^20\d{2}$/.test(f));
  }

  function parseWeek(candidate) {
    const n = Number(candidate);
    return /^\d{1,2}$/.test(candidate) && n >= 1 && n <= 53 ? candidate : "";
  }

  function parseToken(decoded) {
    const segments = decoded
      .split(F.SEGMENT_SEPARATOR)
      .filter((s) => s.length > 0)
      .map((seg) => seg.split(F.FIELD_SEPARATOR).map((f) => f.trim()));

    const out = { fields: [], extras: [], segments, looksLikeToken: false };
    if (!segments.length) return out;

    const [seg1 = [], seg2 = []] = segments;
    const yearIdx = findYear(seg1);
    const year = yearIdx >= 0 ? seg1[yearIdx] : "";
    const week = parseWeek(yearIdx >= 0 ? seg1[yearIdx + 1] ?? "" : "");
    const flagIdx = yearIdx >= 0 ? yearIdx + 2 : 3;

    const add = (label, value, highlight = false) => {
      if (value === undefined || value === null || value === "") return;
      out.fields.push({ label, value, hl: highlight });
    };

    add("FacilityId", seg1[0], true);
    add("PatientId", seg2[0], true);
    add("VisitId", seg2[1], true);
    add("WQ order number", seg2[3], true);
    add("Year", year);
    add("Week", week);
    add("Order type", seg2[2]);
    add("Flag", seg1[flagIdx]);

    // Track which primary-segment positions were consumed so leftovers stay
    // visible in the "Extra / unparsed" section. The Flag card is taken from
    // the field right after Week when it exists, otherwise position 3 — mark
    // that position as consumed either way.
    const used1 = new Set(seg1[0] ? [0] : []);
    if (yearIdx >= 0) {
      used1.add(yearIdx);
      if (week) used1.add(yearIdx + 1);
    }
    used1.add(flagIdx);
    const used2 = new Set([0, 1, 2, 3].filter((ix) => seg2[ix]));

    seg1.forEach((v, ix) => { if (v && !used1.has(ix)) out.extras.push({ segment: 1, index: ix, value: v }); });
    seg2.forEach((v, ix) => { if (v && !used2.has(ix)) out.extras.push({ segment: 2, index: ix, value: v }); });

    out.looksLikeToken = !!(seg1[0] && (seg2.length >= 2 || year));
    return out;
  }

  const api = {
    SAMPLE: F.SAMPLE,
    SEG1_LABELS: F.SEG1_LABELS,
    SEG2_LABELS: F.SEG2_LABELS,
    SEG3_LABELS: F.SEG3_LABELS,
    normalize,
    isBase64,
    decodeBase64,
    labelsFor: F.labelsFor,
    parseToken
  };

  root.TokenDecoder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
