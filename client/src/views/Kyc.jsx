import { useEffect, useState } from "react";
import { api, inr } from "../api.js";
import Icon from "../icons.jsx";

const DOCS = [
  ["gst_certificate", "GST Certificate", "Required"],
  ["signatory_id", "Signatory ID (PAN / Aadhaar)", "Required"],
  ["address_proof", "Proof of Address (Utility Bill)", "Required · last 90 days"],
  ["udyam_certificate", "Udyam Certificate", "Optional · we can look it up"],
];

const FIELD_LABELS = {
  gstin: "GSTIN", legalName: "Legal name", tradeName: "Trade name", constitution: "Constitution", address: "Address",
  liabilityDate: "Liability date", udyam: "Udyam no.", enterpriseName: "Enterprise", majorActivity: "Activity", city: "City",
  state: "State", registrationDate: "Registered", name: "Name", designation: "Designation", business: "For business",
  idNumber: "ID no.", validTill: "Valid till", consumerNo: "Consumer no.", billedTo: "Billed to", billDate: "Bill date",
};

const STEPS = ["Basic Info", "Verification", "E-sign", "Completion"];

const toDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });

export default function Kyc({ session, quote, onOrderPlaced, onBack }) {
  const [consentId, setConsentId] = useState(null);
  const [docs, setDocs] = useState({}); // type -> { status, preview, result }
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const setDoc = (type, patch) => setDocs((d) => ({ ...d, [type]: { ...d[type], ...patch } }));

  const upload = async (type, file) => {
    if (!file || !consentId) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return setDoc(type, { status: "error", message: "Use a PNG, JPG or WebP photo" });
    if (file.size > 8 * 1024 * 1024) return setDoc(type, { status: "error", message: "Image is larger than 8 MB" });
    const dataUrl = await toDataUrl(file);
    setResult(null);
    setDoc(type, { status: "reading", preview: dataUrl, result: null, message: "" });
    try {
      setDoc(type, { status: "done", result: await api.uploadDocument(consentId, type, dataUrl) });
    } catch (e) {
      setDoc(type, { status: "error", message: e.message });
    }
  };

  const loadSpecimen = async (applicant) => {
    setResult(null);
    setDocs({});
    setError("");
    for (const [type] of DOCS) {
      if (!applicant.docs.includes(type)) continue;
      const file = `${applicant.id}_${type}.png`;
      setDoc(type, { status: "reading", preview: `/api/kyc/samples/${file}`, result: null });
      try {
        setDoc(type, { status: "done", result: await api.sampleDocument(consentId, file) });
      } catch (e) {
        setDoc(type, { status: "error", message: e.message });
      }
    }
  };

  const verify = async () => {
    setBusy(true);
    setError("");
    try {
      setResult(await api.validate(consentId));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!window.confirm("Withdraw consent? All extracted document details for this application will be deleted.")) return false;
    await api.withdraw(consentId).catch(() => {});
    setConsentId(null);
    setDocs({});
    setResult(null);
    return true;
  };

  const reading = Object.values(docs).some((d) => d.status === "reading");
  const uploaded = Object.values(docs).filter((d) => d.status === "done").length;
  const step = !consentId ? 0 : result?.verdict === "verified" ? 2 : 1;

  return (
    <div className="kyc">
      <div className="portal-head">
        <div className="portal-title">
          <span className="portal-emblem">
            <Icon name="shield" size={26} />
          </span>
          <h2>Smart Instant KYC & DPDP Act 2023 Consent Portal</h2>
        </div>
        <ol className="kyc-steps" aria-label="KYC progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? "on" : i < step ? "done" : ""} aria-current={i === step ? "step" : undefined}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="kyc-grid">
        <section>
          <h2 className="section-title">GSTIN Registry Lookup & Business Details</h2>
          <GstinLookup initial={session.profile.gstin} />
        </section>

        <section>
          <div className="spread section-title-row">
            <h2 className="section-title">OCR Document Upload</h2>
            <SpecimenPicker onPick={loadSpecimen} disabled={reading || !consentId} />
          </div>
          <div className="glass-panel">
            <div className={`doc-grid ${consentId ? "" : "locked"}`}>
              {DOCS.map(([type, label, hint]) => (
                <DocSlot
                  key={type}
                  label={label}
                  hint={hint}
                  doc={docs[type]}
                  disabled={!consentId}
                  onFile={(f) => upload(type, f)}
                />
              ))}
              {!consentId && (
                <div className="lock-note">
                  <Icon name="lock" size={18} /> Tick the DPDP consent below to start uploading
                </div>
              )}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn blue" onClick={verify} disabled={busy || reading || uploaded === 0}>
                {busy ? <span className="spinner" /> : "Verify Documents"}
              </button>
              {reading && (
                <span className="muted">
                  <span className="spinner" /> Reading documents (OCR runs on our server; images are not stored)…
                </span>
              )}
            </div>
            {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
          </div>
        </section>
      </div>

      {result && <Results result={result} />}

      <section>
        <h2 className="section-title">Privacy Consent & DPDP Act 2023 Compliance</h2>
        <ConsentPanel
          session={session}
          quote={quote}
          consentId={consentId}
          onAccept={setConsentId}
          onWithdraw={withdraw}
          verified={result?.verdict === "verified"}
          onOrderPlaced={onOrderPlaced}
          onBack={onBack}
        />
      </section>
    </div>
  );
}

function GstinLookup({ initial }) {
  const [gstin, setGstin] = useState(initial || "");
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const lookup = async () => {
    setBusy(true);
    try {
      setR(await api.lookupGstin(gstin.trim().toUpperCase()));
    } catch (e) {
      setR({ found: false, error: e.message });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (initial) lookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const ok = r?.found;
  return (
    <div className="glass-panel">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
      >
        <label className="field" htmlFor="gstin">
          <span>Enter GSTIN</span>
        </label>
        <div className="row gstin-row">
          <div className={`input-wrap ${ok ? "valid" : ""}`}>
            <input
              id="gstin"
              className="input"
              value={gstin}
              maxLength={15}
              placeholder="15-character GSTIN"
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
            />
            {ok && <Icon name="check" size={18} strokeWidth={2.4} className="valid-icon" />}
          </div>
          <button className="btn blue" disabled={busy || gstin.trim().length !== 15}>
            {busy ? <span className="spinner" /> : <>Fetch Details {ok && <Icon name="check" size={18} strokeWidth={2.4} />}</>}
          </button>
        </div>
      </form>
      <div className="divider" />
      <h3 className="sub-title">Auto-Populated Business Details</h3>
      {r && !r.found && <div className="error">{r.error}</div>}
      <dl className="biz-rows">
        <dt>Business Legal Name</dt>
        <dd>{r?.legalName || "—"}</dd>
        <dt>Trade Name</dt>
        <dd>{r?.tradeName || "—"}</dd>
        <dt>Constitution</dt>
        <dd>{r?.constitution || "—"}</dd>
        <dt>Registration Date</dt>
        <dd>{r?.registrationDate || "—"}</dd>
        <dt>Registered Address</dt>
        <dd>{r?.address || "—"}</dd>
        <dt>Registry Status</dt>
        <dd>{r?.status ? <span className={`badge ${r.status === "Active" ? "good" : "bad"}`}>{r.status}</span> : "—"}</dd>
      </dl>
    </div>
  );
}

function SpecimenPicker({ onPick, disabled }) {
  const [list, setList] = useState([]);
  useEffect(() => {
    api.samples().then(setList).catch(() => {});
  }, []);
  if (!list.length) return null;
  return (
    <select
      className="select compact"
      defaultValue=""
      disabled={disabled}
      aria-label="Demo: use a specimen applicant"
      title="Demo: use a specimen applicant"
      onChange={(e) => {
        const a = list.find((x) => x.id === e.target.value);
        if (a) onPick(a);
      }}
    >
      <option value="" disabled>
        Demo specimen K01-K12…
      </option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.id} ({a.docs.length} documents)
        </option>
      ))}
    </select>
  );
}

function DocSlot({ label, hint, doc, onFile, disabled }) {
  const [over, setOver] = useState(false);
  const r = doc?.result;
  const ok = r && r.readable && !r.wrongSlot;
  const cls = doc?.status === "done" ? (ok ? "ok" : "bad") : doc?.status === "error" ? "bad" : "";

  const onDrop = (e) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) onFile(e.dataTransfer.files[0]);
  };

  return (
    <div className="doc-slot">
      <div className="doc-title">
        <span>
          {label}
          <small>{hint}</small>
        </span>
        {doc?.status === "done" && (
          <span className={`doc-status ${ok ? "good" : "bad"}`} title={ok ? `Read with ${r.confidence}% confidence` : "Retake needed"}>
            {ok ? <Icon name="check" size={14} strokeWidth={3} /> : "!"}
          </span>
        )}
      </div>
      <label
        className={`dropzone ${cls} ${over ? "over" : ""} ${disabled ? "disabled" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          capture="environment"
          hidden
          disabled={disabled}
          onChange={(e) => onFile(e.target.files[0])}
        />
        <span className="drop-hint">Drag and drop or click to upload</span>
        {doc?.preview ? (
          <img src={doc.preview} alt={`${label} preview`} />
        ) : (
          <>
            <span className="drop-or">or</span>
            <span className="btn white small">Browse</span>
          </>
        )}
        {doc?.status === "reading" && (
          <div className="scan">
            <div className="scan-bar">
              <i />
            </div>
            <span>
              <span className="spinner" /> OCR scanning…
            </span>
          </div>
        )}
        {doc?.status === "error" && <div className="ocr-box warn">⚠ {doc.message}</div>}
        {r && r.wrongSlot && <div className="ocr-box warn">⚠ This looks like a different document.</div>}
        {r && !r.readable && !r.wrongSlot && (
          <div className="ocr-box warn">⚠ Too blurred to read. Retake in good light, flat, all corners visible.</div>
        )}
        {r && r.readable && (
          <div className="ocr-box">
            <b>OCR results ({r.confidence}%):</b>
            {Object.entries(r.fields)
              .filter(([, v]) => v)
              .slice(0, 4)
              .map(([k, v]) => (
                <div key={k} title={String(v)}>
                  {FIELD_LABELS[k] || k}: {String(v)}
                </div>
              ))}
          </div>
        )}
      </label>
    </div>
  );
}

const VERDICT = {
  verified: ["good", "Verified", "All checks passed. Sign with Aadhaar OTP below to place your order."],
  action_needed: ["warn", "Action needed", "A few things need fixing - each one says how."],
  manual_review: ["bad", "Needs review", "We can't verify this automatically. A KYC specialist will contact you within 1 working day."],
};

function Results({ result }) {
  const [tone, title, text] = VERDICT[result.verdict];
  return (
    <section>
      <h2 className="section-title">Verification Result</h2>
      <div className="glass-panel">
        <div className="spread">
          <p className="sub" style={{ margin: 0 }}>
            {text}
          </p>
          <span className={`badge ${tone}`}>{title}</span>
        </div>
        {result.business && (
          <p className="muted">
            {result.business.tradeName} · {result.business.constitution} · GSTIN {result.business.gstinMasked}
          </p>
        )}
        <div className="checks-grid">
          {result.checks.map((c) => (
            <div key={c.id} className="check">
              <div className={`check-icon ${c.status}`} aria-label={c.status}>
                {c.status === "pass" ? "✓" : c.status === "warn" ? "!" : "✕"}
              </div>
              <div>
                <div className="check-title">{c.title}</div>
                <div className="check-detail">{c.detail}</div>
                {c.fix && <div className="check-fix">→ {c.fix}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Consent is recorded before any document is read; e-sign unlocks once KYC is verified.
function ConsentPanel({ session, quote, consentId, onAccept, onWithdraw, verified, onOrderPlaced, onBack }) {
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);
  const [otp, setOtp] = useState("");

  const toggleConsent = async (checked) => {
    setError("");
    if (!checked) {
      if (await onWithdraw()) {
        setSent(null);
        setOtp("");
      }
      return;
    }
    setBusy(true);
    try {
      const purposes = ["kyc_verification", "service_activation", ...(marketing ? ["product_updates"] : [])];
      const r = await api.consent(session.id, purposes);
      onAccept(r.consentId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startEsign = async () => {
    setBusy(true);
    setError("");
    try {
      setSent(await api.esignStart(consentId));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await api.esignVerify(consentId, otp);
      onOrderPlaced(await api.placeOrder(session.id, consentId));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="glass-panel consent-panel">
      <div className="consent-banner">
        <span className="consent-shield">
          <Icon name="shield" size={30} />
        </span>
        <div>
          In compliance with the Digital Personal Data Protection (DPDP) Act, 2023, I hereby authorize Accel Business to verify and process
          my business and personal data (GSTIN, Udyam number, signatory ID and utility bill) solely for KYC and onboarding purposes. I
          understand document photos are read in memory and never stored, and I retain the right to withdraw this consent.
          <details className="notice-details">
            <summary>Read the full privacy notice</summary>
            <ul>
              <li><b>GSTIN, Udyam number, business name and address</b> - to confirm your business with the GST and Udyam registries.</li>
              <li><b>Authorised signatory's name, designation and ID number</b> - to confirm who can sign the order.</li>
              <li><b>A recent utility bill</b> - to confirm the installation address.</li>
              <li>Identifiers are masked on screens and in logs (e.g. 27*********U1ZL).</li>
              <li>Used only for KYC and activating your services - not for marketing unless you opt in.</li>
              <li>Kept only as long as telecom KYC rules require, then deleted.</li>
              <li>Unticking the box below withdraws consent; your extracted details are deleted immediately. Grievance officer: privacy@accel.example (fictional)</li>
            </ul>
          </details>
        </div>
      </div>

      <div className="consent-actions">
        <div className="stack consent-checks">
          <label className="check-row">
            <input type="checkbox" checked={Boolean(consentId)} disabled={busy} onChange={(e) => toggleConsent(e.target.checked)} />
            <span>I agree to the processing above for KYC and onboarding under the DPDP Act 2023.</span>
          </label>
          <label className="check-row small">
            <input type="checkbox" checked={marketing} disabled={Boolean(consentId)} onChange={(e) => setMarketing(e.target.checked)} />
            <span>Optional: send me product updates and offers. (Not needed to continue.)</span>
          </label>
        </div>
        <div className="row">
          {!sent ? (
            <button
              className="btn orange"
              disabled={busy || !verified}
              onClick={startEsign}
              title={verified ? "" : "Verify your documents first"}
            >
              {busy && consentId ? <span className="spinner" /> : "Verify via Aadhaar OTP"}
              <Icon name="arrow" size={18} />
            </button>
          ) : (
            <>
              <input
                className="input otp-input"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                placeholder="6-digit OTP"
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                aria-label="OTP"
              />
              <button className="btn orange" disabled={busy || otp.length !== 6} onClick={confirm}>
                {busy ? <span className="spinner" /> : "Confirm Order"}
              </button>
            </>
          )}
          <button className="btn outline-light" onClick={onBack}>
            Go Back
          </button>
        </div>
      </div>
      {sent && (
        <div className="otp-toast">
          {sent.channel === "email" ? (
            <>📧 We emailed a 6-digit e-sign code to {sent.to}</>
          ) : (
            <>
              📱 Simulated SMS: your e-sign OTP is <b>{sent.demoOtp}</b>
            </>
          )}{" "}
          · {inr(quote.quote.monthlyTotal, 2)}/month · first bill{" "}
          {inr(quote.quote.firstBill, 2)} · {quote.quote.contractMonths}-month contract
          <div className="muted">{sent.note}</div>
        </div>
      )}
      {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
    </div>
  );
}
