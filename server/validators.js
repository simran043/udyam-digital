// Identifier validation, OCR clean-up and masking helpers.

// The dataset README fixes "today" for all date-based checks.
export const TODAY = process.env.UDYAM_TODAY || "2026-07-15";

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
// 2-digit state code, 10-char PAN, entity number, 'Z', checksum.
// The README notes the 4th PAN character is always 'X' in this dataset, so the
// PAN part accepts any letter there.
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const UDYAM_PATTERN = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;

export const STATE_CODES = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
  "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat", "27": "Maharashtra",
  "29": "Karnataka", "30": "Goa", "32": "Kerala", "33": "Tamil Nadu", "36": "Telangana",
  "37": "Andhra Pradesh",
};

export function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i]);
    if (value < 0) return null;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export function validateGstinFormat(raw) {
  const gstin = String(raw || "").trim().toUpperCase();
  if (gstin.length !== 15) return { ok: false, gstin, reason: "GSTIN must be 15 characters" };
  if (!GSTIN_PATTERN.test(gstin)) return { ok: false, gstin, reason: "GSTIN structure is not valid" };
  if (!STATE_CODES[gstin.slice(0, 2)] && Number(gstin.slice(0, 2)) > 38) {
    return { ok: false, gstin, reason: "Unknown state code" };
  }
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, gstin, reason: "Checksum digit does not match - likely a typo or altered number" };
  }
  return { ok: true, gstin };
}

export function validateUdyamFormat(raw) {
  const udyam = String(raw || "").trim().toUpperCase();
  return UDYAM_PATTERN.test(udyam)
    ? { ok: true, udyam }
    : { ok: false, udyam, reason: "Udyam number must look like UDYAM-XX-00-0000000" };
}

// OCR often confuses look-alike characters. GSTIN positions have fixed
// character classes, so each position can be repaired deterministically.
const TO_DIGIT = { O: "0", D: "0", Q: "0", I: "1", L: "1", Z: "2", S: "5", B: "8", G: "6", T: "7" };
const TO_LETTER = { 0: "O", 1: "I", 2: "Z", 5: "S", 8: "B", 6: "G", 7: "T", 4: "A" };
const GSTIN_CLASSES = "DDLLLLLDDDDLAZA"; // D digit, L letter, A alphanumeric, Z literal 'Z'

export function repairOcrGstin(raw) {
  const cleaned = String(raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (cleaned.length !== 15) return cleaned;
  const chars = cleaned.split("").map((ch, i) => {
    const cls = GSTIN_CLASSES[i];
    if (cls === "D") return TO_DIGIT[ch] ?? ch;
    if (cls === "L") return TO_LETTER[ch] ?? ch;
    if (cls === "Z") return "Z";
    return ch;
  });
  const repaired = chars.join("");
  if (validateGstinFormat(repaired).ok) return repaired;
  // Ambiguous last character (e.g. 0/O, 1/I): pick whichever satisfies the checksum.
  const expected = gstinCheckChar(repaired.slice(0, 14));
  const last = repaired[14];
  const lookalike = { 0: "O", O: "0", 1: "I", I: "1", 5: "S", S: "5", 8: "B", B: "8", 2: "Z", Z: "2" };
  if (expected && lookalike[last] === expected) return repaired.slice(0, 14) + expected;
  return repaired;
}

export function repairOcrUdyam(raw) {
  const m = String(raw || "").toUpperCase().replace(/\s+/g, "").match(/UDYAM-?([A-Z]{2})-?([0-9O]{2})-?([0-9OIl]{7})/i);
  if (!m) return null;
  const digits = (s) => s.replace(/O/g, "0").replace(/[Il]/g, "1");
  return `UDYAM-${m[1]}-${digits(m[2])}-${digits(m[3])}`;
}

// ---------- masking (DPDP data minimisation in UI and logs) ----------
export function maskGstin(gstin) {
  if (!gstin || gstin.length < 15) return gstin ? "***" : "";
  return `${gstin.slice(0, 2)}*****${gstin.slice(7, 11).replace(/./g, "*")}${gstin.slice(11)}`;
}
export function maskUdyam(udyam) {
  if (!udyam) return "";
  return udyam.replace(/-(\d{3})\d{4}$/, "-$1****");
}
export function maskName(name) {
  if (!name) return "";
  return name
    .split(/\s+/)
    .map((part) => (part.length <= 1 ? part : part[0] + "*".repeat(Math.min(part.length - 1, 4))))
    .join(" ");
}
export function maskId(id) {
  if (!id) return "";
  return id.length <= 4 ? "****" : "*".repeat(id.length - 4) + id.slice(-4);
}

// ---------- names and dates ----------
export function normaliseName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\(prop\.?[^)]*\)/g, " ")
    .replace(/\b(m\/s|pvt|private|ltd|limited|llp)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Token overlap similarity between two business or person names (0..1).
export function nameSimilarity(a, b) {
  const ta = new Set(normaliseName(a).split(" ").filter(Boolean));
  const tb = new Set(normaliseName(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

export function daysBetween(fromIso, toIso = TODAY) {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function extractPinCode(address) {
  const m = String(address || "").replace(/\s+/g, "").match(/(\d{6})(?!.*\d)/);
  return m ? m[1] : null;
}
