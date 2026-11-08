import { useEffect, useState } from "react";
import { api, inr } from "../api.js";
import Icon from "../icons.jsx";

const LINE_STATUS = { active: ["good", "Active"], in_progress: ["warn", "Being set up"], ordered: ["", "Ordered"] };

// Route for the illustrative map (viewBox 0 0 400 300).
const ROUTE = [
  [40, 120],
  [110, 150],
  [170, 200],
  [240, 220],
  [290, 170],
  [320, 110],
  [330, 70],
];

function pointAlong(points, t) {
  const segs = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let dist = segs.reduce((a, b) => a + b, 0) * Math.min(1, Math.max(0, t));
  for (let i = 0; i < segs.length; i++) {
    if (dist <= segs[i]) {
      const f = segs[i] ? dist / segs[i] : 0;
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * f, points[i][1] + (points[i + 1][1] - points[i][1]) * f];
    }
    dist -= segs[i];
  }
  return points.at(-1);
}

export default function Tracker({ initialId }) {
  const [id, setId] = useState(initialId || "");
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async (orderId = id) => {
    if (!orderId) return;
    setBusy(true);
    setError("");
    try {
      setOrder(await api.order(orderId.trim()));
    } catch (e) {
      setOrder(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initialId) load(initialId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  const advance = async () => {
    setBusy(true);
    try {
      setOrder(await api.advanceOrder(order.id));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tracker">
      <div className="crumbs-row">
        <nav className="crumbs" aria-label="Breadcrumb">
          <span>Dashboard</span>
          <span aria-hidden="true">›</span>
          <span>Project Activation</span>
          <span aria-hidden="true">›</span>
          <b>Activation Details</b>
        </nav>
        <div className="crumbs-right">Real-Time Order & Field Activation Tracker</div>
      </div>

      <div className="glass-panel">
        <div className="spread">
          <h2 className="panel-heading">Activation Progress</h2>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              load();
            }}
          >
            <input
              className="input"
              style={{ width: 230 }}
              value={id}
              placeholder="Order ID, e.g. UD-12345-AB12"
              onChange={(e) => setId(e.target.value.toUpperCase())}
              aria-label="Order ID"
            />
            <button className="btn" disabled={busy || !id}>
              Track
            </button>
          </form>
        </div>
        {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
        {!order && !error && <p className="muted">Place an order from the advisor to see it here.</p>}
        {order && (
          <div className="stepper">
            {order.timeline.map((s) => (
              <div key={s.key} className={`stepper-item ${s.status}`}>
                <div className="stepper-dot">{s.status === "done" ? <Icon name="check" size={16} strokeWidth={3} /> : ""}</div>
                <div className="stepper-label">
                  {s.title}
                  <div className="muted">{s.plannedDate}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {order && <OrderDetails order={order} busy={busy} onAdvance={advance} />}
    </div>
  );
}

function OrderDetails({ order, busy, onAdvance }) {
  const stage = (key) => order.timeline.find((s) => s.key === key);
  const scheduled = stage("scheduled");
  const install = stage("installation");
  const finalDay = order.timeline.at(-1).day;
  const progress = finalDay ? order.demoDay / finalDay : 1;
  const [vanX, vanY] = pointAlong(ROUTE, progress);
  const connectivity = order.lines.find((l) => /fibre|fiber|airfiber|broadband/i.test(l.name)) || order.lines[0];
  const [netTone, netLabel] = LINE_STATUS[connectivity.status];

  let visit;
  if (install.status === "done") visit = "Installation and demo completed.";
  else if (scheduled.status === "done") visit = `Visit booked for ${install.plannedDate}, 10 am - 1 pm.`;
  else visit = `A local partner will be assigned on ${scheduled.plannedDate}.`;

  return (
    <>
      <div className="track-grid">
        <section className="stack">
          <h2 className="section-title">Order & Activation Details</h2>
          <div className="glass-panel">
            <h3 className="panel-heading">Quick info</h3>
            <dl className="info-list">
              <dt>Order ID:</dt>
              <dd>#{order.id}</dd>
              <dt>Customer:</dt>
              <dd>{order.profile.businessName}</dd>
              <dt>Service Plan:</dt>
              <dd>{order.lines.map((l) => l.name).join(" + ")}</dd>
              <dt>Monthly:</dt>
              <dd>{inr(order.monthlyTotal, 2)} incl. GST</dd>
              <dt>KYC:</dt>
              <dd>
                <span className="badge good">Verified</span>
              </dd>
            </dl>
            <div className="notice" style={{ marginTop: 14 }}>
              {order.daysLeft === 0 ? (
                <b>All services are live 🎉</b>
              ) : (
                <>
                  Expected live by <b>{order.eta}</b> - {order.daysLeft} day{order.daysLeft === 1 ? "" : "s"} to go.
                </>
              )}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn small" onClick={onAdvance} disabled={busy || order.daysLeft === 0}>
                Demo: next day ▸
              </button>
              <span className="muted">Simulated clock · day {order.demoDay}</span>
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="panel-heading">Router Self-Serve Wi-Fi Setup Hub</h3>
            <div className="router-hub">
              <div className="router-art" aria-hidden="true">
                <RouterArt live={connectivity.status === "active"} />
              </div>
              <div>
                <dl className="info-list">
                  <dt>Status:</dt>
                  <dd>
                    <span className={`badge ${netTone}`}>{connectivity.status === "active" ? "Ready for Config" : netLabel}</span>
                  </dd>
                  <dt>Service:</dt>
                  <dd>{connectivity.name}</dd>
                  <dt>Active on:</dt>
                  <dd>{connectivity.activeOn}</dd>
                </dl>
                <details className="setup-steps">
                  <summary>Self-serve setup guide</summary>
                  <ol>
                    <li>Plug the router into power and the fibre/5G port the technician installed.</li>
                    <li>Wait for the Wi-Fi light to turn solid (about 2 minutes).</li>
                    <li>Join the network printed on the router sticker and change the password.</li>
                    <li>Run a speed test; reply to the WhatsApp update if anything looks wrong.</li>
                  </ol>
                </details>
              </div>
            </div>
          </div>
        </section>

        <section className="stack">
          <h2 className="section-title">Technician Dispatch & Map</h2>
          <div className="glass-panel">
            <h3 className="panel-heading">Technician Dispatch Card</h3>
            <div className="dispatch">
              <div className="tech-card">
                <div className="muted">Field Technician Assigned:</div>
                <div className="tech-name">{scheduled.status === "done" ? "Local Accel Partner" : "Assigning soon"}</div>
                <div className="tech-avatar">
                  <Icon name="user" size={56} strokeWidth={1.4} />
                </div>
                <div className="tech-city">{order.profile.city || "Your city"}</div>
                <div className="eta-strip">{visit}</div>
              </div>
              <div className="map" role="img" aria-label={`Illustrative route map, technician ${Math.round(progress * 100)}% of the way`}>
                <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
                  <defs>
                    <linearGradient id="mapbg" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#3a7bd5" />
                      <stop offset="0.6" stopColor="#6a4bc4" />
                      <stop offset="1" stopColor="#d257c4" />
                    </linearGradient>
                  </defs>
                  <rect width="400" height="300" fill="url(#mapbg)" />
                  {Array.from({ length: 12 }, (_, i) => (
                    <line key={`v${i}`} x1={i * 36 + 10} y1="0" x2={i * 36 - 20} y2="300" stroke="rgba(160,240,255,0.45)" strokeWidth="1.5" />
                  ))}
                  {Array.from({ length: 9 }, (_, i) => (
                    <line key={`h${i}`} x1="0" y1={i * 36 + 8} x2="400" y2={i * 36 + 30} stroke="rgba(160,240,255,0.45)" strokeWidth="1.5" />
                  ))}
                  <path d="M0 260 C120 230 220 120 400 150" stroke="rgba(255,190,120,0.7)" strokeWidth="9" fill="none" />
                  <polyline points={ROUTE.map((p) => p.join(",")).join(" ")} fill="none" stroke="#0b1d4a" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" />
                  <g transform={`translate(${vanX} ${vanY})`}>
                    <rect x="-14" y="-9" width="28" height="18" rx="4" fill="#fff" stroke="#0b1d4a" strokeWidth="1.5" />
                    <rect x="4" y="-6" width="8" height="6" rx="1" fill="#7ec8ff" />
                  </g>
                  <g transform="translate(330 70)">
                    <path d="M0 0 C-12 -16 -12 -30 0 -30 C12 -30 12 -16 0 0z" fill="#0b1d4a" stroke="#fff" strokeWidth="2" />
                    <circle cy="-20" r="4" fill="#fff" />
                  </g>
                </svg>
                <span className="map-tag">Destination</span>
                <span className="map-note">Illustrative route</span>
              </div>
            </div>
          </div>

          <div className="glass-panel">
            <h3 className="panel-heading">Your Services</h3>
            <div className="stack">
              {order.lines.map((l) => {
                const [tone, label] = LINE_STATUS[l.status];
                return (
                  <div key={l.id} className="spread">
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {l.name} ×{l.quantity}
                      </div>
                      <div className="muted">{l.status === "active" ? "Live" : `Expected ${l.activeOn}`}</div>
                    </div>
                    <span className={`badge ${tone}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <div className="glass-panel">
        <h3 className="panel-heading">
          <Icon name="message" size={18} /> Updates sent to you
        </h3>
        <ul className="feed">
          {order.notifications.map((n, i) => (
            <li key={i}>
              <div className="muted">
                {n.date} · {n.channel}
              </div>
              {n.text}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function RouterArt({ live }) {
  return (
    <svg viewBox="0 0 200 150">
      <defs>
        <linearGradient id="rtop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4f63" />
          <stop offset="1" stopColor="#23263a" />
        </linearGradient>
      </defs>
      <line x1="60" y1="70" x2="56" y2="20" stroke="#2a2d40" strokeWidth="5" strokeLinecap="round" />
      <line x1="85" y1="66" x2="84" y2="14" stroke="#2a2d40" strokeWidth="5" strokeLinecap="round" />
      <line x1="140" y1="66" x2="146" y2="22" stroke="#2a2d40" strokeWidth="5" strokeLinecap="round" />
      <path d="M30 90 L100 60 L175 88 L105 120 Z" fill="url(#rtop)" />
      <path d="M30 90 L105 120 L105 132 L30 102 Z" fill="#1a1c2b" />
      <path d="M105 120 L175 88 L175 100 L105 132 Z" fill="#2c2f45" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={120 + i * 11} cy={114 - i * 5} r="2.2" fill={live ? "#57f2a0" : "#6b7088"} />
      ))}
      <g stroke={live ? "#5fd8ff" : "#8a90a8"} strokeWidth="5" fill="none" strokeLinecap="round" opacity={live ? 1 : 0.6}>
        <path d="M86 92 a22 22 0 0 1 34 0" />
        <path d="M78 84 a34 34 0 0 1 50 0" />
        <path d="M150 40 a20 20 0 0 1 26 0" />
        <path d="M143 32 a32 32 0 0 1 40 0" />
      </g>
    </svg>
  );
}
