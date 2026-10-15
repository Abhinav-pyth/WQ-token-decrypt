/* tokens.js — ordertoken format knowledge (labels, sample token, segment split).
 * Single source of truth shared by shared.js (parsing) and popup.html/decode.html
 * (placeholder text). No dependencies; safe to load as a classic script or require.
 */
(function (root) {
  "use strict";

  // Sample ordertoken used for the input placeholder and the "Sample" button.
  const SAMPLE =
    "MzM4OSMyMDI1IzM0IzEkJDM4NjIxODAjODYyMTk0ODkjRE1FIzI3NTU2JCQzMzg5IzM4NjIxODAjMjc1NTYjMQ==";

  // ordertoken layout: facilityId#year#week#flag$$patientId#visitId#type#wqOrderNo$$(repeat)
  const SEG1_LABELS = ["FacilityId", "Year", "Week", "Flag"];
  const SEG2_LABELS = ["PatientId", "VisitId", "Type", "WQ order number"];
  // Segment 3 is a cross-check block: facilityId, patientId, wqOrderNo, flag.
  const SEG3_LABELS = ["FacilityId (check)", "PatientId (check)", "WQ order number (check)", "Flag (check)"];

  // Multi-record separator between segments; fields within a segment use "#".
  const SEGMENT_SEPARATOR = "$$";
  const FIELD_SEPARATOR = "#";

  function labelsFor(segmentIndex) {
    return [SEG1_LABELS, SEG2_LABELS, SEG3_LABELS][segmentIndex] || [];
  }

  const api = {
    SAMPLE,
    SEG1_LABELS,
    SEG2_LABELS,
    SEG3_LABELS,
    SEGMENT_SEPARATOR,
    FIELD_SEPARATOR,
    labelsFor
  };

  root.OrderTokenFormat = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
