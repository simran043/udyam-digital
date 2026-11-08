// Smart KYC rules, fed with OCR-style text so the tests run without OCR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDocument, validateApplication, lookupGstin } from "./kyc.js";

const ocr = (text, confidence = 92) => ({ text, confidence });

const gst = ({ gstin, legal, trade, constitution = "Proprietorship", address }) =>
  parseDocument(
    "gst_certificate",
    ocr(`Specimen: GST Registration Certificate
GSTIN ${gstin}
Legal name ${legal}
Trade name ${trade}
Constitution ${constitution}
Address of principal ${address}
place of business
Date of liability 2020-01-01`),
  );
const udyam = (number, name) =>
  parseDocument("udyam_certificate", ocr(`Specimen: Udyam Registration Certificate\nUdyam reg. number ${number}\nEnterprise name ${name}\nMajor activity Services`));
const signatory = (name, designation, business, validTill = "2029-01-01") =>
  parseDocument(
    "signatory_id",
    ocr(`Specimen: Authorised Signatory ID\nName\n${name}\nDesignation\n${designation}\nFor business\n${business}\nID no.\nSYN-ID-111111\nValid till\n${validTill}`),
  );
const bill = (billedTo, address, date) =>
  parseDocument("address_proof", ocr(`Specimen: Electricity Bill\nConsumer no. 1234567890\nBilled to ${billedTo}\nSupply address ${address}\nBill date ${date}`));

// K12 in the specimen pack: a clean application.
const clean = () => ({
  gst_certificate: gst({
    gstin: "37NBLXS1145E1ZU",
    legal: "Pooja Agarwal (Prop. Star Electronics)",
    trade: "Star Electronics",
    address: "Shop/Unit 216, Nehru Nagar, Visakhapatnam, Andhra Pradesh - 762071",
  }),
  udyam_certificate: udyam("UDYAM-AP-00-5186772", "Star Electronics"),
  signatory_id: signatory("Pooja Agarwal", "Owner", "Star Electronics"),
  address_proof: bill("Star Electronics", "Shop/Unit 216, Nehru Nagar, Visakhapatnam, Andhra Pradesh - 762071", "2026-07-06"),
});
const failed = (result) => result.checks.filter((c) => c.status === "fail").map((c) => c.id);

test("a clean application is verified", () => {
  const r = validateApplication(clean());
  assert.equal(r.verdict, "verified");
  assert.deepEqual(failed(r), []);
});

test("cancelled GSTIN goes to manual review", () => {
  const docs = clean();
  docs.gst_certificate = gst({
    gstin: "37IHKXV5167L1ZS",
    legal: "Neha Kaur (Prop. Vindhya Tours & Travels)",
    trade: "Vindhya Tours & Travels",
    address: "Shop/Unit 1, Tech Park Road, Visakhapatnam, Andhra Pradesh - 118383",
  });
  assert.equal(lookupGstin("37IHKXV5167L1ZS").status, "Cancelled");
  const r = validateApplication(docs);
  assert.ok(failed(r).includes("gstin_active"));
  assert.equal(r.verdict, "manual_review");
});

test("a certificate that disagrees with the registry is flagged as altered", () => {
  const docs = clean();
  docs.gst_certificate = gst({
    gstin: "07CPCXN0398P1ZT",
    legal: "Neha Banerjee (Prop. Shri Physio Clinic)",
    trade: "Neelgiri Physio Clinic",
    address: "Shop/Unit 52, Transport Nagar, Delhi, Delhi - 334596",
  });
  assert.ok(failed(validateApplication(docs)).includes("gst_doc_matches_registry"));
});

test("a mistyped GSTIN fails the checksum and names the likely business", () => {
  const docs = clean();
  docs.gst_certificate = gst({
    gstin: "27QHIXK0658U1ZL",
    legal: "Kaveri Stays LLP",
    trade: "Kaveri Stays LLP",
    constitution: "Limited Liability Partnership",
    address: "Shop/Unit 21, Sector 14, Mumbai, Maharashtra - 570043",
  });
  const check = validateApplication(docs).checks.find((c) => c.id === "gstin_valid");
  assert.equal(check.status, "fail");
  assert.match(check.detail, /Kaveri Stays LLP, Mumbai/);
});

test("missing Udyam number on the certificate is caught", () => {
  const docs = clean();
  docs.udyam_certificate = udyam("", "Star Electronics");
  assert.ok(failed(validateApplication(docs)).includes("udyam_number"));
});

test("an address proof older than 90 days is rejected", () => {
  const docs = clean();
  docs.address_proof = bill("Star Electronics", "Shop/Unit 216, Nehru Nagar, Visakhapatnam, Andhra Pradesh - 762071", "2025-10-31");
  assert.ok(failed(validateApplication(docs)).includes("address_recent"));
});

test("an 'Owner' cannot sign for an LLP or a company", () => {
  const docs = {
    gst_certificate: gst({
      gstin: "03KGZXT1320R1ZZ",
      legal: "Trinity Bake House Pvt Ltd",
      trade: "Trinity Bake House Pvt Ltd",
      constitution: "Private Limited Company",
      address: "Shop/Unit 188, Industrial Area Phase 2, Ludhiana, Punjab - 541498",
    }),
    signatory_id: signatory("Vikram Pillai", "Owner", "Trinity Bake House Pvt Ltd"),
    address_proof: bill("Trinity Bake House Pvt Ltd", "Shop/Unit 188, Industrial Area Phase 2, Ludhiana, Punjab - 541498", "2026-07-01"),
  };
  assert.ok(failed(validateApplication(docs)).includes("signatory_role"));
});

test("a missing Udyam certificate is looked up in the registry instead", () => {
  const docs = clean();
  delete docs.udyam_certificate;
  const check = validateApplication(docs).checks.find((c) => c.id === "udyam_present");
  assert.equal(check.status, "warn");
  assert.match(check.title, /found in registry/);
});

test("unreadable or wrong documents ask for a retake", () => {
  const blurry = parseDocument("gst_certificate", ocr("— ey | pos oe ne", 31));
  assert.equal(blurry.readable, false);
  const wrong = parseDocument("gst_certificate", ocr("Specimen: Electricity Bill\nBilled to X\nSupply address Y 123456\nBill date 2026-07-01"));
  assert.equal(wrong.wrongSlot, true);
});
