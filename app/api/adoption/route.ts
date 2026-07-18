import { NextRequest, NextResponse } from 'next/server';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';
import { isUarConfigured, listReportFiles, readCsvFromS3, parseCsv } from '@/lib/uar-s3';
import { AdoptionData, AdoptionTrendPoint, NewUserRow } from '@/types/dashboard';

// The response depends on the live contents of the Kiro UAR S3 prefix, which
// grows daily. Next.js 14's default for GET route handlers caches forever
// (including the empty payload from the guard below). Force every request to
// run the handler so operators don't see stale "no new users" data.
export const dynamic = 'force-dynamic';

const USERID_PREFIX_RE = /^d-[a-z0-9]+\./;

// The user_report Glue table does NOT expose the new_user CSV column, and
// OpenCSVSerDe's positional mapping makes it unsafe to add (the column
// appears in different positions — or not at all — across files). This route
// therefore reads the UAR CSVs from S3 directly, like /api/model-usage, and
// finds new_user by HEADER NAME. Older CSVs without the header simply yield
// `undefined` for row['new_user'], so they contribute to active-user counts
// but never to new-user counts — no special-casing needed.

const EMPTY: AdoptionData = {
  trend: [],
  totals: { newUsers: 0, activeUsers: 0 },
  recentNewUsers: [],
};

export async function GET(req: NextRequest) {
  try {
    if (!isUarConfigured()) {
      // Fresh account that hasn't wired ATHENA_OUTPUT_BUCKET + S3_REPORT_PREFIX
      // yet. Return a well-shaped empty payload so the /adoption page renders
      // as an empty dashboard rather than crashing with S3/SDK errors.
      console.warn('[/api/adoption] bucket or prefix not configured — returning empty data');
      return NextResponse.json(EMPTY);
    }

    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90'))), 180);

    const files = await listReportFiles(days);
    if (files.length === 0) {
      return NextResponse.json(EMPTY);
    }

    // Per date: distinct actives and distinct new users.
    const activeByDate = new Map<string, Set<string>>();
    const newByDate = new Map<string, Set<string>>();
    // Per user: aggregates across the whole window.
    const newUserFirstDate = new Map<string, string>();
    const newUserClientType = new Map<string, string>();
    const userMessages = new Map<string, number>();
    const userCredits = new Map<string, number>();
    const allUsers = new Set<string>();

    const csvTexts = await Promise.all(files.map(readCsvFromS3));
    for (const text of csvTexts) {
      for (const row of parseCsv(text)) {
        const userid = row.userid.replace(USERID_PREFIX_RE, '');
        const date = row.date;
        if (!userid || !date) continue;

        allUsers.add(userid);
        if (!activeByDate.has(date)) activeByDate.set(date, new Set());
        activeByDate.get(date)!.add(userid);

        userMessages.set(userid, (userMessages.get(userid) ?? 0) + (parseInt(row.total_messages || '0', 10) || 0));
        userCredits.set(userid, (userCredits.get(userid) ?? 0) + (parseFloat(row.credits_used || '0') || 0));

        // Header-name lookup: files without a new_user header yield undefined.
        if ((row.new_user ?? '').toLowerCase() === 'true') {
          if (!newByDate.has(date)) newByDate.set(date, new Set());
          newByDate.get(date)!.add(userid);

          const first = newUserFirstDate.get(userid);
          if (!first || date < first) {
            // user_report dates are YYYY-MM-DD, so string compare is safe.
            newUserFirstDate.set(userid, date);
            newUserClientType.set(userid, row.client_type || '');
          }
        }
      }
    }

    // Trend, date ascending, with a running distinct-user count over the window.
    const dates = [...activeByDate.keys()].sort((a, b) => a.localeCompare(b));
    const seen = new Set<string>();
    const trend: AdoptionTrendPoint[] = dates.map((date) => {
      const actives = activeByDate.get(date)!;
      for (const u of actives) seen.add(u);
      return {
        date,
        newUsers: newByDate.get(date)?.size ?? 0,
        activeUsers: actives.size,
        cumulativeUsers: seen.size,
      };
    });

    const newUserIds = [...newUserFirstDate.keys()];
    const detailMap = newUserIds.length > 0 ? await resolveUserDetails(newUserIds) : new Map();

    const recentNewUsers: NewUserRow[] = newUserIds
      .map((userid) => {
        const detail = detailMap.get(userid);
        return {
          userid,
          displayName: detail?.displayName || maskText(userid.substring(0, 8)),
          firstDate: newUserFirstDate.get(userid)!,
          clientType: newUserClientType.get(userid) ?? '',
          totalMessages: userMessages.get(userid) ?? 0,
          totalCredits: userCredits.get(userid) ?? 0,
        };
      })
      .sort((a, b) => b.firstDate.localeCompare(a.firstDate))
      .slice(0, 15);

    return NextResponse.json({
      trend,
      totals: { newUsers: newUserIds.length, activeUsers: allUsers.size },
      recentNewUsers,
    } satisfies AdoptionData);
  } catch (err) {
    console.error('[/api/adoption] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch adoption data' }, { status: 500 });
  }
}
