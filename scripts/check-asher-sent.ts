import { google } from "googleapis";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const credsPath = path.join(DATA_DIR, "gmail-credentials.json");
const tokenPath = path.join(DATA_DIR, "gmail-token-asher.json");

const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
const { client_id, client_secret } = creds.installed || creds.web;
const auth = new google.auth.OAuth2(client_id, client_secret);
auth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, "utf-8")));

const gmail = google.gmail({ version: "v1", auth });

async function main() {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "in:sent after:2026/03/28",
    maxResults: 20,
  });

  if (!res.data.messages || res.data.messages.length === 0) {
    console.log("No sent emails found after March 28");
    return;
  }

  console.log(`Found ${res.data.messages.length} sent emails after March 28:\n`);

  for (const msg of res.data.messages) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "metadata",
      metadataHeaders: ["To", "Subject", "Date"],
    });
    const headers = full.data.payload?.headers || [];
    const to = headers.find(h => h.name === "To")?.value || "?";
    const subject = headers.find(h => h.name === "Subject")?.value || "?";
    const date = headers.find(h => h.name === "Date")?.value || "?";
    console.log(`  ${date}`);
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}\n`);
  }
}

main().catch(console.error);
