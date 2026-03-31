/**
 * Fetches missing email bodies from Gmail sent folders.
 * Finds emails that were sent but don't have body content stored,
 * then pulls the full content from Gmail.
 */

import { google } from "googleapis";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "crm.sqlite");

function getGmailClient(sender: string) {
  const credsPath = path.join(DATA_DIR, "gmail-credentials.json");
  const tokenPath = path.join(DATA_DIR, `gmail-token-${sender}.json`);
  const fallback = path.join(DATA_DIR, "gmail-token.json");
  const tokPath = fs.existsSync(tokenPath) ? tokenPath : (sender === "isaac" && fs.existsSync(fallback) ? fallback : null);
  if (!fs.existsSync(credsPath) || !tokPath) return null;
  const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
  const { client_id, client_secret } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret);
  auth.setCredentials(JSON.parse(fs.readFileSync(tokPath, "utf-8")));
  return google.gmail({ version: "v1", auth });
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findPart(parts: any[], mime: string): any {
  for (const p of parts) {
    if (p.mimeType === mime) return p;
    if (p.parts) { const f = findPart(p.parts, mime); if (f) return f; }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(msg: any): string {
  const payload = msg.payload;
  if (!payload) return msg.snippet || "";
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    const plain = findPart(payload.parts, "text/plain");
    if (plain?.body?.data) return decodeBase64Url(plain.body.data);
    const html = findPart(payload.parts, "text/html");
    if (html?.body?.data) {
      return decodeBase64Url(html.body.data)
        .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n")
        .replace(/<\/div>/gi, "\n").replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/\n{3,}/g, "\n\n").trim();
    }
  }
  return msg.snippet || "";
}

async function main() {
  const db = new Database(DB_PATH);

  const missing = db.prepare(`
    SELECT e.id, e.message_id, e.subject, p.email as prospect_email, p.sent_by
    FROM emails e JOIN prospects p ON p.id = e.prospect_id
    WHERE e.body IS NULL AND e.status = 'sent'
  `).all() as Array<{ id: number; message_id: string; subject: string; prospect_email: string; sent_by: string }>;

  console.log(`Found ${missing.length} emails without bodies`);

  const update = db.prepare("UPDATE emails SET body = ? WHERE id = ?");

  const bySender = new Map<string, typeof missing>();
  for (const m of missing) {
    const list = bySender.get(m.sent_by) || [];
    list.push(m);
    bySender.set(m.sent_by, list);
  }

  let filled = 0;

  for (const [sender, emails] of bySender) {
    const gmail = getGmailClient(sender);
    if (!gmail) {
      console.log(`  No Gmail client for ${sender}, skipping ${emails.length} emails`);
      continue;
    }
    console.log(`  Checking ${sender}'s sent folder for ${emails.length} emails...`);

    for (const email of emails) {
      try {
        const query = `to:${email.prospect_email} subject:"${email.subject.replace(/"/g, '')}" in:sent`;
        const res = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 1 });

        if (!res.data.messages || res.data.messages.length === 0) continue;

        const full = await gmail.users.messages.get({
          userId: "me", id: res.data.messages[0].id!, format: "full"
        });

        const body = extractBody(full.data);
        if (body && body.length > 20) {
          update.run(body, email.id);
          filled++;
          console.log(`    + ${email.prospect_email} — ${email.subject.substring(0, 50)}`);
        }
      } catch (err: unknown) {
        const error = err as { message?: string };
        console.log(`    x ${email.prospect_email}: ${error.message}`);
      }
    }
  }

  console.log(`\nFilled ${filled} email bodies from Gmail`);
  db.close();
}

main().catch(console.error);
