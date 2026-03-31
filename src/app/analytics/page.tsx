import { getResendEmails, getResendDomains, getResendAnalytics, type ResendEmail } from "@/lib/resend";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  let emails: ResendEmail[] = [];
  let domains: Awaited<ReturnType<typeof getResendDomains>> = [];
  let error: string | null = null;

  try {
    [emails, domains] = await Promise.all([getResendEmails(), getResendDomains()]);
  } catch (e: unknown) {
    error = (e as { message?: string }).message || "Failed to fetch Resend data";
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl sm:text-2xl font-bold">Email Analytics</h1>
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-6 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  const analytics = getResendAnalytics(emails);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Email Analytics</h1>
        <p className="text-zinc-500 text-sm mt-1">Resend delivery data across all domains</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Sent" value={analytics.total} />
        <KpiCard label="Delivered" value={analytics.delivered + analytics.opened + analytics.clicked} accent="emerald" />
        <KpiCard label="Opened" value={analytics.opened + analytics.clicked} accent="blue" />
        <KpiCard label="Clicked" value={analytics.clicked} accent="indigo" />
        <KpiCard label="Bounced" value={analytics.bounced} accent={analytics.bounced > 0 ? "red" : "zinc"} />
        <KpiCard label="Complained" value={analytics.complained} accent={analytics.complained > 0 ? "red" : "zinc"} />
      </div>

      {/* Rate cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <RateCard label="Delivery Rate" rate={analytics.deliveryRate} good={95} warn={85} />
        <RateCard label="Open Rate" rate={analytics.openRate} good={20} warn={10} />
        <RateCard label="Bounce Rate" rate={analytics.bounceRate} good={2} warn={5} invert />
      </div>

      {/* Domains */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Domains</h2>
        <div className="space-y-3">
          {domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${d.status === "verified" ? "bg-emerald-500" : d.status === "pending" ? "bg-amber-500" : "bg-zinc-600"}`} />
                <span className="text-sm text-white">{d.name}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${
                d.status === "verified" ? "bg-emerald-500/20 text-emerald-300" :
                d.status === "pending" ? "bg-amber-500/20 text-amber-300" :
                "bg-zinc-500/20 text-zinc-400"
              }`}>
                {d.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Event */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">By Status</h2>
          <div className="space-y-2">
            {Object.entries(analytics.byEvent).sort(([,a], [,b]) => b - a).map(([event, count]) => (
              <div key={event} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <EventDot event={event} />
                  <span className="text-sm capitalize text-zinc-300">{event}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${eventColor(event)}`}
                      style={{ width: `${(count / analytics.total) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-zinc-400 w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Sender */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">By Sender</h2>
          <div className="space-y-3">
            {analytics.bySender.map((s) => (
              <div key={s.sender} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white break-all">{s.sender}</span>
                  <span className="text-xs text-zinc-500 shrink-0 ml-2">{s.total} sent</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-400">{s.delivered} delivered</span>
                  {s.opened > 0 && <span className="text-blue-400">{s.opened} opened</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity by Date */}
      {analytics.byDate.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Activity by Date</h2>
          <div className="flex items-end gap-1 sm:gap-2 h-32">
            {analytics.byDate.map((d) => {
              const maxCount = Math.max(...analytics.byDate.map((x) => x.total));
              const height = Math.max(8, (d.total / maxCount) * 100);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-zinc-500">{d.total}</span>
                  <div className="w-full flex flex-col-reverse gap-px" style={{ height: `${height}%` }}>
                    <div className="flex-1 bg-emerald-500/40 rounded-sm" />
                    {d.opened > 0 && (
                      <div className="bg-blue-500/60 rounded-sm" style={{ height: `${(d.opened / d.total) * 100}%` }} />
                    )}
                  </div>
                  <span className="text-[9px] sm:text-[10px] text-zinc-600 whitespace-nowrap">
                    {new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-zinc-600">
            <div className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500/40 rounded-sm" /> Delivered</div>
            <div className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500/60 rounded-sm" /> Opened</div>
          </div>
        </div>
      )}

      {/* Email log */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          All Emails <span className="text-zinc-600 font-normal">({emails.length})</span>
        </h2>
        <div className="space-y-2">
          {emails.map((e) => (
            <div key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 p-3 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/60 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <EventBadge event={e.last_event} />
                  <span className="text-sm text-white truncate">{e.subject}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-zinc-500">
                  <span className="break-all">{e.to.join(", ")}</span>
                  <span className="text-zinc-700">from</span>
                  <span className="break-all">{e.from}</span>
                </div>
              </div>
              <span className="text-xs text-zinc-600 shrink-0">
                {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent = "zinc" }: { label: string; value: number; accent?: string }) {
  const colors: Record<string, string> = {
    zinc: "text-white", emerald: "text-emerald-400", blue: "text-blue-400",
    indigo: "text-indigo-400", red: "text-red-400", amber: "text-amber-400",
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4">
      <p className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl sm:text-2xl font-bold mt-1 ${colors[accent]}`}>{value}</p>
    </div>
  );
}

function RateCard({ label, rate, good, warn, invert = false }: { label: string; rate: number; good: number; warn: number; invert?: boolean }) {
  let color: string;
  if (invert) {
    color = rate <= good ? "text-emerald-400" : rate <= warn ? "text-amber-400" : "text-red-400";
  } else {
    color = rate >= good ? "text-emerald-400" : rate >= warn ? "text-amber-400" : "text-red-400";
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl sm:text-4xl font-bold mt-1 ${color}`}>{rate.toFixed(1)}%</p>
    </div>
  );
}

function EventDot({ event }: { event: string }) {
  const colors: Record<string, string> = {
    delivered: "bg-emerald-500", opened: "bg-blue-500", clicked: "bg-indigo-500",
    bounced: "bg-red-500", complained: "bg-red-700", sent: "bg-zinc-500",
  };
  return <span className={`w-2 h-2 rounded-full ${colors[event] || "bg-zinc-500"}`} />;
}

function eventColor(event: string): string {
  const colors: Record<string, string> = {
    delivered: "bg-emerald-500", opened: "bg-blue-500", clicked: "bg-indigo-500",
    bounced: "bg-red-500", complained: "bg-red-700", sent: "bg-zinc-500",
  };
  return colors[event] || "bg-zinc-600";
}

function EventBadge({ event }: { event: string }) {
  const colors: Record<string, string> = {
    delivered: "bg-emerald-500/20 text-emerald-300",
    opened: "bg-blue-500/20 text-blue-300",
    clicked: "bg-indigo-500/20 text-indigo-300",
    bounced: "bg-red-500/20 text-red-300",
    complained: "bg-red-700/20 text-red-400",
    sent: "bg-zinc-500/20 text-zinc-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs capitalize shrink-0 ${colors[event] || colors.sent}`}>
      {event}
    </span>
  );
}
