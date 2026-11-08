import { useEffect, useRef, useState } from "react";
import { api, inr } from "../api.js";
import Icon, { BrandMark } from "../icons.jsx";

const PROFILE_FIELDS = [
  ["businessName", "Business"],
  ["businessType", "Type"],
  ["segment", "Segment"],
  ["city", "City"],
  ["employees", "People"],
  ["sites", "Sites"],
  ["hasGstin", "GSTIN"],
  ["currentInternet", "Internet today"],
  ["currentSpend", "Spend today"],
];

function formatValue(key, value) {
  if (key === "hasGstin") return value ? "Yes, active" : "No";
  if (key === "currentSpend") return `${inr(value)}/mo`;
  return String(value);
}

export default function Advisor({ health, session, setSession, onSeeQuote, onReset }) {
  const [language, setLanguage] = useState("English");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logRef = useRef(null);

  const start = async (lang) => {
    setBusy(true);
    setError("");
    try {
      setSession(await api.startSession(lang));
      onReset();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!session && health?.ok) start(language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.messages?.length, busy]);

  const send = async (message) => {
    const value = (message ?? text).trim();
    if (!value || busy || !session) return;
    setBusy(true);
    setError("");
    setText("");
    // Show the owner's message immediately.
    setSession((s) => ({ ...s, messages: [...s.messages, { role: "user", text: value }], quickReplies: [] }));
    try {
      const next = await api.sendMessage(session.id, value);
      setSession((s) => ({ ...next, orderPlaced: s.orderPlaced }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const changeLanguage = (lang) => {
    setLanguage(lang);
    const inProgress = session && session.messages.length > 1;
    if (!inProgress || window.confirm("Switching language starts a new chat. Continue?")) start(lang);
  };

  const rec = session?.recommendation;
  const profile = session?.profile || {};
  const engine = session?.mode === "claude" ? "Claude AI" : "Guided mode";

  return (
    <div className="advisor-layout">
      <section className="panel chat" aria-label="Sahayak advisor chat">
        <div className="chat-head">
          <div>
            <h2>Accel Sahayak</h2>
            <div className="chat-sub">Conversational AI Advisor for Project Udyam Digital · {engine}</div>
          </div>
          <select className="lang-select" value={language} onChange={(e) => changeLanguage(e.target.value)} aria-label="Language">
            {(health?.languages || ["English", "Hindi"]).map((l) => (
              <option key={l} value={l} disabled={health?.advisor !== "claude" && !["English", "Hindi"].includes(l)}>
                {l}
                {health?.advisor !== "claude" && !["English", "Hindi"].includes(l) ? " (AI mode)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="chat-log" ref={logRef} aria-live="polite">
          {session?.messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === "assistant" && (
                <span className="msg-avatar bot">
                  <BrandMark size={22} />
                </span>
              )}
              <div className={`bubble ${m.role}`}>{m.text}</div>
              {m.role === "user" && (
                <span className="msg-avatar">
                  <Icon name="user" size={20} />
                </span>
              )}
            </div>
          ))}
          {busy && (
            <div className="msg assistant">
              <span className="msg-avatar bot">
                <BrandMark size={22} />
              </span>
              <div className="bubble assistant">
                <span className="spinner dark" /> thinking…
              </div>
            </div>
          )}
          {!session && !busy && <div className="muted">Connecting…</div>}
        </div>

        {error && <div className="error" style={{ margin: "0 20px 10px" }}>{error}</div>}

        {session?.quickReplies?.length > 0 && !busy && (
          <div className="chips">
            {session.quickReplies.map((q) => (
              <button key={q} className={`chip ${q.startsWith("✓") ? "selected" : ""}`} onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        )}

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={language === "Hindi" ? "अपने बिज़नेस के बारे में लिखें…" : "Ask me about digital transformation, MSME benefits, or recommend a bundle…"}
            aria-label="Message"
            disabled={!session}
          />
          <button className="send" type="submit" disabled={busy || !text.trim()} aria-label="Send">
            <Icon name="send" size={20} strokeWidth={2.2} />
          </button>
        </form>
      </section>

      <aside className="panel bundles-panel">
        <h2 className="panel-title">Recommended MSME Bundles</h2>
        <p className="panel-sub">Tailored for your business</p>
        <div className="stack">
          {rec ? <BundlePreview rec={rec} onSeeQuote={onSeeQuote} /> : <ProfileCard profile={profile} />}
          <CallbackCard session={session} />
        </div>
      </aside>
    </div>
  );
}

function ProfileCard({ profile }) {
  const known = PROFILE_FIELDS.filter(([k]) => profile[k] != null && profile[k] !== "");
  return (
    <div className="bundle-card">
      <h3>What I know so far</h3>
      {known.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Answer a few questions - or paste your GSTIN and I'll fill in your business details from the GST registry.
        </p>
      ) : (
        <dl className="profile-list">
          {known.map(([k, label]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt>{label}</dt>
              <dd>{formatValue(k, profile[k])}</dd>
            </div>
          ))}
          {profile.needs?.length > 0 && (
            <>
              <dt>Needs</dt>
              <dd>{profile.needs.length} selected</dd>
            </>
          )}
        </dl>
      )}
      <p className="muted" style={{ marginBottom: 0 }}>
        No visit, no paperwork: most owners get a bundle and price in under 2 minutes.
      </p>
    </div>
  );
}

function BundlePreview({ rec, onSeeQuote }) {
  const [more, setMore] = useState(false);
  const included = rec.items.filter((i) => i.included);
  return (
    <div className="bundle-card featured">
      <div className="spread">
        <h3>Your Udyam Bundle</h3>
        <span className="badge accent">Recommended</span>
      </div>
      <p className="muted" style={{ margin: "0 0 10px" }}>
        For a {rec.profile.segment.toLowerCase()} business in {rec.profile.city}
      </p>
      <ul className="ticks">
        {included.map((i) => (
          <li key={i.id}>
            <Icon name="check" size={16} strokeWidth={2.4} />
            <span>
              {i.name} {i.quantity > 1 && <span className="muted">×{i.quantity}</span>}
              {more && <span className="tick-reason">{i.reason}</span>}
            </span>
          </li>
        ))}
      </ul>
      {more && rec.blocked.length > 0 && (
        <p className="muted">Not offered: {rec.blocked.map((b) => `${b.name} (${b.reasons[0]})`).join("; ")}</p>
      )}
      <div className="bundle-foot">
        <div>
          <div className="bundle-price">
            {inr(rec.quote.monthlyTotal)}
            <small>/mo</small>
          </div>
          <div className="muted">
            incl. GST · setup {inr(rec.quote.setupTotal)} · live in ~{rec.quote.activationDays} days
          </div>
        </div>
        <div className="row">
          <button className="btn red" onClick={onSeeQuote}>
            Get Started
          </button>
          <button className="btn outline" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {more ? "Show Less" : "Know More"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hand-off to a person: the digital journey routes to a local partner instead of competing with them.
function CallbackCard({ session }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", consent: false });
  const [state, setState] = useState({ busy: false, error: "", done: "" });

  if (!session) return null;
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: "", done: "" });
    try {
      const r = await api.callback({ sessionId: session.id, ...form });
      setState({ busy: false, error: "", done: r.message });
    } catch (err) {
      setState({ busy: false, error: err.message, done: "" });
    }
  };

  return (
    <div className="bundle-card">
      <div className="spread">
        <div>
          <h3>Prefer to talk to someone?</h3>
          <div className="muted">A local Accel partner calls you back - your chat is shared so you don't repeat yourself.</div>
        </div>
        {!open && !state.done && (
          <button className="btn outline small" onClick={() => setOpen(true)}>
            Request call
          </button>
        )}
      </div>
      {state.done && <div className="notice" style={{ marginTop: 12 }}>{state.done}</div>}
      {open && !state.done && (
        <form onSubmit={submit} className="stack" style={{ marginTop: 12 }}>
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              <span>Name</span>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>Mobile number</span>
              <input
                className="input"
                inputMode="numeric"
                maxLength={10}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
              />
            </label>
          </div>
          <label className="row muted" style={{ alignItems: "flex-start" }}>
            <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} />
            <span>I agree that Accel Business and its local partner may call me about this enquiry. My number is used only for this call-back.</span>
          </label>
          {state.error && <div className="error">{state.error}</div>}
          <button className="btn red" disabled={state.busy || !form.consent || form.phone.length !== 10}>
            {state.busy ? <span className="spinner" /> : "Call me back"}
          </button>
        </form>
      )}
    </div>
  );
}
