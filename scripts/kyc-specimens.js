// Runs the full Smart KYC pipeline (OCR -> extraction -> validation) on every
// specimen applicant in data/kyc_documents and prints the verdicts.
import fs from "node:fs";
import path from "node:path";
import { recognize, shutdownOcr } from "../server/ocr.js";
import { parseDocument, validateApplication, DOC_TYPES } from "../server/kyc.js";

const dir = path.resolve("data/kyc_documents");
const files = fs.readdirSync(dir);
const applicants = [...new Set(files.map((f) => f.slice(0, 3)))].sort();
const only = process.argv[2];

for (const id of applicants) {
  if (only && id !== only) continue;
  const docs = {};
  for (const type of Object.keys(DOC_TYPES)) {
    const file = files.find((f) => f === `${id}_${type}.png`);
    if (!file) continue;
    docs[type] = parseDocument(type, await recognize(fs.readFileSync(path.join(dir, file))));
  }
  const result = validateApplication(docs);
  console.log(`\n=== ${id}: ${result.verdict.toUpperCase()}`);
  for (const c of result.checks) {
    if (c.status !== "pass") console.log(`  [${c.status}] ${c.title} - ${c.detail}`);
  }
}
await shutdownOcr();
