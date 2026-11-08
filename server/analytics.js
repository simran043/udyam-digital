// Back-office analytics: funnel, drop reasons, channel economics and a
// lead propensity model trained on smb_leads.csv.
import { leads } from "./data.js";
import { maskName } from "./validators.js";

const FUNNEL = ["Lead", "Contacted", "Needs assessed", "Quote accepted", "KYC complete", "Activated"];
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

// Drop reasons the digital journey directly removes, mapped to the fix.
export const FIXABLE_REASONS = {
  "Owner had no time for a visit": "Advisor works 24x7 on the phone - no visit needed",
  "Visit not scheduled by sales": "Self-serve advisor replaces the first visit",
  "Quote took too long to arrive": "Instant quote in the chat",
  "Quote too complex to understand": "One monthly price with plain-language reasons",
  "Found paperwork too long": "GSTIN auto-fill and OCR KYC in minutes",
  "Missing GST or Udyam document": "Registry lookup instead of uploads",
  "Document details did not match": "Mismatches caught instantly with a clear fix",
  "Authorised signatory not available": "Remote Aadhaar e-sign",
  "Price too high": "Add-ons toggled off by default; 24-month price option",
  "Decided to wait": "Saved quote and WhatsApp follow-up",
  "Unreachable after 3 attempts": "Owner starts the chat when convenient",
};

// ---------- funnel and economics ----------
function funnel() {
  const reached = (stage) => leads.filter((l) => FUNNEL.indexOf(l.stage_reached) >= FUNNEL.indexOf(stage)).length;
  return FUNNEL.map((stage, i) => {
    const count = reached(stage);
    const prev = i ? reached(FUNNEL[i - 1]) : null;
    return { stage, count, conversion: prev ? pct(count, prev) : null };
  });
}

function dropReasons() {
  const counts = {};
  for (const l of leads) if (l.drop_reason) counts[l.drop_reason] = (counts[l.drop_reason] || 0) + 1;
  return Object.entries(counts)
    .map(([reason, count]) => ({
      reason,
      count,
      stage: leads.find((l) => l.drop_reason === reason).stage_reached,
      fixable: Boolean(FIXABLE_REASONS[reason]),
      fix: FIXABLE_REASONS[reason] || null,
    }))
    .sort((a, b) => b.count - a.count);
}

function groupStats(key) {
  const groups = {};
  for (const l of leads) (groups[l[key]] ??= []).push(l);
  return Object.entries(groups)
    .map(([name, rows]) => {
      const activated = rows.filter((r) => r.outcome === "Activated");
      const spend = rows.reduce((s, r) => s + r.acquisition_cost_inr, 0);
      const values = activated.map((r) => r.monthly_bundle_value_inr).sort((a, b) => a - b);
      return {
        name,
        leads: rows.length,
        activated: activated.length,
        activationRate: pct(activated.length, rows.length),
        cacPerActivation: activated.length ? Math.round(spend / activated.length) : null,
        medianBundle: values.length ? values[Math.floor(values.length / 2)] : null,
        churn6m: activated.length ? pct(activated.filter((r) => r.churned_within_6_months === "Y").length, activated.length) : null,
        avgNps: activated.length ? Math.round((activated.reduce((s, r) => s + r.nps_score, 0) / activated.length) * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.leads - a.leads);
}

function headline() {
  const activated = leads.filter((l) => l.outcome === "Activated");
  const spend = leads.reduce((s, r) => s + r.acquisition_cost_inr, 0);
  const avg = (arr) => arr.reduce((s, x) => s + x, 0) / (arr.length || 1);
  const withGst = leads.filter((l) => l.has_gstin === "Y");
  const withoutGst = leads.filter((l) => l.has_gstin !== "Y");
  const rate = (rows) => pct(rows.filter((r) => r.outcome === "Activated").length, rows.length);
  const calls = activated.map((r) => r.customer_follow_up_calls);
  const churnByCalls = (pred) => {
    const rows = activated.filter((r) => pred(r.customer_follow_up_calls));
    return pct(rows.filter((r) => r.churned_within_6_months === "Y").length, rows.length);
  };
  return {
    leads: leads.length,
    activated: activated.length,
    activationRate: pct(activated.length, leads.length),
    avgDaysToActivate: Math.round(avg(activated.map((r) => r.days_lead_to_activation)) * 10) / 10,
    avgFollowUpCalls: Math.round(avg(calls) * 10) / 10,
    cacPerActivation: Math.round(spend / activated.length),
    churn6m: pct(activated.filter((r) => r.churned_within_6_months === "Y").length, activated.length),
    avgNps: Math.round(avg(activated.map((r) => r.nps_score)) * 10) / 10,
    activationWithGstin: rate(withGst),
    activationWithoutGstin: rate(withoutGst),
    churnWhenFewCalls: churnByCalls((c) => c <= 2),
    churnWhenManyCalls: churnByCalls((c) => c >= 4),
  };
}

// ---------- propensity model (logistic regression, trained at startup) ----------
const CATEGORICAL = ["segment", "lead_source", "city_tier", "has_gstin", "has_udyam", "current_internet", "annual_turnover_band", "preferred_language", "contact_role"];

function featureNames() {
  const names = [];
  for (const key of CATEGORICAL) {
    const values = [...new Set(leads.map((l) => String(l[key])))].sort();
    for (const v of values.slice(1)) names.push([key, v]); // first value is the baseline
  }
  return names;
}

const NUMERIC_LABELS = { log_employees: "Larger team", log_sites: "More sites", log_spend: "Higher telecom spend" };

function humanise(key, value) {
  switch (key) {
    case "has_gstin":
      return value === "Y" ? "Has GSTIN" : "No GSTIN";
    case "has_udyam":
      return value === "Y" ? "Has Udyam" : "No Udyam";
    case "city_tier":
      return `Tier-${value} city`;
    case "lead_source":
      return `Source: ${value}`;
    case "current_internet":
      return `Today: ${value}`;
    case "annual_turnover_band":
      return `Turnover ${value}`;
    case "preferred_language":
      return `Speaks ${value}`;
    case "contact_role":
      return `Contact is ${value}`;
    default:
      return value;
  }
}

function seededShuffle(arr, seed = 42) {
  const out = [...arr];
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function auc(scores, labels) {
  const pairs = scores.map((s, i) => [s, labels[i]]).sort((a, b) => a[0] - b[0]);
  let rankSum = 0;
  let pos = 0;
  pairs.forEach(([, y], i) => {
    if (y) {
      rankSum += i + 1;
      pos++;
    }
  });
  const neg = pairs.length - pos;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

function trainModel() {
  const names = featureNames();
  const numeric = [
    ["log_employees", (l) => Math.log1p(l.employee_count)],
    ["log_sites", (l) => Math.log1p(l.num_sites)],
    ["log_spend", (l) => Math.log1p(l.monthly_telecom_spend_inr)],
  ];
  const means = numeric.map(([, f]) => leads.reduce((s, l) => s + f(l), 0) / leads.length);
  const sds = numeric.map(([, f], i) => Math.sqrt(leads.reduce((s, l) => s + (f(l) - means[i]) ** 2, 0) / leads.length) || 1);
  const vectorise = (l) => [
    ...names.map(([k, v]) => (String(l[k]) === v ? 1 : 0)),
    ...numeric.map(([, f], i) => (f(l) - means[i]) / sds[i]),
  ];

  const shuffled = seededShuffle(leads);
  const cut = Math.floor(shuffled.length * 0.8);
  const train = shuffled.slice(0, cut);
  const test = shuffled.slice(cut);
  const X = train.map(vectorise);
  const y = train.map((l) => (l.outcome === "Activated" ? 1 : 0));
  const dims = X[0].length;
  let w = new Array(dims).fill(0);
  let b = 0;
  const lr = 0.5;
  const l2 = 0.001;
  const sigmoid = (z) => 1 / (1 + Math.exp(-z));
  for (let epoch = 0; epoch < 800; epoch++) {
    const gw = new Array(dims).fill(0);
    let gb = 0;
    for (let i = 0; i < X.length; i++) {
      const p = sigmoid(X[i].reduce((s, x, j) => s + x * w[j], b));
      const err = p - y[i];
      for (let j = 0; j < dims; j++) gw[j] += err * X[i][j];
      gb += err;
    }
    w = w.map((wj, j) => wj - lr * (gw[j] / X.length + l2 * wj));
    b -= lr * (gb / X.length);
  }
  const predict = (l) => sigmoid(vectorise(l).reduce((s, x, j) => s + x * w[j], b));
  const testScores = test.map(predict);
  const testLabels = test.map((l) => (l.outcome === "Activated" ? 1 : 0));

  // Lift: activation rate in the top-scored 20% vs overall, on held-out leads.
  const ranked = test.map((l, i) => [testScores[i], testLabels[i]]).sort((a, b) => b[0] - a[0]);
  const top = ranked.slice(0, Math.floor(ranked.length * 0.2));
  const topRate = top.filter(([, yy]) => yy).length / top.length;
  const baseRate = testLabels.filter(Boolean).length / testLabels.length;

  const labels = [...names.map(([k, v]) => humanise(k, v)), ...numeric.map(([n]) => NUMERIC_LABELS[n])];
  const weighted = labels.map((label, j) => ({ label, weight: Math.round(w[j] * 100) / 100 }));
  const signals = {
    positive: [...weighted].sort((a, b) => b.weight - a.weight).slice(0, 6),
    negative: [...weighted].sort((a, b) => a.weight - b.weight).slice(0, 6),
  };
  const explain = (l) => {
    const x = vectorise(l);
    return labels
      .map((label, j) => ({ label, contribution: x[j] * w[j] }))
      .filter((c) => c.contribution > 0.15)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map((c) => c.label);
  };

  return {
    predict,
    explain,
    metrics: {
      trainSize: train.length,
      testSize: test.length,
      auc: Math.round(auc(testScores, testLabels) * 1000) / 1000,
      topDecileLift: Math.round((topRate / baseRate) * 10) / 10,
      top20ActivationRate: pct(top.filter(([, yy]) => yy).length, top.length),
      baseActivationRate: Math.round(baseRate * 1000) / 10,
    },
    signals,
  };
}

let model = null;
export function getModel() {
  if (!model) model = trainModel();
  return model;
}

// Which channel should own a lead, so digital adds to the field force
// and partners instead of competing with them.
export function routeLead(lead, score) {
  const big = lead.segment === "Small manufacturers" || lead.segment === "Small multi-site businesses" || lead.employee_count >= 25;
  if (big && score >= 0.1) return { channel: "Field sales", why: "High-value, multi-product need - worth a visit" };
  if (score >= 0.08) return { channel: "Inside sales call", why: "Likely to convert; a short call closes it" };
  if (lead.city_tier === 2) return { channel: "Channel partner + WhatsApp advisor", why: "Local partner nudges; advisor does the quote" };
  return { channel: "WhatsApp advisor link", why: "Low touch: self-serve journey" };
}

// Win-back list: dropped leads whose reason the new journey fixes, ranked.
export function winBackLeads({ limit = 50, segment, reason } = {}) {
  const m = getModel();
  return leads
    .filter((l) => l.outcome === "Dropped" && FIXABLE_REASONS[l.drop_reason])
    .filter((l) => !segment || l.segment === segment)
    .filter((l) => !reason || l.drop_reason === reason)
    .map((l) => {
      const score = m.predict(l);
      return {
        leadId: l.lead_id,
        business: l.business_name,
        type: l.business_type,
        segment: l.segment,
        city: l.city,
        language: l.preferred_language,
        contact: maskName(l.contact_name),
        stageReached: l.stage_reached,
        dropReason: l.drop_reason,
        fix: FIXABLE_REASONS[l.drop_reason],
        score: Math.round(score * 1000) / 10,
        signals: m.explain(l),
        currentSpend: l.monthly_telecom_spend_inr,
        route: routeLead(l, score),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

let cached = null;
export function summary() {
  if (!cached) {
    const m = getModel();
    const reasons = dropReasons();
    const fixable = reasons.filter((r) => r.fixable).reduce((s, r) => s + r.count, 0);
    cached = {
      headline: headline(),
      funnel: funnel(),
      dropReasons: reasons,
      fixableDrops: fixable,
      bySegment: groupStats("segment"),
      bySource: groupStats("lead_source"),
      model: { ...m.metrics, signals: m.signals },
    };
  }
  return cached;
}
