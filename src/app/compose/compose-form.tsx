"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Prospect {
  id: number;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  vertical: string | null;
  sent_by: string | null;
}

const TEMPLATES = [
  {
    name: "Hospitality — Direct Hook",
    subject: "[Property] is losing direct bookings to Airbnb",
    body: `Hey [Name],

Found [Business] while researching [Location] lodging. You've got a great property and strong reviews — but your website isn't converting that into direct bookings.

Right now, anyone comparing options on their phone at 10pm is booking through Airbnb or Booking.com instead of you. That's 15-18% per booking you're giving away.

I build direct booking websites for lodges and resorts. Recent work:
→ waterwayinnir.com
→ papinsresort.com

A proper site with a booking engine pays for itself in the first season. Worth 15 minutes to see what it could look like for [Business]?

Isaac Walden | Twenty1 Media
isaac@twenty1-media.com`,
  },
  {
    name: "Hospitality — Specific Problem",
    subject: "3 [Location] lodges outrank you on Google — here's why",
    body: `Hey [Name],

I looked up [Business] and you're buried in search results behind properties with half your reviews. The issue isn't your reputation — it's your website.

[Specific problem: Weebly/GoDaddy/no mobile/no booking/etc.]

The lodges ranking above you have purpose-built sites with structured data, direct booking, and fast mobile load times. That's fixable in about a week.

I've done this for waterwayinnir.com and papinsresort.com — both rank page 1 for their towns now.

Quick call this week? I'll show you exactly what I'd change.

Isaac Walden | Twenty1 Media
isaac@twenty1-media.com`,
  },
  {
    name: "Contractor — Competitor Angle",
    subject: "[Name] — your [City] competitors are showing up, you're not",
    body: `Hey [Name],

Searched "[service] [City]" and [Business] doesn't show up in the first 3 pages. Your competitors with half your experience are getting those calls instead.

The fix isn't complicated — a clean site built around the searches your customers actually type, with a quote request form that works on mobile. Most of my contractor clients start getting form submissions within 60 days.

Recent work: thefinishingtouchllc.com — a 25-year concrete company in Indiana.

Takes about a week to build, costs less than one month of HomeAdvisor. Worth a 15-minute call?

Isaac Walden | Twenty1 Media
isaac@twenty1-media.com`,
  },
  {
    name: "Contractor — Visual Proof",
    subject: "[Name] — your work is great, your website doesn't show it",
    body: `Hey [Name],

Checked out [Business] and you clearly do quality work — but the website barely shows any of it. [Service type] is one of the most visual trades out there. Homeowners want to see before/after galleries before they pick up the phone.

Right now your site has [specific problem: no photos / template look / GoDaddy builder / etc.]. That's costing you the customers who do their research online before calling.

I build portfolio-forward contractor sites in [State]. Quick example: thefinishingtouchllc.com

15 minutes to see if it makes sense?

Isaac Walden | Twenty1 Media
isaac@twenty1-media.com`,
  },
  {
    name: "Agriculture / FFL — Credibility",
    subject: "Your business has [X] years of trust — your website doesn't reflect it",
    body: `Hey [Name],

[Business] has been serving [area] for years and you've built real trust in the community. But your online presence doesn't match that reputation.

When someone searches for [what they sell/do] in [area], they're finding competitors with clean websites and Google reviews first. The businesses that show up are the ones that get the call — even if they've been around half as long as you.

I build websites for [vertical] businesses. Clean, fast, built to rank locally. One-time build, no monthly platform fees, yours to own.

Worth a quick conversation to see what it could look like?

Isaac Walden | Twenty1 Media
isaac@twenty1-media.com`,
  },
  {
    name: "Follow-up (Day 3-4)",
    subject: "Re: [original subject]",
    body: `Hey [Name],

Following up on my note from earlier this week — didn't want it to get buried.

[Season/timing hook: summer bookings are filling up / spring is peak season for [service] / etc.]

If a better website isn't on your radar right now, no worries. But if it is, I'm here and can have something ready in about a week.

Isaac Walden | Twenty1 Media
isaac@twenty1-media.com`,
  },
  {
    name: "Breakup (Day 7-10)",
    subject: "Re: [original subject]",
    body: `Hey [Name],

This is my last note — I know you're busy and I don't want to be that guy.

If upgrading your website ever moves up the priority list, I'm here. No hard feelings either way.

Isaac Walden | Twenty1 Media
isaac@twenty1-media.com`,
  },
];

interface SenderInfo {
  name: string;
  configured: boolean;
}

export function ComposeForm({
  prospects,
  senders,
  prefillProspectId,
  prefillTo,
  prefillType,
}: {
  prospects: Prospect[];
  senders: SenderInfo[];
  prefillProspectId?: number;
  prefillTo: string;
  prefillType: string;
}) {
  const router = useRouter();
  const [prospectId, setProspectId] = useState<number | "">(prefillProspectId || "");
  const [to, setTo] = useState(prefillTo);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState(prefillType);
  const [sender, setSender] = useState("isaac");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  function selectProspect(id: number) {
    const p = prospects.find((x) => x.id === id);
    if (p) {
      setProspectId(id);
      setTo(p.email || "");
      setSender(p.sent_by || "isaac");
    }
  }

  function applyTemplate(idx: number) {
    const t = TEMPLATES[idx];
    const p = prospects.find((x) => x.id === prospectId);

    let subj = t.subject;
    let bod = t.body;

    if (p) {
      const name = p.contact_name || "";
      const biz = p.business_name || "";
      subj = subj.replace("[Name]", name).replace("[Property]", biz).replace("[Business]", biz);
      bod = bod
        .replace(/\[Name\]/g, name || "there")
        .replace(/\[Business\]/g, biz)
        .replace(/\[Property\]/g, biz);
    }

    setSubject(subj);
    setBody(bod);
    if (t.name.startsWith("Follow")) setType("followup");
    if (t.name.startsWith("Breakup")) setType("followup");
  }

  async function handleSend() {
    if (!to || !subject || !body) {
      setError("Fill in all fields");
      return;
    }
    setSending(true);
    setError("");

    const res = await fetch("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prospect_id: prospectId || null,
        to,
        subject,
        email_body: body,
        type,
        from: sender,
      }),
    });

    const data = await res.json();
    setSending(false);

    if (data.success) {
      setSent(true);
      setTimeout(() => {
        if (prospectId) {
          router.push(`/prospects/${prospectId}`);
        } else {
          router.push("/emails");
        }
      }, 1500);
    } else {
      setError(data.error || "Failed to send");
    }
  }

  if (sent) {
    return (
      <div className="bg-emerald-950/50 border border-emerald-800 rounded-xl p-8 text-center">
        <h2 className="text-xl font-bold text-emerald-400 mb-2">Email Sent</h2>
        <p className="text-sm text-zinc-400">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Prospect selector */}
      <div>
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Prospect</label>
        <select
          value={prospectId}
          onChange={(e) => selectProspect(parseInt(e.target.value))}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
        >
          <option value="">— Select a prospect (or type email manually) —</option>
          {prospects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.business_name} — {p.email} ({p.vertical})
            </option>
          ))}
        </select>
      </div>

      {/* Template selector */}
      <div>
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Template</label>
        <select
          onChange={(e) => { if (e.target.value) applyTemplate(parseInt(e.target.value)); }}
          defaultValue=""
          className="w-full sm:hidden bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
        >
          <option value="" disabled>Select a template...</option>
          {TEMPLATES.map((t, i) => (
            <option key={i} value={i}>{t.name}</option>
          ))}
        </select>
        <div className="hidden sm:flex flex-wrap gap-2">
          {TEMPLATES.map((t, i) => (
            <button
              key={i}
              onClick={() => applyTemplate(i)}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {/* To / From row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">To</label>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="prospect@email.com"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Sending As</label>
          <select
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          >
            {senders.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name.charAt(0).toUpperCase() + s.name.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Type */}
      <div>
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Type</label>
        <div className="flex gap-2">
          {["cold", "followup"].map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1 rounded-full text-xs capitalize ${
                type === t ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {t === "followup" ? "follow-up" : t}
            </button>
          ))}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject line..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Body */}
      <div>
        <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-1">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          placeholder="Email body..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 resize-y leading-relaxed"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/50 border border-red-800 rounded-lg px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Send button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
        <button
          onClick={handleSend}
          disabled={sending || !to || !subject || !body}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white px-6 py-3 rounded-lg text-sm font-medium transition-colors"
        >
          {sending ? "Sending..." : "Send Email"}
        </button>
        <span className="text-xs text-zinc-600 text-center sm:text-left">
          Sends as {sender}@twenty1-media.com
        </span>
      </div>
    </div>
  );
}
