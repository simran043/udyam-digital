import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGstinFormat, repairOcrGstin, repairOcrUdyam, maskGstin, maskName, nameSimilarity, daysBetween } from "./validators.js";
import { gstinRegistry } from "./data.js";

test("every GSTIN in the mock registry passes format and checksum", () => {
  for (const gstin of gstinRegistry.keys()) assert.ok(validateGstinFormat(gstin).ok, gstin);
});

test("checksum catches a single changed character", () => {
  assert.equal(validateGstinFormat("08YKZXS5189L1ZO").ok, true);
  const r = validateGstinFormat("08YKZXS8189L1ZO");
  assert.equal(r.ok, false);
  assert.match(r.reason, /Checksum/);
});

test("OCR look-alike characters are repaired by position", () => {
  assert.equal(repairOcrGstin("27XUIXGO767D1ZP"), "27XUIXG0767D1ZP"); // O -> 0 in the PAN digits
  assert.equal(repairOcrGstin("24X0RXG9365M173"), "24XORXG9365M1Z3"); // 0 -> O in the PAN letters, 7 -> Z
  assert.equal(repairOcrGstin("37NBLXS1145E17U"), "37NBLXS1145E1ZU");
  assert.equal(repairOcrUdyam("UDYAM-WB-00-5O53330"), "UDYAM-WB-00-5053330");
});

test("masking hides the middle of identifiers and names", () => {
  assert.equal(maskGstin("27QHJXK0658U1ZL"), "27*********U1ZL");
  assert.equal(maskName("Neha Banerjee"), "N*** B****");
});

test("name similarity ignores proprietor and company suffixes", () => {
  assert.equal(nameSimilarity("Kaveri Stays LLP", "Kaveri Stays"), 1);
  assert.ok(nameSimilarity("Shri Physio Clinic", "Neelgiri Physio Clinic") < 1);
});

test("dates are measured against the dataset's fixed today (2026-07-15)", () => {
  assert.equal(daysBetween("2026-07-05"), 10);
  assert.equal(daysBetween("2025-10-31"), 257);
});
