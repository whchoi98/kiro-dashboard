---
name: athena-query-helper
description: Write and debug Athena SQL against the Kiro user_report and legacy by_user_analytic tables, including when to bypass Athena for S3 direct reads. Use when adding API routes or working on the data layer.
---

# Athena Query Helper — kiro-dashboard

Question: $ARGUMENTS

Full column reference: `docs/kiro-user-activity-report-schema.md` (authoritative;
the upstream Kiro docs win over both when they disagree).

## Table `titanlog.user_report` — cost/subscription view

11 fixed columns (lowercase in Glue), plus 2 later additions and a dynamic model set:

| Column | Type | Notes |
|--------|------|-------|
| `date` | string | `YYYY-MM-DD` |
| `userid` | string | UUID; some rows carry a `d-90663be888.` prefix |
| `client_type` | string | `KIRO_IDE`, `KIRO_CLI`, `PLUGIN` (PLUGIN unobserved here) |
| `chat_conversations` | string→int | daily conversations |
| `credits_used` | string→double | plan credits consumed |
| `overage_cap` | string→double | admin limit when `overage_enabled`, else the plan's included credits |
| `overage_credits_used` | string→double | **every row is `0.0` in this account** — and the upstream docs disagree on daily vs cumulative, so do not build new `SUM()` features on it |
| `overage_enabled` | string | `true`/`TRUE` mixed case → always `LOWER()` |
| `profileid` | string | profile ARN (single value here) |
| `subscription_tier` | string | UPPERCASE in CSV (`POWER` 100% here) |
| `total_messages` | string→int | prompts + tool calls + responses |

Later additions — **not safely readable through Athena** because `OpenCSVSerDe`
maps by position and these arrived at different offsets per file: `new_user`
(boolean; means "subscription activated that day", not "first use") and
`user_email` (plaintext; deliberately never used — identity comes from IAM
Identity Center via `lib/identity.ts`, masked).

## Table `by_user_analytic` — legacy productivity view (46 columns)

- Dates are **`MM-DD-YYYY`**, not `YYYY-MM-DD`
- No `client_type` column, so legacy rows cannot be attributed to IDE vs CLI
- Only 5 of 44 metric columns carry values in this account
  (`inline_suggestionscount`, `chat_messagessent`, `inline_aicodelines`,
  `inline_acceptancecount`, `chat_aicodelines`) — check before building a feature:

```sql
SELECT SUM(CAST(dev_generatedlines AS BIGINT))       AS dev_lines,
       SUM(CAST(codereview_findingscount AS BIGINT)) AS cr_findings,
       COUNT(*)                                      AS rows
FROM by_user_analytic;
```

- Never INNER JOIN the two reports: 303 of 541 legacy (user, date) pairs have no
  `user_report` counterpart. Sum each side independently over the same window and
  report a separate population `n` (see `CreditEfficiency` in `types/dashboard.ts`).

## Query patterns

```sql
-- userid normalization — import NORMALIZE_USERID from lib/athena.ts
REGEXP_REPLACE(userid, '^d-[a-z0-9]+\.', '') AS userid
```

```sql
-- date window: explicit literals, produced by lib/athena-window.ts.
-- CURRENT_DATE inside SQL defeats Athena's 60-minute result reuse.
WHERE date >= '2026-07-27' AND date <= '2026-08-26'
```

```sql
-- OpenCSVSerDe returns every value as a string: always cast
SUM(CAST(total_messages AS INTEGER)) AS total_messages
SUM(CAST(credits_used  AS DOUBLE))   AS total_credits
```

## When NOT to use Athena

Dynamic `{model}_messages` columns change per file (alphabetical, Auto first, 10+
models observed and growing, including non-Anthropic ones). `OpenCSVSerDe` maps
them onto the wrong names silently. Read S3 directly with `lib/uar-s3.ts` and
match by header name — and exclude `total_messages`, which also ends in
`_messages` and would otherwise double the totals
(`col.endsWith('_messages') && col !== 'total_messages'`). Same for `new_user`
(`/api/adoption`). Recorded in ADR-0004.

## Pitfalls

- Lowercase column names only; the Glue catalog is lowercase
- Results paginate at 1000 rows — `executeQuery()` follows `NextToken` for you
- Parse strings with `safeInt()` / `safeFloat()`, never bare `Number()`
- Data is T+1: the report lands ~02:00 UTC (11:00 KST) the next day
- A missing table or empty prefix must render as an empty payload with HTTP 200,
  not a 500 (`tests/api/route-empty-responses.test.ts` enforces this)
