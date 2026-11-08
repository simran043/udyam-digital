// Loads ./.env (if present) before any other module reads process.env.
// Variables already set in the shell win over the file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
if (fs.existsSync(file)) {
  try {
    process.loadEnvFile(file);
  } catch (e) {
    console.warn(`Could not read .env: ${e.message}`);
  }
}
