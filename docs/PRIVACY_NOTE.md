# Data privacy and security note

*Udyam Digital prototype · designed for the Digital Personal Data Protection Act, 2023 (DPDP Act)*

## 1. Consent before collection
- The KYC page opens with a plain-language notice: what is collected, why, how long it is kept and how to withdraw. **No document can be uploaded until the owner ticks "I agree".** The server rejects uploads without a valid consent ID.
- Consent is stored per purpose (`kyc_verification`, `service_activation`), with notice version and time. Marketing is a **separate, unticked, optional** box and is not needed to continue.
- **Withdrawal is one tap** ("Withdraw consent") and immediately deletes the consent record, extracted fields and verification result (`DELETE /api/kyc/:consentId`).
- Callback requests need their own consent tick. The number is used only for that call.

## 2. Purpose limitation
- KYC data is used only to verify the business and activate services. The advisor chat profile (business type, size, needs) is used only to build the quote and, if the owner asks, for a partner callback.
- The partner console shows **masked** names and phone numbers. It has no access to KYC documents.

## 3. Data minimisation
| Data | Kept? |
|---|---|
| Document photos | **No.** OCR runs in memory; the image buffer is discarded after reading and never written to disk |
| Raw OCR text | **No.** Only the named fields needed for checks are kept |
| GSTIN, Udyam number, names, address | Yes, for KYC, in the per-consent record |
| Aadhaar number | **Never collected.** E-sign uses an OTP through an eSign provider |
| Phone number | Only if the owner asks for a callback; console shows the last 4 digits |

- The advisor asks only what the bundle needs. It never asks for Aadhaar, PAN or phone numbers.
- **Text sent to the LLM is redacted first:** GSTINs, 10-digit phone numbers, 12-digit numbers and emails are replaced with placeholders. GSTIN lookups happen on our server, not in the model.

## 4. Masking
- Identifiers are masked in API responses and on screen: GSTIN `27*********U1ZL`, Udyam `UDYAM-MH-00-718****`, ID `*********5512`, signatory `N*** B****`.
- **Logs record method, path, status and timing only** - never request bodies. GSTINs in URLs are replaced with `[gstin]`.

## 5. Retention
- Prototype: everything is in memory and deleted on restart or withdrawal.
- Production design: verified KYC fields kept only as long as telecom subscriber-verification rules require, then deleted automatically. Unfinished applications deleted after 30 days. Quote-only chats anonymised after 90 days for analytics.

## 6. Security controls
- Server-side validation of every input: image type and 8 MB size limit, GSTIN/Udyam format, phone format, quantity bounds. Prices and eligibility are recomputed on the server; the browser cannot set a price.
- Order placement requires, in order: the session's own consent, a **verified** KYC result and a completed e-sign. A KYC record cannot be used by another session.
- E-sign OTP: 6 digits, 3 attempts, then a new OTP is needed. (The prototype shows the OTP on screen for the demo; production sends it by SMS only.)
- Order IDs are random and hard to guess. API keys come only from environment variables, never from code.
- Production additions: TLS everywhere, encryption at rest, role-based access for partners (own region and own leads only), audit log of every KYC record access, data stored in India.

## 7. Owner rights (DPDP s.11-13)
Access, correction and erasure through the same journey: the owner sees exactly what was extracted (masked) and can replace any document or withdraw consent. A grievance contact is shown on the notice.

## 8. Fairness of the propensity score
The score only orders the call list. It never decides eligibility, price or service. Language and city tier are inputs, so production use needs regular checks that no region or language group is consistently left out.
