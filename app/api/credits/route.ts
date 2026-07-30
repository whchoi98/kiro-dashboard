import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt, NORMALIZE_USERID, isMissingTableError } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { isoDateLiteral } from '@/lib/athena-window';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';
import { CreditAnalysis } from '@/types/dashboard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));
    // Literal window floor, resolved here rather than by Athena's CURRENT_DATE:
    // result reuse matches on the query string, so an engine-resolved window can
    // never be reused. See lib/athena-window.ts.
    const isoFloor = isoDateLiteral(days, Date.now());

    const tableName = await resolveTableName();

    const topUsersSql = `
      SELECT
        ${NORMALIZE_USERID} AS userid,
        SUM(CAST(credits_used AS DOUBLE)) AS total_credits,
        SUM(CAST(overage_credits_used AS DOUBLE)) AS overage_credits
      FROM "${tableName}"
      WHERE date >= ${isoFloor}
      GROUP BY ${NORMALIZE_USERID}
      ORDER BY total_credits DESC
      LIMIT 15
    `;

    const baseVsOverageSql = `
      SELECT
        SUM(CAST(credits_used AS DOUBLE)) AS base_credits,
        SUM(CAST(overage_credits_used AS DOUBLE)) AS overage_credits
      FROM "${tableName}"
      WHERE date >= ${isoFloor}
    `;

    const byTierSql = `
      SELECT
        subscription_tier,
        COUNT(DISTINCT ${NORMALIZE_USERID}) AS user_count,
        SUM(CAST(credits_used AS DOUBLE)) AS total_credits
      FROM "${tableName}"
      WHERE date >= ${isoFloor}
      GROUP BY subscription_tier
      ORDER BY total_credits DESC
    `;

    const [topUsersRows, baseVsOverageRows, byTierRows] = await Promise.all([
      executeQuery(topUsersSql),
      executeQuery(baseVsOverageSql),
      executeQuery(byTierSql),
    ]);

    const rawIds = topUsersRows.map((row) => row.userid.replace(/^['"]|['"]$/g, ''));
    const detailMap = await resolveUserDetails(rawIds);

    const bvo = baseVsOverageRows[0] ?? {};

    const analysis: CreditAnalysis = {
      topUsers: topUsersRows.map((row) => {
        const userid = row.userid.replace(/^['"]|['"]$/g, '');
        const detail = detailMap.get(userid);
        return {
          userid,
          username: detail?.email || detail?.username || maskText(userid.substring(0, 8)),
          displayName: detail?.displayName || maskText(userid.substring(0, 8)),
          email: detail?.email || '',
          organization: detail?.organization || '',
          totalCredits: safeFloat(row.total_credits),
          overageCredits: safeFloat(row.overage_credits),
        };
      }),
      baseVsOverage: {
        base: safeFloat(bvo.base_credits),
        overage: safeFloat(bvo.overage_credits),
      },
      byTier: byTierRows.map((row) => ({
        tier: row.subscription_tier,
        userCount: safeInt(row.user_count),
        totalCredits: safeFloat(row.total_credits),
      })),
    };

    return NextResponse.json(analysis);
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[/api/credits] table not yet provisioned — returning empty analysis');
      const empty: CreditAnalysis = {
        topUsers: [],
        baseVsOverage: { base: 0, overage: 0 },
        byTier: [],
      };
      return NextResponse.json(empty);
    }
    console.error('[/api/credits] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch credit analysis' }, { status: 500 });
  }
}
