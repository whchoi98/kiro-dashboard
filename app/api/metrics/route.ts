import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { OverviewMetrics } from '@/types/dashboard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') ?? '30', 10);

    const tableName = await resolveTableName();

    const currentPeriodSql = `
      SELECT
        COUNT(DISTINCT userid) AS total_users,
        SUM(CAST(total_messages AS INTEGER)) AS total_messages,
        SUM(CAST(chat_conversations AS INTEGER)) AS total_conversations,
        SUM(CAST(credits_used AS DOUBLE)) AS total_credits,
        SUM(CAST(overage_credits_used AS DOUBLE)) AS total_overage_credits
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
    `;

    const previousPeriodSql = `
      SELECT
        COUNT(DISTINCT userid) AS total_users,
        SUM(CAST(total_messages AS INTEGER)) AS total_messages,
        SUM(CAST(chat_conversations AS INTEGER)) AS total_conversations,
        SUM(CAST(credits_used AS DOUBLE)) AS total_credits,
        SUM(CAST(overage_credits_used AS DOUBLE)) AS total_overage_credits
      FROM "${tableName}"
      WHERE date >= DATE_FORMAT(DATE_ADD('day', -${days * 2}, CURRENT_DATE), '%Y-%m-%d')
        AND date < DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
    `;

    const [currentRows, previousRows] = await Promise.all([
      executeQuery(currentPeriodSql),
      executeQuery(previousPeriodSql),
    ]);

    const curr = currentRows[0] ?? {};
    const prev = previousRows[0] ?? {};

    const calcChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    const totalUsers = safeInt(curr.total_users);
    const totalMessages = safeInt(curr.total_messages);
    const totalConversations = safeInt(curr.total_conversations);
    const totalCredits = safeFloat(curr.total_credits);
    const totalOverageCredits = safeFloat(curr.total_overage_credits);

    const prevUsers = safeInt(prev.total_users);
    const prevMessages = safeInt(prev.total_messages);
    const prevConversations = safeInt(prev.total_conversations);
    const prevCredits = safeFloat(prev.total_credits);
    const prevOverageCredits = safeFloat(prev.total_overage_credits);

    const metrics: OverviewMetrics = {
      totalUsers,
      totalMessages,
      totalConversations,
      totalCredits,
      totalOverageCredits,
      changeRates: {
        totalUsers: calcChange(totalUsers, prevUsers),
        totalMessages: calcChange(totalMessages, prevMessages),
        totalConversations: calcChange(totalConversations, prevConversations),
        totalCredits: calcChange(totalCredits, prevCredits),
        totalOverageCredits: calcChange(totalOverageCredits, prevOverageCredits),
      },
    };

    return NextResponse.json(metrics);
  } catch (err) {
    console.error('[/api/metrics] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
