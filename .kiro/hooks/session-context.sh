#!/usr/bin/env bash
# .kiro/hooks/session-context.sh
# Trigger: agentSpawn — STDOUT is added to the agent's context on exit 0.
# Informational only; must never fail the session start.

set -uo pipefail
trap 'exit 0' ERR

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Drain the event JSON so the caller's pipe never blocks. Nothing in the
# agentSpawn payload is needed here beyond `cwd`, which we derive ourselves.
cat >/dev/null 2>&1 || true

VERSION="$(node -e 'process.stdout.write(require("'"$PROJECT_ROOT"'/package.json").version)' 2>/dev/null || echo unknown)"

echo "kiro-dashboard v$VERSION — Kiro IDE user analytics dashboard"
echo "  Stack: Next.js 14 (App Router) + ECS Fargate ARM64 + Athena/Glue/S3 + Bedrock"
echo "  Regions: ap-northeast-2 (CDK/serving), us-east-1 (Athena/S3/IdC/Bedrock)"
echo "  UI language: Korean primary, English secondary (lib/i18n.tsx, useI18n())"

if git -C "$PROJECT_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH="$(git -C "$PROJECT_ROOT" branch --show-current 2>/dev/null || echo detached)"
  MODIFIED="$(git -C "$PROJECT_ROOT" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  HEAD_LINE="$(git -C "$PROJECT_ROOT" log --oneline -1 2>/dev/null || echo 'no commits')"
  echo "  Git: $BRANCH, $MODIFIED modified file(s), HEAD: $HEAD_LINE"
else
  echo "  Git: not a repository"
fi

echo "  Conventions: lowercase Athena columns | NORMALIZE_USERID from lib/athena.ts"
echo "               user_report dates YYYY-MM-DD | by_user_analytic dates MM-DD-YYYY"
echo "               brand #9046FF | dark-first (bg-black, bg-gray-900/50)"
echo "  Test gate: npx jest  +  npm run build   (npm run lint is BROKEN — no ESLint config)"

if [[ -f "$PROJECT_ROOT/.env.local" ]]; then
  echo "  .env.local: present"
else
  echo "  .env.local: missing — cp .env.example .env.local for local dev"
fi

echo "  Prompts: /test-all /review-diff"
echo "  Skills:  /code-review-guide /refactor-guide /release-guide /sync-docs-guide"
echo "           /athena-query-helper /cdk-deploy-guide /dashboard-component-guide"
echo "  Agents:  kiro-dashboard-dev (ctrl+shift+d) | code-reviewer (ctrl+shift+r) | security-auditor (ctrl+shift+s)"

exit 0
