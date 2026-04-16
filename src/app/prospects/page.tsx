import { getProspects, getStats, getEngagementMap, getSavedFilters } from "@/lib/db";
import Link from "next/link";
import { StatusUpdater } from "./status-updater";
import { FilterPresets } from "./filter-presets";
import { ExpandableThread } from "./expandable-thread";
import { ProspectTable } from "./prospect-table";

export const dynamic = "force-dynamic";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ vertical?: string; status?: string; search?: string; sent_by?: string }>;
}) {
  const params = await searchParams;
  const [rawProspects, stats, engagementMap, savedFilters] = await Promise.all([
    getProspects({
      vertical: params.vertical,
      status: params.status,
      search: params.search,
      sent_by: params.sent_by,
    }),
    getStats(),
    getEngagementMap(),
    getSavedFilters(),
  ]);

  // Sort priority leads (bad-platform sites) to the top.
  // Priority flag lives in notes.priority (set by import-apollo-csv when a Wix/Squarespace/etc site is detected).
  function isPriority(notes: string | null): boolean {
    if (!notes) return false;
    try {
      return JSON.parse(notes).priority === true;
    } catch {
      return false;
    }
  }
  const prospects = [...rawProspects].sort((a, b) => {
    const aPri = isPriority(a.notes) ? 1 : 0;
    const bPri = isPriority(b.notes) ? 1 : 0;
    return bPri - aPri;
  });

  const verticals = ["Hospitality", "Contractors", "Agriculture", "Firearms/FFL", "Family Services"];
  const statuses = ["prospected", "followed_up", "active_lead", "closed_won", "closed_lost"];
  const senders = stats.senders as string[];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Prospects</h1>
        <p className="text-zinc-500 text-sm mt-1">{prospects.length} total</p>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <FilterLink href="/prospects" label="All" active={!params.vertical && !params.status && !params.sent_by} />
          {verticals.map((v) => (
            <FilterLink
              key={v}
              href={`/prospects?vertical=${encodeURIComponent(v)}`}
              label={v}
              active={params.vertical === v}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <span className="text-xs text-zinc-600 py-1">Status:</span>
          {statuses.map((s) => (
            <FilterLink
              key={s}
              href={`/prospects?status=${s}`}
              label={s.replace(/_/g, " ")}
              active={params.status === s}
            />
          ))}
          {senders.length > 1 && (
            <>
              <span className="text-zinc-700 mx-0.5">|</span>
              {senders.map((s) => (
                <FilterLink
                  key={s}
                  href={`/prospects?sent_by=${encodeURIComponent(s)}`}
                  label={s}
                  active={params.sent_by === s}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Search */}
      <form className="flex gap-2">
        <input
          type="text"
          name="search"
          placeholder="Search..."
          defaultValue={params.search || ""}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm flex-1 focus:outline-none focus:border-emerald-500"
        />
        <button
          type="submit"
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-lg text-sm transition-colors"
        >
          Search
        </button>
      </form>

      {/* Saved filter presets */}
      <FilterPresets presets={savedFilters} />

      {/* Mobile: Card layout */}
      <div className="sm:hidden space-y-3">
        {prospects.map((p) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/prospects/${p.id}`} className="font-medium text-white hover:text-emerald-400 transition-colors text-sm">
                  {p.business_name}
                </Link>
                <div className="text-xs text-zinc-500 truncate">{p.email}</div>
              </div>
              <div className="shrink-0">
                <StatusUpdater id={p.id} currentStatus={p.status} currentNotes={p.notes || ""} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VerticalBadge vertical={p.vertical || "Other"} />
              <SenderBadge sender={p.sent_by || "isaac"} />
              {p.contact_name && <span className="text-xs text-zinc-500">{p.contact_name}</span>}
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <div className="flex items-center gap-2">
                <span>{p.city && p.state ? `${p.city}, ${p.state}` : p.state || ""}</span>
                <EngagementBadge
                  opens={engagementMap.get(p.id)?.opens || 0}
                  clicks={engagementMap.get(p.id)?.clicks || 0}
                />
              </div>
              <span className="text-zinc-400">${p.price_estimate?.toLocaleString() || "—"}</span>
            </div>
            <ExpandableThread prospectId={p.id} emailCount={p.email_count || 0} businessName={p.business_name} />
          </div>
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden sm:block overflow-x-auto">
        <ProspectTable
          prospects={prospects.map((p) => ({
            id: p.id,
            business_name: p.business_name,
            contact_name: p.contact_name,
            email: p.email,
            city: p.city,
            state: p.state,
            vertical: p.vertical,
            status: p.status,
            sent_by: p.sent_by,
            notes: p.notes,
            email_count: p.email_count || 0,
            last_email_date: p.last_email_date || null,
            price_estimate: p.price_estimate,
          }))}
          engagementData={Object.fromEntries(
            prospects.map((p) => [p.id, engagementMap.get(p.id) || { opens: 0, clicks: 0 }])
          )}
        />
      </div>

      {prospects.length === 0 && (
        <div className="text-center py-12 text-zinc-500">No prospects match your filters.</div>
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
