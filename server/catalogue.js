// Bundle recommendation, eligibility rules and transparent pricing.
//
// Recommendations are deterministic so every bundle shown to a customer is
// guaranteed to satisfy the catalogue rules (city tier, size, GSTIN and
// product dependencies). The GenAI advisor only gathers the profile and
// explains the result; it never invents products or prices.
import { products, productById, leads, SEGMENT_CODES, cities, businessTypes } from "./data.js";

export const GST_RATE = 0.18;

// ---------- learned from activated customers in smb_leads.csv ----------
function learnFromActivated() {
  const attach = {}; // segment -> productId -> share of activated customers that bought it
  const qty = {}; // segment -> productId -> median quantity bought
  const bySegment = {};
  for (const lead of leads) {
    if (lead.outcome !== "Activated" || !lead.bundle_products) continue;
    (bySegment[lead.segment] ??= []).push(lead);
  }
  for (const [segment, rows] of Object.entries(bySegment)) {
    const counts = {};
    const quantities = {};
    for (const row of rows) {
      for (const item of row.bundle_products.split(";")) {
        const [id, q] = item.split("x");
        counts[id] = (counts[id] || 0) + 1;
        (quantities[id] ??= []).push(Number(q));
      }
    }
    attach[segment] = Object.fromEntries(Object.entries(counts).map(([id, c]) => [id, c / rows.length]));
    qty[segment] = Object.fromEntries(
      Object.entries(quantities).map(([id, list]) => {
        const sorted = list.sort((a, b) => a - b);
        return [id, sorted[Math.floor(sorted.length / 2)]];
      }),
    );
  }
  return { attach, qty };
}
export const learned = learnFromActivated();

// ---------- profile helpers ----------
export function resolveCity(name) {
  if (!name) return null;
  const key = [...cities.keys()].find((c) => c.toLowerCase() === String(name).trim().toLowerCase());
  return key ? cities.get(key) : null;
}

export function inferSegment(profile) {
  if (profile.segment) return profile.segment;
  const known = profile.businessType && businessTypes.get(profile.businessType);
  if (known) return known;
  const text = `${profile.businessType || ""}`.toLowerCase();
  if (/(unit|factory|manufactur|workshop|press|mould|textile|processing)/.test(text)) return "Small manufacturers";
  if ((profile.sites || 1) >= 3) return "Small multi-site businesses";
  if (/(clinic|ca firm|chartered|law|legal|coaching|agency|architect|diagnostic|lab|insurance|consult|office)/.test(text)) {
    return "Professional offices";
  }
  return "Micro retail & services";
}

export function checkEligibility(product, profile) {
  const reasons = [];
  if (profile.cityTier && !product.cityTiers.includes(profile.cityTier)) {
    reasons.push(`Not yet available in tier-${profile.cityTier} cities`);
  }
  if ((profile.employees || 1) < product.minEmployees) reasons.push(`Needs at least ${product.minEmployees} employees`);
  if ((profile.sites || 1) < product.minSites) reasons.push(`Needs at least ${product.minSites} sites`);
  if (product.requiresGstin && !profile.hasGstin) reasons.push("Needs an active GSTIN");
  return { eligible: reasons.length === 0, reasons };
}

// ---------- recommendation ----------
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function pickConnectivity(profile) {
  const employees = profile.employees || 1;
  const needs = new Set(profile.needs || []);
  if (profile.segment === "Small manufacturers" && employees >= 25 && profile.hasGstin) return "P06";
  if ((needs.has("dedicated_line") || profile.segment === "Small manufacturers") && employees >= 10 && profile.hasGstin) {
    return "P05";
  }
  if (profile.fibreAvailable === false) return "P04";
  // Each site gets its own line, so size it by the staff at a typical site.
  const perSite = employees / (profile.sites || 1);
  if (perSite >= 15 && profile.cityTier === 1 && profile.hasGstin) return "P03";
  if (perSite >= 5 || profile.segment === "Small multi-site businesses") return "P02";
  return "P01";
}

const NEED_PRODUCTS = {
  payments: ["P19"],
  whatsapp: ["P15"],
  sms: ["P14"],
  website: ["P18"],
  cctv: ["P23"],
  guest_wifi: ["P22"],
  email: ["P16"],
  backup: ["P17"],
  security: ["P20"],
  firewall: ["P21"],
  failover: ["P09"],
  multisite: ["P10"],
  telephony: ["P12"],
  tollfree: ["P13"],
  machines: ["P24"],
  fleet: ["P25"],
  static_ip: ["P11"],
};

export const NEED_LABELS = {
  payments: "UPI / card billing",
  whatsapp: "WhatsApp with customers",
  sms: "SMS alerts and offers",
  website: "Website",
  cctv: "CCTV cameras",
  guest_wifi: "Wi-Fi for customers",
  email: "Business email",
  backup: "Data backup",
  security: "Virus / ransomware protection",
  firewall: "Firewall",
  failover: "Internet that never goes down",
  multisite: "Manage all branches centrally",
  telephony: "Office phone lines / IVR",
  tollfree: "Toll-free number",
  machines: "Machine monitoring",
  fleet: "Vehicle tracking",
  static_ip: "Remote access / static IP",
  dedicated_line: "Dedicated bandwidth",
};

function quantityFor(productId, profile) {
  const employees = profile.employees || 1;
  const sites = profile.sites || 1;
  const p = productById.get(productId);
  const learnedQty = learned.qty[profile.segment]?.[productId];
  switch (p.unit) {
    case "per site":
      return sites;
    case "per counter":
      return Math.max(sites, learnedQty || 1);
    case "per user":
      return clamp(employees, 1, 50);
    case "per device":
      return productId === "P24" ? clamp(profile.machines || learnedQty || 4, 1, 50) : clamp(employees, 1, 50);
    case "per camera":
      return clamp(sites * 2, 2, 40);
    case "per vehicle":
      return clamp(profile.vehicles || learnedQty || 2, 1, 50);
    case "per channel":
      return clamp(Math.ceil(employees / 5), 2, 10);
    case "per line":
      return clamp(learnedQty || Math.ceil(employees / 5), 1, Math.max(1, employees));
    default:
      return 1;
  }
}

const REASONS_HI = {
  P01: "100 Mbps फ़ाइबर - UPI, बिलिंग और WhatsApp बिना हॉटस्पॉट की रुकावट के चलेंगे।",
  P02: "300 Mbps फ़ाइबर - वीडियो कॉल, क्लाउड ऐप और CCTV एक साथ आराम से चलेंगे।",
  P03: "1 Gbps फ़ाइबर, प्राथमिकता सपोर्ट के साथ - बड़ी टीम के लिए।",
  P04: "5G AirFiber - प्लग करें और चलाएँ, लगभग 2 दिन में चालू; जहाँ फ़ाइबर नहीं है वहाँ के लिए।",
  P05: "डेडिकेटेड लीज़्ड लाइन, 99.5% SLA - प्रोडक्शन और ERP कभी धीमे नहीं होंगे।",
  P06: "100 Mbps डेडिकेटेड लाइन, 99.9% SLA - बड़े प्लांट के लिए।",
  P07: "बिज़नेस मोबाइल लाइन - 50 GB डेटा, अनलिमिटेड कॉल, उसी बिल पर।",
  P08: "बिज़नेस मोबाइल लाइन - 150 GB डेटा, रोमिंग और प्राथमिकता सपोर्ट।",
  P09: "मुख्य लाइन बंद हो तो अपने-आप 4G/5G बैकअप - पेमेंट और बुकिंग चलती रहेंगी।",
  P10: "सभी ब्रांच का इंटरनेट एक जगह से संभालें।",
  P11: "फ़िक्स्ड IP - कैमरा या सर्वर दूर से देखें।",
  P12: "इंटरनेट पर ऑफ़िस फ़ोन लाइन - IVR और कॉल रिकॉर्डिंग के साथ।",
  P13: "टोल-फ़्री 1800 नंबर, जिस पर ग्राहक भरोसा करते हैं।",
  P14: "ऑर्डर अपडेट और ऑफ़र SMS से भेजें; DLT रजिस्ट्रेशन में हम मदद करेंगे।",
  P15: "वेरिफ़ाइड WhatsApp Business कैटलॉग के साथ - आपके ग्राहक पहले से वहीं हैं।",
  P16: "अपने डोमेन पर बिज़नेस ईमेल, डॉक्यूमेंट और वीडियो मीटिंग।",
  P17: "PC और फ़ोन का अपने-आप बैकअप - ज़रूरी डेटा कभी नहीं खोएगा।",
  P18: "अपने डोमेन के साथ सरल वेबसाइट - ग्राहक आपको Google पर ढूँढ सकें।",
  P19: "GST-रेडी बिलिंग, टैबलेट पर UPI और कार्ड पेमेंट।",
  P20: "हर PC और फ़ोन पर वायरस और रैनसमवेयर से सुरक्षा।",
  P21: "हमारी सिक्योरिटी टीम द्वारा मैनेज्ड फ़ायरवॉल।",
  P22: "ग्राहकों के लिए अलग, सुरक्षित Wi-Fi - आपका नेटवर्क सुरक्षित रहेगा।",
  P23: "HD कैमरा, 30 दिन की क्लाउड रिकॉर्डिंग, फ़ोन पर देखें।",
  P24: "मशीन का अपटाइम और बिजली खर्च दिखाने वाले सेंसर - ख़राबी जल्दी पकड़ें।",
  P25: "आपकी गाड़ियों की लाइव GPS ट्रैकिंग।",
};

function reasonFor(productId, profile, source) {
  const seg = profile.segment;
  const share = learned.attach[seg]?.[productId];
  if (profile.language === "Hindi") {
    const peerHi = share ? ` हमसे जुड़ने वाले ऐसे ही ${Math.round(share * 100)}% बिज़नेस ने यह लिया।` : "";
    const whyHi = source === "need" ? "आपने यह माँगा।" : source === "core" ? "आपके बंडल का मुख्य हिस्सा।" : "लोकप्रिय ऐड-ऑन।";
    return `${whyHi} ${REASONS_HI[productId] || ""}${peerHi}`.trim();
  }
  const peer = share ? ` ${Math.round(share * 100)}% of similar businesses that joined chose this.` : "";
  const reasons = {
    P01: "Reliable 100 Mbps fibre keeps UPI, billing and WhatsApp running without hotspot drops.",
    P02: "300 Mbps fibre comfortably supports your team on video calls, cloud apps and CCTV together.",
    P03: "1 Gbps fibre with priority support for a larger team that cannot afford slowdowns.",
    P04: "5G AirFiber is plug-and-play and installs in about 2 days - ideal where fibre is not yet available.",
    P05: "A dedicated 1:1 leased line with 99.5% SLA, so production and ERP access are never shared.",
    P06: "A 100 Mbps dedicated line with 99.9% SLA for a large plant.",
    P07: "Business mobile lines with 50 GB data and unlimited calls, on the same bill.",
    P08: "Business mobile lines with 150 GB data, roaming and priority care for staff on the move.",
    P09: "Automatic 4G/5G failover so payments and bookings keep working when the main line is down.",
    P10: "Manage the internet across all your branches from one place.",
    P11: "A fixed IP so you can view cameras or reach your server remotely.",
    P12: "Office phone lines with IVR and call recording, over the internet.",
    P13: "A toll-free 1800 number that customers trust.",
    P14: "Send order updates and offers by SMS; we help with DLT registration.",
    P15: "A verified WhatsApp Business channel with catalogue - most of your customers are already there.",
    P16: "Professional email on your own domain plus documents and video meetings.",
    P17: "Automatic backup of PCs and phones so patient, client or accounts data is never lost.",
    P18: "A simple website with your own domain so customers can find you on Google.",
    P19: "GST-ready billing with UPI and card acceptance on a tablet.",
    P20: "Protection against viruses and ransomware on every PC and phone.",
    P21: "A managed firewall watched by our security team.",
    P22: "Separate, filtered Wi-Fi for customers so your own network stays safe.",
    P23: "HD cameras with 30-day cloud recording you can watch on your phone.",
    P24: "Sensors that show machine uptime and power use, so breakdowns are caught early.",
    P25: "Live GPS tracking for your vehicles.",
  };
  const why = source === "need" ? "You asked for this." : source === "core" ? "Core of your bundle." : "Popular add-on.";
  return `${why} ${reasons[productId] || ""}${peer}`.trim();
}

/**
 * Builds a bundle for a business profile.
 * profile: { businessType, segment, city, cityTier, employees, sites, hasGstin, needs[], currentSpend, fibreAvailable }
 */
export function recommendBundle(rawProfile) {
  const cityInfo = resolveCity(rawProfile.city);
  const profile = {
    ...rawProfile,
    cityTier: rawProfile.cityTier || cityInfo?.tier || 2,
    employees: Math.max(1, Number(rawProfile.employees) || 1),
    sites: Math.max(1, Number(rawProfile.sites) || 1),
    needs: rawProfile.needs || [],
  };
  profile.segment = inferSegment(profile);

  const chosen = new Map(); // productId -> {source}
  const blocked = [];
  const add = (id, source) => {
    if (chosen.has(id)) return;
    const product = productById.get(id);
    const check = checkEligibility(product, profile);
    if (!check.eligible) {
      blocked.push({ id, name: product.name, reasons: check.reasons });
      return;
    }
    chosen.set(id, { source });
  };

  // 1. Core connectivity for every site, plus mobile lines.
  add(pickConnectivity(profile), "core");
  const mobile = profile.segment === "Micro retail & services" ? "P07" : "P08";
  add(mobile, "core");

  // 2. Everything the owner asked for.
  for (const need of profile.needs) for (const id of NEED_PRODUCTS[need] || []) add(id, "need");

  // 3. Segment essentials that most activated peers bought (>=40% attach).
  const peerShare = learned.attach[profile.segment] || {};
  for (const [id, share] of Object.entries(peerShare).sort((a, b) => b[1] - a[1])) {
    if (share >= 0.4 && !["P07", "P08", "P01", "P02", "P03", "P04", "P05", "P06"].includes(id)) add(id, "peer");
  }
  if (profile.sites >= 2) add("P09", "peer");
  if (profile.sites >= 3 && profile.employees >= 10) add("P10", "peer");

  // 4. Satisfy dependencies ("requires one of") using the chosen connectivity.
  for (const [id] of [...chosen]) {
    const deps = productById.get(id).requiresOneOf;
    if (deps.length && !deps.some((d) => chosen.has(d))) {
      chosen.delete(id);
      blocked.push({ id, name: productById.get(id).name, reasons: [`Needs one of ${deps.join(", ")} in the same bundle`] });
    }
  }

  // 5. Optional add-ons: peer favourites the owner did not ask for (start toggled off).
  const addOnCandidates = Object.entries(peerShare)
    .filter(([id, share]) => share >= 0.15 && !chosen.has(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const addOns = [];
  for (const id of addOnCandidates) {
    const product = productById.get(id);
    if (product.category === "Connectivity" && !["P09", "P11"].includes(id)) continue;
    if (!checkEligibility(product, profile).eligible) continue;
    if (product.requiresOneOf.length && !product.requiresOneOf.some((d) => chosen.has(d))) continue;
    addOns.push(id);
    if (addOns.length >= 4) break;
  }

  const items = [
    ...[...chosen].map(([id, { source }]) => ({ id, source, included: true })),
    ...addOns.map((id) => ({ id, source: "addon", included: false })),
  ].map((item) => {
    const p = productById.get(item.id);
    return {
      ...item,
      name: p.name,
      category: p.category,
      unit: p.unit,
      quantity: quantityFor(item.id, profile),
      reason: reasonFor(item.id, profile, item.source),
      installDays: p.installDays,
    };
  });

  // Point the owner to the GSTIN benefit if products were blocked by it.
  const gstinBlocked = blocked.filter((b) => b.reasons.some((r) => r.includes("GSTIN")));
  const tips = [];
  if (gstinBlocked.length) {
    const names = gstinBlocked.map((b) => b.name).join(", ");
    tips.push(
      profile.language === "Hindi"
        ? `GSTIN होने पर आप ${names} भी ले सकते हैं। GST रजिस्ट्रेशन में हमारे पार्टनर मुफ़्त मदद करते हैं।`
        : `With a GSTIN you could also get ${names}. Our partner network helps with GST registration for free.`,
    );
  }

  return {
    profile: { ...profile, segmentCode: SEGMENT_CODES[profile.segment] },
    items,
    blocked,
    tips,
    quote: priceQuote(items, { contractMonths: 12 }),
  };
}

// ---------- pricing ----------
// Pricing rule (transparent and documented): a 24-month commitment gets the
// catalogue's minimum price, a 12-month (or shorter) commitment the midpoint
// of the range rounded to end in 9. Prices exclude 18% GST, which is
// shown separately as CGST + SGST because Accel bills from a GST
// registration in the customer's own state (intra-state supply).
export function unitPrice(product, contractMonths) {
  if (contractMonths >= 24 || product.priceMin === product.priceMax) return product.priceMin;
  const mid = (product.priceMin + product.priceMax) / 2;
  const endsIn9 = Math.round(mid / 10) * 10 - 1;
  return Math.min(product.priceMax, Math.max(product.priceMin, endsIn9));
}

const round2 = (n) => Math.round(n * 100) / 100;

export function priceQuote(items, { contractMonths = 12 } = {}) {
  const lines = [];
  for (const item of items) {
    if (!item.included) continue;
    const product = productById.get(item.id);
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const months = Math.max(contractMonths, product.minContractMonths);
    const price = unitPrice(product, months);
    lines.push({
      id: product.id,
      name: product.name,
      quantity,
      unit: product.unit,
      unitPrice: price,
      monthly: price * quantity,
      setup: product.setupFee * quantity,
      contractMonths: months,
      installDays: product.installDays,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.monthly, 0);
  const setupTotal = lines.reduce((s, l) => s + l.setup, 0);
  const cgst = round2(subtotal * (GST_RATE / 2));
  const sgst = round2(subtotal * (GST_RATE / 2));
  return {
    contractMonths,
    lines,
    subtotal,
    cgst,
    sgst,
    gstTotal: round2(cgst + sgst),
    monthlyTotal: round2(subtotal + cgst + sgst),
    setupTotal,
    setupWithGst: round2(setupTotal * (1 + GST_RATE)),
    firstBill: round2((subtotal + setupTotal) * (1 + GST_RATE)),
    activationDays: lines.length ? Math.max(...lines.map((l) => l.installDays)) : 0,
  };
}

// Validates a client-edited cart (toggles / quantities) against the rules.
export function validateCart(items, profile) {
  const included = new Set(items.filter((i) => i.included).map((i) => i.id));
  return items.map((item) => {
    const product = productById.get(item.id);
    if (!product) return { ...item, included: false, warning: "Unknown product" };
    if (!item.included) return item;
    const check = checkEligibility(product, profile || {});
    if (!check.eligible) return { ...item, included: false, warning: check.reasons.join("; ") };
    if (product.requiresOneOf.length && !product.requiresOneOf.some((d) => included.has(d))) {
      return { ...item, included: false, warning: `Needs one of ${product.requiresOneOf.join(", ")} in the bundle` };
    }
    return item;
  });
}

export function catalogueSummary() {
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    description: p.description,
    unit: p.unit,
    priceMin: p.priceMin,
    priceMax: p.priceMax,
    setupFee: p.setupFee,
    installDays: p.installDays,
  }));
}
