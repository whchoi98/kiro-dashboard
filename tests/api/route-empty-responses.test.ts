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

// `/api/idc-users` instantiates the IdentityStore client directly rather than
// going through lib/identity, so the SDK itself is stubbed. Two directory users
// with no activity rows exercise the "grade the directory anyway" path.
jest.mock('@aws-sdk/client-identitystore', () => ({
  IdentitystoreClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      Users: [
        { UserId: 'u-1', UserName: 'alice', DisplayName: 'Alice A', Emails: [{ Value: 'alice@example.com' }] },
        { UserId: 'u-2', UserName: 'bob', DisplayName: 'Bob B', Emails: [{ Value: 'bob@example.com' }] },
      ],
      NextToken: undefined,
    }),
  })),
  ListUsersCommand: jest.fn(),
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

  it('/api/productivity nulls the credit-efficiency card rather than the page', async () => {
    // The credits-per-line KPI reads `user_report` in its own guarded helper.
    // A missing table must leave `creditEfficiency.available` false with a
    // `null` ratio — never a `0` that would read as "zero credits per line".
    const { GET } = await import('../../app/api/productivity/route');
    const res = await GET(makeReq('/api/productivity?days=30') as any);
    const body = await res.json();
    expect(body.creditEfficiency.available).toBe(false);
    expect(body.creditEfficiency.creditsPerLine).toBeNull();
  });

  it('/api/productivity reports unmeasured rates as null, not 0', async () => {
    // 39 of the 44 legacy metric columns are the literal string '0' in this
    // account, so a rate whose denominator is under MIN_RATE_DENOMINATOR must
    // stay null: "not instrumented" and "measured 0%" are different claims.
    const { GET } = await import('../../app/api/productivity/route');
    const res = await GET(makeReq('/api/productivity?days=30') as any);
    const { summary } = await res.json();
    expect(summary.inlineAcceptanceRate).toBeNull();
    expect(summary.chatInteractionRate).toBeNull();
    expect(summary.devAcceptanceRate).toBeNull();
    expect(summary.codeReviewSuccessRate).toBeNull();
  });

  it('/api/rollout returns 200 + empty clients/overlap/tiers', async () => {
    const { GET } = await import('../../app/api/rollout/route');
    const res = await GET(makeReq('/api/rollout?days=30') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toEqual([]);
    expect(body.trend).toEqual([]);
    expect(body.users).toEqual([]);
    expect(body.overlap).toEqual({ ideOnly: 0, cliOnly: 0, both: 0, total: 0 });
    expect(body.dataStart).toBeNull();
  });

  it('/api/idc-users still grades the directory when the activity table is absent', async () => {
    // The Athena read is guarded on its own: a missing table means "no
    // activity data yet", not a failed listing. Every dormancy bucket must
    // still be emitted so the UI never has to guess at a missing key.
    // IDENTITY_STORE_ID must be set — without it the route throws before the
    // guard is reached, which is correct but a different failure mode.
    process.env.IDENTITY_STORE_ID = 'd-testtest01';
    const { GET } = await import('../../app/api/idc-users/route');
    const res = await GET(makeReq('/api/idc-users?days=30') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dormancy.map((b: { bucket: string }) => b.bucket)).toEqual([
      'active7',
      'dormant30',
      'dormant60',
      'dormantOld',
      'never',
    ]);
    expect(body.funnel).toHaveLength(3);
    expect(body.funnel[0].label).toBe('idc.funnel.directory');
  });
});

describe('isMissingTableError wiring', () => {
  it('still returns true for the raw Athena error used above', () => {
    expect(isMissingTableError(missingTableErr)).toBe(true);
  });
});
