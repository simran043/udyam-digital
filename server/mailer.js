// Email delivery for one-time passwords.
//
// Two ways to send (see .env.example):
//   1. Brevo HTTP API - works on hosts that block mail ports (e.g. Render's free plan).
//        BREVO_API_KEY  API key from Brevo (SMTP & API > API keys)
//        MAIL_FROM      sender address verified in Brevo (falls back to SMTP_USER)
//   2. SMTP via nodemailer (Gmail by default) - used when BREVO_API_KEY is not set.
//        SMTP_USER  sender address, e.g. a Gmail account
//        SMTP_PASS  a Gmail App Password (not the normal account password)
//        SMTP_HOST / SMTP_PORT  optional, default smtp.gmail.com:465
import nodemailer from "nodemailer";

const SEND_TIMEOUT_MS = 15000;
let transporter = null;

const useBrevo = () => Boolean(process.env.BREVO_API_KEY);
const fromAddress = () => process.env.MAIL_FROM || process.env.SMTP_USER;

export function mailConfigured() {
  if (useBrevo()) return Boolean(fromAddress());
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Fail fast instead of hanging when the host blocks mail ports.
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }
  return transporter;
}

async function sendWithBrevo({ to, subject, text, html }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "Project Udyam Digital", email: fromAddress() },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Brevo ${res.status}: ${detail.slice(0, 200)}`);
  }
}

const PURPOSE_TEXT = {
  login: "sign in to Project Udyam Digital",
  register: "verify your email and create your Project Udyam Digital account",
  esign: "sign your Project Udyam Digital order",
};

export async function sendOtpEmail(to, otp, purpose = "login", minutes = 5) {
  const action = PURPOSE_TEXT[purpose] || PURPOSE_TEXT.login;
  const message = {
    to,
    subject: `${otp} is your verification code`,
    text: `Your one-time code to ${action} is ${otp}.\n\nIt expires in ${minutes} minutes. Do not share it with anyone.\nIf you didn't request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
  <div style="color:#e40000;font-size:24px;font-weight:700">airtel</div>
  <p style="color:#333">Your one-time code to ${action}:</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#14203a;margin:16px 0">${otp}</div>
  <p style="color:#666;font-size:13px">It expires in ${minutes} minutes. Do not share it with anyone.<br>If you didn't request this, you can ignore this email.</p>
</div>`,
  };
  if (useBrevo()) return sendWithBrevo(message);
  await getTransporter().sendMail({ from: `"Project Udyam Digital" <${fromAddress()}>`, ...message });
}
