#!/bin/bash
# Wrapper script for launchd — syncs sent emails then checks for responses
cd /Users/cleetus/.openclaw/workspace/twenty1-dashboard
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "=== $(date) ===" >> data/check-responses.log

# 1. Sync any new sent emails from Gmail into the CRM
/opt/homebrew/bin/npx tsx scripts/sync-sent.ts >> data/check-responses.log 2>&1

# 2. Check for responses to tracked emails
/opt/homebrew/bin/npx tsx scripts/check-responses.ts >> data/check-responses.log 2>&1
