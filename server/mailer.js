// Email delivery for one-time passwords (nodemailer over SMTP, Gmail by default).
//
// Configure with environment variables (see .env.example):
//   SMTP_USER  sender address, e.g. a Gmail account
//   SMTP_PASS  a Gmail App Password (not the normal account password)
//   SMTP_HOST / SMTP_PORT  optional, default smtp.gmail.com:465
import nodemailer from "nodemailer";

let transporter = null;

export function mailConfigured() {
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
    });
  }
  return transporter;
}

const PURPOSE_TEXT = {
  login: "sign in to Project Udyam Digital",
  register: "verify your email and create your Project Udyam Digital account",
  esign: "sign your Project Udyam Digital order",
};

export async function sendOtpEmail(to, otp, purpose = "login", minutes = 5) {
  const action = PURPOSE_TEXT[purpose] || PURPOSE_TEXT.login;
  await getTransporter().sendMail({
    from: `"Project Udyam Digital" <${process.env.SMTP_USER}>`,
    to,
    subject: `${otp} is your verification code`,
    text: `Your one-time code to ${action} is ${otp}.\n\nIt expires in ${minutes} minutes. Do not share it with anyone.\nIf you didn't request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
  <div style="color:#e40000;font-size:24px;font-weight:700">airtel</div>
  <p style="color:#333">Your one-time code to ${action}:</p>
  <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#14203a;margin:16px 0">${otp}</div>
  <p style="color:#666;font-size:13px">It expires in ${minutes} minutes. Do not share it with anyone.<br>If you didn't request this, you can ignore this email.</p>
</div>`,
  });
}
