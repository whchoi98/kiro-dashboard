import { IdentitystoreClient, ListUsersCommand } from '@aws-sdk/client-identitystore';

const client = new IdentitystoreClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

interface CacheEntry {
  username: string;
  cachedAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour in milliseconds
const cache = new Map<string, CacheEntry>();

export async function resolveUsernames(userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const identityStoreId = process.env.IDENTITY_STORE_ID;

  if (!identityStoreId) {
    for (const id of userIds) {
      result.set(id, id.substring(0, 8));
    }
    return result;
  }

  const now = Date.now();
  const uncachedIds: string[] = [];

  // Serve from cache where valid
  for (const id of userIds) {
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
        const username =
          user.UserName ??
          user.DisplayName ??
          user.UserId.substring(0, 8);
        apiLookup.set(user.UserId, username);
      }
    }

    // Populate result and update cache
    for (const id of uncachedIds) {
      const username = apiLookup.get(id) ?? id.substring(0, 8);
      result.set(id, username);
      cache.set(id, { username, cachedAt: now });
    }
  } catch {
    // On API failure, fall back to truncated id
    for (const id of uncachedIds) {
      const fallback = id.substring(0, 8);
      result.set(id, fallback);
    }
  }

  return result;
}
