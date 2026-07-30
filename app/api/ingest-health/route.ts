import { NextRequest, NextResponse } from 'next/server';
import { executeQueryUncached, safeInt, isMissingTableError } from '@/lib/athena';
import { resolveTableName } from '@/lib/glue';
import { isoDateLiteral, buaDateLiteral } from '@/lib/athena-window';
import {
  isUarConfigured,
  listReportObjects,
  readCsvFromS3,
  parseCsvHeaders,
  countCsvRows,
  reportDateFromKey,
  clientTypeFromKey,
} from '@/lib/uar-s3';
import {
  IngestHealthData,
  IngestFile,
  IngestDayCell,
  HeaderVariant,
} from '@/types/dashboard';

// Same reasoning as /api/model-usage: the answer is "what is in S3 right
// now", so Next.js 14's default forever-cache on GET handlers would freeze a
// freshness monitor at whatever it saw first — the one thing it must never do.
//
// The same reasoning bans the in-process Athena memo in `executeQuery`, which
// is why every query below calls `executeQueryUncached` instead. A 60s-stale
// row count is harmless on a dashboard but meaningless on the page whose entire
// job is answering "did today's report actually land?". Pinned by
// tests/lib/query-cache.test.ts.
export const dynamic = 'force-dynamic';

// The legacy metric columns whose instrumentation is worth reporting. 39 of
// by_user_analytic's 44 metric columns are the literal string '0' in every
// row in this account, so this strip exists to make that visible instead of
// letting a future feature ship a page of zeros. See
// docs/kiro-user-activity-report-schema.md §B-0.
const LEGACY_COLUMNS = [
  'chat_aicodelines',
  'chat_messagesinteracted',
  'chat_messagessent',
  'inline_suggestionscount',
  'inline_acceptancecount',
  'inline_aicodelines',
  'inlinechat_totaleventcount',
  'dev_generatedlines',
  'dev_acceptanceeventcount',
  'codefix_generatedlines',
  'codereview_findingscount',
  'codereview_succeededeventcount',
  'codereview_failedeventcount',
  'testgeneration_generatedlines',
  'docgeneration_acceptedlineadditions',
  'transformation_linesgenerated',
] as const;

// Reading every CSV body is the expensive part (one GET each, cross-region).
// The cap keeps a 180-day window bounded; anything dropped is surfaced in the
// response rather than silently omitted.
const FILE_READ_CAP = 400;

function emptyIngestHealth(configured: boolean): IngestHealthData {
  return {
    configured,
    freshness: {
      latestReportDate: null,
      latestDeliveredAt: null,
      reportLagDays: null,
      totalFiles: 0,
      totalRows: 0,
      totalBytes: 0,
    },
    clients: [],
    dates: [],
    matrix: [],
    files: [],
    headerVariants: [],
    parity: { athenaRows: null, csvRows: 0, deltaRows: null },
    legacyInstrumentation: { available: false, columns: [], totalRows: 0 },
    config: {
      bucketConfigured: Boolean(process.env.S3_DATA_BUCKET || process.env.ATHENA_OUTPUT_BUCKET),
      prefixConfigured: Boolean(process.env.S3_REPORT_PREFIX),
      glueTable: process.env.GLUE_TABLE_NAME ?? null,
      athenaDatabase: process.env.ATHENA_DATABASE ?? null,
    },
  };
}

/** Whole days from a YYYY-MM-DD report date to today, both as UTC. */
function lagInDays(reportDate: string): number | null {
  const then = Date.parse(`${reportDate}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((todayUtc - then) / 86_400_000));
}

/** Athena row count + legacy instrumentation, or nulls if the tables are absent. */
async function readAthenaSide(days: number) {
// Literal window floors, resolved here rather than by Athena's CURRENT_DATE:
// result reuse matches on the query string, so an engine-resolved window can
// never be reused. `by_user_analytic` is MM-DD-YYYY and read through
// DATE_PARSE, which yields a timestamp — so that side needs a DATE literal,
// not a quoted string. See lib/athena-window.ts.
const now = Date.now();
const isoFloor = isoDateLiteral(days, now);
const buaFloor = buaDateLiteral(days, now);
  const result: {
    athenaRows: number | null;
    legacyAvailable: boolean;
    legacyColumns: Array<{ column: string; nonZeroRows: number }>;
    legacyTotalRows: number;
  } = { athenaRows: null, legacyAvailable: false, legacyColumns: [], legacyTotalRows: 0 };

  try {
    const tableName = await resolveTableName();
    const rows = await executeQueryUncached(`
      SELECT COUNT(*) AS row_count
      FROM "${tableName}"
      WHERE date >= ${isoFloor}
    `);
    result.athenaRows = safeInt(rows[0]?.row_count);
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
    console.warn('[/api/ingest-health] user_report not queryable — parity check skipped');
  }

  // by_user_analytic dates are MM-DD-YYYY, so the window is filtered on the
  // parsed date rather than a string compare.
  const countExprs = LEGACY_COLUMNS.map(
    (col) => `SUM(CASE WHEN TRY_CAST(${col} AS BIGINT) > 0 THEN 1 ELSE 0 END) AS ${col}`
  ).join(',\n        ');

  try {
    const rows = await executeQueryUncached(`
      SELECT
        COUNT(*) AS total_rows,
        ${countExprs}
      FROM by_user_analytic
      WHERE DATE_PARSE(date, '%m-%d-%Y') >= ${buaFloor}
    `);
    const row = rows[0] ?? {};
    result.legacyAvailable = true;
    result.legacyTotalRows = safeInt(row.total_rows);
    result.legacyColumns = LEGACY_COLUMNS.map((col) => ({
      column: col,
      nonZeroRows: safeInt(row[col]),
    }));
  } catch (err) {
    if (!isMissingTableError(err)) throw err;
    console.warn('[/api/ingest-health] by_user_analytic not queryable — instrumentation skipped');
  }

  return result;
}

export async function GET(req: NextRequest) {
  try {
    if (!isUarConfigured()) {
      console.warn('[/api/ingest-health] bucket or prefix not configured — returning empty payload');
      return NextResponse.json(emptyIngestHealth(false));
    }

    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90'))), 180);

    const [objects, athenaSide] = await Promise.all([listReportObjects(days), readAthenaSide(days)]);

    if (objects.length === 0) {
      const empty = emptyIngestHealth(true);
      empty.parity.athenaRows = athenaSide.athenaRows;
      empty.legacyInstrumentation = {
        available: athenaSide.legacyAvailable,
        columns: athenaSide.legacyColumns,
        totalRows: athenaSide.legacyTotalRows,
      };
      return NextResponse.json(empty);
    }

    // Newest first: if the read cap bites, it drops the OLDEST files, keeping
    // the freshness end of the window — the part an operator is looking at.
    const sorted = [...objects].sort((a, b) => b.key.localeCompare(a.key));
    const toRead = sorted.slice(0, FILE_READ_CAP);
    if (sorted.length > toRead.length) {
      console.warn(
        `[/api/ingest-health] ${sorted.length - toRead.length} of ${sorted.length} files beyond the read cap — row/header detail omitted for those`
      );
    }

    const bodies = await Promise.all(toRead.map((obj) => readCsvFromS3(obj.key)));

    const files: IngestFile[] = toRead.map((obj, index) => {
      const text = bodies[index];
      const headers = parseCsvHeaders(text);
      return {
        key: obj.key,
        reportDate: reportDateFromKey(obj.key),
        clientType: clientTypeFromKey(obj.key) || 'UNKNOWN',
        sizeBytes: obj.size,
        deliveredAt: obj.lastModified,
        rowCount: countCsvRows(text),
        headerCount: headers.length,
      };
    });

    const clients = Array.from(new Set(files.map((f) => f.clientType))).sort();
    const dates = Array.from(new Set(files.map((f) => f.reportDate).filter(Boolean))).sort();

    // ── matrix: every (date, client) pair, delivered or not. A `false` cell
    // is NOT a failure — Kiro writes no file for a client nobody used that
    // day, and there is no "expected file count" signal anywhere in the
    // report contract to distinguish the two cases.
    const cellIndex = new Map<string, IngestDayCell>();
    for (const date of dates) {
      for (const clientType of clients) {
        cellIndex.set(`${date}|${clientType}`, {
          date,
          clientType,
          delivered: false,
          files: 0,
          rows: 0,
          bytes: 0,
        });
      }
    }
    for (const file of files) {
      const cell = cellIndex.get(`${file.reportDate}|${file.clientType}`);
      if (!cell) continue;
      cell.delivered = true;
      cell.files += 1;
      cell.rows += file.rowCount;
      cell.bytes += file.sizeBytes;
    }
    const matrix = Array.from(cellIndex.values());

    // ── header drift: group files by their exact header set
    const variantMap = new Map<string, HeaderVariant>();
    for (let i = 0; i < toRead.length; i += 1) {
      const headers = parseCsvHeaders(bodies[i]);
      if (headers.length === 0) continue;
      const signature = headers.join(',');
      const reportDate = files[i].reportDate;
      const existing = variantMap.get(signature);
      if (existing) {
        existing.files += 1;
        if (reportDate && reportDate < existing.firstDate) existing.firstDate = reportDate;
        if (reportDate > existing.lastDate) existing.lastDate = reportDate;
      } else {
        variantMap.set(signature, {
          headers,
          files: 1,
          firstDate: reportDate,
          lastDate: reportDate,
        });
      }
    }
    const headerVariants = Array.from(variantMap.values()).sort((a, b) =>
      b.lastDate.localeCompare(a.lastDate)
    );

    // ── freshness. `latestDeliveredAt` is the S3 object write time; the UI
    // must label it as such and never as the 02:00 UTC generation target.
    const latestReportDate = dates.length ? dates[dates.length - 1] : null;
    const deliveredTimes = objects
      .map((obj) => obj.lastModified)
      .filter((value): value is string => Boolean(value))
      .sort();

    const csvRows = files.reduce((sum, file) => sum + file.rowCount, 0);
    const freshness = {
      latestReportDate,
      latestDeliveredAt: deliveredTimes.length ? deliveredTimes[deliveredTimes.length - 1] : null,
      reportLagDays: latestReportDate ? lagInDays(latestReportDate) : null,
      // Counted over the FULL listing, not the read cap — an operator asking
      // "how many files are there" wants the real number.
      totalFiles: objects.length,
      totalRows: csvRows,
      totalBytes: objects.reduce((sum, obj) => sum + obj.size, 0),
    };

    const data: IngestHealthData = {
      configured: true,
      freshness,
      clients,
      dates,
      matrix,
      files: files.sort((a, b) => b.key.localeCompare(a.key)),
      headerVariants,
      parity: {
        athenaRows: athenaSide.athenaRows,
        csvRows,
        // Only meaningful when every file in the window was actually read.
        deltaRows:
          athenaSide.athenaRows !== null && sorted.length === toRead.length
            ? athenaSide.athenaRows - csvRows
            : null,
      },
      legacyInstrumentation: {
        available: athenaSide.legacyAvailable,
        columns: athenaSide.legacyColumns,
        totalRows: athenaSide.legacyTotalRows,
      },
      config: {
        bucketConfigured: Boolean(process.env.S3_DATA_BUCKET || process.env.ATHENA_OUTPUT_BUCKET),
        prefixConfigured: Boolean(process.env.S3_REPORT_PREFIX),
        glueTable: process.env.GLUE_TABLE_NAME ?? null,
        athenaDatabase: process.env.ATHENA_DATABASE ?? null,
      },
    };
    return NextResponse.json(data);
  } catch (err) {
    console.error('[/api/ingest-health] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch ingest health' }, { status: 500 });
  }
}
