// Smart KYC: registry lookups, document field extraction and validation.
import { gstinRegistry, udyamRegistry } from "./data.js";
import {
  TODAY,
  validateGstinFormat,
  validateUdyamFormat,
  repairOcrGstin,
  repairOcrUdyam,
  nameSimilarity,
  normaliseName,
  daysBetween,
  extractPinCode,
  maskGstin,
  maskUdyam,
  maskName,
  maskId,
  STATE_CODES,
} from "./validators.js";

export const DOC_TYPES = {
  gst_certificate: "GST registration certificate",
  udyam_certificate: "Udyam registration certificate",
  signatory_id: "Authorised signatory ID",
  address_proof: "Address proof (utility bill)",
};

export const ADDRESS_PROOF_MAX_AGE_DAYS = 90;

// ---------- registry lookups (mock government APIs) ----------
export function lookupGstin(raw) {
  const format = validateGstinFormat(raw);
  if (!format.ok) {
    return { found: false, gstin: format.gstin, error: format.reason, suggestions: nearMatches(format.gstin) };
  }
  const record = gstinRegistry.get(format.gstin);
  if (!record) return { found: false, gstin: format.gstin, error: "GSTIN not found in the GST registry" };
  return {
    found: true,
    gstin: record.gstin,
    legalName: record.legal_name,
    tradeName: record.trade_name,
    constitution: record.constitution,
    address: record.principal_place_of_business,
    state: record.state,
    registrationDate: record.registration_date,
    status: record.status,
    city: cityFromAddress(record.principal_place_of_business),
  };
}

export function lookupUdyam(raw) {
  const format = validateUdyamFormat(raw);
  if (!format.ok) return { found: false, udyam: format.udyam, error: format.reason };
  const record = udyamRegistry.get(format.udyam);
  if (!record) return { found: false, udyam: format.udyam, error: "Udyam number not found in the Udyam registry" };
  return {
    found: true,
    udyam: record.udyam_number,
    enterpriseName: record.enterprise_name,
    enterpriseType: record.enterprise_type,
    majorActivity: record.major_activity,
    activity: record.nic_description,
    state: record.state,
    city: record.city,
    registrationDate: record.date_of_registration,
  };
}

export function findUdyamByBusiness(name, city) {
  for (const record of udyamRegistry.values()) {
    if (record.city === city && nameSimilarity(record.enterprise_name, name) === 1) return lookupUdyam(record.udyam_number);
  }
  return null;
}

function cityFromAddress(address) {
  const parts = String(address).split(",").map((s) => s.trim());
  return parts.length >= 3 ? parts[parts.length - 2] : null;
}

// Registered GSTINs within two characters of a mistyped number (typo or OCR
// slip). Only used to tell the applicant which record we think they meant.
function nearMatches(gstin, maxDiff = 2) {
  if (!gstin || gstin.length !== 15) return [];
  const out = [];
  for (const candidate of gstinRegistry.keys()) {
    if (candidate.slice(0, 2) !== gstin.slice(0, 2)) continue;
    let diff = 0;
    for (let i = 0; i < 15 && diff <= maxDiff; i++) if (candidate[i] !== gstin[i]) diff++;
    if (diff <= maxDiff) out.push(candidate);
  }
  return out.slice(0, 3);
}

// Exact comparison that ignores only case, spacing and punctuation - used
// where a single changed word matters (e.g. a tampered legal name).
const strictKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// ---------- OCR text -> fields ----------
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const isoDate = (s) => {
  const m = String(s || "").match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

export function detectDocType(text) {
  const t = text.toLowerCase();
  if (/gst\s*registration/.test(t)) return "gst_certificate";
  if (/udyam\s*registration/.test(t)) return "udyam_certificate";
  if (/signatory/.test(t)) return "signatory_id";
  if (/electricity\s*bill|supply\s*address|consumer\s*no/.test(t)) return "address_proof";
  return null;
}

function valueAfter(lines, labelRegex) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(labelRegex);
    if (m) {
      const rest = clean(lines[i].slice(m.index + m[0].length));
      return rest || clean(lines[i + 1]);
    }
  }
  return "";
}

// Two-line values such as "Address of principal ... / place of business ...".
function joinedValue(lines, firstLabel, secondLabel) {
  const first = valueAfter(lines, firstLabel);
  const idx = lines.findIndex((l) => secondLabel.test(l));
  const second = idx >= 0 ? clean(lines[idx].replace(secondLabel, "")) : "";
  return joinHyphenated(first, second);
}

// Wrapped addresses split words across lines ("A / ndhra Pradesh").
function joinHyphenated(first, second) {
  if (!second) return first;
  if (/[A-Za-z]$/.test(first) && /^[a-z]/.test(second)) return clean(first + second);
  return clean(`${first} ${second}`);
}

export function extractFields(docType, text) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  switch (docType) {
    case "gst_certificate": {
      const rawGstin = valueAfter(lines, /^GSTIN\b/i).split(" ").slice(0, 2).join("");
      return {
        gstin: repairOcrGstin(rawGstin) || null,
        gstinAsRead: rawGstin || null,
        legalName: valueAfter(lines, /^Legal\s*name/i) || null,
        tradeName: valueAfter(lines, /^Trade\s*name/i) || null,
        constitution: valueAfter(lines, /^Constitution/i) || null,
        address: joinedValue(lines, /^Address of principal/i, /^place of business/i) || null,
        liabilityDate: isoDate(valueAfter(lines, /^Date of liability/i)),
      };
    }
    case "udyam_certificate": {
      const raw = valueAfter(lines, /^Udyam reg\.?\s*number/i);
      return {
        udyam: repairOcrUdyam(raw),
        enterpriseName: valueAfter(lines, /^Enterprise name/i) || null,
        majorActivity: valueAfter(lines, /^Major activity/i) || null,
        city: valueAfter(lines, /^City\b/i) || null,
        state: valueAfter(lines, /^State\b/i) || null,
        registrationDate: isoDate(valueAfter(lines, /^Date of registration/i)),
      };
    }
    case "signatory_id": {
      // Labels sit on their own line with the value on the next line.
      const next = (label) => {
        const i = lines.findIndex((l) => label.test(l));
        return i >= 0 ? clean(lines[i + 1]) : null;
      };
      return {
        name: next(/^Name$/i),
        designation: next(/^Designation$/i),
        business: next(/^For business$/i),
        idNumber: next(/^ID no\.?$/i),
        validTill: isoDate(next(/^Valid till$/i)),
      };
    }
    case "address_proof": {
      const idx = lines.findIndex((l) => /^Supply address/i.test(l));
      let address = idx >= 0 ? clean(lines[idx].replace(/^Supply address/i, "")) : "";
      if (idx >= 0 && lines[idx + 1] && !/^Bill date/i.test(lines[idx + 1])) address = joinHyphenated(address, lines[idx + 1]);
      return {
        consumerNo: valueAfter(lines, /^Consumer no\.?/i) || null,
        billedTo: valueAfter(lines, /^Billed to/i) || null,
        address: address || null,
        billDate: isoDate(valueAfter(lines, /^Bill date/i)),
      };
    }
    default:
      return {};
  }
}

const REQUIRED_FIELDS = {
  gst_certificate: ["gstin", "legalName", "tradeName"],
  udyam_certificate: ["enterpriseName"],
  signatory_id: ["name", "validTill"],
  address_proof: ["billedTo", "billDate", "address"],
};

/** Turns raw OCR output into a parsed document with a readability verdict. */
export function parseDocument(expectedType, ocr) {
  const detected = detectDocType(ocr.text);
  const docType = detected || expectedType;
  const fields = extractFields(docType, ocr.text);
  const missing = (REQUIRED_FIELDS[docType] || []).filter((f) => !fields[f]);
  const gstinReadable = docType !== "gst_certificate" || (fields.gstin && fields.gstin.length === 15);
  const readable = Boolean(detected) && missing.length === 0 && gstinReadable && ocr.confidence >= 55;
  return {
    expectedType,
    detectedType: detected,
    wrongSlot: Boolean(detected && expectedType && detected !== expectedType),
    readable,
    confidence: Math.round(ocr.confidence),
    fields,
  };
}

// ---------- cross-document validation ----------
const AUTHORISED_ROLES = {
  Proprietorship: ["owner", "proprietor"],
  "Limited Liability Partnership": ["partner", "designated partner"],
  Partnership: ["partner"],
  "Private Limited Company": ["director", "managing director", "authorised signatory"],
  "Public Limited Company": ["director", "managing director", "authorised signatory"],
};

function proprietorName(legalName) {
  const m = String(legalName || "").match(/^(.*?)\s*\(Prop\./i);
  return m ? clean(m[1]) : null;
}

/**
 * docs: { gst_certificate?, udyam_certificate?, signatory_id?, address_proof? } (parsed documents)
 * Returns ordered checks with status pass | warn | fail and an overall verdict.
 */
export function validateApplication(docs) {
  const checks = [];
  const add = (id, status, title, detail, fix) => checks.push({ id, status, title, detail, fix });

  // Every document must be present, in the right slot and readable.
  for (const [type, label] of Object.entries(DOC_TYPES)) {
    const doc = docs[type];
    if (!doc) {
      if (type === "udyam_certificate") continue; // handled below with a registry fallback
      add(`${type}_present`, "fail", `${label} missing`, "This document has not been uploaded yet.", "Upload a clear photo or PDF scan.");
    } else if (doc.wrongSlot) {
      add(`${type}_slot`, "fail", `Wrong document for ${label}`, `This looks like a ${DOC_TYPES[doc.detectedType]}.`, `Upload the ${label} here.`);
    } else if (!doc.readable) {
      add(
        `${type}_readable`,
        "fail",
        `${label} is not readable`,
        `The image is too blurred or low quality to read reliably (OCR confidence ${doc.confidence}%).`,
        "Retake the photo flat, in good light, with all four corners visible.",
      );
    }
  }

  const gstDoc = docs.gst_certificate?.readable ? docs.gst_certificate.fields : null;
  let registry = null;

  // GSTIN: structure, checksum, registry record and status.
  if (gstDoc) {
    const lookup = lookupGstin(gstDoc.gstin);
    if (!lookup.found) {
      const match = (lookup.suggestions || [])
        .map((g) => gstinRegistry.get(g))
        .find((r) => strictKey(r.trade_name) === strictKey(gstDoc.tradeName));
      // Name the business, not the number: the applicant re-checks their own certificate.
      const hint = match
        ? ` The GST registry has a GSTIN for ${match.trade_name}, ${cityFromAddress(match.principal_place_of_business)} that differs by one or two characters - the certificate may have a typo or been altered.`
        : "";
      add("gstin_valid", "fail", "GSTIN could not be verified", `${lookup.error}.${hint}`, "Check the GSTIN on the certificate or upload a fresh copy from the GST portal.");
    } else {
      registry = lookup;
      add("gstin_valid", "pass", "GSTIN verified with GST registry", `${maskGstin(lookup.gstin)} · ${lookup.state} · registered ${lookup.registrationDate}`);
      if (lookup.status !== "Active") {
        add("gstin_active", "fail", `GSTIN is ${lookup.status}`, `The GST registry shows this registration as ${lookup.status.toLowerCase()}.`, "GSTIN-dependent products need an active registration. Restore it, or continue without GSTIN-based products.");
      } else {
        add("gstin_active", "pass", "GSTIN is active", "Registration status is Active.");
      }
      // The certificate must agree with the registry (tampering / outdated copy).
      const legalOk = strictKey(gstDoc.legalName) === strictKey(lookup.legalName);
      const tradeOk = strictKey(gstDoc.tradeName) === strictKey(lookup.tradeName);
      if (legalOk && tradeOk) {
        add("gst_doc_matches_registry", "pass", "Certificate matches GST registry", "Legal and trade names match the registry record.");
      } else {
        const field = !legalOk ? "legal name" : "trade name";
        add(
          "gst_doc_matches_registry",
          "fail",
          "Certificate does not match GST registry",
          `The ${field} on the certificate ("${!legalOk ? gstDoc.legalName : gstDoc.tradeName}") differs from the registry ("${!legalOk ? lookup.legalName : lookup.tradeName}").`,
          "Download a fresh certificate from the GST portal. Altered documents are referred for manual review.",
        );
      }
    }
  }

  const businessName = registry?.tradeName || gstDoc?.tradeName;
  const businessAddress = registry?.address || gstDoc?.address;
  const constitution = registry?.constitution || gstDoc?.constitution;

  // Udyam: number present, valid and consistent with the business.
  const udyamDoc = docs.udyam_certificate;
  if (!udyamDoc) {
    const found = businessName && registry ? findUdyamByBusiness(businessName, registry.city) : null;
    if (found) {
      add("udyam_present", "warn", "Udyam certificate not uploaded - found in registry", `We found ${maskUdyam(found.udyam)} for ${found.enterpriseName}, ${found.city}.`, "Confirm this is your Udyam registration, or upload the certificate.");
    } else {
      add("udyam_present", "warn", "No Udyam registration", "Udyam registration is optional for most products, but it unlocks MSME benefits.", "Register free at the Udyam portal - we can help.");
    }
  } else if (udyamDoc.readable) {
    const u = udyamDoc.fields;
    if (!u.udyam) {
      add("udyam_number", "fail", "Udyam number missing on certificate", "The certificate has no Udyam registration number.", "Upload the complete certificate, or type the Udyam number so we can verify it.");
    } else {
      const lookup = lookupUdyam(u.udyam);
      if (!lookup.found) {
        add("udyam_number", "fail", "Udyam number not verified", lookup.error, "Check the number against the Udyam portal.");
      } else {
        const sameName = nameSimilarity(lookup.enterpriseName, businessName || u.enterpriseName) >= 0.99;
        add(
          "udyam_number",
          sameName ? "pass" : "fail",
          sameName ? "Udyam verified with registry" : "Udyam belongs to a different business",
          sameName
            ? `${maskUdyam(lookup.udyam)} · ${lookup.enterpriseType} enterprise · ${lookup.city}`
            : `Registry name "${lookup.enterpriseName}" does not match "${businessName}".`,
          sameName ? undefined : "Upload the Udyam certificate for this business.",
        );
        if (sameName && registry && lookup.state !== registry.state) {
          add("udyam_state", "warn", "Udyam and GST states differ", `Udyam: ${lookup.state}; GST: ${registry.state}.`, "Fine if you operate in several states; otherwise check the documents.");
        }
      }
    }
  }

  // Signatory: valid ID, belongs to this business, holds an authorised role.
  const sig = docs.signatory_id?.readable ? docs.signatory_id.fields : null;
  if (sig) {
    const daysLeft = daysBetween(TODAY, sig.validTill);
    if (daysLeft === null || daysLeft < 0) {
      add("signatory_valid", "fail", "Signatory ID has expired", `Valid till ${sig.validTill}.`, "Upload a current ID.");
    } else {
      add("signatory_valid", "pass", "Signatory ID is valid", `ID ${maskId(sig.idNumber)} valid till ${sig.validTill}.`);
    }
    if (businessName && nameSimilarity(sig.business, businessName) < 0.99) {
      add("signatory_business", "fail", "Signatory ID is for another business", `ID is for "${sig.business}", application is for "${businessName}".`, "Upload the ID issued for this business.");
    }
    const role = String(sig.designation || "").toLowerCase();
    const allowed = AUTHORISED_ROLES[constitution] || [];
    const proprietor = proprietorName(registry?.legalName || gstDoc?.legalName);
    if (constitution === "Proprietorship" && proprietor) {
      if (nameSimilarity(proprietor, sig.name) >= 0.99) {
        add(
          "signatory_role",
          allowed.includes(role) ? "pass" : "warn",
          "Signatory is the registered proprietor",
          allowed.includes(role)
            ? `${maskName(sig.name)} is the proprietor on the GST record.`
            : `${maskName(sig.name)} is the proprietor, but the ID shows the role "${sig.designation}".`,
          allowed.includes(role) ? undefined : "We will ask the proprietor to confirm with Aadhaar e-sign.",
        );
      } else {
        add("signatory_role", "fail", "Signatory is not the proprietor", `The GST record names the proprietor as ${maskName(proprietor)}, but the ID is for ${maskName(sig.name)}.`, "The proprietor should sign, or upload an authorisation letter signed by the proprietor.");
      }
    } else if (allowed.length && !allowed.includes(role)) {
      add(
        "signatory_role",
        "fail",
        `"${sig.designation}" cannot sign for a ${constitution}`,
        `A ${constitution} must be signed for by a ${allowed.join(" or ")}.`,
        constitution.includes("Company") ? "Upload a board resolution naming the signatory, or have a director sign." : "Have a designated partner sign, or upload a partner authorisation letter.",
      );
    } else if (allowed.length) {
      add("signatory_role", "pass", "Signatory role is authorised", `${sig.designation} of a ${constitution}.`);
    }
  }

  // Address proof: recent, for this business, same premises as GST.
  const bill = docs.address_proof?.readable ? docs.address_proof.fields : null;
  if (bill) {
    const age = daysBetween(bill.billDate);
    if (age === null || age > ADDRESS_PROOF_MAX_AGE_DAYS) {
      add("address_recent", "fail", "Address proof is too old", `Bill dated ${bill.billDate} is ${age} days old; it must be within ${ADDRESS_PROOF_MAX_AGE_DAYS} days.`, "Upload a utility bill from the last 3 months.");
    } else {
      add("address_recent", "pass", "Address proof is recent", `Bill dated ${bill.billDate} (${age} days old).`);
    }
    if (businessName && nameSimilarity(bill.billedTo, businessName) < 0.99 && nameSimilarity(bill.billedTo, registry?.legalName) < 0.99) {
      add("address_name", "fail", "Bill is in another name", `Billed to "${bill.billedTo}".`, "Upload a bill in the business name, or a rent agreement plus the owner's bill.");
    }
    const billPin = extractPinCode(bill.address);
    const gstPin = extractPinCode(businessAddress);
    if (billPin && gstPin && billPin !== gstPin) {
      add("address_match", "fail", "Address differs from GST address", `Bill PIN ${billPin}, GST PIN ${gstPin}.`, "Installation must be at the registered premises, or add this site as a branch.");
    } else if (billPin && gstPin) {
      add("address_match", "pass", "Installation address matches GST", `PIN code ${billPin} matches the GST principal place of business.`);
    }
  }

  // One business across all documents.
  const names = [
    ["GST certificate", gstDoc?.tradeName],
    ["Udyam certificate", udyamDoc?.readable ? udyamDoc.fields.enterpriseName : null],
    ["Signatory ID", sig?.business],
    ["Address proof", bill?.billedTo],
  ].filter(([, n]) => n);
  if (names.length >= 2) {
    const base = normaliseName(names[0][1]);
    const odd = names.filter(([, n]) => normaliseName(n) !== base && nameSimilarity(n, names[0][1]) < 0.99);
    add(
      "names_consistent",
      odd.length ? "warn" : "pass",
      odd.length ? "Business name varies across documents" : "Same business on every document",
      odd.length ? odd.map(([doc, n]) => `${doc}: "${n}"`).join("; ") : `All documents name ${names[0][1]}.`,
    );
  }

  const fails = checks.filter((c) => c.status === "fail");
  const blocking = fails.some((c) => c.id === "gstin_active" || c.id === "gst_doc_matches_registry");
  const verdict = fails.length === 0 ? "verified" : blocking ? "manual_review" : "action_needed";

  return {
    verdict,
    checks: checks.sort((a, b) => ({ fail: 0, warn: 1, pass: 2 })[a.status] - ({ fail: 0, warn: 1, pass: 2 })[b.status]),
    business: registry
      ? {
          gstinMasked: maskGstin(registry.gstin),
          legalName: registry.legalName,
          tradeName: registry.tradeName,
          constitution: registry.constitution,
          state: registry.state,
          city: registry.city,
          status: registry.status,
        }
      : null,
    hasActiveGstin: registry?.status === "Active",
  };
}

// Masked view of extracted fields, safe to return to the browser and logs.
export function maskedFields(docType, fields) {
  const f = { ...fields };
  if (f.gstin) f.gstin = maskGstin(f.gstin);
  delete f.gstinAsRead;
  if (f.udyam) f.udyam = maskUdyam(f.udyam);
  if (f.idNumber) f.idNumber = maskId(f.idNumber);
  if (f.consumerNo) f.consumerNo = maskId(f.consumerNo);
  if (docType === "signatory_id" && f.name) f.name = maskName(f.name);
  return f;
}

export { STATE_CODES };
