import { NextRequest, NextResponse } from 'next/server';
import { IdentitystoreClient, ListUsersCommand } from '@aws-sdk/client-identitystore';
import { executeQuery, safeFloat, safeInt, NORMALIZE_USERID } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';

export interface IdcUserStatus {
  userId: string;
  displayName: string;
  email: string;
  status: 'active' | 'inactive';
  totalMessages: number;
  totalCredits: number;
  lastActive: string | null;
  organization: string;
}

const identityClient = new IdentitystoreClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

async function fetchAllIdcUsers(): Promise<
  Array<{ userId: string; displayName: string; email: string }>
> {
  const identityStoreId = process.env.IDENTITY_STORE_ID;
  if (!identityStoreId) {
    throw new Error('IDENTITY_STORE_ID environment variable is not set');
  }

  const allUsers: Array<{ userId: string; displayName: string; email: string }> = [];
  let cursor: string | undefined;

  while (true) {
    const response = await identityClient.send(
      new ListUsersCommand({
        IdentityStoreId: identityStoreId,
        NextToken: cursor,
      }),
    );

    const users = response.Users ?? [];

    for (const user of users) {
      if (!user.UserId) continue;

      const joinedName = [user.Name?.GivenName, user.Name?.FamilyName]
        .filter(Boolean)
        .join(' ');
      const displayName =
        user.DisplayName ??
        user.Name?.Formatted ??
        (joinedName || user.UserName) ??
        user.UserId;

      const primaryEmail =
        user.Emails?.find((e) => e.Primary)?.Value ??
        user.Emails?.[0]?.Value ??
        '';

      allUsers.push({
        userId: user.UserId,
        displayName,
        email: primaryEmail,
      });
    }

    if (!response.NextToken) break;
    cursor = response.NextToken;
  }

  return allUsers;
}

async function fetchActiveUserStats(
  days: number,
): Promise<
  Map<string, { totalMessages: number; totalCredits: number; lastActive: string }>
> {
  const tableName = await resolveTableName();

  const sql = `
    SELECT ${NORMALIZE_USERID} AS userid, SUM(CAST(total_messages AS INTEGER)) AS total_messages, SUM(CAST(credits_used AS DOUBLE)) AS total_credits, MAX(date) AS last_active
    FROM "${tableName}"
    WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
    GROUP BY ${NORMALIZE_USERID}
  `;

  const rows = await executeQuery(sql);

  const statsMap = new Map<
    string,
    { totalMessages: number; totalCredits: number; lastActive: string }
  >();

  for (const row of rows) {
    const userId = row.userid?.replace(/^['"]|['"]$/g, '');
    if (!userId) continue;
    statsMap.set(userId, {
      totalMessages: safeInt(row.total_messages),
      totalCredits: safeFloat(row.total_credits),
      lastActive: row.last_active ?? '',
    });
  }

  return statsMap;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));

    const [idcUsers, activeStatsMap] = await Promise.all([
      fetchAllIdcUsers(),
      fetchActiveUserStats(days),
    ]);

    const users: IdcUserStatus[] = idcUsers.map((idcUser) => {
      const stats = activeStatsMap.get(idcUser.userId);
      const isActive = stats !== undefined;
      const organization = idcUser.email
        ? idcUser.email.split('@')[1] ?? ''
        : '';

      return {
        userId: idcUser.userId,
        displayName: idcUser.displayName,
        email: idcUser.email,
        status: isActive ? 'active' : 'inactive',
        totalMessages: isActive ? stats.totalMessages : 0,
        totalCredits: isActive ? stats.totalCredits : 0,
        lastActive: isActive ? stats.lastActive : null,
        organization,
      };
    });

    // Sort: active first, then inactive; within each group sort by totalMessages desc
    users.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1;
      }
      return b.totalMessages - a.totalMessages;
    });

    const activeCount = users.filter((u) => u.status === 'active').length;

    return NextResponse.json({
      total: users.length,
      active: activeCount,
      inactive: users.length - activeCount,
      users,
    });
  } catch (err) {
    console.error('[/api/idc-users] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch IdC users' }, { status: 500 });
  }
}
