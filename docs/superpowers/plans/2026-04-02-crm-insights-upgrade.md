# CRM Insights & Management Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Twenty1 CRM from a basic prospect list into a full command center with real-time activity feed, Kanban pipeline, open/click tracking, revenue goal tracking, stale lead alerts, and saved filter presets.

**Architecture:** Next.js 16 App Router with Supabase Postgres backend. All new features build on existing `db.ts` query layer and Resend webhook integration. New pages/components are server components where possible, client components only for interactivity (Kanban drag-drop, activity feed polling). No new dependencies except `@hello-pangea/dnd` for drag-and-drop.

**Tech Stack:** Next.js 16, React 19, Supabase, Tailwind CSS 4, TypeScript

---

## File Structure

```
src/
├── app/
│   ├── activity/
│   │   └── page.tsx                    # Live activity feed page
│   ├── api/
│   │   ├── activity/
│   │   │   └── route.ts                # Activity log API endpoint
│   │   ├── prospects/
│   │   │   ├── route.ts                # (modify) Add bulk update, saved filters
│   │   │   └── reorder/
│   │   │       └── route.ts            # Kanban stage reorder API
│   │   └── webhooks/
│   │       └── resend/
│   │           └── route.ts            # (modify) Log activity events, track opens/clicks
│   ├── pipeline/
│   │   ├── page.tsx                    # Kanban pipeline board (server shell)
│   │   └── kanban-board.tsx            # Kanban client component (drag-drop)
│   ├── page.tsx                        # (modify) Add revenue goal tracker, stale alerts
│   ├── layout.tsx                      # (modify) Add Pipeline + Activity nav links
│   ├── mobile-nav.tsx                  # (modify) Add Pipeline + Activity nav links
│   └── prospects/
│       ├── page.tsx                    # (modify) Add saved filter presets, open/click badges
│       └── [id]/
│           └── page.tsx                # (modify) Add engagement timeline, next action date
├── lib/
│   └── db.ts                           # (modify) Add activity, engagement, pipeline queries
```

**Supabase additions:**
- `activity_log` table — stores all CRM events (email sent, delivered, opened, clicked, bounced, status change)
- `saved_filters` table — user-saved filter presets
- New RPC functions for engagement scoring, stale lead detection, revenue goals

---

### Task 1: Activity Log Table & Logging Infrastructure

**Files:**
- Modify: `src/lib/db.ts` — add `logActivity()` and `getActivityFeed()` functions
- Modify: `src/app/api/webhooks/resend/route.ts` — log events to activity_log

- [ ] **Step 1: Create activity_log table in Supabase**

Run this SQL via Supabase MCP:

```sql
CREATE TABLE activity_log (
  id BIGSERIAL PRIMARY KEY,
  prospect_id BIGINT REFERENCES prospects(id),
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX idx_activity_log_prospect ON activity_log(prospect_id);
CREATE INDEX idx_activity_log_type ON activity_log(event_type);
```

- [ ] **Step 2: Add logActivity and getActivityFeed to db.ts**

Add to `src/lib/db.ts`:

```typescript
export async function logActivity(
  prospectId: number | null,
  eventType: string,
  eventData: Record<string, unknown> = {}
) {
  await supabase.from("activity_log").insert({
    prospect_id: prospectId,
    event_type: eventType,
    event_data: eventData,
  });
}

export async function getActivityFeed(limit = 50, offset = 0) {
  const { data } = await supabase
    .from("activity_log")
    .select("*, prospects(business_name, email)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return (data || []) as Array<{
    id: number;
    prospect_id: number | null;
    event_type: string;
    event_data: Record<string, unknown>;
    created_at: string;
    prospects: { business_name: string; email: string } | null;
  }>;
}
```

- [ ] **Step 3: Update Resend webhook to log activity events**

Modify `src/app/api/webhooks/resend/route.ts`. After each successful database operation, add an activity log call. Import `logActivity` from `@/lib/db`.

In the `email.sent` / `email.delivered` block, after inserting the email:

```typescript
await logActivity(prospectId, type.replace("email.", ""), {
  subject: data.subject,
  to: recipientEmail,
  from: data.from,
  message_id: data.email_id,
});
```

In the `email.bounced` block:

```typescript
await logActivity(null, "bounced", {
  to: recipientEmail,
  message_id: data.email_id,
});
```

In the `email.complained` block:

```typescript
await logActivity(null, "complained", {
  to: recipientEmail,
  message_id: data.email_id,
});
```

Add new handlers for `email.opened` and `email.clicked`:

```typescript
} else if (type === "email.opened" || type === "email.clicked") {
  // Find prospect by email
  const { data: prospect } = await supabase
    .from("prospects")
    .select("id")
    .eq("email", recipientEmail)
    .single();

  await logActivity(prospect?.id || null, type.replace("email.", ""), {
    to: recipientEmail,
    message_id: data.email_id,
  });
}
```

- [ ] **Step 4: Update status changes to log activity**

Modify `updateProspectStatus` in `src/lib/db.ts` to also log the status change:

```typescript
export async function updateProspectStatus(id: number, status: string, notes?: string, salePrice?: number) {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (notes) updates.notes = notes;
  if (status === "closed_won") {
    updates.closed_at = new Date().toISOString().split("T")[0];
    if (salePrice !== undefined) updates.sale_price = salePrice;
  }

  await supabase.from("prospects").update(updates).eq("id", id);

  await logActivity(id, "status_change", {
    new_status: status,
    sale_price: salePrice,
    notes,
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts src/app/api/webhooks/resend/route.ts
git commit -m "feat: add activity logging infrastructure"
```

---

### Task 2: Live Activity Feed Page

**Files:**
- Create: `src/app/activity/page.tsx`
- Create: `src/app/api/activity/route.ts`
- Modify: `src/app/layout.tsx` — add Activity nav link
- Modify: `src/app/mobile-nav.tsx` — add Activity nav link

- [ ] **Step 1: Create activity API route**

Create `src/app/api/activity/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getActivityFeed } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");
  const feed = await getActivityFeed(limit, offset);
  return NextResponse.json(feed);
}
```

- [ ] **Step 2: Create activity feed page**

Create `src/app/activity/page.tsx`:

```tsx
import { getActivityFeed } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const EVENT_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  sent: { label: "Email Sent", icon: "→", color: "text-blue-400 bg-blue-500/20" },
  delivered: { label: "Delivered", icon: "✓", color: "text-emerald-400 bg-emerald-500/20" },
  opened: { label: "Opened", icon: "◉", color: "text-amber-400 bg-amber-500/20" },
  clicked: { label: "Clicked", icon: "◈", color: "text-indigo-400 bg-indigo-500/20" },
  bounced: { label: "Bounced", icon: "✕", color: "text-red-400 bg-red-500/20" },
  complained: { label: "Spam Report", icon: "⚠", color: "text-red-400 bg-red-700/20" },
  status_change: { label: "Status Changed", icon: "⟳", color: "text-zinc-300 bg-zinc-500/20" },
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
```

- [ ] **Step 3: Add Activity link to navigation**

In `src/app/layout.tsx`, add after the Scorecard NavLink:

```tsx
<NavLink href="/activity">Activity</NavLink>
```

In `src/app/mobile-nav.tsx`, add to the LINKS array after Scorecard:

```typescript
{ href: "/activity", label: "Activity" },
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/activity/ src/app/api/activity/ src/app/layout.tsx src/app/mobile-nav.tsx
git commit -m "feat: add live activity feed page"
```

---

### Task 3: Open/Click Engagement Tracking

**Files:**
- Modify: `src/lib/db.ts` — add engagement query functions
- Modify: `src/app/prospects/page.tsx` — add engagement badges
- Modify: `src/app/prospects/[id]/page.tsx` — add engagement timeline

- [ ] **Step 1: Add engagement columns and queries**

Run SQL via Supabase MCP to create an engagement summary view:

```sql
CREATE OR REPLACE FUNCTION get_prospect_engagement(p_id BIGINT)
RETURNS TABLE(
  total_sent BIGINT,
  total_opened BIGINT,
  total_clicked BIGINT,
  last_opened_at TIMESTAMPTZ,
  last_clicked_at TIMESTAMPTZ
) AS $$
  SELECT
    (SELECT COUNT(*) FROM emails WHERE prospect_id = p_id AND status = 'sent') as total_sent,
    (SELECT COUNT(*) FROM activity_log WHERE prospect_id = p_id AND event_type = 'opened') as total_opened,
    (SELECT COUNT(*) FROM activity_log WHERE prospect_id = p_id AND event_type = 'clicked') as total_clicked,
    (SELECT MAX(created_at) FROM activity_log WHERE prospect_id = p_id AND event_type = 'opened') as last_opened_at,
    (SELECT MAX(created_at) FROM activity_log WHERE prospect_id = p_id AND event_type = 'clicked') as last_clicked_at;
$$ LANGUAGE sql;

-- Prospects with engagement data for list view
CREATE OR REPLACE FUNCTION get_prospects_with_engagement()
RETURNS TABLE(
  prospect_id BIGINT,
  opens BIGINT,
  clicks BIGINT,
  last_activity TIMESTAMPTZ
) AS $$
  SELECT
    a.prospect_id,
    COUNT(*) FILTER (WHERE a.event_type = 'opened') as opens,
    COUNT(*) FILTER (WHERE a.event_type = 'clicked') as clicks,
    MAX(a.created_at) as last_activity
  FROM activity_log a
  WHERE a.prospect_id IS NOT NULL
    AND a.event_type IN ('opened', 'clicked')
  GROUP BY a.prospect_id;
$$ LANGUAGE sql;
```

- [ ] **Step 2: Add engagement functions to db.ts**

Add to `src/lib/db.ts`:

```typescript
export async function getProspectEngagement(prospectId: number) {
  const { data } = await supabase.rpc("get_prospect_engagement", { p_id: prospectId });
  return (data?.[0] || { total_sent: 0, total_opened: 0, total_clicked: 0, last_opened_at: null, last_clicked_at: null }) as {
    total_sent: number;
    total_opened: number;
    total_clicked: number;
    last_opened_at: string | null;
    last_clicked_at: string | null;
  };
}

export async function getEngagementMap() {
  const { data } = await supabase.rpc("get_prospects_with_engagement");
  const map = new Map<number, { opens: number; clicks: number; last_activity: string }>();
  for (const row of (data || []) as Array<{ prospect_id: number; opens: number; clicks: number; last_activity: string }>) {
    map.set(row.prospect_id, { opens: row.opens, clicks: row.clicks, last_activity: row.last_activity });
  }
  return map;
}
```

- [ ] **Step 3: Add engagement badges to prospects list**

Modify `src/app/prospects/page.tsx`. Import `getEngagementMap` from `@/lib/db`. In the data fetching:

```typescript
const [prospects, stats, engagementMap] = await Promise.all([
  getProspects({ ... }),
  getStats(),
  getEngagementMap(),
]);
```

Add an `EngagementBadge` component at the bottom of the file:

```tsx
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
```

In both the mobile card and desktop table row, add the engagement badge. In the desktop table, add a new column header "Engagement" and render:

```tsx
<td className="py-3">
  <EngagementBadge
    opens={engagementMap.get(p.id)?.opens || 0}
    clicks={engagementMap.get(p.id)?.clicks || 0}
  />
</td>
```

- [ ] **Step 4: Add engagement to prospect detail page**

Modify `src/app/prospects/[id]/page.tsx`. Import `getProspectEngagement` from `@/lib/db`. Fetch alongside existing data:

```typescript
const [prospect, engagement] = await Promise.all([
  getProspectById(parseInt(id)),
  getProspectEngagement(parseInt(id)),
]);
if (!prospect) return notFound();
const thread = await getProspectThread(prospect.id);
```

Add engagement stats to the MetaBadge grid:

```tsx
<MetaBadge label="Opens" value={String(engagement.total_opened)} />
<MetaBadge label="Clicks" value={String(engagement.total_clicked)} />
```

- [ ] **Step 5: Build and commit**

```bash
npm run build
git add src/lib/db.ts src/app/prospects/page.tsx src/app/prospects/\[id\]/page.tsx
git commit -m "feat: add open/click engagement tracking to prospects"
```

---

### Task 4: Kanban Pipeline Board

**Files:**
- Create: `src/app/pipeline/page.tsx`
- Create: `src/app/pipeline/kanban-board.tsx`
- Create: `src/app/api/prospects/reorder/route.ts`
- Modify: `src/app/layout.tsx` — add Pipeline nav link
- Modify: `src/app/mobile-nav.tsx` — add Pipeline nav link

- [ ] **Step 1: Install drag-and-drop dependency**

```bash
npm install @hello-pangea/dnd
```

- [ ] **Step 2: Create reorder API route**

Create `src/app/api/prospects/reorder/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { updateProspectStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { id, status } = await req.json();
  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }
  await updateProspectStatus(id, status);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Create Kanban client component**

Create `src/app/pipeline/kanban-board.tsx`:

```tsx
"use client";

import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type Prospect = {
  id: number;
  business_name: string;
  contact_name: string | null;
  email: string | null;
  vertical: string | null;
  price_estimate: number | null;
  sale_price: number | null;
};

const COLUMNS = [
  { id: "prospected", label: "Prospected", color: "border-zinc-700" },
  { id: "followed_up", label: "Followed Up", color: "border-blue-700" },
  { id: "active_lead", label: "Active Lead", color: "border-emerald-700" },
  { id: "negotiating", label: "Negotiating", color: "border-amber-700" },
  { id: "closed_won", label: "Closed Won", color: "border-green-700" },
  { id: "closed_lost", label: "Closed Lost", color: "border-red-800" },
];

export function KanbanBoard({ prospects }: { prospects: (Prospect & { status: string })[] }) {
  const router = useRouter();
  const [items, setItems] = useState(prospects);
  const [saving, setSaving] = useState<number | null>(null);

  const columns = COLUMNS.map((col) => ({
    ...col,
    items: items.filter((p) => p.status === col.id),
    total: items
      .filter((p) => p.status === col.id)
      .reduce((sum, p) => sum + (p.status === "closed_won" ? (p.sale_price || 0) : (p.price_estimate || 0)), 0),
  }));

  async function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const id = parseInt(draggableId);
    const newStatus = destination.droppableId;

    // Optimistic update
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    setSaving(id);

    await fetch("/api/prospects/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });

    setSaving(null);
    router.refresh();
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 min-h-[calc(100vh-12rem)]">
        {columns.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-64 sm:w-72">
            <div className={`border-t-2 ${col.color} bg-zinc-900 rounded-xl p-3`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-zinc-300">{col.label}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">{col.items.length}</span>
                  {col.total > 0 && (
                    <span className="text-[10px] text-zinc-500">${col.total.toLocaleString()}</span>
                  )}
                </div>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`space-y-2 min-h-[100px] rounded-lg p-1 transition-colors ${
                      snapshot.isDraggingOver ? "bg-zinc-800/50" : ""
                    }`}
                  >
                    {col.items.map((prospect, index) => (
                      <Draggable key={prospect.id} draggableId={String(prospect.id)} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-zinc-800 border border-zinc-700 rounded-lg p-3 transition-shadow ${
                              snapshot.isDragging ? "shadow-xl shadow-black/50 ring-1 ring-emerald-500/50" : ""
                            } ${saving === prospect.id ? "opacity-50" : ""}`}
                          >
                            <Link href={`/prospects/${prospect.id}`} className="text-sm font-medium text-white hover:text-emerald-400 transition-colors">
                              {prospect.business_name}
                            </Link>
                            {prospect.contact_name && (
                              <p className="text-xs text-zinc-500 mt-0.5">{prospect.contact_name}</p>
                            )}
                            <div className="flex items-center justify-between mt-2">
                              {prospect.vertical && (
                                <span className="text-[10px] text-zinc-500">{prospect.vertical}</span>
                              )}
                              <span className="text-xs text-zinc-400">
                                ${(prospect.status === "closed_won" ? prospect.sale_price : prospect.price_estimate)?.toLocaleString() || "—"}
                              </span>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}
```

- [ ] **Step 4: Create pipeline page**

Create `src/app/pipeline/page.tsx`:

```tsx
import { getProspects } from "@/lib/db";
import { KanbanBoard } from "./kanban-board";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const prospects = await getProspects();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Pipeline</h1>
        <p className="text-zinc-500 text-sm mt-1">Drag prospects between stages</p>
      </div>
      <KanbanBoard
        prospects={prospects.map((p) => ({
          id: p.id,
          business_name: p.business_name,
          contact_name: p.contact_name,
          email: p.email,
          vertical: p.vertical,
          price_estimate: p.price_estimate,
          sale_price: p.sale_price,
          status: p.status,
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add Pipeline to navigation**

In `src/app/layout.tsx`, add before Prospects NavLink:

```tsx
<NavLink href="/pipeline">Pipeline</NavLink>
```

In `src/app/mobile-nav.tsx`, add to LINKS array after Dashboard:

```typescript
{ href: "/pipeline", label: "Pipeline" },
```

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/app/pipeline/ src/app/api/prospects/reorder/ src/app/layout.tsx src/app/mobile-nav.tsx package.json package-lock.json
git commit -m "feat: add Kanban pipeline board with drag-and-drop"
```

---

### Task 5: Revenue Goal Tracker & Stale Lead Alerts on Dashboard

**Files:**
- Modify: `src/lib/db.ts` — add stale leads query, revenue goal query
- Modify: `src/app/page.tsx` — add revenue goal progress bar, stale lead alerts

- [ ] **Step 1: Add stale leads and goal queries**

Run SQL via Supabase MCP:

```sql
CREATE OR REPLACE FUNCTION get_stale_leads(days_threshold INTEGER DEFAULT 7)
RETURNS TABLE(
  id BIGINT, business_name TEXT, email TEXT, vertical TEXT,
  status TEXT, sent_by TEXT, updated_at TIMESTAMPTZ, days_stale INTEGER
) AS $$
  SELECT p.id, p.business_name, p.email, p.vertical, p.status, p.sent_by, p.updated_at,
    EXTRACT(DAY FROM now() - p.updated_at)::INTEGER as days_stale
  FROM prospects p
  WHERE p.status IN ('prospected', 'followed_up', 'active_lead', 'negotiating')
    AND p.updated_at < now() - (days_threshold || ' days')::INTERVAL
  ORDER BY p.updated_at ASC;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION get_monthly_revenue(target_month TEXT DEFAULT NULL)
RETURNS TABLE(month TEXT, revenue NUMERIC, deals BIGINT) AS $$
  SELECT
    COALESCE(target_month, TO_CHAR(now(), 'YYYY-MM')) as month,
    COALESCE(SUM(sale_price), 0) as revenue,
    COUNT(*) as deals
  FROM prospects
  WHERE status = 'closed_won'
    AND sale_price IS NOT NULL
    AND TO_CHAR(closed_at::DATE, 'YYYY-MM') = COALESCE(target_month, TO_CHAR(now(), 'YYYY-MM'));
$$ LANGUAGE sql;
```

- [ ] **Step 2: Add functions to db.ts**

Add to `src/lib/db.ts`:

```typescript
export async function getStaleLeads(daysThreshold = 7) {
  const { data } = await supabase.rpc("get_stale_leads", { days_threshold: daysThreshold });
  return (data || []) as Array<{
    id: number; business_name: string; email: string; vertical: string;
    status: string; sent_by: string; updated_at: string; days_stale: number;
  }>;
}

export async function getMonthlyRevenue(month?: string) {
  const { data } = await supabase.rpc("get_monthly_revenue", { target_month: month || null });
  return (data?.[0] || { month: "", revenue: 0, deals: 0 }) as { month: string; revenue: number; deals: number };
}
```

- [ ] **Step 3: Add revenue goal tracker and stale alerts to dashboard**

Modify `src/app/page.tsx`. Import `getStaleLeads` and `getMonthlyRevenue`. Update the data fetch:

```typescript
const [stats, revenue, staleLeads, monthlyRevenue] = await Promise.all([
  getStats(),
  getRevenueStats(),
  getStaleLeads(7),
  getMonthlyRevenue(),
]);
```

Add the revenue goal section after the KPI cards (before the existing Revenue section). Use a $5,000 monthly target:

```tsx
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
    {monthlyRevenue.revenue >= 5000 ? " — Goal hit!" : ` — $${(5000 - monthlyRevenue.revenue).toLocaleString()} to go`}
  </p>
</div>
```

Add stale lead alerts before the quick links section:

```tsx
{/* Stale Lead Alerts */}
{staleLeads.length > 0 && (
  <div className="bg-zinc-900 border border-amber-900/30 rounded-xl p-6">
    <h2 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-4">
      Stale Leads — No Activity in 7+ Days
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
```

Add the `Link` import if not already present.

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add src/lib/db.ts src/app/page.tsx
git commit -m "feat: add revenue goal tracker and stale lead alerts"
```

---

### Task 6: Saved Filter Presets

**Files:**
- Create: `src/app/prospects/filter-presets.tsx` — client component for managing presets
- Modify: `src/lib/db.ts` — add saved_filters CRUD
- Modify: `src/app/prospects/page.tsx` — integrate filter presets

- [ ] **Step 1: Create saved_filters table**

Run SQL via Supabase MCP:

```sql
CREATE TABLE saved_filters (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  filters JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

- [ ] **Step 2: Add filter CRUD to db.ts**

Add to `src/lib/db.ts`:

```typescript
export async function getSavedFilters() {
  const { data } = await supabase
    .from("saved_filters")
    .select("*")
    .order("created_at", { ascending: false });
  return (data || []) as Array<{
    id: number;
    name: string;
    filters: Record<string, string>;
    created_at: string;
  }>;
}

export async function createSavedFilter(name: string, filters: Record<string, string>) {
  await supabase.from("saved_filters").insert({ name, filters });
}

export async function deleteSavedFilter(id: number) {
  await supabase.from("saved_filters").delete().eq("id", id);
}
```

- [ ] **Step 3: Create API routes for filter presets**

Add to `src/app/api/prospects/route.ts` — add a new export for filter management. Actually, create a dedicated route. Create `src/app/api/filters/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSavedFilters, createSavedFilter, deleteSavedFilter } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const filters = await getSavedFilters();
  return NextResponse.json(filters);
}

export async function POST(req: NextRequest) {
  const { name, filters } = await req.json();
  if (!name || !filters) {
    return NextResponse.json({ error: "name and filters required" }, { status: 400 });
  }
  await createSavedFilter(name, filters);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await deleteSavedFilter(id);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Create filter presets client component**

Create `src/app/prospects/filter-presets.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type SavedFilter = {
  id: number;
  name: string;
  filters: Record<string, string>;
};

export function FilterPresets({ presets }: { presets: SavedFilter[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const currentFilters: Record<string, string> = {};
  searchParams.forEach((value, key) => { currentFilters[key] = value; });
  const hasFilters = Object.keys(currentFilters).length > 0;

  async function savePreset() {
    if (!name.trim()) return;
    setSaving(true);
    await fetch("/api/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), filters: currentFilters }),
    });
    setSaving(false);
    setShowSave(false);
    setName("");
    router.refresh();
  }

  async function deletePreset(id: number) {
    await fetch("/api/filters", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  function applyPreset(filters: Record<string, string>) {
    const params = new URLSearchParams(filters);
    router.push(`/prospects?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((preset) => (
        <div key={preset.id} className="flex items-center gap-0.5 group">
          <button
            onClick={() => applyPreset(preset.filters)}
            className="px-2.5 py-1.5 rounded-l-full text-xs bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            {preset.name}
          </button>
          <button
            onClick={() => deletePreset(preset.id)}
            className="px-1.5 py-1.5 rounded-r-full text-xs bg-zinc-800 text-zinc-600 hover:text-red-400 hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
          >
            x
          </button>
        </div>
      ))}

      {hasFilters && !showSave && (
        <button
          onClick={() => setShowSave(true)}
          className="px-2.5 py-1.5 rounded-full text-xs border border-dashed border-zinc-700 text-zinc-500 hover:text-white hover:border-zinc-500 transition-colors"
        >
          + Save filter
        </button>
      )}

      {showSave && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Filter name..."
            autoFocus
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs w-32 focus:outline-none focus:border-emerald-500"
            onKeyDown={(e) => e.key === "Enter" && savePreset()}
          />
          <button
            onClick={savePreset}
            disabled={saving || !name.trim()}
            className="px-2.5 py-1.5 rounded-lg text-xs bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {saving ? "..." : "Save"}
          </button>
          <button
            onClick={() => setShowSave(false)}
            className="px-1.5 py-1.5 text-xs text-zinc-500 hover:text-white"
          >
            x
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Integrate presets into prospects page**

Modify `src/app/prospects/page.tsx`. Import `getSavedFilters` from `@/lib/db` and `FilterPresets` from `./filter-presets`. Add to the data fetch:

```typescript
const [prospects, stats, engagementMap, savedFilters] = await Promise.all([
  getProspects({ ... }),
  getStats(),
  getEngagementMap(),
  getSavedFilters(),
]);
```

Add the FilterPresets component after the search form:

```tsx
<FilterPresets presets={savedFilters} />
```

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/lib/db.ts src/app/prospects/page.tsx src/app/prospects/filter-presets.tsx src/app/api/filters/
git commit -m "feat: add saved filter presets for prospect views"
```

---

### Task 7: Enhanced Dashboard Weekly Digest View

**Files:**
- Modify: `src/lib/db.ts` — add weekly summary query
- Modify: `src/app/page.tsx` — add weekly digest section

- [ ] **Step 1: Add weekly summary RPC**

Run SQL via Supabase MCP:

```sql
CREATE OR REPLACE FUNCTION get_weekly_summary()
RETURNS TABLE(
  emails_sent BIGINT,
  emails_opened BIGINT,
  emails_clicked BIGINT,
  emails_bounced BIGINT,
  new_prospects BIGINT,
  status_changes BIGINT,
  deals_closed BIGINT,
  revenue_closed NUMERIC
) AS $$
  SELECT
    (SELECT COUNT(*) FROM emails WHERE created_at >= now() - INTERVAL '7 days' AND status = 'sent') as emails_sent,
    (SELECT COUNT(*) FROM activity_log WHERE created_at >= now() - INTERVAL '7 days' AND event_type = 'opened') as emails_opened,
    (SELECT COUNT(*) FROM activity_log WHERE created_at >= now() - INTERVAL '7 days' AND event_type = 'clicked') as emails_clicked,
    (SELECT COUNT(*) FROM activity_log WHERE created_at >= now() - INTERVAL '7 days' AND event_type = 'bounced') as emails_bounced,
    (SELECT COUNT(*) FROM prospects WHERE created_at >= now() - INTERVAL '7 days') as new_prospects,
    (SELECT COUNT(*) FROM activity_log WHERE created_at >= now() - INTERVAL '7 days' AND event_type = 'status_change') as status_changes,
    (SELECT COUNT(*) FROM prospects WHERE status = 'closed_won' AND closed_at IS NOT NULL AND closed_at::DATE >= CURRENT_DATE - 7) as deals_closed,
    (SELECT COALESCE(SUM(sale_price), 0) FROM prospects WHERE status = 'closed_won' AND sale_price IS NOT NULL AND closed_at IS NOT NULL AND closed_at::DATE >= CURRENT_DATE - 7) as revenue_closed;
$$ LANGUAGE sql;
```

- [ ] **Step 2: Add function to db.ts**

Add to `src/lib/db.ts`:

```typescript
export async function getWeeklySummary() {
  const { data } = await supabase.rpc("get_weekly_summary");
  return (data?.[0] || {
    emails_sent: 0, emails_opened: 0, emails_clicked: 0, emails_bounced: 0,
    new_prospects: 0, status_changes: 0, deals_closed: 0, revenue_closed: 0,
  }) as {
    emails_sent: number; emails_opened: number; emails_clicked: number; emails_bounced: number;
    new_prospects: number; status_changes: number; deals_closed: number; revenue_closed: number;
  };
}
```

- [ ] **Step 3: Add weekly digest to dashboard**

Modify `src/app/page.tsx`. Import `getWeeklySummary`. Add to the data fetch:

```typescript
const [stats, revenue, staleLeads, monthlyRevenue, weekly] = await Promise.all([
  getStats(), getRevenueStats(), getStaleLeads(7), getMonthlyRevenue(), getWeeklySummary(),
]);
```

Add the weekly digest section after the Monthly Goal section:

```tsx
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
```

Add the MiniStat component at the bottom of the file:

```tsx
function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${color || "text-white"}`}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Build and commit**

```bash
npm run build
git add src/lib/db.ts src/app/page.tsx
git commit -m "feat: add weekly digest and conversion funnel drop-off to dashboard"
```

---

### Task 8: Final Deploy & Verify

**Files:** None new — deploy and test

- [ ] **Step 1: Full build**

```bash
npm run build
```

- [ ] **Step 2: Commit any remaining changes**

```bash
git status
git add -A
git commit -m "chore: final cleanup for CRM insights upgrade"
```

- [ ] **Step 3: Push and deploy**

```bash
git push
npx vercel --prod --yes
```

- [ ] **Step 4: Verify all routes**

Test each page:
- `https://crm.twenty1-media.com/` — Dashboard with revenue goal, weekly digest, stale alerts
- `https://crm.twenty1-media.com/pipeline` — Kanban board
- `https://crm.twenty1-media.com/activity` — Activity feed
- `https://crm.twenty1-media.com/prospects` — Engagement badges, saved filters
- `https://crm.twenty1-media.com/api/webhooks/resend` — POST should return 200

- [ ] **Step 5: Replay failed Resend webhooks**

In the Resend dashboard, hit "Replay" on the failed webhook events to populate the activity feed with historical data.
