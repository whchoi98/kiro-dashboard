---
description: Code review on current git diff
---

Run a combined code review and security audit on the current uncommitted changes.

```bash
cd /home/ec2-user/my-project/kiro-dashboard && git diff HEAD
```

Apply the `/code-review` skill checklist to the diff above. Focus on:

1. **API Routes** — SQL column casing, NORMALIZE_USERID usage, date format correctness per table, error handling
2. **React Components** — server/client boundary, dark theme compliance, i18n via useLanguage()
3. **TypeScript** — explicit return types, no implicit any, proper interface usage from types/dashboard.ts
4. **Security** — no hardcoded secrets, no raw user input in SQL, IAM least-privilege
5. **CDK** — env var changes reflected in .env.example, cross-stack props pattern

## Output Format (Shared Finding Schema)

For each finding use:
- **Severity**: CRITICAL | WARNING | SUGGESTION
- **Location**: file path + line number
- **Issue**: what is wrong
- **Recommendation**: what it should be

End with a summary table of findings by severity.
