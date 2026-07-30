import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  QueryExecutionState,
} from '@aws-sdk/client-athena';
import { TtlMemo, queryCacheKey, readIntEnv } from './query-cache';
import { RESULT_REUSE_MAX_AGE_MINUTES, resultReuseEnabled } from './athena-window';

const client = new AthenaClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

export const QUERY_CACHE_MAX_ROWS = readIntEnv(
  process.env,
  'ATHENA_QUERY_CACHE_MAX_ROWS',
  20_000
);

/**
 * Cap on rows retained across ALL entries — the cap that actually bounds memory.
 *
 * `QUERY_CACHE_MAX_ROWS` bounds one entry; on its own it multiplies with
 * `maxEntries` (200 x 20,000 = ~4M row objects, and a 44-column
 * `by_user_analytic` row retains ~3.4KB, so ~13 GB against a 1024 MiB task).
 * 50,000 rows is ~170 MiB at that width and ~30x the largest live result in this
 * account (~541 rows), so it never fires today while keeping the worst case
 * inside the task.
 */
export const QUERY_CACHE_MAX_TOTAL_ROWS = readIntEnv(
  process.env,
  'ATHENA_QUERY_CACHE_MAX_TOTAL_ROWS',
  50_000
);

/**
 * In-process result memo. Kiro reports land once daily at 02:00 UTC, so a
 * 60s-old answer cannot be staler than the source (already up to 24h old) —
 * see lib/query-cache.ts for key derivation, bounds and the full rationale.
 *
 * 60s is sized for the human-navigation window, not for data freshness: it
 * covers clicking through the sidebar and back, and the `days` dropdown
 * bouncing between presets, while keeping any operator-visible staleness under
 * a minute. `ATHENA_QUERY_CACHE_TTL_MS=0` disables it without a code change.
 */
export const queryMemo = new TtlMemo<Record<string, string>[]>({
  ttlMs: readIntEnv(process.env, 'ATHENA_QUERY_CACHE_TTL_MS', 60_000),
  maxEntries: readIntEnv(process.env, 'ATHENA_QUERY_CACHE_MAX_ENTRIES', 200),
  // Refuses a single pathologically large result. This bounds ONE entry only —
  // it is NOT the memory guard, because it multiplies with `maxEntries`.
  admit: (rows) => rows.length <= QUERY_CACHE_MAX_ROWS,
  // The actual memory guard: total retained rows across every entry. `/api/analyze`
  // is why this is not theoretical — its `query_athena` tool runs LLM-authored SQL
  // through this same memo, so unlike the fixed-SQL routes it can mint an unbounded
  // number of distinct keys in one chat session. (Its `rows.slice(0, 200)` truncates
  // only what reaches the model; the memo already retains the full result.)
  weigh: (rows) => rows.length,
  maxWeight: QUERY_CACHE_MAX_TOTAL_ROWS,
});

/**
 * The sleep taken *after* status check `attempt + 1`, in ms — a ramp UP to the
 * historical fixed 500ms, never past it.
 *
 * Two things this deliberately is NOT, both of which were measured and rejected
 * (see lib/CLAUDE.md → "Two measured non-problems"):
 *
 * - It is NOT "make the first check immediate". The first check was already
 *   immediate: `GetQueryExecutionCommand` is awaited at the TOP of the poll body
 *   and the sleep is the LAST statement, so a query that is already SUCCEEDED
 *   (the result-memo-miss-but-Athena-reuse case) sleeps zero ms today.
 * - It is NOT backoff. Growing the interval past 500ms would make these queries
 *   *slower*, because completion is detected one interval late on average and
 *   these queries finish in ~1-3s. Hence `POLL_DELAY_CAP_MS === 500`: the old
 *   value is the ceiling, so no query is ever detected later than before.
 *
 * Honest scope of the win: detection overshoot is set by the interval in force
 * at the moment the query finishes, so this helps only queries completing inside
 * the first ~450ms (and reduces nothing for the 1-3s engine-planning case, which
 * still lands in the 500ms cap). It is worth ~50-350ms on fast queries at a cost
 * of +2 `GetQueryExecution` calls per long query — deliberately bounded, because
 * an interval small enough to cut the 1-3s case would roughly double API call
 * volume against an account-shared Athena rate limit. Do that only after Athena
 * result reuse lands and shortens poll lifetimes (lib/CLAUDE.md records the
 * non-negotiable ordering).
 */
export const POLL_DELAY_RAMP_MS: readonly number[] = [150, 300];
export const POLL_DELAY_CAP_MS = 500;

export function pollDelayMs(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 0) return POLL_DELAY_RAMP_MS[0];
  const index = Math.floor(attempt);
  return index < POLL_DELAY_RAMP_MS.length ? POLL_DELAY_RAMP_MS[index] : POLL_DELAY_CAP_MS;
}

/**
 * Runs `sql` against Athena, memoized per (UTC day, SQL) for the cache TTL.
 * Concurrent callers with identical SQL share a single execution.
 */
export async function executeQuery(sql: string): Promise<Record<string, string>[]> {
  return queryMemo.run(queryCacheKey(sql, Date.now()), () => executeQueryUncached(sql));
}

/** The un-memoized Athena round trip. Separated so the memo stays testable. */
export async function executeQueryUncached(sql: string): Promise<Record<string, string>[]> {
  const database = process.env.ATHENA_DATABASE;
  const outputBucket = process.env.ATHENA_OUTPUT_BUCKET;

  // Reuse is spread across every Fargate task, which is precisely what the
  // in-process memo above cannot do: a cold task (fresh deploy, scale-out) pays
  // full Athena latency on its first click — measured 1.6-3.5s per route, and
  // `SELECT 1` alone costs 2.6s here, so that is fixed engine overhead rather
  // than anything query tuning can reach.
  //
  // Spread in only when enabled, so the kill switch leaves the request
  // byte-identical to the pre-reuse one. This is only worth anything because the
  // route SQL now interpolates explicit date literals (lib/athena-window.ts):
  // reuse matches on the query string, and the old CURRENT_DATE form re-scanned
  // the full 100304 bytes on every run. Verify hits with DataScannedInBytes —
  // `ResultReuseInformation` is null here even on a hit.
  const reuse = resultReuseEnabled(process.env)
    ? {
        ResultReuseConfiguration: {
          ResultReuseByAgeConfiguration: {
            Enabled: true,
            MaxAgeInMinutes: RESULT_REUSE_MAX_AGE_MINUTES,
          },
        },
      }
    : {};

  const startResponse = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: {
        Database: database,
      },
      ResultConfiguration: {
        OutputLocation: outputBucket,
      },
      ...reuse,
    })
  );

  const queryExecutionId = startResponse.QueryExecutionId!;

  // Poll until the query reaches a terminal state. The status check is the FIRST
  // statement in the body and the sleep the LAST, so check #1 fires at t+0 —
  // that was already true before `pollDelayMs` and must stay true.
  let attempt = 0;
  while (true) {
    const statusResponse = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId })
    );

    const state = statusResponse.QueryExecution?.Status?.State;

    if (state === QueryExecutionState.SUCCEEDED) {
      break;
    }

    if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
      const reason =
        statusResponse.QueryExecution?.Status?.StateChangeReason ?? 'Unknown reason';
      throw new Error(`Query ${state}: ${reason}`);
    }

    // Only reached while RUNNING/QUEUED. The terminal branches above (break on
    // SUCCEEDED, throw on FAILED/CANCELLED) short-circuit before any sleep, so
    // FAILED/CANCELLED behaviour is byte-for-byte what it was.
    await new Promise((resolve) => setTimeout(resolve, pollDelayMs(attempt)));
    attempt++;
  }

  const resultsResponse = await client.send(
    new GetQueryResultsCommand({ QueryExecutionId: queryExecutionId })
  );

  const rows = resultsResponse.ResultSet?.Rows ?? [];
  const columnInfo = resultsResponse.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];

  const columns = columnInfo.map((col) => col.Name ?? '');

  // First row is the header row — skip it
  const dataRows = rows.slice(1);

  const mapRows = (rawRows: typeof dataRows) =>
    rawRows.map((row) => {
      const record: Record<string, string> = {};
      const data = row.Data ?? [];
      for (let i = 0; i < columns.length; i++) {
        record[columns[i]] = data[i]?.VarCharValue ?? '';
      }
      return record;
    });

  let allRows = mapRows(dataRows);
  let nextToken = resultsResponse.NextToken;
  while (nextToken) {
    const nextPage = await client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        NextToken: nextToken,
      })
    );
    const moreRows = (nextPage.ResultSet?.Rows ?? []).map((row) => {
      const record: Record<string, string> = {};
      const data = row.Data ?? [];
      for (let i = 0; i < columns.length; i++) {
        record[columns[i]] = data[i]?.VarCharValue ?? '';
      }
      return record;
    });
    allRows = allRows.concat(moreRows);
    nextToken = nextPage.NextToken;
  }
  return allRows;
}

export const NORMALIZE_USERID = `REGEXP_REPLACE(userid, '^d-[a-z0-9]+\\.', '')`;

export function safeFloat(val: string): number {
  const result = parseFloat(val);
  return isNaN(result) ? 0 : result;
}

export function safeInt(val: string): number {
  const result = parseInt(val, 10);
  return isNaN(result) ? 0 : result;
}

/**
 * Detects "the underlying Glue table or database does not exist yet" errors
 * so callers can return an empty result set instead of surfacing a 500 to
 * the UI. Covers:
 *   - Athena `TABLE_NOT_FOUND` / `COLUMN_NOT_FOUND` (fires when OpenCSVSerDe
 *     is pointed at an empty prefix or when the DB/table is absent)
 *   - Athena "Schema … does not exist" (missing Glue database)
 *   - AWS SDK `EntityNotFoundException` thrown by Glue directly
 *
 * A fresh `cdk deploy` without Kiro User Activity Report data will hit one
 * of these — the guard lets the dashboard degrade gracefully to empty
 * tables rather than crash the page.
 */
export function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { name?: string; message?: string };
  if (anyErr.name === 'EntityNotFoundException') return true;
  const msg = (anyErr.message ?? '').toLowerCase();
  return (
    msg.includes('column_not_found') ||
    msg.includes('table_not_found') ||
    msg.includes('does not exist') ||
    msg.includes('not found')
  );
}
