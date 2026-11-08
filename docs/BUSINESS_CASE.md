# Business case: Udyam Digital (10 slides)

All figures come from the synthetic dataset (`smb_leads.csv`, 5,000 leads, Apr-Jun 2026) unless marked **assumption**.

---

## 1. The problem in one number: 7.4%

Only **368 of 5,000** SMB leads activated. Those who did waited **17.6 days** and called **3 times** to chase status. Acquisition cost **₹15,053 per activated customer**, against a typical micro bundle of **₹2,480/month**.

- Biggest leak: needs assessed → quote accepted, **43.6%**
- **2,811 of 4,632** drops (61%) have a reason a digital journey removes: no time for a visit (531), visit never scheduled (296), quote too slow (179) or too complex (206), paperwork (79), missing documents (94), unreachable (805)…
- 77% of leads prefer a language other than English

## 2. Our answer

**One sitting, on a phone, in their language:** chat → bundle with one price → photo KYC → OTP sign → live tracker. A salesperson is called in only where they add value.

| Step | Today | Udyam Digital |
|---|---|---|
| Needs discovery | Sales visit (often not scheduled) | 2-minute chat, 10 languages |
| Quote | 3-5 days, PDF with product codes | Instant, one monthly price, toggles |
| KYC | Paper/email, mismatches found late | GSTIN auto-fill, OCR, 15 instant checks with fixes |
| Activation | 10-14 days, 3-4 chasing calls | Parallel installs, proactive updates |

## 3. Who first: segment priorities

| Segment | Leads | Activation | Median bundle | Cost per activation | 6-mo churn | Play |
|---|---|---|---|---|---|---|
| **Professional offices** | 1,247 | 11.1% | ₹6,580 | ₹10,695 | 13.8% | **Launch segment.** Digital-ready, mid price sensitivity, best CAC |
| **Micro retail & services** | 2,709 | 4.1% | ₹2,480 | ₹20,007 | 22.7% | **Volume, digital only.** CAC today is ~8 months of revenue, so field sales can't pay back |
| Small multi-site | 755 | 11.0% | ₹28,080 | ₹15,614 | 10.8% | **Digital + field.** Advisor qualifies, field closes |
| Small manufacturers | 289 | 12.8% | ₹15,910 | ₹15,324 | 8.1% | **Field-led**, advisor for SIM/email add-ons |

Leads with a GSTIN activate at **9.6% vs 2.0%** without, so the advisor asks for a GSTIN early, auto-fills from it and points non-GST owners to free GST registration help.

## 4. The bundles

Built by the rules engine from what activated peers actually bought. Prices ex-GST, 12-month / 24-month:

| Persona | Bundle | Monthly | Live in |
|---|---|---|---|
| Kirana / pharmacy, 3 staff, tier 2 | Fibre 100, 2 postpaid lines, Cloud POS, 2 CCTV | ₹3,044 / **₹2,594** | 5 days |
| Clinic / CA firm, 8 staff | Fibre 300, 3 postpaid, email ×8, backup, endpoint security ×8 | ₹6,409 / **₹5,587** | 5 days |
| Restaurant chain, 5 outlets | Fibre 300 ×5, failover ×5, SD-WAN, POS ×7, CCTV ×10, 4 postpaid | ₹34,019 / **₹31,069** | 14 days |
| Auto-parts unit, 30 staff | Leased line 100, IoT ×10, email ×30, security ×30, 4 postpaid | ₹37,026 / **₹35,606** | 30 days |

Add-ons are off by default ("price too high" is the #1 drop after needs assessment). A 24-month term is offered at the catalogue's minimum price.

## 5. Making KYC near-instant and compliant

- GSTIN → registry auto-fill; Udyam looked up when not uploaded
- OCR on phone photos; **15 checks** with a fix for every failure
- On the 12 specimen applicants: **8 problem cases caught**, including a cancelled GSTIN, an altered certificate, two checksum typos, a 257-day-old bill and three unauthorised signatories. 4 clean cases pass.
- DPDP by design: consent before upload, photos never stored, identifiers masked, one-tap withdrawal (see privacy note)

## 6. Field force and partners: adding to them, not competing

| Lead type | Owner | Why |
|---|---|---|
| Micro, low score | Advisor link over WhatsApp | Self-serve; no visit cost |
| Tier-2 micro | **Local partner** + advisor | Partner installs and earns commission on digital orders in their territory |
| Likely to convert (score ≥ 8%) | Inside sales call | Short call closes it |
| Multi-site / manufacturing, score ≥ 10% | **Field sales** | High value, multi-product |
| Chat ends without an order | Partner callback, with the chat shared | Owner never repeats themselves |

Field sales is **55% of acquisition spend** today. Moving micro leads off field visits frees it for high-value accounts.

## 7. How we measure success

| Metric | Baseline | Target (2 quarters) |
|---|---|---|
| Lead → activation | 7.4% | **12%** |
| Days lead → activation | 17.6 | **≤ 7** (5 days for fibre bundles) |
| Cost per activation | ₹15,053 | **≤ ₹8,000** |
| Status-chasing calls per customer | 3.0 | **≤ 1** |
| 6-month churn | 15.2% | **≤ 10%** |

Why speed and calls matter: customers activated within 14 days give an NPS of **7.2 vs 6.8**; those who chased status 4+ times give **6.4 vs 7.3** and churn at **23% vs 12%** (≤ 2 calls).

## 8. The upside (scenario)

**Assumption:** the journey lifts quote acceptance 43.6% → 55%, quote → KYC 68% → 80% and KYC → activation 63% → 75%. Lead volume and contact rates stay the same.

| | Today | Scenario |
|---|---|---|
| Activations per quarter | 368 | **~651 (+77%)** |
| New monthly recurring revenue at today's average bundle (₹12,351) | ₹45.4 lakh | **~₹80 lakh** |

These conversion lifts are assumptions to test in the pilot, not measured results.

## 9. Rollout

| Phase | Scope | Gate to next phase |
|---|---|---|
| Pilot (8 weeks) | Professional offices, 3 tier-1 cities, English + Hindi; partners in those cities | Activation ≥ 10%, ≤ 7 days |
| Scale (Q2) | + Micro retail via WhatsApp, 6 languages, tier-2 partners | Cost per activation ≤ ₹10k |
| Full (Q3-Q4) | All segments, 10 languages, voice/IVR, field-assist for multi-site & manufacturing | Churn ≤ 10% |

A/B test against the current journey on the same lead sources throughout.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LLM gives wrong advice | LLM never chooses products or prices; rules engine does. Guided fallback if the API fails |
| KYC fraud with good fakes | Registry-first checks, checksum, tamper detection, e-sign, manual review queue |
| Partner pushback | Partners get commission on digital orders in their area and the hot-lead list |
| Low-literacy / non-English owners | Tap-to-answer chips, regional languages, voice in phase 3, partner callback |
| Fibre not feasible at the site | 5G AirFiber fallback in the rules engine; feasibility check before payment (production) |
| DPDP non-compliance | Consent first, minimisation, masking, retention limits, audit log |
