# ADR-0002: Dual Date Format Strategy Across Athena Tables

**Date**: 2026-04-22
**Status**: Accepted
**Deciders**: WooHyung Choi

---

## Context

The Kiro IDE telemetry data is stored in two Glue/Athena tables with different date column formats:

- `user_report`: `YYYY-MM-DD` (ISO 8601 standard)
- `by_user_analytic`: `MM-DD-YYYY` (US legacy format)

The `by_user_analytic` table is an upstream data source we do not control. Its date format was established before this dashboard project and is consumed by other systems. All API routes that query either table must construct WHERE clauses with the correct format, or date-based filtering silently returns zero rows.

## Decision

Handle the format difference at the SQL query construction layer in each API route. Every date-filtered query explicitly casts or formats dates according to the target table:

- `user_report` queries: use `date = 'YYYY-MM-DD'` directly
- `by_user_analytic` queries: use `DATE_FORMAT(DATE_PARSE(date, '%m-%d-%Y'), '%Y-%m-%d')` for comparison, or construct the literal in `MM-DD-YYYY` format

This convention is documented in root `CLAUDE.md`, `lib/CLAUDE.md`, and enforced via the code-review skill checklist.

## Consequences

### Positive
- No upstream data migration required — zero risk of breaking other consumers
- Each API route is self-contained with explicit date handling
- Code review checklist catches format mismatches before merge

### Negative
- Every new API route must know which table it queries and apply the correct format
- Easy to introduce silent bugs (wrong format returns empty results, not errors)
- Duplicated date format logic across multiple route handlers

### Neutral
- The `NORMALIZE_USERID` constant centralizes another cross-table concern, but date format handling remains per-query due to different SQL patterns required

## Alternatives Considered

| Alternative | Why rejected |
|-------------|-------------|
| ETL pipeline to normalize `by_user_analytic` dates | Would require Glue job, adds operational overhead, and risks breaking other consumers |
| Athena view with normalized dates | Adds query latency and another abstraction layer; doesn't reduce developer burden since the view itself must handle the format |
| Shared date helper function in `lib/athena.ts` | Considered and may be adopted later; current query patterns are varied enough that a single helper doesn't cover all cases cleanly |
