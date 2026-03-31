import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const OUTREACH_DIR = path.join(
  process.env.HOME || "/Users/cleetus",
  ".openclaw/workspace/twenty1-outreach"
);
const DB_PATH = path.join(process.cwd(), "data", "crm.sqlite");

// Ensure data dir exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT NOT NULL,
    city TEXT,
    state TEXT,
    contact_name TEXT,
    email TEXT,
    phone TEXT,
    vertical TEXT,
    status TEXT DEFAULT 'prospected',
    sent_by TEXT DEFAULT 'isaac',
    website_notes TEXT,
    notes TEXT,
    price_estimate REAL,
    sale_price REAL,
    closed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(email)
  );

  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id INTEGER REFERENCES prospects(id),
    type TEXT DEFAULT 'cold',
    subject TEXT,
    body TEXT,
    batch_name TEXT,
    batch_date TEXT,
    message_id TEXT,
    followup_date TEXT,
    sent_by TEXT DEFAULT 'isaac',
    status TEXT DEFAULT 'drafted',
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id INTEGER REFERENCES prospects(id),
    email_id INTEGER REFERENCES emails(id),
    gmail_id TEXT UNIQUE,
    response_type TEXT,
    subject TEXT,
    body TEXT,
    summary TEXT,
    from_email TEXT,
    received_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS token_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    task_type TEXT,
    model TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS do_not_contact (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    reason TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// --- Parsing helpers ---

function detectVertical(text: string): string {
  const lower = text.toLowerCase();
  // Check more specific patterns first to avoid false matches
  if (lower.includes("gun") || lower.includes("ffl") || lower.includes("firearm") || lower.includes("arms") || lower.includes("range"))
    return "Firearms/FFL";
  if (lower.includes("therapy") || lower.includes("family service") || lower.includes("healthcare") || lower.includes("counseling"))
    return "Family Services";
  if (lower.includes("contractor") || lower.includes("concrete") || lower.includes("landscap") || lower.includes("hvac") || lower.includes("roofing") || lower.includes("plumb") || lower.includes("lawn"))
    return "Contractors";
  if (lower.includes("hospitality") || lower.includes("motel") || lower.includes("resort") || lower.includes("b&b") || lower.includes("inn") || lower.includes("cabin") || lower.includes("lodge") || lower.includes("lodging"))
    return "Hospitality";
  if (lower.includes("farm") || lower.includes("feed") || lower.includes("crop") || lower.includes("co-op") || lower.includes("ag supply") || lower.includes("agriculture"))
    return "Agriculture";
  return "Other";
}

function detectState(text: string): string | null {
  const statePatterns: [string, string[]][] = [
    ["MI", [", MI", "Michigan"]],
    ["IN", [", IN", "Indiana"]],
    ["TX", [", TX", "Texas"]],
    ["MS", [", MS", "Mississippi"]],
    ["AL", [", AL", "Alabama"]],
    ["AR", [", AR", "Arkansas"]],
    ["TN", [", TN", "Tennessee"]],
    ["OH", [", OH", "Ohio"]],
  ];
  for (const [state, patterns] of statePatterns) {
    if (patterns.some((p) => text.includes(p))) return state;
  }
  return null;
}

function extractCity(locationStr: string): string | null {
  // Matches "City, ST" or "(City, ST)"
  const match = locationStr.match(/\(?\s*([^,(]+),\s*(?:MI|IN|OH|TX|MS|AL|AR|TN)\s*\)?/);
  return match ? match[1].trim() : null;
}

function estimatePrice(vertical: string): number {
  const prices: Record<string, number> = {
    Hospitality: 2500,
    Contractors: 2000,
    Agriculture: 2500,
    "Firearms/FFL": 2000,
    "Family Services": 3000,
    Other: 2000,
  };
  return prices[vertical] || 2000;
}

// --- Parse sent-log.md ---

function parseSentLog() {
  const content = fs.readFileSync(path.join(OUTREACH_DIR, "sent-log.md"), "utf-8");
  const lines = content.split("\n");

  let currentBatch = "";
  let currentDate = "";
  let currentVertical = "";
  let currentSender = "isaac";
  const prospects: Array<{
    business_name: string;
    city: string | null;
    state: string | null;
    contact_name: string | null;
    email: string;
    vertical: string;
    subject: string;
    message_id: string | null;
    followup_date: string | null;
    batch_name: string;
    batch_date: string;
    sent_by: string;
    status: string;
  }> = [];

  const dncEntries: Array<{ email: string; reason: string }> = [];

  for (const line of lines) {
    // Detect batch headers — handles "Batch N" and named batches like "Asher Batch"
    const batchMatch = line.match(/^## ((?:\w+\s+)?Batch\s*\d*)\s*[—–-]\s*(\d{4}-\d{2}-\d{2})\s*(.*)?/i);
    if (batchMatch) {
      currentBatch = batchMatch[1].trim();
      currentDate = batchMatch[2];
      const rest = batchMatch[3] || "";
      currentVertical = detectVertical(rest || currentBatch);
      // Detect sender from batch name — named batches like "Asher Batch" = asher
      const senderMatch = currentBatch.match(/^(\w+)\s+Batch/i);
      if (senderMatch && senderMatch[1].toLowerCase() !== "batch") {
        currentSender = senderMatch[1].toLowerCase();
      } else {
        currentSender = "isaac";
      }
      continue;
    }

    // DNC entries
    if (line.startsWith("- ") && line.includes("DO NOT") === false && content.indexOf(line) > content.indexOf("DO NOT CONTACT")) {
      const dncMatch = line.match(/- (\S+@\S+)\s+\(([^)]+)\)\s*[—–-]\s*(.*)/);
      if (dncMatch) {
        dncEntries.push({ email: dncMatch[1], reason: dncMatch[3] });
      }
    }

    // Table rows with prospect data — handle both 7-col (with Msg ID) and 6-col formats
    // Row numbers can be numeric (1, 2) or alphanumeric (A1, A2)
    // 7-col: | # | Business | Contact | Email | Subject | Msg ID | Follow-up |
    // 6-col: | # | Business | Contact | Email | Subject | Follow-up |
    const tableMatch7 = line.match(
      /^\|\s*[A-Z]?\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\S+@\S+)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*(\d{4}-\d{2}-\d{2})?\s*\|/
    );
    const tableMatch6 = !tableMatch7 && line.match(
      /^\|\s*[A-Z]?\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(\S+@\S+)\s*\|\s*(.+?)\s*\|\s*(\d{4}-\d{2}-\d{2})?\s*\|/
    );
    const tableMatch = tableMatch7 || tableMatch6;
    if (tableMatch) {
      const businessRaw = tableMatch[1].trim();
      const contactRaw = tableMatch[2].trim();
      const email = tableMatch[3].trim();
      const subject = tableMatch[4].trim();
      let messageId: string | null = null;
      let followupDate: string | null = null;
      if (tableMatch7) {
        messageId = tableMatch[5]?.trim() || null;
        followupDate = tableMatch[6]?.trim() || null;
      } else {
        followupDate = tableMatch[5]?.trim() || null;
      }

      const city = extractCity(businessRaw);
      const state = detectState(businessRaw);
      const businessName = businessRaw.replace(/\s*\([^)]+\)\s*$/, "").trim();
      const contactName = contactRaw === "Unknown" || contactRaw === "Owner (unknown name)" ? null : contactRaw;
      // Detect from business-specific text first, fall back to batch vertical
      let vertical = detectVertical(businessRaw + " " + subject);
      if (vertical === "Other" && currentVertical) {
        vertical = currentVertical;
      }

      prospects.push({
        business_name: businessName,
        city,
        state,
        contact_name: contactName,
        email,
        vertical,
        subject,
        message_id: messageId,
        followup_date: followupDate,
        batch_name: currentBatch,
        batch_date: currentDate,
        sent_by: currentSender,
        status: "sent",
      });
    }
  }

  return { prospects, dncEntries };
}

// --- Parse batch files for email bodies ---
// Handles 4 formats:
//   Format A: "## Email N:" with **To:** and **Body:** (batch1-ready-to-send)
//   Format B: "### Draft N" with **To:** and --- delimiters (batch-2026-03-25)
//   Format C: "## Prospect N:" with - **Email:** and Body: text (batch-2026-03-26)
//   Format D: "## N. Business" with **Email:** and --- delimiters (batch-2026-03-27)

function parseBatchFile(filepath: string): Map<string, string> {
  const content = fs.readFileSync(filepath, "utf-8");
  const emailBodies = new Map<string, string>();

  // Try all email patterns across the entire file
  // Strategy: split into sections by any ## or ### header, then extract email + body from each

  // Split by markdown headers (## or ###)
  const sections = content.split(/^(?=##\s)/m);

  for (const section of sections) {
    // Find email address — try multiple patterns
    let email: string | null = null;

    // Pattern: **To:** email
    const toMatch = section.match(/\*\*To:\*\*\s*(\S+@\S+)/i);
    // Pattern: - **Email:** email
    const listEmailMatch = section.match(/-\s*\*\*Email:\*\*\s*(\S+@\S+)/i);
    // Pattern: **Email:** email (non-list)
    const boldEmailMatch = section.match(/\*\*Email:\*\*\s*(\S+@\S+)/i);

    email = (toMatch?.[1] || listEmailMatch?.[1] || boldEmailMatch?.[1])?.trim() || null;
    if (!email) continue;

    // Find body — try multiple patterns
    let body: string | null = null;

    // Pattern A: "- **Body:**\n\n" followed by content until "---"
    const bodyFieldMatch = section.match(/\*\*Body:\*\*\s*\n\n([\s\S]*?)(?:\n---|\n##|$)/);
    if (bodyFieldMatch) {
      body = bodyFieldMatch[1].trim();
    }

    // Pattern B: "---\n\n" body content "\n\n---" (after Subject line)
    if (!body) {
      const dashDelimited = section.match(/\*\*Subject:\*\*.*?\n\n---\n\n([\s\S]*?)(?:\n---|\n##|$)/);
      if (dashDelimited) {
        body = dashDelimited[1].trim();
      }
    }

    // Pattern C: Subject line followed by --- then body (format D: ## N. Business)
    if (!body) {
      const subjectDash = section.match(/\*\*Subject:\*\*[^\n]*\n\n---\n\n([\s\S]*?)(?:\n---|\n##|$)/);
      if (subjectDash) {
        body = subjectDash[1].trim();
      }
    }

    // Pattern D: "Body:" plain text (contractor format)
    if (!body) {
      const plainBody = section.match(/\nBody:\s*([\s\S]*?)(?:\n---|\n##|$)/);
      if (plainBody) {
        body = plainBody[1].trim();
      }
    }

    // Pattern E: After Subject: line, body is everything after next blank line until --- or ##
    if (!body) {
      const afterSubject = section.match(/Subject:.*?\n\n([\s\S]*?)(?:\n---|\n##|$)/);
      if (afterSubject) {
        // Skip if it's just metadata
        const candidate = afterSubject[1].trim();
        if (candidate.length > 50 && !candidate.startsWith("- **")) {
          body = candidate;
        }
      }
    }

    if (body && body.length > 20) {
      emailBodies.set(email.toLowerCase(), body);
    }
  }

  return emailBodies;
}

// --- Main ingestion ---

console.log("Starting data ingestion...");
console.log(`Reading from: ${OUTREACH_DIR}`);

// Preserve manually-set statuses, notes, sale_price, and closed_at before wiping
const preservedStatuses = new Map<string, { status: string; notes: string | null; sale_price: number | null; closed_at: string | null }>();
try {
  const existing = db.prepare(
    "SELECT email, status, notes, sale_price, closed_at FROM prospects WHERE status NOT IN ('prospected', 'followed_up') OR notes IS NOT NULL OR sale_price IS NOT NULL"
  ).all() as Array<{ email: string; status: string; notes: string | null; sale_price: number | null; closed_at: string | null }>;
  for (const row of existing) {
    preservedStatuses.set(row.email, { status: row.status, notes: row.notes, sale_price: row.sale_price, closed_at: row.closed_at });
  }
  if (preservedStatuses.size > 0) {
    console.log(`Preserving ${preservedStatuses.size} manual status/notes entries`);
  }
} catch {
  // Table might not exist yet on first run
}

// Preserve responses table (these are from Gmail checker, not from markdown)
// We do NOT delete responses — they accumulate over time

// Clear markdown-derived data for clean import
db.exec("DELETE FROM emails");
db.exec("DELETE FROM do_not_contact");
db.exec("DELETE FROM prospects");

const { prospects, dncEntries } = parseSentLog();
console.log(`Parsed ${prospects.length} prospects from sent-log.md`);
console.log(`Found ${dncEntries.length} DNC entries`);

// Collect email bodies from batch files
const allBodies = new Map<string, string>();
const batchFiles = fs.readdirSync(OUTREACH_DIR).filter((f) => f.startsWith("batch") && f.endsWith(".md"));
for (const bf of batchFiles) {
  const bodies = parseBatchFile(path.join(OUTREACH_DIR, bf));
  for (const [email, body] of bodies) {
    allBodies.set(email, body);
  }
}
console.log(`Extracted ${allBodies.size} email bodies from ${batchFiles.length} batch files`);

// Insert prospects and emails
const insertProspect = db.prepare(`
  INSERT OR IGNORE INTO prospects (business_name, city, state, contact_name, email, vertical, status, sent_by, price_estimate)
  VALUES (@business_name, @city, @state, @contact_name, @email, @vertical, @status, @sent_by, @price_estimate)
`);

const getProspectByEmail = db.prepare("SELECT id FROM prospects WHERE email = ?");

const insertEmail = db.prepare(`
  INSERT INTO emails (prospect_id, type, subject, body, batch_name, batch_date, message_id, followup_date, sent_by, status, sent_at)
  VALUES (@prospect_id, @type, @subject, @body, @batch_name, @batch_date, @message_id, @followup_date, @sent_by, @status, @sent_at)
`);

const insertDNC = db.prepare("INSERT OR IGNORE INTO do_not_contact (email, reason) VALUES (?, ?)");

const insertMany = db.transaction(() => {
  for (const p of prospects) {
    const vertical = p.vertical;
    const priceEstimate = estimatePrice(vertical);

    insertProspect.run({
      business_name: p.business_name,
      city: p.city,
      state: p.state,
      contact_name: p.contact_name,
      email: p.email,
      vertical,
      status: "prospected",
      sent_by: p.sent_by,
      price_estimate: priceEstimate,
    });

    const row = getProspectByEmail.get(p.email) as { id: number } | undefined;
    const prospectId = row?.id || null;

    insertEmail.run({
      prospect_id: prospectId,
      type: "cold",
      subject: p.subject,
      body: allBodies.get(p.email.toLowerCase()) || allBodies.get(p.email) || null,
      batch_name: p.batch_name,
      batch_date: p.batch_date,
      message_id: p.message_id,
      followup_date: p.followup_date,
      sent_by: p.sent_by,
      status: "sent",
      sent_at: p.batch_date,
    });
  }

  // Mark active leads
  db.prepare("UPDATE prospects SET status = 'active_lead' WHERE email = 'abovethebridgeoutdoors@gmail.com'").run();

  // Insert DNC entries
  for (const dnc of dncEntries) {
    insertDNC.run(dnc.email, dnc.reason);
  }
});

insertMany();

// Restore manually-set statuses and notes
if (preservedStatuses.size > 0) {
  const restoreStatus = db.prepare(
    "UPDATE prospects SET status = ?, notes = ?, sale_price = ?, closed_at = ?, updated_at = datetime('now') WHERE email = ?"
  );
  let restored = 0;
  for (const [email, { status, notes, sale_price, closed_at }] of preservedStatuses) {
    const result = restoreStatus.run(status, notes, sale_price, closed_at, email);
    if (result.changes > 0) restored++;
  }
  console.log(`Restored ${restored} manual status/notes/revenue entries`);
}

// Parse and insert follow-up emails
const followupFiles = fs.readdirSync(OUTREACH_DIR).filter((f) => f.startsWith("followup") && f.endsWith(".md"));
for (const ff of followupFiles) {
  const content = fs.readFileSync(path.join(OUTREACH_DIR, ff), "utf-8");
  const dateMatch = ff.match(/(\d{4}-\d{2}-\d{2})/);
  const followupDate = dateMatch ? dateMatch[1] : null;

  // Parse each follow-up section
  const sections = content.split(/^### Follow-Up \d+/m);
  for (const section of sections) {
    const toMatch = section.match(/\*\*To:\*\*\s*(\S+@\S+)/);
    const subjectMatch = section.match(/\*\*Subject:\*\*\s*(.*)/);
    const replyIdMatch = section.match(/\*\*Reply-to-message-id:\*\*\s*(\S+)/);

    if (!toMatch) continue;

    const email = toMatch[1].trim();
    const subject = subjectMatch ? subjectMatch[1].trim() : null;

    // Extract body
    const bodyMatch = section.match(/---\n\n([\s\S]*?)(?:\n---|\n###|$)/);
    const body = bodyMatch ? bodyMatch[1].trim() : null;

    const row = getProspectByEmail.get(email) as { id: number; sent_by: string } | undefined;
    if (row) {
      // Look up the sender from the prospect record
      const prospectRow = db.prepare("SELECT sent_by FROM prospects WHERE id = ?").get(row.id) as { sent_by: string } | undefined;
      insertEmail.run({
        prospect_id: row.id,
        type: "followup",
        subject,
        body,
        batch_name: `followup-${followupDate}`,
        batch_date: followupDate,
        message_id: replyIdMatch ? replyIdMatch[1] : null,
        followup_date: null,
        sent_by: prospectRow?.sent_by || "isaac",
        status: "drafted",
        sent_at: null,
      });

      // Update prospect status if they've been followed up
      db.prepare("UPDATE prospects SET status = 'followed_up', updated_at = datetime('now') WHERE id = ? AND status = 'prospected'").run(row.id);
    }
  }
}

// Insert some estimated token costs based on batch activity
const batchDates = [...new Set(prospects.map((p) => p.batch_date))].filter(Boolean);
const insertCost = db.prepare(
  "INSERT INTO token_costs (date, task_type, model, input_tokens, output_tokens, cost_usd, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
for (const date of batchDates) {
  const emailCount = prospects.filter((p) => p.batch_date === date).length;
  // Estimated costs: ~2000 input + ~1500 output tokens per email draft
  const inputTokens = emailCount * 2000;
  const outputTokens = emailCount * 1500;
  // Sonnet 4.6 pricing: $3/1M input, $15/1M output
  const cost = (inputTokens * 3 + outputTokens * 15) / 1_000_000;
  insertCost.run(date, "email_drafting", "claude-sonnet-4-6", inputTokens, outputTokens, Math.round(cost * 10000) / 10000, `Drafted ${emailCount} emails`);
}

// Summary
const totalP = (db.prepare("SELECT COUNT(*) as c FROM prospects").get() as { c: number }).c;
const totalE = (db.prepare("SELECT COUNT(*) as c FROM emails").get() as { c: number }).c;
const totalD = (db.prepare("SELECT COUNT(*) as c FROM do_not_contact").get() as { c: number }).c;

console.log("\n--- Ingestion Complete ---");
console.log(`Prospects: ${totalP}`);
console.log(`Emails: ${totalE}`);
console.log(`DNC entries: ${totalD}`);
console.log(`Database: ${DB_PATH}`);

db.close();
