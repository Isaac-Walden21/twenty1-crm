/**
 * Sync Sent Emails
 *
 * Pulls sent emails from Gmail for all senders and imports any
 * that aren't already tracked in the CRM. Creates prospect records
 * if they don't exist.
 *
 * Run: npm run sync-sent
 */

import { google, gmail_v1 } from "googleapis";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "crm.sqlite");
const SENDERS = ["isaac", "asher"];

// Emails to skip (internal, not prospects)
const SKIP_EMAILS = ["isaac@twenty1-media.com", "asher@twenty1-media.com"];

function getGmailClient(sender: string) {
  const credsPath = path.join(DATA_DIR, "gmail-credentials.json");
  const tokenPath = path.join(DATA_DIR, `gmail-token-${sender}.json`);
  const fallback = path.join(DATA_DIR, "gmail-token.json");
  const tokPath = fs.existsSync(tokenPath) ? tokenPath : (sender === "isaac" && fs.existsSync(fallback) ? fallback : null);
  if (!fs.existsSync(credsPath) || !tokPath) return null;
  const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
  const { client_id, client_secret } = creds.installed || creds.web;
  const auth = new google.auth.OAuth2(client_id, client_secret);
  const tokens = JSON.parse(fs.readFileSync(tokPath, "utf-8"));
  auth.setCredentials(tokens);
  auth.on("tokens", (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    fs.writeFileSync(tokPath, JSON.stringify(merged, null, 2));
  });
  return google.gmail({ version: "v1", auth });
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function findPart(parts: gmail_v1.Schema$MessagePart[], mime: string): gmail_v1.Schema$MessagePart | null {
  for (const p of parts) {
    if (p.mimeType === mime) return p;
    if (p.parts) { const f = findPart(p.parts, mime); if (f) return f; }
  }
  return null;
}

function extractBody(msg: gmail_v1.Schema$Message): string {
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
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, "\n\n").trim();
    }
  }
  return msg.snippet || "";
}

function getHeader(msg: gmail_v1.Schema$Message, name: string): string | null {
  return msg.payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || null;
}

function extractEmail(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/) || headerValue.match(/(\S+@\S+)/);
  return match ? match[1].toLowerCase().trim() : headerValue.toLowerCase().trim();
}

function detectVertical(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("gun") || lower.includes("ffl") || lower.includes("firearm") || lower.includes("arms") || lower.includes("range") || lower.includes("tactical"))
    return "Firearms/FFL";
  if (lower.includes("therapy") || lower.includes("family service") || lower.includes("healthcare") || lower.includes("counseling"))
    return "Family Services";
  if (lower.includes("contractor") || lower.includes("concrete") || lower.includes("landscap") || lower.includes("hvac") || lower.includes("roofing") || lower.includes("plumb") || lower.includes("lawn") || lower.includes("painting"))
    return "Contractors";
  if (lower.includes("motel") || lower.includes("resort") || lower.includes("b&b") || lower.includes("inn") || lower.includes("cabin") || lower.includes("lodge") || lower.includes("lodging") || lower.includes("hotel") || lower.includes("cottage") || lower.includes("booking"))
    return "Hospitality";
  if (lower.includes("farm") || lower.includes("feed") || lower.includes("crop") || lower.includes("co-op") || lower.includes("ag supply") || lower.includes("agriculture"))
    return "Agriculture";
  return "Other";
}

function estimatePrice(vertical: string): number {
  const prices: Record<string, number> = {
    Hospitality: 2500, Contractors: 2000, Agriculture: 2500,
    "Firearms/FFL": 2000, "Family Services": 3000, Other: 2000,
  };
  return prices[vertical] || 2000;
}

async function main() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // Get all known Gmail message IDs to avoid duplicates
  const knownIds = new Set<string>();
  const rows = db.prepare("SELECT message_id FROM emails WHERE message_id IS NOT NULL").all() as Array<{ message_id: string }>;
  for (const r of rows) knownIds.add(r.message_id);

  // Also track known prospect emails
  const knownEmails = new Set<string>();
  const prospectRows = db.prepare("SELECT email FROM prospects WHERE email IS NOT NULL").all() as Array<{ email: string }>;
  for (const r of prospectRows) knownEmails.add(r.email.toLowerCase());

  let newEmails = 0;
  let newProspects = 0;

  for (const sender of SENDERS) {
    const gmail = getGmailClient(sender);
    if (!gmail) {
      console.log(`  No Gmail client for ${sender}, skipping`);
      continue;
    }

    console.log(`\nSyncing ${sender}'s sent folder...`);

    // Get sent emails from the last 14 days
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const afterDate = twoWeeksAgo.toISOString().split("T")[0].replace(/-/g, "/");

    let pageToken: string | undefined;
    let totalChecked = 0;

    do {
      const res = await gmail.users.messages.list({
        userId: "me",
        q: `in:sent after:${afterDate}`,
        maxResults: 50,
        pageToken,
      });

      if (!res.data.messages) break;

      for (const msgRef of res.data.messages) {
        if (knownIds.has(msgRef.id!)) continue;

        const full = await gmail.users.messages.get({
          userId: "me",
          id: msgRef.id!,
          format: "full",
        });

        const to = getHeader(full.data, "To");
        const subject = getHeader(full.data, "Subject");
        const date = getHeader(full.data, "Date");
        if (!to || !subject) continue;

        const toEmail = extractEmail(to);

        // Skip internal emails
        if (SKIP_EMAILS.includes(toEmail)) continue;
        // Skip emails that look like internal/system
        if (toEmail.includes("noreply") || toEmail.includes("no-reply")) continue;

        totalChecked++;

        // Already tracked by Gmail ID
        if (knownIds.has(msgRef.id!)) continue;

        const body = extractBody(full.data);
        const sentDate = date ? new Date(date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        const isFollowup = subject.startsWith("Re:") || subject.startsWith("re:");
        const type = isFollowup ? "followup" : "cold";

        // Create prospect if new
        let prospectId: number | null = null;
        if (!knownEmails.has(toEmail)) {
          const vertical = detectVertical(subject + " " + body);
          db.prepare(`
            INSERT OR IGNORE INTO prospects (business_name, email, vertical, status, sent_by, price_estimate)
            VALUES (?, ?, ?, 'prospected', ?, ?)
          `).run(
            subject.replace(/^Re:\s*/i, "").split("—")[0].split("–")[0].trim().substring(0, 80),
            toEmail,
            vertical,
            sender,
            estimatePrice(vertical),
          );
          knownEmails.add(toEmail);
          newProspects++;

          const row = db.prepare("SELECT id FROM prospects WHERE email = ?").get(toEmail) as { id: number } | undefined;
          prospectId = row?.id || null;
        } else {
          const row = db.prepare("SELECT id FROM prospects WHERE email = ?").get(toEmail) as { id: number } | undefined;
          prospectId = row?.id || null;
        }

        // Insert email
        const followupDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        db.prepare(`
          INSERT INTO emails (prospect_id, type, subject, body, batch_name, batch_date, message_id, followup_date, sent_by, status, sent_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)
        `).run(
          prospectId,
          type,
          subject,
          body,
          `gmail-sync-${sender}`,
          sentDate,
          msgRef.id,
          isFollowup ? null : followupDate,
          sender,
          sentDate,
        );

        knownIds.add(msgRef.id!);
        newEmails++;
        console.log(`  + ${toEmail} — ${subject.substring(0, 60)}`);

        // Update prospect status for follow-ups
        if (isFollowup && prospectId) {
          db.prepare("UPDATE prospects SET status = 'followed_up', updated_at = datetime('now') WHERE id = ? AND status = 'prospected'").run(prospectId);
        }
      }

      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);

    console.log(`  Checked ${totalChecked} emails from ${sender}`);
  }

  console.log(`\n--- Sync Complete ---`);
  console.log(`New prospects: ${newProspects}`);
  console.log(`New emails: ${newEmails}`);

  db.close();
}

main().catch(console.error);
