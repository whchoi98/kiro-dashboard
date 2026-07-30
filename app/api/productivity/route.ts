import { NextRequest, NextResponse } from 'next/server';
import {
  executeQuery,
  safeFloat,
  safeInt,
  NORMALIZE_USERID,
  isMissingTableError,
} from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { isoDateLiteral, buaDateLiteral } from '@/lib/athena-window';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';
import { CreditEfficiency } from '@/types/dashboard';

/**
 * A ratio is only reported once its denominator clears this floor. Most of
 * by_user_analytic's metric columns are the literal string '0' in every row
 * (see docs/kiro-user-activity-report-schema.md §B-0), so without a floor a
 * lone 1-of-1 event would render as a confident "100% acceptance rate".
 * `null` means "not instrumented / too little signal", never zero.
 */
const MIN_RATE_DENOMINATOR = 10;

function rate(numerator: number, denominator: number): number | null {
  return denominator >= MIN_RATE_DENOMINATOR ? (numerator / denominator) * 100 : null;
}

function unavailableCreditEfficiency(): CreditEfficiency {
  return {
    available: false,
    credits: 0,
    acceptedLines: 0,
    creditsPerLine: null,
    windowStart: null,
    windowEnd: null,
    creditUsers: 0,
    lineUsers: 0,
  };
}

/**
 * Credits per accepted AI code line, over the window where both reports
 * overlap. Two INDEPENDENT sums, deliberately not a (user, date) join: 303 of
 * by_user_analytic's 541 pairs have no user_report counterpart, so an inner
 * join would silently discard over half the legacy data.
 *
 * The overlap bounds are computed from the data (GREATEST/LEAST of each
 * table's own MIN/MAX, intersected with the requested window) rather than
 * hardcoded — a fork whose reports start on a different date still gets a
 * correct window.
 *
 * Runs in its own try/catch so a missing `user_report` only nulls this card
 * instead of emptying the whole legacy-metrics payload.
 */
async function readCreditEfficiency(days: number): Promise<CreditEfficiency> {
// Literal window floors, resolved here rather than by Athena's CURRENT_DATE:
// result reuse matches on the query string, so an engine-resolved window can
// never be reused. `by_user_analytic` is MM-DD-YYYY and read through
// DATE_PARSE, which yields a timestamp — so that side needs a DATE literal,
// not a quoted string. See lib/athena-window.ts.
const isoFloor = isoDateLiteral(days, Date.now());
  try {
    const tableName = await resolveTableName();
    // by_user_analytic stores MM-DD-YYYY, so it is normalised to ISO before
    // any comparison against user_report's YYYY-MM-DD strings.
    const BUA_ISO_DATE = `DATE_FORMAT(DATE_PARSE(date, '%m-%d-%Y'), '%Y-%m-%d')`;

    const rows = await executeQuery(`
      WITH bounds AS (
        SELECT
          GREATEST(ur_min, bua_min, window_floor) AS window_start,
          LEAST(ur_max, bua_max) AS window_end
        FROM (
          SELECT
            (SELECT MIN(date) FROM "${tableName}") AS ur_min,
            (SELECT MAX(date) FROM "${tableName}") AS ur_max,
            (SELECT MIN(${BUA_ISO_DATE}) FROM by_user_analytic) AS bua_min,
            (SELECT MAX(${BUA_ISO_DATE}) FROM by_user_analytic) AS bua_max,
            ${isoFloor} AS window_floor
        )
      )
      SELECT
        'credits' AS side,
        b.window_start,
        b.window_end,
        SUM(CAST(ur.credits_used AS DOUBLE)) AS amount,
        COUNT(DISTINCT REGEXP_REPLACE(ur.userid, '^d-[a-z0-9]+\\.', '')) AS users
      FROM bounds b CROSS JOIN "${tableName}" ur
      WHERE ur.date BETWEEN b.window_start AND b.window_end
      GROUP BY b.window_start, b.window_end
      UNION ALL
      SELECT
        'lines' AS side,
        b.window_start,
        b.window_end,
        SUM(CAST(bua.chat_aicodelines AS DOUBLE) + CAST(bua.inline_aicodelines AS DOUBLE)) AS amount,
        COUNT(DISTINCT REGEXP_REPLACE(bua.userid, '^d-[a-z0-9]+\\.', '')) AS users
      FROM bounds b CROSS JOIN by_user_analytic bua
      WHERE DATE_FORMAT(DATE_PARSE(bua.date, '%m-%d-%Y'), '%Y-%m-%d')
            BETWEEN b.window_start AND b.window_end
      GROUP BY b.window_start, b.window_end
    `);

    const creditRow = rows.find((row) => row.side === 'credits');
    const lineRow = rows.find((row) => row.side === 'lines');
    // Either side missing means the windows don't actually overlap — report
    // unavailable rather than dividing by a phantom denominator.
    if (!creditRow || !lineRow) return unavailableCreditEfficiency();

    const credits = safeFloat(creditRow.amount);
    const acceptedLines = safeFloat(lineRow.amount);

    return {
      available: acceptedLines > 0,
      credits,
      acceptedLines,
      creditsPerLine: acceptedLines > 0 ? credits / acceptedLines : null,
      windowStart: creditRow.window_start || null,
      windowEnd: creditRow.window_end || null,
      creditUsers: safeInt(creditRow.users),
      lineUsers: safeInt(lineRow.users),
    };
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[/api/productivity] credit efficiency unavailable — a table is missing');
      return unavailableCreditEfficiency();
    }
    throw err;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') ?? '90', 10);
    // Literal window floors, resolved here rather than by Athena's CURRENT_DATE:
    // result reuse matches on the query string, so an engine-resolved window can
    // never be reused. `by_user_analytic` is MM-DD-YYYY and read through
    // DATE_PARSE, which yields a timestamp — so that side needs a DATE literal,
    // not a quoted string. See lib/athena-window.ts.
    const buaFloor = buaDateLiteral(days, Date.now());

    const summarySql = `
      SELECT
        COUNT(DISTINCT ${NORMALIZE_USERID}) AS active_users,
        SUM(CAST(chat_messagessent AS INTEGER)) AS chat_messages,
        SUM(CAST(chat_messagesinteracted AS INTEGER)) AS chat_messages_interacted,
        SUM(CAST(chat_aicodelines AS INTEGER)) AS ai_code_lines,
        SUM(CAST(inline_suggestionscount AS INTEGER)) AS inline_suggestions,
        SUM(CAST(inline_acceptancecount AS INTEGER)) AS inline_acceptances,
        SUM(CAST(inline_aicodelines AS INTEGER)) AS inline_code_lines,
        SUM(CAST(inlinechat_totaleventcount AS INTEGER)) AS inline_chat_sessions,
        SUM(CAST(inlinechat_acceptanceeventcount AS INTEGER)) AS inline_chat_accepts,
        SUM(CAST(dev_generationeventcount AS INTEGER)) AS dev_events,
        SUM(CAST(dev_generatedlines AS INTEGER)) AS dev_generated_lines,
        SUM(CAST(dev_acceptanceeventcount AS INTEGER)) AS dev_acceptance_events,
        SUM(CAST(dev_acceptedlines AS INTEGER)) AS dev_accepted_lines,
        SUM(CAST(codereview_findingscount AS INTEGER)) AS code_review_findings,
        SUM(CAST(codereview_succeededeventcount AS INTEGER)) AS code_review_succeeded,
        SUM(CAST(codereview_failedeventcount AS INTEGER)) AS code_review_failed,
        SUM(CAST(testgeneration_generatedtests AS INTEGER)) AS tests_generated,
        SUM(CAST(testgeneration_acceptedtests AS INTEGER)) AS tests_accepted,
        SUM(CAST(docgeneration_eventcount AS INTEGER)) AS doc_events
      FROM by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= ${buaFloor}
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
      FROM by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= ${buaFloor}
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
      FROM by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= ${buaFloor}
      GROUP BY date
      ORDER BY date
    `;

    const [summaryRows, topUsersRows, dailyTrendRows, creditEfficiency] = await Promise.all([
      executeQuery(summarySql),
      executeQuery(topUsersSql),
      executeQuery(dailyTrendSql),
      readCreditEfficiency(days),
    ]);

    const s = summaryRows[0] ?? {};
    const inlineSuggestions = safeInt(s.inline_suggestions);
    const inlineAcceptances = safeInt(s.inline_acceptances);
    const chatMessages = safeInt(s.chat_messages);
    const chatMessagesInteracted = safeInt(s.chat_messages_interacted);
    const devGeneratedLines = safeInt(s.dev_generated_lines);
    const devAcceptedLines = safeInt(s.dev_accepted_lines);
    const codeReviewSucceeded = safeInt(s.code_review_succeeded);
    const codeReviewFailed = safeInt(s.code_review_failed);

    const summary = {
      activeUsers: safeInt(s.active_users),
      chatMessages,
      chatMessagesInteracted,
      aiCodeLines: safeInt(s.ai_code_lines),
      inlineSuggestions,
      inlineAcceptances,
      inlineCodeLines: safeInt(s.inline_code_lines),
      inlineChatSessions: safeInt(s.inline_chat_sessions),
      inlineChatAccepts: safeInt(s.inline_chat_accepts),
      devEvents: safeInt(s.dev_events),
      devGeneratedLines,
      devAcceptanceEvents: safeInt(s.dev_acceptance_events),
      devAcceptedLines,
      codeReviewFindings: safeInt(s.code_review_findings),
      codeReviewSucceeded,
      codeReviewFailed,
      testsGenerated: safeInt(s.tests_generated),
      testsAccepted: safeInt(s.tests_accepted),
      docEvents: safeInt(s.doc_events),
      // Derived rates, each `null` below MIN_RATE_DENOMINATOR. Every one of
      // these denominators lives in a column that is the literal '0' in this
      // account today, so a `null` here is the expected state, not a bug —
      // the UI renders "not instrumented" rather than a confident 0%.
      inlineAcceptanceRate: rate(inlineAcceptances, inlineSuggestions),
      chatInteractionRate: rate(chatMessagesInteracted, chatMessages),
      devAcceptanceRate: rate(devAcceptedLines, devGeneratedLines),
      codeReviewSuccessRate: rate(codeReviewSucceeded, codeReviewSucceeded + codeReviewFailed),
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

    return NextResponse.json({ summary, topUsers, dailyTrend, creditEfficiency });
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[/api/productivity] table not yet provisioned — returning empty data');
      const emptySummary = {
        activeUsers: 0,
        chatMessages: 0,
        chatMessagesInteracted: 0,
        aiCodeLines: 0,
        inlineSuggestions: 0,
        inlineAcceptances: 0,
        inlineCodeLines: 0,
        inlineChatSessions: 0,
        inlineChatAccepts: 0,
        devEvents: 0,
        devGeneratedLines: 0,
        devAcceptanceEvents: 0,
        devAcceptedLines: 0,
        codeReviewFindings: 0,
        codeReviewSucceeded: 0,
        codeReviewFailed: 0,
        testsGenerated: 0,
        testsAccepted: 0,
        docEvents: 0,
        // `null`, not 0 — an absent table means "unknown", and a 0% acceptance
        // rate is a claim about behaviour that nobody measured.
        inlineAcceptanceRate: null,
        chatInteractionRate: null,
        devAcceptanceRate: null,
        codeReviewSuccessRate: null,
      };
      return NextResponse.json({
        summary: emptySummary,
        topUsers: [],
        dailyTrend: [],
        creditEfficiency: unavailableCreditEfficiency(),
      });
    }
    console.error('[/api/productivity] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch productivity data' }, { status: 500 });
  }
}
