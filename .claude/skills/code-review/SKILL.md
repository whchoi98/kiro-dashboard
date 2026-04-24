---
description: Code Review Skill — reviews Next.js API routes, React components, TypeScript types, and CDK infrastructure against project conventions
---

# Code Review Skill

## Trigger

Use when the user asks to:
- "review this code", "코드 리뷰 해줘"
- "check my changes", "변경사항 검토"
- "look at this PR", "PR 검토"
- `/code-review`

## Checklist

When reviewing code in this project, evaluate:

### Next.js / React
- [ ] Server vs Client component boundary is correct (`'use client'` only where needed)
- [ ] No direct Athena/AWS SDK calls from client components (must go through API routes)
- [ ] `useLanguage()` used for all user-facing strings (no hardcoded Korean or English)
- [ ] Components use dark theme: `bg-black`, `bg-gray-900/50`, `text-white`
- [ ] Kiro brand color `#9046FF` used for accents (not arbitrary purples)

### API Routes
- [ ] All SQL column names are lowercase
- [ ] `NORMALIZE_USERID` constant used (not raw `userid`)
- [ ] Date format matches the table: `user_report` → `YYYY-MM-DD`, `by_user_analytic` → `MM-DD-YYYY`
- [ ] Error handling: try/catch with `console.error` and `NextResponse.json({ error }, { status: 500 })`
- [ ] No hardcoded database names or bucket paths (use env vars)

### TypeScript
- [ ] Return types explicitly typed (no implicit `any`)
- [ ] Athena row results typed via `types/dashboard.ts` interfaces
- [ ] `safeFloat()` / `safeInt()` used when parsing Athena string values

### Security
- [ ] No hardcoded AWS credentials or secrets
- [ ] Environment variables accessed via `process.env.VAR_NAME`
- [ ] No user input directly interpolated into SQL (use parameterized patterns)

### CDK Infrastructure
- [ ] New env vars added to both `infra/lib/ecs-stack.ts` AND `.env.example`
- [ ] Stack dependencies passed via props (no `Fn.importValue` cross-stack references)
- [ ] `RemovalPolicy.DESTROY` only for dev/non-critical resources

### General
- [ ] No `console.log` left in production paths (use `console.error` for errors only)
- [ ] `CLAUDE.md` in the relevant module updated if behavior changed

## Output Format

Provide feedback as:
1. **Critical** — must fix before merge (security, data correctness)
2. **Warning** — should fix (convention violations, missing types)
3. **Suggestion** — nice to have (performance, readability)

Give specific file + line references where possible.
