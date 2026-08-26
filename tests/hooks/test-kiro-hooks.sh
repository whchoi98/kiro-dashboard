#!/usr/bin/env bash
# tests/hooks/test-kiro-hooks.sh — Kiro hook contract tests.
#
# Kiro delivers the hook event as JSON on STDIN and uses exit code 2 (preToolUse
# only) to block a tool call. These tests exercise that contract directly.

set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOKS_DIR="$PROJECT_ROOT/.kiro/hooks"
PASS=0
FAIL=0
TOTAL=0

ok() {
  TOTAL=$((TOTAL + 1)); PASS=$((PASS + 1))
  echo "ok $TOTAL - $1"
}

not_ok() {
  TOTAL=$((TOTAL + 1)); FAIL=$((FAIL + 1))
  echo "not ok $TOTAL - $1"
  echo "  # $2"
}

HOOK_SCRIPTS=(session-context.sh secret-scan.sh check-doc-sync.sh notify.sh)

echo "# Kiro hook files"
for hook in "${HOOK_SCRIPTS[@]}"; do
  if [[ -f "$HOOKS_DIR/$hook" ]]; then
    ok "exists: .kiro/hooks/$hook"
  else
    not_ok "exists: .kiro/hooks/$hook" "missing"
  fi
done
if [[ -f "$HOOKS_DIR/lib/event.sh" && -f "$HOOKS_DIR/lib/parse-event.js" ]]; then
  ok "exists: .kiro/hooks/lib event parser"
else
  not_ok "exists: .kiro/hooks/lib event parser" "missing event.sh or parse-event.js"
fi

echo ""
echo "# Executable bit and shebang"
for hook in "${HOOK_SCRIPTS[@]}"; do
  [[ -f "$HOOKS_DIR/$hook" ]] || continue
  if [[ -x "$HOOKS_DIR/$hook" ]]; then
    ok "executable: $hook"
  else
    not_ok "executable: $hook" "chmod +x required"
  fi
  SHEBANG="$(head -1 "$HOOKS_DIR/$hook")"
  if [[ "$SHEBANG" == "#!/usr/bin/env bash" || "$SHEBANG" == "#!/bin/bash" ]]; then
    ok "shebang: $hook"
  else
    not_ok "shebang: $hook" "got: $SHEBANG"
  fi
done

echo ""
echo "# No hook reads the Claude env-var contract"
if grep -rqE '\$\{?CLAUDE_TOOL' "$HOOKS_DIR" 2>/dev/null; then
  not_ok "hooks use the Kiro STDIN contract" "found CLAUDE_TOOL_* variable use in .kiro/hooks"
else
  ok "hooks use the Kiro STDIN contract (no CLAUDE_TOOL_* variable use)"
fi

# ---------------------------------------------------------------------------
# preToolUse: secret-scan
# ---------------------------------------------------------------------------
build_event() {
  # $1 = tool_name, $2 = path, $3 = content, $4 = field (content|newStr)
  TOOL="$1" P="$2" C="$3" F="${4:-content}" node -e '
    const input = { command: process.env.F === "newStr" ? "strReplace" : "create", path: process.env.P };
    input[process.env.F] = process.env.C;
    process.stdout.write(JSON.stringify({
      hook_event_name: "preToolUse", cwd: process.cwd(),
      tool_name: process.env.TOOL, tool_input: input,
    }));
  '
}

scan() {
  build_event "$@" | bash "$HOOKS_DIR/secret-scan.sh" 2>/dev/null
}

scan_stderr() {
  # Same call, but returns the hook's STDERR — what Kiro hands back to the model
  build_event "$@" | bash "$HOOKS_DIR/secret-scan.sh" 2>&1 >/dev/null
}

expect_exit() {
  local want="$1" label="$2"; shift 2
  "$@"
  local got=$?
  if [[ "$got" == "$want" ]]; then
    ok "$label (exit $got)"
  else
    not_ok "$label" "expected exit $want, got $got"
  fi
}

echo ""
echo "# secret-scan: blocks with exit 2 (true positives)"
expect_exit 2 "AKIA access key blocked" \
  scan write /tmp/scan.ts "const k = 'AKIAIOSFODNN7EXAMPLE';"
expect_exit 2 "RSA private key blocked" \
  scan write /tmp/scan.ts "$(printf -- '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----')"
expect_exit 2 "JWT blocked" \
  scan write /tmp/scan.ts "token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'"
expect_exit 2 "hardcoded password blocked" \
  scan write /tmp/scan.ts "password: 'sup3rS3cretValue'"
expect_exit 2 "secret introduced via strReplace newStr blocked" \
  scan write /tmp/scan.ts "const k = 'AKIAIOSFODNN7EXAMPLE';" newStr

echo ""
echo "# secret-scan: allows (false positives must not block)"
expect_exit 0 "process.env reference allowed" \
  scan write /tmp/scan.ts "const secret = process.env.SESSION_SECRET;"
expect_exit 0 "change-me placeholder allowed" \
  scan write /tmp/scan.ts "SESSION_SECRET=change-me-in-production"
expect_exit 0 "comment about secrets allowed" \
  scan write /tmp/scan.ts "// Generate a secret: openssl rand -base64 32"
expect_exit 0 "template literal with env var allowed" \
  scan write /tmp/scan.ts 'const url = `https://${process.env.API_HOST}/api`;'
expect_exit 0 ".env.example skipped" \
  scan write /repo/.env.example "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
expect_exit 0 "non-write tool ignored" \
  scan shell "" "AKIAIOSFODNN7EXAMPLE"

echo ""
echo "# secret-scan: fails open on an unparseable payload"
if echo 'not json at all' | bash "$HOOKS_DIR/secret-scan.sh" >/dev/null 2>&1; then
  ok "malformed event does not block the tool call"
else
  not_ok "malformed event does not block the tool call" "hook exited non-zero"
fi

echo ""
echo "# secret-scan: STDERR carries the reason back to the model"
STDERR_OUT="$(scan_stderr write /tmp/scan.ts "const k = 'AKIAIOSFODNN7EXAMPLE';" || true)"
if grep -q "BLOCKED" <<< "$STDERR_OUT"; then
  ok "block reason written to STDERR"
else
  not_ok "block reason written to STDERR" "STDERR was: $STDERR_OUT"
fi

# ---------------------------------------------------------------------------
# agentSpawn: session-context
# ---------------------------------------------------------------------------
echo ""
echo "# session-context (agentSpawn)"
SPAWN_OUT="$(echo '{"hook_event_name":"agentSpawn","cwd":"'"$PROJECT_ROOT"'"}' \
  | bash "$HOOKS_DIR/session-context.sh" 2>/dev/null)"
SPAWN_RC=$?
if [[ $SPAWN_RC -eq 0 ]]; then
  ok "session-context exits 0"
else
  not_ok "session-context exits 0" "exit $SPAWN_RC"
fi
for needle in "kiro-dashboard" "NORMALIZE_USERID" "MM-DD-YYYY" "#9046FF" "npx jest"; do
  if grep -q -- "$needle" <<< "$SPAWN_OUT"; then
    ok "session-context reports: $needle"
  else
    not_ok "session-context reports: $needle" "not in hook output"
  fi
done
if grep -q "npm run lint is BROKEN" <<< "$SPAWN_OUT"; then
  ok "session-context warns that npm run lint is broken"
else
  not_ok "session-context warns that npm run lint is broken" "warning missing"
fi

# ---------------------------------------------------------------------------
# postToolUse: check-doc-sync
# ---------------------------------------------------------------------------
doc_sync() {
  P="$1" node -e '
    process.stdout.write(JSON.stringify({
      hook_event_name: "postToolUse", cwd: process.cwd(), tool_name: "write",
      tool_input: { command: "create", path: process.env.P, content: "x" },
      tool_response: { success: true },
    }));
  ' | bash "$HOOKS_DIR/check-doc-sync.sh" 2>/dev/null
}

echo ""
echo "# check-doc-sync (postToolUse)"
if grep -q "doc-sync" <<< "$(doc_sync "$PROJECT_ROOT/app/api/zzz-not-documented/route.ts")"; then
  ok "undocumented new API route is flagged"
else
  not_ok "undocumented new API route is flagged" "no output for a new route"
fi
if [[ -z "$(doc_sync "$PROJECT_ROOT/lib/athena.ts")" ]]; then
  ok "already-documented lib file is silent"
else
  not_ok "already-documented lib file is silent" "unexpected reminder for lib/athena.ts"
fi
if [[ -z "$(doc_sync "$PROJECT_ROOT/infra/lib/ecs-stack.ts")" ]]; then
  ok "paths outside app/ and lib/ are ignored"
else
  not_ok "paths outside app/ and lib/ are ignored" "unexpected output"
fi
expect_exit 0 "check-doc-sync never blocks" doc_sync "$PROJECT_ROOT/app/api/zzz-not-documented/route.ts"

# ---------------------------------------------------------------------------
# stop: notify
# ---------------------------------------------------------------------------
echo ""
echo "# notify (stop)"
if echo '{"hook_event_name":"stop","assistant_response":"done"}' \
   | NOTIFY_WEBHOOK_URL="" bash "$HOOKS_DIR/notify.sh" >/dev/null 2>&1; then
  ok "notify is a no-op without NOTIFY_WEBHOOK_URL"
else
  not_ok "notify is a no-op without NOTIFY_WEBHOOK_URL" "exited non-zero"
fi
if echo '{"hook_event_name":"stop","assistant_response":"done"}' \
   | NOTIFY_WEBHOOK_URL="http://127.0.0.1:1/never-listening" \
     bash "$HOOKS_DIR/notify.sh" >/dev/null 2>&1; then
  ok "notify swallows webhook failures"
else
  not_ok "notify swallows webhook failures" "a failed POST must not fail the turn"
fi

echo ""
echo "# Summary: $TOTAL tests, $PASS passed, $FAIL failed"
[[ $FAIL -gt 0 ]] && exit 1
exit 0
