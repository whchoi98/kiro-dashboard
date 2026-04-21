import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { ClientDistribution } from '@/types/dashboard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') ?? '30', 10);

    const tableName = await resolveTableName();

    const sql = `
      SELECT
        client_type,
        SUM(CAST(total_messages AS INTEGER)) AS message_count,
        SUM(CAST(credits_used AS DOUBLE)) AS credit_count
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY client_type
    `;

    const rows = await executeQuery(sql);

    const totalMessages = rows.reduce((sum, row) => sum + safeInt(row.message_count), 0);

    const result: ClientDistribution[] = rows.map((row) => {
      const messageCount = safeInt(row.message_count);
      const creditCount = safeFloat(row.credit_count);
      const percentage = totalMessages > 0
        ? Math.round((messageCount / totalMessages) * 100)
        : 0;
      return {
        clientType: row.client_type,
        messageCount,
        creditCount,
        percentage,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[/api/client-dist] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch client distribution' }, { status: 500 });
  }
}
