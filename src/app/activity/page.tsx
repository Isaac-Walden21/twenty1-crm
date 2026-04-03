import { getActivityFeed } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const EVENT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  sent: { label: "Email Sent", icon: "\u2192", color: "text-blue-400 bg-blue-500/20" },
  delivered: { label: "Delivered", icon: "\u2713", color: "text-emerald-400 bg-emerald-500/20" },
  opened: { label: "Opened", icon: "\u25C9", color: "text-amber-400 bg-amber-500/20" },
  clicked: { label: "Clicked", icon: "\u25C8", color: "text-indigo-400 bg-indigo-500/20" },
  bounced: { label: "Bounced", icon: "\u2715", color: "text-red-400 bg-red-500/20" },
  complained: { label: "Spam Report", icon: "\u26A0", color: "text-red-400 bg-red-700/20" },
  status_change: { label: "Status Changed", icon: "\u27F3", color: "text-zinc-300 bg-zinc-500/20" },
};

export default async function ActivityPage() {
  const feed = await getActivityFeed(100);

  // Group by date
  const grouped = new Map<string, typeof feed>();
  for (const item of feed) {
    const date = new Date(item.created_at).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    const existing = grouped.get(date) || [];
    existing.push(item);
    grouped.set(date, existing);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Activity Feed</h1>
        <p className="text-zinc-500 text-sm mt-1">Real-time view of all CRM events</p>
      </div>

      {feed.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl">
          No activity yet. Events will appear as emails are sent and tracked.
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, items]) => (
            <div key={date}>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-3 sticky top-16 bg-zinc-950 py-1 z-10">
                {date}
              </div>
              <div className="space-y-1">
                {items.map((item) => {
                  const config = EVENT_CONFIG[item.event_type] || EVENT_CONFIG.sent;
                  const data = item.event_data as Record<string, string>;
                  const time = new Date(item.created_at).toLocaleTimeString("en-US", {
                    hour: "numeric", minute: "2-digit",
                  });

                  return (
                    <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-zinc-900/50 transition-colors">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 mt-0.5 ${config.color}`}>
                        {config.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white">
                            {config.label}
                          </span>
                          {item.prospects ? (
                            <Link
                              href={`/prospects/${item.prospect_id}`}
                              className="text-sm text-emerald-400 hover:text-emerald-300 truncate"
                            >
                              {item.prospects.business_name}
                            </Link>
                          ) : (
                            <span className="text-sm text-zinc-500 truncate">
                              {data.to || "Unknown"}
                            </span>
                          )}
                        </div>
                        {data.subject && (
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">{data.subject}</p>
                        )}
                        {item.event_type === "status_change" && (
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Changed to <span className="text-zinc-300 capitalize">{(data.new_status || "").replace(/_/g, " ")}</span>
                            {data.sale_price && <span className="text-green-400 ml-1">${Number(data.sale_price).toLocaleString()}</span>}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-600 shrink-0">{time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
