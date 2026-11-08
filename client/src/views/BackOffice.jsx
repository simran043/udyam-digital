import { useEffect, useState } from "react";
import { api, inr } from "../api.js";

// Proposed targets for the digital journey (see docs/BUSINESS_CASE.md).
const TARGETS = {
  activationRate: "Target 12% within 2 quarters",
  avgDaysToActivate: "Target ≤ 7 days",
  cacPerActivation: "Target ≤ ₹8,000",
  avgFollowUpCalls: "Target ≤ 1 call",
  churn6m: "Target ≤ 10%",
};

function Bars({ rows, max, valueOf, labelOf, format, toneOf, titleOf }) {
  return (
    <div className="bars">
      {rows.map((r) => {
        const v = valueOf(r);
        return (
          <div key={labelOf(r)} className="bar-row" title={titleOf ? titleOf(r) : `${labelOf(r)}: ${format(v)}`}>
            <div className="bar-label">{labelOf(r)}</div>
            <div className="bar-track">
              <div className={`bar-fill ${toneOf ? toneOf(r) : ""}`} style={{ width: `${(v / max) * 100}%` }} />
              <span className="bar-value" style={{ left: `${Math.min(85, (v / max) * 100)}%` }}>
                {format(v)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function BackOffice() {
  const [data, setData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [sessions, setSessions] = useState(null);
  const [filters, setFilters] = useState({ segment: "", reason: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    api.boSummary().then(setData).catch((e) => setError(e.message));
    api.boAdvisor().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    const params = { limit: 12 };
    if (filters.segment) params.segment = filters.segment;
    if (filters.reason) params.reason = filters.reason;
    api.boWinback(params).then(setLeads).catch((e) => setError(e.message));
  }, [filters]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <div className="muted"><span className="spinner" /> Loading partner console…</div>;

  const h = data.headline;
  const kpis = [
    ["Lead → activation", `${h.activationRate}%`, "activationRate"],
    ["Days to activate", h.avgDaysToActivate, "avgDaysToActivate"],
    ["Cost per activation", inr(h.cacPerActivation), "cacPerActivation"],
    ["Status-chasing calls", h.avgFollowUpCalls, "avgFollowUpCalls"],
    ["6-month churn", `${h.churn6m}%`, "churn6m"],
  ];
  const reasons = data.dropReasons;

  return (
    <div className="stack">
      <div className="card">
        <h2>Partner & sales console</h2>
        <p className="sub" style={{ marginBottom: 0 }}>
          Baseline from {h.leads.toLocaleString("en-IN")} SMB leads (Apr-Jun 2026), the leads the advisor could not close, and who to call next.
        </p>
      </div>

      <div className="grid-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {kpis.map(([label, value, key]) => (
          <div key={key} className="card kpi">
            <div className="label">{label}</div>
            <div className="value">{value}</div>
            <div className="target">{TARGETS[key]}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Acquisition funnel</h3>
          <Bars
            rows={data.funnel}
            max={data.funnel[0].count}
            valueOf={(r) => r.count}
            labelOf={(r) => r.stage}
            format={(v) => v.toLocaleString("en-IN")}
            titleOf={(r) => `${r.stage}: ${r.count.toLocaleString("en-IN")}${r.conversion ? ` (${r.conversion}% of previous stage)` : ""}`}
          />
          <p className="muted" style={{ marginBottom: 0 }}>
            Biggest leak: needs assessed → quote accepted ({data.funnel[3].conversion}%). GSTIN holders activate at {h.activationWithGstin}% vs{" "}
            {h.activationWithoutGstin}% without - so the advisor asks for GSTIN early and auto-fills from it.
          </p>
        </div>

        <div className="card">
          <h3>Why leads drop</h3>
          <div className="legend">
            <span><i style={{ background: "var(--accent)" }} />Fixed by the digital journey</span>
            <span><i style={{ background: "var(--accent-2)" }} />Needs other action</span>
          </div>
          <Bars
            rows={reasons.slice(0, 12)}
            max={reasons[0].count}
            valueOf={(r) => r.count}
            labelOf={(r) => r.reason}
            format={(v) => v.toLocaleString("en-IN")}
            toneOf={(r) => (r.fixable ? "accent" : "")}
            titleOf={(r) => `${r.reason} (${r.stage}): ${r.count}${r.fix ? ` - fix: ${r.fix}` : ""}`}
          />
          <p className="muted" style={{ marginBottom: 0 }}>
            {data.fixableDrops.toLocaleString("en-IN")} of {reasons.reduce((s, r) => s + r.count, 0).toLocaleString("en-IN")} drops have a reason the new journey
            removes.
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Segments</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Segment</th>
                <th className="num">Leads</th>
                <th className="num">Activation</th>
                <th className="num">Median bundle /mo</th>
                <th className="num">Cost per activation</th>
                <th className="num">6-mo churn</th>
                <th className="num">NPS</th>
              </tr>
            </thead>
            <tbody>
              {data.bySegment.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="num">{s.leads.toLocaleString("en-IN")}</td>
                  <td className="num">{s.activationRate}%</td>
                  <td className="num">{inr(s.medianBundle)}</td>
                  <td className="num">{inr(s.cacPerActivation)}</td>
                  <td className="num">{s.churn6m}%</td>
                  <td className="num">{s.avgNps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: 20 }}>Lead sources</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th className="num">Leads</th>
                <th className="num">Activation</th>
                <th className="num">Cost per activation</th>
              </tr>
            </thead>
            <tbody>
              {data.bySource.map((s) => (
                <tr key={s.name}>
                  <td>{s.name}</td>
                  <td className="num">{s.leads.toLocaleString("en-IN")}</td>
                  <td className="num">{s.activationRate}%</td>
                  <td className="num">{inr(s.cacPerActivation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="spread">
            <h3 style={{ margin: 0 }}>Who to call next - win-back list</h3>
            <div className="row">
              <select className="select" style={{ width: "auto" }} value={filters.segment} onChange={(e) => setFilters({ ...filters, segment: e.target.value })} aria-label="Segment">
                <option value="">All segments</option>
                {data.bySegment.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
              <select className="select" style={{ width: "auto" }} value={filters.reason} onChange={(e) => setFilters({ ...filters, reason: e.target.value })} aria-label="Drop reason">
                <option value="">All fixable reasons</option>
                {reasons.filter((r) => r.fixable).map((r) => (
                  <option key={r.reason}>{r.reason}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="muted">Dropped leads whose reason the digital journey removes, ranked by predicted activation probability.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Dropped because</th>
                  <th className="num">Score</th>
                  <th>Route to</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.leadId}>
                    <td>
                      <b>{l.business}</b>
                      <div className="muted">
                        {l.type} · {l.city} · {l.language} · {l.contact}
                      </div>
                      {l.signals.length > 0 && <div className="muted">Signals: {l.signals.join(", ")}</div>}
                    </td>
                    <td>
                      {l.dropReason}
                      <div className="muted">→ {l.fix}</div>
                    </td>
                    <td className="num">
                      <span className="score">{l.score}%</span>
                    </td>
                    <td>
                      {l.route.channel}
                      <div className="muted">{l.route.why}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Propensity model</h3>
            <p className="muted" style={{ marginTop: 0 }}>
              Logistic regression trained on {data.model.trainSize.toLocaleString("en-IN")} leads; tested on {data.model.testSize.toLocaleString("en-IN")} held-out leads.
            </p>
            <div className="grid-3" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
              <div>
                <div className="muted">AUC</div>
                <div className="value" style={{ fontSize: 22, fontWeight: 700 }}>{data.model.auc}</div>
              </div>
              <div>
                <div className="muted">Top-20% lift</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{data.model.topDecileLift}×</div>
              </div>
              <div>
                <div className="muted">Top-20% activation</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{data.model.top20ActivationRate}%</div>
              </div>
            </div>
            <div className="row" style={{ alignItems: "flex-start", marginTop: 12, gap: 24 }}>
              <div>
                <div className="muted">Raises odds</div>
                <ul style={{ paddingLeft: 18, margin: "4px 0", fontSize: 13.5 }}>
                  {data.model.signals.positive.map((s) => (
                    <li key={s.label}>{s.label}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="muted">Lowers odds</div>
                <ul style={{ paddingLeft: 18, margin: "4px 0", fontSize: 13.5 }}>
                  {data.model.signals.negative.map((s) => (
                    <li key={s.label}>{s.label}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="spread">
              <h3 style={{ margin: 0 }}>Advisor sessions (live)</h3>
              <button className="btn small ghost" onClick={() => api.boAdvisor().then(setSessions)}>
                Refresh
              </button>
            </div>
            <p className="muted">Chats that did not end in an order are handed to a partner. Names and numbers are masked.</p>
            {!sessions?.sessions?.length ? (
              <p className="muted">No advisor chats yet in this server session.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Business</th>
                      <th>Stage</th>
                      <th className="num">Quote</th>
                      <th>Next action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.sessions.map((s) => (
                      <tr key={s.sessionId}>
                        <td>
                          {s.business}
                          <div className="muted">
                            {s.city} · {s.language} · {s.engine}
                          </div>
                        </td>
                        <td>{s.outcome.replace(/_/g, " ")}</td>
                        <td className="num">{s.quoteMonthly ? inr(s.quoteMonthly) : "-"}</td>
                        <td>
                          {s.orderId
                            ? `Order ${s.orderId}`
                            : s.callback
                              ? `Call ${s.callback.name} (${s.callback.phone})`
                              : s.quoteMonthly
                                ? "WhatsApp quote reminder"
                                : "Nudge to finish chat"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
