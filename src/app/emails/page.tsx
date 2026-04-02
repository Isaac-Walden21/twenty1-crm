import { getEmails, getStats } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EmailsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; sent_by?: string }>;
}) {
  const params = await searchParams;
  const [emails, stats] = await Promise.all([
    getEmails({ type: params.type, status: params.status, sent_by: params.sent_by }),
    getStats(),
  ]);
  const senders = stats.senders as string[];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Email Log</h1>
        <p className="text-zinc-500 text-sm mt-1">{emails.length} emails</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 sm:gap-2">
        <FilterLink href="/emails" label="All" active={!params.type && !params.status && !params.sent_by} />
        <FilterLink href="/emails?type=cold" label="Cold" active={params.type === "cold"} />
        <FilterLink href="/emails?type=followup" label="Follow-up" active={params.type === "followup"} />
        <span className="text-zinc-700 mx-0.5">|</span>
        <FilterLink href="/emails?status=sent" label="Sent" active={params.status === "sent"} />
        <FilterLink href="/emails?status=drafted" label="Drafted" active={params.status === "drafted"} />
        {senders.length > 1 && (
          <>
            <span className="text-zinc-700 mx-0.5">|</span>
            {senders.map((s) => (
              <FilterLink
                key={s}
                href={`/emails?sent_by=${encodeURIComponent(s)}`}
                label={s}
                active={params.sent_by === s}
              />
            ))}
          </>
        )}
      </div>

      {/* Email list */}
      <div className="space-y-3">
        {emails.map((e) => (
          <div
            key={e.id}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4 hover:border-zinc-700 transition-colors"
          >
            <div className="space-y-2">
              {/* Badges row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <TypeBadge type={e.type} />
                <StatusBadge status={e.status} />
                <SenderBadge sender={e.sent_by || "isaac"} />
                {e.batch_date && <span className="text-xs text-zinc-600">{e.batch_date}</span>}
              </div>

              {/* Subject */}
              <h3 className="font-medium text-white text-sm break-words">{e.subject}</h3>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                <span>{e.business_name || "Unknown"}</span>
                {e.contact_name && <span>({e.contact_name})</span>}
                <span className="break-all">{e.email}</span>
              </div>

              {/* Follow-up date */}
              {e.followup_date && (
                <div className="text-xs text-zinc-500">
                  Follow-up: <span className="text-amber-400">{e.followup_date}</span>
                </div>
              )}

              {/* Email body preview */}
              {e.body && (
                <details className="mt-1">
                  <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors py-1">
                    Show email content
                  </summary>
                  <div className="mt-2 p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed break-words">
                    {e.body}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
      </div>

      {emails.length === 0 && (
        <div className="text-center py-12 text-zinc-500">No emails match your filters.</div>
      )}
    </div>
  );
}

function FilterLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`px-2.5 py-1.5 rounded-full text-xs capitalize transition-colors ${
        active ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    cold: "bg-blue-500/20 text-blue-300",
    followup: "bg-amber-500/20 text-amber-300",
  };
  return <span className={`px-2 py-0.5 rounded text-xs ${colors[type] || colors.cold}`}>{type}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    sent: "bg-emerald-500/20 text-emerald-300",
    drafted: "bg-zinc-500/20 text-zinc-300",
  };
  return <span className={`px-2 py-0.5 rounded text-xs ${colors[status] || colors.drafted}`}>{status}</span>;
}

function SenderBadge({ sender }: { sender: string }) {
  const colors: Record<string, string> = {
    isaac: "bg-indigo-500/20 text-indigo-300",
    asher: "bg-cyan-500/20 text-cyan-300",
  };
  return <span className={`px-2 py-0.5 rounded text-xs capitalize ${colors[sender] || "bg-zinc-500/20 text-zinc-300"}`}>{sender}</span>;
}
