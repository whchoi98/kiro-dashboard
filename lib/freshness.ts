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
