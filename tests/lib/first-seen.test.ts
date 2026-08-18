const sendMock = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: (...args: unknown[]) => sendMock(...args) })),
  GetObjectCommand: jest.fn((input) => ({ __type: 'Get', input })),
  PutObjectCommand: jest.fn((input) => ({ __type: 'Put', input })),
}));

import { applyLedger, withinNewRegistrantWindow, NEW_REGISTRANT_DAYS, loadLedger, saveLedger } from '@/lib/first-seen';

describe('applyLedger', () => {
  const NOW = '2026-08-18T12:00:00.000Z';

  it('self-seeds every current id as null when no ledger exists', () => {
    const { ledger, changed } = applyLedger(null, ['a', 'b'], NOW);
    expect(changed).toBe(true);
    expect(ledger.users).toEqual({ a: null, b: null });
    expect(ledger.seededAt).toBe(NOW);
    expect(ledger.version).toBe(1);
  });

  it('stamps only ids missing from an existing ledger', () => {
    const existing = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { a: null as string | null } };
    const { ledger, changed } = applyLedger(existing, ['a', 'b'], NOW);
    expect(changed).toBe(true);
    expect(ledger.users).toEqual({ a: null, b: NOW });
  });

  it('reports changed=false and returns the same object when every id is known', () => {
    const existing = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { a: null as string | null, b: '2026-08-10T00:00:00Z' as string | null } };
    const { ledger, changed } = applyLedger(existing, ['a', 'b'], NOW);
    expect(changed).toBe(false);
    expect(ledger).toBe(existing);
  });

  it('keeps ledger entries for users deleted from the directory', () => {
    const existing = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { gone: '2026-08-02T00:00:00Z' as string | null } };
    const { ledger } = applyLedger(existing, ['a'], NOW);
    expect(ledger.users.gone).toBe('2026-08-02T00:00:00Z');
    expect(ledger.users.a).toBe(NOW);
  });
});

describe('withinNewRegistrantWindow', () => {
  const now = Date.parse('2026-08-18T12:00:00.000Z');

  it('null / undefined / unparsable → false', () => {
    expect(withinNewRegistrantWindow(null, now)).toBe(false);
    expect(withinNewRegistrantWindow(undefined, now)).toBe(false);
    expect(withinNewRegistrantWindow('not-a-date', now)).toBe(false);
  });

  it('exactly at the 7-day boundary → true', () => {
    const atBoundary = new Date(now - NEW_REGISTRANT_DAYS * 86_400_000).toISOString();
    expect(withinNewRegistrantWindow(atBoundary, now)).toBe(true);
  });

  it('1ms past the 7-day boundary → false', () => {
    const past = new Date(now - NEW_REGISTRANT_DAYS * 86_400_000 - 1).toISOString();
    expect(withinNewRegistrantWindow(past, now)).toBe(false);
  });

  it('future stamp (clock skew) still counts as new', () => {
    const future = new Date(now + 60_000).toISOString();
    expect(withinNewRegistrantWindow(future, now)).toBe(true);
  });
});

describe('loadLedger/saveLedger IO', () => {
  const savedEnv = process.env.ATHENA_OUTPUT_BUCKET;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMock.mockClear();
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.ATHENA_OUTPUT_BUCKET;
    } else {
      process.env.ATHENA_OUTPUT_BUCKET = savedEnv;
    }
  });

  it('env unset → loadLedger resolves null', async () => {
    delete process.env.ATHENA_OUTPUT_BUCKET;
    const result = await loadLedger();
    expect(result).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('env unset → saveLedger resolves without calling send', async () => {
    delete process.env.ATHENA_OUTPUT_BUCKET;
    const ledger = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: {} };
    await saveLedger(ledger);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('env s3://test-bucket/results/ → loadLedger sends GetObjectCommand with correct Bucket and Key', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    sendMock.mockResolvedValueOnce({
      Body: { transformToString: async () => '{"version":1,"seededAt":"2026-08-01T00:00:00Z","users":{}}' },
    });
    await loadLedger();
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'results/idc-first-seen.json',
      }),
    }));
  });

  it('send rejects with NoSuchKey → loadLedger returns null', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    sendMock.mockRejectedValueOnce({ name: 'NoSuchKey' });
    const result = await loadLedger();
    expect(result).toBeNull();
  });

  it('send rejects with httpStatusCode 404 → loadLedger returns null', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    sendMock.mockRejectedValueOnce({
      name: 'SomeError',
      $metadata: { httpStatusCode: 404 },
    });
    const result = await loadLedger();
    expect(result).toBeNull();
  });

  it('send resolves with invalid JSON → loadLedger returns null (self-heal)', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    sendMock.mockResolvedValueOnce({
      Body: { transformToString: async () => 'not json' },
    });
    const result = await loadLedger();
    expect(result).toBeNull();
  });

  it('send resolves with wrong-shape JSON → loadLedger returns null', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    sendMock.mockResolvedValueOnce({
      Body: { transformToString: async () => '{"version":2}' },
    });
    const result = await loadLedger();
    expect(result).toBeNull();
  });

  it('send resolves with array-shaped users → loadLedger returns null (not stamp-everyone)', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    sendMock.mockResolvedValueOnce({
      Body: { transformToString: async () => '{"version":1,"seededAt":"x","users":[]}' },
    });
    const result = await loadLedger();
    expect(result).toBeNull();
  });

  it('send resolves with null users → loadLedger returns null', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    sendMock.mockResolvedValueOnce({
      Body: { transformToString: async () => '{"version":1,"seededAt":"x","users":null}' },
    });
    const result = await loadLedger();
    expect(result).toBeNull();
  });

  it('send resolves with users missing entirely → loadLedger returns null', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    sendMock.mockResolvedValueOnce({
      Body: { transformToString: async () => '{"version":1,"seededAt":"x"}' },
    });
    const result = await loadLedger();
    expect(result).toBeNull();
  });

  it('send resolves with valid version-1 ledger JSON → returns parsed ledger', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    const ledger = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { a: null, b: '2026-08-10T00:00:00Z' } };
    sendMock.mockResolvedValueOnce({
      Body: { transformToString: async () => JSON.stringify(ledger) },
    });
    const result = await loadLedger();
    expect(result).toEqual(ledger);
  });

  it('send rejects with AccessDenied → loadLedger rejects (rethrow)', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    const error = { name: 'AccessDenied' };
    sendMock.mockRejectedValueOnce(error);
    await expect(loadLedger()).rejects.toBe(error);
  });

  it('saveLedger with env set → sends PutObjectCommand with JSON body and ContentType', async () => {
    process.env.ATHENA_OUTPUT_BUCKET = 's3://test-bucket/results/';
    sendMock.mockResolvedValueOnce({});
    const ledger = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { a: null } };
    await saveLedger(ledger);
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'results/idc-first-seen.json',
        Body: JSON.stringify(ledger),
        ContentType: 'application/json',
      }),
    }));
  });
});
