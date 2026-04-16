"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusUpdater } from "./status-updater";
import { ThreadToggle, ThreadPanel } from "./expandable-thread";

type Prospect = {
  id: number;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  vertical: string | null;
  status: string;
  sent_by: string | null;
  notes: string | null;
  email_count: number;
  last_email_date: string | null;
  price_estimate: number | null;
};

type Engagement = {
  opens: number;
  clicks: number;
};

export function ProspectTable({
  prospects,
  engagementData,
}: {
  prospects: Prospect[];
  engagementData: Record<number, Engagement>;
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-800 text-zinc-500 text-left">
          <th className="pb-3 font-medium">Business</th>
          <th className="pb-3 font-medium">Contact</th>
          <th className="pb-3 font-medium">Location</th>
          <th className="pb-3 font-medium">Vertical</th>
          <th className="pb-3 font-medium">Sender</th>
          <th className="pb-3 font-medium">Status</th>
          <th className="pb-3 font-medium">Engagement</th>
          <th className="pb-3 font-medium">Emails</th>
          <th className="pb-3 font-medium text-right">Est. Value</th>
          <th className="pb-3 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {prospects.map((p) => {
          const isExpanded = expandedId === p.id;
          const engagement = engagementData[p.id] || { opens: 0, clicks: 0 };

          return (
            <ProspectRow
              key={p.id}
              prospect={p}
              engagement={engagement}
              isExpanded={isExpanded}
              onToggle={() => setExpandedId(isExpanded ? null : p.id)}
            />
          );
        })}
      </tbody>
    </table>
  );
}

function ProspectRow({
  prospect: p,
  engagement,
  isExpanded,
  onToggle,
}: {
  prospect: Prospect;
  engagement: Engagement;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState(false);

  const parsedNotes = (() => {
    try {
      return JSON.parse(p.notes || "{}") as {
        website?: string;
        priority?: boolean;
        priority_reason?: string;
        detected_platforms?: string[];
      };
    } catch {
      return {};
    }
  })();

  const isPriority = parsedNotes.priority === true;

  function handleCopyPrompt() {
    const name = p.contact_name || "the owner";
    const biz = p.business_name;
    const location = [p.city, p.state].filter(Boolean).join(", ") || "unknown location";
    const website = parsedNotes.website || "";
    const priorityHint = isPriority && parsedNotes.priority_reason
      ? ` (${parsedNotes.priority_reason}, so lead with the bad-website hook per L0-20)`
      : "";

    const prompt = `use cold-email to draft an email to ${name} at ${biz} in ${location}${website ? `, website is ${website}` : ""}${priorityHint}`;

    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleDraftEmail() {
    setDrafting(true);
    try {
      const res = await fetch("/api/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: p.id }),
      });
      const data = await res.json();
      if (data.subject && data.body) {
        sessionStorage.setItem("draft-email", JSON.stringify({
          prospect_id: p.id,
          subject: data.subject,
          body: data.body,
        }));
        router.push(`/compose?prospect_id=${p.id}&type=cold`);
      }
    } catch {
      // silently fail — user can still manually compose
    } finally {
      setDrafting(false);
    }
  }

  return (
    <>
      <tr className={`border-b border-zinc-800/50 hover:bg-zinc-900/50 ${isExpanded ? "bg-zinc-900/50" : ""}`}>
        <td className="py-3">
          <div className="flex items-center gap-2">
            <Link href={`/prospects/${p.id}`} className="font-medium text-white hover:text-emerald-400 transition-colors">
              {p.business_name}
            </Link>
            {isPriority && <PriorityBadge reason={parsedNotes.priority_reason} />}
          </div>
          <div className="text-xs text-zinc-500">{p.email}</div>
        </td>
        <td className="py-3 text-zinc-400">{p.contact_name || "Unknown"}</td>
        <td className="py-3 text-zinc-400">
          {p.city && p.state ? `${p.city}, ${p.state}` : p.state || "---"}
        </td>
        <td className="py-3"><VerticalBadge vertical={p.vertical || "Other"} /></td>
        <td className="py-3"><SenderBadge sender={p.sent_by || "isaac"} /></td>
        <td className="py-3 relative">
          <StatusUpdater id={p.id} currentStatus={p.status} currentNotes={p.notes || ""} />
        </td>
        <td className="py-3">
          <EngagementBadge opens={engagement.opens} clicks={engagement.clicks} />
        </td>
        <td className="py-3">
          <ThreadToggle
            prospectId={p.id}
            emailCount={p.email_count || 0}
            isOpen={isExpanded}
            onToggle={onToggle}
          />
        </td>
        <td className="py-3 text-right text-zinc-400">${p.price_estimate?.toLocaleString() || "---"}</td>
        <td className="py-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={handleCopyPrompt}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors bg-zinc-700/40 text-zinc-300 border border-zinc-600/30 hover:bg-zinc-700/60"
            >
              {copied ? "Copied" : "Prompt"}
            </button>
            <button
              onClick={handleDraftEmail}
              disabled={drafting || !p.email}
              className="px-2.5 py-1 rounded text-xs font-medium transition-colors bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {drafting ? "Drafting..." : "Draft"}
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={10} className="p-0 bg-zinc-950 border-b border-zinc-800">
            <ThreadPanel prospectId={p.id} businessName={p.business_name} />
          </td>
        </tr>
      )}
    </>
  );
}

function VerticalBadge({ vertical }: { vertical: string }) {
  const colors: Record<string, string> = {
    Hospitality: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    Contractors: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    Agriculture: "bg-green-500/20 text-green-300 border-green-500/30",
    "Firearms/FFL": "bg-red-500/20 text-red-300 border-red-500/30",
    "Family Services": "bg-purple-500/20 text-purple-300 border-purple-500/30",
    Other: "bg-zinc-500/20 text-zinc-300 border-zinc-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs border ${colors[vertical] || colors.Other}`}>{vertical}</span>
  );
}

function SenderBadge({ sender }: { sender: string }) {
  const colors: Record<string, string> = {
    isaac: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    asher: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs border capitalize ${colors[sender] || "bg-zinc-500/20 text-zinc-300 border-zinc-500/30"}`}>{sender}</span>
  );
}

function PriorityBadge({ reason }: { reason?: string }) {
  return (
    <span
      title={reason || "Priority lead"}
      className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-amber-500/20 text-amber-300 border-amber-500/40 uppercase tracking-wide"
    >
      Priority
    </span>
  );
}

function EngagementBadge({ opens, clicks }: { opens: number; clicks: number }) {
  if (opens === 0 && clicks === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      {opens > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
          {opens} open{opens !== 1 ? "s" : ""}
        </span>
      )}
      {clicks > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
          {clicks} click{clicks !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
