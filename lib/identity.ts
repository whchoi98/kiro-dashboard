import { IdentitystoreClient, ListUsersCommand } from '@aws-sdk/client-identitystore';
import { maskText, maskEmail } from './mask';
import { TtlMemo, readIntEnv } from './query-cache';

const client = new IdentitystoreClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

export interface UserDetail {
  username: string;
  displayName: string;
  email: string;
  organization: string;
}

/** The unresolved fallback for an id absent from the directory. */
function unknownDetail(id: string): UserDetail {
  const short = maskText(id.substring(0, 8));
  return { username: short, displayName: short, email: '', organization: '' };
}

/**
 * Masked snapshot of the whole IAM Identity Center directory, cached for 1h.
 *
 * `resolveUserDetails` used to walk the ENTIRE directory (do/while over
 * `ListUsers`) on every call, with no cache — unlike its sibling
 * `resolveUsernames`, which has had a 1h TTL cache all along. 10 of the 19 API
 * routes call it, and an Overview load fans out to six of them at once, so a
 * single page view paid six full directory walks.
 *
 * The cached unit is the DIRECTORY, not the requested ids. Callers pass wildly
 * different id sets but every one of them triggers the same unfiltered
 * `ListUsers` walk, so keying on the id set would miss on almost every call
 * while still doing the identical work. One key per identity store id means the
 * second and later callers do zero AWS I/O.
 *
 * 1h matches `resolveUsernames`, and is generous because directory membership is
 * far more stable than the activity data: a newly added user shows up within the
 * hour, and until then they render as a masked id — the same fallback already
 * used for any id missing from the directory.
 *
 * `TtlMemo` also gives single-flight coalescing, which matters more here than
 * the TTL: the six concurrent Overview routes now share ONE in-flight walk
 * instead of racing six, even on a completely cold task.
 */
const DIRECTORY_TTL_MS = 60 * 60 * 1000;

const directoryMemo = new TtlMemo<Map<string, UserDetail>>({
  ttlMs: readIntEnv(process.env, 'IDENTITY_DIRECTORY_CACHE_TTL_MS', DIRECTORY_TTL_MS),
  // One entry per identity store id, and there is exactly one per deployment.
  // The cap is a bound, not a working set.
  maxEntries: 4,
  // Caps users PER ENTRY. Unlike the Athena memo this needs no total-weight
  // budget, because the two caps multiply to a defensible number rather than an
  // unbounded one: the key space is identity store ids, so 4 entries x 50k users
  // is the ceiling, and at ~4 short masked strings per user that is tens of MB in
  // a 1024 MiB task. Beyond 50k we would rather re-walk than risk the OOM.
  admit: (dir) =>
    dir.size <= readIntEnv(process.env, 'IDENTITY_DIRECTORY_CACHE_MAX_USERS', 50_000),
});

/** Exposed for ops/tests — hit/miss/coalesce counters for the directory cache. */
export const identityDirectoryCache = directoryMemo;

async function loadDirectory(identityStoreId: string): Promise<Map<string, UserDetail>> {
  // Paginate ListUsers to get all IdC users
  const allUsers: any[] = [];
  let nextToken: string | undefined;
  do {
    const response = await client.send(new ListUsersCommand({
      IdentityStoreId: identityStoreId,
      ...(nextToken ? { NextToken: nextToken } : {})
    }));
    allUsers.push(...(response.Users || []));
    nextToken = response.NextToken;
  } while (nextToken);

  return new Map<string, UserDetail>(allUsers.map(u => {
    const rawEmail = u.Emails?.[0]?.Value || u.UserName || '';
    const rawOrg = rawEmail.split('@')[1] || '';
    return [
      u.UserId!,
      {
        username: maskText(u.UserName || u.DisplayName || u.UserId!),
        displayName: maskText(u.DisplayName || u.UserName || u.UserId!),
        email: maskEmail(rawEmail),
        organization: maskText(rawOrg),
      },
    ];
  }));
}

export async function resolveUserDetails(userIds: string[]): Promise<Map<string, UserDetail>> {
  // Clean IDs (strip d-xxxxx. prefix)
  const cleanIds = userIds.map(id => id.replace(/^d-[a-z0-9]+\./, ''));

  const result = new Map<string, UserDetail>();
  const identityStoreId = process.env.IDENTITY_STORE_ID || '';

  if (!identityStoreId) {
    for (const id of cleanIds) {
      result.set(id, unknownDetail(id));
    }
    return result;
  }

  try {
    // `TtlMemo` never caches a rejection, so a throttled or IAM-denied walk is
    // retried on the next request rather than pinned as an hour of masked ids.
    const userMap = await directoryMemo.run(identityStoreId, () =>
      loadDirectory(identityStoreId)
    );

    for (const id of cleanIds) {
      result.set(id, userMap.get(id) ?? unknownDetail(id));
    }
  } catch {
    for (const id of cleanIds) {
      result.set(id, unknownDetail(id));
    }
  }

  return result;
}

interface CacheEntry {
  username: string;
  cachedAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour in milliseconds
const cache = new Map<string, CacheEntry>();

export async function resolveUsernames(userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const identityStoreId = process.env.IDENTITY_STORE_ID;

  // Strip any Identity Store ID prefix that may have survived Athena normalization
  const cleanIds = userIds.map(id => id.replace(/^d-[a-z0-9]+\./, ''));

  if (!identityStoreId) {
    for (const id of cleanIds) {
      result.set(id, maskText(id.substring(0, 8)));
    }
    return result;
  }

  const now = Date.now();
  const uncachedIds: string[] = [];

  // Serve from cache where valid
  for (const id of cleanIds) {
    const entry = cache.get(id);
    if (entry && now - entry.cachedAt < TTL_MS) {
      result.set(id, entry.username);
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length === 0) {
    return result;
  }

  try {
    // Batch resolve uncached ids via Identity Center
    const response = await client.send(
      new ListUsersCommand({
        IdentityStoreId: identityStoreId,
      })
    );

    const users = response.Users ?? [];

    // Build a lookup map from the API response
    const apiLookup = new Map<string, string>();
    for (const user of users) {
      if (user.UserId) {
        const username = maskText(
          user.UserName ??
          user.DisplayName ??
          user.UserId.substring(0, 8));
        apiLookup.set(user.UserId, username);
      }
    }

    // Populate result and update cache
    for (const id of uncachedIds) {
      const username = apiLookup.get(id) ?? maskText(id.substring(0, 8));
      result.set(id, username);
      cache.set(id, { username, cachedAt: now });
    }
  } catch {
    for (const id of uncachedIds) {
      result.set(id, maskText(id.substring(0, 8)));
    }
  }

  return result;
}
