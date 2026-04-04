import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const WEBHOOK_URL = process.env.WEBHOOK_URL || "https://crm.twenty1-media.com/api/webhooks/resend";

async function main() {
  console.log(`Fetching emails from Resend...`);
  console.log(`Posting to: ${WEBHOOK_URL}\n`);

  const res = await resend.emails.list();
  const emails = (res.data?.data || []) as Array<{
    id: string;
    to: string[];
    from: string;
    subject: string;
    created_at: string;
    last_event: string;
  }>;

  console.log(`Found ${emails.length} emails\n`);

  let sent = 0;
  let failed = 0;

  for (const email of emails) {
    // Simulate the events in order: sent -> delivered -> opened/clicked/bounced
    const events: string[] = ["email.sent"];

    if (["delivered", "opened", "clicked"].includes(email.last_event)) {
      events.push("email.delivered");
    }
    if (email.last_event === "opened" || email.last_event === "clicked") {
      events.push("email.opened");
    }
    if (email.last_event === "clicked") {
      events.push("email.clicked");
    }
    if (email.last_event === "bounced") {
      events.push("email.bounced");
    }
    if (email.last_event === "complained") {
      events.push("email.complained");
    }

    for (const eventType of events) {
      const payload = {
        type: eventType,
        created_at: email.created_at,
        data: {
          email_id: email.id,
          from: email.from,
          to: email.to,
          subject: email.subject,
          created_at: email.created_at,
        },
      };

      try {
        const resp = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (resp.ok) {
          sent++;
        } else {
          console.error(`  FAIL ${eventType} for ${email.to[0]}: ${resp.status}`);
          failed++;
        }
      } catch (err) {
        console.error(`  ERROR ${eventType} for ${email.to[0]}: ${(err as Error).message}`);
        failed++;
      }
    }

    console.log(`  ${email.to[0]} — ${events.length} events (last: ${email.last_event})`);
  }

  console.log(`\n--- Backfill Complete ---`);
  console.log(`Events sent: ${sent}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
