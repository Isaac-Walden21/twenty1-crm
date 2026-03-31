/**
 * Gmail OAuth2 Setup Script — Multi-Account
 *
 * Usage:
 *   npx tsx scripts/gmail-setup.ts          # set up default (isaac)
 *   npx tsx scripts/gmail-setup.ts isaac    # set up isaac
 *   npx tsx scripts/gmail-setup.ts asher    # set up asher
 */

import { google } from "googleapis";
import http from "http";
import fs from "fs";
import path from "path";
import { URL } from "url";

const DATA_DIR = path.join(process.cwd(), "data");
const CREDENTIALS_PATH = path.join(DATA_DIR, "gmail-credentials.json");
const PORT = 3847;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

const sender = process.argv[2] || "isaac";
const TOKEN_PATH = path.join(DATA_DIR, `gmail-token-${sender}.json`);

async function main() {
  console.log(`\nSetting up Gmail for sender: ${sender}`);
  console.log(`Token will be saved to: ${TOKEN_PATH}\n`);

  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error(`Missing: ${CREDENTIALS_PATH}`);
    console.error(`Download your OAuth credentials from Google Cloud Console and save them there.\n`);
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  const server = http.createServer(async (req, res) => {
    if (!req.url?.startsWith("/oauth2callback")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<h2>Authorization failed</h2><p>${error}</p>`);
      console.error(`\nAuthorization failed: ${error}`);
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end("<h2>No code received</h2>");
      return;
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

      // Get the email address for confirmation
      oauth2Client.setCredentials(tokens);
      const gmail = google.gmail({ version: "v1", auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: "me" });
      const email = profile.data.emailAddress;

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fff;">
          <div style="text-align:center;">
            <h2 style="color:#34d399;">Gmail connected for ${sender}!</h2>
            <p style="color:#a1a1aa;">${email}<br/>You can close this tab.</p>
          </div>
        </body></html>
      `);

      console.log(`\nToken saved for ${sender} (${email})`);
      console.log(`File: ${TOKEN_PATH}`);

      server.close();
      process.exit(0);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<h2>Token exchange failed</h2><pre>${err}</pre>`);
      console.error("\nToken exchange failed:", err);
      server.close();
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`Local server listening on http://localhost:${PORT}`);
    console.log(`\nOpen this URL in your browser:\n`);
    console.log(authUrl);
    console.log(`\nSign in with ${sender}'s Google account (${sender}@twenty1-media.com)`);
    console.log(`Waiting for authorization...`);
  });
}

main().catch(console.error);
