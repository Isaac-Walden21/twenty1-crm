import { NextRequest, NextResponse } from "next/server";
import { sendEmail, isGmailConfigured } from "@/lib/gmail";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { prospect_id, to, subject, email_body, type = "cold", from } = body;
  const sender = from || "isaac";

  if (!to || !subject || !email_body) {
    return NextResponse.json({ error: "to, subject, and email_body are required" }, { status: 400 });
  }

  if (!isGmailConfigured(sender)) {
    return NextResponse.json({ error: `Gmail not configured for ${sender}. Run: npm run gmail-setup ${sender}` }, { status: 503 });
  }

  try {
    const result = await sendEmail({ to, subject, body: email_body, sender });

    if (!result) {
      return NextResponse.json({ error: "Failed to send" }, { status: 500 });
    }

    const followupDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    await supabase.from("emails").insert({
      prospect_id: prospect_id || null,
      type,
      subject,
      body: email_body,
      batch_name: "dashboard-send",
      batch_date: today,
      message_id: result.messageId,
      followup_date: followupDate,
      sent_by: sender,
      status: "sent",
      sent_at: today,
    });

    if (prospect_id) {
      const { data: prospect } = await supabase
        .from("prospects")
        .select("status")
        .eq("id", prospect_id)
        .single();

      if (prospect && prospect.status === "prospected" && type === "followup") {
        await supabase
          .from("prospects")
          .update({ status: "followed_up", updated_at: new Date().toISOString() })
          .eq("id", prospect_id);
      }
    }

    return NextResponse.json({ success: true, messageId: result.messageId, threadId: result.threadId });
  } catch (err: unknown) {
    const error = err as { message?: string };
    return NextResponse.json({ error: error.message || "Send failed" }, { status: 500 });
  }
}
