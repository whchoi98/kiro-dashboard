import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt, NORMALIZE_USERID, isMissingTableError } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { isoDateLiteral } from '@/lib/athena-window';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';
import { TopUser } from '@/types/dashboard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));
    // Literal window floor, resolved here rather than by Athena's CURRENT_DATE:
    // result reuse matches on the query string, so an engine-resolved window can
    // never be reused. See lib/athena-window.ts.
    const isoFloor = isoDateLiteral(days, Date.now());
    const limit = parseInt(searchParams.get('limit') ?? '10', 10);

    const tableName = await resolveTableName();

    const sql = `
      SELECT
        ${NORMALIZE_USERID} AS userid,
        SUM(CAST(total_messages AS INTEGER)) AS total_messages,
        SUM(CAST(credits_used AS DOUBLE)) AS total_credits
      FROM "${tableName}"
      WHERE date >= ${isoFloor}
      GROUP BY ${NORMALIZE_USERID}
      ORDER BY total_messages DESC
      LIMIT ${limit}
    `;

    const rows = await executeQuery(sql);

    const rawIds = rows.map((row) => row.userid.replace(/^['"]|['"]$/g, ''));
    const detailMap = await resolveUserDetails(rawIds);

    const users: TopUser[] = rows.map((row, index) => {
      const userid = row.userid.replace(/^['"]|['"]$/g, '');
      const detail = detailMap.get(userid);
      return {
        userid,
        username: detail?.email || detail?.username || maskText(userid.substring(0, 8)),
        displayName: detail?.displayName || maskText(userid.substring(0, 8)),
        email: detail?.email || '',
        organization: detail?.organization || '',
        totalMessages: safeInt(row.total_messages),
        totalCredits: safeFloat(row.total_credits),
        rank: index + 1,
      };
    });

    return NextResponse.json(users);
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[/api/users] table not yet provisioned — returning empty list');
      return NextResponse.json([]);
    }
    console.error('[/api/users] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
