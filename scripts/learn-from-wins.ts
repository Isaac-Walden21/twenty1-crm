#!/usr/bin/env tsx
// learn-from-wins.ts — Nightly learning loop for the cold-email skill.
//
// Runs on Mac Mini via launchd. Reads yesterday's sent emails + responses
// from Supabase, calls Claude to extract lessons from positive outcomes,
// appends to the skill's lessons.md + examples files, and commits/pushes
// so the next Claude Code session picks up the new patterns.
//
// Usage:   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_KEY=... tsx scripts/learn-from-wins.ts
// Or:      npm run learn          (after adding to package.json)
// Cron:    launchd plist runs this nightly at 11pm
//
// Env vars required:
//   ANTHROPIC_API_KEY
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// --- Config ---

const REPO_ROOT = path.resolve(__dirname, "..");
const SKILL_DIR = path.join(REPO_ROOT, ".claude", "skills", "cold-email");
const LESSONS_PATH = path.join(SKILL_DIR, "lessons.md");
const WINNING_PATH = path.join(SKILL_DIR, "examples-winning.md");
const LOSING_PATH = path.join(SKILL_DIR, "examples-losing.md");

// Outcome weights for lesson ranking
const WEIGHTS: Record<string, number> = {
  closed_won: 10,
  booked: 3,
  active_lead: 2,
  positive_reply: 1,
};

// How many days back to look for new data
const LOOKBACK_DAYS = 2;

// Max lessons to keep at the top of lessons.md (older ones get archived)
const MAX_TOP_LESSONS = 15;

// --- Init clients ---

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

// --- Helpers ---

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function appendToFile(filePath: string, content: string): void {
  fs.appendFileSync(filePath, "\n" + content.trim() + "\n");
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text : "";
}

// --- Data fetching ---

interface SentEmail {
  id: number;
  prospect_id: number;
  subject: string | null;
  body: string | null;
  sent_at: string | null;
  sent_by: string | null;
  type: string;
}

interface Response {
  id: number;
  prospect_id: number;
  email_id: number | null;
  response_type: string | null;
  subject: string | null;
  body: string | null;
  from_email: string | null;
  received_at: string | null;
}

interface Prospect {
  id: number;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  vertical: string | null;
  status: string;
  city: string | null;
  state: string | null;
  notes: string | null;
}

async function getRecentEmails(): Promise<SentEmail[]> {
  const since = daysAgo(LOOKBACK_DAYS);
  const { data, error } = await supabase
    .from("emails")
    .select("id, prospect_id, subject, body, sent_at, sent_by, type")
    .gte("sent_at", since)
    .eq("status", "sent")
    .order("sent_at", { ascending: false });
  if (error) {
    console.error("Error fetching emails:", error.message);
    return [];
  }
  return (data || []) as SentEmail[];
}

async function getRecentResponses(): Promise<Response[]> {
  const since = daysAgo(LOOKBACK_DAYS);
  const { data, error } = await supabase
    .from("responses")
    .select("id, prospect_id, email_id, response_type, subject, body, from_email, received_at")
    .gte("received_at", since)
    .order("received_at", { ascending: false });
  if (error) {
    console.error("Error fetching responses:", error.message);
    return [];
  }
  return (data || []) as Response[];
}

async function getProspect(id: number): Promise<Prospect | null> {
  const { data, error } = await supabase
    .from("prospects")
    .select("id, business_name, contact_name, email, vertical, status, city, state, notes")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as Prospect;
}

// --- Already-processed tracking ---
// We track processed email/response IDs in a local JSON file to avoid
// re-analyzing the same data on repeated runs.

const PROCESSED_PATH = path.join(SKILL_DIR, ".processed-ids.json");

interface ProcessedIds {
  emails: number[];
  responses: number[];
}

function loadProcessed(): ProcessedIds {
  try {
    if (fs.existsSync(PROCESSED_PATH)) {
      return JSON.parse(fs.readFileSync(PROCESSED_PATH, "utf-8"));
    }
  } catch {}
  return { emails: [], responses: [] };
}

function saveProcessed(ids: ProcessedIds): void {
  fs.writeFileSync(PROCESSED_PATH, JSON.stringify(ids, null, 2));
}

// --- Lesson extraction ---

async function extractLesson(
  email: SentEmail,
  response: Response,
  prospect: Prospect
): Promise<string> {
  const outcomeType = prospect.status === "closed_won" ? "closed_won"
    : prospect.status === "active_lead" ? "active_lead"
    : "positive_reply";
  const weight = WEIGHTS[outcomeType] || 1;

  const lessonText = await callClaude(
    `You are analyzing a cold email that got a positive response. Extract a specific, actionable lesson that can improve future cold emails.

Context: Isaac at Twenty1 Media sends cold emails to fishing lodges/resorts selling custom websites + booking engines. He is NOT a marketing agency. He sells a tool/service.

Be specific. Not "personalization works" but "naming the specific lake in the opener drove a reply from a Minnesota lodge owner." One lesson, 2-3 sentences max.`,

    `SENT EMAIL:
Subject: ${email.subject || "(no subject)"}
Body: ${email.body || "(empty)"}
Sent by: ${email.sent_by || "isaac"}

PROSPECT:
Business: ${prospect.business_name}
Location: ${[prospect.city, prospect.state].filter(Boolean).join(", ") || "unknown"}
Vertical: ${prospect.vertical || "unknown"}
Status: ${prospect.status}

RESPONSE:
${response.body || "(no body captured)"}
Type: ${response.response_type || "unknown"}

Extract: what specific pattern in the sent email drove this positive response? What should we mimic in future emails? What phrase/structure/approach worked?`
  );

  return `## ${today()} — ${outcomeType} (weight ${weight}) — ${prospect.business_name}

**Context:** ${prospect.business_name}, ${[prospect.city, prospect.state].filter(Boolean).join(", ") || "unknown location"}
**Pattern:** ${lessonText.trim()}
**Weight:** ${weight}
**Source email ID:** ${email.id}
**Source response ID:** ${response.id}`;
}

async function extractWinningExample(
  email: SentEmail,
  response: Response,
  prospect: Prospect
): Promise<string> {
  const outcomeType = prospect.status === "closed_won" ? "closed_won"
    : prospect.status === "active_lead" ? "active_lead"
    : "positive_reply";
  const weight = WEIGHTS[outcomeType] || 1;

  const analysis = await callClaude(
    `Briefly analyze what made this cold email work. 2-3 bullet points. Be specific to this email, not generic advice.`,
    `Email subject: ${email.subject || "(none)"}
Email body: ${email.body || "(empty)"}
Reply: ${response.body || "(no body)"}
Prospect: ${prospect.business_name} (${prospect.vertical})`
  );

  return `## ${today()} — ${outcomeType} (weight ${weight}) — ${prospect.business_name}

**Subject:** ${email.subject || "(unknown)"}
**Body:**
> ${(email.body || "").replace(/\n/g, "\n> ")}

**What worked:** ${analysis.trim()}
**Outcome:** ${outcomeType}
**Prospect ID:** ${prospect.id}
**Weight:** ${weight}`;
}

async function extractLosingExample(
  email: SentEmail,
  prospect: Prospect
): Promise<string> {
  const diagnosis = await callClaude(
    `Briefly diagnose why this cold email likely failed to get a response. 2-3 bullet points. Be specific — what rule from the 4-step framework was violated? What could be improved? Context: Isaac sells websites + booking engines to lodges. He is NOT a marketing agency.`,
    `Email subject: ${email.subject || "(none)"}
Email body: ${email.body || "(empty)"}
Prospect: ${prospect.business_name} (${[prospect.city, prospect.state].filter(Boolean).join(", ") || "unknown"})`
  );

  return `## ${today()} — no reply — ${prospect.business_name}

**Subject:** ${email.subject || "(unknown)"}
**Body:**
> ${(email.body || "").replace(/\n/g, "\n> ")}

**Diagnosis:** ${diagnosis.trim()}
**Prospect ID:** ${prospect.id}`;
}

// --- Pruning ---
// Keep lessons.md from growing unbounded. Top MAX_TOP_LESSONS by weight stay;
// older ones move to lessons-archive.md.

function pruneLessons(): void {
  const content = fs.readFileSync(LESSONS_PATH, "utf-8");
  const sections = content.split(/^## /m);
  const header = sections[0]; // everything before first ##
  const lessons = sections.slice(1).map((s) => "## " + s);

  if (lessons.length <= MAX_TOP_LESSONS) return;

  // Sort by weight (higher = keep), then recency
  const weighted = lessons.map((l) => {
    const weightMatch = l.match(/weight (\d+)/i);
    const w = weightMatch ? parseInt(weightMatch[1]) : 0;
    return { text: l, weight: w };
  });
  weighted.sort((a, b) => b.weight - a.weight);

  const keep = weighted.slice(0, MAX_TOP_LESSONS).map((w) => w.text);
  const archive = weighted.slice(MAX_TOP_LESSONS).map((w) => w.text);

  // Write pruned lessons.md
  fs.writeFileSync(LESSONS_PATH, header + "\n" + keep.join("\n"));

  // Append archived to lessons-archive.md
  const archivePath = path.join(SKILL_DIR, "lessons-archive.md");
  if (!fs.existsSync(archivePath)) {
    fs.writeFileSync(archivePath, "# Archived Lessons\n\nOlder lessons moved from lessons.md to save context window.\n");
  }
  appendToFile(archivePath, archive.join("\n"));

  console.log(`Pruned ${archive.length} lessons to archive, kept ${keep.length}`);
}

// --- Git operations ---

function gitCommitAndPush(): boolean {
  try {
    const status = execSync("git status --porcelain .claude/skills/cold-email/", {
      cwd: REPO_ROOT,
      encoding: "utf-8",
    }).trim();

    if (!status) {
      console.log("No skill file changes to commit.");
      return false;
    }

    execSync("git add .claude/skills/cold-email/", { cwd: REPO_ROOT });
    const date = today();
    execSync(
      `git commit -m "learn: update cold-email skill from ${date} outcomes"`,
      { cwd: REPO_ROOT }
    );
    execSync("git push", { cwd: REPO_ROOT });
    console.log("Committed and pushed skill updates.");
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Git commit/push failed:", msg);
    return false;
  }
}

// --- Main ---

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`learn-from-wins.ts — ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}\n`);

  const processed = loadProcessed();
  const emails = await getRecentEmails();
  const responses = await getRecentResponses();

  console.log(`Found ${emails.length} recent emails, ${responses.length} recent responses.`);

  // Build lookup: prospect_id → responses
  const responsesByProspect = new Map<number, Response[]>();
  for (const r of responses) {
    const existing = responsesByProspect.get(r.prospect_id) || [];
    existing.push(r);
    responsesByProspect.set(r.prospect_id, existing);
  }

  let lessonsAdded = 0;
  let winnersAdded = 0;
  let losersAdded = 0;

  for (const email of emails) {
    if (processed.emails.includes(email.id)) continue;
    if (!email.prospect_id) continue;

    const prospect = await getProspect(email.prospect_id);
    if (!prospect) continue;

    // Only process Hospitality (lodge outbound) for now
    if (prospect.vertical !== "Hospitality") continue;

    const prospectResponses = responsesByProspect.get(prospect.id) || [];
    const positiveResponses = prospectResponses.filter(
      (r) =>
        !processed.responses.includes(r.id) &&
        r.response_type !== "not_interested" &&
        r.response_type !== "unsubscribe"
    );

    if (positiveResponses.length > 0) {
      // Positive outcome — extract lesson + winning example
      const response = positiveResponses[0];
      console.log(`\n+ Positive: ${prospect.business_name} (${prospect.status})`);

      try {
        const lesson = await extractLesson(email, response, prospect);
        appendToFile(LESSONS_PATH, lesson);
        lessonsAdded++;
        console.log("  Added lesson to lessons.md");

        const winner = await extractWinningExample(email, response, prospect);
        appendToFile(WINNING_PATH, winner);
        winnersAdded++;
        console.log("  Added winning example");

        processed.responses.push(response.id);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  Error analyzing ${prospect.business_name}:`, msg);
      }
    } else if (prospectResponses.length === 0) {
      // Check if email is old enough to count as "ignored"
      // Only flag as losing if sent more than 5 days ago with no response
      const sentDate = email.sent_at ? new Date(email.sent_at) : null;
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

      if (sentDate && sentDate < fiveDaysAgo) {
        console.log(`\n- Ignored: ${prospect.business_name} (no reply after 5+ days)`);

        try {
          const loser = await extractLosingExample(email, prospect);
          appendToFile(LOSING_PATH, loser);
          losersAdded++;
          console.log("  Added losing example");
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`  Error analyzing ${prospect.business_name}:`, msg);
        }
      }
    }

    processed.emails.push(email.id);
  }

  // Save processed IDs
  saveProcessed(processed);

  // Prune if we have too many lessons
  if (lessonsAdded > 0) {
    pruneLessons();
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: +${lessonsAdded} lessons, +${winnersAdded} winners, +${losersAdded} losers`);

  // Commit and push if anything changed
  if (lessonsAdded + winnersAdded + losersAdded > 0) {
    gitCommitAndPush();
  } else {
    console.log("No new data to learn from.");
  }

  console.log("Done.\n");
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
