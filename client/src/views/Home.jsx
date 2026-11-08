import { useEffect, useState } from "react";
import AuthCard from "./AuthCard.jsx";
import { api, inr } from "../api.js";
import Icon, { BrandLogo, CATEGORY_ICON } from "../icons.jsx";

const STEPS = [
  { icon: "chat", title: "Ask Sahayak", text: "Chat in your language. Paste your GSTIN and your business details fill in by themselves." },
  { icon: "tag", title: "See one clear price", text: "A bundle built for your business, with GST shown and add-ons you can switch on or off." },
  { icon: "shield", title: "Finish KYC in minutes", text: "Photograph your documents. They're checked against the GST and Udyam registries instantly." },
  { icon: "truck", title: "Track installation", text: "Sign with an OTP, then follow every step of activation without calling anyone." },
];

export default function Home({ user, onSignedIn, onContinue }) {
  const [categories, setCategories] = useState([]);

  // Real catalogue, grouped by category, for the "What you can get" section.
  useEffect(() => {
    api
      .catalogue()
      .then((list) => {
        const groups = new Map();
        for (const p of list) {
          const g = groups.get(p.category) || { name: p.category, count: 0, from: Infinity, examples: [] };
          g.count++;
          g.from = Math.min(g.from, p.priceMin);
          if (g.examples.length < 3) g.examples.push(p.name);
          groups.set(p.category, g);
        }
        setCategories([...groups.values()]);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="home">
      <header className="home-nav">
        <div className="home-brand">
          <span className="home-logo">
            <BrandLogo />
          </span>
          <span className="home-brand-name">Project Udyam Digital</span>
        </div>
        <nav className="home-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#solutions">Solutions</a>
        </nav>
        {user ? (
          <button className="btn red" onClick={onContinue}>
            Go to dashboard <Icon name="arrow" size={18} />
          </button>
        ) : (
          <a className="btn red" href="#signin">
            Sign in
          </a>
        )}
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="hero-tag">For India's small &amp; medium businesses</span>
          <h1>
            Take your business digital <span>in one sitting.</span>
          </h1>
          <p>
            Broadband, business mobile, cloud billing, CCTV and more, chosen for you by an AI advisor, priced on one bill, with KYC done from
            your phone.
          </p>
          <ul className="hero-points">
            <li>
              <Icon name="check" size={18} strokeWidth={2.6} /> Chat in English, Hindi and more
            </li>
            <li>
              <Icon name="check" size={18} strokeWidth={2.6} /> One transparent monthly price
            </li>
            <li>
              <Icon name="check" size={18} strokeWidth={2.6} /> DPDP Act 2023 consent built in
            </li>
          </ul>
        </div>
        <div id="signin">
          {user ? (
            <div className="signin-card">
              <h2>Welcome back</h2>
              <p className="signin-sub">
                Signed in as <b>{user.businessName}</b> ({user.email})
              </p>
              <button className="btn red block big" onClick={onContinue}>
                Continue to Sahayak <Icon name="arrow" size={18} />
              </button>
            </div>
          ) : (
            <AuthCard onSignedIn={onSignedIn} />
          )}
        </div>
      </section>

      <section id="how" className="home-section">
        <h2 className="home-h2">How it works</h2>
        <div className="how-grid">
          {STEPS.map((s, i) => (
            <div key={s.title} className="how-card">
              <span className="how-num">{i + 1}</span>
              <span className="how-icon">
                <Icon name={s.icon} size={26} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {categories.length > 0 && (
        <section id="solutions" className="home-section">
          <h2 className="home-h2">What you can get</h2>
          <div className="sol-grid">
            {categories.map((c) => (
              <div key={c.name} className="sol-card">
                <span className="sol-icon">
                  <Icon name={CATEGORY_ICON[c.name] || "box"} size={24} />
                </span>
                <h3>{c.name}</h3>
                <p>{c.examples.join(" · ")}</p>
                <div className="sol-foot">
                  <span>
                    {c.count} product{c.count === 1 ? "" : "s"}
                  </span>
                  <b>from {inr(c.from)}/mo</b>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="home-footer">
        Prototype for YTL Hackathon 2026 · Track A. All businesses, people and identifiers in the demo data are fictional.
      </footer>
    </div>
  );
}
