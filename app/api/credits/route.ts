import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { resolveUsernames } from '@/lib/identity';
import { CreditAnalysis } from '@/types/dashboard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') ?? '30', 10);

    const tableName = await resolveTableName();

    const topUsersSql = `
      SELECT
        "UserId",
        SUM(CAST("Credits_Used" AS DOUBLE)) AS total_credits,
        SUM(CAST("Overage_Credits_Used" AS DOUBLE)) AS overage_credits
      FROM "${tableName}"
      WHERE "Date" >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY "UserId"
      ORDER BY total_credits DESC
      LIMIT 15
    `;

    const baseVsOverageSql = `
      SELECT
        SUM(CAST("Credits_Used" AS DOUBLE)) AS base_credits,
        SUM(CAST("Overage_Credits_Used" AS DOUBLE)) AS overage_credits
      FROM "${tableName}"
      WHERE "Date" >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
    `;

    const byTierSql = `
      SELECT
        "Subscription_Tier",
        COUNT(DISTINCT "UserId") AS user_count,
        SUM(CAST("Credits_Used" AS DOUBLE)) AS total_credits
      FROM "${tableName}"
      WHERE "Date" >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY "Subscription_Tier"
      ORDER BY total_credits DESC
    `;

    const [topUsersRows, baseVsOverageRows, byTierRows] = await Promise.all([
      executeQuery(topUsersSql),
      executeQuery(baseVsOverageSql),
      executeQuery(byTierSql),
    ]);

    const rawIds = topUsersRows.map((row) => row.UserId.replace(/^['"]|['"]$/g, ''));
    const usernameMap = await resolveUsernames(rawIds);

    const bvo = baseVsOverageRows[0] ?? {};

    const analysis: CreditAnalysis = {
      topUsers: topUsersRows.map((row) => {
        const userid = row.UserId.replace(/^['"]|['"]$/g, '');
        return {
          userid,
          username: usernameMap.get(userid) ?? userid.substring(0, 8),
          totalCredits: safeFloat(row.total_credits),
          overageCredits: safeFloat(row.overage_credits),
        };
      }),
      baseVsOverage: {
        base: safeFloat(bvo.base_credits),
        overage: safeFloat(bvo.overage_credits),
      },
      byTier: byTierRows.map((row) => ({
        tier: row.Subscription_Tier,
        userCount: safeInt(row.user_count),
        totalCredits: safeFloat(row.total_credits),
      })),
    };

    return NextResponse.json(analysis);
  } catch (err) {
    console.error('[/api/credits] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch credit analysis' }, { status: 500 });
  }
}
