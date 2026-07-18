/**
 * /api/subscription must degrade gracefully on fresh accounts:
 *  - Athena returning zero rows → 200 + well-shaped empty SubscriptionData
 *  - Missing Glue table/database (isMissingTableError) → 200 + same shape
 * It must also pivot tier trends and compute credit share / cap utilization
 * from the raw Athena string rows.
 */

import { isMissingTableError } from '../../lib/athena';

jest.mock('../../lib/athena', () => {
  const actual = jest.requireActual('../../lib/athena');
  return {
    ...actual,
    executeQuery: jest.fn(),
  };
});

jest.mock('../../lib/glue', () => ({
  resolveTableName: jest.fn().mockResolvedValue('user_report'),
}));

jest.mock('../../lib/identity', () => ({
  resolveUserDetails: jest.fn().mockResolvedValue(new Map()),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executeQuery } = require('../../lib/athena');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveUserDetails } = require('../../lib/identity');

const missingTableErr = new Error(
  "Query FAILED: COLUMN_NOT_FOUND: line 2:24: Column 'userid' cannot be resolved"
);

const EMPTY_SHAPE = {
  tiers: [],
  tierTrend: [],
  overageSummary: {
    enabledUsers: 0,
    totalUsers: 0,
    totalOverageCredits: 0,
    totalBaseCredits: 0,
  },
  overageUsers: [],
};

async function callRoute(days = 30) {
  const { GET } = await import('../../app/api/subscription/route');
  return GET(new Request(`http://localhost/api/subscription?days=${days}`) as any);
}

describe('/api/subscription', () => {
  beforeEach(() => {
    (executeQuery as jest.Mock).mockReset();
    (resolveUserDetails as jest.Mock).mockReset();
    (resolveUserDetails as jest.Mock).mockResolvedValue(new Map());
  });

  it('returns 200 + well-shaped empty payload when Athena returns no rows', async () => {
    (executeQuery as jest.Mock).mockResolvedValue([]);

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY_SHAPE);
  });

  it('returns 200 + well-shaped empty payload when the Glue table is missing', async () => {
    (executeQuery as jest.Mock).mockRejectedValue(missingTableErr);

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY_SHAPE);
  });

  it('still returns 500 for non-missing-table errors', async () => {
    (executeQuery as jest.Mock).mockRejectedValue(new Error('Athena throttled the request'));

    const res = await callRoute();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to fetch subscription analysis' });
  });

  it('pivots tier trend, computes credit share and cap utilization', async () => {
    (executeQuery as jest.Mock).mockImplementation(async (sql: string) => {
      if (sql.includes('GROUP BY date, subscription_tier')) {
        // Intentionally out of date order — the route must sort ascending
        return [
          { date: '2026-07-02', subscription_tier: 'PRO', credits: '20' },
          { date: '2026-07-01', subscription_tier: 'PRO', credits: '50' },
          { date: '2026-07-01', subscription_tier: 'POWER', credits: '10' },
        ];
      }
      if (sql.includes('GROUP BY subscription_tier')) {
        return [
          { subscription_tier: 'PRO', user_count: '10', total_credits: '300', total_messages: '1000' },
          { subscription_tier: 'POWER', user_count: '2', total_credits: '100', total_messages: '400' },
        ];
      }
      if (sql.includes('HAVING')) {
        return [
          { userid: 'user-aaa', overage_cap: '100', overage_credits: '90', tier: 'PRO', utilization: '90' },
          { userid: 'user-bbb', overage_cap: '0', overage_credits: '5', tier: 'POWER', utilization: '0' },
        ];
      }
      // overage summary
      return [
        {
          enabled_users: '3',
          total_users: '12',
          total_overage_credits: '40',
          total_base_credits: '400',
        },
      ];
    });
    (resolveUserDetails as jest.Mock).mockResolvedValue(
      new Map([
        ['user-aaa', { username: 'us******', displayName: 'Al***', email: '', organization: '' }],
      ])
    );

    const res = await callRoute(30);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.tiers).toEqual([
      { tier: 'PRO', userCount: 10, totalCredits: 300, totalMessages: 1000, creditShare: 75 },
      { tier: 'POWER', userCount: 2, totalCredits: 100, totalMessages: 400, creditShare: 25 },
    ]);

    expect(body.tierTrend).toEqual([
      { date: '2026-07-01', PRO: 50, POWER: 10 },
      { date: '2026-07-02', PRO: 20 },
    ]);

    expect(body.overageSummary).toEqual({
      enabledUsers: 3,
      totalUsers: 12,
      totalOverageCredits: 40,
      totalBaseCredits: 400,
    });

    expect(body.overageUsers).toEqual([
      {
        userid: 'user-aaa',
        displayName: 'Al***', // resolved via lib/identity (masked)
        tier: 'PRO',
        overageCredits: 90,
        overageCap: 100,
        utilization: 90,
      },
      {
        userid: 'user-bbb',
        displayName: 'us******', // maskText fallback for unresolved ids
        tier: 'POWER',
        overageCredits: 5,
        overageCap: 0,
        utilization: 0, // cap of 0 must not divide by zero
      },
    ]);
  });
});

describe('isMissingTableError wiring', () => {
  it('recognizes the raw Athena error used above', () => {
    expect(isMissingTableError(missingTableErr)).toBe(true);
  });
});
