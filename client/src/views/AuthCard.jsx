import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";

const EMPTY = { businessName: "", email: "", password: "", confirmPassword: "" };

function passwordProblem(pw) {
  if (pw.length < 8) return "At least 8 characters";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use at least one letter and one number";
  return "";
}

// Sign in (email + password) or register (business, email, password twice).
// Both finish with a 6-digit code sent to the email address.
export default function AuthCard({ onSignedIn }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(EMPTY);
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const switchMode = (m) => {
    setMode(m);
    setError("");
    setChallenge(null);
    setForm((f) => ({ ...EMPTY, email: f.email }));
  };

  const isLogin = mode === "login";
  const pwIssue = !isLogin && form.password ? passwordProblem(form.password) : "";
  const mismatch = !isLogin && form.confirmPassword && form.password !== form.confirmPassword;
  const canSubmit = isLogin
    ? form.email.trim() && form.password
    : form.businessName.trim().length >= 2 && form.email.trim() && form.password && !pwIssue && form.password === form.confirmPassword;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = isLogin
        ? await api.login(form.email.trim(), form.password)
        : await api.register({ ...form, businessName: form.businessName.trim(), email: form.email.trim() });
      setChallenge(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (challenge) {
    return (
      <div className="signin-card">
        <OtpStep
          challenge={challenge}
          title={isLogin ? "Verify it's you" : "Verify your email"}
          action={isLogin ? "Verify & sign in" : "Verify & create account"}
          onVerify={(code) => (isLogin ? api.verifyLogin(challenge.challengeId, code) : api.verifyRegister(challenge.challengeId, code))}
          onDone={onSignedIn}
          onResent={setChallenge}
          onBack={() => {
            setChallenge(null);
            setError("");
          }}
        />
      </div>
    );
  }

  return (
    <div className="signin-card">
      <div className="auth-tabs" role="tablist" aria-label="Account">
        <button type="button" role="tab" aria-selected={isLogin} className={isLogin ? "on" : ""} onClick={() => switchMode("login")}>
          Sign in
        </button>
        <button type="button" role="tab" aria-selected={!isLogin} className={!isLogin ? "on" : ""} onClick={() => switchMode("register")}>
          Register
        </button>
      </div>
      <p className="signin-sub">
        {isLogin ? "Welcome back. We'll email you a code to confirm it's you." : "New here? Create your business account in a minute."}
      </p>
      <form onSubmit={submit} className="auth-form" noValidate>
        {!isLogin && (
          <label className="field">
            <span>Business name</span>
            <input
              className="input big"
              autoComplete="organization"
              value={form.businessName}
              onChange={set("businessName")}
              placeholder="e.g. Star Electronics"
              maxLength={100}
            />
          </label>
        )}
        <label className="field">
          <span>Email address</span>
          <input className="input big" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="you@business.com" />
        </label>
        <label className="field">
          <span>Password</span>
          <div className="pw-wrap">
            <input
              className="input big"
              type={showPw ? "text" : "password"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={form.password}
              onChange={set("password")}
              placeholder={isLogin ? "Your password" : "At least 8 characters, letters and numbers"}
              maxLength={128}
            />
            <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
          {pwIssue && <small className="field-hint bad">{pwIssue}</small>}
        </label>
        {!isLogin && (
          <label className="field">
            <span>Retype password</span>
            <input
              className="input big"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={set("confirmPassword")}
              placeholder="Same password again"
              maxLength={128}
            />
            {mismatch && <small className="field-hint bad">Passwords don't match</small>}
          </label>
        )}
        {error && <div className="error">{error}</div>}
        <button className="btn red block big" disabled={busy || !canSubmit}>
          {busy ? <span className="spinner" /> : isLogin ? "Continue" : "Create account"}
        </button>
      </form>
      <p className="auth-switch">
        {isLogin ? "New to Udyam Digital? " : "Already have an account? "}
        <button type="button" className="link-btn" onClick={() => switchMode(isLogin ? "register" : "login")}>
          {isLogin ? "Register" : "Sign in"}
        </button>
      </p>
    </div>
  );
}

function OtpStep({ challenge, title, action, onVerify, onDone, onResent, onBack }) {
  const [digits, setDigits] = useState(Array(6).fill(""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(challenge.resendInSeconds);
  const boxes = useRef([]);

  useEffect(() => {
    boxes.current[0]?.focus();
  }, [challenge.challengeId]);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (code) => {
    setBusy(true);
    setError("");
    try {
      onDone(await onVerify(code));
    } catch (err) {
      setError(err.message);
      setDigits(Array(6).fill(""));
      setBusy(false);
      setTimeout(() => boxes.current[0]?.focus(), 50);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.resendOtp(challenge.challengeId);
      setDigits(Array(6).fill(""));
      setWait(r.resendInSeconds);
      onResent(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (i, value) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      // Pasted the whole code.
      const next = clean.slice(0, 6).split("").concat(Array(6).fill("")).slice(0, 6);
      setDigits(next);
      boxes.current[Math.min(clean.length, 5)]?.focus();
      if (clean.length >= 6) verify(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) boxes.current[i + 1]?.focus();
    if (next.every(Boolean)) verify(next.join(""));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        verify(digits.join(""));
      }}
    >
      <h2>{title}</h2>
      <p className="signin-sub">
        We emailed a 6-digit code to <b>{challenge.to}</b>. It expires in {Math.round(challenge.expiresInSeconds / 60)} minutes.
      </p>
      <div className="otp-boxes" role="group" aria-label="6-digit code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (boxes.current[i] = el)}
            className="otp-box"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={6}
            value={d}
            aria-label={`Digit ${i + 1}`}
            disabled={busy}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
            }}
          />
        ))}
      </div>
      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      <button className="btn red block big" style={{ marginTop: 16 }} disabled={busy || digits.some((d) => !d)}>
        {busy ? <span className="spinner" /> : action}
      </button>
      <div className="signin-links">
        <button type="button" className="link-btn" onClick={onBack} disabled={busy}>
          ← Back
        </button>
        <button type="button" className="link-btn" disabled={wait > 0 || busy} onClick={resend}>
          {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
