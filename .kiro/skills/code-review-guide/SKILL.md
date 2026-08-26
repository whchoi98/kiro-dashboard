---
name: code-review-guide
description: Review kiro-dashboard changes — API routes, React components, TypeScript types, CDK infra — against this project's conventions. Use when asked to review code, check a diff before commit, or for "코드 리뷰".
---

# Code Review — kiro-dashboard

Subject: `git diff HEAD` by default, or the files named in $ARGUMENTS.

Read the relevant steering rules first: `.kiro/steering/api-frontend.md`,
`athena-data.md`, `code-style.md`, `security.md`, `infrastructure.md`,
`testing.md`.

## Checklist

### Next.js / React
- [ ] `'use client'` only where hooks or browser APIs are needed
- [ ] No AWS SDK / Athena calls from client components — they go through `app/api/*`
- [ ] All user-facing strings via `useI18n()` (`lib/i18n.tsx`), with **both** `ko` and `en` keys added
- [ ] Dark-first classes (`bg-black`, `bg-gray-900/50`, `text-white`); the light theme is a Tailwind palette override, so do not add `light:` variants per component
- [ ] Accent color `#9046FF` (not an arbitrary purple); chart colors come from `lib/chart-theme.ts` / `lib/model-colors.ts`

### API routes
- [ ] SQL column names lowercase (Glue catalog is lowercase)
- [ ] `NORMALIZE_USERID` from `lib/athena.ts` used instead of raw `userid`
- [ ] Date format matches the table: `user_report` → `YYYY-MM-DD`, legacy `by_user_analytic` → `MM-DD-YYYY`
- [ ] Explicit date literals via `lib/athena-window.ts` (keeps Athena result reuse working — `CURRENT_DATE` in SQL defeats it)
- [ ] Dynamic `{model}_messages` columns read S3-direct by header name, never positionally through Athena, and `total_messages` excluded from the match (ADR-0004)
- [ ] Empty/missing-table state returns 200 with a well-shaped empty payload, not a 500
- [ ] `try/catch` with `console.error` + `NextResponse.json({ error }, { status })`
- [ ] No hardcoded bucket, database, or account values — read from `process.env`

### TypeScript
- [ ] Explicit return types; no implicit or explicit `any`
- [ ] Response shapes declared in `types/dashboard.ts`
- [ ] Athena string values parsed with `safeInt()` / `safeFloat()`

### Security
- [ ] No hardcoded credentials, secrets, or tokens (the `preToolUse` secret-scan hook blocks the obvious cases — do not work around it)
- [ ] User identifiers masked via `lib/mask.ts` before leaving the server
- [ ] Any `userid` used in SQL validated by format first
- [ ] IAM changes stay least-privilege

### CDK
- [ ] New env vars added to `infra/lib/ecs-stack.ts` **and** `.env.example` / `.env.deploy.example`
- [ ] Cross-stack values passed via props, not `Fn.importValue`
- [ ] `RemovalPolicy.DESTROY` only on non-critical resources
- [ ] Anything touching `infra/` means the release is not app-only — say so explicitly

### General
- [ ] No stray `console.log` on request paths (`console.error` for failures only)
- [ ] Tests added or updated under `tests/` for new behavior
- [ ] Module doc updated when behavior changed (`app/api/CLAUDE.md`, `lib/CLAUDE.md`, …)

## Output

Per finding:

- **Severity**: CRITICAL | WARNING | SUGGESTION
- **Location**: file path + line
- **Issue**: what is wrong
- **Recommendation**: what it should be

Close with a count table:

| Severity | Count |
|----------|-------|
| CRITICAL | N |
| WARNING | N |
| SUGGESTION | N |

No findings → `LGTM` plus one sentence on what you verified. Review only; do
not edit files unless asked.
