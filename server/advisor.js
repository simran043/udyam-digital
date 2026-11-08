// "Sahayak" - the conversational advisor.
//
// Two engines share one session format:
//  * Claude (when ANTHROPIC_API_KEY or another SDK credential is configured):
//    free-form chat in any Indian language; Claude extracts the business
//    profile and writes the explanation.
//  * Rule-based fallback: guided questions with quick replies in English and
//    Hindi, so the journey also works offline and in demos without a key.
// In both cases the bundle itself comes from the deterministic rules engine.
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { recommendBundle, resolveCity, NEED_LABELS, catalogueSummary } from "./catalogue.js";
import { businessTypes, cities } from "./data.js";
import { lookupGstin } from "./kyc.js";
import { maskGstin } from "./validators.js";

const MODEL = process.env.ADVISOR_MODEL || "claude-opus-5-5";
const NEED_KEYS = Object.keys(NEED_LABELS);
export const LANGUAGES = ["English", "Hindi", "Marathi", "Tamil", "Telugu", "Kannada", "Gujarati", "Bengali", "Punjabi", "Malayalam"];

let client = null;
const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) && process.env.ADVISOR_MODE !== "rules";
if (aiConfigured) client = new Anthropic();
export const advisorMode = () => (client ? "claude" : "rules");

export const sessions = new Map();

const inr = (n) => Math.round(n).toLocaleString("en-IN");

// ---------- strings for the rule-based engine ----------
const T = {
  English: {
    greet: "Namaste! I'm Sahayak, your Accel Business advisor. In 2 minutes I'll suggest the right internet, mobile and digital tools for your business, with one clear monthly price.\n\nWhat kind of business do you run?",
    askCity: "Which city is your business in?",
    askEmployees: "How many people work in your business (including you)?",
    askSites: "How many shops, branches or locations do you have?",
    askGstin: "Do you have a GSTIN? You can type it and I'll fill in your details automatically - or just say no.",
    askNeeds: "What do you need help with? Pick all that apply, then tap Done.",
    askInternet: "What internet do you use today, and roughly how much do you spend on phone + internet each month?",
    gstinFound: (r) => `Found it: ${r.tradeName}, ${r.city || r.state} (${r.constitution}). GST status: ${r.status}.`,
    gstinCancelled: "Note: this GSTIN is not active, so I'll leave out products that need a GSTIN.",
    gstinBad: (e) => `That GSTIN doesn't look right (${e}). Please check it, or say "no GSTIN".`,
    unknownCity: (c) => `I don't have ${c} on my list yet - I'll assume it's a tier-2 city.`,
    didntGet: "Sorry, I didn't catch that.",
    done: "Done",
    noGstin: "No GSTIN",
    recommendIntro: (n, total) => `Here's what I recommend - ${n} services on one bill for about ₹${total}/month (incl. GST).`,
    tip: "You can switch add-ons on or off on the right and the price updates instantly.",
    savings: (spend, diff) => diff > 0 ? `That's ₹${inr(diff)} more than your current ₹${inr(spend)}, but covers much more than connectivity - on one bill with one support number.` : `That's ₹${inr(-diff)} less than your current spend of ₹${inr(spend)}.`,
    selected: (list) => `Selected: ${list}. Pick more, or tap Done.`,
    skip: "Skip",
  },
  Hindi: {
    greet: "नमस्ते! मैं सहायक हूँ, आपका Accel Business सलाहकार। 2 मिनट में मैं आपके बिज़नेस के लिए सही इंटरनेट, मोबाइल और डिजिटल टूल्स सुझाऊँगा - एक साफ़ मासिक कीमत के साथ।\n\nआपका बिज़नेस किस तरह का है?",
    askCity: "आपका बिज़नेस किस शहर में है?",
    askEmployees: "आपके बिज़नेस में कुल कितने लोग काम करते हैं (आप समेत)?",
    askSites: "आपकी कितनी दुकानें, ब्रांच या लोकेशन हैं?",
    askGstin: "क्या आपके पास GSTIN है? नंबर लिखें, मैं आपकी जानकारी अपने-आप भर दूँगा - या 'नहीं' कहें।",
    askNeeds: "आपको किस चीज़ में मदद चाहिए? जितने चाहें चुनें, फिर 'हो गया' दबाएँ।",
    askInternet: "आज आप कौन-सा इंटरनेट इस्तेमाल करते हैं, और फ़ोन + इंटरनेट पर हर महीने लगभग कितना खर्च होता है?",
    gstinFound: (r) => `मिल गया: ${r.tradeName}, ${r.city || r.state} (${r.constitution})। GST स्थिति: ${r.status}।`,
    gstinCancelled: "ध्यान दें: यह GSTIN सक्रिय नहीं है, इसलिए GSTIN वाले प्रोडक्ट शामिल नहीं होंगे।",
    gstinBad: (e) => `यह GSTIN सही नहीं लग रहा (${e})। कृपया जाँचें, या 'GSTIN नहीं है' लिखें।`,
    unknownCity: (c) => `${c} अभी मेरी सूची में नहीं है - मैं इसे टियर-2 शहर मान रहा हूँ।`,
    didntGet: "माफ़ कीजिए, मैं समझ नहीं पाया।",
    done: "हो गया",
    noGstin: "GSTIN नहीं है",
    recommendIntro: (n, total) => `मेरी सलाह - ${n} सेवाएँ, एक ही बिल पर, लगभग ₹${total}/महीना (GST सहित)।`,
    tip: "दाईं ओर ऐड-ऑन चालू/बंद करें - कीमत तुरंत बदल जाएगी।",
    savings: (spend, diff) => diff > 0 ? `यह आपके मौजूदा ₹${inr(spend)} से ₹${inr(diff)} ज़्यादा है, पर इसमें सिर्फ़ इंटरनेट से कहीं ज़्यादा है - एक बिल, एक सपोर्ट नंबर।` : `यह आपके मौजूदा ₹${inr(spend)} खर्च से ₹${inr(-diff)} कम है।`,
    selected: (list) => `चुना गया: ${list}। और चुनें, या 'हो गया' दबाएँ।`,
    skip: "छोड़ें",
  },
};
const strings = (language) => T[language] || T.English;

const NEED_LABELS_HI = {
  payments: "UPI / कार्ड बिलिंग", whatsapp: "ग्राहकों से WhatsApp", sms: "SMS अलर्ट", website: "वेबसाइट",
  cctv: "CCTV कैमरा", guest_wifi: "ग्राहकों के लिए Wi-Fi", email: "बिज़नेस ईमेल", backup: "डेटा बैकअप",
  security: "वायरस से सुरक्षा", firewall: "फ़ायरवॉल", failover: "इंटरनेट कभी बंद न हो", multisite: "सभी ब्रांच एक जगह से",
  telephony: "ऑफ़िस फ़ोन / IVR", tollfree: "टोल-फ़्री नंबर", machines: "मशीन मॉनिटरिंग", fleet: "गाड़ी ट्रैकिंग",
  static_ip: "स्टैटिक IP", dedicated_line: "डेडिकेटेड इंटरनेट",
};
const needLabel = (key, language) => (language === "Hindi" ? NEED_LABELS_HI[key] : NEED_LABELS[key]) || key;

const NEED_CHIPS_BY_SEGMENT = {
  "Micro retail & services": ["payments", "whatsapp", "cctv", "guest_wifi", "website", "sms"],
  "Professional offices": ["email", "backup", "security", "telephony", "whatsapp", "failover"],
  "Small multi-site businesses": ["multisite", "failover", "cctv", "payments", "tollfree", "guest_wifi"],
  "Small manufacturers": ["dedicated_line", "machines", "firewall", "cctv", "email", "fleet"],
};

const NEED_KEYWORDS = [
  [/upi|payment|billing|pos|card|बिल|पेमेंट|भुगतान/i, "payments"],
  [/whats\s*app|व्हाट्सएप/i, "whatsapp"],
  [/\bsms\b|message/i, "sms"],
  [/website|web site|google|वेबसाइट/i, "website"],
  [/cctv|camera|कैमरा|surveillance/i, "cctv"],
  [/wi-?fi|guest|वाईफाई/i, "guest_wifi"],
  [/e-?mail|ईमेल|office suite|documents/i, "email"],
  [/backup|बैकअप/i, "backup"],
  [/virus|ransom|antivirus|security|सुरक्षा/i, "security"],
  [/firewall|फ़ायरवॉल/i, "firewall"],
  [/fail\s*over|never go(es)? down|backup internet|downtime/i, "failover"],
  [/branches|central|sd-?wan|all (my )?(shops|stores|sites)/i, "multisite"],
  [/ivr|phone line|telephony|call recording/i, "telephony"],
  [/toll[- ]?free|1800/i, "tollfree"],
  [/machine|sensor|iot|मशीन/i, "machines"],
  [/fleet|vehicle|gps|truck|गाड़ी/i, "fleet"],
  [/static ip|remote access/i, "static_ip"],
  [/leased line|dedicated/i, "dedicated_line"],
];

const BUSINESS_KEYWORDS = [
  [/kirana|grocery|general store|किराना/i, "Kirana store"],
  [/salon|parlour|parlor|सैलून/i, "Salon"],
  [/pharmacy|chemist|medical store|दवा/i, "Pharmacy"],
  [/bakery|bakers|बेकरी/i, "Bakery"],
  [/sweet|mithai|मिठाई/i, "Sweet shop"],
  [/hardware/i, "Hardware store"],
  [/boutique|clothes|garment|कपड़/i, "Boutique"],
  [/mobile repair|phone repair/i, "Mobile repair shop"],
  [/stationery/i, "Stationery shop"],
  [/optician|optical|चश्म/i, "Optician"],
  [/dental|dentist/i, "Dental clinic"],
  [/physio/i, "Physiotherapy clinic"],
  [/clinic|doctor|क्लिनिक/i, "Dental clinic"],
  [/\bca\b|chartered|accountant/i, "CA firm"],
  [/coaching|tuition|classes|कोचिंग/i, "Coaching centre"],
  [/law|lawyer|advocate|legal|वकील/i, "Law office"],
  [/diagnostic|pathology|\blab\b/i, "Diagnostic lab"],
  [/travel/i, "Travel agency"],
  [/insurance|बीमा/i, "Insurance agency"],
  [/real estate|property|realty/i, "Real estate agency"],
  [/architect/i, "Architecture studio"],
  [/restaurant|cafe|dhaba|रेस्टोरेंट/i, "Restaurant chain"],
  [/hotel|lodge|guest ?house/i, "Budget hotel group"],
  [/gym|fitness/i, "Gym chain"],
  [/pre-?school|play ?school/i, "Pre-school chain"],
  [/factory|unit|manufactur|workshop|कारखाना|फ़ैक्टरी/i, "Packaging unit"],
];

function matchBusinessType(text) {
  const lower = text.toLowerCase();
  const exact = [...businessTypes.keys()].find((t) => lower.includes(t.toLowerCase()));
  if (exact) return exact;
  const kw = BUSINESS_KEYWORDS.find(([re]) => re.test(text));
  return kw ? kw[1] : null;
}

function matchCity(text) {
  const lower = text.toLowerCase();
  const aliases = { bangalore: "Bengaluru", bombay: "Mumbai", madras: "Chennai", calcutta: "Kolkata", "new delhi": "Delhi", vizag: "Visakhapatnam" };
  for (const [alias, city] of Object.entries(aliases)) if (lower.includes(alias) && cities.has(city)) return city;
  return [...cities.keys()].find((c) => lower.includes(c.toLowerCase())) || null;
}

const firstNumber = (text) => {
  const m = text.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const GSTIN_IN_TEXT = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/i;

// ---------- session ----------
export function createSession(language = "English") {
  const lang = LANGUAGES.includes(language) ? language : "English";
  const session = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    language: lang,
    mode: advisorMode(),
    profile: { needs: [] },
    step: "businessType",
    messages: [],
    history: [], // Claude conversation (redacted text only)
    recommendation: null,
    outcome: "in_progress",
  };
  const s = strings(lang);
  // Claude mode greets in any language; rules mode greets in EN/HI.
  const greet = lang === "English" || lang === "Hindi" || !client ? s.greet : null;
  session.messages.push({ role: "assistant", text: greet || T.English.greet });
  session.quickReplies = quickRepliesFor(session);
  sessions.set(session.id, session);
  return session;
}

export function publicSession(session) {
  return {
    id: session.id,
    language: session.language,
    mode: session.mode,
    messages: session.messages,
    quickReplies: session.quickReplies || [],
    profile: session.profile,
    recommendation: session.recommendation,
    step: session.step,
  };
}

function quickRepliesFor(session) {
  const s = strings(session.language);
  const hi = session.language === "Hindi";
  switch (session.step) {
    case "businessType":
      return hi
        ? ["किराना स्टोर", "क्लिनिक", "कोचिंग सेंटर", "रेस्टोरेंट (कई ब्रांच)", "छोटी फ़ैक्टरी"]
        : ["Kirana store", "Dental clinic", "CA firm", "Restaurant chain", "Auto-parts unit"];
    case "city":
      return ["Mumbai", "Delhi", "Bengaluru", "Pune", "Jaipur", "Lucknow"];
    case "employees":
      return ["1-2", "3-5", "6-10", "11-25", "26-50"];
    case "sites":
      return ["1", "2", "3-5", "6-10"];
    case "gstin":
      return [s.noGstin];
    case "needs": {
      const keys = NEED_CHIPS_BY_SEGMENT[session.profile.segment || "Micro retail & services"];
      return [...keys.map((k) => (session.profile.needs.includes(k) ? "✓ " : "") + needLabel(k, session.language)), s.done];
    }
    case "internet":
      return hi
        ? ["मोबाइल हॉटस्पॉट, ₹1,000", "घर का ब्रॉडबैंड, ₹1,500", "बिज़नेस ब्रॉडबैंड, ₹3,000", s.skip]
        : ["Mobile hotspot, ₹1,000", "Home broadband, ₹1,500", "Business broadband, ₹3,000", s.skip];
    default:
      return [];
  }
}

const rangeMid = (text) => {
  const m = text.match(/(\d+)\s*-\s*(\d+)/);
  return m ? Math.round((Number(m[1]) + Number(m[2])) / 2) : firstNumber(text);
};

// Applies anything recognisable in the text to the profile, regardless of
// which question is being asked (people often answer several at once).
function absorb(session, text) {
  const p = session.profile;
  const notes = [];
  const s = strings(session.language);

  const gstinMatch = text.match(GSTIN_IN_TEXT);
  if (gstinMatch) {
    const r = lookupGstin(gstinMatch[0].toUpperCase());
    if (r.found) {
      p.gstin = r.gstin;
      p.hasGstin = r.status === "Active";
      p.businessName = r.tradeName;
      if (!p.city && r.city && cities.has(r.city)) p.city = r.city;
      p.state = r.state;
      notes.push(s.gstinFound(r));
      if (r.status !== "Active") notes.push(s.gstinCancelled);
    } else {
      notes.push(s.gstinBad(r.error));
    }
  }

  if (!p.businessType) {
    const type = matchBusinessType(text);
    if (type) {
      p.businessType = type;
      p.segment = businessTypes.get(type);
    }
  }
  if (!p.city) {
    const city = matchCity(text);
    if (city) p.city = city;
  }
  if (p.employees == null) {
    const m = text.match(/(\d+)\s*(people|staff|employees|log|लोग|कर्मचारी|workers)/i);
    if (m) p.employees = Number(m[1]);
  }
  if (p.sites == null) {
    const m = text.match(/(\d+)\s*(shops|branches|outlets|stores|sites|locations|ब्रांच|दुकान)/i);
    if (m) p.sites = Number(m[1]);
  }
  for (const [re, key] of NEED_KEYWORDS) if (re.test(text) && !p.needs.includes(key)) p.needs.push(key);
  return notes;
}

function nextStep(p) {
  if (!p.businessType) return "businessType";
  if (!p.city) return "city";
  if (p.employees == null) return "employees";
  if (p.sites == null) return "sites";
  if (p.hasGstin == null) return "gstin";
  if (!p.needsConfirmed) return "needs";
  if (!p.internetAsked) return "internet";
  return "recommend";
}

function questionFor(step, s) {
  return { city: s.askCity, employees: s.askEmployees, sites: s.askSites, gstin: s.askGstin, needs: s.askNeeds, internet: s.askInternet }[step];
}

function handleRules(session, text) {
  const s = strings(session.language);
  const p = session.profile;
  const trimmed = text.trim();
  const prevStep = session.step;
  // Tapped need chips are handled as toggles below, not as free text.
  const needChip = Object.keys(NEED_LABELS).find((k) => trimmed.replace(/^✓\s*/, "") === needLabel(k, session.language));
  const isDone = trimmed === s.done || /^done$/i.test(trimmed);
  const replies = prevStep === "needs" && (needChip || isDone) ? [] : absorb(session, text);
  const isSkip = trimmed === s.skip || /^skip$/i.test(trimmed);

  switch (session.step) {
    case "businessType":
      if (!p.businessType && trimmed.length > 1) {
        // Unknown type: keep the owner's own words (minus city / size details) and infer the segment.
        const words = trimmed.split(/\b(?:in|at|with|from|having)\b|[,.\d]|\bमें\b/i)[0].replace(/^(i|we)\s+(run|own|have)\s+((an|a)\s+)?/i, "").trim();
        p.businessType = (words || trimmed).slice(0, 40);
      }
      break;
    case "city":
      if (!p.city && trimmed) {
        const name = trimmed.replace(/[^\p{L} ]/gu, "").trim();
        if (name) {
          p.city = name.replace(/\b\w/g, (c) => c.toUpperCase());
          p.cityTier = 2;
          replies.push(s.unknownCity(p.city));
        }
      }
      break;
    case "employees":
      if (p.employees == null) {
        const n = rangeMid(trimmed);
        if (n) p.employees = n;
      }
      break;
    case "sites":
      if (p.sites == null) {
        const n = rangeMid(trimmed);
        if (n) p.sites = n;
      }
      break;
    case "gstin":
      if (p.hasGstin == null && (trimmed === s.noGstin || /\b(no|nahi|nahin)\b|नहीं/i.test(trimmed))) p.hasGstin = false;
      else if (p.hasGstin == null && /\b(yes|haan|ha)\b|हाँ/i.test(trimmed)) replies.push(s.askGstin);
      break;
    case "needs":
      if (isDone) {
        p.needsConfirmed = true;
      } else if (needChip) {
        p.needs = p.needs.includes(needChip) ? p.needs.filter((n) => n !== needChip) : [...p.needs, needChip];
      }
      if (!p.needsConfirmed && p.needs.length) {
        replies.push(s.selected(p.needs.map((k) => needLabel(k, session.language)).join(", ")));
      }
      break;
    case "internet":
      p.internetAsked = true;
      if (!isSkip) {
        p.currentInternet = trimmed.split(",")[0].slice(0, 40);
        const spend = firstNumber(trimmed);
        if (spend) p.currentSpend = spend;
        if (/hotspot|हॉटस्पॉट|none|no internet/i.test(trimmed)) p.fibreAvailable = undefined;
      }
      break;
    default:
      break;
  }

  const step = nextStep(p);
  if (step === prevStep && step !== "needs" && replies.length === 0) replies.push(s.didntGet);
  session.step = step;

  if (step === "recommend") return finishWithRecommendation(session, replies);
  // Segment decides which need chips to offer.
  if (step === "needs" && !p.segment) p.segment = recommendBundle(p).profile.segment;
  // While toggling needs, the "Selected: ..." line is the reply.
  if (!(step === "needs" && prevStep === "needs" && replies.length)) replies.push(questionFor(step, s));
  return replies.filter(Boolean).join("\n\n");
}

function finishWithRecommendation(session, prefix = []) {
  const s = strings(session.language);
  const rec = recommendBundle({ ...session.profile, language: session.language });
  session.recommendation = rec;
  session.profile = { ...session.profile, segment: rec.profile.segment, cityTier: rec.profile.cityTier };
  session.outcome = "recommended";
  const total = Math.round(rec.quote.monthlyTotal).toLocaleString("en-IN");
  const lines = [s.recommendIntro(rec.items.filter((i) => i.included).length, total)];
  for (const item of rec.items.filter((i) => i.included)) lines.push(`• ${item.name} ×${item.quantity} - ${item.reason}`);
  if (session.profile.currentSpend) {
    lines.push(s.savings(session.profile.currentSpend, rec.quote.monthlyTotal - session.profile.currentSpend));
  }
  for (const tip of rec.tips) lines.push(`💡 ${tip}`);
  lines.push(s.tip);
  return [...prefix, lines.join("\n")].join("\n\n");
}

// ---------- Claude engine ----------
const ProfileUpdate = z.object({
  business_type: z.string().nullable().describe("Owner's business type in English, e.g. 'Kirana store', 'Dental clinic'"),
  business_name: z.string().nullable(),
  city: z.string().nullable().describe("City name in English"),
  employees: z.number().int().nullable(),
  sites: z.number().int().nullable(),
  has_gstin: z.boolean().nullable(),
  current_internet: z.string().nullable(),
  monthly_spend_inr: z.number().nullable(),
  fibre_available: z.boolean().nullable().describe("false only if the owner says fibre is not available at the premises"),
  needs: z.array(z.enum(NEED_KEYS)).describe("All needs mentioned so far"),
});

const AdvisorTurn = z.object({
  reply: z.string().describe("Your next message to the owner, in their language"),
  quick_replies: z.array(z.string()).describe("2-6 short tappable answers to your question, in their language"),
  profile: ProfileUpdate,
  ready_to_recommend: z.boolean().describe("true once type, city, employees, sites, GSTIN status and needs are known"),
});

const Explanation = z.object({
  message: z.string().describe("Plain-language recommendation message in the owner's language"),
});

function systemPrompt(language) {
  const needs = Object.entries(NEED_LABELS).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `You are Sahayak, the digital advisor for Accel Business (the B2B arm of Accel Telecom, India). You talk to small business owners - kirana stores, clinics, CA firms, coaching centres, restaurants, small factories - on their phone.

Goal: in as few turns as possible, learn the business profile so our rules engine can recommend a bundle. You need: business type, city, number of employees (including the owner), number of sites/branches, whether they have an active GSTIN, and what they need. Current internet and monthly telecom spend are useful but optional.

Style:
- Reply in ${language}, in simple everyday words (it is fine to mix in common English terms like "WiFi", "UPI", "GST"). The owner is busy and may not be technical.
- Ask one or two short questions per turn. Never ask for something already given.
- Never quote prices, product names or promises yourself - the system adds the bundle and price.
- If the owner mentions a GSTIN you will see "[GSTIN provided]"; the system verifies it separately, so treat has_gstin as true.
- Do not ask for personal identifiers (Aadhaar, PAN, phone numbers).

Map needs only to these keys:
${needs}

Return the full profile known so far on every turn (null for unknown).`;
}

const redact = (text) =>
  text
    .replace(GSTIN_IN_TEXT, "[GSTIN provided]")
    .replace(/\b[6-9]\d{9}\b/g, "[phone removed]")
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[number removed]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]");

async function callClaude({ system, messages, format, maxTokens = 2000 }) {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    messages,
    output_config: { effort: "low", format: betaZodOutputFormat(format) },
  });
  if (response.stop_reason === "refusal") throw new Error("Advisor model declined the request");
  if (!response.parsed_output) throw new Error(`Advisor returned no structured output (stop_reason ${response.stop_reason})`);
  return response.parsed_output;
}

async function handleClaude(session, text) {
  // Identifiers are handled locally; only redacted text is sent to the model.
  const notes = [];
  const gstinMatch = text.match(GSTIN_IN_TEXT);
  if (gstinMatch) notes.push(...absorb(session, gstinMatch[0]));
  session.history.push({ role: "user", content: redact(text) });

  const known = { ...session.profile, gstin: session.profile.gstin ? maskGstin(session.profile.gstin) : undefined };
  const turn = await callClaude({
    system: systemPrompt(session.language),
    messages: [
      ...session.history.slice(0, -1),
      { role: "user", content: `${session.history.at(-1).content}\n\n<known_profile>${JSON.stringify(known)}</known_profile>` },
    ],
    format: AdvisorTurn,
  });

  const u = turn.profile;
  const p = session.profile;
  if (u.business_type) p.businessType = matchBusinessType(u.business_type) || u.business_type;
  if (p.businessType) p.segment = businessTypes.get(p.businessType) || p.segment;
  if (u.business_name && !p.businessName) p.businessName = u.business_name;
  if (u.city) {
    const known = resolveCity(u.city);
    p.city = known ? known.city : u.city;
    if (!known) p.cityTier = 2;
  }
  if (u.employees) p.employees = u.employees;
  if (u.sites) p.sites = u.sites;
  if (u.has_gstin != null && !p.gstin) p.hasGstin = u.has_gstin;
  if (u.current_internet) p.currentInternet = u.current_internet;
  if (u.monthly_spend_inr) p.currentSpend = u.monthly_spend_inr;
  if (u.fibre_available === false) p.fibreAvailable = false;
  p.needs = [...new Set([...(p.needs || []), ...u.needs])];

  session.history.push({ role: "assistant", content: turn.reply });
  const complete = p.businessType && p.city && p.employees && p.sites && p.hasGstin != null;
  if (turn.ready_to_recommend && complete) {
    session.step = "recommend";
    return [...notes, await explainWithClaude(session)].join("\n\n");
  }
  session.step = nextStep(p);
  session.quickRepliesOverride = turn.quick_replies.slice(0, 6);
  return [...notes, turn.reply].join("\n\n");
}

async function explainWithClaude(session) {
  const rec = recommendBundle(session.profile);
  session.recommendation = rec;
  session.profile = { ...session.profile, segment: rec.profile.segment, cityTier: rec.profile.cityTier };
  session.outcome = "recommended";
  const facts = {
    segment: rec.profile.segment,
    included: rec.items.filter((i) => i.included).map(({ name, quantity, reason }) => ({ name, quantity, reason })),
    optional_add_ons: rec.items.filter((i) => !i.included).map((i) => i.name),
    monthly_total_incl_gst_inr: Math.round(rec.quote.monthlyTotal),
    one_time_setup_inr: rec.quote.setupTotal,
    contract_months: rec.quote.contractMonths,
    days_to_activate: rec.quote.activationDays,
    current_monthly_spend_inr: session.profile.currentSpend || null,
    tips: rec.tips,
  };
  try {
    const out = await callClaude({
      system: `You explain an Accel Business bundle to a small business owner in ${session.language}, in plain words. Use only the facts given - never invent products, prices or features. Start with the monthly total, then one short line per included service saying why it helps this business, then mention that optional add-ons can be switched on. Under 150 words. Use "•" bullets.`,
      messages: [{ role: "user", content: JSON.stringify(facts) }],
      format: Explanation,
    });
    return out.message;
  } catch (err) {
    console.warn(`[advisor] explanation fell back to template: ${err.message}`);
    return finishWithRecommendation(session);
  }
}

export async function handleMessage(session, text) {
  const clean = String(text || "").slice(0, 1000);
  session.messages.push({ role: "user", text: clean });
  session.quickRepliesOverride = null;
  let reply;
  if (client && session.mode === "claude") {
    try {
      reply = await handleClaude(session, clean);
    } catch (err) {
      // Keep the conversation going on the rules engine if the API fails.
      console.warn(`[advisor] Claude unavailable, switching session to rules: ${err.message}`);
      session.mode = "rules";
      reply = handleRules(session, clean);
    }
  } else {
    reply = handleRules(session, clean);
  }
  session.messages.push({ role: "assistant", text: reply });
  session.quickReplies = session.quickRepliesOverride || quickRepliesFor(session);
  return session;
}

export { catalogueSummary };
