/* shared.js — base64 decoding + ordertoken parsing, shared by the popup and
 * the context-menu decoder page. Attaches helpers to window (and exports for
 * tests when module.exports exists). No dependencies, runs fully offline.
 */
(function (root) {
  "use strict";

  var SAMPLE =
    "MzM4OSMyMDI1IzM0IzEkJDM4NjIxODAjODYyMTk0ODkjRE1FIzI3NTU2JCQzMzg5IzM4NjIxODAjMjc1NTYjMQ==";

  // ordertoken layout: facilityId#year#week#flag$$patientId#visitId#type#wqOrderNo$$(repeat)
  var SEG1_LABELS = ["FacilityId", "Year", "Week", "Flag"];
  var SEG2_LABELS = ["PatientId", "VisitId", "Type", "WQ order number"];
  // Segment 3 is a cross-check block: facilityId, patientId, wqOrderNo, flag.
  var SEG3_LABELS = ["FacilityId (check)", "PatientId (check)", "WQ order number (check)", "Flag (check)"];

  /* ---------- normalize / validate ---------- */
  function normalize(raw) {
    return String(raw || "")
      .replace(/^ordertoken\s*[:=]\s*/i, "")   // allow pasting "ordertoken: <b64>"
      .replace(/[ \t\r\n]+/g, "");              // strip whitespace/newlines from wrapping
  }

  function isBase64(s) {
    if (!s) return false;
    s = s.replace(/=+$/, "");                   // padding is optional for the check
    if (!s) return false;
    return /^[A-Za-z0-9+/_-]+$/.test(s);
  }

  function toLatin1(bin) {
    var out = "";
    for (var i = 0; i < bin.length; i++) out += String.fromCharCode(bin.charCodeAt(i) & 0xff);
    return out;
  }

  /* ---------- base64 decode with clear errors ---------- */
  function decodeBase64(rawB64) {
    var b64 = normalize(rawB64).replace(/-/g, "+").replace(/_/g, "/");
    if (!b64) throw new Error("Nothing to decode — paste a base64 ordertoken first.");
    if (!isBase64(b64)) {
      throw new Error("The input does not look like base64 (allowed characters: A–Z, a–z, 0–9, +, / and “=” padding).");
    }
    while (b64.length % 4 !== 0) b64 += "=";

    var bin;
    try {
      bin = atob(b64);
    } catch (e) {
      throw new Error("Invalid base64 padding or characters — cannot decode.");
    }

    try {
      return decodeURIComponent(escape(bin)); // UTF-8 aware
    } catch (e2) {
      return toLatin1(bin);                    // non UTF-8 fallback (latin-1 style)
    }
  }

  /* ---------- token parsing ---------- */
  function splitFields(seg) {
    return seg.split("#").map(function (f) { return f.trim(); });
  }

  function labelsFor(idx) {
    return idx === 0 ? SEG1_LABELS : idx === 1 ? SEG2_LABELS : idx === 2 ? SEG3_LABELS : [];
  }

  function parseToken(decoded) {
    var segs = decoded.split("$$").filter(function (s) { return s.length > 0; });
    var parsedSegs = segs.map(splitFields);
    var out = { fields: [], extras: [], segments: parsedSegs, looksLikeToken: false };
    if (!segs.length) return out;

    var f1 = parsedSegs[0];
    var f2 = parsedSegs.length > 1 ? parsedSegs[1] : [];

    var yearIdx = -1;
    for (var i = 0; i < f1.length; i++) {
      if (/^20\d{2}$/.test(f1[i])) { yearIdx = i; break; }
    }
    var year = yearIdx >= 0 ? f1[yearIdx] : "";
    var weekCandidate = yearIdx >= 0 && f1[yearIdx + 1] !== undefined ? f1[yearIdx + 1] : "";
    var week = /^\d{1,2}$/.test(weekCandidate) && Number(weekCandidate) >= 1 && Number(weekCandidate) <= 53
      ? weekCandidate : "";

    function add(label, value, highlight) {
      if (value === undefined || value === null || value === "") return;
      out.fields.push({ label: label, value: value, hl: !!highlight });
    }

    add("FacilityId", f1[0], true);
    add("PatientId", f2[0], true);
    add("VisitId", f2[1], true);
    add("WQ order number", f2[3], true);
    add("Year", year);
    add("Week", week);
    add("Order type", f2[2]);
    add("Flag", f1[yearIdx >= 0 ? yearIdx + 2 : 3]);

    // Track which primary-segment positions were consumed so leftovers stay visible.
    var used1 = {};
    var used2 = {};
    if (f1[0]) used1[0] = 1;
    if (yearIdx >= 0) { used1[yearIdx] = 1; if (week) used1[yearIdx + 1] = 1; }
    // The "Flag" card is taken from the field right after Week when it exists,
    // otherwise from position 3 — mark that position as consumed either way.
    used1[yearIdx >= 0 ? yearIdx + 2 : 3] = 1;
    [0, 1, 3].forEach(function (ix) { if (f2[ix]) used2[ix] = 1; });   // PatientId / VisitId / WQ order no.
    if (f2[2]) used2[2] = 1;                                          // Order type
    f1.forEach(function (v, ix) { if (!used1[ix] && v) out.extras.push({ segment: 1, index: ix, value: v }); });
    f2.forEach(function (v, ix) { if (!used2[ix] && v) out.extras.push({ segment: 2, index: ix, value: v }); });

    out.looksLikeToken = !!(f1[0] && (f2.length >= 2 || year));
    return out;
  }

  var api = {
    SAMPLE: SAMPLE,
    SEG1_LABELS: SEG1_LABELS,
    SEG2_LABELS: SEG2_LABELS,
    SEG3_LABELS: SEG3_LABELS,
    normalize: normalize,
    isBase64: isBase64,
    decodeBase64: decodeBase64,
    labelsFor: labelsFor,
    parseToken: parseToken
  };

  root.TokenDecoder = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
