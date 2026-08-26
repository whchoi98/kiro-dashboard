---
description: Review the current uncommitted diff (code review + security audit in one pass)
---

# Review current changes

Review the uncommitted changes in this working tree. If `$ARGUMENTS` names
files or a commit range, review that instead.

```bash
cd /home/ec2-user/my-project/kiro-dashboard
git status --porcelain
git diff HEAD
```

Apply the `/code-review-guide` skill checklist to the diff. Pay particular
attention to:

1. **API routes** — lowercase Athena columns, `NORMALIZE_USERID`, the per-table
   date format (`user_report` YYYY-MM-DD vs `by_user_analytic` MM-DD-YYYY),
   empty-state handling (200 with a well-shaped empty payload, not a 500)
2. **React components** — server/client boundary, dark-first theme, all strings
   through `useI18n()` with both `ko` and `en` keys
3. **TypeScript** — explicit return types, no implicit `any`, shapes from
   `types/dashboard.ts`, `safeInt`/`safeFloat` for Athena strings
4. **Security** — no hardcoded secrets, no unvalidated input in SQL, masking via
   `lib/mask.ts`, IAM least-privilege
5. **CDK** — new env vars mirrored into `.env.example` and
   `.env.deploy.example`, cross-stack wiring through props

Scope: $ARGUMENTS

## Output

Per finding: **Severity** (CRITICAL | WARNING | SUGGESTION), **Location**
(file + line), **Issue**, **Recommendation**. End with a count table by
severity. Review only — do not edit files unless the user asks.
