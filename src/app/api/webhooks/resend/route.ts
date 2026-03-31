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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ResendWebhookPayload;
  const { type, data } = body;

  if (!type || !data?.email_id) {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  // Store the event
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

  // Handle bounce/complaint — update prospect status
  if (type === "email.bounced" || type === "email.complained") {
    const db = getDb();
    for (const recipient of data.to || []) {
      const reason = type === "email.bounced" ? "email bounced" : "spam complaint";
      db.prepare("INSERT OR IGNORE INTO do_not_contact (email, reason) VALUES (?, ?)").run(recipient, reason);
      db.prepare("UPDATE prospects SET status = 'do_not_contact', updated_at = datetime('now') WHERE email = ? AND status NOT IN ('closed_won')").run(recipient);
    }
  }

  return NextResponse.json({ received: true });
}
