#!/usr/bin/env bash
# Notification hook: webhook stub for external notifications
# Configure NOTIFY_WEBHOOK_URL to enable notifications

set -euo pipefail

WEBHOOK_URL="${NOTIFY_WEBHOOK_URL:-}"
NOTIFICATION_TYPE="${CLAUDE_NOTIFICATION_TYPE:-unknown}"
NOTIFICATION_MESSAGE="${CLAUDE_NOTIFICATION_MESSAGE:-}"
PROJECT_NAME="kiro-dashboard"

# If no webhook configured, exit silently
if [[ -z "$WEBHOOK_URL" ]]; then
  exit 0
fi

# Build payload
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PAYLOAD=$(cat <<EOF
{
  "project": "$PROJECT_NAME",
  "type": "$NOTIFICATION_TYPE",
  "message": $(echo "$NOTIFICATION_MESSAGE" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))"),
  "timestamp": "$TIMESTAMP"
}
EOF
)

# Send webhook (fire and forget — don't block Claude on failure)
curl -s -f -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  --max-time 5 \
  >/dev/null 2>&1 || true

exit 0
