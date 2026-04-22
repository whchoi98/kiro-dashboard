# Athena & Data Rules

- All Athena SQL must use **lowercase column names** (`userid`, `date`, `total_messages`, `credits_used`, etc.) to match Glue catalog
- Always use `NORMALIZE_USERID` from `lib/athena.ts` for UserId queries — some records have `d-90663be888.` prefix
- Cast columns explicitly: `CAST(total_messages AS INTEGER)`, `CAST(credits_used AS DOUBLE)`
- Use `safeInt()` / `safeFloat()` from `lib/athena.ts` when parsing Athena string results
- Date filtering pattern: `WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')`
- Subscription_Tier values in CSV are UPPERCASE (`POWER`, `PRO`, `PROPLUS`) — normalize with `toUpperCase()` when mapping colors/labels
- Data has T+1 latency — today's activity appears tomorrow ~02:00 UTC
- Athena results are paginated (1000 rows max per page) — `executeQuery()` handles this automatically via `NextToken`
