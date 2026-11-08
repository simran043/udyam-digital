// Accounts with email + password, confirmed by a one-time code sent by email.
//
// Register: business name, email, password -> emailed code -> account created.
// Sign in:  email + password -> emailed code -> session token.
//
// Passwords are hashed with scrypt; codes are stored hashed, expire after
// 5 minutes, allow 5 attempts and can be re-sent after 30 seconds.
// Accounts are saved to a JSON file (USERS_FILE, default ./.data/users.json)
// so they survive restarts; codes and sessions live in memory.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mailConfigured, sendOtpEmail } from "./mailer.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_MS = 30 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const USERS_FILE = path.resolve(
  process.env.USERS_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".data", "users.json"),
);

const challenges = new Map(); // id -> { type, email, hash, expires, attempts, sentAt, pending? }
const sessions = new Map(); // token -> { email, expires }
const loginFailures = new Map(); // email -> { count, until }

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------- user store ----------
function loadUsers() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))));
  } catch (e) {
    if (e.code !== "ENOENT") console.error(`Could not read ${USERS_FILE}: ${e.message}`);
    return new Map();
  }
}
const users = loadUsers();

function saveUsers() {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  const tmp = `${USERS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(users), null, 2));
  fs.renameSync(tmp, USERS_FILE); // atomic replace so a crash can't leave half a file
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
  if (!mailConfigured()) throw new AuthError(503, "Email OTP isn't set up on the server yet (SMTP_USER / SMTP_PASS missing)");
}

async function issueChallenge(type, email, extra = {}) {
  requireMail();
  const otp = String(crypto.randomInt(100000, 1000000));
  try {
    await sendOtpEmail(email, otp, type, OTP_TTL_MS / 60000);
  } catch (e) {
    console.error("OTP email failed:", e.message);
    throw new AuthError(502, "Couldn't send the email. Check the address and try again.");
  }
  // One open challenge per email and purpose.
  for (const [id, c] of challenges) if (c.email === email && c.type === type) challenges.delete(id);
  const id = crypto.randomBytes(16).toString("hex");
  challenges.set(id, { type, email, hash: sha(otp), expires: Date.now() + OTP_TTL_MS, attempts: 0, sentAt: Date.now(), ...extra });
  return { challengeId: id, to: maskEmail(email), expiresInSeconds: OTP_TTL_MS / 1000, resendInSeconds: RESEND_MS / 1000 };
}

function startSession(email) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { email, expires: Date.now() + SESSION_TTL_MS });
  const user = users.get(email);
  return { token, user: { email, businessName: user.businessName } };
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
  if (users.has(mail)) throw new AuthError(409, "An account with this email already exists - sign in instead");
  // The account is only created after the email is confirmed.
  return issueChallenge("register", mail, { pending: { businessName: name, ...hashPassword(password) } });
}

export function verifyRegistration(challengeId, otp) {
  const c = consumeChallenge(challengeId, otp, "register");
  if (users.has(c.email)) throw new AuthError(409, "An account with this email already exists - sign in instead");
  users.set(c.email, { businessName: c.pending.businessName, salt: c.pending.salt, hash: c.pending.hash, createdAt: new Date().toISOString() });
  saveUsers();
  return startSession(c.email);
}

// ---------- sign in ----------
export async function login({ email, password }) {
  const mail = normaliseEmail(email);
  const fail = loginFailures.get(mail);
  if (fail && fail.until > Date.now()) {
    throw new AuthError(429, `Too many wrong passwords. Try again in ${Math.ceil((fail.until - Date.now()) / 60000)} minutes.`);
  }
  const user = users.get(mail);
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

export function verifyLogin(challengeId, otp) {
  const c = consumeChallenge(challengeId, otp, "login");
  if (!users.has(c.email)) throw new AuthError(404, "Account not found");
  return startSession(c.email);
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
  const m = String(req.headers.authorization || "").match(/^Bearer ([a-f0-9]{64})$/);
  if (!m) return null;
  const s = sessions.get(m[1]);
  if (!s) return null;
  if (Date.now() > s.expires || !users.has(s.email)) {
    sessions.delete(m[1]);
    return null;
  }
  return { email: s.email, businessName: users.get(s.email).businessName };
}

export function logout(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer ([a-f0-9]{64})$/);
  if (m) sessions.delete(m[1]);
}
