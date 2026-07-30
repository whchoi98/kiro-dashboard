import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt, NORMALIZE_USERID, isMissingTableError } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { isoDateLiteral } from '@/lib/athena-window';
import { DailyTrend } from '@/types/dashboard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));
    // Literal window floor, resolved here rather than by Athena's CURRENT_DATE:
    // result reuse matches on the query string, so an engine-resolved window can
    // never be reused. See lib/athena-window.ts.
    const isoFloor = isoDateLiteral(days, Date.now());

    const tableName = await resolveTableName();

    const sql = `
      SELECT
        date,
        SUM(CAST(total_messages AS INTEGER)) AS messages,
        SUM(CAST(chat_conversations AS INTEGER)) AS conversations,
        SUM(CAST(credits_used AS DOUBLE)) AS credits,
        COUNT(DISTINCT ${NORMALIZE_USERID}) AS active_users
      FROM "${tableName}"
      WHERE date >= ${isoFloor}
      GROUP BY date
      ORDER BY date ASC
    `;

    const rows = await executeQuery(sql);

    const trends: DailyTrend[] = rows.map((row) => ({
      date: row.date,
      messages: safeInt(row.messages),
      conversations: safeInt(row.conversations),
      credits: safeFloat(row.credits),
      activeUsers: safeInt(row.active_users),
    }));

    return NextResponse.json(trends);
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[/api/trends] table not yet provisioned — returning empty trend');
      return NextResponse.json([]);
    }
    console.error('[/api/trends] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }
}
