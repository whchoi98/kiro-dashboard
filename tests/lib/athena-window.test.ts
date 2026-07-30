/**
 * The date-window helper that has to land BEFORE Athena result reuse.
 *
 * Reuse keys on the exact query string, so `DATE_ADD('day', -90, CURRENT_DATE)`
 * can never hit: the string is stable but the window it resolves to is not, and
 * Athena refuses to reuse a result for a query whose predicate is not a literal.
 * Measured live: the CURRENT_DATE form scanned the full 100304 bytes on both
 * consecutive runs; with a literal date it went 100304 -> 0 bytes and 808ms ->
 * 242ms, with `ReusedPreviousResult: true`.
 *
 * So these tests pin the two things reuse depends on:
 *   - the SAME (days, now-within-a-UTC-day) always renders the SAME literal,
 *     because a literal that moves per request would defeat reuse just as
 *     thoroughly as CURRENT_DATE did;
 *   - the literal rolls at 00:00 UTC, matching Athena's CURRENT_DATE and
 *     `utcDayStamp` in lib/query-cache.ts. All three must roll on one instant.
 *
 * Computed with getUTC* math only — a local-timezone Date method here would put
 * the window a day off for part of every day in any non-UTC deployment.
 */

import {
  windowFloor,
  isoDateLiteral,
  buaDateLiteral,
  RESULT_REUSE_MAX_AGE_MINUTES,
  resultReuseEnabled,
} from '../../lib/athena-window';

/** 2026-07-29T12:00:00Z — mid-day, so a UTC/local mixup shows up as a shift. */
const NOON = Date.UTC(2026, 6, 29, 12, 0, 0);

describe('windowFloor', () => {
  it('subtracts whole days from the UTC date', () => {
    expect(windowFloor(90, NOON)).toBe('2026-04-30');
  });

  it('treats 0 days as today (an empty window, not a missing filter)', () => {
    expect(windowFloor(0, NOON)).toBe('2026-07-29');
  });

  it('crosses month and year boundaries', () => {
    expect(windowFloor(1, Date.UTC(2026, 0, 1, 0, 0, 0))).toBe('2025-12-31');
    expect(windowFloor(31, Date.UTC(2026, 2, 31, 23, 59, 59))).toBe('2026-02-28');
  });

  it('is stable across a whole UTC day so reuse can actually hit', () => {
    const justAfterMidnight = Date.UTC(2026, 6, 29, 0, 0, 0);
    const justBeforeMidnight = Date.UTC(2026, 6, 29, 23, 59, 59, 999);
    expect(windowFloor(90, justAfterMidnight)).toBe(windowFloor(90, NOON));
    expect(windowFloor(90, justBeforeMidnight)).toBe(windowFloor(90, NOON));
  });

  it('rolls at 00:00 UTC, the same instant as CURRENT_DATE and utcDayStamp', () => {
    const lastMs = Date.UTC(2026, 6, 29, 23, 59, 59, 999);
    const firstMs = Date.UTC(2026, 6, 30, 0, 0, 0);
    expect(windowFloor(90, lastMs)).toBe('2026-04-30');
    expect(windowFloor(90, firstMs)).toBe('2026-05-01');
  });

  it('rejects a non-finite or negative day count rather than emitting bad SQL', () => {
    expect(() => windowFloor(-1, NOON)).toThrow(/days/i);
    expect(() => windowFloor(NaN, NOON)).toThrow(/days/i);
    expect(() => windowFloor(1.5, NOON)).toThrow(/days/i);
  });
});

describe('isoDateLiteral', () => {
  // user_report.date is a 'YYYY-MM-DD' string, compared as a string.
  it('quotes the floor for string comparison against user_report.date', () => {
    expect(isoDateLiteral(90, NOON)).toBe("'2026-04-30'");
  });
});

describe('buaDateLiteral', () => {
  // by_user_analytic.date is 'MM-DD-YYYY' and is read via
  // DATE_PARSE(date, '%m-%d-%Y'), which yields a timestamp — so the right-hand
  // side must be a DATE, not a quoted string, or Athena raises a type error.
  it('emits a DATE literal for comparison against DATE_PARSE output', () => {
    expect(buaDateLiteral(90, NOON)).toBe("DATE '2026-04-30'");
  });

  it('describes the same instant as the ISO form', () => {
    expect(buaDateLiteral(90, NOON)).toContain(windowFloor(90, NOON));
  });
});

describe('result reuse configuration', () => {
  // 60, not 1440: any query still carrying CURRENT_DATE could otherwise be
  // served a window predating the newest 02:00 UTC report.
  it('caps reuse age at 60 minutes', () => {
    expect(RESULT_REUSE_MAX_AGE_MINUTES).toBe(60);
  });

  it('is on by default and killable with ATHENA_RESULT_REUSE=0', () => {
    expect(resultReuseEnabled({})).toBe(true);
    expect(resultReuseEnabled({ ATHENA_RESULT_REUSE: '1' })).toBe(true);
    expect(resultReuseEnabled({ ATHENA_RESULT_REUSE: '0' })).toBe(false);
  });
});
