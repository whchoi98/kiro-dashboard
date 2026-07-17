/**
 * /api/model-usage reads UAR CSVs S3-direct. In a two-bucket deployment the
 * CSVs live in the data bucket (S3_DATA_BUCKET, granted read IAM by
 * EcsStack), not in the Athena results bucket embedded in
 * ATHENA_OUTPUT_BUCKET — the route must prefer the former and fall back to
 * the latter for single-bucket setups.
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

const ENV_KEYS = ['ATHENA_OUTPUT_BUCKET', 'S3_REPORT_PREFIX', 'S3_DATA_BUCKET'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  jest.resetModules();
  sendMock.mockReset();
  sendMock.mockResolvedValue({ Contents: [] });
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.ATHENA_OUTPUT_BUCKET = 's3://results-bucket/athena-results/';
  process.env.S3_REPORT_PREFIX = 'logs/prefix/';
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function callRoute() {
  // BUCKET is computed at module load — jest.resetModules() above makes this
  // dynamic import re-evaluate it against the env each test sets up.
  const { GET } = await import('../../app/api/model-usage/route');
  return GET(new Request('http://localhost/api/model-usage?days=1') as any);
}

describe('/api/model-usage bucket selection', () => {
  it('lists from S3_DATA_BUCKET when set (two-bucket deployment)', async () => {
    process.env.S3_DATA_BUCKET = 'data-bucket';
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalled();
    expect(sendMock.mock.calls[0][0].input.Bucket).toBe('data-bucket');
  });

  it('falls back to the ATHENA_OUTPUT_BUCKET bucket when S3_DATA_BUCKET is unset', async () => {
    delete process.env.S3_DATA_BUCKET;
    const res = await callRoute();
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalled();
    expect(sendMock.mock.calls[0][0].input.Bucket).toBe('results-bucket');
  });
});
