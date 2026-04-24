import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { resolveUserDetails } from '@/lib/identity';
import { maskText } from '@/lib/mask';
import { ModelUsageData, ModelDistribution, ModelTrendPoint, ModelUserPreference } from '@/types/dashboard';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

const BUCKET = (process.env.ATHENA_OUTPUT_BUCKET || '').replace('s3://', '').split('/')[0];
const REPORT_PREFIX = process.env.S3_REPORT_PREFIX
  || 'q-user-log/AWSLogs/120443221648/KiroLogs/user_report/us-east-1/';
const USERID_PREFIX_RE = /^d-[a-z0-9]+\./;

function prettifyModelName(col: string): string {
  return col
    .replace(/_messages$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(\d+) (\d+)/g, '$1.$2');
}

function isModelColumn(col: string): boolean {
  return col.endsWith('_messages') && col !== 'total_messages';
}

interface CsvRow {
  date: string;
  userid: string;
  [key: string]: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row as CsvRow;
  });
}

async function listReportFiles(days: number): Promise<string[]> {
  const keys: string[] = [];
  const now = new Date();

  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const prefix = `${REPORT_PREFIX}${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/`;

    const resp = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
    for (const obj of resp.Contents ?? []) {
      if (obj.Key?.endsWith('.csv')) keys.push(obj.Key);
    }
  }
  return keys;
}

async function readCsvFromS3(key: string): Promise<string> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return resp.Body?.transformToString() ?? '';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90'))), 180);

    const files = await listReportFiles(days);
    if (files.length === 0) {
      return NextResponse.json({
        distribution: [], trend: [], userPreferences: [], availableModels: [],
      } satisfies ModelUsageData);
    }

    const modelTotals = new Map<string, number>();
    const dateTotals = new Map<string, Map<string, number>>();
    const userTotals = new Map<string, Map<string, number>>();
    const allModels = new Set<string>();

    const csvTexts = await Promise.all(files.map(readCsvFromS3));
    for (const text of csvTexts) {
      const rows = parseCsv(text);
      if (rows.length === 0) continue;

      const headers = Object.keys(rows[0]);
      const modelCols = headers.filter(isModelColumn);
      modelCols.forEach((c) => allModels.add(c));

      for (const row of rows) {
        const userid = row.userid.replace(USERID_PREFIX_RE, '');
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

    const grandTotal = [...modelTotals.values()].reduce((a, b) => a + b, 0);
    const distribution: ModelDistribution[] = [...modelTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([col, msgs]) => ({
        model: prettifyModelName(col),
        messages: msgs,
        percentage: grandTotal > 0 ? (msgs / grandTotal) * 100 : 0,
      }));

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
    } satisfies ModelUsageData);
  } catch (err) {
    console.error('[/api/model-usage] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch model usage data' }, { status: 500 });
  }
}
