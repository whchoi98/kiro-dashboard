# ADR-0004: S3-Direct CSV Reads for Positionally-Unsafe UAR Columns

**Date**: 2026-07-18
**Status**: Accepted
**Deciders**: whchoi98

---

## Context

The Kiro User Activity Report (UAR) delivers daily CSVs whose column set changes over time:

- Dynamic `{model_name}_messages` columns appear per model actually used, alphabetically ordered, so their positions differ across files.
- `New_User` and `User_Email` were appended to the static column set after delivery began (2026-02-10); files from 2026-03 to 2026-05 carry a model column at the position where `new_user` now lives.

The Glue tables use `OpenCSVSerDe`, which maps columns **by position**, not by header name. Adding `new_user` to the Glue schema would silently read model message counts into that column for older files, and `user_email` would read garbage. `/api/model-usage` already read S3 directly for the model columns; `/api/adoption` (New Users menu) needed the `new_user` flag, forcing the same choice again — this ADR generalizes the pattern.

An additional force: the container runs in ap-northeast-2 while the UAR bucket lives in us-east-1 (~200 ms per S3 round trip). The original per-day sequential `ListObjectsV2` loop cost ~20 s for a 90-day window.

## Decision

Columns that are positionally unstable across CSV files are read **S3-direct with header-name-based parsing**, never through Glue/Athena. The shared helper `lib/uar-s3.ts` owns this path:

- Bucket/prefix resolution (`S3_DATA_BUCKET` || bucket of `ATHENA_OUTPUT_BUCKET`; `S3_REPORT_PREFIX`).
- `listReportFiles(days)` lists **month prefixes in parallel** (at most 7 calls at the 180-day cap, with pagination) and filters keys to the day window — replacing the ~20 s per-day loop with a ~1-3 s path.
- `parseCsv` maps values by header name, so files lacking a column simply contribute nothing for it.

Consumers: `/api/model-usage` (dynamic model columns), `/api/adoption` (`new_user`). Positionally stable columns (the original 11) stay on the Athena path.

## Consequences

### Positive

- Correct results across all file generations without Glue schema surgery or data migration.
- No live mutation of the shared production Glue catalog.
- One tuned, tested listing/parsing implementation (`tests/api/model-usage-listing.test.ts`, `tests/api/adoption-route.test.ts` pin the call-count, windowing, pagination, and headerless-file contracts).

### Negative

- Two data paths (Athena vs S3-direct) to understand and operate; S3-direct failures are not covered by Athena-oriented diagnostics (see `docs/runbooks/s3-direct-read-failure.md`).
- Every request re-reads the window's CSVs (no cache); acceptable at current file counts (~1-4 s), revisit if file volume grows 10×.

### Neutral

- `user_email` remains unqueryable everywhere by policy; identity data comes from IAM Identity Center via `lib/identity.ts` instead.

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| Add `new_user`/`user_email` to the Glue table schema | OpenCSVSerDe positional mapping reads model counts into `new_user` for 2026-03..05 files; silent data corruption |
| Re-partition/rewrite historical CSVs to a uniform schema | Mutates the source-of-truth UAR delivery bucket; breaks on the next Kiro column addition |
| Switch tables to a header-aware format (Parquet + ETL) | Introduces an ETL pipeline the project deliberately avoids (see ADR-0003 context, "no ETL" principle) |
| Per-day sequential S3 listing (status quo ante) | ~20 s per request cross-region; replaced by month-prefix parallel listing |
