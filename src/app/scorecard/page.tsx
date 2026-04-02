import { getScorecard } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ScorecardPage() {
  const sc = await getScorecard();
  const replyRate = sc.overall.total_prospects_emailed > 0
    ? ((sc.overall.prospects_who_replied / sc.overall.total_prospects_emailed) * 100).toFixed(1)
    : "0";

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Outreach Scorecard</h1>
        <p className="text-zinc-500 text-sm mt-1">What&apos;s working, what&apos;s not, and where to improve</p>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KpiCard label="Prospects Emailed" value={sc.overall.total_prospects_emailed} />
        <KpiCard label="Total Emails" value={sc.overall.total_emails_sent} accent="blue" />
        <KpiCard label="Replies" value={sc.overall.prospects_who_replied} accent="emerald" />
        <KpiCard label="Reply Rate" value={`${replyRate}%`} accent={Number(replyRate) >= 5 ? "emerald" : Number(replyRate) >= 2 ? "amber" : "red"} />
        <KpiCard label="Avg Emails to Reply" value={sc.avgEmailsBeforeReply > 0 ? sc.avgEmailsBeforeReply.toFixed(1) : "—"} accent="blue" />
      </div>

      {/* Benchmark context */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-500">
          <span className="text-zinc-400 font-medium">Benchmarks:</span>{" "}
          Cold email reply rates average 1-5%. Above 5% is strong. Above 10% is exceptional.
          Your goal is to find what pushes you above 5% and double down.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Vertical */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Reply Rate by Vertical
          </h2>
          <div className="space-y-3">
            {sc.byVertical.map((v) => (
              <div key={v.vertical}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white">{v.vertical}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{v.replied}/{v.prospects} replied</span>
                    <span className={`text-sm font-bold ${rateColor(v.reply_rate)}`}>
                      {v.reply_rate || 0}%
                    </span>
                  </div>
                </div>
                <RateBar rate={v.reply_rate || 0} />
              </div>
            ))}
          </div>
        </div>

        {/* By Sender */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Reply Rate by Sender
          </h2>
          <div className="space-y-3">
            {sc.bySender.map((s) => (
              <div key={s.sent_by}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white capitalize">{s.sent_by}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{s.replied}/{s.prospects} replied</span>
                    <span className={`text-sm font-bold ${rateColor(s.reply_rate)}`}>
                      {s.reply_rate || 0}%
                    </span>
                  </div>
                </div>
                <RateBar rate={s.reply_rate || 0} />
              </div>
            ))}
          </div>
        </div>

        {/* By State */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Reply Rate by State
          </h2>
          <div className="space-y-3">
            {sc.byState.map((s) => (
              <div key={s.state} className="flex items-center justify-between">
                <span className="text-sm text-white">{s.state}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500">{s.replied}/{s.prospects}</span>
                  <span className={`text-sm font-bold ${rateColor(s.reply_rate)}`}>
                    {s.reply_rate || 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* By Day of Week */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
            Reply Rate by Day Sent
          </h2>
          <div className="space-y-3">
            {sc.byDayOfWeek.map((d) => (
              <div key={d.day_name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white">{d.day_name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500">{d.prospects} sent</span>
                    <span className={`text-sm font-bold ${rateColor(d.reply_rate)}`}>
                      {d.reply_rate || 0}%
                    </span>
                  </div>
                </div>
                <RateBar rate={d.reply_rate || 0} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Personalization impact */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Personalization Impact
        </h2>
        <p className="text-xs text-zinc-500 mb-4">Does using the contact&apos;s name in the subject line matter?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sc.personalization.map((p) => (
            <div key={p.style} className="p-4 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white capitalize">{p.style} Subject</span>
                <span className={`text-xl font-bold ${rateColor(p.reply_rate)}`}>
                  {p.reply_rate || 0}%
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">{p.replied}/{p.prospects} replied</p>
            </div>
          ))}
        </div>
      </div>

      {/* Conversion funnel */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Pipeline Funnel
        </h2>
        <div className="space-y-2">
          {sc.funnel.map((f) => {
            const maxCount = Math.max(...sc.funnel.map((x) => x.count));
            const width = Math.max(5, (f.count / maxCount) * 100);
            return (
              <div key={f.status} className="flex items-center gap-3">
                <span className="text-xs sm:text-sm text-zinc-400 w-20 sm:w-28 text-right capitalize shrink-0">
                  {f.status.replace(/_/g, " ")}
                </span>
                <div className="flex-1">
                  <div
                    className={`h-8 rounded flex items-center px-3 ${funnelColor(f.status)}`}
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-sm font-bold text-white">{f.count}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Subject line breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
          Subject Line Performance
        </h2>
        <p className="text-xs text-zinc-500 mb-4">Every cold email subject, sorted by reply</p>

        {/* Mobile: card layout */}
        <div className="sm:hidden space-y-2">
          {sc.subjectPerformance.map((s, i) => (
            <div key={i} className={`p-3 rounded-lg ${s.got_reply ? "bg-emerald-950/20 border border-emerald-900/30" : "bg-zinc-800/30"}`}>
              <div className="text-sm text-zinc-300 break-words">{s.subject}</div>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-zinc-500">
                <span>{s.business_name}</span>
                <span className="capitalize">({s.sent_by})</span>
                <span className="ml-auto">{s.batch_date}</span>
              </div>
              {s.got_reply && (
                <div className="mt-1.5">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    s.response_type === "interested" ? "bg-emerald-500/20 text-emerald-300" :
                    s.response_type === "not_interested" ? "bg-red-500/20 text-red-300" :
                    "bg-blue-500/20 text-blue-300"
                  }`}>{s.response_type?.replace(/_/g, " ") || "reply"}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop: table layout */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="pb-2 font-medium">Subject Line</th>
                <th className="pb-2 font-medium">Business</th>
                <th className="pb-2 font-medium">Vertical</th>
                <th className="pb-2 font-medium">Sender</th>
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium text-center">Reply</th>
              </tr>
            </thead>
            <tbody>
              {sc.subjectPerformance.map((s, i) => (
                <tr key={i} className={`border-b border-zinc-800/30 ${s.got_reply ? "bg-emerald-950/20" : ""}`}>
                  <td className="py-2 text-zinc-300 max-w-[300px] truncate">{s.subject}</td>
                  <td className="py-2 text-zinc-500">{s.business_name}</td>
                  <td className="py-2 text-zinc-500">{s.vertical}</td>
                  <td className="py-2 text-zinc-500 capitalize">{s.sent_by}</td>
                  <td className="py-2 text-zinc-600">{s.batch_date}</td>
                  <td className="py-2 text-center">
                    {s.got_reply ? (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        s.response_type === "interested" ? "bg-emerald-500/20 text-emerald-300" :
                        s.response_type === "not_interested" ? "bg-red-500/20 text-red-300" :
                        "bg-blue-500/20 text-blue-300"
                      }`}>
                        {s.response_type?.replace(/_/g, " ") || "reply"}
                      </span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outreach tips */}
      <div className="bg-zinc-900 border border-emerald-900/50 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-4">
          Recommendations
        </h2>
        <div className="space-y-4 text-sm text-zinc-300">
          <Tip
            title="Double down on what replies"
            text="Sort the subject table above by replies. Look for patterns — specific words, formats, or angles that got responses. Write more like those."
          />
          <Tip
            title="Test short vs. long subjects"
            text='Compare &quot;Quick thought on your website&quot; vs. specific hooks like &quot;Your Weebly site is costing you bookings, Melanie.&quot; Track which style gets more opens.'
          />
          <Tip
            title="Follow up matters most"
            text="Most replies come from follow-ups, not first touches. If your avg emails before reply is > 1, that confirms it. Never skip the follow-up."
          />
          <Tip
            title="Best verticals get more volume"
            text="Whichever vertical has the highest reply rate above — send 2x more there. Cut volume in verticals with 0% after 20+ sends."
          />
          <Tip
            title="Compare senders"
            text="If one sender consistently outperforms, study what they do differently — tone, timing, subject lines — and bring the other up."
          />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent = "zinc" }: { label: string; value: string | number; accent?: string }) {
  const colors: Record<string, string> = {
    zinc: "text-white", blue: "text-blue-400", emerald: "text-emerald-400",
    amber: "text-amber-400", red: "text-red-400",
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colors[accent]}`}>{value}</p>
    </div>
  );
}

function RateBar({ rate }: { rate: number }) {
  const width = Math.max(2, Math.min(rate * 4, 100)); // scale: 25% = full bar
  return (
    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${rate >= 10 ? "bg-emerald-500" : rate >= 5 ? "bg-emerald-600" : rate >= 2 ? "bg-amber-600" : "bg-zinc-600"}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function rateColor(rate: number): string {
  if (rate >= 10) return "text-emerald-400";
  if (rate >= 5) return "text-emerald-500";
  if (rate >= 2) return "text-amber-400";
  return "text-zinc-500";
}

function funnelColor(status: string): string {
  const colors: Record<string, string> = {
    prospected: "bg-zinc-700",
    followed_up: "bg-blue-700",
    active_lead: "bg-emerald-700",
    negotiating: "bg-amber-700",
    closed_won: "bg-green-600",
    closed_lost: "bg-red-800",
    do_not_contact: "bg-red-950",
  };
  return colors[status] || "bg-zinc-700";
}

function Tip({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-emerald-500 mt-0.5 shrink-0">&rsaquo;</span>
      <div>
        <span className="font-medium text-white">{title}</span>
        <p className="text-zinc-400 mt-0.5">{text}</p>
      </div>
    </div>
  );
}
