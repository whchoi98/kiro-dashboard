/**
 * In-process TTL memo with single-flight coalescing.
 *
 * WHY THIS EXISTS
 * Kiro User Activity Reports land once daily at 02:00 UTC (see CLAUDE.md
 * "Reference Documentation"). The underlying data is therefore immutable for
 * ~24h, so returning a value computed seconds ago cannot be staler than the
 * source, which is already up to 24h old. Caching here trades no correctness.
 *
 * WHY IT LIVES IN lib/ AND NOT IN A route.ts
 *  - `route.ts` may export only route handlers and Next config symbols.
 *  - Jest `testMatch` is `**\/*.test.ts`, so logic in `.tsx` is unreachable.
 * Keeping the policy (key derivation, expiry, eviction) as pure functions here
 * makes all of it unit-testable without an AWS account.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * It sets no HTTP cache headers and touches no route config, so it cannot
 * regress the force-static trap. The Next-native primitives were measured and
 * rejected, recorded here so nobody re-litigates them:
 *  - `export const revalidate = N` on a route that reads `req.url` leaves the
 *    route dynamic with zero caching. Inert work that reads as a fix.
 *  - The same line on a route that does NOT read `req.url` flips it to static
 *    and permanently bakes build-time data — the force-static trap in a new
 *    costume, still live in Next 14.2.35. That trap once shipped Korean release
 *    notes to English users and is now pinned by a test.
 *  - `Cache-Control: s-maxage=…` on the data routes emits a header that buys
 *    nothing: the CloudFront distribution attaches Managed-CachingDisabled
 *    (MinTTL/MaxTTL/DefaultTTL all 0) and MaxTTL=0 clamps s-maxage to zero.
 */

/** Monotonic-enough clock, injectable so tests never touch real timers. */
export type Clock = () => number;

export interface TtlMemoOptions<T = unknown> {
  /** 0 or less disables caching entirely (env kill switch). */
  ttlMs: number;
  /** Hard cap on retained entries; oldest insertion is evicted first. */
  maxEntries: number;
  /**
   * Optional per-value size guard. When it returns false the value is still
   * returned to the caller but never retained.
   *
   * Bounds ONE entry, not the memo — see `maxWeight` for the total. Use this to
   * refuse a single pathologically large result outright.
   */
  admit?: (value: T) => boolean;
  /**
   * Optional size of one retained value, in whatever unit `maxWeight` uses
   * (rows, for the Athena memo). Defaults to 1, i.e. weight == entry count.
   */
  weigh?: (value: T) => number;
  /**
   * Cap on TOTAL retained weight; oldest entries are evicted until the sum
   * fits. 0 or less means unbounded (weight is then only bounded by
   * `maxEntries`).
   *
   * WHY BOTH THIS AND `admit`
   * `admit` alone does NOT bound memory, because the two caps multiply: 200
   * entries x a 20,000-row `admit` ceiling permits ~4M retained row objects. A
   * 44-column `by_user_analytic` row retains ~3.4KB, so that is ~13 GB against a
   * 1024 MiB Fargate task. Fixed SQL cannot reach it, but `/api/analyze` runs
   * LLM-authored SQL through the same memo and can mint arbitrarily many
   * distinct large keys in one chat session. A running total is the only cap
   * that actually holds.
   */
  maxWeight?: number;
  now?: Clock;
}

export interface MemoStats {
  hits: number;
  misses: number;
  /** Requests that joined an already in-flight call instead of starting one. */
  coalesced: number;
  evictions: number;
  /** Results returned but not retained because `admit` rejected them. */
  rejected: number;
  size: number;
  /** Sum of `weigh(value)` across retained entries — the real memory proxy. */
  weight: number;
  inflight: number;
}

interface Entry<T> {
  value: T;
  expiresAt: number;
  weight: number;
}

/**
 * Whole-UTC-day stamp, e.g. "2026-07-29".
 *
 * Route SQL interpolates a day COUNT, not a date literal:
 *   DATE_ADD('day', -${days}, CURRENT_DATE)
 * so the query string is byte-identical either side of UTC midnight while
 * CURRENT_DATE resolves at execution time. Keying on the SQL alone would let a
 * cached answer describe yesterday's window. Folding the UTC day into the key
 * makes every entry self-invalidate at 00:00 UTC.
 *
 * THE BOUNDARY IS 00:00 UTC, NOT 02:00 UTC. DO NOT "FIX" THIS.
 * Reports land at 02:00 UTC, so offsetting the stamp to 02:00 to match the
 * ingest time looks like the obvious correction. It is a correctness
 * regression, because the key's only job is to track the SQL WINDOW, and the
 * window is set by Athena's `CURRENT_DATE`, which rolls at 00:00 UTC. The stamp
 * must roll on the same instant as the thing it is standing in for.
 *
 * Concretely, with an 02:00 offset at 2026-07-29T01:59Z: Athena's CURRENT_DATE
 * is already 2026-07-29 so a 90-day floor is 2026-04-30, but the key would read
 * "2026-07-28" — the same key minted at 2026-07-28T20:00Z when the floor was
 * 2026-04-29. The cached rows describe a window one day stale, and they do so
 * for two hours every single day.
 *
 * The objection to 00:00 is real but trivial: between 00:00 and 02:00 the keys
 * rotate before any new data exists, so those queries re-execute for nothing.
 * That costs one extra Athena query per distinct key per day. Paying it is
 * strictly better than serving a window that does not match the SQL.
 *
 * (Once route SQL interpolates explicit date literals — see the athena-window
 * follow-on — the SQL itself carries the window and this stamp becomes
 * redundant. It stays as defence in depth; both rotate on the same boundary.)
 */
export function utcDayStamp(nowMs: number): string {
  const d = new Date(nowMs);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** Cache key for one query. Exported so a test can pin the day-rollover rule. */
export function queryCacheKey(sql: string, nowMs: number): string {
  // The separator is a literal NUL as an ESCAPE, not a raw byte: a raw 0x00
  // inside the first 8000 bytes makes git classify this whole file as binary,
  // losing line diffs, blame and merges over one character. NUL is still the
  // right separator (it cannot occur in SQL, so no (day, sql) pair can collide
  // with another the way a space or ':' could) — just spell it.
  return `${utcDayStamp(nowMs)}\0${sql}`;
}

/**
 * Reads `name` as a non-negative integer, falling back to `fallback` on absent,
 * blank, non-numeric or negative input. Kept pure (env passed in) so the
 * precedence rules are testable.
 */
export function readIntEnv(
  env: Record<string, string | undefined>,
  name: string,
  fallback: number
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

/**
 * Returns a shallow copy when `value` is an array, otherwise `value` itself.
 *
 * Cached rows are handed to every caller, so an in-place `rows.sort()` in some
 * future route would corrupt the entry for everyone. No current route mutates
 * its rows (verified by grep across app/api/), but copying the array makes the
 * most likely mutation harmless for ~1000 rows at negligible cost.
 */
export function detachIfArray<T>(value: T): T {
  return (Array.isArray(value) ? (value.slice() as unknown as T) : value);
}

export class TtlMemo<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  private readonly now: Clock;
  private hits = 0;
  private misses = 0;
  private coalesced = 0;
  private evictions = 0;
  private rejected = 0;

  constructor(private readonly options: TtlMemoOptions<T>) {
    this.now = options.now ?? Date.now;
  }

  get enabled(): boolean {
    return this.options.ttlMs > 0 && this.options.maxEntries > 0;
  }

  /**
   * Returns the memoized value for `key`, calling `producer` at most once per
   * key per TTL window even under concurrent callers.
   *
   * Rejections are never cached: a transient Athena throttle or a
   * not-yet-provisioned Glue table must not be pinned for the whole TTL, since
   * routes translate those into degraded 200 responses.
   */
  async run(key: string, producer: () => Promise<T>): Promise<T> {
    if (!this.enabled) return producer();

    const t = this.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > t) {
      this.hits++;
      return detachIfArray(hit.value);
    }
    if (hit) this.entries.delete(key);

    const pending = this.inflight.get(key);
    if (pending) {
      this.coalesced++;
      return pending.then(detachIfArray);
    }

    this.misses++;
    const promise = producer().then(
      (value) => {
        this.inflight.delete(key);
        this.store(key, value);
        return value;
      },
      (err) => {
        this.inflight.delete(key);
        throw err;
      }
    );
    this.inflight.set(key, promise);
    return promise.then(detachIfArray);
  }

  private store(key: string, value: T): void {
    if (this.options.admit && !this.options.admit(value)) {
      this.rejected++;
      return;
    }
    const weight = Math.max(0, this.options.weigh?.(value) ?? 1);
    this.entries.set(key, { value, expiresAt: this.now() + this.options.ttlMs, weight });
    this.pruneExpired();

    const maxWeight = this.options.maxWeight ?? 0;
    // Evict oldest-first until BOTH caps hold. `entries` is a Map, so its first
    // key is the oldest write. The just-stored entry is evictable too: if a
    // single value exceeds `maxWeight` on its own, dropping it is correct —
    // retaining it would blow the budget by construction, and the caller
    // already has its copy.
    while (
      this.entries.size > this.options.maxEntries ||
      (maxWeight > 0 && this.retainedWeight() > maxWeight)
    ) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
      this.evictions++;
    }
  }

  /**
   * Summed on demand rather than tracked incrementally: at `maxEntries` = 200
   * this is a 200-element loop on a cache miss (which just waited seconds on
   * Athena), and an incremental counter would silently drift out of sync with
   * the Map on any future edit to the eviction paths.
   */
  private retainedWeight(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.weight;
    return total;
  }

  private pruneExpired(): void {
    const t = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= t) this.entries.delete(key);
    }
  }

  stats(): MemoStats {
    return {
      hits: this.hits,
      misses: this.misses,
      coalesced: this.coalesced,
      evictions: this.evictions,
      rejected: this.rejected,
      size: this.entries.size,
      weight: this.retainedWeight(),
      inflight: this.inflight.size,
    };
  }

  /** Test/ops hook — drops every entry without disturbing in-flight calls. */
  clear(): void {
    this.entries.clear();
  }
}
