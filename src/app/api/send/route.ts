import { NextRequest, NextResponse } from "next/server";
import { sendEmailViaResend } from "@/lib/resend";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prospect_id, to, subject, email_body, type = "cold", from } = body;
  const sender = from || "isaac";

  if (!to || !subject || !email_body) {
    return NextResponse.json({ error: "to, subject, and email_body are required" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 503 });
  }

  try {
    const result = await sendEmailViaResend({ to, subject, body: email_body, sender });

    // Log in database
    const db = getDb();
    const followupDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    db.prepare(`
      INSERT INTO emails (prospect_id, type, subject, body, batch_name, batch_date, message_id, followup_date, sent_by, status, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)
    `).run(
      prospect_id || null,
      type,
      subject,
      email_body,
      "dashboard-send",
      today,
      result.id,
      followupDate,
      from || "isaac",
      today,
    );

    // Update prospect status if needed
    if (prospect_id) {
      const prospect = db.prepare("SELECT status FROM prospects WHERE id = ?").get(prospect_id) as { status: string } | undefined;
      if (prospect && prospect.status === "prospected" && type === "followup") {
        db.prepare("UPDATE prospects SET status = 'followed_up', updated_at = datetime('now') WHERE id = ?").run(prospect_id);
      }
    }

    return NextResponse.json({ success: true, messageId: result.id });
  } catch (err: unknown) {
    const error = err as { message?: string };
    return NextResponse.json({ error: error.message || "Send failed" }, { status: 500 });
  }
}
