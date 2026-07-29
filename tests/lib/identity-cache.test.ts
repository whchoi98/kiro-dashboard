/**
 * `resolveUserDetails` walks the ENTIRE IAM Identity Center directory via
 * paginated `ListUsers`. 10 of the 19 API routes call it and an Overview load
 * fans out to six of them at once, so before the directory cache a single page
 * view paid six full directory walks.
 *
 * These tests pin the two properties that make the cache safe rather than just
 * fast: the masked output is byte-identical to the uncached implementation, and
 * a failed walk is never cached as an hour of masked ids.
 */

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-identitystore', () => ({
  IdentitystoreClient: jest.fn(() => ({ send: sendMock })),
  ListUsersCommand: jest.fn((input) => ({ __type: 'ListUsers', input })),
}));

const STORE_ID = 'd-1234567890';

/** One `ListUsers` page. `NextToken` drives the do/while pagination. */
function page(users: unknown[], nextToken?: string) {
  return { Users: users, ...(nextToken ? { NextToken: nextToken } : {}) };
}

function user(id: string, name: string, email: string) {
  return { UserId: id, UserName: name, DisplayName: name, Emails: [{ Value: email }] };
}

type IdentityModule = typeof import('../../lib/identity');

/** Fresh module registry per test so the module-level memo starts empty. */
function loadIdentity(): IdentityModule {
  let mod!: IdentityModule;
  jest.isolateModules(() => {
    mod = require('../../lib/identity');
  });
  return mod;
}

const ENV_KEYS = [
  'IDENTITY_STORE_ID',
  'IDENTITY_DIRECTORY_CACHE_TTL_MS',
  'IDENTITY_DIRECTORY_CACHE_MAX_USERS',
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  sendMock.mockReset();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.IDENTITY_STORE_ID = STORE_ID;
  delete process.env.IDENTITY_DIRECTORY_CACHE_TTL_MS;
  delete process.env.IDENTITY_DIRECTORY_CACHE_MAX_USERS;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('resolveUserDetails directory cache', () => {
  it('resolves and masks a user on a cold cache', async () => {
    sendMock.mockResolvedValueOnce(page([user('u1', 'alice', 'alice@example.com')]));
    const { resolveUserDetails } = loadIdentity();

    const out = await resolveUserDetails(['u1']);
    // First 2 chars kept, rest starred, per lib/mask.ts — the domain is masked
    // as a whole ("example.com" is 11 chars) and doubles as the organization.
    expect(out.get('u1')).toEqual({
      username: 'al***',
      displayName: 'al***',
      email: 'al***@ex*********',
      organization: 'ex*********',
    });
  });

  // The whole point: the second caller does zero AWS I/O.
  it('walks the directory once across repeated calls', async () => {
    sendMock.mockResolvedValue(page([user('u1', 'alice', 'alice@example.com')]));
    const { resolveUserDetails } = loadIdentity();

    await resolveUserDetails(['u1']);
    await resolveUserDetails(['u1']);
    await resolveUserDetails(['u1']);

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  // Callers pass wildly different id sets but every one triggers the same
  // unfiltered ListUsers walk, so the cache must key on the DIRECTORY, not on
  // the requested ids — otherwise it would miss on nearly every call while
  // doing identical work.
  it('reuses the snapshot for a different set of requested ids', async () => {
    sendMock.mockResolvedValue(
      page([user('u1', 'alice', 'alice@example.com'), user('u2', 'bob', 'bob@example.com')])
    );
    const { resolveUserDetails } = loadIdentity();

    const first = await resolveUserDetails(['u1']);
    const second = await resolveUserDetails(['u2']);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(first.get('u1')?.displayName).toBe('al***');
    expect(second.get('u2')?.displayName).toBe('bo*');
    // Each caller gets only what it asked for — no leakage across calls.
    expect(first.has('u2')).toBe(false);
    expect(second.has('u1')).toBe(false);
  });

  // An Overview load fans out to six routes concurrently. On a cold task they
  // must share ONE walk, which the TTL alone would not deliver.
  it('coalesces concurrent callers into a single directory walk', async () => {
    let release!: (v: unknown) => void;
    sendMock.mockImplementation(
      () => new Promise((r) => { release = r; })
    );
    const { resolveUserDetails, identityDirectoryCache } = loadIdentity();

    const calls = [
      resolveUserDetails(['u1']),
      resolveUserDetails(['u2']),
      resolveUserDetails(['u1', 'u2']),
    ];
    // Let the three calls reach the memo before the walk resolves.
    await Promise.resolve();
    release(page([user('u1', 'alice', 'alice@example.com'), user('u2', 'bob', 'b@e.com')]));

    const [a, b, c] = await Promise.all(calls);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(identityDirectoryCache.stats().coalesced).toBe(2);
    expect(a.get('u1')?.displayName).toBe('al***');
    expect(b.get('u2')?.displayName).toBe('bo*');
    expect(c.size).toBe(2);
  });

  it('follows NextToken pagination and caches the merged snapshot', async () => {
    sendMock
      .mockResolvedValueOnce(page([user('u1', 'alice', 'a@e.com')], 'tok'))
      .mockResolvedValueOnce(page([user('u2', 'bob', 'b@e.com')]));
    const { resolveUserDetails } = loadIdentity();

    const first = await resolveUserDetails(['u1', 'u2']);
    expect(first.get('u1')?.displayName).toBe('al***');
    expect(first.get('u2')?.displayName).toBe('bo*');
    expect(sendMock).toHaveBeenCalledTimes(2);

    // Second call is a hit — no further pages fetched.
    await resolveUserDetails(['u1', 'u2']);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to a masked id for an id absent from the directory', async () => {
    sendMock.mockResolvedValue(page([user('u1', 'alice', 'a@e.com')]));
    const { resolveUserDetails } = loadIdentity();

    const out = await resolveUserDetails(['missing-id-xyz']);
    expect(out.get('missing-id-xyz')).toEqual({
      username: 'mi******',
      displayName: 'mi******',
      email: '',
      organization: '',
    });
  });

  it('strips the d-xxxx. prefix before lookup, as before', async () => {
    sendMock.mockResolvedValue(page([user('u1', 'alice', 'a@e.com')]));
    const { resolveUserDetails } = loadIdentity();

    const out = await resolveUserDetails([`${STORE_ID}.u1`]);
    expect(out.get('u1')?.displayName).toBe('al***');
  });

  // A throttle or IAM denial must not be pinned for an hour — that would render
  // masked ids across the whole dashboard long after the problem cleared.
  it('never caches a failed walk', async () => {
    sendMock
      .mockRejectedValueOnce(new Error('ThrottlingException'))
      .mockResolvedValueOnce(page([user('u1', 'alice', 'a@e.com')]));
    const { resolveUserDetails } = loadIdentity();

    const failed = await resolveUserDetails(['u1']);
    expect(failed.get('u1')?.displayName).toBe('u1');

    const recovered = await resolveUserDetails(['u1']);
    expect(recovered.get('u1')?.displayName).toBe('al***');
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('re-walks after the TTL expires', async () => {
    process.env.IDENTITY_DIRECTORY_CACHE_TTL_MS = '1';
    sendMock.mockResolvedValue(page([user('u1', 'alice', 'a@e.com')]));
    const { resolveUserDetails } = loadIdentity();

    await resolveUserDetails(['u1']);
    await new Promise((r) => setTimeout(r, 5));
    await resolveUserDetails(['u1']);

    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache entirely when the TTL is 0 (kill switch)', async () => {
    process.env.IDENTITY_DIRECTORY_CACHE_TTL_MS = '0';
    sendMock.mockResolvedValue(page([user('u1', 'alice', 'a@e.com')]));
    const { resolveUserDetails, identityDirectoryCache } = loadIdentity();

    await resolveUserDetails(['u1']);
    await resolveUserDetails(['u1']);

    expect(identityDirectoryCache.enabled).toBe(false);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  // The entry cap bounds COUNT, not bytes; one entry can be a million users.
  it('does not retain a directory larger than the max-users bound', async () => {
    process.env.IDENTITY_DIRECTORY_CACHE_MAX_USERS = '1';
    sendMock.mockResolvedValue(
      page([user('u1', 'alice', 'a@e.com'), user('u2', 'bob', 'b@e.com')])
    );
    const { resolveUserDetails, identityDirectoryCache } = loadIdentity();

    // Still correct, just not retained.
    const out = await resolveUserDetails(['u1']);
    expect(out.get('u1')?.displayName).toBe('al***');
    await resolveUserDetails(['u1']);

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(identityDirectoryCache.stats()).toMatchObject({ size: 0, rejected: 2 });
  });

  it('skips AWS entirely when IDENTITY_STORE_ID is unset', async () => {
    delete process.env.IDENTITY_STORE_ID;
    const { resolveUserDetails } = loadIdentity();

    const out = await resolveUserDetails(['abcdef123']);
    expect(out.get('abcdef123')).toEqual({
      username: 'ab******',
      displayName: 'ab******',
      email: '',
      organization: '',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
