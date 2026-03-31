#!/bin/bash
# Quick tunnel for Twenty1 CRM
# Logs the public URL to a file so you can always find it
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Move config out of the way so quick tunnel works
if [ -f /Users/cleetus/.cloudflared/config.yml ]; then
  mv /Users/cleetus/.cloudflared/config.yml /Users/cleetus/.cloudflared/config.yml.bak 2>/dev/null
fi

cloudflared tunnel --url http://localhost:3000 --no-autoupdate 2>&1 | while read line; do
  echo "$line"
  # Capture the URL and save it
  url=$(echo "$line" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com')
  if [ -n "$url" ]; then
    echo "$url" > /Users/cleetus/.openclaw/workspace/twenty1-dashboard/data/tunnel-url.txt
    echo "Tunnel URL saved: $url"
  fi
done
