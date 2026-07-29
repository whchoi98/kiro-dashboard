import { NextRequest, NextResponse } from 'next/server';
import { executeQuery, safeFloat, safeInt, NORMALIZE_USERID, isMissingTableError } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';
import {
  RolloutData,
  RolloutClientSummary,
  RolloutTrendPoint,
  RolloutUserRow,
} from '@/types/dashboard';

// The per-user table is capped so a large org doesn't ship thousands of rows
// to the browser. The page renders `users.length / overlap.total` so the cap
// is visible rather than silent.
const USER_ROW_CAP = 100;

function emptyRolloutData(): RolloutData {
  return {
    clients: [],
    clientSummary: [],
    trend: [],
    overlap: { ideOnly: 0, cliOnly: 0, both: 0, total: 0 },
    users: [],
    dataStart: null,
    tiers: [],
    tierByClient: [],
  };
}

/** OpenCSVSerDe can leave literal quotes around values in some files. */
function clean(value: string | undefined): string {
  return (value ?? '').replace(/^['"]|['"]$/g, '');
}

/** Whole days between two YYYY-MM-DD dates; both are treated as UTC. */
function dayDiff(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

interface UserClientAgg {
  userid: string;
  clientType: string;
  firstSeen: string;
  lastSeen: string;
  messages: number;
  credits: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));

    const tableName = await resolveTableName();

    // user_report dates are YYYY-MM-DD strings — lexicographic compare works
    const dateFilter = `date >= DATE_FORMAT(DATE_ADD('day', -${days}, CURRENT_DATE), '%Y-%m-%d')`;

    const dailySql = `
      SELECT
        date,
        client_type,
        COUNT(DISTINCT ${NORMALIZE_USERID}) AS users
      FROM "${tableName}"
      WHERE ${dateFilter}
      GROUP BY date, client_type
      ORDER BY date
    `;

    // One row per (user, client): everything the overlap panel, the cumulative
    // adoption curve and the per-user table are derived from.
    const userClientSql = `
      SELECT
        ${NORMALIZE_USERID} AS userid,
        client_type,
        MIN(date) AS first_seen,
        MAX(date) AS last_seen,
        SUM(CAST(total_messages AS DOUBLE)) AS total_messages,
        SUM(CAST(credits_used AS DOUBLE)) AS total_credits
      FROM "${tableName}"
      WHERE ${dateFilter}
      GROUP BY ${NORMALIZE_USERID}, client_type
    `;

    const tierSql = `
      SELECT
        subscription_tier,
        client_type,
        COUNT(DISTINCT ${NORMALIZE_USERID}) AS users
      FROM "${tableName}"
      WHERE ${dateFilter}
      GROUP BY subscription_tier, client_type
    `;

    // Deliberately UNFILTERED: the "data begins" annotation must report when
    // the reports actually start, not where the selected window happens to
    // open. Hardcoding a date here would be wrong for any other account.
    const dataStartSql = `SELECT MIN(date) AS data_start FROM "${tableName}"`;

    const [dailyRows, userClientRows, tierRows, dataStartRows] = await Promise.all([
      executeQuery(dailySql),
      executeQuery(userClientSql),
      executeQuery(tierSql),
      executeQuery(dataStartSql),
    ]);

    const aggregates: UserClientAgg[] = userClientRows
      .map((row) => ({
        userid: clean(row.userid),
        clientType: clean(row.client_type) || 'UNKNOWN',
        firstSeen: clean(row.first_seen),
        lastSeen: clean(row.last_seen),
        messages: safeFloat(row.total_messages),
        credits: safeFloat(row.total_credits),
      }))
      .filter((agg) => agg.userid && agg.firstSeen);

    // ── clients: whatever is actually in the window. PLUGIN is defined by the
    // official docs but has never appeared in this account, so the set is
    // never hardcoded and consumers must tolerate a missing series.
    const clients = Array.from(new Set(aggregates.map((agg) => agg.clientType))).sort();

    // ── trend: daily distinct actives, plus the cumulative "ever used" curve
    const dailyByDate = new Map<string, Record<string, number>>();
    for (const row of dailyRows) {
      const date = clean(row.date);
      if (!date) continue;
      const clientType = clean(row.client_type) || 'UNKNOWN';
      const bucket = dailyByDate.get(date) ?? {};
      bucket[clientType] = (bucket[clientType] ?? 0) + safeInt(row.users);
      dailyByDate.set(date, bucket);
    }
    const dateAxis = Array.from(dailyByDate.keys()).sort();

    // firstSeen of a (user, client) is by definition a date that client was
    // active on, so every adoption event lands on the axis above.
    const adoptionsByDate = new Map<string, Record<string, number>>();
    for (const agg of aggregates) {
      const bucket = adoptionsByDate.get(agg.firstSeen) ?? {};
      bucket[agg.clientType] = (bucket[agg.clientType] ?? 0) + 1;
      adoptionsByDate.set(agg.firstSeen, bucket);
    }

    const running: Record<string, number> = {};
    for (const client of clients) running[client] = 0;
    const trend: RolloutTrendPoint[] = dateAxis.map((date) => {
      const adopted = adoptionsByDate.get(date) ?? {};
      for (const [client, count] of Object.entries(adopted)) {
        running[client] = (running[client] ?? 0) + count;
      }
      const daily: Record<string, number> = {};
      const cumulative: Record<string, number> = {};
      const dayCounts = dailyByDate.get(date) ?? {};
      for (const client of clients) {
        daily[client] = dayCounts[client] ?? 0;
        cumulative[client] = running[client] ?? 0;
      }
      return { date, daily, cumulative };
    });

    // ── clientSummary
    const activeDaysByClient = new Map<string, number>();
    for (const [, counts] of dailyByDate) {
      for (const [client, users] of Object.entries(counts)) {
        if (users > 0) activeDaysByClient.set(client, (activeDaysByClient.get(client) ?? 0) + 1);
      }
    }
    const clientSummary: RolloutClientSummary[] = clients.map((clientType) => {
      const rows = aggregates.filter((agg) => agg.clientType === clientType);
      return {
        clientType,
        users: new Set(rows.map((agg) => agg.userid)).size,
        activeDays: activeDaysByClient.get(clientType) ?? 0,
        totalMessages: rows.reduce((sum, agg) => sum + agg.messages, 0),
        totalCredits: rows.reduce((sum, agg) => sum + agg.credits, 0),
        firstSeen: rows.reduce((min, agg) => (!min || agg.firstSeen < min ? agg.firstSeen : min), ''),
        lastSeen: rows.reduce((max, agg) => (agg.lastSeen > max ? agg.lastSeen : max), ''),
      };
    });

    // ── per-user segmentation. Pickup lag is CENSORED at the window edge: a
    // user whose first activity is the window's first date may well have used
    // the other client earlier, we simply have no row to prove it.
    const windowStart = dateAxis[0] ?? '';
    const byUser = new Map<string, UserClientAgg[]>();
    for (const agg of aggregates) {
      const list = byUser.get(agg.userid) ?? [];
      list.push(agg);
      byUser.set(agg.userid, list);
    }

    const rawIds = Array.from(byUser.keys());
    const detailMap = await resolveUserDetails(rawIds);

    let ideOnly = 0;
    let cliOnly = 0;
    let both = 0;
    const allUsers: RolloutUserRow[] = [];

    for (const [userid, rows] of byUser) {
      const ordered = [...rows].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen));
      const userClients = ordered.map((agg) => agg.clientType);
      const hasIde = userClients.some((c) => c.includes('IDE'));
      const hasCli = userClients.some((c) => c.includes('CLI'));

      let segment: RolloutUserRow['segment'];
      if (hasIde && hasCli) {
        segment = 'both';
        both += 1;
      } else if (hasIde) {
        segment = 'ide-only';
        ideOnly += 1;
      } else {
        // CLI-only, and anything the docs add later that is neither IDE nor
        // CLI, lands here rather than being dropped from the total.
        segment = 'cli-only';
        cliOnly += 1;
      }

      const firstSeen = ordered[0].firstSeen;
      const second = ordered.find((agg) => agg.clientType !== ordered[0].clientType) ?? null;
      const censored = firstSeen === windowStart;

      allUsers.push({
        userid,
        displayName: detailMap.get(userid)?.displayName || maskText(userid.substring(0, 8)),
        clients: Array.from(new Set(userClients)),
        segment,
        firstSeen,
        lastSeen: ordered.reduce((max, agg) => (agg.lastSeen > max ? agg.lastSeen : max), ''),
        firstClient: ordered[0].clientType,
        secondClient: second?.clientType ?? null,
        pickupLagDays: second && !censored ? dayDiff(firstSeen, second.firstSeen) : null,
        totalMessages: ordered.reduce((sum, agg) => sum + agg.messages, 0),
        totalCredits: ordered.reduce((sum, agg) => sum + agg.credits, 0),
      });
    }

    allUsers.sort((a, b) => b.totalMessages - a.totalMessages);

    // ── tier × client. Cardinality 1 (this account is 100% POWER) makes the
    // matrix meaningless, so it stays empty and the page says so instead of
    // rendering a one-row "comparison".
    const tiers = Array.from(
      new Set(tierRows.map((row) => clean(row.subscription_tier) || 'UNKNOWN'))
    ).sort();

    const tierByClient =
      tiers.length > 1
        ? tiers.map((tier) => {
            const counts: Record<string, number> = {};
            for (const client of clients) counts[client] = 0;
            for (const row of tierRows) {
              if ((clean(row.subscription_tier) || 'UNKNOWN') !== tier) continue;
              const client = clean(row.client_type) || 'UNKNOWN';
              counts[client] = (counts[client] ?? 0) + safeInt(row.users);
            }
            return { tier, counts };
          })
        : [];

    const data: RolloutData = {
      clients,
      clientSummary,
      trend,
      overlap: { ideOnly, cliOnly, both, total: byUser.size },
      users: allUsers.slice(0, USER_ROW_CAP),
      dataStart: clean(dataStartRows[0]?.data_start) || null,
      tiers,
      tierByClient,
    };
    return NextResponse.json(data);
  } catch (err) {
    if (isMissingTableError(err)) {
      console.warn('[/api/rollout] table not yet provisioned — returning empty rollout');
      return NextResponse.json(emptyRolloutData());
    }
    console.error('[/api/rollout] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch client rollout' }, { status: 500 });
  }
}
