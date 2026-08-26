#!/usr/bin/env bash
# .kiro/hooks/secret-scan.sh
# Trigger: preToolUse, matcher "write" — blocks a write that would introduce a
# hardcoded secret.
#
# Kiro contract (features/hooks.md):
#   exit 0 → allow;  exit 2 → BLOCK and return STDERR to the model;
#   any other code → warning shown to the user, tool still runs.
# Findings therefore go to STDERR, not STDOUT.

set -uo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/event.sh"
hook_load_event

# Only file writes are in scope.
hook_is_write || exit 0

FILE_PATH="$HOOK_PATH"
FILE_CONTENT="$HOOK_CONTENT"

# Templates and examples are allowed to carry placeholder-shaped values.
case "$FILE_PATH" in
  *.example|*template*|*TEMPLATE*) exit 0 ;;
esac

# Real env files are gitignored and expected to hold real values.
case "$(basename "$FILE_PATH")" in
  .env|.env.local|.env.deploy) exit 0 ;;
esac

# The hooks and their fixtures intentionally contain sample secrets.
case "$FILE_PATH" in
  */tests/fixtures/*|*/.kiro/hooks/*|*/tests/hooks/*) exit 0 ;;
esac

[[ -n "$FILE_CONTENT" ]] || exit 0

FINDINGS=()

# AWS Access Key IDs (AKIA...)
if grep -qE 'AKIA[0-9A-Z]{16}' <<< "$FILE_CONTENT"; then
  FINDINGS+=("AWS Access Key ID (AKIA...)")
fi

# AWS Secret Access Keys (40-char base64-ish value after an assignment)
if grep -qE '(aws_secret|AWS_SECRET)[_[:space:]]*[=:][_[:space:]]*[A-Za-z0-9/+]{40}' <<< "$FILE_CONTENT"; then
  FINDINGS+=("AWS Secret Access Key")
fi

# Generic password assignments, excluding obvious placeholders
if grep -qiE '(password|passwd|pwd)[[:space:]]*[:=][[:space:]]*["'\''][^"'\'']{8,}["'\'']' <<< "$FILE_CONTENT"; then
  if ! grep -qiE '(password|passwd|pwd)[[:space:]]*[:=][[:space:]]*["'\'']?(change-me|placeholder|your-|<|CHANGE|TODO|xxx)' <<< "$FILE_CONTENT"; then
    FINDINGS+=("Hardcoded password")
  fi
fi

# Private key blocks. `--` is required: without it grep parses the pattern's
# leading dashes as options and the check silently never fires.
if grep -qE -- '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' <<< "$FILE_CONTENT"; then
  FINDINGS+=("Private key block")
fi

# JWT tokens
if grep -qE 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' <<< "$FILE_CONTENT"; then
  FINDINGS+=("JWT token (hardcoded)")
fi

# Generic secret/token/api key assignments with real-looking values
if grep -qiE '(secret|token|api_key|apikey)[[:space:]]*[:=][[:space:]]*["'\''][A-Za-z0-9_-]{20,}["'\'']' <<< "$FILE_CONTENT"; then
  if ! grep -qiE '(secret|token|api_key|apikey)[[:space:]]*[:=][[:space:]]*["'\'']?(change-me|placeholder|your-|<|CHANGE|TODO|xxx|\$\{|process\.env)' <<< "$FILE_CONTENT"; then
    FINDINGS+=("Hardcoded secret/token/API key")
  fi
fi

if [[ ${#FINDINGS[@]} -gt 0 ]]; then
  {
    echo "[secret-scan] BLOCKED — potential secrets in ${FILE_PATH:-<unknown path>}:"
    for finding in "${FINDINGS[@]}"; do
      echo "  - $finding"
    done
    echo
    echo "Use process.env.VAR_NAME instead of a literal value."
    echo "  - ECS runtime values: infra/lib/ecs-stack.ts environment block (+ .env.example)"
    echo "  - Local development:  .env.local (gitignored)"
    echo "See .kiro/steering/security.md."
  } >&2
  exit 2
fi

exit 0
