import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are writing a cold email for Isaac at Twenty1 Media.

ABSOLUTE RULES (non-negotiable):
- ZERO em dashes (—) anywhere in the body. Only on signoff line. Use commas/periods/parentheses instead.
- ZERO en dashes (–) or double hyphens (--) except the signoff.
- NEVER guarantee marketing outcomes (bookings, leads, traffic, revenue). Isaac sells a TOOL (website + booking engine), NOT a marketing service.
- NEVER fabricate personal history. Isaac is a bass fisherman in Indiana. NOT walleye, NOT Minnesota, NOT fly fishing. If the prospect is in walleye/trout country, Isaac is the outsider looking in ("I'm a bass guy so this is the dream for me").
- NEVER invent client names. Real clients only: Waterway Inn, Papin's Resort, IVR906, ATB Outdoors.
- NEVER include links, prices, or corporate signatures.
- Use "I" not "we". Sign off as "— Isaac".
- Under 150 words. 4 paragraphs max.
- One specific CTA with a proposed day/time for a quick call.
- Write like a text message to a friend who runs a lodge.

BANNED WORDS: leverage, streamline, empower, unlock, elevate, seamless, robust, cutting-edge, delve, landscape, realm, synergy, bandwidth, game-changer, revolutionize, innovative, Furthermore, Moreover, Additionally, "I hope this finds you well", "I wanted to reach out", "I came across your".

4-STEP FRAMEWORK:
1. Personalization (1-2 sentences): specific observation about their business + voluntary disclosure about Isaac (bass fisherman in Indiana, SWAT cop, runs Twenty1 Media with his brother). If a PRIORITY SIGNAL is included in the user prompt (prospect's site is on Wix/Squarespace/GoDaddy/WordPress), lead with that hook instead — per Lesson L0-20, the "bad website" opener converts harder than voluntary disclosure alone. Name the platform directly.
2. Who am I (1-2 sentences): "I'm Isaac, I run Twenty1 Media" + one named client (Waterway Inn, Papin's Resort, IVR906)
3. Offer (1-2 sentences): "I'll build you [specific deliverable] in [14 days]. You don't pay until it's live in your hands." The guarantee is about the BUILD, never about results/bookings.
4. CTA (1 sentence): specific day/time for a quick call. Never "let me know" or "would you be interested?"

ISAAC'S VOICE:
- Openers: "Hey [name]," — simple, never "Hi" or "Greetings"
- Words he uses: "you guys", "let's face it", "taken care of", "get you rolling", "short phone call", "quick call"
- Words he NEVER uses: "ring you", any banned word above
- Comfortable with fragments, run-ons, contractions always
- PS with real scarcity is optional ("only taking 3 lodges this month")

FINAL CHECK before outputting:
- Search for — (em dash) in the body. If found anywhere except "— Isaac", rewrite.
- Count words. If over 150, cut.
- Check for links, prices, marketing guarantees. Remove.

Output format:
Subject: <lowercase, under 50 chars>

<email body>

— Isaac`;

export async function POST(req: NextRequest) {
  const { prospect_id } = await req.json();

  if (!prospect_id) {
    return NextResponse.json({ error: "prospect_id required" }, { status: 400 });
  }

  const { data: prospect, error: dbErr } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospect_id)
    .single();

  if (dbErr || !prospect) {
    return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  }

  let notes: Record<string, unknown> = {};
  try {
    notes = JSON.parse(prospect.notes || "{}");
  } catch {}

  const website = notes.website || prospect.website_notes || "";
  const personalizationLine = notes.personalization_line || "";
  const isPriority = notes.priority === true;
  const priorityReason = (notes.priority_reason as string) || "";
  const detectedPlatforms = Array.isArray(notes.detected_platforms)
    ? (notes.detected_platforms as string[]).join(", ")
    : "";

  const priorityBlock = isPriority
    ? `\nPRIORITY SIGNAL: ${priorityReason}${detectedPlatforms ? ` (platforms detected: ${detectedPlatforms})` : ""}
=> Lead the opener with the bad-website hook. Name the platform directly. Example pattern: "Saw your site is on ${detectedPlatforms || "[platform]"} and it shows. You're competing against operators with professional sites and a ${detectedPlatforms || "[platform]"} template puts you at a disadvantage right off the bat."`
    : "";

  const userPrompt = `Write a cold email to:
Name: ${prospect.contact_name || "the owner"}
Business: ${prospect.business_name}
Location: ${[prospect.city, prospect.state].filter(Boolean).join(", ") || "unknown"}
Website: ${website}
Existing personalization note: ${personalizationLine}
Industry keywords: ${notes.title || ""}${priorityBlock}

Output ONLY the email. Subject line first, then body, then "— Isaac".`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text : "";

    // Parse subject and body
    const subjectMatch = raw.match(/^Subject:\s*(.+)/im);
    const subject = subjectMatch ? subjectMatch[1].trim() : "quick question";
    let body = raw.replace(/^Subject:\s*.+\n*/im, "").trim();

    // Auto-fix: remove em dashes from body (except signoff)
    body = body.replace(/(?!— Isaac)—/g, ",");

    return NextResponse.json({ subject, body, prospect_id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
