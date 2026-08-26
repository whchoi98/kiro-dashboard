#!/usr/bin/env bash
# .kiro/hooks/notify.sh
# Trigger: stop — fires when the assistant finishes a turn.
#
# Kiro has no `Notification` trigger (that was Claude Code); `stop` is the
# closest equivalent and the only trigger carrying the assistant's response.
# Disabled unless NOTIFY_WEBHOOK_URL is set, and never blocks the turn: it
# always exits 0.

set -uo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/event.sh"
hook_load_event

WEBHOOK_URL="${NOTIFY_WEBHOOK_URL:-}"
[[ -n "$WEBHOOK_URL" ]] || exit 0
command -v curl >/dev/null 2>&1 || exit 0

# Keep the payload small — a turn's response can be long.
SUMMARY="$(printf '%s' "$HOOK_RESPONSE" | head -c 500)"

PAYLOAD="$(
  HOOK_SUMMARY="$SUMMARY" \
  HOOK_EVENT_NAME="${HOOK_EVENT:-stop}" \
  node -e '
    const payload = {
      project: "kiro-dashboard",
      event: process.env.HOOK_EVENT_NAME || "stop",
      session: process.env.KIRO_SESSION_ID || null,
      summary: process.env.HOOK_SUMMARY || "",
      timestamp: new Date().toISOString(),
    };
    process.stdout.write(JSON.stringify(payload));
  ' 2>/dev/null
)"

[[ -n "$PAYLOAD" ]] || exit 0

# Fire and forget — a webhook failure must never surface as a hook error.
curl -sS -f -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  -d "$PAYLOAD" \
  --max-time 5 >/dev/null 2>&1 || true

exit 0
