import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Vertical detection from email context
function detectVertical(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("gun") || lower.includes("ffl") || lower.includes("firearm") || lower.includes("arms") || lower.includes("range"))
    return "Firearms/FFL";
  if (lower.includes("therapy") || lower.includes("family service") || lower.includes("healthcare") || lower.includes("counseling"))
    return "Family Services";
  if (lower.includes("contractor") || lower.includes("concrete") || lower.includes("landscap") || lower.includes("hvac") || lower.includes("roofing") || lower.includes("plumb") || lower.includes("lawn"))
    return "Contractors";
  if (lower.includes("hospitality") || lower.includes("motel") || lower.includes("resort") || lower.includes("b&b") || lower.includes("inn") || lower.includes("cabin") || lower.includes("lodge") || lower.includes("lodging"))
    return "Hospitality";
  if (lower.includes("farm") || lower.includes("feed") || lower.includes("crop") || lower.includes("co-op") || lower.includes("ag supply") || lower.includes("agriculture") || lower.includes("agri"))
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

// Extract a business name guess from the recipient email
function guessBusinessName(email: string): string {
  const local = email.split("@")[0];
  const domain = email.split("@")[1]?.split(".")[0] || "";
  // If domain looks like a business name, use it
  if (domain && !["gmail", "yahoo", "hotmail", "outlook", "aol", "icloud", "protonmail", "mail"].includes(domain.toLowerCase())) {
    return domain
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return local.replace(/[-_.]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Extract sender name from "Name <email>" format
function extractSender(from: string): string {
  const match = from.match(/<([^>]+)>/);
  const email = match ? match[1] : from;
  const local = email.split("@")[0].toLowerCase();
  if (local.includes("isaac")) return "isaac";
  if (local.includes("asher")) return "asher";
  // Try the display name
  const name = from.split("<")[0].trim().toLowerCase();
  if (name.includes("isaac")) return "isaac";
  if (name.includes("asher")) return "asher";
  return "isaac";
}

async function main() {
  console.log("Fetching emails from Resend...");

  const res = await resend.emails.list();
  const emails = (res.data?.data || []) as Array<{
    id: string;
    to: string[];
    from: string;
    subject: string;
    created_at: string;
    last_event: string;
  }>;

  console.log(`Found ${emails.length} emails in Resend`);

  if (emails.length === 0) {
    console.log("No emails to import.");
    return;
  }

  // Group by recipient to build prospect records
  const prospectMap = new Map<string, {
    email: string;
    business_name: string;
    vertical: string;
    sent_by: string;
    emails: typeof emails;
  }>();

  for (const e of emails) {
    for (const to of e.to) {
      const existing = prospectMap.get(to.toLowerCase());
      if (existing) {
        existing.emails.push(e);
      } else {
        const vertical = detectVertical(e.subject + " " + to);
        prospectMap.set(to.toLowerCase(), {
          email: to,
          business_name: guessBusinessName(to),
          vertical,
          sent_by: extractSender(e.from),
          emails: [e],
        });
      }
    }
  }

  console.log(`Identified ${prospectMap.size} unique prospects`);

  // Insert prospects
  let prospectCount = 0;
  let emailCount = 0;

  for (const [, prospect] of prospectMap) {
    const vertical = prospect.vertical;
    const priceEstimate = estimatePrice(vertical);

    // Upsert prospect
    const { data: prospectRow, error: pErr } = await supabase
      .from("prospects")
      .upsert({
        email: prospect.email,
        business_name: prospect.business_name,
        vertical,
        sent_by: prospect.sent_by,
        price_estimate: priceEstimate,
        status: "prospected",
      }, { onConflict: "email" })
      .select("id")
      .single();

    if (pErr) {
      console.error(`  Error inserting prospect ${prospect.email}: ${pErr.message}`);
      continue;
    }
    prospectCount++;

    // Insert emails for this prospect
    const sortedEmails = prospect.emails.sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    for (let i = 0; i < sortedEmails.length; i++) {
      const e = sortedEmails[i];
      const date = e.created_at.split("T")[0];
      const type = i === 0 ? "cold" : "followup";

      const { error: eErr } = await supabase.from("emails").insert({
        prospect_id: prospectRow.id,
        type,
        subject: e.subject,
        body: null, // Resend list doesn't include body
        batch_name: `resend-import`,
        batch_date: date,
        message_id: e.id,
        followup_date: null,
        sent_by: extractSender(e.from),
        status: e.last_event === "bounced" ? "bounced" : "sent",
        sent_at: date,
      });

      if (eErr) {
        console.error(`  Error inserting email ${e.id}: ${eErr.message}`);
      } else {
        emailCount++;
      }
    }

    // Update prospect status based on email count
    if (sortedEmails.length > 1) {
      await supabase
        .from("prospects")
        .update({ status: "followed_up", updated_at: new Date().toISOString() })
        .eq("id", prospectRow.id);
    }
  }

  // Final counts
  const { count: pCount } = await supabase.from("prospects").select("*", { count: "exact", head: true });
  const { count: eCount } = await supabase.from("emails").select("*", { count: "exact", head: true });

  console.log("\n--- Seed Complete ---");
  console.log(`Prospects inserted: ${prospectCount}`);
  console.log(`Emails inserted: ${emailCount}`);
  console.log(`Total prospects in DB: ${pCount}`);
  console.log(`Total emails in DB: ${eCount}`);
}

main().catch(console.error);
