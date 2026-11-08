// Udyam Digital API server (Node.js, no framework).
import "./env.js"; // must stay first: loads .env before other modules read process.env
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { productById, KYC_DIR } from "./data.js";
import { priceQuote, validateCart, catalogueSummary } from "./catalogue.js";
import { createSession, handleMessage, publicSession, sessions, advisorMode, LANGUAGES } from "./advisor.js";
import { lookupGstin, lookupUdyam, parseDocument, validateApplication, maskedFields, DOC_TYPES } from "./kyc.js";
import { recognize } from "./ocr.js";
import { createOrder, advanceOrder, orderView, orders } from "./orders.js";
import { summary, winBackLeads } from "./analytics.js";
import { maskGstin, maskName, TODAY } from "./validators.js";
import { AuthError, register, verifyRegistration, login, verifyLogin, resend, userFromRequest, logout, maskEmail } from "./auth.js";
import { mailConfigured, sendOtpEmail } from "./mailer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, "..", "dist");
const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = 12 * 1024 * 1024; // room for a phone photo as base64

export const CONSENT_NOTICE_VERSION = "2026-07-v1";
const kycRecords = new Map(); // consentId -> { consent, docs, result }
const callbacks = [];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- helpers ----------
function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, "Upload too large (max ~8 MB image)");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) throw new HttpError(404, "Advisor session not found - start a new chat");
  return session;
}

function getKyc(consentId) {
  const record = kycRecords.get(consentId);
  if (!record) throw new HttpError(404, "No KYC record for this consent (it may have been withdrawn)");
  return record;
}

function decodeImage(dataUrl) {
  const m = String(dataUrl || "").match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!m) throw new HttpError(400, "Upload a PNG, JPG or WebP image");
  return Buffer.from(m[2], "base64");
}

async function ocrDocument(record, docType, buffer) {
  if (!DOC_TYPES[docType]) throw new HttpError(400, "Unknown document type");
  const parsed = parseDocument(docType, await recognize(buffer));
  // Data minimisation: keep only extracted fields; the image and raw OCR text are discarded.
  record.docs[docType] = parsed;
  record.result = null;
  return { docType, readable: parsed.readable, wrongSlot: parsed.wrongSlot, detectedType: parsed.detectedType, confidence: parsed.confidence, fields: maskedFields(parsed.detectedType || docType, parsed.fields) };
}

const SAMPLE_PATTERN = /^K\d{2}_(gst_certificate|udyam_certificate|signatory_id|address_proof)\.png$/;

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route("GET", /^\/api\/health$/, () => ({ ok: true, today: TODAY, advisor: advisorMode(), languages: LANGUAGES }));
route("GET", /^\/api\/catalogue$/, () => catalogueSummary());

// Accounts: register / sign in, each confirmed with an emailed code
route("POST", /^\/api\/auth\/register$/, async (req) => register(await readJson(req)));
route("POST", /^\/api\/auth\/register\/verify$/, async (req) => {
  const { challengeId, otp } = await readJson(req);
  return verifyRegistration(challengeId, otp);
});
route("POST", /^\/api\/auth\/login$/, async (req) => login(await readJson(req)));
route("POST", /^\/api\/auth\/login\/verify$/, async (req) => {
  const { challengeId, otp } = await readJson(req);
  return verifyLogin(challengeId, otp);
});
route("POST", /^\/api\/auth\/resend$/, async (req) => resend((await readJson(req)).challengeId));
route("GET", /^\/api\/auth\/me$/, (req) => {
  const user = userFromRequest(req);
  if (!user) throw new HttpError(401, "Not signed in");
  return { user };
});
route("POST", /^\/api\/auth\/logout$/, (req) => {
  logout(req);
  return { ok: true };
});

// Advisor
route("POST", /^\/api\/advisor\/session$/, async (req) => {
  const { language } = await readJson(req);
  return publicSession(createSession(language));
});
route("POST", /^\/api\/advisor\/message$/, async (req) => {
  const { sessionId, text } = await readJson(req);
  if (!text || !String(text).trim()) throw new HttpError(400, "Message is empty");
  const session = getSession(sessionId);
  await handleMessage(session, text);
  return publicSession(session);
});

// Quote: re-validates the owner's toggles against the rules, then prices.
route("POST", /^\/api\/quote$/, async (req) => {
  const { sessionId, items, contractMonths } = await readJson(req);
  const session = getSession(sessionId);
  if (!session.recommendation) throw new HttpError(409, "Finish the advisor chat first");
  const months = [12, 24].includes(Number(contractMonths)) ? Number(contractMonths) : 12;
  const known = new Map(session.recommendation.items.map((i) => [i.id, i]));
  const cart = (items || [])
    .filter((i) => known.has(i.id))
    .map((i) => ({ ...known.get(i.id), included: Boolean(i.included), quantity: Math.min(100, Math.max(1, Number(i.quantity) || 1)) }));
  const checked = validateCart(cart, session.recommendation.profile);
  session.cart = { items: checked, contractMonths: months };
  return { items: checked, quote: priceQuote(checked, { contractMonths: months }) };
});

// KYC registry lookups (mock government APIs)
route("GET", /^\/api\/kyc\/gstin\/([0-9A-Za-z]{15})$/, (req, m) => {
  const r = lookupGstin(m[1]);
  return r.found ? { ...r, gstin: maskGstin(r.gstin) } : { found: false, error: r.error };
});
route("GET", /^\/api\/kyc\/udyam\/(UDYAM-[A-Za-z0-9-]+)$/, (req, m) => lookupUdyam(m[1]));

// Consent must exist before any document is collected (DPDP Act s.6).
route("POST", /^\/api\/kyc\/consent$/, async (req) => {
  const { sessionId, accepted, purposes } = await readJson(req);
  if (accepted !== true) throw new HttpError(400, "Consent is required before uploading documents");
  getSession(sessionId);
  const consentId = crypto.randomUUID();
  kycRecords.set(consentId, {
    consent: { consentId, sessionId, noticeVersion: CONSENT_NOTICE_VERSION, purposes: purposes || ["kyc_verification"], givenAt: new Date().toISOString() },
    docs: {},
    result: null,
    esign: null,
  });
  return { consentId, noticeVersion: CONSENT_NOTICE_VERSION };
});
route("DELETE", /^\/api\/kyc\/([0-9a-f-]{36})$/, (req, m) => {
  getKyc(m[1]);
  kycRecords.delete(m[1]);
  return { withdrawn: true, deleted: ["consent record", "extracted document fields", "verification result"] };
});
route("POST", /^\/api\/kyc\/document$/, async (req) => {
  const { consentId, docType, image } = await readJson(req);
  return ocrDocument(getKyc(consentId), docType, decodeImage(image));
});

// Demo helper: runs the same OCR pipeline on a specimen applicant's files.
route("GET", /^\/api\/kyc\/samples$/, () => {
  const files = fs.readdirSync(KYC_DIR).filter((f) => SAMPLE_PATTERN.test(f));
  const applicants = {};
  for (const f of files) (applicants[f.slice(0, 3)] ??= []).push(f.slice(4, -4));
  return Object.entries(applicants).sort().map(([id, docs]) => ({ id, docs }));
});
route("GET", /^\/api\/kyc\/samples\/(K\d{2}_[a-z_]+\.png)$/, (req, m, res) => {
  if (!SAMPLE_PATTERN.test(m[1])) throw new HttpError(404, "Not found");
  res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=3600" });
  fs.createReadStream(path.join(KYC_DIR, m[1])).pipe(res);
  return undefined;
});
route("POST", /^\/api\/kyc\/sample-document$/, async (req) => {
  const { consentId, file } = await readJson(req);
  if (!SAMPLE_PATTERN.test(file || "")) throw new HttpError(400, "Unknown specimen file");
  const docType = file.slice(4, -4);
  return ocrDocument(getKyc(consentId), docType, fs.readFileSync(path.join(KYC_DIR, file)));
});
route("POST", /^\/api\/kyc\/validate$/, async (req) => {
  const { consentId } = await readJson(req);
  const record = getKyc(consentId);
  record.result = validateApplication(record.docs);
  return record.result;
});

// Mock Aadhaar e-sign. The OTP is returned to the page only because this is a demo.
route("POST", /^\/api\/kyc\/esign\/start$/, async (req) => {
  const { consentId } = await readJson(req);
  const record = getKyc(consentId);
  if (record.result?.verdict !== "verified") throw new HttpError(409, "Fix the KYC issues before signing");
  record.esign = { otp: String(crypto.randomInt(100000, 999999)), attempts: 0, verified: false };
  // Signed-in users get the OTP by email; otherwise fall back to the on-screen demo OTP.
  const email = userFromRequest(req)?.email;
  if (email && mailConfigured()) {
    try {
      await sendOtpEmail(email, record.esign.otp, "esign");
      return { sent: true, channel: "email", to: maskEmail(email), note: "We emailed you a 6-digit code to sign this order." };
    } catch (e) {
      console.error("E-sign OTP email failed:", e.message);
      throw new HttpError(502, "Couldn't email the OTP. Try again in a moment.");
    }
  }
  return { sent: true, channel: "demo", demoOtp: record.esign.otp, note: "Simulated - a real deployment sends this OTP through an e-sign service provider." };
});
route("POST", /^\/api\/kyc\/esign\/verify$/, async (req) => {
  const { consentId, otp } = await readJson(req);
  const record = getKyc(consentId);
  if (!record.esign) throw new HttpError(409, "Request an OTP first");
  if (record.esign.attempts >= 3) throw new HttpError(429, "Too many attempts - request a new OTP");
  record.esign.attempts++;
  if (String(otp) !== record.esign.otp) throw new HttpError(400, "Incorrect OTP");
  record.esign.verified = true;
  record.esign.signedAt = new Date().toISOString();
  return { signed: true, signedAt: record.esign.signedAt };
});

// Orders and tracker
route("POST", /^\/api\/orders$/, async (req) => {
  const { sessionId, consentId } = await readJson(req);
  const session = getSession(sessionId);
  const record = getKyc(consentId);
  if (record.consent.sessionId !== sessionId) throw new HttpError(403, "KYC belongs to another session");
  if (!session.cart) throw new HttpError(409, "Confirm your quote first");
  if (record.result?.verdict !== "verified") throw new HttpError(409, "KYC is not verified yet");
  if (!record.esign?.verified) throw new HttpError(409, "Sign the order with Aadhaar e-sign first");
  // GSTIN-only products need the verified, active GSTIN from KYC.
  const profile = { ...session.recommendation.profile, hasGstin: record.result.hasActiveGstin };
  const items = validateCart(session.cart.items, profile);
  const quote = priceQuote(items, { contractMonths: session.cart.contractMonths });
  if (!quote.lines.length) throw new HttpError(409, "No services left in the order");
  const order = createOrder({
    quote,
    profile: { ...session.profile, businessName: record.result.business?.tradeName || session.profile.businessName },
    kycVerdict: record.result.verdict,
  });
  session.outcome = "ordered";
  session.orderId = order.id;
  return orderView(order);
});
route("GET", /^\/api\/orders\/(UD-[0-9A-F-]+)$/i, (req, m) => {
  const order = orders.get(m[1].toUpperCase());
  if (!order) throw new HttpError(404, "Order not found - check the order ID");
  return orderView(order);
});
route("POST", /^\/api\/orders\/(UD-[0-9A-F-]+)\/advance$/i, (req, m) => {
  const order = orders.get(m[1].toUpperCase());
  if (!order) throw new HttpError(404, "Order not found");
  return orderView(advanceOrder(order, 1));
});

// Hand-off to a person: the owner asks for a callback from the advisor.
route("POST", /^\/api\/callback$/, async (req) => {
  const { sessionId, name, phone, consent } = await readJson(req);
  if (consent !== true) throw new HttpError(400, "Consent is needed to call you back");
  if (!/^[6-9]\d{9}$/.test(String(phone || ""))) throw new HttpError(400, "Enter a 10-digit Indian mobile number");
  const session = getSession(sessionId);
  session.outcome = session.outcome === "ordered" ? "ordered" : "callback_requested";
  callbacks.push({ sessionId, name: String(name || "").slice(0, 60), phoneLast4: String(phone).slice(-4), at: new Date().toISOString() });
  return { requested: true, message: "A local Accel partner will call you within 2 working hours." };
});

// Back office
route("GET", /^\/api\/backoffice\/summary$/, () => summary());
route("GET", /^\/api\/backoffice\/winback(\?.*)?$/, (req) => {
  const q = new URL(req.url, "http://x").searchParams;
  return winBackLeads({ limit: Math.min(200, Number(q.get("limit")) || 50), segment: q.get("segment") || undefined, reason: q.get("reason") || undefined });
});
route("GET", /^\/api\/backoffice\/advisor$/, () => {
  const rows = [...sessions.values()]
    .filter((s) => s.messages.length > 1)
    .map((s) => {
      const cb = callbacks.find((c) => c.sessionId === s.id);
      return {
        sessionId: s.id.slice(0, 8),
        startedAt: s.createdAt,
        language: s.language,
        engine: s.mode,
        business: s.profile.businessName ? maskName(s.profile.businessName) : s.profile.businessType || "-",
        city: s.profile.city || "-",
        segment: s.profile.segment || "-",
        stepReached: s.step,
        outcome: s.outcome,
        quoteMonthly: s.recommendation ? Math.round(s.recommendation.quote.monthlyTotal) : null,
        callback: cb ? { name: maskName(cb.name), phone: `******${cb.phoneLast4}` } : null,
        orderId: s.orderId || null,
      };
    })
    .reverse();
  return { sessions: rows, orders: orders.size };
});

// ---------- static files (production build) ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };
function serveStatic(req, res) {
  if (!fs.existsSync(DIST)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Front end not built. Run `npm run dev` (development) or `npm run build` then `npm start`.");
    return;
  }
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = path.normalize(path.join(DIST, urlPath));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  res.on("finish", () => {
    // Paths only: request bodies (documents, identifiers) are never logged.
    if (req.url.startsWith("/api/")) console.log(`${req.method} ${req.url.split("?")[0].replace(/\/[0-9A-Z]{15}$/i, "/[gstin]")} ${res.statusCode} ${Date.now() - started}ms`);
  });
  try {
    const match = routes.find((r) => r.method === req.method && r.pattern.test(req.url));
    if (!match) {
      if (req.url.startsWith("/api/")) throw new HttpError(404, "Unknown API route");
      return serveStatic(req, res);
    }
    const result = await match.handler(req, req.url.match(match.pattern), res);
    if (result !== undefined) send(res, 200, result);
  } catch (err) {
    const known = err instanceof HttpError || err instanceof AuthError;
    if (!known) console.error(err);
    if (!res.headersSent) send(res, known ? err.status : 500, { error: known ? err.message : "Something went wrong - please try again" });
  }
});

server.listen(PORT, () => {
  console.log(`Udyam Digital API on http://localhost:${PORT} | advisor: ${advisorMode()} | today: ${TODAY}`);
  // Warm up the propensity model so the first back-office load is fast.
  summary();
});
