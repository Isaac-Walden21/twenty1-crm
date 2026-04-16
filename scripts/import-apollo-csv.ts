#!/usr/bin/env tsx
// import-apollo-csv.ts — Import Apollo CSV export into CRM prospects.
//
// Reads the CSV, fetches each lodge's website to check for booking widgets,
// and inserts qualified leads (no booking widget) into Supabase prospects
// with vertical=Hospitality.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... tsx scripts/import-apollo-csv.ts <path-to-csv>
//   npm run import-csv -- <path-to-csv>
//
// Options:
//   --dry-run     Preview what would be imported without writing to DB
//   --skip-check  Skip website booking widget check (import all)
//   --limit N     Only process first N rows

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// --- Config ---

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

// Website platforms that signal a prospect ripe for a rebuild.
// When detected, the lead gets flagged priority=true in notes.
const PLATFORM_SIGNATURES: Record<string, string[]> = {
  wix: ["wix.com", "static.wixstatic.com", "wixsite.com", "_wixcssmodules"],
  squarespace: ["squarespace.com", "squarespace-cdn.com", "static1.squarespace"],
  godaddy: ["godaddy.com/websites", "secureserver.net", "website-builder"],
  weebly: ["weebly.com", "weeblysite.com"],
  wordpress_com: ["wp.com", "wordpress.com/hosting", "en-wpcom"],
  // Generic WordPress (not .com hosted) — broad, usually fine to rebuild
  wordpress_generic: ["wp-content/themes", "wp-includes/"],
};

// --- Parse args ---

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const skipCheck = args.includes("--skip-check");
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1]) : Infinity;

if (!csvPath) {
  console.error("Usage: tsx scripts/import-apollo-csv.ts <path-to-csv> [--dry-run] [--skip-check] [--limit N]");
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`File not found: ${csvPath}`);
  process.exit(1);
}

// --- Supabase ---

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_KEY"));

// --- CSV parsing (simple, no external dependency) ---

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.split("\n");
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

// --- Website check ---

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

// --- Main ---

async function main() {
  const raw = fs.readFileSync(csvPath!, "utf-8");
  const rows = parseCSV(raw);

  console.log(`\nLoaded ${rows.length} rows from CSV`);
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Widget check: ${skipCheck ? "SKIPPED" : "ENABLED"}`);
  if (limit < Infinity) console.log(`Limit: ${limit} rows`);
  console.log("");

  // Pre-fetch existing emails to avoid duplicates
  const emails = rows
    .map((r) => (r["Email"] || "").toLowerCase().trim())
    .filter(Boolean);

  const { data: existing } = await supabase
    .from("prospects")
    .select("email")
    .in("email", emails);
  const existingSet = new Set((existing || []).map((r) => r.email?.toLowerCase()));

  const results = {
    imported: 0,
    priority: 0,
    skipped_existing: 0,
    skipped_no_email: 0,
    skipped_has_widget: 0,
    skipped_fetch_error: 0,
    total: 0,
  };

  const toInsert: Record<string, unknown>[] = [];

  for (const row of rows.slice(0, limit)) {
    results.total++;
    const email = (row["Email"] || "").toLowerCase().trim();
    const businessName = row["Company Name"] || "";
    const contactName = [row["First Name"], row["Last Name"]].filter(Boolean).join(" ");
    const website = (row["Website"] || "").trim();
    const city = row["Company City"] || row["City"] || "";
    const state = row["Company State"] || row["State"] || "";
    const phone = row["Corporate Phone"] || row["Work Direct Phone"] || row["Mobile Phone"] || "";
    const title = row["Title"] || "";

    if (!email) {
      results.skipped_no_email++;
      continue;
    }

    if (existingSet.has(email)) {
      results.skipped_existing++;
      continue;
    }
    existingSet.add(email); // dedupe within batch

    // Check website for booking widgets AND target platforms
    let widgetDetected = false;
    let detectedWidgets: string[] = [];
    let detectedPlatforms: string[] = [];
    let fetchError: string | undefined;

    if (!skipCheck && website) {
      const url = website.startsWith("http") ? website : `https://${website}`;
      process.stdout.write(`  Checking ${businessName} (${url})... `);
      const result = await checkWebsite(url);
      widgetDetected = result.widgetDetected;
      detectedWidgets = result.widgets;
      detectedPlatforms = result.platforms;
      fetchError = result.error;

      if (widgetDetected) {
        console.log(`HAS WIDGET (${detectedWidgets.join(", ")})`);
        results.skipped_has_widget++;
        continue;
      } else if (fetchError) {
        console.log(`FETCH ERROR: ${fetchError}`);
        results.skipped_fetch_error++;
        continue;
      } else if (detectedPlatforms.length > 0) {
        console.log(`PRIORITY — ${detectedPlatforms.join(", ")}`);
        results.priority++;
      } else {
        console.log("QUALIFIED");
      }
    }

    const isPriority = detectedPlatforms.length > 0;

    const notesJson = JSON.stringify({
      website: website || null,
      booking_widget_detected: widgetDetected,
      detected_widgets: detectedWidgets,
      detected_platforms: detectedPlatforms,
      priority: isPriority,
      priority_reason: isPriority ? `Site on ${detectedPlatforms.join(", ")}` : null,
      personalization_line: null,
      source: "apollo-csv",
      title,
      imported_at: new Date().toISOString(),
    });

    toInsert.push({
      business_name: businessName,
      contact_name: contactName || null,
      email,
      phone: phone || null,
      city: city || null,
      state: state || null,
      vertical: "Hospitality",
      status: "prospected",
      website_notes: website || null,
      notes: notesJson,
    });
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Total processed: ${results.total}`);
  console.log(`Qualified to import: ${toInsert.length}`);
  console.log(`  of which PRIORITY (bad-platform sites): ${results.priority}`);
  console.log(`Skipped (already in CRM): ${results.skipped_existing}`);
  console.log(`Skipped (no email): ${results.skipped_no_email}`);
  console.log(`Skipped (has booking widget): ${results.skipped_has_widget}`);
  console.log(`Skipped (fetch error): ${results.skipped_fetch_error}`);

  if (dryRun) {
    console.log(`\n[DRY RUN] Would insert ${toInsert.length} leads. Run without --dry-run to import.`);
    if (toInsert.length > 0) {
      console.log("\nFirst 3 leads that would be imported:");
      for (const lead of toInsert.slice(0, 3)) {
        console.log(`  ${lead.business_name} — ${lead.email} — ${lead.city}, ${lead.state}`);
      }
    }
    return;
  }

  if (toInsert.length === 0) {
    console.log("\nNo leads to import.");
    return;
  }

  // Insert in batches of 50
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50);
    const { error, count } = await supabase
      .from("prospects")
      .insert(batch, { count: "exact" });
    if (error) {
      console.error(`\nBatch insert error at row ${i}:`, error.message);
      continue;
    }
    inserted += count ?? batch.length;
  }

  results.imported = inserted;
  console.log(`\nInserted ${inserted} leads into CRM (vertical=Hospitality, status=prospected)`);
  console.log("View at: https://crm.twenty1-media.com/prospects");
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
