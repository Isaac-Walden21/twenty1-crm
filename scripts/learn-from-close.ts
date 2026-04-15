#!/usr/bin/env tsx
// learn-from-close.ts — Deep strategy analysis when a prospect hits closed_won.
//
// Run manually or triggered when you mark a deal as won:
//   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... tsx scripts/learn-from-close.ts <prospect_id>
//
// Reads the full email thread (all sent emails + responses), runs a deep
// Claude analysis, and writes a structured entry to winning-strategies.md.
// This file becomes top-of-context for future email generation — the skill
// prioritizes proven strategies over generic frameworks.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const REPO_ROOT = path.resolve(__dirname, "..");
const SKILL_DIR = path.join(REPO_ROOT, ".claude", "skills", "cold-email");
const STRATEGIES_PATH = path.join(SKILL_DIR, "winning-strategies.md");

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_KEY"));

function today(): string {
  return new Date().toISOString().split("T")[0];
}

async function main() {
  const prospectId = parseInt(process.argv[2]);
  if (!prospectId || isNaN(prospectId)) {
    console.error("Usage: tsx scripts/learn-from-close.ts <prospect_id>");
    process.exit(1);
  }

  // Fetch prospect
  const { data: prospect, error: pErr } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .single();
  if (pErr || !prospect) {
    console.error(`Prospect ${prospectId} not found:`, pErr?.message);
    process.exit(1);
  }

  if (prospect.status !== "closed_won") {
    console.warn(`Warning: prospect ${prospectId} status is "${prospect.status}", not "closed_won". Proceeding anyway.`);
  }

  console.log(`\nAnalyzing closed deal: ${prospect.business_name}`);
  console.log(`Location: ${[prospect.city, prospect.state].filter(Boolean).join(", ") || "unknown"}`);
  console.log(`Sale price: ${prospect.sale_price || "not recorded"}\n`);

  // Fetch all emails to this prospect
  const { data: emails } = await supabase
    .from("emails")
    .select("id, subject, body, type, sent_at, sent_by, status")
    .eq("prospect_id", prospectId)
    .eq("status", "sent")
    .order("sent_at", { ascending: true });

  // Fetch all responses from this prospect
  const { data: responses } = await supabase
    .from("responses")
    .select("id, subject, body, response_type, from_email, received_at")
    .eq("prospect_id", prospectId)
    .order("received_at", { ascending: true });

  if (!emails?.length) {
    console.error("No sent emails found for this prospect. Nothing to analyze.");
    process.exit(1);
  }

  // Build chronological thread
  type ThreadEntry = { direction: string; date: string; content: string };
  const thread: ThreadEntry[] = [];

  for (const e of emails || []) {
    thread.push({
      direction: "SENT",
      date: e.sent_at || "unknown",
      content: `Subject: ${e.subject || "(none)"}\nType: ${e.type}\nSent by: ${e.sent_by || "isaac"}\n\n${e.body || "(empty)"}`,
    });
  }

  for (const r of responses || []) {
    thread.push({
      direction: "RECEIVED",
      date: r.received_at || "unknown",
      content: `From: ${r.from_email || "unknown"}\nType: ${r.response_type || "unknown"}\nSubject: ${r.subject || "(none)"}\n\n${r.body || "(empty)"}`,
    });
  }

  thread.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const threadText = thread
    .map((t) => `--- ${t.direction} (${t.date}) ---\n${t.content}`)
    .join("\n\n");

  console.log(`Thread: ${emails?.length || 0} sent, ${responses?.length || 0} received\n`);

  // Deep analysis
  const analysis = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: `You are analyzing a cold email sequence that resulted in a CLOSED DEAL for Twenty1 Media. Isaac sells custom websites + booking engines to fishing lodges/resorts. He is NOT a marketing agency.

Provide a deep strategy analysis covering:
1. **Opening hook**: What specific opener was used? Why did it work for this prospect?
2. **Trust builders**: What social proof, authority, or rapport signals converted this person?
3. **Offer framing**: How was the offer positioned? What made it feel low-risk?
4. **Objection handling**: Were there objections? How were they addressed in the thread?
5. **CTA effectiveness**: What call-to-action got them to respond? How specific was it?
6. **Timeline**: How many touches from first email to close? What was the cadence?
7. **Replicable pattern**: What 1-2 specific things from this deal should be repeated in every future email?
8. **Voice notes**: What phrases/tone worked? Quote specific lines that landed.

Be specific to THIS deal. Not generic advice. Quote actual lines from the emails.`,
    messages: [
      {
        role: "user",
        content: `PROSPECT: ${prospect.business_name}
Location: ${[prospect.city, prospect.state].filter(Boolean).join(", ") || "unknown"}
Vertical: ${prospect.vertical || "unknown"}
Sale price: $${prospect.sale_price || "unknown"}
Notes: ${prospect.notes || "none"}

FULL THREAD (chronological):

${threadText}

Analyze this deal. What worked, what should we repeat, and what specific patterns should future emails mimic?`,
      },
    ],
  });

  const analysisText = analysis.content[0].type === "text" ? analysis.content[0].text : "";

  // Build the strategy entry
  const entry = `## ${today()} — CLOSED WON — ${prospect.business_name}

**Location:** ${[prospect.city, prospect.state].filter(Boolean).join(", ") || "unknown"}
**Sale price:** $${prospect.sale_price || "not recorded"}
**Emails sent:** ${emails?.length || 0}
**Responses received:** ${responses?.length || 0}
**Days to close:** ${emails?.[0]?.sent_at && prospect.closed_at
    ? Math.ceil((new Date(prospect.closed_at).getTime() - new Date(emails[0].sent_at).getTime()) / (1000 * 60 * 60 * 24))
    : "unknown"}

### Strategy Analysis

${analysisText.trim()}

### Full Thread Reference

<details>
<summary>Click to expand full email thread</summary>

${threadText}

</details>
`;

  // Ensure winning-strategies.md exists
  if (!fs.existsSync(STRATEGIES_PATH)) {
    fs.writeFileSync(
      STRATEGIES_PATH,
      `# Winning Strategies — Closed Deals

Deep analysis of every closed deal. These strategies are the highest-value patterns in the skill — weight 10x. When generating new cold emails, prioritize patterns that appear in this file.

---
`
    );
  }

  // Append the entry
  fs.appendFileSync(STRATEGIES_PATH, "\n" + entry);
  console.log("Strategy analysis written to winning-strategies.md\n");

  // Commit and push
  try {
    const status = execSync("git status --porcelain .claude/skills/cold-email/", {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    }).trim();

    if (status) {
      execSync("git add .claude/skills/cold-email/", { cwd: REPO_ROOT });
      execSync(
        `git commit -m "learn: strategy analysis for ${prospect.business_name} (closed_won)"`,
        { cwd: REPO_ROOT }
      );
      execSync("git push", { cwd: REPO_ROOT });
      console.log("Committed and pushed strategy analysis.");
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Git commit/push failed:", msg);
  }

  console.log("Done.\n");
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
