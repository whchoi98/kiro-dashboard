import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeInt, NORMALIZE_USERID } from '@/lib/athena';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') ?? '90', 10);

    const summarySql = `
      SELECT
        COUNT(DISTINCT ${NORMALIZE_USERID}) AS active_users,
        SUM(CAST(chat_messagessent AS INTEGER)) AS chat_messages,
        SUM(CAST(chat_aicodelines AS INTEGER)) AS ai_code_lines,
        SUM(CAST(inline_suggestionscount AS INTEGER)) AS inline_suggestions,
        SUM(CAST(inline_acceptancecount AS INTEGER)) AS inline_acceptances,
        SUM(CAST(inline_aicodelines AS INTEGER)) AS inline_code_lines,
        SUM(CAST(inlinechat_totaleventcount AS INTEGER)) AS inline_chat_sessions,
        SUM(CAST(inlinechat_acceptanceeventcount AS INTEGER)) AS inline_chat_accepts,
        SUM(CAST(dev_generationeventcount AS INTEGER)) AS dev_events,
        SUM(CAST(dev_acceptedlines AS INTEGER)) AS dev_accepted_lines,
        SUM(CAST(codereview_findingscount AS INTEGER)) AS code_review_findings,
        SUM(CAST(testgeneration_generatedtests AS INTEGER)) AS tests_generated,
        SUM(CAST(testgeneration_acceptedtests AS INTEGER)) AS tests_accepted,
        SUM(CAST(docgeneration_eventcount AS INTEGER)) AS doc_events
      FROM titanlog.by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= DATE_ADD('day', -${days}, CURRENT_DATE)
    `;

    const topUsersSql = `
      SELECT
        ${NORMALIZE_USERID} AS userid,
        SUM(CAST(chat_messagessent AS INTEGER)) AS chat_messages,
        SUM(CAST(chat_aicodelines AS INTEGER)) AS ai_code_lines,
        SUM(CAST(inline_acceptancecount AS INTEGER)) AS inline_acceptances,
        SUM(CAST(inline_aicodelines AS INTEGER)) AS inline_code_lines,
        SUM(CAST(inlinechat_acceptanceeventcount AS INTEGER)) AS inline_chat_accepts,
        SUM(CAST(dev_acceptedlines AS INTEGER)) AS dev_accepted_lines
      FROM titanlog.by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= DATE_ADD('day', -${days}, CURRENT_DATE)
      GROUP BY ${NORMALIZE_USERID}
      ORDER BY ai_code_lines DESC
      LIMIT 20
    `;

    const dailyTrendSql = `
      SELECT
        date,
        SUM(CAST(chat_aicodelines AS INTEGER)) AS ai_code_lines,
        SUM(CAST(inline_acceptancecount AS INTEGER)) AS inline_acceptances,
        SUM(CAST(chat_messagessent AS INTEGER)) AS chat_messages,
        COUNT(DISTINCT ${NORMALIZE_USERID}) AS active_users
      FROM titanlog.by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= DATE_ADD('day', -${days}, CURRENT_DATE)
      GROUP BY date
      ORDER BY date
    `;

    const [summaryRows, topUsersRows, dailyTrendRows] = await Promise.all([
      executeQuery(summarySql),
      executeQuery(topUsersSql),
      executeQuery(dailyTrendSql),
    ]);

    const s = summaryRows[0] ?? {};
    const summary = {
      activeUsers: safeInt(s.active_users),
      chatMessages: safeInt(s.chat_messages),
      aiCodeLines: safeInt(s.ai_code_lines),
      inlineSuggestions: safeInt(s.inline_suggestions),
      inlineAcceptances: safeInt(s.inline_acceptances),
      inlineCodeLines: safeInt(s.inline_code_lines),
      inlineChatSessions: safeInt(s.inline_chat_sessions),
      inlineChatAccepts: safeInt(s.inline_chat_accepts),
      devEvents: safeInt(s.dev_events),
      devAcceptedLines: safeInt(s.dev_accepted_lines),
      codeReviewFindings: safeInt(s.code_review_findings),
      testsGenerated: safeInt(s.tests_generated),
      testsAccepted: safeInt(s.tests_accepted),
      docEvents: safeInt(s.doc_events),
    };

    const rawIds = topUsersRows.map((row) => row.userid.replace(/^['"]|['"]$/g, ''));
    const detailMap = await resolveUserDetails(rawIds);

    const topUsers = topUsersRows.map((row) => {
      const userid = row.userid.replace(/^['"]|['"]$/g, '');
      const detail = detailMap.get(userid);
      return {
        userid,
        displayName: detail?.displayName || maskText(userid.substring(0, 8)),
        email: detail?.email || '',
        organization: detail?.organization || '',
        chatMessages: safeInt(row.chat_messages),
        aiCodeLines: safeInt(row.ai_code_lines),
        inlineAcceptances: safeInt(row.inline_acceptances),
        inlineCodeLines: safeInt(row.inline_code_lines),
        inlineChatAccepts: safeInt(row.inline_chat_accepts),
        devAcceptedLines: safeInt(row.dev_accepted_lines),
      };
    });

    // Convert MM-DD-YYYY to YYYY-MM-DD and sort
    const dailyTrend = dailyTrendRows
      .map((row) => {
        // row.date is MM-DD-YYYY
        const parts = row.date.split('-');
        const isoDate =
          parts.length === 3 ? `${parts[2]}-${parts[0]}-${parts[1]}` : row.date;
        return {
          date: isoDate,
          aiCodeLines: safeInt(row.ai_code_lines),
          inlineAcceptances: safeInt(row.inline_acceptances),
          chatMessages: safeInt(row.chat_messages),
          activeUsers: safeInt(row.active_users),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ summary, topUsers, dailyTrend });
  } catch (err) {
    console.error('[/api/productivity] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch productivity data' }, { status: 500 });
  }
}
