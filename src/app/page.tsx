import { getStats, getRevenueStats, getStaleLeads, getMonthlyRevenue, getWeeklySummary } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [stats, revenue, staleLeads, monthlyRevenue, weekly] = await Promise.all([
    getStats(), getRevenueStats(), getStaleLeads(7), getMonthlyRevenue(), getWeeklySummary(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-1">Twenty1 Media outreach overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard label="Total Prospects" value={stats.totalProspects} />
        <StatCard label="Emails Sent" value={stats.totalSent} accent="blue" />
        <StatCard label="Active Leads" value={stats.activeLeads} accent="emerald" />
        <StatCard
          label="Pipeline Value"
          value={`$${stats.pipelineValue.toLocaleString()}`}
          accent="amber"
        />
        <StatCard
          label="Revenue"
          value={`$${revenue.total.revenue.toLocaleString()}`}
          accent="emerald"
        />
      </div>

      {/* Monthly Revenue Goal */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Monthly Goal
          </h2>
          <span className="text-xs text-zinc-500">
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
        </div>
        <div className="flex items-end gap-3 mb-3">
          <span className="text-3xl font-bold text-white">
            ${monthlyRevenue.revenue.toLocaleString()}
          </span>
          <span className="text-sm text-zinc-500 mb-1">/ $5,000</span>
        </div>
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              monthlyRevenue.revenue >= 5000 ? "bg-green-500" :
              monthlyRevenue.revenue >= 2500 ? "bg-emerald-500" :
              monthlyRevenue.revenue >= 1000 ? "bg-amber-500" : "bg-zinc-600"
            }`}
            style={{ width: `${Math.min(100, (monthlyRevenue.revenue / 5000) * 100)}%` }}
          />
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          {monthlyRevenue.deals} deal{monthlyRevenue.deals !== 1 ? "s" : ""} closed
          {monthlyRevenue.revenue >= 5000 ? " -- Goal hit!" : ` -- $${(5000 - monthlyRevenue.revenue).toLocaleString()} to go`}
        </p>
      </div>

      {/* Weekly Digest */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Last 7 Days
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MiniStat label="Emails Sent" value={weekly.emails_sent} />
          <MiniStat label="Opened" value={weekly.emails_opened} color={weekly.emails_opened > 0 ? "text-amber-400" : undefined} />
          <MiniStat label="Clicked" value={weekly.emails_clicked} color={weekly.emails_clicked > 0 ? "text-indigo-400" : undefined} />
          <MiniStat label="Bounced" value={weekly.emails_bounced} color={weekly.emails_bounced > 0 ? "text-red-400" : undefined} />
          <MiniStat label="New Prospects" value={weekly.new_prospects} />
          <MiniStat label="Status Changes" value={weekly.status_changes} />
          <MiniStat label="Deals Closed" value={weekly.deals_closed} color={weekly.deals_closed > 0 ? "text-green-400" : undefined} />
          <MiniStat label="Revenue" value={`$${weekly.revenue_closed.toLocaleString()}`} color={weekly.revenue_closed > 0 ? "text-green-400" : undefined} />
        </div>
      </div>

      {/* Revenue Tracker */}
      {(revenue.total.deals > 0 || revenue.recentDeals.length > 0) && (
        <div className="bg-zinc-900 border border-emerald-900/30 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-4">
            Revenue
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total */}
            <div>
              <p className="text-3xl font-bold text-white">${revenue.total.revenue.toLocaleString()}</p>
              <p className="text-xs text-zinc-500 mt-1">{revenue.total.deals} deal{revenue.total.deals !== 1 ? "s" : ""} closed</p>
              {revenue.total.deals > 0 && (
                <p className="text-xs text-zinc-600 mt-0.5">
                  Avg deal: ${Math.round(revenue.total.revenue / revenue.total.deals).toLocaleString()}
                </p>
              )}
            </div>

            {/* By sender */}
            {revenue.bySender.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">By Sender</p>
                <div className="space-y-2">
                  {revenue.bySender.map((s) => (
                    <div key={s.sent_by} className="flex items-center justify-between">
                      <span className="text-sm capitalize text-zinc-300">{s.sent_by}</span>
                      <div className="text-right">
                        <span className="text-sm font-medium text-white">${s.revenue.toLocaleString()}</span>
                        <span className="text-xs text-zinc-600 ml-1">({s.deals})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* By vertical */}
            {revenue.byVertical.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">By Vertical</p>
                <div className="space-y-2">
                  {revenue.byVertical.map((v) => (
                    <div key={v.vertical} className="flex items-center justify-between">
                      <span className="text-sm text-zinc-300">{v.vertical}</span>
                      <div className="text-right">
                        <span className="text-sm font-medium text-white">${v.revenue.toLocaleString()}</span>
                        <span className="text-xs text-zinc-600 ml-1">({v.deals})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent deals */}
          {revenue.recentDeals.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Recent Deals</p>
              <div className="space-y-2">
                {revenue.recentDeals.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-white">{d.business_name}</span>
                      <span className="text-xs text-zinc-600">{d.vertical}</span>
                      <span className="text-xs text-zinc-700 capitalize">({d.sent_by})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-600">{d.closed_at}</span>
                      <span className="font-medium text-green-400">${d.sale_price.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Verticals breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            By Vertical
          </h2>
          <div className="space-y-3">
            {(stats.byVertical as Array<{ vertical: string; count: number; active_leads: number }>).map(
              (v) => (
                <div key={v.vertical} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <VerticalBadge vertical={v.vertical} />
                    <span className="text-sm">{v.vertical}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {v.active_leads > 0 && (
                      <span className="text-xs text-emerald-400">{v.active_leads} active</span>
                    )}
                    <span className="text-sm text-zinc-400">{v.count} prospects</span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Status breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Pipeline Status
          </h2>
          <div className="space-y-3">
            {(stats.byStatus as Array<{ status: string; count: number }>).map((s) => (
              <div key={s.status} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusDot status={s.status} />
                  <span className="text-sm capitalize">{s.status.replace(/_/g, " ")}</span>
                </div>
                <span className="text-sm text-zinc-400">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* By Sender */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          By Sender
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {(stats.bySender as Array<{ sent_by: string; count: number; active_leads: number }>).map(
            (s) => (
              <Link
                key={s.sent_by}
                href={`/prospects?sent_by=${encodeURIComponent(s.sent_by)}`}
                className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-bold uppercase">
                    {s.sent_by[0]}
                  </div>
                  <div>
                    <span className="text-sm font-medium capitalize">{s.sent_by}</span>
                    <p className="text-xs text-zinc-500">{s.count} prospects</p>
                  </div>
                </div>
                {s.active_leads > 0 && (
                  <span className="text-xs text-emerald-400">{s.active_leads} active</span>
                )}
              </Link>
            )
          )}
        </div>
      </div>

      {/* Recent Responses */}
      {(stats.recentResponses as Array<{ id: number; business_name: string; prospect_email: string; response_type: string; summary: string; received_at: string; sent_by: string }>).length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Recent Responses
          </h2>
          <div className="space-y-3">
            {(stats.recentResponses as Array<{ id: number; business_name: string; prospect_email: string; response_type: string; summary: string; received_at: string; sent_by: string }>).map(
              (r) => (
                <div key={r.id} className="flex items-start gap-3 p-3 bg-zinc-800/50 rounded-lg">
                  <ResponseDot type={r.response_type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{r.business_name}</span>
                      <span className="text-xs text-zinc-500">{r.received_at}</span>
                      <span className="text-xs text-zinc-600 capitalize">({r.sent_by})</span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1 truncate">{r.summary}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                    r.response_type === "interested" ? "bg-emerald-500/20 text-emerald-300" :
                    r.response_type === "not_interested" ? "bg-red-500/20 text-red-300" :
                    r.response_type === "unsubscribe" ? "bg-red-700/20 text-red-400" :
                    "bg-blue-500/20 text-blue-300"
                  }`}>
                    {r.response_type.replace(/_/g, " ")}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Token costs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Est. Token Cost
          </h2>
          <p className="text-2xl font-bold text-amber-400">${stats.totalCost.toFixed(4)}</p>
          <p className="text-xs text-zinc-500 mt-1">Sonnet 4.6 email drafting</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Response Rate
          </h2>
          <p className="text-2xl font-bold">
            {stats.totalSent > 0
              ? ((stats.totalResponses / stats.totalSent) * 100).toFixed(1)
              : "0"}
            %
          </p>
          <p className="text-xs text-zinc-500 mt-1">{stats.totalResponses} responses / {stats.totalSent} sent</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            DNC List
          </h2>
          <p className="text-2xl font-bold text-red-400">{stats.doNotContact}</p>
          <p className="text-xs text-zinc-500 mt-1">Do not contact entries</p>
        </div>
      </div>

      {/* Stale Lead Alerts */}
      {staleLeads.length > 0 && (
        <div className="bg-zinc-900 border border-amber-900/30 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-4">
            Stale Leads -- No Activity in 7+ Days
          </h2>
          <div className="space-y-2">
            {staleLeads.slice(0, 10).map((lead) => (
              <div key={lead.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <Link href={`/prospects/${lead.id}`} className="text-sm font-medium text-white hover:text-emerald-400 truncate">
                    {lead.business_name}
                  </Link>
                  <span className="text-xs text-zinc-500 capitalize">{lead.status.replace(/_/g, " ")}</span>
                </div>
                <span className="text-xs text-amber-400 shrink-0">{lead.days_stale}d ago</span>
              </div>
            ))}
          </div>
          {staleLeads.length > 10 && (
            <p className="text-xs text-zinc-500 mt-3">{staleLeads.length - 10} more stale leads...</p>
          )}
        </div>
      )}

      {/* Quick links */}
      <div className="flex gap-3">
        <Link
          href="/prospects"
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-4 py-2 text-sm transition-colors"
        >
          View All Prospects
        </Link>
        <Link
          href="/emails"
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg px-4 py-2 text-sm transition-colors"
        >
          View Email Log
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "zinc",
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  const accentColors: Record<string, string> = {
    zinc: "text-white",
    blue: "text-blue-400",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accentColors[accent]}`}>{value}</p>
    </div>
  );
}

function VerticalBadge({ vertical }: { vertical: string }) {
  const colors: Record<string, string> = {
    Hospitality: "bg-blue-500/20 text-blue-400",
    Contractors: "bg-orange-500/20 text-orange-400",
    Agriculture: "bg-green-500/20 text-green-400",
    "Firearms/FFL": "bg-red-500/20 text-red-400",
    "Family Services": "bg-purple-500/20 text-purple-400",
    Other: "bg-zinc-500/20 text-zinc-400",
  };
  return (
    <span className={`w-2 h-2 rounded-full ${colors[vertical]?.split(" ")[0] || "bg-zinc-500/20"}`} />
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    prospected: "bg-zinc-500",
    followed_up: "bg-blue-500",
    active_lead: "bg-emerald-500",
    closed_won: "bg-green-500",
    closed_lost: "bg-red-500",
    do_not_contact: "bg-red-700",
  };
  return <span className={`w-2 h-2 rounded-full ${colors[status] || "bg-zinc-500"}`} />;
}

function ResponseDot({ type }: { type: string }) {
  const colors: Record<string, string> = {
    interested: "bg-emerald-500",
    reply: "bg-blue-500",
    not_interested: "bg-red-500",
    unsubscribe: "bg-red-700",
  };
  return <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${colors[type] || "bg-zinc-500"}`} />;
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color || "text-white"}`}>{value}</p>
    </div>
  );
}
