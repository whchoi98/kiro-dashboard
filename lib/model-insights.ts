/**
 * Derived model-usage views over the UAR CSVs: vendor shares, per-client model
 * mix, model adoption, and the model-column parity check.
 *
 * Pure on purpose — a `route.ts` may export only handlers, and Jest only
 * collects `*.test.ts`, so logic that lives in a route is unreachable from
 * tests (same reason as nav-state.ts and chat-scroll.ts).
 *
 * Inputs are parsed rows grouped by the client type of the file they came
 * from. Kiro writes one CSV per client per day, and on the S3-direct path the
 * filename is the only client signal (`clientTypeFromKey`).
 */

import { isModelColumn, prettifyModelName, normalizeUserId, type CsvRow } from './uar-s3';
import type {
  ClientModelMix,
  ModelAdoption,
  ModelDistribution,
  ModelVendor,
  VendorShare,
} from '@/types/dashboard';

export interface ReportFile {
  clientType: string;
  rows: CsvRow[];
}

/**
 * Classifies from the column name alone, so a model Kiro ships tomorrow still
 * lands in a bucket. Anthropic models are all `claude_*`; `auto` is Kiro's
 * router pseudo-model; everything else (gpt, qwen, glm, deepseek, minimax, …)
 * is third-party.
 */
export function modelVendor(column: string): ModelVendor {
  const name = column.replace(/_messages$/, '');
  if (name === 'auto') return 'auto';
  if (name.startsWith('claude')) return 'anthropic';
  return 'third_party';
}

/** Stable display order; every vendor is listed so a 0% third-party share is visible. */
export const VENDOR_ORDER: readonly ModelVendor[] = ['anthropic', 'third_party', 'auto'];

function messageCount(value: string | undefined): number {
  const n = parseInt(value || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sumValues(totals: Map<string, number>): number {
  let sum = 0;
  for (const n of totals.values()) sum += n;
  return sum;
}

/** Model columns → distribution rows, largest first. Keys are raw column names. */
export function modelDistribution(totals: Map<string, number>): ModelDistribution[] {
  const grand = sumValues(totals);
  return [...totals.entries()]
    .filter(([, messages]) => messages > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([column, messages]) => ({
      model: prettifyModelName(column),
      messages,
      percentage: grand > 0 ? (messages / grand) * 100 : 0,
      vendor: modelVendor(column),
    }));
}

export function vendorShares(totals: Map<string, number>): VendorShare[] {
  const grand = sumValues(totals);
  if (grand === 0) return [];
  const byVendor = new Map<ModelVendor, number>();
  for (const [column, messages] of totals) {
    const vendor = modelVendor(column);
    byVendor.set(vendor, (byVendor.get(vendor) ?? 0) + messages);
  }
  return VENDOR_ORDER.map((vendor) => {
    const messages = byVendor.get(vendor) ?? 0;
    return { vendor, messages, percentage: (messages / grand) * 100 };
  });
}

/** Per-client model mix. Clients with no model messages in the window are omitted. */
export function clientModelMix(files: ReportFile[]): ClientModelMix[] {
  const perClient = new Map<string, Map<string, number>>();
  for (const { clientType, rows } of files) {
    const client = clientType || 'UNKNOWN';
    const totals = perClient.get(client) ?? new Map<string, number>();
    perClient.set(client, totals);
    for (const row of rows) {
      for (const column of Object.keys(row)) {
        if (!isModelColumn(column)) continue;
        const n = messageCount(row[column]);
        if (n > 0) totals.set(column, (totals.get(column) ?? 0) + n);
      }
    }
  }
  return [...perClient.entries()]
    .map(([clientType, totals]) => ({
      clientType,
      totalMessages: sumValues(totals),
      models: modelDistribution(totals),
      vendors: vendorShares(totals),
    }))
    .filter((mix) => mix.totalMessages > 0)
    .sort((a, b) => a.clientType.localeCompare(b.clientType));
}

/** `YYYY-MM-DD` minus `days`, in UTC. */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * First/last report date, reach and recent pull of every model in the window.
 * "Recent" is the last `recentDays` calendar days ending at the newest report
 * date — calendar rather than "last N files", because Kiro writes no file on
 * days nobody used a client, and skipping those would stretch the window.
 */
export function modelAdoption(files: ReportFile[], recentDays = 7): ModelAdoption[] {
  const firstSeen = new Map<string, string>();
  const lastSeen = new Map<string, string>();
  const users = new Map<string, Set<string>>();
  const messages = new Map<string, number>();
  const byDate: Array<{ date: string; column: string; n: number }> = [];
  let minDate = '';
  let maxDate = '';

  for (const { rows } of files) {
    for (const row of rows) {
      const date = row.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue;
      if (!minDate || date < minDate) minDate = date;
      if (date > maxDate) maxDate = date;
      const userid = normalizeUserId(row.userid ?? '');
      for (const column of Object.keys(row)) {
        if (!isModelColumn(column)) continue;
        const n = messageCount(row[column]);
        if (n === 0) continue;
        const first = firstSeen.get(column);
        if (!first || date < first) firstSeen.set(column, date);
        const last = lastSeen.get(column);
        if (!last || date > last) lastSeen.set(column, date);
        const reach = users.get(column) ?? new Set<string>();
        if (userid) reach.add(userid);
        users.set(column, reach);
        messages.set(column, (messages.get(column) ?? 0) + n);
        byDate.push({ date, column, n });
      }
    }
  }

  const recentFrom = maxDate ? shiftDate(maxDate, recentDays - 1) : '';
  const recent = new Map<string, number>();
  let recentTotal = 0;
  for (const { date, column, n } of byDate) {
    if (date < recentFrom) continue;
    recent.set(column, (recent.get(column) ?? 0) + n);
    recentTotal += n;
  }

  return [...messages.entries()]
    .map(([column, total]) => ({
      model: prettifyModelName(column),
      vendor: modelVendor(column),
      firstSeen: firstSeen.get(column)!,
      lastSeen: lastSeen.get(column)!,
      firstSeenAtWindowStart: firstSeen.get(column) === minDate,
      users: users.get(column)?.size ?? 0,
      messages: total,
      recentShare: recentTotal > 0 ? ((recent.get(column) ?? 0) / recentTotal) * 100 : null,
    }))
    .sort((a, b) => b.firstSeen.localeCompare(a.firstSeen) || b.messages - a.messages);
}

export interface ModelParity {
  /** false when the file has no model columns (predates them) or no total_messages. */
  applicable: boolean;
  rows: number;
  mismatches: Array<{ totalMessages: number; modelSum: number }>;
}

/**
 * Per row, the model columns must sum to `total_messages` — exact across every
 * file in this account so far. A mismatch means a model column was dropped,
 * renamed or mis-parsed, which would silently skew every model view. A
 * non-numeric cell counts as a mismatch rather than as 0.
 */
export function modelSumParity(rows: CsvRow[]): ModelParity {
  if (rows.length === 0) return { applicable: false, rows: 0, mismatches: [] };
  const headers = Object.keys(rows[0]);
  const modelColumns = headers.filter(isModelColumn);
  if (modelColumns.length === 0 || !headers.includes('total_messages')) {
    return { applicable: false, rows: rows.length, mismatches: [] };
  }
  const mismatches: ModelParity['mismatches'] = [];
  for (const row of rows) {
    const totalMessages = Number(row.total_messages || '0');
    const modelSum = modelColumns.reduce((sum, column) => sum + Number(row[column] || '0'), 0);
    // NaN !== anything, so a non-numeric cell lands here too.
    if (totalMessages !== modelSum) mismatches.push({ totalMessages, modelSum });
  }
  return { applicable: true, rows: rows.length, mismatches };
}
