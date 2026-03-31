import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  sender?: string;
  replyToMessageId?: string;
}

const SENDER_EMAILS: Record<string, string> = {
  isaac: "Isaac Walden <isaac@twenty1-media.com>",
  asher: "Asher <asher@twenty1-media.com>",
};

export async function sendEmailViaResend(params: SendEmailParams): Promise<{ id: string }> {
  const from = SENDER_EMAILS[params.sender || "isaac"] || SENDER_EMAILS.isaac;

  const res = await getResend().emails.send({
    from,
    to: [params.to],
    subject: params.subject,
    text: params.body,
    ...(params.replyToMessageId ? { headers: { "In-Reply-To": params.replyToMessageId, References: params.replyToMessageId } } : {}),
  });

  if (res.error) {
    throw new Error(res.error.message || "Resend send failed");
  }

  return { id: res.data?.id || "" };
}

export interface ResendEmail {
  id: string;
  to: string[];
  from: string;
  subject: string;
  created_at: string;
  last_event: string;
  bcc: string[];
  cc: string[];
  reply_to: string[];
  scheduled_at: string | null;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: string;
  created_at: string;
  region: string;
}

export async function getResendEmails(): Promise<ResendEmail[]> {
  const all: ResendEmail[] = [];

  // Resend paginates — fetch all pages
  const res = await getResend().emails.list();
  if (res.data?.data) {
    all.push(...(res.data.data as unknown as ResendEmail[]));
  }

  return all;
}

export async function getResendEmailDetail(id: string) {
  const res = await getResend().emails.get(id);
  return res.data;
}

export async function getResendDomains(): Promise<ResendDomain[]> {
  const res = await getResend().domains.list();
  return (res.data?.data || []) as unknown as ResendDomain[];
}

export function getResendAnalytics(emails: ResendEmail[]) {
  const total = emails.length;
  const delivered = emails.filter((e) => e.last_event === "delivered").length;
  const opened = emails.filter((e) => e.last_event === "opened").length;
  const clicked = emails.filter((e) => e.last_event === "clicked").length;
  const bounced = emails.filter((e) => e.last_event === "bounced").length;
  const complained = emails.filter((e) => e.last_event === "complained").length;

  // By event type
  const byEvent = new Map<string, number>();
  for (const e of emails) {
    byEvent.set(e.last_event, (byEvent.get(e.last_event) || 0) + 1);
  }

  // By sender (from field)
  const bySender = new Map<string, { total: number; delivered: number; opened: number }>();
  for (const e of emails) {
    const sender = e.from.match(/<([^>]+)>/)?.[1] || e.from;
    const existing = bySender.get(sender) || { total: 0, delivered: 0, opened: 0 };
    existing.total++;
    if (e.last_event === "delivered" || e.last_event === "opened" || e.last_event === "clicked") existing.delivered++;
    if (e.last_event === "opened" || e.last_event === "clicked") existing.opened++;
    bySender.set(sender, existing);
  }

  // By domain (from field domain)
  const byDomain = new Map<string, { total: number; delivered: number }>();
  for (const e of emails) {
    const domain = (e.from.match(/@([^>]+)/)?.[1] || "unknown").replace(">", "");
    const existing = byDomain.get(domain) || { total: 0, delivered: 0 };
    existing.total++;
    if (e.last_event !== "bounced" && e.last_event !== "complained") existing.delivered++;
    byDomain.set(domain, existing);
  }

  // By date
  const byDate = new Map<string, { total: number; delivered: number; opened: number }>();
  for (const e of emails) {
    const date = e.created_at.split("T")[0].split(" ")[0];
    const existing = byDate.get(date) || { total: 0, delivered: 0, opened: 0 };
    existing.total++;
    if (e.last_event === "delivered" || e.last_event === "opened" || e.last_event === "clicked") existing.delivered++;
    if (e.last_event === "opened" || e.last_event === "clicked") existing.opened++;
    byDate.set(date, existing);
  }

  // By recipient
  const byRecipient = new Map<string, { total: number; last_event: string; last_subject: string }>();
  for (const e of emails) {
    for (const to of e.to) {
      const existing = byRecipient.get(to);
      if (!existing || e.created_at > (existing as { created_at?: string }).created_at!) {
        byRecipient.set(to, { total: (existing?.total || 0) + 1, last_event: e.last_event, last_subject: e.subject });
      } else {
        existing.total++;
      }
    }
  }

  return {
    total,
    delivered,
    opened,
    clicked,
    bounced,
    complained,
    deliveryRate: total > 0 ? ((delivered + opened + clicked) / total * 100) : 0,
    openRate: delivered > 0 ? (opened + clicked) / (delivered + opened + clicked) * 100 : 0,
    bounceRate: total > 0 ? (bounced / total * 100) : 0,
    byEvent: Object.fromEntries(byEvent),
    bySender: Array.from(bySender.entries()).map(([sender, data]) => ({ sender, ...data })),
    byDomain: Array.from(byDomain.entries()).map(([domain, data]) => ({ domain, ...data })),
    byDate: Array.from(byDate.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byRecipient: Array.from(byRecipient.entries())
      .map(([email, data]) => ({ email, ...data }))
      .sort((a, b) => b.total - a.total),
  };
}
