/**
 * Explicit date literals for route SQL windows, plus the Athena result-reuse knobs.
 *
 * WHY THIS EXISTS
 * Athena's `ResultReuseByAgeConfiguration` matches on the query string. Route SQL
 * used to interpolate a day COUNT and let the engine resolve the window:
 *
 *   WHERE date >= DATE_FORMAT(DATE_ADD('day', -90, CURRENT_DATE), '%Y-%m-%d')
 *
 * That form can never be reused. Measured live in this account: two consecutive
 * runs each scanned the full 100304 bytes; swapping in a literal date took it to
 * 100304 -> 0 bytes and 808ms -> 242ms. So the literals are not a tidy-up that
 * happens to precede reuse — reuse without them is a provable no-op, which is
 * exactly why lib/CLAUDE.md calls the ordering non-negotiable.
 *
 * Judge a hit by DataScannedInBytes, NOT by `ResultReuseInformation`: that field
 * comes back null from GetQueryExecution in this account even on a confirmed hit.
 *
 * WHY THE MATH IS getUTC* ONLY
 * The floor has to roll on the same instant as Athena's `CURRENT_DATE` (00:00 UTC)
 * and as `utcDayStamp` in query-cache.ts. A local-timezone Date method here would
 * put the window a day off for part of every day in any non-UTC deployment, and
 * the two caches would rotate on different instants.
 *
 * WHY IT IS PURE AND LIVES HERE
 * `route.ts` may export only route handlers and Next config symbols, and Jest
 * only collects `*.test.ts`. Taking `nowMs` as a parameter (rather than reading
 * the clock) is what lets tests pin the 00:00 UTC boundary without fake timers.
 */

/** Sole clock read for callers that do not have a timestamp in hand. */
const MS_PER_DAY = 86_400_000;

/**
 * The inclusive floor of a `days`-wide window ending today, as `YYYY-MM-DD` UTC.
 *
 * Throws on a non-integer or negative `days` instead of interpolating `NaN` into
 * SQL: routes derive `days` from a query param, and `WHERE date >= 'NaN'` is a
 * silently empty dashboard rather than an error anyone would notice.
 */
export function windowFloor(days: number, nowMs: number): string {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`windowFloor: days must be a non-negative integer, got ${days}`);
  }
  // Truncate to the UTC day FIRST, then subtract whole days. Subtracting from the
  // raw timestamp would carry the time-of-day along and, on a DST-shifted local
  // clock, could land on the wrong date.
  const d = new Date(nowMs);
  const todayUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const floor = new Date(todayUtc - days * MS_PER_DAY);
  const mm = String(floor.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(floor.getUTCDate()).padStart(2, '0');
  return `${floor.getUTCFullYear()}-${mm}-${dd}`;
}

/**
 * Quoted floor for `user_report.date`, which is a `YYYY-MM-DD` STRING compared
 * lexicographically — so the right-hand side must be a quoted string.
 */
export function isoDateLiteral(days: number, nowMs: number): string {
  return `'${windowFloor(days, nowMs)}'`;
}

/**
 * `DATE` literal for `by_user_analytic.date`, which is `MM-DD-YYYY` and is read
 * through `DATE_PARSE(date, '%m-%d-%Y')`. That yields a timestamp, so comparing
 * it against a quoted string is a type error in Athena — this side must be a
 * real DATE. Same instant as `isoDateLiteral`, different SQL spelling.
 */
export function buaDateLiteral(days: number, nowMs: number): string {
  return `DATE '${windowFloor(days, nowMs)}'`;
}

/**
 * How stale a reused Athena result may be.
 *
 * 60, NOT 1440. Any query that still resolves its own window (a route not yet
 * converted, or `/api/analyze`'s LLM-authored SQL) could otherwise be served a
 * result computed before the newest 02:00 UTC report landed. An hour bounds that
 * to less than the gap between daily drops.
 */
export const RESULT_REUSE_MAX_AGE_MINUTES = 60;

/**
 * Reuse is on by default; `ATHENA_RESULT_REUSE=0` is the kill switch, matching
 * the `0`-disables convention every other perf knob in this project uses.
 */
// Takes the one variable it reads rather than the whole `NodeJS.ProcessEnv`, so
// a test can pass `{}` for "unset" without having to fabricate NODE_ENV and the
// rest of the required shape.
export function resultReuseEnabled(env: Partial<Record<string, string>>): boolean {
  return env.ATHENA_RESULT_REUSE !== '0';
}
