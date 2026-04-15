import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/leads/ingest
// Auth: Authorization: Bearer <INGEST_SECRET>
// Body: { leads: LeadPayload[] }
//
// Upserts into `prospects` keyed on email. Stores lodge-specific metadata
// (website, widget detection, personalization line, source) as JSON in `notes`
// so we don't need a schema migration. If a prospect already exists with the
// same email, we skip it (never overwrite manually curated prospects).

interface LeadPayload {
  business_name: string;
  contact_name?: string | null;
  email: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  booking_widget_detected?: boolean;
  detected_widgets?: string[];
  personalization_line?: string | null;
  source?: string; // e.g. "apollo+n8n"
}

interface LodgeNotes {
  website: string | null;
  booking_widget_detected: boolean;
  detected_widgets: string[];
  personalization_line: string | null;
  source: string;
  imported_at: string;
}

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.INGEST_SECRET;
  if (!expected) return bad("INGEST_SECRET not configured on server", 500);
  if (auth !== `Bearer ${expected}`) return bad("unauthorized", 401);

  let body: { leads?: LeadPayload[] };
  try {
    body = await req.json();
  } catch {
    return bad("invalid json");
  }
  const leads = body?.leads;
  if (!Array.isArray(leads) || leads.length === 0) return bad("leads[] required");
  if (leads.length > 500) return bad("max 500 leads per request");

  const results = { inserted: 0, skipped_existing: 0, skipped_invalid: 0, errors: [] as string[] };

  // Pre-fetch existing emails in this batch to avoid duplicates.
  const emails = leads.map((l) => l.email?.toLowerCase().trim()).filter(Boolean) as string[];
  const { data: existing } = await supabase
    .from("prospects")
    .select("email")
    .in("email", emails);
  const existingSet = new Set((existing || []).map((r) => r.email?.toLowerCase()));

  const rows = [];
  for (const l of leads) {
    const email = l.email?.toLowerCase().trim();
    if (!email || !l.business_name) {
      results.skipped_invalid++;
      continue;
    }
    if (existingSet.has(email)) {
      results.skipped_existing++;
      continue;
    }
    existingSet.add(email); // dedupe within batch

    const lodgeNotes: LodgeNotes = {
      website: l.website ?? null,
      booking_widget_detected: l.booking_widget_detected ?? false,
      detected_widgets: l.detected_widgets ?? [],
      personalization_line: l.personalization_line ?? null,
      source: l.source ?? "apollo+n8n",
      imported_at: new Date().toISOString(),
    };

    rows.push({
      business_name: l.business_name,
      contact_name: l.contact_name ?? null,
      email,
      phone: l.phone ?? null,
      city: l.city ?? null,
      state: l.state ?? null,
      vertical: "Hospitality",
      status: "prospected",
      website_notes: l.website ?? null,
      notes: JSON.stringify(lodgeNotes),
    });
  }

  if (rows.length > 0) {
    const { error, count } = await supabase
      .from("prospects")
      .insert(rows, { count: "exact" });
    if (error) {
      results.errors.push(error.message);
      return NextResponse.json(results, { status: 500 });
    }
    results.inserted = count ?? rows.length;
  }

  return NextResponse.json(results);
}
