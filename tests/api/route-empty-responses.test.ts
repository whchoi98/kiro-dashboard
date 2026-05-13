/**
 * Verifies that when Athena signals "missing table" (because the Glue
 * catalog has not been provisioned yet), every dashboard API route
 * degrades to a 200 with an empty-but-well-shaped payload instead of
 * surfacing a 500 to the UI. This is the backend leg of the defense
 * that keeps a fresh `cdk deploy` from crashing the `/users`, `/credits`,
 * `/trends` etc. pages.
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

const missingTableErr = new Error(
  "Query FAILED: COLUMN_NOT_FOUND: line 2:24: Column 'userid' cannot be resolved"
);

function makeReq(path: string) {
  return new Request(`http://localhost${path}`);
}

describe('dashboard API routes tolerate missing tables', () => {
  beforeEach(() => {
    (executeQuery as jest.Mock).mockReset();
    (executeQuery as jest.Mock).mockRejectedValue(missingTableErr);
  });

  it('/api/users returns 200 + empty array', async () => {
    const { GET } = await import('../../app/api/users/route');
    const res = await GET(makeReq('/api/users?days=90&limit=10') as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('/api/trends returns 200 + empty array', async () => {
    const { GET } = await import('../../app/api/trends/route');
    const res = await GET(makeReq('/api/trends?days=30') as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('/api/client-dist returns 200 + empty array', async () => {
    const { GET } = await import('../../app/api/client-dist/route');
    const res = await GET(makeReq('/api/client-dist?days=30') as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('/api/metrics returns 200 + zero summary', async () => {
    const { GET } = await import('../../app/api/metrics/route');
    const res = await GET(makeReq('/api/metrics?days=30') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalUsers).toBe(0);
    expect(body.totalMessages).toBe(0);
    expect(body.changeRates).toBeDefined();
  });

  it('/api/credits returns 200 + empty analysis', async () => {
    const { GET } = await import('../../app/api/credits/route');
    const res = await GET(makeReq('/api/credits?days=30') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topUsers).toEqual([]);
    expect(body.byTier).toEqual([]);
    expect(body.baseVsOverage).toEqual({ base: 0, overage: 0 });
  });

  it('/api/engagement returns 200 + empty funnel/segments', async () => {
    const { GET } = await import('../../app/api/engagement/route');
    const res = await GET(makeReq('/api/engagement?days=30') as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ segments: [], funnel: [] });
  });

  it('/api/productivity returns 200 + empty summary/topUsers/dailyTrend', async () => {
    const { GET } = await import('../../app/api/productivity/route');
    const res = await GET(makeReq('/api/productivity?days=30') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topUsers).toEqual([]);
    expect(body.dailyTrend).toEqual([]);
    expect(body.summary.activeUsers).toBe(0);
  });
});

describe('isMissingTableError wiring', () => {
  it('still returns true for the raw Athena error used above', () => {
    expect(isMissingTableError(missingTableErr)).toBe(true);
  });
});
