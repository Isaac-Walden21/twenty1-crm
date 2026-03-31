/**
 * Gmail Response Checker
 *
 * Checks Gmail for replies to tracked outreach emails.
 * When a reply is found:
 *   - Moves the prospect to "active_lead" (if currently prospected/followed_up)
 *   - Logs the response in the responses table
 *
 * Run manually:  npm run check-responses
 * Run on cron:   Add to openclaw heartbeat or system crontab
 */

import { google, gmail_v1 } from "googleapis";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "crm.sqlite");
const CREDENTIALS_PATH = path.join(DATA_DIR, "gmail-credentials.json");
const LAST_CHECK_PATH = path.join(DATA_DIR, "last-response-check.json");

const SENDERS = ["isaac", "asher"];

// --- Gmail Auth (multi-account) ---

function getGmailClient(sender: string): gmail_v1.Gmail | null {
  const tokenPath = path.join(DATA_DIR, `gmail-token-${sender}.json`);
  // Fallback to default token for backwards compat
  const fallbackPath = path.join(DATA_DIR, "gmail-token.json");
  const tokPath = fs.existsSync(tokenPath) ? tokenPath : (sender === "isaac" && fs.existsSync(fallbackPath) ? fallbackPath : null);

  if (!fs.existsSync(CREDENTIALS_PATH) || !tokPath) {
    return null;
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);

  const tokens = JSON.parse(fs.readFileSync(tokPath, "utf-8"));
  oauth2Client.setCredentials(tokens);

  oauth2Client.on("tokens", (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    fs.writeFileSync(tokPath, JSON.stringify(merged, null, 2));
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

// --- Database ---

function getDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

interface TrackedEmail {
  email_id: number;
  prospect_id: number;
  prospect_email: string;
  message_id: string;
  business_name: string;
  prospect_status: string;
  sent_by: string;
}

function getTrackedEmails(db: Database.Database): TrackedEmail[] {
  return db.prepare(`
    SELECT
      e.id as email_id,
      e.prospect_id,
      p.email as prospect_email,
      e.message_id,
      p.business_name,
      p.status as prospect_status,
      p.sent_by
    FROM emails e
    JOIN prospects p ON p.id = e.prospect_id
    WHERE e.message_id IS NOT NULL
      AND e.status = 'sent'
      AND p.status NOT IN ('closed_won', 'closed_lost', 'do_not_contact')
  `).all() as TrackedEmail[];
}

function isAlreadyLogged(db: Database.Database, gmailId: string): boolean {
  const row = db.prepare("SELECT 1 FROM responses WHERE gmail_id = ?").get(gmailId);
  return !!row;
}

function logResponse(
  db: Database.Database,
  prospectId: number,
  emailId: number,
  gmailId: string,
  responseType: string,
  subject: string,
  body: string,
  summary: string,
  fromEmail: string,
  receivedAt: string
) {
  db.prepare(`
    INSERT OR IGNORE INTO responses (prospect_id, email_id, gmail_id, response_type, subject, body, summary, from_email, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(prospectId, emailId, gmailId, responseType, subject, body, summary, fromEmail, receivedAt);
}

function promoteProspect(db: Database.Database, prospectId: number, currentStatus: string) {
  // Only auto-promote if they're in an early stage
  const promotable = ["prospected", "followed_up"];
  if (promotable.includes(currentStatus)) {
    db.prepare("UPDATE prospects SET status = 'active_lead', updated_at = datetime('now') WHERE id = ?").run(prospectId);
    return true;
  }
  return false;
}

// --- Gmail Search ---

async function findReplies(gmail: gmail_v1.Gmail, fromEmail: string, afterDate?: string): Promise<gmail_v1.Schema$Message[]> {
  // Search for emails FROM this prospect's address (they replied to us)
  let query = `from:${fromEmail}`;
  if (afterDate) {
    query += ` after:${afterDate}`;
  }

  try {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 10,
    });

    if (!res.data.messages || res.data.messages.length === 0) {
      return [];
    }

    // Fetch full message details with body
    const messages: gmail_v1.Schema$Message[] = [];
    for (const msg of res.data.messages) {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });
      messages.push(full.data);
    }

    return messages;
  } catch (err: unknown) {
    const error = err as { message?: string };
    console.error(`  Error searching for replies from ${fromEmail}:`, error.message);
    return [];
  }
}

function getHeader(msg: gmail_v1.Schema$Message, name: string): string | null {
  const header = msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || null;
}

function extractSnippet(msg: gmail_v1.Schema$Message): string {
  return msg.snippet || "(no preview available)";
}

function extractBody(msg: gmail_v1.Schema$Message): string {
  // Try to get plain text body from the message payload
  const payload = msg.payload;
  if (!payload) return msg.snippet || "";

  // Simple single-part message
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart message — look for text/plain first, then text/html
  if (payload.parts) {
    // Check top-level parts
    const plainPart = findPart(payload.parts, "text/plain");
    if (plainPart?.body?.data) {
      return decodeBase64Url(plainPart.body.data);
    }

    const htmlPart = findPart(payload.parts, "text/html");
    if (htmlPart?.body?.data) {
      return stripHtml(decodeBase64Url(htmlPart.body.data));
    }
  }

  return msg.snippet || "";
}

function findPart(parts: gmail_v1.Schema$MessagePart[], mimeType: string): gmail_v1.Schema$MessagePart | null {
  for (const part of parts) {
    if (part.mimeType === mimeType) return part;
    // Recurse into nested multipart
    if (part.parts) {
      const found = findPart(part.parts, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// --- Main ---

async function main() {
  const db = getDb();

  // Load last check timestamp
  let lastCheck: string | null = null;
  if (fs.existsSync(LAST_CHECK_PATH)) {
    const data = JSON.parse(fs.readFileSync(LAST_CHECK_PATH, "utf-8"));
    lastCheck = data.lastCheck;
  }

  const afterDate = lastCheck
    ? new Date(lastCheck).toISOString().split("T")[0].replace(/-/g, "/")
    : undefined;

  const tracked = getTrackedEmails(db);
  console.log(`Checking ${tracked.length} tracked emails for replies...`);
  if (afterDate) {
    console.log(`Looking for replies after ${afterDate}`);
  }

  // Group by prospect email AND sender
  const byProspectEmail = new Map<string, TrackedEmail[]>();
  for (const t of tracked) {
    const existing = byProspectEmail.get(t.prospect_email) || [];
    existing.push(t);
    byProspectEmail.set(t.prospect_email, existing);
  }

  // Build Gmail clients for each sender
  const gmailClients = new Map<string, gmail_v1.Gmail>();
  for (const sender of SENDERS) {
    const client = getGmailClient(sender);
    if (client) {
      gmailClients.set(sender, client);
      console.log(`  Gmail connected for: ${sender}`);
    }
  }

  if (gmailClients.size === 0) {
    console.error("No Gmail accounts configured. Run: npx tsx scripts/gmail-setup.ts <sender>");
    db.close();
    return;
  }

  let newResponses = 0;
  let promoted = 0;

  for (const [prospectEmail, emails] of byProspectEmail) {
    // Use the Gmail client for this prospect's sender
    const senderName = emails[0].sent_by || "isaac";
    const gmail = gmailClients.get(senderName) || gmailClients.values().next().value;
    if (!gmail) continue;

    const replies = await findReplies(gmail, prospectEmail, afterDate);

    if (replies.length === 0) continue;

    console.log(`\n  ${emails[0].business_name} (${prospectEmail}): ${replies.length} reply(ies) found`);

    for (const reply of replies) {
      const gmailId = reply.id;
      if (!gmailId) continue;

      // Skip if already logged (by gmail message ID)
      if (isAlreadyLogged(db, gmailId)) continue;

      const subject = getHeader(reply, "Subject") || "(no subject)";
      const fromHeader = getHeader(reply, "From") || prospectEmail;
      const date = getHeader(reply, "Date") || new Date().toISOString();
      const snippet = extractSnippet(reply);
      const body = extractBody(reply);
      const inReplyTo = getHeader(reply, "In-Reply-To");
      const references = getHeader(reply, "References");

      // Find which tracked email this is a reply to
      let matchedEmail = emails[0]; // default to first
      if (inReplyTo || references) {
        const refText = (inReplyTo || "") + " " + (references || "");
        for (const e of emails) {
          if (e.message_id && refText.includes(e.message_id)) {
            matchedEmail = e;
            break;
          }
        }
      }

      // Detect response type from body content
      let responseType = "reply";
      const lowerBody = (body || snippet).toLowerCase();
      if (lowerBody.includes("unsubscribe") || lowerBody.includes("remove me") || lowerBody.includes("stop emailing")) {
        responseType = "unsubscribe";
      } else if (lowerBody.includes("not interested") || lowerBody.includes("no thank") || lowerBody.includes("not looking")) {
        responseType = "not_interested";
      } else if (lowerBody.includes("interested") || lowerBody.includes("give me a call") || lowerBody.includes("schedule") || lowerBody.includes("tell me more") || lowerBody.includes("love to") || lowerBody.includes("let's talk") || lowerBody.includes("sounds good")) {
        responseType = "interested";
      }

      // Log the response with full body
      const receivedAt = new Date(date).toISOString().split("T")[0];
      logResponse(
        db,
        matchedEmail.prospect_id,
        matchedEmail.email_id,
        gmailId,
        responseType,
        subject,
        body,
        snippet,
        fromHeader,
        receivedAt
      );
      newResponses++;

      console.log(`    -> ${responseType}: "${snippet.substring(0, 80)}..."`);

      // Auto-promote based on response type
      if (responseType === "interested" || responseType === "reply") {
        if (promoteProspect(db, matchedEmail.prospect_id, matchedEmail.prospect_status)) {
          promoted++;
          console.log(`    -> Promoted to active_lead`);
        }
      } else if (responseType === "unsubscribe") {
        db.prepare("UPDATE prospects SET status = 'do_not_contact', updated_at = datetime('now') WHERE id = ?").run(matchedEmail.prospect_id);
        db.prepare("INSERT OR IGNORE INTO do_not_contact (email, reason) VALUES (?, ?)").run(prospectEmail, "Requested removal");
        console.log(`    -> Moved to DNC`);
      } else if (responseType === "not_interested") {
        db.prepare("UPDATE prospects SET status = 'closed_lost', updated_at = datetime('now') WHERE id = ?").run(matchedEmail.prospect_id);
        console.log(`    -> Marked as closed_lost`);
      }
    }
  }

  // Save last check timestamp
  fs.writeFileSync(LAST_CHECK_PATH, JSON.stringify({ lastCheck: new Date().toISOString() }));

  console.log(`\n--- Response Check Complete ---`);
  console.log(`New responses found: ${newResponses}`);
  console.log(`Prospects promoted: ${promoted}`);

  db.close();
}

main().catch(console.error);
