/**
 * /api/user-model-usage feeds the model-usage card in the user detail panel.
 *
 * It must read S3-direct (the `{model}_messages` columns are dynamic, so
 * OpenCSVSerDe's positional mapping cannot serve them — ADR-0004) and it must
 * distinguish three zero-looking states from each other: env not configured,
 * reports without model columns, and a user with no model messages. Collapsing
 * them asserts a measurement nobody made.
 */

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: sendMock })),
  ListObjectsV2Command: jest.fn((input) => ({ __type: 'ListObjectsV2', input })),
  GetObjectCommand: jest.fn((input) => ({ __type: 'GetObject', input })),
}));

const PREFIX = 'logs/prefix/';
const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OTHER = '11111111-2222-3333-4444-555555555555';

function ymdPath(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
const ymdDash = (daysAgo: number) => ymdPath(daysAgo).replace(/\//g, '-');

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

/** Wires ListObjectsV2 → the given keys, and GetObject → the given CSV text. */
function mockS3(files: Record<string, string>) {
  const keys = Object.keys(files);
  sendMock.mockImplementation((cmd: { __type: string; input: Record<string, string> }) => {
    if (cmd.__type === 'ListObjectsV2') {
      const prefix = cmd.input.Prefix;
      return Promise.resolve({
        Contents: keys.filter((k) => k.startsWith(prefix)).map((k) => ({ Key: k, Size: 100 })),
        IsTruncated: false,
      });
    }
    return Promise.resolve({
      Body: { transformToString: () => Promise.resolve(files[cmd.input.Key] ?? '') },
    });
  });
}

async function call(userid: string, days = 30) {
  const { GET } = await import('../../app/api/user-model-usage/route');
  const res = await GET(
    new Request(`http://localhost/api/user-model-usage?userid=${userid}&days=${days}`) as never
  );
  return { status: res.status, body: await res.json() };
}

function key(daysAgo: number, client = 'KIRO_IDE', part = 1) {
  return `${PREFIX}${ymdPath(daysAgo)}/${client}_${part}_user_report_x.csv`;
}

describe('userid validation', () => {
  it.each([['not-a-uuid'], [''], ['../../etc/passwd'], ["' OR 1=1--"]])(
    'rejects %p with 400',
    async (bad) => {
      const { status } = await call(encodeURIComponent(bad));
      expect(status).toBe(400);
      // A malformed id must never reach S3.
      expect(sendMock).not.toHaveBeenCalled();
    }
  );

  it('accepts a well-formed uuid', async () => {
    mockS3({});
    const { status } = await call(USER);
    expect(status).toBe(200);
  });
});

describe('three distinct zero states', () => {
  it('configured:false when the bucket/prefix env is unset', async () => {
    delete process.env.ATHENA_OUTPUT_BUCKET;
    delete process.env.S3_REPORT_PREFIX;
    const { body } = await call(USER);
    expect(body.configured).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('daysWithModelColumns:0 when the reports carry no model columns', async () => {
    mockS3({
      [key(1)]: [
        'date,userid,total_messages',
        `${ymdDash(1)},${USER},40`,
      ].join('\n'),
    });
    const { body } = await call(USER);
    expect(body.configured).toBe(true);
    // total_messages ends in _messages but is NOT a model column; if the
    // exclusion regressed this would be 1 with a bogus "Total" model.
    expect(body.daysWithModelColumns).toBe(0);
    expect(body.models).toEqual([]);
  });

  it('models:[] but daysWithModelColumns>0 when the user simply has none', async () => {
    mockS3({
      [key(1)]: [
        'date,userid,total_messages,auto_messages',
        `${ymdDash(1)},${USER},0,0`,
      ].join('\n'),
    });
    const { body } = await call(USER);
    expect(body.daysWithModelColumns).toBe(1);
    expect(body.models).toEqual([]);
    expect(body.totalMessages).toBe(0);
  });
});

describe('aggregation', () => {
  it('sums per model, sorts descending, and computes percentages', async () => {
    mockS3({
      [key(2)]: [
        'date,userid,total_messages,auto_messages,claude_sonnet_4_5_messages',
        `${ymdDash(2)},${USER},30,10,20`,
      ].join('\n'),
      [key(1)]: [
        'date,userid,total_messages,auto_messages,claude_sonnet_4_5_messages',
        `${ymdDash(1)},${USER},20,10,10`,
      ].join('\n'),
    });
    const { body } = await call(USER);

    expect(body.models).toEqual([
      { model: 'Claude Sonnet 4.5', messages: 30, percentage: 60 },
      { model: 'Auto', messages: 20, percentage: 40 },
    ]);
    expect(body.totalMessages).toBe(50);
    expect(body.distinctModels).toBe(2);
    expect(body.primaryModel).toBe('Claude Sonnet 4.5');
  });

  it('never counts total_messages as a model', async () => {
    // The documented trap: total_messages also ends in _messages, so including
    // it double-counts everything and outweighs every real model.
    mockS3({
      [key(1)]: [
        'date,userid,total_messages,auto_messages',
        `${ymdDash(1)},${USER},999,10`,
      ].join('\n'),
    });
    const { body } = await call(USER);
    expect(body.models.map((m: { model: string }) => m.model)).toEqual(['Auto']);
    expect(body.totalMessages).toBe(10);
  });

  it('excludes other users', async () => {
    mockS3({
      [key(1)]: [
        'date,userid,total_messages,auto_messages',
        `${ymdDash(1)},${USER},10,10`,
        `${ymdDash(1)},${OTHER},900,900`,
      ].join('\n'),
    });
    const { body } = await call(USER);
    expect(body.totalMessages).toBe(10);
  });

  it('matches a userid carrying the Identity Center prefix', async () => {
    // Athena rows are normalized with NORMALIZE_USERID, so the UI passes a bare
    // uuid; the raw CSV may still carry the `d-xxxx.` prefix.
    mockS3({
      [key(1)]: [
        'date,userid,total_messages,auto_messages',
        `${ymdDash(1)},d-90663be888.${USER},10,7`,
      ].join('\n'),
    });
    const { body } = await call(USER);
    expect(body.totalMessages).toBe(7);
  });

  it('builds an oldest-first daily trend', async () => {
    mockS3({
      [key(3)]: ['date,userid,auto_messages', `${ymdDash(3)},${USER},1`].join('\n'),
      [key(1)]: ['date,userid,auto_messages', `${ymdDash(1)},${USER},2`].join('\n'),
    });
    const { body } = await call(USER);
    expect(body.trend.map((p: { date: string }) => p.date)).toEqual([ymdDash(3), ymdDash(1)]);
    expect(body.trend[1].Auto).toBe(2);
  });

  it('attributes messages to a client type from the file name', async () => {
    mockS3({
      [key(1, 'KIRO_IDE')]: ['date,userid,auto_messages', `${ymdDash(1)},${USER},5`].join('\n'),
      [key(1, 'KIRO_CLI')]: ['date,userid,auto_messages', `${ymdDash(1)},${USER},3`].join('\n'),
    });
    const { body } = await call(USER);
    expect(body.clients).toEqual([
      { clientType: 'KIRO_IDE', messages: 5 },
      { clientType: 'KIRO_CLI', messages: 3 },
    ]);
  });

  it('reads every part file for a >1000-user day', async () => {
    // Kiro splits high-volume days into part_1, part_2, … — dropping the extra
    // parts silently undercounts.
    mockS3({
      [key(1, 'KIRO_IDE', 1)]: ['date,userid,auto_messages', `${ymdDash(1)},${USER},4`].join('\n'),
      [key(1, 'KIRO_IDE', 2)]: ['date,userid,auto_messages', `${ymdDash(1)},${USER},6`].join('\n'),
    });
    const { body } = await call(USER);
    expect(body.totalMessages).toBe(10);
  });
});

describe('shared helpers stay shared', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const ROOT = path.resolve(__dirname, '../..');

  it('both model routes import isModelColumn from lib/uar-s3', () => {
    // A local copy in either route is how the total_messages exclusion drifts
    // out of one of them.
    for (const rel of [
      'app/api/model-usage/route.ts',
      'app/api/user-model-usage/route.ts',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).toMatch(/isModelColumn/);
      expect(src).not.toMatch(/function isModelColumn/);
    }
  });

  it('lib/uar-s3 pairs the _messages suffix with the total_messages exclusion', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/uar-s3.ts'), 'utf8');
    expect(src).toMatch(/endsWith\('_messages'\) && col !== 'total_messages'/);
  });
});
