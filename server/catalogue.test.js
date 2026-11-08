import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendBundle, priceQuote, validateCart, unitPrice } from "./catalogue.js";
import { productById } from "./data.js";

const included = (rec) => rec.items.filter((i) => i.included).map((i) => i.id);

test("every recommended product satisfies the catalogue rules", () => {
  const profiles = [
    { businessType: "Kirana store", city: "Patna", employees: 2, sites: 1, hasGstin: false, needs: ["payments", "whatsapp", "cctv"] },
    { businessType: "CA firm", city: "Pune", employees: 12, sites: 1, hasGstin: true, needs: ["email", "telephony", "firewall"] },
    { businessType: "Restaurant chain", city: "Bengaluru", employees: 40, sites: 5, hasGstin: true, needs: ["multisite", "cctv"] },
    { businessType: "Textile unit", city: "Surat", employees: 60, sites: 1, hasGstin: true, needs: ["machines", "fleet"] },
  ];
  for (const profile of profiles) {
    const rec = recommendBundle(profile);
    const ids = new Set(included(rec));
    for (const id of ids) {
      const p = productById.get(id);
      assert.ok(p.cityTiers.includes(rec.profile.cityTier), `${id} tier`);
      assert.ok(rec.profile.employees >= p.minEmployees, `${id} employees`);
      assert.ok(rec.profile.sites >= p.minSites, `${id} sites`);
      if (p.requiresGstin) assert.ok(profile.hasGstin, `${id} needs GSTIN`);
      if (p.requiresOneOf.length) assert.ok(p.requiresOneOf.some((d) => ids.has(d)), `${id} dependency`);
    }
  }
});

test("GSTIN-only products are blocked and explained for owners without GSTIN", () => {
  const rec = recommendBundle({ businessType: "Kirana store", city: "Patna", employees: 2, sites: 1, hasGstin: false, needs: ["whatsapp"] });
  assert.ok(!included(rec).includes("P15"));
  assert.ok(rec.blocked.some((b) => b.id === "P15"));
  assert.match(rec.tips[0], /GSTIN/);
});

test("multi-site businesses get failover and central management", () => {
  const rec = recommendBundle({ businessType: "Pharmacy chain", city: "Mumbai", employees: 30, sites: 6, hasGstin: true, needs: [] });
  assert.ok(included(rec).includes("P09"));
  assert.ok(included(rec).includes("P10"));
});

test("24-month contracts get the catalogue minimum price", () => {
  const p = productById.get("P02");
  assert.equal(unitPrice(p, 24), 1499);
  assert.equal(unitPrice(p, 12), 1649);
});

test("quote adds CGST + SGST at 9% each", () => {
  const q = priceQuote([{ id: "P01", included: true, quantity: 1 }, { id: "P07", included: true, quantity: 2 }], { contractMonths: 24 });
  assert.equal(q.subtotal, 999 + 2 * 299);
  assert.equal(q.cgst, Math.round(q.subtotal * 0.09 * 100) / 100);
  assert.equal(q.monthlyTotal, Math.round((q.subtotal + q.cgst + q.sgst) * 100) / 100);
});

test("removing the only fibre line switches off products that depend on it", () => {
  const cart = validateCart(
    [
      { id: "P01", included: false, quantity: 1 },
      { id: "P23", included: true, quantity: 2 },
    ],
    { cityTier: 1, employees: 3, sites: 1, hasGstin: false },
  );
  assert.equal(cart.find((i) => i.id === "P23").included, false);
  assert.match(cart.find((i) => i.id === "P23").warning, /Needs one of/);
});
