import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function main() {
  // Get all emails that have a Resend message_id but no body
  const { data: emails } = await supabase
    .from("emails")
    .select("id, message_id")
    .not("message_id", "is", null)
    .is("body", null);

  if (!emails || emails.length === 0) {
    console.log("No emails need body backfill.");
    return;
  }

  console.log(`Found ${emails.length} emails without body content\n`);

  let updated = 0;
  let failed = 0;

  for (const email of emails) {
    try {
      const detail = await resend.emails.get(email.message_id);
      const body = detail.data?.html || detail.data?.text || null;

      if (body) {
        await supabase
          .from("emails")
          .update({ body })
          .eq("id", email.id);
        updated++;
        console.log(`  Updated #${email.id} (${email.message_id.slice(0, 20)}...)`);
      } else {
        console.log(`  No body for #${email.id}`);
      }
    } catch (err) {
      console.error(`  Failed #${email.id}: ${(err as Error).message}`);
      failed++;
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\n--- Backfill Complete ---`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
