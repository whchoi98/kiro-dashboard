#!/usr/bin/env bash
# SessionStart hook: loads project context summary at the start of each session
# This hook is informational-only and must never block session start.

set -uo pipefail
trap 'exit 0' ERR

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo ""
echo "================================================================"
echo " kiro-dashboard — Kiro IDE User Analytics Dashboard"
echo "================================================================"
echo ""
echo " Stack: Next.js 14 + ECS Fargate + Athena/Glue/S3 + Bedrock"
echo " Region: ap-northeast-2 (CDK), us-east-1 (Athena/Bedrock)"
echo " Language: Korean (primary), English (secondary)"
echo ""

# Show git status summary (if git repo exists)
if git -C "$PROJECT_ROOT" rev-parse --git-dir &>/dev/null; then
  BRANCH=$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo "unknown")
  MODIFIED=$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ' || echo "0")
  echo " Git: branch=$BRANCH, modified_files=$MODIFIED"
else
  echo " Git: not initialized"
fi

# Show key environment hints
echo ""
echo " Key conventions:"
echo "  - Athena SQL: lowercase column names"
echo "  - UserId normalization: REGEXP_REPLACE(userid, '^d-[a-z0-9]+\\.', '')"
echo "  - user_report dates: YYYY-MM-DD"
echo "  - by_user_analytic dates: MM-DD-YYYY"
echo "  - Brand color: #9046FF  |  Theme: bg-black / bg-gray-900/50"
echo ""

# Check for .env.local
if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  echo " .env.local: found (local dev config present)"
else
  echo " .env.local: NOT found — copy .env.example to .env.local for local dev"
fi

echo ""
echo " Commands: /review  /test-all  /deploy"
echo " Skills:   /code-review  /refactor  /release  /sync-docs"
echo "================================================================"
echo ""

exit 0
