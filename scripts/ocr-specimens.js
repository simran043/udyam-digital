// Runs OCR over every specimen in data/kyc_documents and prints the raw text.
// Useful for checking OCR quality before a demo.
import fs from "node:fs";
import path from "node:path";
import { recognize, shutdownOcr } from "../server/ocr.js";

const dir = path.resolve("data/kyc_documents");
const only = process.argv[2];
for (const file of fs.readdirSync(dir).sort()) {
  if (only && !file.startsWith(only)) continue;
  const text = await recognize(fs.readFileSync(path.join(dir, file)));
  console.log(`===== ${file}\n${text.trim()}\n`);
}
await shutdownOcr();
