// Accounts with email + password, confirmed by a one-time code sent by email.
//
// Register: business name, email, password -> emailed code -> account created.
// Sign in:  email + password -> emailed code -> session token.
//
// Passwords are hashed with scrypt; codes are stored hashed, expire after
// 5 minutes, allow 5 attempts and can be re-sent after 30 seconds.
// Accounts live in userStore.js (MongoDB or a local JSON file).
//
// Session tokens are signed with SESSION_SECRET, so they stay valid when the
// server restarts. Without SESSION_SECRET a random secret is used and everyone
// is signed out on restart.
import crypto from "node:crypto";
import { mailConfigured, sendOtpEmail } from "./mailer.js";
import { userStore, DuplicateUserError } from "./userStore.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_MS = 30 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.SESSION_SECRET) console.warn("SESSION_SECRET not set: users will be signed out whenever the server restarts.");

const challenges = new Map(); // id -> { type, email, hash, expires, attempts, sentAt, pending? }
const loginFailures = new Map(); // email -> { count, until }
const signedOut = new Map(); // token signature -> expiry, for sign-out before a token expires

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- helpers ----------
const sha = (value) => crypto.createHash("sha256").update(value).digest();
export const normaliseEmail = (email) => String(email || "").trim().toLowerCase();
export const maskEmail = (email) => email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 6)) + c);

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function passwordMatches(password, user) {
  const given = Buffer.from(hashPassword(password, user.salt).hash, "hex");
  return crypto.timingSafeEqual(given, Buffer.from(user.hash, "hex"));
}

function checkPassword(password) {
  if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters";
  if (password.length > 128) return "Password is too long";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Password must contain at least one letter and one number";
  return null;
}

function requireMail() {
  if (!mailConfigured()) throw new AuthError(503, "Email OTP isn't set up on the server yet (email settings missing)");
}

async function issueChallenge(type, email, extra = {}) {
  requireMail();
  const otp = String(crypto.randomInt(100000, 1000000));
  try {
    await sendOtpEmail(email, otp, type, OTP_TTL_MS / 60000);
  } catch (e) {
    console.error("OTP email failed:", e.message);
    throw new AuthError(502, "We couldn't send the verification email right now. Please try again in a minute.");
  }
  // One open challenge per email and purpose.
  for (const [id, c] of challenges) if (c.email === email && c.type === type) challenges.delete(id);
  const id = crypto.randomBytes(16).toString("hex");
  challenges.set(id, { type, email, hash: sha(otp), expires: Date.now() + OTP_TTL_MS, attempts: 0, sentAt: Date.now(), ...extra });
  return { challengeId: id, to: maskEmail(email), expiresInSeconds: OTP_TTL_MS / 1000, resendInSeconds: RESEND_MS / 1000 };
}

// Store errors (e.g. database unreachable) become a clear 503 instead of a generic 500.
async function fromStore(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DuplicateUserError || e instanceof AuthError) throw e;
    console.error("User store error:", e.message);
    throw new AuthError(503, "Account service is temporarily unavailable. Please try again in a minute.");
  }
}

// ---------- signed session tokens ----------
const b64 = (buf) => Buffer.from(buf).toString("base64url");
const sign = (payload) => crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest();

function startSession(user) {
  const payload = b64(JSON.stringify({ e: user.email, n: user.businessName, x: Date.now() + SESSION_TTL_MS }));
  return { token: `${payload}.${b64(sign(payload))}`, user: { email: user.email, businessName: user.businessName } };
}

function readToken(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer ([\w-]+)\.([\w-]+)$/);
  if (!m) return null;
  const [, payload, sig] = m;
  const expected = sign(payload);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.e !== "string" || !(data.x > Date.now())) return null;
    return { sig, email: data.e, businessName: data.n, expires: data.x };
  } catch {
    return null;
  }
}

// Checks a code; returns the challenge and removes it when correct.
function consumeChallenge(id, otp, type) {
  const c = challenges.get(String(id || ""));
  if (!c || c.type !== type) throw new AuthError(409, "This code request has ended - start again");
  if (Date.now() > c.expires) {
    challenges.delete(id);
    throw new AuthError(410, "This code has expired - request a new one");
  }
  if (c.attempts >= MAX_OTP_ATTEMPTS) {
    challenges.delete(id);
    throw new AuthError(429, "Too many attempts - start again");
  }
  c.attempts++;
  if (!crypto.timingSafeEqual(sha(String(otp || "").trim()), c.hash)) {
    const left = MAX_OTP_ATTEMPTS - c.attempts;
    throw new AuthError(400, left > 0 ? `Incorrect code - ${left} attempt${left === 1 ? "" : "s"} left` : "Incorrect code - start again");
  }
  challenges.delete(id);
  return c;
}

// ---------- register ----------
export async function register({ businessName, email, password, confirmPassword }) {
  const name = String(businessName || "").trim().replace(/\s+/g, " ");
  const mail = normaliseEmail(email);
  if (name.length < 2 || name.length > 100) throw new AuthError(400, "Enter your business name (2-100 characters)");
  if (!EMAIL_RE.test(mail)) throw new AuthError(400, "Enter a valid email address");
  const weak = checkPassword(password);
  if (weak) throw new AuthError(400, weak);
  if (password !== confirmPassword) throw new AuthError(400, "Passwords don't match");
  if (await fromStore(() => userStore.get(mail))) throw new AuthError(409, "An account with this email already exists - sign in instead");
  // The account is only created after the email is confirmed.
  return issueChallenge("register", mail, { pending: { businessName: name, ...hashPassword(password) } });
}

export async function verifyRegistration(challengeId, otp) {
  const c = consumeChallenge(challengeId, otp, "register");
  const record = { businessName: c.pending.businessName, salt: c.pending.salt, hash: c.pending.hash, createdAt: new Date().toISOString() };
  try {
    await fromStore(() => userStore.create(c.email, record));
  } catch (e) {
    if (e instanceof DuplicateUserError) throw new AuthError(409, "An account with this email already exists - sign in instead");
    throw e;
  }
  return startSession({ email: c.email, ...record });
}

// ---------- sign in ----------
export async function login({ email, password }) {
  const mail = normaliseEmail(email);
  const fail = loginFailures.get(mail);
  if (fail && fail.until > Date.now()) {
    throw new AuthError(429, `Too many wrong passwords. Try again in ${Math.ceil((fail.until - Date.now()) / 60000)} minutes.`);
  }
  const user = await fromStore(() => userStore.get(mail));
  // Same message whether the email or the password is wrong.
  if (!user || typeof password !== "string" || !passwordMatches(password, user)) {
    const lockEnded = fail?.until && fail.until <= Date.now();
    const count = (lockEnded ? 0 : fail?.count || 0) + 1;
    loginFailures.set(mail, { count, until: count >= MAX_LOGIN_FAILURES ? Date.now() + LOCK_MS : 0 });
    throw new AuthError(401, "Incorrect email or password");
  }
  loginFailures.delete(mail);
  return issueChallenge("login", mail);
}

export async function verifyLogin(challengeId, otp) {
  const c = consumeChallenge(challengeId, otp, "login");
  const user = await fromStore(() => userStore.get(c.email));
  if (!user) throw new AuthError(404, "Account not found");
  return startSession(user);
}

// ---------- shared ----------
export async function resend(challengeId) {
  const c = challenges.get(String(challengeId || ""));
  if (!c) throw new AuthError(409, "This code request has ended - start again");
  const since = Date.now() - c.sentAt;
  if (since < RESEND_MS) throw new AuthError(429, `Please wait ${Math.ceil((RESEND_MS - since) / 1000)}s before requesting a new code`);
  challenges.delete(challengeId);
  const { type, email, pending } = c;
  return issueChallenge(type, email, pending ? { pending } : {});
}

// Returns { email, businessName } for a signed-in request, or null.
export function userFromRequest(req) {
  const t = readToken(req);
  if (!t || signedOut.has(t.sig)) return null;
  return { email: t.email, businessName: t.businessName };
}

export function logout(req) {
  const t = readToken(req);
  if (!t) return;
  signedOut.set(t.sig, t.expires);
  for (const [sig, exp] of signedOut) if (exp < Date.now()) signedOut.delete(sig);
}

export const accountStorage = () => userStore.kind;
