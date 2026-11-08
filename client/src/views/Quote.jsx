import { useEffect, useRef, useState } from "react";
import { api, inr } from "../api.js";
import Icon, { CATEGORY_ICON } from "../icons.jsx";

const TABS = [
  { key: "bundle", label: "Your Bundle" },
  { key: "addons", label: "Modular Add-ons" },
];

export default function Quote({ session, quote, setQuote, onContinue }) {
  const rec = session.recommendation;
  const profile = session.profile;
  const [items, setItems] = useState(() => quote?.items || rec.items);
  const [months, setMonths] = useState(quote?.quote?.contractMonths || 12);
  const [tab, setTab] = useState("bundle");
  const [catalogue, setCatalogue] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  // Descriptions and price ranges for the cards (prices themselves come from the server quote).
  useEffect(() => {
    api
      .catalogue()
      .then((list) => setCatalogue(Object.fromEntries(list.map((p) => [p.id, p]))))
      .catch(() => {});
  }, []);

  // Re-price on the server after every change so rules and prices stay authoritative.
  useEffect(() => {
    const id = ++seq.current;
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.quote(
          session.id,
          items.map(({ id: pid, included, quantity }) => ({ id: pid, included, quantity })),
          months,
        );
        if (id !== seq.current) return;
        setQuote(r);
        setError("");
        // Server may switch an item off if a rule is broken (e.g. a dependency was removed).
        if (r.items.some((ri, i) => ri.included !== items[i]?.included)) setItems(r.items);
      } catch (e) {
        if (id === seq.current) setError(e.message);
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, months]);

  const update = (pid, patch) => setItems((list) => list.map((i) => (i.id === pid ? { ...i, ...patch } : i)));
  const q = quote?.quote;
  const lineFor = (pid) => q?.lines.find((l) => l.id === pid);
  const warnings = Object.fromEntries((quote?.items || []).filter((i) => i.warning).map((i) => [i.id, i.warning]));
  const spend = profile.currentSpend;

  const core = items.filter((i) => i.source !== "addon");
  const addons = items.filter((i) => i.source === "addon");
  const shown = tab === "addons" && addons.length ? addons : core;

  const renderItem = (item) => {
    const line = lineFor(item.id);
    const product = catalogue[item.id];
    const isAddon = item.source === "addon";
    return (
      <div key={item.id} className={`plan-card ${item.included ? "on" : ""}`}>
        <div className="plan-head">
          <span className="plan-icon">
            <Icon name={CATEGORY_ICON[item.category] || "box"} size={22} />
          </span>
          <div className="plan-name">{item.name}</div>
          <label className="toggle" title={item.included ? "Remove" : "Add"}>
            <input
              type="checkbox"
              checked={item.included}
              onChange={(e) => update(item.id, { included: e.target.checked })}
              aria-label={`Include ${item.name}`}
            />
            <span />
          </label>
        </div>
        <div className="plan-desc">{product?.description || item.category}</div>
        <div className="plan-reason">{item.reason}</div>
        {warnings[item.id] && <div className="plan-warn">⚠ {warnings[item.id]}</div>}
        <div className="plan-foot">
          <div className="plan-price">
            {line ? (
              <>
                {isAddon ? "+" : ""}
                {inr(line.monthly)}
                <small> / mo</small>
              </>
            ) : product ? (
              <>
                <small>from </small>
                {inr(product.priceMin)}
                <small> / mo</small>
              </>
            ) : (
              <small>not included</small>
            )}
          </div>
          <div className="qty" aria-label={`Quantity of ${item.name}`} title={item.unit}>
            <button type="button" onClick={() => update(item.id, { quantity: Math.max(1, item.quantity - 1) })} aria-label="Fewer">
              −
            </button>
            <span>{item.quantity}</span>
            <button type="button" onClick={() => update(item.id, { quantity: Math.min(100, item.quantity + 1) })} aria-label="More">
              +
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="quote-layout">
      <section className="quote-main">
        <div className="quote-brand">
          <span className="quote-logo">U</span>
          <div>
            <div className="quote-brand-name">Project Udyam Digital</div>
            <div className="quote-brand-sub">Customizable solutions for your enterprise.</div>
          </div>
        </div>

        <h2 className="section-title">1. Build Your Modular Plan</h2>
        <div className="row tabs-row">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`pill-tab ${tab === t.key ? "on" : ""}`}
              onClick={() => setTab(t.key)}
              disabled={t.key === "addons" && !addons.length}
            >
              {t.label}
              {t.key === "addons" && addons.length ? ` (${addons.length})` : ""}
            </button>
          ))}
          <div className="segmented" role="group" aria-label="Contract length" style={{ marginLeft: "auto" }}>
            {[12, 24].map((m) => (
              <button key={m} className={months === m ? "on" : ""} onClick={() => setMonths(m)}>
                {m} months{m === 24 ? " · lowest price" : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="plan-grid">{shown.map(renderItem)}</div>

        {rec.tips.map((t) => (
          <div key={t} className="notice light" style={{ marginTop: 16 }}>
            💡 {t}
          </div>
        ))}

        <div className="biz-details">
          <label className="field">
            <span>Business Details</span>
            <div className={`input-like ${profile.hasGstin ? "valid" : ""}`}>
              {profile.gstin || (profile.hasGstin ? "GSTIN on file" : "GSTIN (Optional)")}
              {profile.hasGstin && <Icon name="check" size={18} strokeWidth={2.6} className="valid-icon" />}
            </div>
            {profile.hasGstin && <small className="valid-text">✓ Validated with the GST registry</small>}
          </label>
          <label className="field">
            <span>Company Name</span>
            <div className="input-like">{profile.businessName || profile.businessType || "-"}</div>
          </label>
          <label className="field">
            <span>City</span>
            <div className="input-like">{profile.city || "-"}</div>
          </label>
          <label className="field">
            <span>Segment</span>
            <div className="input-like">{profile.segment || "-"}</div>
          </label>
        </div>
      </section>

      <aside className="quote-side" aria-live="polite">
        <h2 className="section-title">2. Your Live Quote & Checkout</h2>
        <div className="summary-card">
          <div className="spread">
            <h3>Order Summary</h3>
            {busy && <span className="spinner dark" aria-label="Updating" />}
          </div>
          {error && <div className="error">{error}</div>}
          {q && (
            <>
              <div className="summary-line strong">
                <span>Subtotal</span>
                <span>{inr(q.subtotal, 2)} / month</span>
              </div>
              <div className="summary-sep" />
              <div className="summary-line">
                <span>CGST (9%)</span>
                <span>{inr(q.cgst, 2)}</span>
              </div>
              <div className="summary-line">
                <span>SGST (9%)</span>
                <span>{inr(q.sgst, 2)}</span>
              </div>
              <div className="summary-sep" />
              {q.lines.map((l) => (
                <div key={l.id} className="summary-line">
                  <span>
                    {l.name}
                    {l.quantity > 1 ? ` ×${l.quantity}` : ""}
                  </span>
                  <span>{inr(l.monthly, 2)}</span>
                </div>
              ))}
              <div className="summary-line">
                <span>GST (18%)</span>
                <span>{inr(q.cgst + q.sgst, 2)}</span>
              </div>
              <div className="summary-sep" />
              <div className="total-label">Total Monthly Price</div>
              <div className="big-price">
                {inr(q.monthlyTotal, 2)}
                <small> / month</small>
              </div>
              <div className="summary-line">
                <span>One-time setup (incl. GST)</span>
                <span>{inr(q.setupWithGst, 2)}</span>
              </div>
              <div className="summary-line">
                <span>First bill (month 1 + setup)</span>
                <span>{inr(q.firstBill, 2)}</span>
              </div>
              <div className="summary-line">
                <span>Everything live in</span>
                <span>~{q.activationDays} days</span>
              </div>
              {spend ? (
                <div className="notice light" style={{ marginTop: 10 }}>
                  You spend about {inr(spend)}/mo today across separate providers. This is{" "}
                  {q.monthlyTotal > spend ? `${inr(q.monthlyTotal - spend)} more` : `${inr(spend - q.monthlyTotal)} less`}, on one bill
                  with one support number.
                </div>
              ) : null}
              <button className="btn checkout block" disabled={busy || !q.lines.length} onClick={onContinue}>
                <Icon name="lock" size={18} /> Proceed to KYC & Checkout
              </button>
              <div className="secure-note">
                <Icon name="shield" size={15} /> No hidden charges · each service's minimum contract applies
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
