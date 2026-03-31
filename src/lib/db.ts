import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "crm.sqlite");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_name TEXT NOT NULL,
      city TEXT,
      state TEXT,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      vertical TEXT,
      status TEXT DEFAULT 'prospected',
      sent_by TEXT DEFAULT 'isaac',
      website_notes TEXT,
      notes TEXT,
      price_estimate REAL,
      sale_price REAL,
      closed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(email)
    );

    CREATE TABLE IF NOT EXISTS emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER REFERENCES prospects(id),
      type TEXT DEFAULT 'cold',
      subject TEXT,
      body TEXT,
      batch_name TEXT,
      batch_date TEXT,
      message_id TEXT,
      followup_date TEXT,
      sent_by TEXT DEFAULT 'isaac',
      status TEXT DEFAULT 'drafted',
      sent_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prospect_id INTEGER REFERENCES prospects(id),
      email_id INTEGER REFERENCES emails(id),
      gmail_id TEXT UNIQUE,
      response_type TEXT,
      subject TEXT,
      body TEXT,
      summary TEXT,
      from_email TEXT,
      received_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS token_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      task_type TEXT,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS do_not_contact (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// --- Query helpers ---

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

export function getStats() {
  const db = getDb();
  const totalProspects = db.prepare("SELECT COUNT(*) as count FROM prospects").get() as { count: number };
  const totalEmails = db.prepare("SELECT COUNT(*) as count FROM emails").get() as { count: number };
  const totalSent = db.prepare("SELECT COUNT(*) as count FROM emails WHERE status = 'sent'").get() as { count: number };
  const totalResponses = db.prepare("SELECT COUNT(*) as count FROM responses").get() as { count: number };
  const activeLeads = db.prepare("SELECT COUNT(*) as count FROM prospects WHERE status = 'active_lead'").get() as { count: number };
  const dnc = db.prepare("SELECT COUNT(*) as count FROM do_not_contact").get() as { count: number };

  const byVertical = db.prepare(`
    SELECT vertical, COUNT(*) as count,
           SUM(CASE WHEN status = 'active_lead' THEN 1 ELSE 0 END) as active_leads
    FROM prospects
    WHERE vertical IS NOT NULL
    GROUP BY vertical
    ORDER BY count DESC
  `).all();

  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM prospects GROUP BY status ORDER BY count DESC
  `).all();

  const emailsByDate = db.prepare(`
    SELECT batch_date as date, COUNT(*) as count
    FROM emails WHERE batch_date IS NOT NULL
    GROUP BY batch_date ORDER BY batch_date
  `).all();

  const totalCost = db.prepare("SELECT COALESCE(SUM(cost_usd), 0) as total FROM token_costs").get() as { total: number };

  const pipelineValue = db.prepare(`
    SELECT COALESCE(SUM(price_estimate), 0) as total FROM prospects WHERE status IN ('active_lead', 'prospected', 'followed_up')
  `).get() as { total: number };

  const bySender = db.prepare(`
    SELECT sent_by, COUNT(*) as count,
           SUM(CASE WHEN status = 'active_lead' THEN 1 ELSE 0 END) as active_leads
    FROM prospects
    WHERE sent_by IS NOT NULL
    GROUP BY sent_by
    ORDER BY count DESC
  `).all();

  const senders = db.prepare("SELECT DISTINCT sent_by FROM prospects WHERE sent_by IS NOT NULL ORDER BY sent_by").all() as { sent_by: string }[];

  const recentResponses = db.prepare(`
    SELECT r.*, p.business_name, p.email as prospect_email, p.sent_by
    FROM responses r
    JOIN prospects p ON p.id = r.prospect_id
    ORDER BY r.received_at DESC, r.id DESC
    LIMIT 10
  `).all();

  return {
    totalProspects: totalProspects.count,
    totalEmails: totalEmails.count,
    totalSent: totalSent.count,
    totalResponses: totalResponses.count,
    activeLeads: activeLeads.count,
    doNotContact: dnc.count,
    byVertical,
    byStatus,
    emailsByDate,
    totalCost: totalCost.total,
    pipelineValue: pipelineValue.total,
    bySender,
    senders: senders.map((s) => s.sent_by),
    recentResponses,
  };
}

export function getProspects(filters?: { vertical?: string; status?: string; search?: string; sent_by?: string }) {
  const db = getDb();
  let where = "WHERE 1=1";
  const params: Record<string, string> = {};

  if (filters?.vertical) {
    where += " AND p.vertical = @vertical";
    params.vertical = filters.vertical;
  }
  if (filters?.status) {
    where += " AND p.status = @status";
    params.status = filters.status;
  }
  if (filters?.sent_by) {
    where += " AND p.sent_by = @sent_by";
    params.sent_by = filters.sent_by;
  }
  if (filters?.search) {
    where += " AND (p.business_name LIKE @search OR p.contact_name LIKE @search OR p.email LIKE @search)";
    params.search = `%${filters.search}%`;
  }

  return db.prepare(`
    SELECT p.*,
           COUNT(e.id) as email_count,
           MAX(e.batch_date) as last_email_date
    FROM prospects p
    LEFT JOIN emails e ON e.prospect_id = p.id
    ${where}
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all(params) as ProspectRow[];
}

export function getEmails(filters?: { type?: string; status?: string; prospect_id?: number; sent_by?: string }) {
  const db = getDb();
  let where = "WHERE 1=1";
  const params: Record<string, string | number> = {};

  if (filters?.type) {
    where += " AND e.type = @type";
    params.type = filters.type;
  }
  if (filters?.status) {
    where += " AND e.status = @status";
    params.status = filters.status;
  }
  if (filters?.sent_by) {
    where += " AND e.sent_by = @sent_by";
    params.sent_by = filters.sent_by;
  }
  if (filters?.prospect_id) {
    where += " AND e.prospect_id = @prospect_id";
    params.prospect_id = filters.prospect_id;
  }

  return db.prepare(`
    SELECT e.*, p.business_name, p.contact_name, p.email
    FROM emails e
    LEFT JOIN prospects p ON p.id = e.prospect_id
    ${where}
    ORDER BY e.batch_date DESC, e.id DESC
  `).all(params) as EmailRow[];
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

export function getProspectById(id: number): ProspectRow | null {
  const db = getDb();
  return (db.prepare("SELECT * FROM prospects WHERE id = ?").get(id) as ProspectRow) || null;
}

export function getProspectThread(prospectId: number): ThreadMessage[] {
  const db = getDb();

  // Get all sent emails
  const sentEmails = db.prepare(`
    SELECT id, subject, body, COALESCE(sent_at, batch_date) as date, sent_by as sender, type, message_id, status
    FROM emails
    WHERE prospect_id = ?
    ORDER BY date ASC, id ASC
  `).all(prospectId) as Array<{
    id: number; subject: string | null; body: string | null; date: string | null;
    sender: string | null; type: string; message_id: string | null; status: string;
  }>;

  // Get all responses
  const responses = db.prepare(`
    SELECT id, subject, body, summary, from_email as sender, received_at as date, response_type
    FROM responses
    WHERE prospect_id = ?
    ORDER BY received_at ASC, id ASC
  `).all(prospectId) as Array<{
    id: number; subject: string | null; body: string | null; summary: string | null;
    sender: string | null; date: string | null; response_type: string | null;
  }>;

  // Merge into a single timeline
  const thread: ThreadMessage[] = [];

  for (const e of sentEmails) {
    thread.push({
      id: e.id,
      direction: "sent",
      subject: e.subject,
      body: e.body,
      date: e.date,
      sender: e.sender,
      type: e.type,
      message_id: e.message_id,
      status: e.status,
    });
  }

  for (const r of responses) {
    thread.push({
      id: r.id + 100000, // offset to avoid id collision
      direction: "received",
      subject: r.subject,
      body: r.body || r.summary,
      date: r.date,
      sender: r.sender,
      type: "response",
      response_type: r.response_type,
    });
  }

  // Sort by date
  thread.sort((a, b) => {
    const da = a.date || "0";
    const db2 = b.date || "0";
    if (da === db2) return a.direction === "sent" ? -1 : 1;
    return da.localeCompare(db2);
  });

  return thread;
}

export function getProspectResponses(prospectId: number): ResponseRow[] {
  const db = getDb();
  return db.prepare("SELECT * FROM responses WHERE prospect_id = ? ORDER BY received_at DESC").all(prospectId) as ResponseRow[];
}

export function getScorecard() {
  const db = getDb();

  // Overall response rate
  const overall = db.prepare(`
    SELECT
      COUNT(DISTINCT e.prospect_id) as total_prospects_emailed,
      COUNT(DISTINCT e.id) as total_emails_sent,
      COUNT(DISTINCT r.prospect_id) as prospects_who_replied,
      COUNT(DISTINCT r.id) as total_replies
    FROM emails e
    LEFT JOIN responses r ON r.prospect_id = e.prospect_id
    WHERE e.status = 'sent'
  `).get() as { total_prospects_emailed: number; total_emails_sent: number; prospects_who_replied: number; total_replies: number };

  // Response rate by vertical
  const byVertical = db.prepare(`
    SELECT
      p.vertical,
      COUNT(DISTINCT p.id) as prospects,
      COUNT(DISTINCT e.id) as emails_sent,
      COUNT(DISTINCT r.prospect_id) as replied,
      ROUND(COUNT(DISTINCT r.prospect_id) * 100.0 / NULLIF(COUNT(DISTINCT p.id), 0), 1) as reply_rate
    FROM prospects p
    JOIN emails e ON e.prospect_id = p.id AND e.status = 'sent'
    LEFT JOIN responses r ON r.prospect_id = p.id
    WHERE p.vertical IS NOT NULL
    GROUP BY p.vertical
    ORDER BY reply_rate DESC
  `).all() as Array<{ vertical: string; prospects: number; emails_sent: number; replied: number; reply_rate: number }>;

  // Response rate by sender
  const bySender = db.prepare(`
    SELECT
      p.sent_by,
      COUNT(DISTINCT p.id) as prospects,
      COUNT(DISTINCT e.id) as emails_sent,
      COUNT(DISTINCT r.prospect_id) as replied,
      ROUND(COUNT(DISTINCT r.prospect_id) * 100.0 / NULLIF(COUNT(DISTINCT p.id), 0), 1) as reply_rate
    FROM prospects p
    JOIN emails e ON e.prospect_id = p.id AND e.status = 'sent'
    LEFT JOIN responses r ON r.prospect_id = p.id
    WHERE p.sent_by IS NOT NULL
    GROUP BY p.sent_by
    ORDER BY reply_rate DESC
  `).all() as Array<{ sent_by: string; prospects: number; emails_sent: number; replied: number; reply_rate: number }>;

  // Response rate by state/region
  const byState = db.prepare(`
    SELECT
      p.state,
      COUNT(DISTINCT p.id) as prospects,
      COUNT(DISTINCT r.prospect_id) as replied,
      ROUND(COUNT(DISTINCT r.prospect_id) * 100.0 / NULLIF(COUNT(DISTINCT p.id), 0), 1) as reply_rate
    FROM prospects p
    JOIN emails e ON e.prospect_id = p.id AND e.status = 'sent'
    LEFT JOIN responses r ON r.prospect_id = p.id
    WHERE p.state IS NOT NULL
    GROUP BY p.state
    ORDER BY prospects DESC
  `).all() as Array<{ state: string; prospects: number; replied: number; reply_rate: number }>;

  // Subject line analysis — group by pattern and show performance
  const subjectPerformance = db.prepare(`
    SELECT
      e.subject,
      p.business_name,
      p.vertical,
      p.sent_by,
      e.batch_date,
      CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as got_reply,
      r.response_type
    FROM emails e
    JOIN prospects p ON p.id = e.prospect_id
    LEFT JOIN responses r ON r.prospect_id = p.id
    WHERE e.type = 'cold' AND e.status = 'sent'
    ORDER BY got_reply DESC, e.batch_date DESC
  `).all() as Array<{
    subject: string; business_name: string; vertical: string; sent_by: string;
    batch_date: string; got_reply: number; response_type: string | null;
  }>;

  // Personalization score — did subject contain contact name?
  const personalization = db.prepare(`
    SELECT
      CASE
        WHEN e.subject LIKE '%' || p.contact_name || '%' AND p.contact_name IS NOT NULL THEN 'personalized'
        ELSE 'generic'
      END as style,
      COUNT(DISTINCT p.id) as prospects,
      COUNT(DISTINCT r.prospect_id) as replied,
      ROUND(COUNT(DISTINCT r.prospect_id) * 100.0 / NULLIF(COUNT(DISTINCT p.id), 0), 1) as reply_rate
    FROM emails e
    JOIN prospects p ON p.id = e.prospect_id
    LEFT JOIN responses r ON r.prospect_id = p.id
    WHERE e.type = 'cold' AND e.status = 'sent'
    GROUP BY style
  `).all() as Array<{ style: string; prospects: number; replied: number; reply_rate: number }>;

  // Day of week performance
  const byDayOfWeek = db.prepare(`
    SELECT
      CASE CAST(strftime('%w', e.batch_date) AS INTEGER)
        WHEN 0 THEN 'Sunday'
        WHEN 1 THEN 'Monday'
        WHEN 2 THEN 'Tuesday'
        WHEN 3 THEN 'Wednesday'
        WHEN 4 THEN 'Thursday'
        WHEN 5 THEN 'Friday'
        WHEN 6 THEN 'Saturday'
      END as day_name,
      CAST(strftime('%w', e.batch_date) AS INTEGER) as day_num,
      COUNT(DISTINCT p.id) as prospects,
      COUNT(DISTINCT r.prospect_id) as replied,
      ROUND(COUNT(DISTINCT r.prospect_id) * 100.0 / NULLIF(COUNT(DISTINCT p.id), 0), 1) as reply_rate
    FROM emails e
    JOIN prospects p ON p.id = e.prospect_id
    LEFT JOIN responses r ON r.prospect_id = p.id
    WHERE e.type = 'cold' AND e.status = 'sent' AND e.batch_date IS NOT NULL
    GROUP BY day_num
    ORDER BY day_num
  `).all() as Array<{ day_name: string; day_num: number; prospects: number; replied: number; reply_rate: number }>;

  // Pipeline conversion funnel
  const funnel = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM prospects
    GROUP BY status
    ORDER BY
      CASE status
        WHEN 'prospected' THEN 1
        WHEN 'followed_up' THEN 2
        WHEN 'active_lead' THEN 3
        WHEN 'negotiating' THEN 4
        WHEN 'closed_won' THEN 5
        WHEN 'closed_lost' THEN 6
        WHEN 'do_not_contact' THEN 7
      END
  `).all() as Array<{ status: string; count: number }>;

  // Average emails before response
  const emailsBeforeReply = db.prepare(`
    SELECT
      r.prospect_id,
      COUNT(e.id) as emails_before_reply
    FROM responses r
    JOIN emails e ON e.prospect_id = r.prospect_id AND e.batch_date <= r.received_at
    WHERE e.status = 'sent'
    GROUP BY r.prospect_id
  `).all() as Array<{ prospect_id: number; emails_before_reply: number }>;

  const avgEmailsBeforeReply = emailsBeforeReply.length > 0
    ? emailsBeforeReply.reduce((sum, r) => sum + r.emails_before_reply, 0) / emailsBeforeReply.length
    : 0;

  return {
    overall,
    byVertical,
    bySender,
    byState,
    subjectPerformance,
    personalization,
    byDayOfWeek,
    funnel,
    avgEmailsBeforeReply,
  };
}

export function updateProspectStatus(id: number, status: string, notes?: string, salePrice?: number) {
  const db = getDb();
  const closedAt = status === "closed_won" ? new Date().toISOString().split("T")[0] : null;

  if (status === "closed_won" && salePrice !== undefined) {
    db.prepare(
      "UPDATE prospects SET status = ?, notes = ?, sale_price = ?, closed_at = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, notes || null, salePrice, closedAt, id);
  } else if (notes) {
    db.prepare(
      "UPDATE prospects SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, notes, id);
  } else {
    db.prepare(
      "UPDATE prospects SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(status, id);
  }
}

export function getRevenueStats() {
  const db = getDb();

  const total = db.prepare(`
    SELECT COALESCE(SUM(sale_price), 0) as revenue, COUNT(*) as deals
    FROM prospects WHERE status = 'closed_won' AND sale_price IS NOT NULL
  `).get() as { revenue: number; deals: number };

  const bySender = db.prepare(`
    SELECT sent_by, COALESCE(SUM(sale_price), 0) as revenue, COUNT(*) as deals
    FROM prospects WHERE status = 'closed_won' AND sale_price IS NOT NULL
    GROUP BY sent_by ORDER BY revenue DESC
  `).all() as Array<{ sent_by: string; revenue: number; deals: number }>;

  const byVertical = db.prepare(`
    SELECT vertical, COALESCE(SUM(sale_price), 0) as revenue, COUNT(*) as deals
    FROM prospects WHERE status = 'closed_won' AND sale_price IS NOT NULL
    GROUP BY vertical ORDER BY revenue DESC
  `).all() as Array<{ vertical: string; revenue: number; deals: number }>;

  const byMonth = db.prepare(`
    SELECT strftime('%Y-%m', closed_at) as month, COALESCE(SUM(sale_price), 0) as revenue, COUNT(*) as deals
    FROM prospects WHERE status = 'closed_won' AND sale_price IS NOT NULL AND closed_at IS NOT NULL
    GROUP BY month ORDER BY month DESC
  `).all() as Array<{ month: string; revenue: number; deals: number }>;

  const recentDeals = db.prepare(`
    SELECT business_name, contact_name, vertical, sent_by, sale_price, closed_at
    FROM prospects WHERE status = 'closed_won' AND sale_price IS NOT NULL
    ORDER BY closed_at DESC LIMIT 10
  `).all() as Array<{ business_name: string; contact_name: string | null; vertical: string; sent_by: string; sale_price: number; closed_at: string }>;

  return { total, bySender, byVertical, byMonth, recentDeals };
}
