#!/usr/bin/env bash
# tests/hooks/test-secret-patterns.sh — True positive and false positive tests for secret-scan.sh

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SECRET_SCAN="$PROJECT_ROOT/.claude/hooks/secret-scan.sh"
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
  echo "  # Expected: $2"
}

run_scan() {
  local content="$1"
  CLAUDE_TOOL_NAME="Write" \
  CLAUDE_TOOL_INPUT_CONTENT="$content" \
  CLAUDE_TOOL_INPUT_FILE_PATH="/tmp/scan-test.ts" \
  bash "$SECRET_SCAN" 2>/dev/null
  return $?
}

echo "# Secret scan — true positives (should be BLOCKED)"

# AWS Access Key ID
if run_scan "aws_key = 'AKIAIOSFODNN7EXAMPLE'"; then
  not_ok "Blocks AKIA Access Key" "Should have been blocked (exit 2)"
else
  ok "Blocks AKIA Access Key"
fi

# Private key
if run_scan "$(printf '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----')"; then
  not_ok "Blocks RSA private key" "Should have been blocked"
else
  ok "Blocks RSA private key"
fi

# JWT token (realistic format)
if run_scan "token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'"; then
  not_ok "Blocks JWT token" "Should have been blocked"
else
  ok "Blocks JWT token"
fi

echo ""
echo "# Secret scan — false positives (should be ALLOWED)"

# Environment variable reference
if run_scan "const secret = process.env.NEXTAUTH_SECRET;"; then
  ok "Allows process.env references"
else
  not_ok "Allows process.env references" "Was incorrectly blocked"
fi

# Placeholder values
if run_scan "NEXTAUTH_SECRET=change-me-in-production"; then
  ok "Allows placeholder secrets"
else
  not_ok "Allows placeholder secrets" "Was incorrectly blocked"
fi

# Template literals with env vars
if run_scan 'const url = \`https://\${process.env.API_HOST}/api\`'; then
  ok "Allows template literals with env vars"
else
  not_ok "Allows template literals with env vars" "Was incorrectly blocked"
fi

# Comment describing secret pattern
if run_scan "// Generate a secret: openssl rand -base64 32"; then
  ok "Allows comments about secrets"
else
  not_ok "Allows comments about secrets" "Was incorrectly blocked"
fi

# CDK stack with change-me value (as in ecs-stack.ts)
if run_scan "NEXTAUTH_SECRET: 'change-me-in-production'"; then
  ok "Allows change-me placeholder in CDK"
else
  not_ok "Allows change-me placeholder in CDK" "Was incorrectly blocked"
fi

echo ""
echo "# Summary: $TOTAL tests, $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
