import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeInt, NORMALIZE_USERID, isMissingTableError } from '@/lib/athena';
import { buaDateLiteral } from '@/lib/athena-window';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';
import { DevActivityData, DevActivityGroup } from '@/types/dashboard';

const GROUP_KEYS = ['TestGen', 'DocGen', 'Transform', 'InlineChat', 'CodeFix'] as const;

function emptyDevActivityData(): DevActivityData {
  return {
    groups: GROUP_KEYS.map((key) => ({
      key,
      events: 0,
      generated: 0,
      accepted: 0,
      acceptanceRate: 0,
    })),
    trend: [],
    topUsers: [],
  };
}

function buildGroup(key: string, events: number, generated: number, accepted: number): DevActivityGroup {
  return {
    key,
    events,
    generated,
    accepted,
    acceptanceRate: generated > 0 ? (accepted / generated) * 100 : 0,
  };
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
        SUM(CAST(testgeneration_eventcount AS INTEGER)) AS testgen_events,
        SUM(CAST(testgeneration_generatedlines AS INTEGER)) AS testgen_generated,
        SUM(CAST(testgeneration_acceptedlines AS INTEGER)) AS testgen_accepted,
        SUM(CAST(docgeneration_eventcount AS INTEGER)) AS docgen_events,
        -- DocGen reports additions AND updates on both sides of the decision.
        -- Omitting *lineupdates (as this query used to) shrank the denominator
        -- while leaving updates out of the numerator too, so the rate was
        -- computed over additions only and silently mislabelled as DocGen's.
        SUM(
          CAST(docgeneration_acceptedlineadditions AS INTEGER)
          + CAST(docgeneration_acceptedlineupdates AS INTEGER)
          + CAST(docgeneration_rejectedlineadditions AS INTEGER)
          + CAST(docgeneration_rejectedlineupdates AS INTEGER)
        ) AS docgen_generated,
        SUM(
          CAST(docgeneration_acceptedlineadditions AS INTEGER)
          + CAST(docgeneration_acceptedlineupdates AS INTEGER)
        ) AS docgen_accepted,
        SUM(CAST(transformation_eventcount AS INTEGER)) AS transform_events,
        SUM(CAST(transformation_linesgenerated AS INTEGER)) AS transform_generated,
        SUM(CAST(inlinechat_totaleventcount AS INTEGER)) AS inlinechat_events,
        -- Inline chat edits delete lines as well as add them; all three
        -- *linedeletions counters were previously dropped from the
        -- denominator, understating how much was actually offered.
        SUM(
          CAST(inlinechat_acceptedlineadditions AS INTEGER)
          + CAST(inlinechat_acceptedlinedeletions AS INTEGER)
          + CAST(inlinechat_rejectedlineadditions AS INTEGER)
          + CAST(inlinechat_rejectedlinedeletions AS INTEGER)
          + CAST(inlinechat_dismissedlineadditions AS INTEGER)
          + CAST(inlinechat_dismissedlinedeletions AS INTEGER)
        ) AS inlinechat_generated,
        SUM(
          CAST(inlinechat_acceptedlineadditions AS INTEGER)
          + CAST(inlinechat_acceptedlinedeletions AS INTEGER)
        ) AS inlinechat_accepted,
        SUM(CAST(codefix_generationeventcount AS INTEGER)) AS codefix_events,
        SUM(CAST(codefix_generatedlines AS INTEGER)) AS codefix_generated,
        SUM(CAST(codefix_acceptedlines AS INTEGER)) AS codefix_accepted
      FROM by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= ${buaFloor}
    `;

    const trendSql = `
      SELECT
        date,
        SUM(CAST(testgeneration_eventcount AS INTEGER)) AS testgen_events,
        SUM(CAST(docgeneration_eventcount AS INTEGER)) AS docgen_events,
        SUM(CAST(transformation_eventcount AS INTEGER)) AS transform_events,
        SUM(CAST(inlinechat_totaleventcount AS INTEGER)) AS inlinechat_events,
        SUM(CAST(codefix_generationeventcount AS INTEGER)) AS codefix_events
      FROM by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= ${buaFloor}
      GROUP BY date
      ORDER BY date
    `;

    const topUsersSql = `
      SELECT
        ${NORMALIZE_USERID} AS userid,
        SUM(
          CAST(testgeneration_eventcount AS INTEGER)
          + CAST(docgeneration_eventcount AS INTEGER)
          + CAST(transformation_eventcount AS INTEGER)
          + CAST(inlinechat_totaleventcount AS INTEGER)
          + CAST(codefix_generationeventcount AS INTEGER)
        ) AS total_events,
        SUM(
          CAST(testgeneration_acceptedlines AS INTEGER)
          + CAST(docgeneration_acceptedlineadditions AS INTEGER)
          + CAST(docgeneration_acceptedlineupdates AS INTEGER)
          + CAST(transformation_linesgenerated AS INTEGER)
          + CAST(inlinechat_acceptedlineadditions AS INTEGER)
          + CAST(inlinechat_acceptedlinedeletions AS INTEGER)
          + CAST(codefix_acceptedlines AS INTEGER)
        ) AS accepted_lines
      FROM by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= ${buaFloor}
      GROUP BY ${NORMALIZE_USERID}
      ORDER BY total_events DESC
      LIMIT 10
    `;

    const [summaryRows, trendRows, topUsersRows] = await Promise.all([
      executeQuery(summarySql),
      executeQuery(trendSql),
      executeQuery(topUsersSql),
    ]);

    const s = summaryRows[0] ?? {};

    const transformEvents = safeInt(s.transform_events);
    const transformGenerated = safeInt(s.transform_generated);
    const groups: DevActivityGroup[] = [
      buildGroup('TestGen', safeInt(s.testgen_events), safeInt(s.testgen_generated), safeInt(s.testgen_accepted)),
      buildGroup('DocGen', safeInt(s.docgen_events), safeInt(s.docgen_generated), safeInt(s.docgen_accepted)),
      // Transform has no acceptance signal in by_user_analytic — every generated
      // line counts as accepted, so acceptanceRate is 100 when events > 0, else 0.
      {
        key: 'Transform',
        events: transformEvents,
        generated: transformGenerated,
        accepted: transformGenerated,
        acceptanceRate: transformEvents > 0 ? 100 : 0,
      },
      buildGroup('InlineChat', safeInt(s.inlinechat_events), safeInt(s.inlinechat_generated), safeInt(s.inlinechat_accepted)),
      buildGroup('CodeFix', safeInt(s.codefix_events), safeInt(s.codefix_generated), safeInt(s.codefix_accepted)),
    ];

    // Convert MM-DD-YYYY to YYYY-MM-DD and sort
    const trend = trendRows
      .map((row) => {
        // row.date is MM-DD-YYYY
        const parts = row.date.split('-');
        const isoDate =
          parts.length === 3 ? `${parts[2]}-${parts[0]}-${parts[1]}` : row.date;
        return {
          date: isoDate,
          TestGen: safeInt(row.testgen_events),
          DocGen: safeInt(row.docgen_events),
          Transform: safeInt(row.transform_events),
          InlineChat: safeInt(row.inlinechat_events),
          CodeFix: safeInt(row.codefix_events),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const rawIds = topUsersRows.map((row) => row.userid.replace(/^['"]|['"]$/g, ''));
    const detailMap = await resolveUserDetails(rawIds);

    const topUsers = topUsersRows.map((row) => {
      const userid = row.userid.replace(/^['"]|['"]$/g, '');
      const detail = detailMap.get(userid);
      return {
        userid,
        displayName: detail?.displayName || maskText(userid.substring(0, 8)),
        events: safeInt(row.total_events),
        acceptedLines: safeInt(row.accepted_lines),
      };
    });

    const data: DevActivityData = { groups, trend, topUsers };
    return NextResponse.json(data);
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[/api/dev-activity] table not yet provisioned — returning empty data');
      return NextResponse.json(emptyDevActivityData());
    }
    console.error('[/api/dev-activity] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch dev activity data' }, { status: 500 });
  }
}
