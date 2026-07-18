/**
 * /api/adoption reads the UAR CSVs S3-direct (via lib/uar-s3) because the
 * user_report Glue table does not expose the new_user column and
 * OpenCSVSerDe's positional mapping makes it unsafe to add. The route must
 * find new_user by HEADER NAME: newer CSVs carry a `new_user` header, older
 * files lack it entirely — those older files still contribute to
 * active-user counts but never to new-user counts.
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

function ymdPath(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function ymdDash(daysAgo: number): string {
  return ymdPath(daysAgo).replace(/\//g, '-');
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

async function callRoute(days = 90) {
  const { GET } = await import('../../app/api/adoption/route');
  return GET(new Request(`http://localhost/api/adoption?days=${days}`) as any);
}

const EMPTY_PAYLOAD = {
  trend: [],
  totals: { newUsers: 0, activeUsers: 0 },
  recentNewUsers: [],
};

/**
 * Yesterday's file HAS the new_user header: u1 is new, u2 is not.
 * Today's file LACKS the header (older CSV layout): u3 appears for the
 * first time and u1 returns — neither may count as new from this file.
 */
const KEY_WITH_HEADER = `${PREFIX}${ymdPath(1)}/report.csv`;
const KEY_WITHOUT_HEADER = `${PREFIX}${ymdPath(0)}/report.csv`;

const CSV_WITH_HEADER = [
  'date,userid,new_user,client_type,total_messages,credits_used',
  `${ymdDash(1)},d-90663be888.u1,true,KIRO_IDE,10,5`,
  `${ymdDash(1)},u2,false,KIRO_CLI,3,1`,
].join('\n');

const CSV_WITHOUT_HEADER = [
  'date,userid,client_type,total_messages,credits_used',
  `${ymdDash(0)},u3,KIRO_IDE,7,2`,
  `${ymdDash(0)},u1,KIRO_IDE,4,3`,
].join('\n');

function mockS3WithFiles(files: Record<string, string>) {
  sendMock.mockImplementation((cmd: any) => {
    if (cmd.__type === 'ListObjectsV2') {
      return Promise.resolve({
        Contents: Object.keys(files)
          .filter((k) => k.startsWith(cmd.input.Prefix))
          .map((k) => ({ Key: k })),
      });
    }
    return Promise.resolve({
      Body: { transformToString: () => Promise.resolve(files[cmd.input.Key] ?? '') },
    });
  });
}

describe('/api/adoption', () => {
  it('returns a well-shaped empty payload when the bucket/prefix env is not configured', async () => {
    delete process.env.ATHENA_OUTPUT_BUCKET;
    delete process.env.S3_REPORT_PREFIX;

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY_PAYLOAD);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns a well-shaped empty payload when the window contains zero files', async () => {
    sendMock.mockResolvedValue({ Contents: [] });

    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(EMPTY_PAYLOAD);
  });

  it('counts new users only from files that carry the new_user header', async () => {
    mockS3WithFiles({
      [KEY_WITH_HEADER]: CSV_WITH_HEADER,
      [KEY_WITHOUT_HEADER]: CSV_WITHOUT_HEADER,
    });

    const res = await callRoute();
    expect(res.status).toBe(200);
    const body = await res.json();

    // u1 is the only new_user=true; u2 (false) and u3 (headerless file) are not.
    expect(body.totals).toEqual({ newUsers: 1, activeUsers: 3 });

    // The headerless file still contributes its users to active counts.
    const today = body.trend.find((p: any) => p.date === ymdDash(0));
    expect(today).toEqual({
      date: ymdDash(0),
      newUsers: 0,
      activeUsers: 2, // u3 + returning u1
      cumulativeUsers: 3,
    });
  });

  it('builds an ascending trend with a running cumulative distinct-user count', async () => {
    mockS3WithFiles({
      [KEY_WITH_HEADER]: CSV_WITH_HEADER,
      [KEY_WITHOUT_HEADER]: CSV_WITHOUT_HEADER,
    });

    const body = await (await callRoute()).json();

    expect(body.trend.map((p: any) => p.date)).toEqual([ymdDash(1), ymdDash(0)]);
    expect(body.trend[0]).toEqual({
      date: ymdDash(1),
      newUsers: 1, // u1 (IdC prefix stripped)
      activeUsers: 2, // u1, u2
      cumulativeUsers: 2,
    });
    // Day two adds u3 only — u1 already counted.
    expect(body.trend[1].cumulativeUsers).toBe(3);
  });

  it('lists recent new users with first-seen date and window-wide message/credit sums', async () => {
    mockS3WithFiles({
      [KEY_WITH_HEADER]: CSV_WITH_HEADER,
      [KEY_WITHOUT_HEADER]: CSV_WITHOUT_HEADER,
    });

    const body = await (await callRoute()).json();

    expect(body.recentNewUsers).toHaveLength(1);
    expect(body.recentNewUsers[0]).toEqual({
      userid: 'u1', // '^d-[a-z0-9]+\.' prefix stripped
      displayName: 'u1', // identity map empty -> maskText fallback ('u1' is too short to mask)
      firstDate: ymdDash(1),
      clientType: 'KIRO_IDE',
      totalMessages: 14, // 10 from the header file + 4 from the headerless file
      totalCredits: 8, // 5 + 3
    });
  });

  it('orders recent new users newest first and caps the list at 15', async () => {
    const headers = 'date,userid,new_user,client_type,total_messages,credits_used';
    const rows = [];
    for (let i = 0; i < 20; i++) {
      rows.push(`${ymdDash(i)},user-${String(i).padStart(2, '0')},true,KIRO_IDE,1,1`);
    }
    // All rows live in one file under today's key; row dates spread the window.
    mockS3WithFiles({
      [`${PREFIX}${ymdPath(0)}/report.csv`]: [headers, ...rows].join('\n'),
    });

    const body = await (await callRoute()).json();

    expect(body.totals.newUsers).toBe(20);
    expect(body.recentNewUsers).toHaveLength(15);
    expect(body.recentNewUsers[0].firstDate).toBe(ymdDash(0)); // newest first
    expect(body.recentNewUsers[14].firstDate).toBe(ymdDash(14));
  });
});
