# Athena & Data Rules

- All Athena SQL uses **lowercase column names** (`userid`, `date`, `total_messages`, `credits_used`) — the Glue catalog is lowercase
- Always use `NORMALIZE_USERID` from `lib/athena.ts` for UserId queries — some rows carry a `d-90663be888.` prefix
- `OpenCSVSerDe` returns every value as a string: cast explicitly (`CAST(total_messages AS INTEGER)`, `CAST(credits_used AS DOUBLE)`) and parse with `safeInt()` / `safeFloat()`
- Build date windows with `lib/athena-window.ts` (explicit date literals). `CURRENT_DATE` inside SQL defeats Athena's 60-minute result reuse
- Date formats differ per table: `user_report` uses `YYYY-MM-DD`, legacy `by_user_analytic` uses `MM-DD-YYYY`
- Never INNER JOIN the two reports — 303 of 541 legacy (user, date) pairs have no `user_report` row. Sum each side independently over the same window and report a separate `n`
- `subscription_tier` is UPPERCASE in the CSV (`POWER`, `PRO`, `PROPLUS`); `overage_enabled` is mixed case — normalize with `LOWER()` / `toUpperCase()` before comparing
- Dynamic `{model}_messages` columns are positionally unstable: read them S3-direct via `lib/uar-s3.ts` by header name, and exclude `total_messages` from the `endsWith('_messages')` match (ADR-0004). Same for `new_user` in `/api/adoption`
- `overage_credits_used` is `0.0` in every row of this account and the upstream docs disagree on daily vs cumulative — do not build new `SUM()` features on it
- Data is T+1: the report lands ~02:00 UTC (11:00 KST) the next day, one CSV per client type
- `executeQuery()` handles Athena's 1000-row pagination via `NextToken`; results are memoized by `lib/query-cache.ts`
- Full column reference: `docs/kiro-user-activity-report-schema.md`. When it disagrees with the upstream Kiro docs, upstream wins
