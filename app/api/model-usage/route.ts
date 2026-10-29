import { NextRequest, NextResponse } from 'next/server';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';
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
import {
  clientModelMix,
  modelAdoption,
  modelDistribution,
  vendorShares,
  type ReportFile,
} from '@/lib/model-insights';
import { ModelUsageData, ModelTrendPoint, ModelUserPreference } from '@/types/dashboard';

const EMPTY: ModelUsageData = {
  distribution: [], trend: [], userPreferences: [], availableModels: [],
  vendors: [], byClient: [], adoption: [],
};

// The response depends on the live contents of the Kiro UAR S3 prefix, which
// grows daily. Next.js 14's default for GET route handlers caches forever
// (and caches the first response even if it's an empty payload returned
// from the guard below). Force every request to run the handler so
// operators don't see a "model-usage is empty" from a stale cache.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    if (!isUarConfigured()) {
      // Fresh account that hasn't wired ATHENA_OUTPUT_BUCKET + S3_REPORT_PREFIX
      // yet. Return a well-shaped empty payload so the /model-usage page renders
      // as an empty table rather than crashing with S3/SDK errors.
      console.warn('[/api/model-usage] bucket or prefix not configured — returning empty data');
      return NextResponse.json(EMPTY);
    }

    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90'))), 180);

    const files = await listReportFiles(days);
    if (files.length === 0) {
      return NextResponse.json(EMPTY);
    }

    const modelTotals = new Map<string, number>();
    const dateTotals = new Map<string, Map<string, number>>();
    const userTotals = new Map<string, Map<string, number>>();
    const allModels = new Set<string>();

    const csvTexts = await Promise.all(files.map(readCsvFromS3));
    // Kiro writes one CSV per client per day; the filename is the only client
    // signal on this path, so rows stay grouped by the file they came from.
    const reportFiles: ReportFile[] = csvTexts.map((text, i) => ({
      clientType: clientTypeFromKey(files[i]),
      rows: parseCsv(text),
    }));
    for (const { rows } of reportFiles) {
      if (rows.length === 0) continue;

      const headers = Object.keys(rows[0]);
      const modelCols = headers.filter(isModelColumn);
      modelCols.forEach((c) => allModels.add(c));

      for (const row of rows) {
        const userid = normalizeUserId(row.userid);
        const date = row.date;

        for (const col of modelCols) {
          const count = parseInt(row[col] || '0', 10);
          if (count <= 0) continue;

          modelTotals.set(col, (modelTotals.get(col) ?? 0) + count);

          if (!dateTotals.has(date)) dateTotals.set(date, new Map());
          const dm = dateTotals.get(date)!;
          dm.set(col, (dm.get(col) ?? 0) + count);

          if (!userTotals.has(userid)) userTotals.set(userid, new Map());
          const um = userTotals.get(userid)!;
          um.set(col, (um.get(col) ?? 0) + count);
        }
      }
    }

    const distribution = modelDistribution(modelTotals);

    const trend: ModelTrendPoint[] = [...dateTotals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, models]) => {
        const point: ModelTrendPoint = { date };
        for (const [col, count] of models) {
          point[prettifyModelName(col)] = count;
        }
        return point;
      });

    const userIds = [...userTotals.keys()];
    const detailMap = userIds.length > 0 ? await resolveUserDetails(userIds) : new Map();

    const userPreferences: ModelUserPreference[] = [...userTotals.entries()]
      .map(([userid, models]) => {
        const detail = detailMap.get(userid);
        const modelsObj: Record<string, number> = {};
        let total = 0;
        let maxCount = 0;
        let primary = '';
        for (const [col, count] of models) {
          const name = prettifyModelName(col);
          modelsObj[name] = count;
          total += count;
          if (count > maxCount) { maxCount = count; primary = name; }
        }
        return {
          userid,
          displayName: detail?.displayName || maskText(userid.substring(0, 8)),
          models: modelsObj,
          totalMessages: total,
          primaryModel: primary,
        };
      })
      .sort((a, b) => b.totalMessages - a.totalMessages)
      .slice(0, 15);

    const availableModels = [...allModels].map(prettifyModelName).sort();

    return NextResponse.json({
      distribution, trend, userPreferences, availableModels,
      vendors: vendorShares(modelTotals),
      byClient: clientModelMix(reportFiles),
      adoption: modelAdoption(reportFiles),
    } satisfies ModelUsageData);
  } catch (err) {
    console.error('[/api/model-usage] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch model usage data' }, { status: 500 });
  }
}
