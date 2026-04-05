import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabase, logActivity } from "@/lib/db";

const resend = new Resend(process.env.RESEND_API_KEY);

export const dynamic = "force-dynamic";

// Resend webhook events we care about
type ResendEvent = {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    created_at: string;
  };
};

function guessBusinessName(email: string): string {
  const domain = email.split("@")[1]?.split(".")[0] || "";
  if (domain && !["gmail", "yahoo", "hotmail", "outlook", "aol", "icloud", "protonmail", "mail"].includes(domain.toLowerCase())) {
    return domain.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  const local = email.split("@")[0];
  return local.replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function detectVertical(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("gun") || lower.includes("ffl") || lower.includes("firearm") || lower.includes("arms") || lower.includes("range")) return "Firearms/FFL";
  if (lower.includes("therapy") || lower.includes("family service") || lower.includes("healthcare") || lower.includes("counseling")) return "Family Services";
  if (lower.includes("contractor") || lower.includes("concrete") || lower.includes("landscap") || lower.includes("hvac") || lower.includes("roofing") || lower.includes("plumb") || lower.includes("lawn")) return "Contractors";
  if (lower.includes("hospitality") || lower.includes("motel") || lower.includes("resort") || lower.includes("b&b") || lower.includes("inn") || lower.includes("cabin") || lower.includes("lodge")) return "Hospitality";
  if (lower.includes("farm") || lower.includes("feed") || lower.includes("crop") || lower.includes("co-op") || lower.includes("ag supply") || lower.includes("agri")) return "Agriculture";
  return "Other";
}

function extractSender(from: string): string {
  const lower = from.toLowerCase();
  if (lower.includes("isaac")) return "isaac";
  if (lower.includes("asher")) return "asher";
  return "isaac";
}

function estimatePrice(vertical: string): number {
  const prices: Record<string, number> = {
    Hospitality: 2500, Contractors: 2000, Agriculture: 2500,
    "Firearms/FFL": 2000, "Family Services": 3000, Other: 2000,
  };
  return prices[vertical] || 2000;
}

export async function POST(req: NextRequest) {
  try {
    const event = (await req.json()) as ResendEvent;
    const { type, data } = event;

    // Only process email.sent and email.delivered for new records
    // Update status for bounced/complained
    if (!data?.to?.length) {
      return NextResponse.json({ ok: true });
    }

    const recipientEmail = data.to[0];
    const sendDate = data.created_at?.split("T")[0] || new Date().toISOString().split("T")[0];
    const sender = extractSender(data.from || "");

    if (type === "email.sent" || type === "email.delivered") {
      // Upsert prospect
      const vertical = detectVertical((data.subject || "") + " " + recipientEmail);
      const { data: prospect } = await supabase
        .from("prospects")
        .upsert({
          email: recipientEmail,
          business_name: guessBusinessName(recipientEmail),
          vertical,
          sent_by: sender,
          price_estimate: estimatePrice(vertical),
          status: "prospected",
        }, { onConflict: "email", ignoreDuplicates: true })
        .select("id")
        .single();

      // If prospect already existed, just get their id
      let prospectId = prospect?.id;
      if (!prospectId) {
        const { data: existing } = await supabase
          .from("prospects")
          .select("id")
          .eq("email", recipientEmail)
          .single();
        prospectId = existing?.id;
      }

      if (prospectId) {
        // Check if this email already exists (by message_id)
        const { data: existingEmail } = await supabase
          .from("emails")
          .select("id")
          .eq("message_id", data.email_id)
          .single();

        if (!existingEmail) {
          // Check if this is a follow-up (prospect already has emails)
          const { count } = await supabase
            .from("emails")
            .select("*", { count: "exact", head: true })
            .eq("prospect_id", prospectId);

          const emailType = (count && count > 0) ? "followup" : "cold";

          // Fetch full email content from Resend
          let emailBody: string | null = null;
          try {
            const detail = await resend.emails.get(data.email_id);
            emailBody = detail.data?.html || detail.data?.text || null;
          } catch {
            // Non-critical — continue without body
          }

          await supabase.from("emails").insert({
            prospect_id: prospectId,
            type: emailType,
            subject: data.subject,
            body: emailBody,
            batch_name: "resend-webhook",
            batch_date: sendDate,
            message_id: data.email_id,
            sent_by: sender,
            status: type === "email.delivered" ? "sent" : "sent",
            sent_at: sendDate,
          });

          // Update prospect status if follow-up
          if (emailType === "followup") {
            await supabase
              .from("prospects")
              .update({ status: "followed_up", updated_at: new Date().toISOString() })
              .eq("id", prospectId)
              .eq("status", "prospected");
          }

          await logActivity(prospectId, type.replace("email.", ""), {
            subject: data.subject,
            to: recipientEmail,
            from: data.from,
            message_id: data.email_id,
          });
        } else if (type === "email.delivered") {
          // Update existing email status to delivered
          await supabase
            .from("emails")
            .update({ status: "sent" })
            .eq("message_id", data.email_id);
        }
      }
    } else if (type === "email.bounced") {
      // Mark email as bounced
      await supabase
        .from("emails")
        .update({ status: "bounced" })
        .eq("message_id", data.email_id);

      await logActivity(null, "bounced", {
        to: recipientEmail,
        message_id: data.email_id,
      });
    } else if (type === "email.complained") {
      // Mark as DNC
      await supabase
        .from("do_not_contact")
        .upsert({ email: recipientEmail, reason: "spam complaint" }, { onConflict: "email" });

      await supabase
        .from("prospects")
        .update({ status: "do_not_contact", updated_at: new Date().toISOString() })
        .eq("email", recipientEmail);

      await logActivity(null, "complained", {
        to: recipientEmail,
        message_id: data.email_id,
      });
    } else if (type === "email.opened" || type === "email.clicked") {
      // Find prospect by email
      const { data: prospect } = await supabase
        .from("prospects")
        .select("id")
        .eq("email", recipientEmail)
        .single();

      await logActivity(prospect?.id || null, type.replace("email.", ""), {
        to: recipientEmail,
        message_id: data.email_id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
