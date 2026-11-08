// Rule-based advisor flow (runs without an API key).
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADVISOR_MODE = "rules";
const { createSession, handleMessage } = await import("./advisor.js");

async function chat(language, turns) {
  const session = createSession(language);
  for (const t of turns) await handleMessage(session, t);
  return session;
}

test("English chat reaches a recommendation and captures the profile", async () => {
  const s = await chat("English", ["I run a pharmacy in Jaipur with 4 staff", "1", "No GSTIN", "UPI / card billing", "Done", "Skip"]);
  assert.equal(s.step, "recommend");
  assert.equal(s.profile.businessType, "Pharmacy");
  assert.equal(s.profile.city, "Jaipur");
  assert.equal(s.profile.employees, 4);
  assert.equal(s.profile.hasGstin, false);
  assert.deepEqual(s.profile.needs, ["payments"]);
  assert.ok(s.recommendation.items.some((i) => i.id === "P19" && i.included));
});

test("a GSTIN fills in business details from the registry", async () => {
  const s = await chat("English", ["Salon", "Jaipur", "3", "1", "08YKZXS5189L1ZO"]);
  assert.equal(s.profile.hasGstin, true);
  assert.equal(s.profile.businessName, "Saffron Unisex Salon");
  assert.match(s.messages.at(-1).text, /Found it/);
});

test("Hindi chat works end to end with Hindi explanations", async () => {
  const s = await chat("Hindi", ["किराना स्टोर", "Lucknow", "3-5", "1", "GSTIN नहीं है", "हो गया", "छोड़ें"]);
  assert.equal(s.step, "recommend");
  assert.match(s.messages.at(-1).text, /मेरी सलाह/);
});

test("tapping a need chip twice toggles it off", async () => {
  const s = await chat("English", ["Kirana store", "Pune", "2", "1", "No GSTIN", "CCTV cameras", "✓ CCTV cameras"]);
  assert.deepEqual(s.profile.needs, []);
});

test("unknown business types keep the owner's own words", async () => {
  const s = await chat("English", ["I run an electronics shop in Pune with 6 staff"]);
  assert.equal(s.profile.businessType, "electronics shop");
  assert.equal(s.profile.city, "Pune");
  assert.equal(s.profile.employees, 6);
});
