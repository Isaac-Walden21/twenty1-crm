import { google, gmail_v1 } from "googleapis";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const CREDENTIALS_PATH = path.join(DATA_DIR, "gmail-credentials.json");

// Env var fallbacks for serverless (Vercel) where the local `data/` folder
// does not exist. Values must be base64-encoded JSON strings so they paste
// cleanly into Vercel's env var UI.
//
//   GMAIL_CREDENTIALS_B64    = base64(JSON of gmail-credentials.json)
//   GMAIL_TOKEN_ISAAC_B64    = base64(JSON of gmail-token-isaac.json)
//   GMAIL_TOKEN_ASHER_B64    = base64(JSON of gmail-token-asher.json)
//
// Local dev continues to use the filesystem paths below as a fallback.

function tokenEnvVar(sender?: string): string {
  const key = (sender || "isaac").toUpperCase();
  return `GMAIL_TOKEN_${key}_B64`;
}

function decodeB64Json<T = unknown>(b64: string): T {
  return JSON.parse(Buffer.from(b64, "base64").toString("utf-8")) as T;
}

// Returns parsed JSON from env var (preferred) or filesystem (fallback).
// Returns null if neither source has the value.
function loadJsonSource<T = unknown>(envVar: string, filePath: string): T | null {
  const envVal = process.env[envVar];
  if (envVal && envVal.trim().length > 0) {
    try {
      return decodeB64Json<T>(envVal);
    } catch (e) {
      console.error(`Failed to decode ${envVar} as base64 JSON:`, e);
      return null;
    }
  }
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    }
  } catch (e) {
    console.error(`Failed to read ${filePath}:`, e);
  }
  return null;
}

function loadCredentials(): {
  installed?: { client_id: string; client_secret: string; redirect_uris: string[] };
  web?: { client_id: string; client_secret: string; redirect_uris: string[] };
} | null {
  return loadJsonSource("GMAIL_CREDENTIALS_B64", CREDENTIALS_PATH);
}

function loadTokens(sender?: string): Record<string, unknown> | null {
  const senderFile = path.join(DATA_DIR, `gmail-token-${sender || "isaac"}.json`);
  const fromSender = loadJsonSource<Record<string, unknown>>(tokenEnvVar(sender), senderFile);
  if (fromSender) return fromSender;
  // Legacy fallback: gmail-token.json (default) for local-dev backwards compat
  const defaultFile = path.join(DATA_DIR, "gmail-token.json");
  return loadJsonSource<Record<string, unknown>>("GMAIL_TOKEN_DEFAULT_B64", defaultFile);
}

export function getGmailClient(sender?: string): gmail_v1.Gmail | null {
  const credentials = loadCredentials();
  const tokens = loadTokens(sender);
  if (!credentials || !tokens) return null;

  const creds = credentials.installed || credentials.web;
  if (!creds) return null;
  const { client_id, client_secret, redirect_uris } = creds;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0]);
  oauth2Client.setCredentials(tokens);

  // Best-effort persist refreshed tokens — only works locally. On serverless
  // the filesystem is read-only; the oauth2 client refreshes access tokens
  // in-memory per request, so we don't lose anything by skipping the write.
  oauth2Client.on("tokens", (newTokens) => {
    try {
      const senderFile = path.join(DATA_DIR, `gmail-token-${sender || "isaac"}.json`);
      if (fs.existsSync(senderFile)) {
        const merged = { ...(tokens as object), ...newTokens };
        fs.writeFileSync(senderFile, JSON.stringify(merged, null, 2));
      }
    } catch {
      // serverless read-only fs — ignore
    }
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export function isGmailConfigured(sender?: string): boolean {
  return loadCredentials() !== null && loadTokens(sender) !== null;
}

export function getConfiguredSenders(): { name: string; email: string | null; configured: boolean }[] {
  const senders = [
    { name: "isaac", email: null as string | null, configured: false },
    { name: "asher", email: null as string | null, configured: false },
  ];
  for (const s of senders) {
    s.configured = isGmailConfigured(s.name);
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
