import { NextRequest, NextResponse } from "next/server";
import { insertEmailEvent, getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
  };
}

const SKIP_EMAILS = ["isaac@twenty1-media.com", "asher@twenty1-media.com"];

function extractSenderName(from: string): string {
  // "Isaac Walden <isaac@twenty1-media.com>" -> "isaac"
  const email = from.match(/<([^>]+)>/)?.[1] || from;
  const local = email.split("@")[0].toLowerCase();
  return local;
}

function detectVertical(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("gun") || lower.includes("ffl") || lower.includes("firearm") || lower.includes("arms") || lower.includes("tactical"))
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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ResendWebhookPayload;
  const { type, data } = body;

  if (!type || !data?.email_id) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  // Store the event in email_events table
  for (const recipient of data.to || [""]) {
    insertEmailEvent({
      email_id: data.email_id,
      event_type: type,
      recipient,
      subject: data.subject,
      sender: data.from,
      raw_data: JSON.stringify(body),
    });
  }

  const db = getDb();

  // On ANY event — ensure the email is logged in the emails table and prospect exists
  // This catches emails sent from any source (Claude, Resend dashboard, API, etc.)
  const sender = extractSenderName(data.from);
  const sentDate = data.created_at ? data.created_at.split("T")[0] : new Date().toISOString().split("T")[0];
  const isFollowup = data.subject?.startsWith("Re:") || data.subject?.startsWith("re:");

  for (const recipient of data.to || []) {
    // Skip internal emails
    if (SKIP_EMAILS.includes(recipient.toLowerCase())) continue;

    // Check if already logged (e.g. sent from compose form or earlier webhook)
    const existing = db.prepare("SELECT id FROM emails WHERE message_id = ?").get(data.email_id);
    if (existing) continue;

    // Find or create prospect
    let prospectId: number | null = null;
    const prospect = db.prepare("SELECT id FROM prospects WHERE email = ?").get(recipient.toLowerCase()) as { id: number } | undefined;

    if (prospect) {
      prospectId = prospect.id;
    } else {
      const vertical = detectVertical(data.subject || "");
      const bizName = (data.subject || "Unknown")
        .replace(/^Re:\s*/i, "")
        .split("—")[0].split("–")[0].trim().substring(0, 80);

      db.prepare(`
        INSERT OR IGNORE INTO prospects (business_name, email, vertical, status, sent_by, price_estimate)
        VALUES (?, ?, ?, 'prospected', ?, ?)
      `).run(bizName, recipient.toLowerCase(), vertical, sender, estimatePrice(vertical));

      const newProspect = db.prepare("SELECT id FROM prospects WHERE email = ?").get(recipient.toLowerCase()) as { id: number } | undefined;
      prospectId = newProspect?.id || null;
    }

    // Insert into emails table
    const followupDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    db.prepare(`
      INSERT INTO emails (prospect_id, type, subject, body, batch_name, batch_date, message_id, followup_date, sent_by, status, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)
    `).run(
      prospectId,
      isFollowup ? "followup" : "cold",
      data.subject,
      null,
      "resend-webhook",
      sentDate,
      data.email_id,
      isFollowup ? null : followupDate,
      sender,
      sentDate,
    );

    // Update prospect status for follow-ups
    if (isFollowup && prospectId) {
      db.prepare("UPDATE prospects SET status = 'followed_up', updated_at = datetime('now') WHERE id = ? AND status = 'prospected'").run(prospectId);
    }
  }

  // Handle bounce/complaint — update prospect status and add to DNC
  if (type === "email.bounced" || type === "email.complained") {
    for (const recipient of data.to || []) {
      const reason = type === "email.bounced" ? "email bounced" : "spam complaint";
      db.prepare("INSERT OR IGNORE INTO do_not_contact (email, reason) VALUES (?, ?)").run(recipient, reason);
      db.prepare("UPDATE prospects SET status = 'do_not_contact', updated_at = datetime('now') WHERE email = ? AND status NOT IN ('closed_won')").run(recipient);
    }
  }

  return NextResponse.json({ received: true });
}
