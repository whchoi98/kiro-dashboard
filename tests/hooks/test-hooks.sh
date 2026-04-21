#!/usr/bin/env bash
# tests/hooks/test-hooks.sh — Test hook file existence, permissions, and basic behavior

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PASS=0
FAIL=0
TOTAL=0

ok() {
  TOTAL=$((TOTAL + 1))
  PASS=$((PASS + 1))
  echo "ok $TOTAL - $1"
}

not_ok() {
  TOTAL=$((TOTAL + 1))
  FAIL=$((FAIL + 1))
  echo "not ok $TOTAL - $1"
  echo "  # $2"
}

HOOKS_DIR="$PROJECT_ROOT/.claude/hooks"

echo "# Hook existence tests"

for hook in check-doc-sync.sh secret-scan.sh session-context.sh notify.sh; do
  if [[ -f "$HOOKS_DIR/$hook" ]]; then
    ok "Hook file exists: $hook"
  else
    not_ok "Hook file exists: $hook" "Missing: $HOOKS_DIR/$hook"
  fi
done

echo ""
echo "# Hook executable permissions"

for hook in check-doc-sync.sh secret-scan.sh session-context.sh notify.sh; do
  if [[ -x "$HOOKS_DIR/$hook" ]]; then
    ok "Hook is executable: $hook"
  else
    not_ok "Hook is executable: $hook" "Not executable: $HOOKS_DIR/$hook"
  fi
done

echo ""
echo "# Hook shebang lines"

for hook in check-doc-sync.sh secret-scan.sh session-context.sh notify.sh; do
  HOOK_FILE="$HOOKS_DIR/$hook"
  if [[ -f "$HOOK_FILE" ]]; then
    SHEBANG=$(head -1 "$HOOK_FILE")
    if [[ "$SHEBANG" == "#!/usr/bin/env bash" || "$SHEBANG" == "#!/bin/bash" ]]; then
      ok "Valid shebang in: $hook"
    else
      not_ok "Valid shebang in: $hook" "Got: $SHEBANG"
    fi
  fi
done

echo ""
echo "# Hook behavior: secret-scan.sh exits 0 on clean content"

CLEAN_CONTENT="const foo = process.env.MY_SECRET;"
if CLAUDE_TOOL_NAME="Write" \
   CLAUDE_TOOL_INPUT_CONTENT="$CLEAN_CONTENT" \
   CLAUDE_TOOL_INPUT_FILE_PATH="/tmp/test-clean.ts" \
   bash "$HOOKS_DIR/secret-scan.sh" 2>/dev/null; then
  ok "secret-scan exits 0 for env var references"
else
  not_ok "secret-scan exits 0 for env var references" "Non-zero exit for clean content"
fi

echo ""
echo "# Hook behavior: secret-scan.sh blocks AKIA keys"

DIRTY_CONTENT="const key = 'AKIAIOSFODNN7EXAMPLE';"
if CLAUDE_TOOL_NAME="Write" \
   CLAUDE_TOOL_INPUT_CONTENT="$DIRTY_CONTENT" \
   CLAUDE_TOOL_INPUT_FILE_PATH="/tmp/test-dirty.ts" \
   bash "$HOOKS_DIR/secret-scan.sh" 2>/dev/null; then
  not_ok "secret-scan blocks AWS Access Key" "Should have exited non-zero"
else
  ok "secret-scan blocks AWS Access Key (AKIA...)"
fi

echo ""
echo "# Summary: $TOTAL tests, $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
