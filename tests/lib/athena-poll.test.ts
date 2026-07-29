/**
 * Athena status-poll schedule.
 *
 * Context matters here, because the change these tests guard is the OPPOSITE of
 * what a plausible-sounding "add backoff to the Athena poll" ticket asks for.
 * Two claims about this loop were investigated and refuted:
 *
 *   1. "The first status check waits 500ms." It does not, and never did — the
 *      check is the first statement in the loop body and the sleep is the last.
 *   2. "Add exponential backoff." That would REGRESS latency: these queries
 *      finish in ~1-3s and completion is detected one interval late on average,
 *      so any interval above the old fixed 500ms detects completion later than
 *      before.
 *
 * So `pollDelayMs` ramps UP to 500 and is capped there: 500 is the ceiling, not
 * the floor. `capNeverExceedsTheHistoricalFixedInterval` below is the test that
 * fails if someone "adds backoff" on top of this.
 */

import { pollDelayMs, POLL_DELAY_CAP_MS, POLL_DELAY_RAMP_MS } from '../../lib/athena';

/** The fixed interval this loop used before the ramp. The cap must not exceed it. */
const HISTORICAL_FIXED_DELAY_MS = 500;

describe('pollDelayMs', () => {
  it('starts well below the historical fixed interval', () => {
    expect(pollDelayMs(0)).toBeLessThan(HISTORICAL_FIXED_DELAY_MS);
    expect(pollDelayMs(0)).toBeGreaterThan(0);
  });

  it('ramps upward monotonically', () => {
    for (let i = 1; i < 12; i++) {
      expect(pollDelayMs(i)).toBeGreaterThanOrEqual(pollDelayMs(i - 1));
    }
  });

  it('caps at POLL_DELAY_CAP_MS and stays there forever', () => {
    for (const attempt of [POLL_DELAY_RAMP_MS.length, 10, 100, 10_000]) {
      expect(pollDelayMs(attempt)).toBe(POLL_DELAY_CAP_MS);
    }
  });

  it('capNeverExceedsTheHistoricalFixedInterval — this is the anti-backoff pin', () => {
    // Exponential backoff would push later attempts above 500ms and detect
    // completion LATER than the code it replaced. Every attempt must stay <= 500.
    expect(POLL_DELAY_CAP_MS).toBeLessThanOrEqual(HISTORICAL_FIXED_DELAY_MS);
    for (let i = 0; i < 50; i++) {
      expect(pollDelayMs(i)).toBeLessThanOrEqual(HISTORICAL_FIXED_DELAY_MS);
    }
  });

  it('cuts total wait versus the old fixed interval for every prefix of the schedule', () => {
    const rampTotal = (n: number) =>
      Array.from({ length: n }, (_, i) => pollDelayMs(i)).reduce((a, b) => a + b, 0);
    for (let n = 1; n <= 8; n++) {
      expect(rampTotal(n)).toBeLessThanOrEqual(n * HISTORICAL_FIXED_DELAY_MS);
    }
    // And strictly less while the ramp is still below the cap.
    expect(rampTotal(2)).toBeLessThan(2 * HISTORICAL_FIXED_DELAY_MS);
  });

  it('is total over hostile attempt values rather than returning NaN/undefined', () => {
    // The loop counter can only be a non-negative integer, but a NaN delay would
    // make setTimeout fire immediately and turn the poll into a hot loop against
    // an account-shared Athena rate limit — so degrade to the ramp head instead.
    for (const bad of [-1, -100, NaN, Infinity, -Infinity]) {
      const delay = pollDelayMs(bad);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(POLL_DELAY_CAP_MS);
    }
    expect(pollDelayMs(1.7)).toBe(pollDelayMs(1));
  });
});
