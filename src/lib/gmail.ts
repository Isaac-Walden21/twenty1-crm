import { google, gmail_v1 } from "googleapis";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CREDENTIALS_PATH = path.join(DATA_DIR, "gmail-credentials.json");

// Multi-account: tokens stored as gmail-token-{sender}.json
// Falls back to gmail-token.json for backwards compatibility

function tokenPath(sender?: string): string {
  if (sender) {
    const senderPath = path.join(DATA_DIR, `gmail-token-${sender}.json`);
    if (fs.existsSync(senderPath)) return senderPath;
  }
  // Fallback to default token
  return path.join(DATA_DIR, "gmail-token.json");
}

export function getGmailClient(sender?: string): gmail_v1.Gmail | null {
  const tokPath = tokenPath(sender);
  if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(tokPath)) {
    return null;
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);

  const tokens = JSON.parse(fs.readFileSync(tokPath, "utf-8"));
  oauth2Client.setCredentials(tokens);

  oauth2Client.on("tokens", (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    fs.writeFileSync(tokPath, JSON.stringify(merged, null, 2));
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export function isGmailConfigured(sender?: string): boolean {
  const tokPath = tokenPath(sender);
  return fs.existsSync(CREDENTIALS_PATH) && fs.existsSync(tokPath);
}

export function getConfiguredSenders(): { name: string; email: string | null; configured: boolean }[] {
  const senders = [
    { name: "isaac", email: null as string | null, configured: false },
    { name: "asher", email: null as string | null, configured: false },
  ];

  for (const s of senders) {
    // Check sender-specific token first, then default
    const senderTokenPath = path.join(DATA_DIR, `gmail-token-${s.name}.json`);
    const defaultTokenPath = path.join(DATA_DIR, "gmail-token.json");

    if (fs.existsSync(senderTokenPath)) {
      s.configured = true;
    } else if (s.name === "isaac" && fs.existsSync(defaultTokenPath)) {
      // Migrate: rename default token to isaac-specific
      fs.copyFileSync(defaultTokenPath, senderTokenPath);
      s.configured = true;
    }
  }

  return senders;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  sender?: string;
  replyToMessageId?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string; threadId: string } | null> {
  const gmail = getGmailClient(params.sender);
  if (!gmail) throw new Error(`Gmail not configured for sender: ${params.sender || "default"}`);

  const { to, subject, body, replyToMessageId } = params;

  // Build RFC 2822 message
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=utf-8`,
  ];

  if (replyToMessageId) {
    headers.push(`In-Reply-To: ${replyToMessageId}`);
    headers.push(`References: ${replyToMessageId}`);
  }

  const rawMessage = headers.join("\r\n") + "\r\n\r\n" + body;
  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });

  return {
    messageId: res.data.id || "",
    threadId: res.data.threadId || "",
  };
}

export async function getProfile(sender?: string): Promise<{ email: string } | null> {
  const gmail = getGmailClient(sender);
  if (!gmail) return null;

  const res = await gmail.users.getProfile({ userId: "me" });
  return { email: res.data.emailAddress || "" };
}
