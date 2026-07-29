import { NextRequest, NextResponse } from 'next/server';
import {
  isUarConfigured,
  listReportFiles,
  readCsvFromS3,
  parseCsv,
  isModelColumn,
  prettifyModelName,
  normalizeUserId,
  clientTypeFromKey,
} from '@/lib/uar-s3';
import type { UserModelUsageData, UserModelSlice } from '@/types/dashboard';

// Same reasoning as /api/model-usage: the payload depends on the live contents
// of the S3 prefix, and Next.js 14 would otherwise cache the first response
// (including an empty one from the guard below) for the container's lifetime.
export const dynamic = 'force-dynamic';

const USERID_RE = /^[a-f0-9-]{36}$/;

const EMPTY: UserModelUsageData = {
  userid: '',
  models: [],
  trend: [],
  clients: [],
  totalMessages: 0,
  distinctModels: 0,
  primaryModel: null,
  configured: false,
  daysWithModelColumns: 0,
};

/**
 * Per-user model message breakdown.
 *
 * Read S3-direct rather than through Athena: the `{model}_messages` columns are
 * dynamic and appear at different positions across files, which OpenCSVSerDe's
 * positional mapping cannot handle (ADR-0004). This mirrors /api/model-usage
 * but filters to one user, and stays a SEPARATE route from /api/user-detail so
 * an S3 problem degrades only this card instead of the whole detail panel.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userid = searchParams.get('userid') ?? '';
    const days = Math.min(Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90'))), 180);

    if (!USERID_RE.test(userid)) {
      return NextResponse.json({ error: 'Invalid userid format' }, { status: 400 });
    }

    if (!isUarConfigured()) {
      // Fresh account that hasn't wired the UAR bucket/prefix. `configured:
      // false` lets the UI say "not configured" instead of "no model usage",
      // which are different facts.
      return NextResponse.json({ ...EMPTY, userid } satisfies UserModelUsageData);
    }

    const files = await listReportFiles(days);
    if (files.length === 0) {
      return NextResponse.json({ ...EMPTY, userid, configured: true } satisfies UserModelUsageData);
    }

    const modelTotals = new Map<string, number>();
    // date → model → count, for the per-day stacked trend.
    const dateTotals = new Map<string, Map<string, number>>();
    const clientTotals = new Map<string, number>();
    // Older CSVs predate the model columns entirely. Counting the days that
    // DID carry them is what separates "this user used no models" from "the
    // reports never reported models" — otherwise both render as zero.
    const datesWithModelColumns = new Set<string>();

    const csvTexts = await Promise.all(
      files.map(async (key) => ({ key, text: await readCsvFromS3(key) }))
    );

    for (const { key, text } of csvTexts) {
      const rows = parseCsv(text);
      if (rows.length === 0) continue;

      const modelCols = Object.keys(rows[0]).filter(isModelColumn);
      if (modelCols.length === 0) continue;

      // The client type comes from the FILE NAME, not a column: Kiro splits
      // one CSV per client type and `user_report` rows carry client_type, but
      // the S3-direct path keys off the name (see clientTypeFromKey).
      const clientType = clientTypeFromKey(key);

      for (const row of rows) {
        if (normalizeUserId(row.userid) !== userid) continue;
        const date = row.date;
        datesWithModelColumns.add(date);

        for (const col of modelCols) {
          const count = parseInt(row[col] || '0', 10);
          if (!Number.isFinite(count) || count <= 0) continue;

          const model = prettifyModelName(col);
          modelTotals.set(model, (modelTotals.get(model) ?? 0) + count);

          if (!dateTotals.has(date)) dateTotals.set(date, new Map());
          const dm = dateTotals.get(date)!;
          dm.set(model, (dm.get(model) ?? 0) + count);

          if (clientType) {
            clientTotals.set(clientType, (clientTotals.get(clientType) ?? 0) + count);
          }
        }
      }
    }

    const totalMessages = [...modelTotals.values()].reduce((a, b) => a + b, 0);

    const models: UserModelSlice[] = [...modelTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([model, messages]) => ({
        model,
        messages,
        // Guarded: a user with model columns present but all zeros would
        // otherwise divide by zero and report NaN percentages.
        percentage: totalMessages > 0 ? (messages / totalMessages) * 100 : 0,
      }));

    const trend = [...dateTotals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, byModel]) => {
        const point: UserModelUsageData['trend'][number] = { date };
        for (const [model, count] of byModel) point[model] = count;
        return point;
      });

    const clients = [...clientTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([clientType, messages]) => ({ clientType, messages }));

    return NextResponse.json({
      userid,
      models,
      trend,
      clients,
      totalMessages,
      distinctModels: models.length,
      primaryModel: models[0]?.model ?? null,
      configured: true,
      daysWithModelColumns: datesWithModelColumns.size,
    } satisfies UserModelUsageData);
  } catch (err) {
    console.error('[/api/user-model-usage] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch user model usage' }, { status: 500 });
  }
}
