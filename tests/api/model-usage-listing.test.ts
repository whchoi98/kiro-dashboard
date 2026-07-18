/**
 * /api/model-usage listing performance contract. The container runs in
 * ap-northeast-2 while the UAR bucket lives in us-east-1 (~200ms per S3
 * round trip), so the route must list by MONTH prefix (≤7 calls at the
 * 180-day cap) instead of one sequential ListObjectsV2 per day — the
 * per-day version costs 90 × ~215ms ≈ 20s per request.
 */

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: sendMock })),
  ListObjectsV2Command: jest.fn((input) => ({ __type: 'ListObjectsV2', input })),
  GetObjectCommand: jest.fn((input) => ({ __type: 'GetObject', input })),
}));

jest.mock('../../lib/identity', () => ({
  resolveUserDetails: jest.fn().mockResolvedValue(new Map()),
}));

const PREFIX = 'logs/prefix/';

function ymd(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

const ENV_KEYS = ['ATHENA_OUTPUT_BUCKET', 'S3_REPORT_PREFIX', 'S3_DATA_BUCKET'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  jest.resetModules();
  sendMock.mockReset();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.ATHENA_OUTPUT_BUCKET = 's3://results-bucket/athena-results/';
  process.env.S3_REPORT_PREFIX = PREFIX;
  delete process.env.S3_DATA_BUCKET;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function callRoute(days: number) {
  const { GET } = await import('../../app/api/model-usage/route');
  return GET(new Request(`http://localhost/api/model-usage?days=${days}`) as any);
}

function listCalls() {
  return sendMock.mock.calls.filter(([cmd]) => cmd.__type === 'ListObjectsV2');
}

function getCalls() {
  return sendMock.mock.calls.filter(([cmd]) => cmd.__type === 'GetObject');
}

describe('/api/model-usage S3 listing', () => {
  it('lists by month prefix — bounded calls for a 90-day window, not one per day', async () => {
    sendMock.mockResolvedValue({ Contents: [] });
    const res = await callRoute(90);
    expect(res.status).toBe(200);

    // 90 days span at most 4 calendar months.
    expect(listCalls().length).toBeLessThanOrEqual(5);
    for (const [cmd] of listCalls()) {
      expect(cmd.input.Prefix).toMatch(new RegExp(`^${PREFIX}\\d{4}/\\d{2}/$`));
    }
  });

  it('keeps keys inside the window and drops keys outside it', async () => {
    const inWindowToday = `${PREFIX}${ymd(0)}/report.csv`;
    const inWindowEdge = `${PREFIX}${ymd(89)}/report.csv`;
    const outOfWindow = `${PREFIX}${ymd(95)}/report.csv`;

    sendMock.mockImplementation((cmd: any) => {
      if (cmd.__type === 'ListObjectsV2') {
        const all = [inWindowToday, inWindowEdge, outOfWindow];
        return Promise.resolve({
          Contents: all
            .filter((k) => k.startsWith(cmd.input.Prefix))
            .map((k) => ({ Key: k })),
        });
      }
      return Promise.resolve({
        Body: { transformToString: () => Promise.resolve('date,userid,claude_messages\n2026-07-17,u1,3') },
      });
    });

    const res = await callRoute(90);
    expect(res.status).toBe(200);

    const fetched = getCalls().map(([cmd]) => cmd.input.Key);
    expect(fetched).toContain(inWindowToday);
    expect(fetched).toContain(inWindowEdge);
    expect(fetched).not.toContain(outOfWindow);
  });

  it('follows ListObjectsV2 pagination', async () => {
    const page1Key = `${PREFIX}${ymd(0)}/a.csv`;
    const page2Key = `${PREFIX}${ymd(0)}/b.csv`;

    sendMock.mockImplementation((cmd: any) => {
      if (cmd.__type === 'ListObjectsV2') {
        if (!page1Key.startsWith(cmd.input.Prefix)) return Promise.resolve({ Contents: [] });
        if (!cmd.input.ContinuationToken) {
          return Promise.resolve({
            Contents: [{ Key: page1Key }],
            IsTruncated: true,
            NextContinuationToken: 'token-1',
          });
        }
        return Promise.resolve({ Contents: [{ Key: page2Key }] });
      }
      return Promise.resolve({
        Body: { transformToString: () => Promise.resolve('date,userid,claude_messages\n2026-07-17,u1,3') },
      });
    });

    const res = await callRoute(30);
    expect(res.status).toBe(200);

    const fetched = getCalls().map(([cmd]) => cmd.input.Key);
    expect(fetched).toContain(page1Key);
    expect(fetched).toContain(page2Key);
  });
});
