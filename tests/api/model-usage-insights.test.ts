/**
 * /api/model-usage end to end over a mocked S3: the client type must come from
 * each file's NAME (one CSV per client per day), and the vendor / per-client /
 * adoption views must agree with the plain distribution.
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

function day(daysAgo: number): { path: string; iso: string } {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { path: iso.replace(/-/g, '/'), iso };
}

const d2 = day(2);
const d1 = day(1);

const FILES: Record<string, string> = {
  [`${PREFIX}${d2.path}/00/KIRO_CLI_123456789012_user_report_1.csv`]: [
    'Date,UserId,Client_Type,Total_Messages,claude_opus_5_messages,gpt_5.6_sol_messages',
    `${d2.iso},u1,KIRO_CLI,10,8,2`,
    `${d2.iso},u2,KIRO_CLI,5,5,0`,
  ].join('\n'),
  [`${PREFIX}${d1.path}/00/KIRO_CLI_123456789012_user_report_2.csv`]: [
    'Date,UserId,Client_Type,Total_Messages,claude_opus_5.5_messages,claude_opus_5_messages',
    `${d1.iso},u1,KIRO_CLI,4,4,0`,
  ].join('\n'),
  [`${PREFIX}${d1.path}/00/KIRO_IDE_123456789012_user_report_3.csv`]: [
    'Date,UserId,Client_Type,Total_Messages,auto_messages,claude_opus_5_messages',
    `${d1.iso},u3,KIRO_IDE,6,1,5`,
  ].join('\n'),
};

beforeEach(() => {
  jest.resetModules();
  sendMock.mockReset();
  process.env.ATHENA_OUTPUT_BUCKET = 's3://results-bucket/athena-results/';
  process.env.S3_REPORT_PREFIX = PREFIX;
  delete process.env.S3_DATA_BUCKET;
  sendMock.mockImplementation(async (cmd: { __type: string; input: { Prefix?: string; Key?: string } }) => {
    if (cmd.__type === 'ListObjectsV2') {
      // Month-prefix listing: only return keys under the requested prefix,
      // or a window spanning two months would list every file twice.
      const keys = Object.keys(FILES).filter((k) => k.startsWith(cmd.input.Prefix ?? ''));
      return { Contents: keys.map((Key) => ({ Key, Size: 100, LastModified: new Date() })), IsTruncated: false };
    }
    return { Body: { transformToString: async () => FILES[cmd.input.Key ?? ''] ?? '' } };
  });
});

async function getPayload() {
  const { GET } = await import('../../app/api/model-usage/route');
  const res = await GET(new Request('http://localhost/api/model-usage?days=7') as any);
  expect(res.status).toBe(200);
  return res.json();
}

describe('/api/model-usage insights', () => {
  it('tags the distribution with vendors', async () => {
    const body = await getPayload();
    expect(body.distribution).toEqual([
      { model: 'Claude Opus 5', messages: 18, percentage: 72, vendor: 'anthropic' },
      { model: 'Claude Opus 5.5', messages: 4, percentage: 16, vendor: 'anthropic' },
      { model: 'Gpt 5.6 Sol', messages: 2, percentage: 8, vendor: 'third_party' },
      { model: 'Auto', messages: 1, percentage: 4, vendor: 'auto' },
    ]);
  });

  it('reports the org-wide vendor split', async () => {
    const body = await getPayload();
    expect(body.vendors).toEqual([
      { vendor: 'anthropic', messages: 22, percentage: 88 },
      { vendor: 'third_party', messages: 2, percentage: 8 },
      { vendor: 'auto', messages: 1, percentage: 4 },
    ]);
  });

  it('splits the mix by the client type in each filename', async () => {
    const body = await getPayload();
    expect(body.byClient.map((c: { clientType: string; totalMessages: number }) => [c.clientType, c.totalMessages])).toEqual([
      ['KIRO_CLI', 19],
      ['KIRO_IDE', 6],
    ]);
    const ide = body.byClient.find((c: { clientType: string }) => c.clientType === 'KIRO_IDE');
    expect(ide.models.map((m: { model: string }) => m.model)).toEqual(['Claude Opus 5', 'Auto']);
  });

  it('lists adoption newest first with reach per model', async () => {
    const body = await getPayload();
    expect(body.adoption.map((a: { model: string }) => a.model)).toEqual([
      'Claude Opus 5.5', 'Auto', 'Claude Opus 5', 'Gpt 5.6 Sol',
    ]);
    const opus5 = body.adoption.find((a: { model: string }) => a.model === 'Claude Opus 5');
    expect(opus5).toMatchObject({ firstSeen: d2.iso, lastSeen: d1.iso, users: 3, firstSeenAtWindowStart: true });
    expect(opus5.recentShare).toBeCloseTo(72);
  });
});
