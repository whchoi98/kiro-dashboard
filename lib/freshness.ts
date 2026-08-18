// Kiro user-activity reports land once daily at 02:00 UTC (kiro.dev docs).
// Both the banner countdown and the as-of derivation key off that fact.
export const REPORT_HOUR_UTC = 2;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Max valid YYYY-MM-DD (ISO strings compare lexicographically == chronologically).
export function latestReportDate(dates: Array<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const d of dates) {
    if (d && ISO_DATE.test(d) && (max === null || d > max)) max = d;
  }
  return max;
}

// Nearest 02:00:00.000 UTC strictly after nowMs — at exactly 02:00 the report
// for that instant is already (being) delivered, so point at the next one.
export function nextReportEtaMs(nowMs: number): number {
  const now = new Date(nowMs);
  const todayReportMs = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), REPORT_HOUR_UTC,
  );
  return nowMs < todayReportMs ? todayReportMs : todayReportMs + 86_400_000;
}

/**
 * ISO instant → 'YYYY-MM-DD HH:MM KST'. KST is a fixed UTC+9 with no DST, so
 * a constant offset is safe. Display-only: APIs keep emitting UTC ISO strings;
 * this exists because "02:00 UTC" reads as 새벽 2시 to a KST-based operator.
 */
export function formatInstantKst(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  const kst = new Date(ms + 9 * 3_600_000).toISOString();
  return `${kst.slice(0, 10)} ${kst.slice(11, 16)} KST`;
}
