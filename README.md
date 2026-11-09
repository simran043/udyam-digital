# Udyam Digital

**Making small businesses go digital in one sitting.** A working prototype for YTL Hackathon 2026, Track A (Project Udyam Digital).

**Live demo:** https://udyam-digital-gox8.onrender.com/

> Hosted on Render's free plan: the first visit after a quiet period can take about a minute while the server wakes up, and accounts are stored in MongoDB Atlas so they survive restarts.

A small business owner chats with **Sahayak**, an advisor that speaks their language. In about 2 minutes they get a bundle with one clear monthly price, finish KYC by photographing documents, sign with an OTP and track installation without calling anyone. A partner console shows sales and channel partners which leads to call next and why.

> Accel Telecom, Accel Business and every business, person and identifier in this repo are fictional (synthetic hackathon data).

## What's built

| Case requirement | What the prototype does |
|---|---|
| **Advisor** (GenAI) | Chat advisor in 10 Indian languages via Claude, or a guided English/Hindi mode with tap-to-answer chips that needs no API key. Asks about type, city, size, sites, GSTIN and needs. **Paste a GSTIN and it fills in the business from the GST registry.** A deterministic rules engine builds the bundle, so every product respects the catalogue rules (city tier, size, GSTIN, dependencies). Each item has a plain-language reason plus "X% of similar businesses chose this", learned from the 368 activated customers. |
| **Quote & checkout** | One transparent monthly price. Add-ons toggle on/off, quantities and 12- vs 24-month terms re-price live on the server, with CGST + SGST, one-time setup, first bill, days to activate and a comparison with today's telecom spend. |
| **Smart KYC** | A DPDP consent notice comes **before** any upload. Local OCR (tesseract.js) reads the GST certificate, Udyam certificate, signatory ID and utility bill, then 15 checks run against mock GSTIN and Udyam registries: checksum, status, tampering, Udyam number, signatory authority, bill age, address match, name consistency and blur. A mock Aadhaar e-sign OTP finishes it. |
| **Tracker** | Order timeline built from each product's `typical_install_days`, per-service status, ETA and a feed of proactive WhatsApp/SMS updates, so the owner doesn't call support. A demo clock moves time forward. |
| **Stretch: back office** | Funnel, drop reasons (with which ones the journey fixes), segment and channel economics, **propensity model** (logistic regression, AUC 0.716 on held-out leads, top 20% activate at 2.1× the base rate), a win-back call list with channel routing, and live advisor sessions that didn't close, including callback requests. |

### Smart KYC on the 12 specimen applicants

Run with the real OCR pipeline (`npm run kyc:specimens`):

| Applicant | Result | Why |
|---|---|---|
| K01 | Manual review | GSTIN is **Cancelled** in the registry; Udyam number missing on the certificate |
| K02, K04 | Action needed | GST certificate too blurred to read: asks for a retake |
| K03, K08, K09, K12 | Verified | (K08/K09: proprietor's ID shows "Office admin", so a warning only) |
| K05 | Action needed | "Owner" can't sign for an LLP; Udyam certificate missing but **found in the registry automatically** |
| K06 | Action needed | GSTIN fails the checksum; the registry has a near match for the same business |
| K07 | Manual review | Certificate's legal name differs from the registry: **altered document** |
| K10 | Action needed | GSTIN checksum fails (one-letter typo) and "Owner" can't sign for an LLP |
| K11 | Action needed | Utility bill is 257 days old (limit 90); "Owner" can't sign for a Pvt Ltd |

These come from my own reading of the documents and registries. I haven't checked them against the judges' answer key, which I don't have.

## Run it

Requires Node.js 20+.

```bash
npm install
npm run dev          # API on :8787 + web app on http://localhost:5173
```

Production-style: `npm run build && npm start`, then open http://localhost:8787.

**Email OTP sign-in (required to get past the homepage):** copy `.env.example` to `.env` and set `SMTP_USER` (the Gmail sender) and `SMTP_PASS` (a Gmail **App Password**: Google Account → Security → 2-Step Verification → App passwords). The server loads `.env` on start. First-time users **register** (business name, email, password, retype password, then a code emailed to confirm the address); returning users **sign in** with email + password, then an emailed code. Passwords are stored as salted scrypt hashes in `.data/users.json` (git-ignored; set `USERS_FILE` to move it). Codes expire after 5 minutes, allow 5 attempts and can be re-sent after 30 seconds; 5 wrong passwords lock that email for 15 minutes. Once signed in, the e-sign OTP at checkout is emailed too.

**Hosting on Render (free plan):** Render blocks outbound mail ports on free services, so Gmail SMTP times out there. Set `BREVO_API_KEY` and `MAIL_FROM` (a sender verified in Brevo) instead; the server then sends codes over HTTPS and ignores the SMTP settings. Render's disk is also wiped on every restart, so set `MONGODB_URI` (a free MongoDB Atlas cluster) to keep accounts, and `SESSION_SECRET` (any long random string) so people stay signed in across restarts.

**Turn on the Claude advisor (optional):** set `ANTHROPIC_API_KEY` before starting (see `.env.example`). Without it the app runs in guided mode (English + Hindi). Set `ADVISOR_MODE=rules` to force guided mode.

The first KYC upload downloads the English OCR language data (about 10 MB) once, so that step needs internet access.

### Demo path (about 3 minutes)

1. **Advisor:** tap *Kirana store* or type "I run an electronics shop in Visakhapatnam with 6 staff", answer *1*, paste GSTIN `37NBLXS1145E1ZU`, pick needs, *Done*.
2. **Quote:** switch an add-on on, flip to 24 months and watch the price update.
3. **Smart KYC:** accept the notice, choose specimen **K12** (verified) and click *Verify*. Then try **K07** (altered certificate) or **K11** (old bill).
4. **Sign** with the on-screen demo OTP, then use **Track order** → *Demo: next day*.
5. **Partner console:** funnel, fixable drop reasons, model, win-back list and your own chat in *Advisor sessions*.

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for a timed script.

## Checks

```bash
npm test                 # 26 unit tests: validators, rules engine, KYC rules, advisor flow
npm run kyc:specimens    # full OCR + KYC run over all 12 specimen applicants
node scripts/e2e.mjs     # API smoke test of the whole journey (server must be running)
```

## Project layout

```
server/           Node.js API (no framework)
  index.js        routes, static hosting, consent and KYC store
  advisor.js      Sahayak: Claude engine + guided rules engine
  catalogue.js    eligibility, recommendation, pricing (learns attach rates from leads)
  kyc.js          registry lookups, OCR field extraction, 15 KYC checks
  ocr.js          tesseract.js (in memory; images are never written to disk)
  orders.js       orders, timeline, proactive notifications
  analytics.js    funnel, drop reasons, channel economics, propensity model
  validators.js   GSTIN checksum, OCR repair, masking, dates
client/           React (Vite) front end
data/             synthetic dataset from the organisers
docs/             architecture, privacy note, business case, demo script
scripts/          OCR/KYC batch runs and the API smoke test
```

## Limitations

- **The Claude advisor path has not been run against the live API.** No API key was available while this was built. It uses the documented SDK calls (structured outputs, `claude-opus-5-5`, server-side refusal fallback), and any error drops the chat back to guided mode, so the demo can't break. Test it with a key before demo day.
- Guided mode supports English and Hindi only. The other 8 languages need the Claude path.
- Sessions, KYC records and orders live in memory and are cleared on restart. A production build needs a database with encryption at rest.
- E-sign, SMS/WhatsApp messages and the GST/Udyam APIs are simulated. Registry lookups use the provided CSVs.
- Pricing rule (my assumption, documented in `catalogue.js`): a 24-month contract gets the catalogue's minimum price, 12 months the midpoint ending in 9.
- The propensity model is modest (AUC 0.716). Use it to rank who to call first, not to decide who gets service.
