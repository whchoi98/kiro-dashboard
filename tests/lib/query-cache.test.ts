/**
 * The Athena result memo behind `executeQuery`. Every rule that could cause a
 * wrong or stale answer is pinned here, with an injected clock so no test
 * touches real timers.
 */

import fs from 'fs';
import path from 'path';
import {
  TtlMemo,
  utcDayStamp,
  queryCacheKey,
  readIntEnv,
  detachIfArray,
} from '../../lib/query-cache';

const ROOT = path.resolve(__dirname, '../..');

type Rows = Record<string, string>[];

function makeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('utcDayStamp / queryCacheKey', () => {
  it('formats a UTC day as YYYY-MM-DD with zero padding', () => {
    expect(utcDayStamp(Date.UTC(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
    expect(utcDayStamp(Date.UTC(2026, 10, 30, 0, 0, 0))).toBe('2026-11-30');
  });

  // Route SQL interpolates a day COUNT, not a date literal, so the string is
  // identical either side of midnight while CURRENT_DATE moves. Without the day
  // in the key, a cached row set would describe the wrong window.
  it('changes the key at UTC midnight for byte-identical SQL', () => {
    const sql = "SELECT 1 WHERE date >= DATE_ADD('day', -90, CURRENT_DATE)";
    const before = queryCacheKey(sql, Date.UTC(2026, 6, 29, 23, 59, 59));
    const after = queryCacheKey(sql, Date.UTC(2026, 6, 30, 0, 0, 0));
    expect(before).not.toBe(after);
  });

  it('is stable within a UTC day and distinguishes different SQL', () => {
    const noonish = Date.UTC(2026, 6, 29, 12, 0, 0);
    const later = Date.UTC(2026, 6, 29, 20, 0, 0);
    expect(queryCacheKey('SELECT a', noonish)).toBe(queryCacheKey('SELECT a', later));
    expect(queryCacheKey('SELECT a', noonish)).not.toBe(queryCacheKey('SELECT b', noonish));
  });

  it('keeps the full SQL in the key so different day-windows never collide', () => {
    const t = Date.UTC(2026, 6, 29, 12, 0, 0);
    const k7 = queryCacheKey("... -7, CURRENT_DATE)", t);
    const k90 = queryCacheKey("... -90, CURRENT_DATE)", t);
    expect(k7).not.toBe(k90);
  });

  it('separates the day stamp from the SQL with a NUL', () => {
    // NUL cannot appear in SQL, so no (day, sql) pair can collide with another
    // the way a printable separator could: with ':', day '2026-07-2' + ':9 SQL'
    // and day '2026-07-29' + ':SQL' are distinguishable only by luck.
    const key = queryCacheKey('SELECT 1', Date.UTC(2026, 6, 29, 12, 0, 0));
    expect(key).toBe('2026-07-29\0SELECT 1');
    expect(key.charCodeAt(10)).toBe(0);
  });

  it('spells the NUL as an escape so git does not see a binary file', () => {
    // A raw 0x00 in the first 8000 bytes makes git classify the whole module as
    // binary — no line diffs, no blame, no merge — over one character. This
    // shipped once; the escape is byte-identical at runtime (asserted above).
    const src = fs.readFileSync(path.join(ROOT, 'lib/query-cache.ts'), 'utf8');
    expect(src).toContain('\\0${sql}');
    expect(fs.readFileSync(path.join(ROOT, 'lib/query-cache.ts')).includes(0)).toBe(false);
  });
});

describe('readIntEnv', () => {
  it('reads a valid non-negative integer', () => {
    expect(readIntEnv({ X: '250' }, 'X', 60)).toBe(250);
    expect(readIntEnv({ X: '0' }, 'X', 60)).toBe(0);
  });

  it('falls back on absent, blank, non-numeric or negative values', () => {
    expect(readIntEnv({}, 'X', 60)).toBe(60);
    expect(readIntEnv({ X: '' }, 'X', 60)).toBe(60);
    expect(readIntEnv({ X: '   ' }, 'X', 60)).toBe(60);
    expect(readIntEnv({ X: 'abc' }, 'X', 60)).toBe(60);
    expect(readIntEnv({ X: '-5' }, 'X', 60)).toBe(60);
    expect(readIntEnv({ X: undefined }, 'X', 60)).toBe(60);
  });
});

describe('detachIfArray', () => {
  it('copies arrays so callers cannot mutate the cached entry', () => {
    const rows = [{ a: '1' }];
    const copy = detachIfArray(rows);
    expect(copy).toEqual(rows);
    expect(copy).not.toBe(rows);
  });

  it('passes non-arrays through untouched', () => {
    const obj = { a: '1' };
    expect(detachIfArray(obj)).toBe(obj);
  });
});

describe('TtlMemo', () => {
  it('calls the producer once and serves subsequent reads from cache', async () => {
    const clock = makeClock();
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10, now: clock.now });
    const producer = jest.fn(async () => [{ n: '1' }]);

    expect(await memo.run('k', producer)).toEqual([{ n: '1' }]);
    clock.advance(59_999);
    expect(await memo.run('k', producer)).toEqual([{ n: '1' }]);

    expect(producer).toHaveBeenCalledTimes(1);
    expect(memo.stats()).toMatchObject({ hits: 1, misses: 1 });
  });

  it('re-runs the producer once the TTL has elapsed', async () => {
    const clock = makeClock();
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10, now: clock.now });
    let call = 0;
    const producer = jest.fn(async () => [{ n: String(++call) }]);

    await memo.run('k', producer);
    clock.advance(60_001);
    expect(await memo.run('k', producer)).toEqual([{ n: '2' }]);
    expect(producer).toHaveBeenCalledTimes(2);
  });

  // A dashboard page fans out via Promise.all; identical SQL from two routes in
  // the same tick must not become two Athena executions.
  it('coalesces concurrent callers into a single producer call', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10 });
    let resolve!: (v: Rows) => void;
    const producer = jest.fn(() => new Promise<Rows>((r) => { resolve = r; }));

    const a = memo.run('k', producer);
    const b = memo.run('k', producer);
    const c = memo.run('k', producer);
    resolve([{ n: '1' }]);

    expect(await Promise.all([a, b, c])).toEqual([[{ n: '1' }], [{ n: '1' }], [{ n: '1' }]]);
    expect(producer).toHaveBeenCalledTimes(1);
    expect(memo.stats().coalesced).toBe(2);
  });

  // Routes turn a missing Glue table into a degraded 200. Pinning that error for
  // the whole TTL would keep the dashboard empty long after data appeared.
  it('never caches a rejection', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10 });
    const producer = jest
      .fn<Promise<Rows>, []>()
      .mockRejectedValueOnce(new Error('TABLE_NOT_FOUND'))
      .mockResolvedValueOnce([{ n: 'ok' }]);

    await expect(memo.run('k', producer)).rejects.toThrow('TABLE_NOT_FOUND');
    expect(await memo.run('k', producer)).toEqual([{ n: 'ok' }]);
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it('propagates a rejection to every coalesced caller', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10 });
    let reject!: (e: Error) => void;
    const producer = jest.fn(() => new Promise<Rows>((_, r) => { reject = r; }));

    const a = memo.run('k', producer);
    const b = memo.run('k', producer);
    reject(new Error('throttled'));

    await expect(a).rejects.toThrow('throttled');
    await expect(b).rejects.toThrow('throttled');
    expect(memo.stats().inflight).toBe(0);
  });

  it('hands each caller its own array so an in-place sort cannot poison the cache', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10 });
    const producer = jest.fn(async () => [{ n: '1' }, { n: '2' }]);

    const first = await memo.run('k', producer);
    first.reverse();
    expect(await memo.run('k', producer)).toEqual([{ n: '1' }, { n: '2' }]);
  });

  it('evicts the oldest entry beyond maxEntries, bounding memory', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 2 });
    await memo.run('a', async () => [{ n: 'a' }]);
    await memo.run('b', async () => [{ n: 'b' }]);
    await memo.run('c', async () => [{ n: 'c' }]);

    expect(memo.stats().size).toBe(2);
    expect(memo.stats().evictions).toBe(1);

    // 'a' was evicted, so it must re-run rather than return stale data.
    const producer = jest.fn(async () => [{ n: 'a2' }]);
    expect(await memo.run('a', producer)).toEqual([{ n: 'a2' }]);
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it('drops expired entries during writes so size stays bounded over a long uptime', async () => {
    const clock = makeClock();
    const memo = new TtlMemo<Rows>({ ttlMs: 1_000, maxEntries: 100, now: clock.now });
    for (let i = 0; i < 50; i++) {
      await memo.run(`k${i}`, async () => [{ n: String(i) }]);
      clock.advance(2_000);
    }
    expect(memo.stats().size).toBe(1);
  });

  it('bypasses caching entirely when ttlMs is 0 (env kill switch)', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 0, maxEntries: 10 });
    const producer = jest.fn(async () => [{ n: '1' }]);
    await memo.run('k', producer);
    await memo.run('k', producer);
    expect(memo.enabled).toBe(false);
    expect(producer).toHaveBeenCalledTimes(2);
    expect(memo.stats().size).toBe(0);
  });

  it('keeps distinct keys independent', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10 });
    expect(await memo.run('a', async () => [{ n: 'a' }])).toEqual([{ n: 'a' }]);
    expect(await memo.run('b', async () => [{ n: 'b' }])).toEqual([{ n: 'b' }]);
  });

  // `admit` bounds ONE entry. It is NOT the memory bound — see the maxWeight
  // block below for the cap that actually holds.
  it('returns but does not retain a value rejected by admit', async () => {
    const memo = new TtlMemo<Rows>({
      ttlMs: 60_000,
      maxEntries: 10,
      admit: (rows) => rows.length <= 2,
    });
    const big = jest.fn(async () => [{ n: '1' }, { n: '2' }, { n: '3' }]);

    expect(await memo.run('big', big)).toHaveLength(3);
    expect(await memo.run('big', big)).toHaveLength(3);
    expect(big).toHaveBeenCalledTimes(2);
    expect(memo.stats()).toMatchObject({ size: 0, rejected: 2 });
  });

  it('still caches values admit accepts', async () => {
    const memo = new TtlMemo<Rows>({
      ttlMs: 60_000,
      maxEntries: 10,
      admit: (rows) => rows.length <= 2,
    });
    const small = jest.fn(async () => [{ n: '1' }]);
    await memo.run('small', small);
    await memo.run('small', small);
    expect(small).toHaveBeenCalledTimes(1);
    expect(memo.stats()).toMatchObject({ size: 1, rejected: 0 });
  });

  it('clear() drops all entries', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10 });
    await memo.run('k', async () => [{ n: '1' }]);
    memo.clear();
    expect(memo.stats().size).toBe(0);
  });

  it('bypasses caching when maxEntries is 0', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 0 });
    const producer = jest.fn(async () => [{ n: '1' }]);
    await memo.run('k', producer);
    await memo.run('k', producer);
    expect(memo.enabled).toBe(false);
    expect(producer).toHaveBeenCalledTimes(2);
  });
});

/**
 * `admit` and `maxEntries` MULTIPLY. On their own they permit
 * maxEntries x maxRows retained row objects — 200 x 20,000 is ~4M rows, and a
 * 44-column `by_user_analytic` row retains ~3.4KB, so ~13 GB against a 1024 MiB
 * Fargate task. Fixed-SQL routes cannot reach that, but `/api/analyze` runs
 * LLM-authored SQL through the same memo and can mint arbitrarily many distinct
 * large keys in one chat session. Only a running total bounds it.
 */
describe('TtlMemo total-weight budget', () => {
  const rows = (n: number): Rows => Array.from({ length: n }, (_, i) => ({ n: String(i) }));

  it('reports summed weight, not entry count', async () => {
    const memo = new TtlMemo<Rows>({
      ttlMs: 60_000,
      maxEntries: 10,
      weigh: (r) => r.length,
      maxWeight: 100,
    });
    await memo.run('a', async () => rows(10));
    await memo.run('b', async () => rows(25));
    expect(memo.stats()).toMatchObject({ size: 2, weight: 35 });
  });

  it('evicts oldest-first until the total fits, even under the entry cap', async () => {
    const memo = new TtlMemo<Rows>({
      ttlMs: 60_000,
      // Deliberately generous: the entry cap must NOT be what stops this.
      maxEntries: 100,
      weigh: (r) => r.length,
      maxWeight: 50,
    });
    await memo.run('a', async () => rows(30));
    await memo.run('b', async () => rows(30));

    const s = memo.stats();
    expect(s.weight).toBeLessThanOrEqual(50);
    expect(s.size).toBe(1);
    expect(s.evictions).toBe(1);
    // The survivor is the newest write.
    expect(await memo.run('b', async () => rows(1))).toHaveLength(30);
  });

  it('does not retain a single value that exceeds the whole budget', async () => {
    const memo = new TtlMemo<Rows>({
      ttlMs: 60_000,
      maxEntries: 100,
      weigh: (r) => r.length,
      maxWeight: 50,
    });
    const producer = jest.fn(async () => rows(500));
    await memo.run('huge', producer);
    await memo.run('huge', producer);
    // Retaining it would blow the budget by construction; the caller already
    // has its copy, so dropping it is the correct outcome.
    expect(memo.stats()).toMatchObject({ size: 0, weight: 0 });
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it('caps total retention no matter how many distinct keys are minted', async () => {
    // Simulates the /api/analyze path: many distinct large keys in one session.
    const memo = new TtlMemo<Rows>({
      ttlMs: 60_000,
      maxEntries: 200,
      weigh: (r) => r.length,
      maxWeight: 1_000,
    });
    for (let i = 0; i < 50; i++) {
      await memo.run(`q${i}`, async () => rows(400));
    }
    expect(memo.stats().weight).toBeLessThanOrEqual(1_000);
  });

  it('treats weight as entry count when weigh is omitted', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10, maxWeight: 2 });
    await memo.run('a', async () => rows(999));
    await memo.run('b', async () => rows(999));
    await memo.run('c', async () => rows(999));
    expect(memo.stats()).toMatchObject({ size: 2, weight: 2 });
  });

  it('is unbounded when maxWeight is unset (backwards compatible)', async () => {
    const memo = new TtlMemo<Rows>({ ttlMs: 60_000, maxEntries: 10, weigh: (r) => r.length });
    await memo.run('a', async () => rows(10_000));
    await memo.run('b', async () => rows(10_000));
    expect(memo.stats()).toMatchObject({ size: 2, evictions: 0 });
  });
});

/**
 * The stamp must roll with Athena's CURRENT_DATE (00:00 UTC), NOT with the
 * 02:00 UTC report drop. Offsetting it to 02:00 is a plausible-looking "fix"
 * that serves a one-day-stale window for two hours every day, so it is pinned
 * here rather than left to the doc comment alone.
 */
describe('utcDayStamp is not offset to the 02:00 UTC report drop', () => {
  it('already reads the new day at 00:00-02:00 UTC, matching CURRENT_DATE', () => {
    expect(utcDayStamp(Date.UTC(2026, 6, 29, 0, 0, 0))).toBe('2026-07-29');
    expect(utcDayStamp(Date.UTC(2026, 6, 29, 1, 59, 0))).toBe('2026-07-29');
  });

  it('gives 01:59Z a different key than the previous evening', () => {
    const sql = "SELECT 1 WHERE date >= DATE_ADD('day', -90, CURRENT_DATE)";
    // With an 02:00 offset both of these would read "2026-07-28" and collide,
    // even though the SQL window floor moved from 04-29 to 04-30 at midnight.
    const prevEvening = queryCacheKey(sql, Date.UTC(2026, 6, 28, 20, 0, 0));
    const earlyMorning = queryCacheKey(sql, Date.UTC(2026, 6, 29, 1, 59, 0));
    expect(prevEvening).not.toBe(earlyMorning);
  });
});

/**
 * /api/ingest-health is the report-freshness monitor. Its own header comment
 * says freezing it at whatever it first saw is "the one thing it must never
 * do", so it must bypass the memo entirely. Read off disk (same pattern as
 * tests/api/hardcode-audit.test.ts) because the defect is which symbol the
 * route imports, not what the route returns.
 */
describe('/api/ingest-health bypasses the query memo', () => {
  const routePath = path.resolve(
    __dirname,
    '..',
    '..',
    'app',
    'api',
    'ingest-health',
    'route.ts'
  );
  const src = fs.readFileSync(routePath, 'utf8');

  it('never calls the memoized executeQuery()', () => {
    // `executeQueryUncached(` does not match: the char after "executeQuery"
    // is "U", not "(".
    expect(src).not.toContain('executeQuery(');
  });

  it('does not import the memoized executeQuery from lib/athena', () => {
    const importLine = src
      .split('\n')
      .find((l) => l.includes("from '@/lib/athena'")) ?? '';
    expect(importLine).not.toMatch(/\bexecuteQuery\b\s*(,|})/);
    expect(importLine).toContain('executeQueryUncached');
  });

  it('still calls the uncached path for both of its Athena queries', () => {
    const calls = src.match(/executeQueryUncached\(/g) ?? [];
    expect(calls).toHaveLength(2);
  });
});

/** The memo has to actually be wired into executeQuery, or none of it runs. */
describe('lib/athena.ts wiring', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'lib', 'athena.ts'),
    'utf8'
  );

  it('routes executeQuery through the memo and keeps an uncached escape hatch', () => {
    expect(src).toContain('queryMemo.run(');
    expect(src).toContain('export async function executeQueryUncached');
  });

  it('bounds TOTAL retained rows, not just rows per entry', () => {
    // Without maxWeight the two caps multiply: 200 entries x 20,000 rows is
    // ~4M row objects (~13 GB at by_user_analytic width) in a 1024 MiB task.
    expect(src).toContain('maxWeight:');
    expect(src).toContain('weigh: (rows) => rows.length');
    expect(src).toContain('QUERY_CACHE_MAX_TOTAL_ROWS');
  });

  it('keeps the total-rows budget inside a 1024 MiB task', () => {
    // ~3.4KB per 44-column row measured, so the default must stay well under
    // ~300k rows. 50k is ~170 MiB.
    const m = src.match(/'ATHENA_QUERY_CACHE_MAX_TOTAL_ROWS',\s*([\d_]+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1].replace(/_/g, ''))).toBeLessThanOrEqual(100_000);
  });

  it('does not claim admit alone bounds memory', () => {
    // The old comment said the per-entry cap "keeps a future large query from
    // filling a 1024 MiB task". It bounds one entry, not the memo, and an
    // overstated guarantee here actively suppresses the real fix later.
    expect(src).not.toMatch(/Bounds bytes, not just entry count/);
  });
});
