import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt, NORMALIZE_USERID } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { resolveUserDetails } from '@/lib/identity';

const USERID_RE = /^[a-f0-9-]{36}$/;

export interface UserDetailResponse {
  userid: string;
  displayName: string;
  email: string;
  organization: string;
  summary: {
    totalMessages: number;
    totalConversations: number;
    totalCredits: number;
    totalOverageCredits: number;
    activeDays: number;
    firstActive: string;
    lastActive: string;
  };
  dailyActivity: Array<{
    date: string;
    messages: number;
    conversations: number;
    credits: number;
    clientType: string;
  }>;
  clientBreakdown: Array<{
    clientType: string;
    messages: number;
    credits: number;
  }>;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userid = searchParams.get('userid') ?? '';
    const days = parseInt(searchParams.get('days') ?? '90', 10);

    if (!USERID_RE.test(userid)) {
      return NextResponse.json({ error: 'Invalid userid format' }, { status: 400 });
    }

    const tableName = await resolveTableName();

    const summarySql = `
      SELECT
        SUM(CAST(total_messages AS INTEGER)) AS total_messages,
        SUM(CAST(chat_conversations AS INTEGER)) AS total_conversations,
        SUM(CAST(credits_used AS DOUBLE)) AS total_credits,
        SUM(CAST(overage_credits_used AS DOUBLE)) AS total_overage,
        COUNT(DISTINCT date) AS active_days,
        MIN(date) AS first_active,
        MAX(date) AS last_active
      FROM "${tableName}"
      WHERE ${NORMALIZE_USERID} = '${userid}'
        AND date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
    `;

    const dailySql = `
      SELECT
        date,
        CAST(total_messages AS INTEGER) AS messages,
        CAST(chat_conversations AS INTEGER) AS conversations,
        CAST(credits_used AS DOUBLE) AS credits,
        client_type
      FROM "${tableName}"
      WHERE ${NORMALIZE_USERID} = '${userid}'
        AND date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      ORDER BY date DESC
    `;

    const clientSql = `
      SELECT
        client_type,
        SUM(CAST(total_messages AS INTEGER)) AS messages,
        SUM(CAST(credits_used AS DOUBLE)) AS credits
      FROM "${tableName}"
      WHERE ${NORMALIZE_USERID} = '${userid}'
        AND date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')
      GROUP BY client_type
    `;

    const [summaryRows, dailyRows, clientRows] = await Promise.all([
      executeQuery(summarySql),
      executeQuery(dailySql),
      executeQuery(clientSql),
    ]);

    const detailMap = await resolveUserDetails([userid]);
    const detail = detailMap.get(userid);

    const s = summaryRows[0] ?? {};
    const summary = {
      totalMessages: safeInt(s.total_messages),
      totalConversations: safeInt(s.total_conversations),
      totalCredits: safeFloat(s.total_credits),
      totalOverageCredits: safeFloat(s.total_overage),
      activeDays: safeInt(s.active_days),
      firstActive: s.first_active ?? '',
      lastActive: s.last_active ?? '',
    };

    const dailyActivity = dailyRows.map((row) => ({
      date: row.date,
      messages: safeInt(row.messages),
      conversations: safeInt(row.conversations),
      credits: safeFloat(row.credits),
      clientType: row.client_type ?? '',
    }));

    const clientBreakdown = clientRows.map((row) => ({
      clientType: row.client_type ?? '',
      messages: safeInt(row.messages),
      credits: safeFloat(row.credits),
    }));

    const response: UserDetailResponse = {
      userid,
      displayName: detail?.displayName || userid.substring(0, 8),
      email: detail?.email || '',
      organization: detail?.organization || '',
      summary,
      dailyActivity,
      clientBreakdown,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[/api/user-detail] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch user detail' }, { status: 500 });
  }
}
