---
name: athena-query-helper
description: Guide for writing Athena SQL queries against the Kiro user_report table. Use when writing or debugging Athena queries, adding new API routes, or working with the data layer.
---

# Athena Query Helper

## Table: `titanlog.user_report`

| Column | Type | Notes |
|--------|------|-------|
| date | string | YYYY-MM-DD |
| userid | string | UUID, some prefixed with `d-90663be888.` |
| client_type | string | KIRO_IDE, KIRO_CLI, PLUGIN |
| chat_conversations | int | Daily conversation count |
| credits_used | double | Daily credit consumption |
| overage_cap | double | Admin-set overage limit |
| overage_credits_used | double | Overage credits consumed |
| overage_enabled | string | "true" / "false" |
| profileid | string | Kiro profile ARN |
| subscription_tier | string | POWER, PRO, PROPLUS (uppercase) |
| total_messages | int | Prompts + tool calls + responses |

## Query Patterns

### UserId Normalization
```sql
-- Always use this to strip Identity Store prefix
REGEXP_REPLACE(userid, '^d-[a-z0-9]+\.', '') AS userid
```
Import `NORMALIZE_USERID` from `lib/athena.ts` instead of hardcoding.

### Date Filtering
```sql
WHERE date >= DATE_FORMAT(DATE_ADD('day', -30, CURRENT_DATE), '%Y-%m-%d')
```

### Column Casting
```sql
SUM(CAST(total_messages AS INTEGER)) AS total_messages
SUM(CAST(credits_used AS DOUBLE)) AS total_credits
```

### Period Comparison
```sql
-- Current period
WHERE date >= DATE_FORMAT(DATE_ADD('day', -30, CURRENT_DATE), '%Y-%m-%d')
-- Previous period
WHERE date >= DATE_FORMAT(DATE_ADD('day', -60, CURRENT_DATE), '%Y-%m-%d')
  AND date < DATE_FORMAT(DATE_ADD('day', -30, CURRENT_DATE), '%Y-%m-%d')
```

## Common Pitfalls
- Column names must be **lowercase** (Glue catalog uses lowercase)
- OpenCSVSerde returns all values as strings — always CAST
- Results are paginated at 1000 rows — `executeQuery()` handles this
- Data arrives T+1 (~02:00 UTC next day)
