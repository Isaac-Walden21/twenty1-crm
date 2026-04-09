// Convert local Gmail token files into base64 env var strings for Vercel.
// Run locally: npm run gmail-export-env
//
// Outputs GMAIL_CREDENTIALS_B64 and GMAIL_TOKEN_<SENDER>_B64 values that
// you paste into Vercel → Project → Settings → Environment Variables.
//
// Safe to run — only reads from local data/ folder, never prints the
// decoded content.

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

function toB64(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return Buffer.from(fs.readFileSync(filePath, "utf-8")).toString("base64");
}

const entries: { name: string; file: string; env: string }[] = [
  { name: "credentials", file: "gmail-credentials.json", env: "GMAIL_CREDENTIALS_B64" },
  { name: "isaac token", file: "gmail-token-isaac.json", env: "GMAIL_TOKEN_ISAAC_B64" },
  { name: "asher token", file: "gmail-token-asher.json", env: "GMAIL_TOKEN_ASHER_B64" },
  { name: "default token (legacy)", file: "gmail-token.json", env: "GMAIL_TOKEN_DEFAULT_B64" },
];

console.log("Gmail env var export — paste these into Vercel Project Settings\n");
console.log("=".repeat(70));

let found = 0;
for (const e of entries) {
  const b64 = toB64(path.join(DATA_DIR, e.file));
  if (!b64) {
    console.log(`\n[skip] ${e.name} — data/${e.file} not found`);
    continue;
  }
  found++;
  console.log(`\n${e.env}`);
  console.log("-".repeat(70));
  console.log(b64);
}

console.log("\n" + "=".repeat(70));
console.log(`\nDone. Found ${found} file(s). Steps to deploy:`);
console.log("1. Go to vercel.com → your twenty1-crm project → Settings → Environment Variables");
console.log("2. Add each variable above (Production + Preview + Development)");
console.log("3. Redeploy the project (Deployments → latest → Redeploy)");
console.log("4. Test /compose — Gmail should now show 'connected'");
