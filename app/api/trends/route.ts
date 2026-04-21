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
        "Date",
        SUM(CAST("Total_Messages" AS INTEGER)) AS messages,
        SUM(CAST("Chat_Conversations" AS INTEGER)) AS conversations,
        SUM(CAST("Credits_Used" AS DOUBLE)) AS credits,
        COUNT(DISTINCT "UserId") AS active_users
      FROM "${tableName}"
      WHERE "Date" >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY "Date"
      ORDER BY "Date" ASC
    `;

    const rows = await executeQuery(sql);

    const trends: DailyTrend[] = rows.map((row) => ({
      date: row.Date,
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
