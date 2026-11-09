import { useEffect, useState } from "react";
import { api, store, setAuthToken } from "./api.js";
import Icon, { BrandLogo } from "./icons.jsx";
import Home from "./views/Home.jsx";
import Advisor from "./views/Advisor.jsx";
import Quote from "./views/Quote.jsx";
import Kyc from "./views/Kyc.jsx";
import Tracker from "./views/Tracker.jsx";
import BackOffice from "./views/BackOffice.jsx";

const NAV = [
  { key: "home", label: "Home", icon: "home" },
  { key: "advisor", label: "Sahayak Chat", icon: "chat" },
  { key: "quote", label: "My Quote", icon: "tag" },
  { key: "kyc", label: "Smart KYC", icon: "shield" },
  { key: "track", label: "Track Order", icon: "truck" },
  { key: "backoffice", label: "Partner Console", icon: "chart" },
];

export default function App() {
  // Signed-in visitors land back on the dashboard after a refresh.
  const [view, setView] = useState(() => (store.get("udyam.token") ? "advisor" : "home"));
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  const [health, setHealth] = useState(null);
  const [session, setSession] = useState(null);
  const [quote, setQuote] = useState(null);
  const [orderId, setOrderId] = useState(() => store.get("udyam.orderId"));

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ ok: false }));
    // Restore a previous sign-in if the server still knows the token.
    const token = store.get("udyam.token");
    if (!token) return setUser(null);
    setAuthToken(token);
    api
      .me()
      .then((r) => setUser(r.user))
      .catch(() => {
        setAuthToken(null);
        store.set("udyam.token", null);
        setUser(null);
      });
  }, []);

  const onSignedIn = ({ token, user: account }) => {
    setAuthToken(token);
    store.set("udyam.token", token);
    setUser(account);
    setView("advisor");
  };

  const signOut = async () => {
    await api.logout().catch(() => {});
    setAuthToken(null);
    store.set("udyam.token", null);
    setUser(null);
    setView("home");
  };

  const hasBundle = Boolean(session?.recommendation);
  const enabled = {
    home: true,
    advisor: true,
    quote: hasBundle,
    kyc: hasBundle && Boolean(quote),
    track: true,
    backoffice: true,
  };
  const done = { advisor: hasBundle, quote: Boolean(quote), kyc: Boolean(orderId && session?.orderPlaced) };
  const businessName = session?.profile?.businessName || user?.businessName || "Your business";

  const onOrderPlaced = (order) => {
    setOrderId(order.id);
    store.set("udyam.orderId", order.id);
    setSession((s) => ({ ...s, orderPlaced: true }));
    setView("track");
  };

  if (user === undefined) return <div className="app theme-home" />;
  if (!user || view === "home") {
    return <Home user={user} onSignedIn={onSignedIn} onContinue={() => setView("advisor")} />;
  }

  return (
    <div className={`app theme-${view}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <div className="side-brand">
          <BrandLogo />
        </div>
        <nav className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`side-item ${view === n.key ? "active" : ""}`}
              disabled={!enabled[n.key]}
              onClick={() => setView(n.key)}
              aria-current={view === n.key ? "page" : undefined}
              title={enabled[n.key] ? n.label : `${n.label} (finish the earlier step first)`}
            >
              <span className="side-icon">
                <Icon name={n.icon} size={22} />
                {done[n.key] && <i className="side-done" aria-label="done" />}
              </span>
              <span className="side-label">{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="shell">
        <header className="topbar">
          <h1 className="app-title">Project Udyam Digital</h1>
          <div className="top-actions">
            <button
              className="icon-btn"
              onClick={() => setView("track")}
              aria-label={orderId ? "Order updates" : "Track an order"}
              title={orderId ? "Order updates" : "Track an order"}
            >
              <Icon name="bell" size={22} />
              {orderId && <i className="dot" />}
            </button>
            <div className="account">
              <span className="avatar">
                <Icon name="user" size={20} />
              </span>
              <span className="account-name">
                {businessName}
                <small>{user.email}</small>
              </span>
            </div>
            <button className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
              <Icon name="logout" size={22} />
            </button>
          </div>
        </header>

        <main className="main">
          {health && !health.ok && (
            <div className="error">
              Can't reach the Udyam Digital server. Start it with <code>npm run dev</code>.
            </div>
          )}
          {/* Advisor stays mounted so the chat survives tab switches. */}
          <div hidden={view !== "advisor"}>
            <Advisor
              health={health}
              session={session}
              setSession={setSession}
              onSeeQuote={() => setView("quote")}
              onReset={() => setQuote(null)}
            />
          </div>
          {view === "quote" && hasBundle && (
            <Quote session={session} quote={quote} setQuote={setQuote} onContinue={() => setView("kyc")} />
          )}
          {view === "kyc" && hasBundle && quote && (
            <Kyc session={session} quote={quote} onOrderPlaced={onOrderPlaced} onBack={() => setView("quote")} />
          )}
          {view === "track" && <Tracker initialId={orderId} />}
          {view === "backoffice" && <BackOffice />}
        </main>
        <footer className="footer">
          Prototype for YTL Hackathon 2026 · Track A. Accel Telecom and all businesses, people and identifiers are fictional. "Today" is
          fixed at {health?.today || "2026-07-15"} for date checks.
        </footer>
      </div>
    </div>
  );
}
