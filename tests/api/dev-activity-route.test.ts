/**
 * /api/dev-activity aggregates the legacy by_user_analytic deep-metric
 * columns into five activity groups (TestGen, DocGen, Transform,
 * InlineChat, CodeFix). Verifies:
 *   - missing Glue table degrades to 200 + empty-but-well-shaped
 *     DevActivityData (never a 500)
 *   - group aggregation math (generated/accepted/acceptanceRate,
 *     including Transform's no-acceptance-signal special case)
 *   - trend dates convert from the table's MM-DD-YYYY format to
 *     YYYY-MM-DD and come back sorted ascending
 */

export {}; // make this file a module so top-level helpers don't collide globally

jest.mock('../../lib/athena', () => {
  const actual = jest.requireActual('../../lib/athena');
  return {
    ...actual,
    executeQuery: jest.fn(),
  };
});

jest.mock('../../lib/identity', () => ({
  resolveUserDetails: jest.fn().mockResolvedValue(new Map()),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { executeQuery } = require('../../lib/athena');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveUserDetails } = require('../../lib/identity');

const missingTableErr = new Error(
  "Query FAILED: TABLE_NOT_FOUND: line 1:1: Table 'by_user_analytic' does not exist"
);

const GROUP_KEYS = ['TestGen', 'DocGen', 'Transform', 'InlineChat', 'CodeFix'];

function makeReq(path: string) {
  return new Request(`http://localhost${path}`);
}

async function callRoute(days = 90) {
  const { GET } = await import('../../app/api/dev-activity/route');
  return GET(makeReq(`/api/dev-activity?days=${days}`) as any);
}

beforeEach(() => {
  (executeQuery as jest.Mock).mockReset();
  (resolveUserDetails as jest.Mock).mockReset();
  (resolveUserDetails as jest.Mock).mockResolvedValue(new Map());
});

describe('/api/dev-activity missing-table guard', () => {
  it('returns 200 + empty DevActivityData when the table is absent', async () => {
    (executeQuery as jest.Mock).mockRejectedValue(missingTableErr);

    const res = await callRoute();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.trend).toEqual([]);
    expect(body.topUsers).toEqual([]);
    expect(body.groups).toEqual(
      GROUP_KEYS.map((key) => ({
        key,
        events: 0,
        generated: 0,
        accepted: 0,
        acceptanceRate: 0,
      }))
    );
  });
});

describe('/api/dev-activity aggregation', () => {
  const summaryRow = {
    testgen_events: '10',
    testgen_generated: '100',
    testgen_accepted: '50',
    docgen_events: '4',
    docgen_generated: '20',
    docgen_accepted: '10',
    transform_events: '2',
    transform_generated: '30',
    inlinechat_events: '6',
    inlinechat_generated: '40',
    inlinechat_accepted: '20',
    codefix_events: '8',
    codefix_generated: '80',
    codefix_accepted: '40',
  };

  // Deliberately out of order (07-02 before 06-28) to prove the route
  // sorts by the converted ISO date, not the raw MM-DD-YYYY string.
  const trendRows = [
    {
      date: '07-02-2026',
      testgen_events: '3',
      docgen_events: '1',
      transform_events: '0',
      inlinechat_events: '2',
      codefix_events: '4',
    },
    {
      date: '06-28-2026',
      testgen_events: '7',
      docgen_events: '3',
      transform_events: '2',
      inlinechat_events: '4',
      codefix_events: '4',
    },
  ];

  const topUserRows = [
    { userid: 'user-aaa', total_events: '30', accepted_lines: '150' },
    { userid: 'user-bbb', total_events: '12', accepted_lines: '40' },
  ];

  function mockQueries() {
    (executeQuery as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('GROUP BY date')) return Promise.resolve(trendRows);
      if (sql.includes('LIMIT 10')) return Promise.resolve(topUserRows);
      return Promise.resolve([summaryRow]);
    });
  }

  it('aggregates the five activity groups with acceptance rates', async () => {
    mockQueries();

    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.groups).toEqual([
      { key: 'TestGen', events: 10, generated: 100, accepted: 50, acceptanceRate: 50 },
      { key: 'DocGen', events: 4, generated: 20, accepted: 10, acceptanceRate: 50 },
      // Transform has no acceptance signal — accepted mirrors generated and
      // the rate is pinned to 100 while any events exist.
      { key: 'Transform', events: 2, generated: 30, accepted: 30, acceptanceRate: 100 },
      { key: 'InlineChat', events: 6, generated: 40, accepted: 20, acceptanceRate: 50 },
      { key: 'CodeFix', events: 8, generated: 80, accepted: 40, acceptanceRate: 50 },
    ]);
  });

  it('converts trend dates MM-DD-YYYY → YYYY-MM-DD and sorts ascending', async () => {
    mockQueries();

    const res = await callRoute();
    const body = await res.json();

    expect(body.trend).toEqual([
      { date: '2026-06-28', TestGen: 7, DocGen: 3, Transform: 2, InlineChat: 4, CodeFix: 4 },
      { date: '2026-07-02', TestGen: 3, DocGen: 1, Transform: 0, InlineChat: 2, CodeFix: 4 },
    ]);
  });

  it('maps top users with resolved display names and masked fallback', async () => {
    mockQueries();
    (resolveUserDetails as jest.Mock).mockResolvedValue(
      new Map([
        ['user-aaa', { username: 'ki**', displayName: 'Ki** Us**', email: '', organization: '' }],
      ])
    );

    const res = await callRoute();
    const body = await res.json();

    expect(body.topUsers).toHaveLength(2);
    expect(body.topUsers[0]).toEqual({
      userid: 'user-aaa',
      displayName: 'Ki** Us**',
      events: 30,
      acceptedLines: 150,
    });
    // Unresolved id falls back to maskText(userid.substring(0, 8)) => 'us******'
    expect(body.topUsers[1]).toEqual({
      userid: 'user-bbb',
      displayName: 'us******',
      events: 12,
      acceptedLines: 40,
    });
  });

  it('returns zeroed groups when the window has no rows (empty summary)', async () => {
    (executeQuery as jest.Mock).mockImplementation((sql: string) => {
      if (sql.includes('GROUP BY date')) return Promise.resolve([]);
      if (sql.includes('LIMIT 10')) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.trend).toEqual([]);
    expect(body.topUsers).toEqual([]);
    // Transform: events = 0 → acceptanceRate must be 0, not 100
    expect(body.groups).toEqual(
      GROUP_KEYS.map((key) => ({
        key,
        events: 0,
        generated: 0,
        accepted: 0,
        acceptanceRate: 0,
      }))
    );
  });
});
