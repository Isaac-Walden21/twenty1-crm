import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export { supabase };

// --- Types ---

export interface ProspectRow {
  id: number;
  business_name: string;
  city: string | null;
  state: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  vertical: string | null;
  status: string;
  sent_by: string | null;
  website_notes: string | null;
  notes: string | null;
  price_estimate: number | null;
  sale_price: number | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  email_count?: number;
  last_email_date?: string;
}

export interface EmailRow {
  id: number;
  prospect_id: number | null;
  type: string;
  subject: string | null;
  body: string | null;
  batch_name: string | null;
  batch_date: string | null;
  message_id: string | null;
  followup_date: string | null;
  sent_by: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  business_name?: string;
  contact_name?: string;
  email?: string;
}

export interface ResponseRow {
  id: number;
  prospect_id: number;
  email_id: number | null;
  gmail_id: string | null;
  response_type: string | null;
  subject: string | null;
  body: string | null;
  summary: string | null;
  from_email: string | null;
  received_at: string | null;
  created_at: string;
}

export interface ThreadMessage {
  id: number;
  direction: "sent" | "received";
  subject: string | null;
  body: string | null;
  date: string | null;
  sender: string | null;
  type: string | null;
  response_type?: string | null;
  message_id?: string | null;
  status?: string | null;
}

// --- Query helpers ---

export async function getStats() {
  const [
    { count: totalProspects },
    { count: totalEmails },
    { count: totalSent },
    { count: totalResponses },
    { count: activeLeads },
    { count: dnc },
  ] = await Promise.all([
    supabase.from("prospects").select("*", { count: "exact", head: true }).then(r => ({ count: r.count ?? 0 })),
    supabase.from("emails").select("*", { count: "exact", head: true }).then(r => ({ count: r.count ?? 0 })),
    supabase.from("emails").select("*", { count: "exact", head: true }).eq("status", "sent").then(r => ({ count: r.count ?? 0 })),
    supabase.from("responses").select("*", { count: "exact", head: true }).then(r => ({ count: r.count ?? 0 })),
    supabase.from("prospects").select("*", { count: "exact", head: true }).eq("status", "active_lead").then(r => ({ count: r.count ?? 0 })),
    supabase.from("do_not_contact").select("*", { count: "exact", head: true }).then(r => ({ count: r.count ?? 0 })),
  ]);

  // Complex aggregations via RPC
  const { data: byVertical } = await supabase.rpc("stats_by_vertical");
  const { data: byStatus } = await supabase.rpc("stats_by_status");
  const { data: emailsByDate } = await supabase.rpc("stats_emails_by_date");
  const { data: costRow } = await supabase.rpc("stats_total_cost");
  const { data: pipelineRow } = await supabase.rpc("stats_pipeline_value");
  const { data: bySender } = await supabase.rpc("stats_by_sender");
  const { data: recentResponses } = await supabase.rpc("stats_recent_responses");

  const { data: senderRows } = await supabase
    .from("prospects")
    .select("sent_by")
    .not("sent_by", "is", null)
    .order("sent_by");
  const senders = [...new Set((senderRows || []).map((s: { sent_by: string }) => s.sent_by))];

  return {
    totalProspects,
    totalEmails,
    totalSent,
    totalResponses,
    activeLeads,
    doNotContact: dnc,
    byVertical: byVertical || [],
    byStatus: byStatus || [],
    emailsByDate: emailsByDate || [],
    totalCost: costRow?.[0]?.total ?? 0,
    pipelineValue: pipelineRow?.[0]?.total ?? 0,
    bySender: bySender || [],
    senders,
    recentResponses: recentResponses || [],
  };
}

export async function getProspects(filters?: { vertical?: string; status?: string; search?: string; sent_by?: string }) {
  const { data } = await supabase.rpc("get_prospects_with_emails", {
    p_vertical: filters?.vertical || null,
    p_status: filters?.status || null,
    p_search: filters?.search || null,
    p_sent_by: filters?.sent_by || null,
  });
  return (data || []) as ProspectRow[];
}

export async function getEmails(filters?: { type?: string; status?: string; prospect_id?: number; sent_by?: string }) {
  let query = supabase
    .from("emails")
    .select("*, prospects(business_name, contact_name, email)")
    .order("batch_date", { ascending: false })
    .order("id", { ascending: false });

  if (filters?.type) query = query.eq("type", filters.type);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.sent_by) query = query.eq("sent_by", filters.sent_by);
  if (filters?.prospect_id) query = query.eq("prospect_id", filters.prospect_id);

  const { data } = await query;

  return (data || []).map((e: Record<string, unknown>) => {
    const prospect = e.prospects as { business_name?: string; contact_name?: string; email?: string } | null;
    return {
      ...e,
      business_name: prospect?.business_name,
      contact_name: prospect?.contact_name,
      email: prospect?.email,
      prospects: undefined,
    };
  }) as unknown as EmailRow[];
}

export async function getProspectById(id: number): Promise<ProspectRow | null> {
  const { data } = await supabase.from("prospects").select("*").eq("id", id).single();
  return data as ProspectRow | null;
}

export async function getProspectThread(prospectId: number): Promise<ThreadMessage[]> {
  const [{ data: sentEmails }, { data: responses }] = await Promise.all([
    supabase
      .from("emails")
      .select("id, subject, body, sent_at, batch_date, sent_by, type, message_id, status")
      .eq("prospect_id", prospectId)
      .order("batch_date")
      .order("id"),
    supabase
      .from("responses")
      .select("id, subject, body, summary, from_email, received_at, response_type")
      .eq("prospect_id", prospectId)
      .order("received_at")
      .order("id"),
  ]);

  const thread: ThreadMessage[] = [];

  for (const e of sentEmails || []) {
    thread.push({
      id: e.id,
      direction: "sent",
      subject: e.subject,
      body: e.body,
      date: e.sent_at || e.batch_date,
      sender: e.sent_by,
      type: e.type,
      message_id: e.message_id,
      status: e.status,
    });
  }

  for (const r of responses || []) {
    thread.push({
      id: r.id + 100000,
      direction: "received",
      subject: r.subject,
      body: r.body || r.summary,
      date: r.received_at,
      sender: r.from_email,
      type: "response",
      response_type: r.response_type,
    });
  }

  thread.sort((a, b) => {
    const da = a.date || "0";
    const db2 = b.date || "0";
    if (da === db2) return a.direction === "sent" ? -1 : 1;
    return da.localeCompare(db2);
  });

  return thread;
}

export async function getProspectResponses(prospectId: number): Promise<ResponseRow[]> {
  const { data } = await supabase
    .from("responses")
    .select("*")
    .eq("prospect_id", prospectId)
    .order("received_at", { ascending: false });
  return (data || []) as ResponseRow[];
}

export async function getScorecard() {
  const { data: overall } = await supabase.rpc("scorecard_overall");
  const { data: byVertical } = await supabase.rpc("scorecard_by_vertical");
  const { data: bySender } = await supabase.rpc("scorecard_by_sender");
  const { data: byState } = await supabase.rpc("scorecard_by_state");
  const { data: subjectPerformance } = await supabase.rpc("scorecard_subject_performance");
  const { data: personalization } = await supabase.rpc("scorecard_personalization");
  const { data: byDayOfWeek } = await supabase.rpc("scorecard_by_day_of_week");
  const { data: funnel } = await supabase.rpc("scorecard_funnel");
  const { data: emailsBeforeReply } = await supabase.rpc("scorecard_emails_before_reply");

  const avgEmailsBeforeReply = emailsBeforeReply && emailsBeforeReply.length > 0
    ? emailsBeforeReply.reduce((sum: number, r: { emails_before_reply: number }) => sum + r.emails_before_reply, 0) / emailsBeforeReply.length
    : 0;

  return {
    overall: (overall?.[0] || { total_prospects_emailed: 0, total_emails_sent: 0, prospects_who_replied: 0, total_replies: 0 }) as { total_prospects_emailed: number; total_emails_sent: number; prospects_who_replied: number; total_replies: number },
    byVertical: (byVertical || []) as Array<{ vertical: string; prospects: number; emails_sent: number; replied: number; reply_rate: number }>,
    bySender: (bySender || []) as Array<{ sent_by: string; prospects: number; emails_sent: number; replied: number; reply_rate: number }>,
    byState: (byState || []) as Array<{ state: string; prospects: number; replied: number; reply_rate: number }>,
    subjectPerformance: (subjectPerformance || []) as Array<{ subject: string; business_name: string; vertical: string; sent_by: string; batch_date: string; got_reply: number; response_type: string | null }>,
    personalization: (personalization || []) as Array<{ style: string; prospects: number; replied: number; reply_rate: number }>,
    byDayOfWeek: (byDayOfWeek || []) as Array<{ day_name: string; day_num: number; prospects: number; replied: number; reply_rate: number }>,
    funnel: (funnel || []) as Array<{ status: string; count: number }>,
    avgEmailsBeforeReply,
  };
}

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
}

export async function getRevenueStats() {
  const { data: totalRow } = await supabase.rpc("revenue_total");
  const { data: bySender } = await supabase.rpc("revenue_by_sender");
  const { data: byVertical } = await supabase.rpc("revenue_by_vertical");
  const { data: byMonth } = await supabase.rpc("revenue_by_month");
  const { data: recentDeals } = await supabase
    .from("prospects")
    .select("business_name, contact_name, vertical, sent_by, sale_price, closed_at")
    .eq("status", "closed_won")
    .not("sale_price", "is", null)
    .order("closed_at", { ascending: false })
    .limit(10);

  return {
    total: (totalRow?.[0] || { revenue: 0, deals: 0 }) as { revenue: number; deals: number },
    bySender: (bySender || []) as Array<{ sent_by: string; revenue: number; deals: number }>,
    byVertical: (byVertical || []) as Array<{ vertical: string; revenue: number; deals: number }>,
    byMonth: (byMonth || []) as Array<{ month: string; revenue: number; deals: number }>,
    recentDeals: (recentDeals || []) as Array<{ business_name: string; contact_name: string | null; vertical: string; sent_by: string; sale_price: number; closed_at: string }>,
  };
}
