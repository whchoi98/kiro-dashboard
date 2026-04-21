#!/usr/bin/env bash
# PreToolUse hook: scans for hardcoded secrets, AWS keys, and passwords
# Blocks Write/Edit operations that introduce secrets into source files

set -euo pipefail

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
FILE_CONTENT="${CLAUDE_TOOL_INPUT_CONTENT:-${CLAUDE_TOOL_INPUT_NEW_STRING:-}}"
FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-${CLAUDE_TOOL_INPUT_PATH:-}}"

# Only scan write/edit operations
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Skip .env.example and template files (they're allowed to have placeholders)
if [[ "$FILE_PATH" == *.example || "$FILE_PATH" == *template* || "$FILE_PATH" == *TEMPLATE* ]]; then
  exit 0
fi

# Skip env files — those are gitignored and expected to have real values
if [[ "$(basename "$FILE_PATH")" == ".env" || "$(basename "$FILE_PATH")" == ".env.local" ]]; then
  exit 0
fi

if [[ -z "$FILE_CONTENT" ]]; then
  exit 0
fi

FINDINGS=()

# AWS Access Key IDs (AKIA...)
if echo "$FILE_CONTENT" | grep -qE 'AKIA[0-9A-Z]{16}'; then
  FINDINGS+=("AWS Access Key ID (AKIA...)")
fi

# AWS Secret Access Keys (40 char base64-like after assignment)
if echo "$FILE_CONTENT" | grep -qE '(aws_secret|AWS_SECRET)[_\s]*[=:][_\s]*[A-Za-z0-9/+]{40}'; then
  FINDINGS+=("AWS Secret Access Key")
fi

# Generic password assignments
if echo "$FILE_CONTENT" | grep -qiE '(password|passwd|pwd)\s*[:=]\s*["\x27][^"\x27]{8,}["\x27]'; then
  # Exclude placeholder values
  if ! echo "$FILE_CONTENT" | grep -qiE '(password|passwd|pwd)\s*[:=]\s*["\x27](change-me|placeholder|your-|<|CHANGE|TODO|xxx)'; then
    FINDINGS+=("Hardcoded password")
  fi
fi

# Private key blocks
if echo "$FILE_CONTENT" | grep -qE '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'; then
  FINDINGS+=("Private key block")
fi

# JWT tokens (long base64 with dots)
if echo "$FILE_CONTENT" | grep -qE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'; then
  FINDINGS+=("JWT token (hardcoded)")
fi

# Generic secret/token assignments with real-looking values
if echo "$FILE_CONTENT" | grep -qiE '(secret|token|api_key|apikey)\s*[:=]\s*["\x27][A-Za-z0-9_\-]{20,}["\x27]'; then
  # Exclude known safe placeholder patterns
  if ! echo "$FILE_CONTENT" | grep -qiE '(secret|token|api_key|apikey)\s*[:=]\s*["\x27](change-me|placeholder|your-|<|CHANGE|TODO|xxx|\$\{|process\.env)'; then
    FINDINGS+=("Hardcoded secret/token/API key")
  fi
fi

if [[ ${#FINDINGS[@]} -gt 0 ]]; then
  echo ""
  echo "[secret-scan] BLOCKED: Potential secrets detected in $FILE_PATH:"
  for finding in "${FINDINGS[@]}"; do
    echo "  - $finding"
  done
  echo ""
  echo "  Use environment variables (process.env.VAR_NAME) instead of hardcoded values."
  echo "  For ECS deployments, set secrets in infra/lib/ecs-stack.ts environment block."
  echo "  For local development, use .env.local (gitignored)."
  echo ""
  # Exit code 2 signals Claude to block the tool call
  exit 2
fi

exit 0
