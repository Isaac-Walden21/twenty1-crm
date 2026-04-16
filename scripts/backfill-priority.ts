#!/usr/bin/env tsx
// backfill-priority.ts — Re-check existing prospects for website platform signals.
//
// Walks the prospects table, fetches each website, and updates the notes JSON
// with current platform detection (Wix/Squarespace/GoDaddy/Weebly/WordPress)
// and booking widget detection. Prospects imported before the priority-detection
// code existed will get their priority flag set here.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... tsx scripts/backfill-priority.ts
//   npm run backfill-priority
//
// Options:
//   --dry-run     Preview what would be updated, no writes
//   --limit N     Only process first N prospects
//   --only-missing Skip prospects that already have a detected_platforms field

import { createClient } from "@supabase/supabase-js";

// Keep in sync with scripts/import-apollo-csv.ts
const BOOKING_SIGNATURES: Record<string, string[]> = {
  checkfront: ["checkfront.com", "cfwidget"],
  resnexus: ["resnexus.com"],
  fareharbor: ["fareharbor.com", "fh-button"],
  bookeo: ["bookeo.com"],
  cloudbeds: ["cloudbeds.com", "mybookings.cloudbeds"],
  lodgify: ["lodgify.com"],
  thinkres: ["thinkreservations.com"],
  innroad: ["innroad.com"],
  rezdy: ["rezdy.com"],
  peek: ["peekpro.com", "bookwithpeek"],
  webrez: ["webrezpro.com"],
  campspot: ["campspot.com"],
  newbook: ["newbook.cloud"],
  ownerrez: ["ownerrez.com"],
  hospitable: ["hospitable.com"],
  guesty: ["guesty.com"],
  escapia: ["escapia.com"],
  hostaway: ["hostaway.com"],
  streamline: ["streamlinevrs.com"],
};

const PLATFORM_SIGNATURES: Record<string, string[]> = {
  wix: ["wix.com", "static.wixstatic.com", "wixsite.com", "_wixcssmodules"],
  squarespace: ["squarespace.com", "squarespace-cdn.com", "static1.squarespace"],
  godaddy: ["godaddy.com/websites", "secureserver.net", "website-builder"],
  weebly: ["weebly.com", "weeblysite.com"],
  wordpress_com: ["wp.com", "wordpress.com/hosting", "en-wpcom"],
  wordpress_generic: ["wp-content/themes", "wp-includes/"],
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyMissing = args.includes("--only-missing");
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1]) : Infinity;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_KEY"));

interface WebsiteCheck {
  widgetDetected: boolean;
  widgets: string[];
  platforms: string[];
  error?: string;
}

async function checkWebsite(url: string): Promise<WebsiteCheck> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LodgeQualifier/1.0)" },
      redirect: "follow",
    });
    clearTimeout(timeout);

    const html = (await res.text()).toLowerCase();
    const widgets: string[] = [];
    const platforms: string[] = [];

    for (const [name, needles] of Object.entries(BOOKING_SIGNATURES)) {
      if (needles.some((n) => html.includes(n))) widgets.push(name);
    }
    for (const [name, needles] of Object.entries(PLATFORM_SIGNATURES)) {
      if (needles.some((n) => html.includes(n))) platforms.push(name);
    }

    return { widgetDetected: widgets.length > 0, widgets, platforms };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { widgetDetected: false, widgets: [], platforms: [], error: msg };
  }
}

type Prospect = {
  id: number;
  business_name: string;
  website_notes: string | null;
  notes: string | null;
};

async function main() {
  console.log(`\nMode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Only missing: ${onlyMissing ? "YES" : "NO (re-check everything)"}`);
  if (limit < Infinity) console.log(`Limit: ${limit}`);
  console.log("");

  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("id, business_name, website_notes, notes")
    .order("id", { ascending: true });

  if (error) {
    console.error("Failed to fetch prospects:", error.message);
    process.exit(1);
  }

  const rows = (prospects || []) as Prospect[];
  console.log(`Loaded ${rows.length} prospects from DB\n`);

  const stats = {
    checked: 0,
    newly_priority: 0,
    newly_has_widget: 0,
    already_had_flag: 0,
    no_website: 0,
    fetch_error: 0,
    updated: 0,
    skipped_has_flag: 0,
  };

  let processed = 0;

  for (const p of rows) {
    if (processed >= limit) break;

    let notes: Record<string, unknown> = {};
    try {
      notes = JSON.parse(p.notes || "{}");
    } catch {
      notes = {};
    }

    const rawWebsite = (notes.website as string) || p.website_notes || "";
    if (!rawWebsite) {
      stats.no_website++;
      continue;
    }

    if (onlyMissing && Array.isArray(notes.detected_platforms)) {
      stats.skipped_has_flag++;
      continue;
    }

    processed++;
    const url = rawWebsite.startsWith("http") ? rawWebsite : `https://${rawWebsite}`;
    process.stdout.write(`[${p.id}] ${p.business_name} — ${url}... `);

    const result = await checkWebsite(url);
    stats.checked++;

    if (result.error) {
      console.log(`FETCH ERROR: ${result.error}`);
      stats.fetch_error++;
      continue;
    }

    const wasPriority = notes.priority === true;
    const wasHasWidget = notes.booking_widget_detected === true;
    const isPriority = result.platforms.length > 0;

    if (isPriority && !wasPriority) stats.newly_priority++;
    if (result.widgetDetected && !wasHasWidget) stats.newly_has_widget++;
    if (wasPriority || wasHasWidget) stats.already_had_flag++;

    const tags: string[] = [];
    if (result.widgetDetected) tags.push(`HAS_WIDGET(${result.widgets.join(",")})`);
    if (isPriority) tags.push(`PRIORITY(${result.platforms.join(",")})`);
    console.log(tags.length ? tags.join(" ") : "clean");

    const updatedNotes = {
      ...notes,
      website: rawWebsite,
      booking_widget_detected: result.widgetDetected,
      detected_widgets: result.widgets,
      detected_platforms: result.platforms,
      priority: isPriority,
      priority_reason: isPriority ? `Site on ${result.platforms.join(", ")}` : null,
      last_checked_at: new Date().toISOString(),
    };

    if (!dryRun) {
      const { error: updateErr } = await supabase
        .from("prospects")
        .update({ notes: JSON.stringify(updatedNotes) })
        .eq("id", p.id);
      if (updateErr) {
        console.log(`  UPDATE FAILED: ${updateErr.message}`);
        continue;
      }
      stats.updated++;
    }

    // Gentle pacing to avoid hammering target sites
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Checked: ${stats.checked}`);
  console.log(`Newly flagged as PRIORITY: ${stats.newly_priority}`);
  console.log(`Newly flagged as HAS_WIDGET: ${stats.newly_has_widget}`);
  console.log(`Already had priority/widget flag: ${stats.already_had_flag}`);
  console.log(`No website: ${stats.no_website}`);
  console.log(`Fetch errors: ${stats.fetch_error}`);
  console.log(`Skipped (--only-missing): ${stats.skipped_has_flag}`);
  if (!dryRun) console.log(`Rows updated in DB: ${stats.updated}`);
  else console.log(`\n[DRY RUN] No changes written. Re-run without --dry-run to apply.`);
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
