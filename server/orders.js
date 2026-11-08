// Orders and the self-serve activation tracker.
//
// Each order has a planned timeline built from the catalogue's
// typical_install_days. Products activate in parallel, so the order is live
// when the slowest product is installed. A "demo day" counter lets the demo
// move the clock forward instead of waiting for real days to pass.
import crypto from "node:crypto";
import { productById } from "./data.js";
import { TODAY, addDays } from "./validators.js";

export const orders = new Map();

const STAGES = [
  { key: "placed", title: "Order placed", detail: "Payment of first month and setup fee confirmed." },
  { key: "kyc", title: "KYC verified", detail: "Documents checked against GST and Udyam registries." },
  { key: "provisioning", title: "Provisioning", detail: "Connection reserved, SIMs and devices dispatched." },
  { key: "scheduled", title: "Technician visit scheduled", detail: "Local Accel partner assigned for installation." },
  { key: "installation", title: "Installation & demo", detail: "Technician installs and shows you how to use each service." },
  { key: "active", title: "All services active", detail: "One bill, one support number for everything." },
];

const isInstant = (product) => product.installDays <= 1;

function buildTimeline(order) {
  const total = Math.max(1, ...order.lines.map((l) => l.installDays));
  const kycDay = order.kycVerdict === "verified" ? 0 : null;
  const day = {
    placed: 0,
    kyc: kycDay ?? 1,
    provisioning: 1,
    scheduled: Math.max(1, Math.min(total - 1, 2)),
    installation: total,
    active: total,
  };
  return STAGES.map((stage) => ({ ...stage, day: day[stage.key], plannedDate: addDays(order.placedOn, day[stage.key]) }));
}

function maskedProfile(profile = {}) {
  return {
    businessName: profile.businessName || profile.businessType || "Your business",
    businessType: profile.businessType,
    city: profile.city,
    segment: profile.segment,
  };
}

export function createOrder({ quote, profile, kycVerdict, channel = "digital" }) {
  const id = `UD-${crypto.randomInt(10000, 99999)}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
  const order = {
    id,
    placedOn: TODAY,
    createdAt: new Date().toISOString(),
    demoDay: 0,
    channel,
    kycVerdict,
    profile: maskedProfile(profile),
    quote,
    lines: quote.lines.map((l) => ({ id: l.id, name: l.name, quantity: l.quantity, installDays: l.installDays })),
    notifications: [],
  };
  order.timeline = buildTimeline(order);
  notify(order, 0, `Order ${id} confirmed. Expected activation by ${order.timeline.at(-1).plannedDate}. Track anytime with your order ID - no need to call.`);
  orders.set(id, order);
  return order;
}

function notify(order, day, text) {
  order.notifications.push({ day, date: addDays(order.placedOn, day), channel: "WhatsApp + SMS (simulated)", text });
}

// Moves the demo clock forward one day and records proactive updates.
export function advanceOrder(order, days = 1) {
  const before = order.demoDay;
  const finalDay = order.timeline.at(-1).day;
  order.demoDay = Math.min(finalDay, before + days);
  for (let d = before + 1; d <= order.demoDay; d++) {
    for (const stage of order.timeline.filter((s) => s.day === d)) {
      if (stage.key === "scheduled") notify(order, d, `Technician visit booked for ${addDays(order.placedOn, finalDay)}, 10 am - 1 pm. Reply 1 to reschedule.`);
      else if (stage.key === "active") notify(order, d, "All services are active. Your first combined bill arrives next month. Rate your setup: reply 0-10.");
      else notify(order, d, `${stage.title}: ${stage.detail}`);
    }
    for (const line of order.lines.filter((l) => l.installDays === d && l.installDays < finalDay)) {
      notify(order, d, `${line.name} is now active.`);
    }
  }
  return order;
}

export function orderView(order) {
  const day = order.demoDay;
  const timeline = order.timeline.map((s) => ({
    ...s,
    status: s.day < day || (s.day === day && s.key !== "installation") || (s.key === "installation" && day >= s.day) ? "done" : "pending",
  }));
  const current = timeline.find((s) => s.status === "pending");
  if (current) current.status = "current";
  return {
    id: order.id,
    placedOn: order.placedOn,
    today: addDays(order.placedOn, day),
    demoDay: day,
    profile: order.profile,
    kycVerdict: order.kycVerdict,
    timeline,
    eta: order.timeline.at(-1).plannedDate,
    daysLeft: Math.max(0, order.timeline.at(-1).day - day),
    lines: order.lines.map((l) => {
      const product = productById.get(l.id);
      const active = day >= l.installDays || (isInstant(product) && day >= 1);
      return { ...l, status: active ? "active" : day >= 1 ? "in_progress" : "ordered", activeOn: addDays(order.placedOn, l.installDays) };
    }),
    monthlyTotal: order.quote.monthlyTotal,
    setupTotal: order.quote.setupTotal,
    notifications: [...order.notifications].reverse(),
  };
}
