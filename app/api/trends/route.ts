import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { DailyTrend } from '@/types/dashboard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') ?? '30', 10);

    const tableName = await resolveTableName();

    const sql = `
      SELECT
        date,
        SUM(TRY_CAST(total_messages AS BIGINT)) AS messages,
        SUM(TRY_CAST(chat_conversations AS BIGINT)) AS conversations,
        SUM(TRY_CAST(credits_used AS DOUBLE)) AS credits,
        COUNT(DISTINCT userid) AS active_users
      FROM ${tableName}
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
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
    console.error('[/api/trends] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }
}
