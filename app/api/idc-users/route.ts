import { NextRequest, NextResponse } from 'next/server';
import { IdentitystoreClient, ListUsersCommand } from '@aws-sdk/client-identitystore';
import {
  executeQuery,
  safeFloat,
  safeInt,
  NORMALIZE_USERID,
  isMissingTableError,
} from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { isoDateLiteral } from '@/lib/athena-window';
import { maskText, maskEmail } from '@/lib/mask';
import { DormancyBucket, DormancySummary, FunnelStep } from '@/types/dashboard';

export interface IdcUserStatus {
  userId: string;
  displayName: string;
  email: string;
  status: 'active' | 'inactive';
  totalMessages: number;
  totalCredits: number;
  lastActive: string | null;
  organization: string;
  daysSinceLastActive: number | null;
  activeDays: number;
  dormancy: DormancyBucket;
}

/**
 * Bucket order is also the display order. `never` is last because it is the
 * largest and least actionable group: these are IAM Identity Center directory
 * accounts, and the directory is NOT a Kiro subscription roster — the only
 * authoritative roster is `user-subscriptions:ListUserSubscriptions`, which
 * this task role cannot call. A `never` user may simply not have a Kiro
 * subscription at all, so this must never be presented as a wasted seat.
 */
const BUCKET_ORDER: DormancyBucket[] = [
  'active7',
  'dormant30',
  'dormant60',
  'dormantOld',
  'never',
];

/** Days of activity before a user counts as "sustained" in the funnel. */
const SUSTAINED_ACTIVE_DAYS = 5;

function gradeDormancy(daysSince: number | null): DormancyBucket {
  if (daysSince === null) return 'never';
  if (daysSince <= 7) return 'active7';
  if (daysSince <= 30) return 'dormant30';
  if (daysSince <= 60) return 'dormant60';
  return 'dormantOld';
}

/**
 * Whole days from a YYYY-MM-DD activity date to today, in UTC. Reports land
 * once daily at 02:00 UTC, so same-day activity reads as 0 and a value of 1 is
 * the freshest possible result for most of the day.
 */
function daysSince(dateStr: string): number | null {
  const then = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((todayUtc - then) / 86_400_000));
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

interface UserStats {
  totalMessages: number;
  totalCredits: number;
  lastActive: string;
  /** Distinct report dates the user appears on — the dormancy depth signal. */
  activeDays: number;
}

async function fetchActiveUserStats(days: number): Promise<Map<string, UserStats>> {
  const tableName = await resolveTableName();

  // Literal window floor, resolved here rather than by Athena's CURRENT_DATE:
  // result reuse matches on the query string, so an engine-resolved window can
  // never be reused. See lib/athena-window.ts.
  const isoFloor = isoDateLiteral(days, Date.now());

  const sql = `
    SELECT ${NORMALIZE_USERID} AS userid, SUM(CAST(total_messages AS INTEGER)) AS total_messages, SUM(CAST(credits_used AS DOUBLE)) AS total_credits, MAX(date) AS last_active, COUNT(DISTINCT date) AS active_days
    FROM "${tableName}"
    WHERE date >= ${isoFloor}
    GROUP BY ${NORMALIZE_USERID}
  `;

  const rows = await executeQuery(sql);

  const statsMap = new Map<string, UserStats>();

  for (const row of rows) {
    const userId = row.userid?.replace(/^['"]|['"]$/g, '');
    if (!userId) continue;
    statsMap.set(userId, {
      totalMessages: safeInt(row.total_messages),
      totalCredits: safeFloat(row.total_credits),
      lastActive: row.last_active ?? '',
      activeDays: safeInt(row.active_days),
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
      // An unprovisioned Glue catalog means "we have no activity data", which
      // is a legitimate state (every directory user grades as `never`) — not a
      // reason to 500 the whole directory listing.
      fetchActiveUserStats(days).catch((err) => {
        if (!isMissingTableError(err)) throw err;
        console.warn('[/api/idc-users] activity table not provisioned — grading directory only');
        return new Map<string, UserStats>();
      }),
    ]);

    const users: IdcUserStatus[] = idcUsers.map((idcUser) => {
      const stats = activeStatsMap.get(idcUser.userId);
      const isActive = stats !== undefined;
      const organization = idcUser.email
        ? idcUser.email.split('@')[1] ?? ''
        : '';

      const lastActive = isActive ? stats.lastActive : null;
      const daysSinceLastActive = lastActive ? daysSince(lastActive) : null;

      return {
        userId: idcUser.userId,
        displayName: maskText(idcUser.displayName),
        email: maskEmail(idcUser.email),
        status: isActive ? 'active' : 'inactive',
        totalMessages: isActive ? stats.totalMessages : 0,
        totalCredits: isActive ? stats.totalCredits : 0,
        lastActive,
        organization: maskText(organization),
        daysSinceLastActive,
        activeDays: isActive ? stats.activeDays : 0,
        dormancy: gradeDormancy(daysSinceLastActive),
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

    // ── dormancy grading. Every bucket is emitted even at count 0, so the UI
    // renders a stable five-row strip instead of a shifting subset.
    const dormancy: DormancySummary[] = BUCKET_ORDER.map((bucket) => {
      const count = users.filter((u) => u.dormancy === bucket).length;
      return {
        bucket,
        count,
        percentage: users.length > 0 ? (count / users.length) * 100 : 0,
      };
    });

    // ── directory → activity funnel. `conversionRate` is relative to the
    // PREVIOUS step, `percentage` to the directory total.
    const anyActivity = users.filter((u) => u.dormancy !== 'never').length;
    const sustained = users.filter((u) => u.activeDays >= SUSTAINED_ACTIVE_DAYS).length;
    const pctOfTotal = (n: number) => (users.length > 0 ? (n / users.length) * 100 : 0);
    const funnel: FunnelStep[] = [
      {
        label: 'idc.funnel.directory',
        count: users.length,
        percentage: 100,
        conversionRate: 100,
      },
      {
        label: 'idc.funnel.anyActivity',
        count: anyActivity,
        percentage: pctOfTotal(anyActivity),
        conversionRate: pctOfTotal(anyActivity),
      },
      {
        label: 'idc.funnel.sustained',
        count: sustained,
        percentage: pctOfTotal(sustained),
        conversionRate: anyActivity > 0 ? (sustained / anyActivity) * 100 : 0,
      },
    ];

    return NextResponse.json({
      total: users.length,
      active: activeCount,
      inactive: users.length - activeCount,
      windowDays: days,
      dormancy,
      funnel,
      users,
    });
  } catch (err) {
    console.error('[/api/idc-users] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch IdC users' }, { status: 500 });
  }
}
