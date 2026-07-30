import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt, NORMALIZE_USERID, isMissingTableError } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { isoDateLiteral } from '@/lib/athena-window';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';
import { SubscriptionData, OverageUser, TierSlice } from '@/types/dashboard';

function emptySubscriptionData(): SubscriptionData {
  return {
    tiers: [],
    tierTrend: [],
    overageSummary: {
      enabledUsers: 0,
      totalUsers: 0,
      totalOverageCredits: 0,
      totalBaseCredits: 0,
    },
    overageUsers: [],
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));
    // Literal window floor, resolved here rather than by Athena's CURRENT_DATE:
    // result reuse matches on the query string, so an engine-resolved window can
    // never be reused. See lib/athena-window.ts.
    const isoFloor = isoDateLiteral(days, Date.now());

    const tableName = await resolveTableName();

    // user_report dates are YYYY-MM-DD strings — lexicographic compare works
    const dateFilter = `date >= ${isoFloor}`;

    const tiersSql = `
      SELECT
        subscription_tier,
        COUNT(DISTINCT ${NORMALIZE_USERID}) AS user_count,
        SUM(CAST(credits_used AS DOUBLE)) AS total_credits,
        SUM(CAST(total_messages AS DOUBLE)) AS total_messages
      FROM "${tableName}"
      WHERE ${dateFilter}
      GROUP BY subscription_tier
      ORDER BY total_credits DESC
    `;

    const tierTrendSql = `
      SELECT
        date,
        subscription_tier,
        SUM(CAST(credits_used AS DOUBLE)) AS credits
      FROM "${tableName}"
      WHERE ${dateFilter}
      GROUP BY date, subscription_tier
      ORDER BY date
    `;

    const overageSummarySql = `
      SELECT
        COUNT(DISTINCT CASE WHEN LOWER(overage_enabled) = 'true' THEN ${NORMALIZE_USERID} END) AS enabled_users,
        COUNT(DISTINCT ${NORMALIZE_USERID}) AS total_users,
        SUM(CAST(overage_credits_used AS DOUBLE)) AS total_overage_credits,
        SUM(CAST(credits_used AS DOUBLE)) AS total_base_credits
      FROM "${tableName}"
      WHERE ${dateFilter}
    `;

    const overageUsersSql = `
      SELECT
        ${NORMALIZE_USERID} AS userid,
        MAX(CAST(overage_cap AS DOUBLE)) AS overage_cap,
        SUM(CAST(overage_credits_used AS DOUBLE)) AS overage_credits,
        MAX_BY(subscription_tier, date) AS tier,
        CASE
          WHEN MAX(CAST(overage_cap AS DOUBLE)) > 0
          THEN SUM(CAST(overage_credits_used AS DOUBLE)) / MAX(CAST(overage_cap AS DOUBLE)) * 100
          ELSE 0
        END AS utilization
      FROM "${tableName}"
      WHERE ${dateFilter}
      GROUP BY ${NORMALIZE_USERID}
      HAVING MAX(CAST(overage_cap AS DOUBLE)) > 0 OR SUM(CAST(overage_credits_used AS DOUBLE)) > 0
      ORDER BY utilization DESC
      LIMIT 15
    `;

    const [tierRows, tierTrendRows, overageSummaryRows, overageUserRows] = await Promise.all([
      executeQuery(tiersSql),
      executeQuery(tierTrendSql),
      executeQuery(overageSummarySql),
      executeQuery(overageUsersSql),
    ]);

    // ── tiers: credit share is each tier's slice of all credits in the window
    const totalTierCredits = tierRows.reduce((sum, row) => sum + safeFloat(row.total_credits), 0);
    const tiers: TierSlice[] = tierRows.map((row) => {
      const totalCredits = safeFloat(row.total_credits);
      return {
        tier: row.subscription_tier || 'UNKNOWN',
        userCount: safeInt(row.user_count),
        totalCredits,
        totalMessages: safeFloat(row.total_messages),
        creditShare: totalTierCredits > 0 ? (totalCredits / totalTierCredits) * 100 : 0,
      };
    });

    // ── tierTrend: pivot (date, tier, credits) rows into { date, [tier]: credits }
    const trendMap = new Map<string, { date: string; [tier: string]: string | number }>();
    for (const row of tierTrendRows) {
      const date = row.date;
      if (!date) continue;
      const tier = row.subscription_tier || 'UNKNOWN';
      const point = trendMap.get(date) ?? { date };
      const prev = point[tier];
      point[tier] = (typeof prev === 'number' ? prev : 0) + safeFloat(row.credits);
      trendMap.set(date, point);
    }
    const tierTrend = Array.from(trendMap.values()).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );

    // ── overageSummary
    const summaryRow = overageSummaryRows[0] ?? {};
    const overageSummary = {
      enabledUsers: safeInt(summaryRow.enabled_users),
      totalUsers: safeInt(summaryRow.total_users),
      totalOverageCredits: safeFloat(summaryRow.total_overage_credits),
      totalBaseCredits: safeFloat(summaryRow.total_base_credits),
    };

    // ── overageUsers: top 15 by cap utilization, masked display names
    const rawIds = overageUserRows.map((row) => (row.userid ?? '').replace(/^['"]|['"]$/g, ''));
    const detailMap = await resolveUserDetails(rawIds);

    const overageUsers: OverageUser[] = overageUserRows.map((row) => {
      const userid = (row.userid ?? '').replace(/^['"]|['"]$/g, '');
      const overageCap = safeFloat(row.overage_cap);
      const overageCredits = safeFloat(row.overage_credits);
      return {
        userid,
        displayName: detailMap.get(userid)?.displayName || maskText(userid.substring(0, 8)),
        tier: row.tier || 'UNKNOWN',
        overageCredits,
        overageCap,
        utilization: overageCap > 0 ? (overageCredits / overageCap) * 100 : 0,
      };
    });

    const data: SubscriptionData = { tiers, tierTrend, overageSummary, overageUsers };
    return NextResponse.json(data);
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[/api/subscription] table not yet provisioned — returning empty analysis');
      return NextResponse.json(emptySubscriptionData());
    }
    console.error('[/api/subscription] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch subscription analysis' }, { status: 500 });
  }
}
