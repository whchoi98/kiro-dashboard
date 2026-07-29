import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

/**
 * Shared S3-direct access to the Kiro UAR (user activity report) CSVs.
 *
 * Some UAR CSV columns (dynamic `{Model_name}_Messages`, `new_user`) cannot be
 * queried safely through Glue/Athena — OpenCSVSerDe maps columns positionally,
 * but these columns appear in different positions (or not at all) across
 * files. Routes that need them read the CSVs from S3 directly and match
 * columns by HEADER NAME via `parseCsv`.
 *
 * BUCKET/REPORT_PREFIX are resolved lazily (process.env is read at call time,
 * not module load) so callers always see the current environment.
 */

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

// The UAR CSVs live in the data bucket, which in two-bucket deployments
// differs from the Athena results bucket carried by ATHENA_OUTPUT_BUCKET.
// Prefer the explicit S3_DATA_BUCKET (set by EcsStack when configured) and
// fall back to the results bucket for single-bucket setups.
function getBucket(): string {
  return (
    process.env.S3_DATA_BUCKET ||
    (process.env.ATHENA_OUTPUT_BUCKET || '').replace('s3://', '').split('/')[0]
  );
}

// Must come from env — hardcoding the maintainer prefix here would cause
// fresh accounts to issue S3 List/Get against a bucket they don't own.
function getReportPrefix(): string {
  return process.env.S3_REPORT_PREFIX || '';
}

/**
 * True when the env carries enough to reach the UAR CSVs. Fresh accounts
 * that haven't wired ATHENA_OUTPUT_BUCKET + S3_REPORT_PREFIX yet get `false`;
 * routes should then return a well-shaped empty payload rather than crash
 * with S3/SDK errors.
 */
export function isUarConfigured(): boolean {
  return Boolean(getBucket() && getReportPrefix());
}

export interface CsvRow {
  date: string;
  userid: string;
  [key: string]: string;
}

export function parseCsv(text: string): CsvRow[] {
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

/** Header names only (lowercased), for schema/header-drift inspection. */
export function parseCsvHeaders(text: string): string[] {
  const [first] = text.trim().split('\n');
  if (!first) return [];
  return first.split(',').map((h) => h.trim().toLowerCase());
}

/** Data row count excluding the header line. */
export function countCsvRows(text: string): number {
  const lines = text.trim().split('\n');
  return lines.length < 2 ? 0 : lines.length - 1;
}

/**
 * `…/<prefix>/YYYY/MM/DD/00/KIRO_CLI_<account>_user_report_<ts>.csv`
 * → `2026-07-28`. Returns '' when the key doesn't carry the env prefix or
 * the date path isn't where it should be (never throws — a malformed key
 * must not take down a whole listing).
 */
export function reportDateFromKey(key: string): string {
  const prefix = getReportPrefix();
  if (!prefix || !key.startsWith(prefix)) return '';
  const datePath = key.slice(prefix.length, prefix.length + 10);
  return /^\d{4}\/\d{2}\/\d{2}$/.test(datePath) ? datePath.replace(/\//g, '-') : '';
}

/**
 * Client type from the filename prefix (`KIRO_CLI_…` → `KIRO_CLI`). The
 * legacy `by_user_analytic` files carry no client segment, and the official
 * docs also define PLUGIN, which this account has never produced — callers
 * must tolerate '' and must not assume the set of values is closed.
 */
export function clientTypeFromKey(key: string): string {
  const base = key.slice(key.lastIndexOf('/') + 1);
  const match = base.match(/^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*?)_\d+_user_report_/);
  return match ? match[1] : '';
}

function fmtDatePath(d: Date): string {
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * One UAR CSV object with the delivery metadata S3 already returns. Only
 * `key` is needed to read a report, but `size`/`lastModified` are what an
 * ingest-freshness view is built from — `lastModified` is the OBJECT WRITE
 * time (when Kiro delivered the file), which is not the same thing as the
 * activity date encoded in the key path.
 */
export interface ReportObject {
  key: string;
  size: number;
  lastModified: string | null;
}

async function listAllObjects(prefix: string): Promise<ReportObject[]> {
  const objects: ReportObject[] = [];
  let token: string | undefined;
  do {
    const resp = await s3.send(
      new ListObjectsV2Command({ Bucket: getBucket(), Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of resp.Contents ?? []) {
      if (!obj.Key?.endsWith('.csv')) continue;
      objects.push({
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null,
      });
    }
    token = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (token);
  return objects;
}

/**
 * Month-prefix parallel listing of every UAR CSV whose date path falls in
 * the last `days` days. The container runs in ap-northeast-2 but the bucket
 * lives in AWS_REGION (us-east-1), so every S3 round trip costs ~200ms:
 * list one MONTH prefix at a time (≤7 calls at the 180-day cap) in parallel
 * instead of one sequential call per day — the per-day loop cost ~20s for
 * days=90.
 */
export async function listReportObjects(days: number): Promise<ReportObject[]> {
  const REPORT_PREFIX = getReportPrefix();
  const now = new Date();
  const oldest = new Date(now);
  oldest.setDate(oldest.getDate() - (days - 1));

  const monthPrefixes: string[] = [];
  const cursor = new Date(oldest.getFullYear(), oldest.getMonth(), 1);
  while (cursor <= now) {
    monthPrefixes.push(
      `${REPORT_PREFIX}${cursor.getFullYear()}/${String(cursor.getMonth() + 1).padStart(2, '0')}/`
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const minDate = fmtDatePath(oldest);
  const maxDate = fmtDatePath(now);
  const monthObjects = await Promise.all(monthPrefixes.map(listAllObjects));
  return monthObjects.flat().filter((obj) => {
    // Keys are `${REPORT_PREFIX}YYYY/MM/DD/...`; zero-padded date paths
    // compare correctly as strings.
    const datePath = obj.key.slice(REPORT_PREFIX.length, REPORT_PREFIX.length + 10);
    return datePath >= minDate && datePath <= maxDate;
  });
}

export async function listReportFiles(days: number): Promise<string[]> {
  return (await listReportObjects(days)).map((obj) => obj.key);
}

export async function readCsvFromS3(key: string): Promise<string> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  return resp.Body?.transformToString() ?? '';
}
