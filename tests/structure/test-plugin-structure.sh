#!/usr/bin/env bash
# tests/structure/test-plugin-structure.sh — Validates project file structure and CLAUDE.md coverage

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

assert_file() {
  if [[ -f "$PROJECT_ROOT/$1" ]]; then
    ok "File exists: $1"
  else
    not_ok "File exists: $1" "Missing: $PROJECT_ROOT/$1"
  fi
}

assert_dir() {
  if [[ -d "$PROJECT_ROOT/$1" ]]; then
    ok "Directory exists: $1"
  else
    not_ok "Directory exists: $1" "Missing: $PROJECT_ROOT/$1"
  fi
}

assert_contains() {
  local file="$PROJECT_ROOT/$1"
  local pattern="$2"
  if grep -q "$pattern" "$file" 2>/dev/null; then
    ok "$1 contains: $pattern"
  else
    not_ok "$1 contains: $pattern" "Pattern not found in $file"
  fi
}

echo "# Core CLAUDE.md files"
assert_file "CLAUDE.md"
assert_file "app/CLAUDE.md"
assert_file "app/api/CLAUDE.md"
assert_file "app/components/CLAUDE.md"
assert_file "lib/CLAUDE.md"
assert_file "types/CLAUDE.md"
assert_file "infra/CLAUDE.md"

echo ""
echo "# Root CLAUDE.md content validation"
assert_contains "CLAUDE.md" "NORMALIZE_USERID"
assert_contains "CLAUDE.md" "YYYY-MM-DD"
assert_contains "CLAUDE.md" "MM-DD-YYYY"
assert_contains "CLAUDE.md" "#9046FF"
assert_contains "CLAUDE.md" "bg-gray-900/50"

echo ""
echo "# API CLAUDE.md lists all 12 endpoints"
for endpoint in metrics users trends credits engagement productivity analyze idc-users user-detail client-dist health auth; do
  assert_contains "app/api/CLAUDE.md" "$endpoint"
done

echo ""
echo "# Hooks"
assert_file ".claude/hooks/check-doc-sync.sh"
assert_file ".claude/hooks/secret-scan.sh"
assert_file ".claude/hooks/session-context.sh"
assert_file ".claude/hooks/notify.sh"

echo ""
echo "# Skills"
assert_file ".claude/skills/code-review/SKILL.md"
assert_file ".claude/skills/refactor/SKILL.md"
assert_file ".claude/skills/release/SKILL.md"
assert_file ".claude/skills/sync-docs/SKILL.md"

echo ""
echo "# Commands"
assert_file ".claude/commands/review.md"
assert_file ".claude/commands/test-all.md"
assert_file ".claude/commands/deploy.md"

echo ""
echo "# Agents"
assert_file ".claude/agents/code-reviewer.yml"
assert_file ".claude/agents/security-auditor.yml"

echo ""
echo "# Docs"
assert_file "docs/architecture.md"
assert_file "docs/decisions/.template.md"
assert_file "docs/runbooks/.template.md"
assert_file "docs/onboarding.md"

echo ""
echo "# Architecture doc bilingual"
assert_contains "docs/architecture.md" "## English"
assert_contains "docs/architecture.md" "## 한국어"
assert_contains "docs/architecture.md" "CloudFront"
assert_contains "docs/architecture.md" "Athena"
assert_contains "docs/architecture.md" "Bedrock"

echo ""
echo "# Scripts and config"
assert_file "scripts/setup.sh"
assert_file "scripts/install-hooks.sh"
assert_file ".mcp.json"
assert_file ".editorconfig"
assert_file ".env.example"

echo ""
echo "# .env.example has required variables"
for var in AWS_REGION ATHENA_DATABASE ATHENA_OUTPUT_BUCKET GLUE_TABLE_NAME IDENTITY_STORE_ID NEXTAUTH_URL NEXTAUTH_SECRET; do
  assert_contains ".env.example" "$var"
done

echo ""
echo "# package.json has required scripts"
assert_contains "package.json" '"dev"'
assert_contains "package.json" '"build"'
assert_contains "package.json" '"start"'

echo ""
echo "# Source directories"
assert_dir "app/api"
assert_dir "app/components"
assert_dir "lib"
assert_dir "types"
assert_dir "infra"

echo ""
echo "# Tests"
assert_file "tests/run-all.sh"
assert_file "tests/hooks/test-hooks.sh"
assert_file "tests/hooks/test-secret-patterns.sh"
assert_file "tests/structure/test-plugin-structure.sh"

echo ""
echo "# Summary: $TOTAL tests, $PASS passed, $FAIL failed"

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
