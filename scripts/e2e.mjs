// End-to-end API smoke test: advisor -> quote -> KYC -> e-sign -> order -> tracker.
const BASE = process.env.BASE || "http://localhost:8787";
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${json.error}`);
  return json;
};
let s = await call("POST", "/api/advisor/session", { language: "English" });
for (const t of ["Electronics shop in Visakhapatnam, 6 staff", "1", "37NBLXS1145E1ZU", "UPI / card billing", "CCTV cameras", "Done", "Business broadband, ₹3,000"]) {
  s = await call("POST", "/api/advisor/message", { sessionId: s.id, text: t });
}
console.log("advisor:", s.messages.at(-1).text.split("\n")[0]);
const items = s.recommendation.items.map((i) => ({ id: i.id, quantity: i.quantity, included: i.included || i.id === "P22" }));
const q = await call("POST", "/api/quote", { sessionId: s.id, items, contractMonths: 24 });
console.log("quote (24m, +wifi):", q.quote.lines.map((l) => `${l.id}x${l.quantity}`).join(" "), "| total", q.quote.monthlyTotal, "| setup", q.quote.setupTotal);
const { consentId } = await call("POST", "/api/kyc/consent", { sessionId: s.id, accepted: true });
for (const doc of ["gst_certificate", "udyam_certificate", "signatory_id", "address_proof"]) {
  const r = await call("POST", "/api/kyc/sample-document", { consentId, file: `K12_${doc}.png` });
  console.log("  ocr", doc, r.readable, JSON.stringify(r.fields).slice(0, 110));
}
const v = await call("POST", "/api/kyc/validate", { consentId });
console.log("kyc verdict:", v.verdict, v.checks.map((c) => c.status[0]).join(""));
const e = await call("POST", "/api/kyc/esign/start", { consentId });
await call("POST", "/api/kyc/esign/verify", { consentId, otp: e.demoOtp });
let o = await call("POST", "/api/orders", { sessionId: s.id, consentId });
console.log("order", o.id, "eta", o.eta, "daysLeft", o.daysLeft);
for (let i = 0; i < 5; i++) o = await call("POST", `/api/orders/${o.id}/advance`);
console.log("after 5 days:", o.timeline.map((t) => `${t.key}:${t.status}`).join(" "), "|", o.notifications[0].text);
const b = await call("GET", "/api/backoffice/advisor");
console.log("backoffice sessions:", JSON.stringify(b.sessions[0]));
const w = await call("GET", "/api/backoffice/winback?limit=2");
console.log("winback:", w.map((l) => `${l.business} ${l.score}%`).join(", "));
const bad = await fetch(BASE + "/api/kyc/consent", { method: "POST", body: JSON.stringify({ sessionId: s.id, accepted: false }) });
console.log("consent refused ->", bad.status);
