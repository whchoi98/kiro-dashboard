import { latestReportDate, nextReportEtaMs, formatInstantKst } from '@/lib/freshness';

describe('latestReportDate', () => {
  it('returns the lexicographic max of valid YYYY-MM-DD dates (unsorted input)', () => {
    expect(latestReportDate(['2026-08-15', '2026-08-17', '2026-08-16'])).toBe('2026-08-17');
  });

  it('filters malformed entries (MM-DD-YYYY, empty, undefined, null)', () => {
    expect(latestReportDate(['08-17-2026', '', undefined, null, '2026-08-14'])).toBe('2026-08-14');
  });

  it('returns null when no valid dates exist', () => {
    expect(latestReportDate([])).toBeNull();
    expect(latestReportDate(['not-a-date', undefined])).toBeNull();
  });
});

describe('nextReportEtaMs', () => {
  const at = (iso: string) => Date.parse(iso);

  it('before 02:00 UTC resolves to the same day 02:00', () => {
    expect(nextReportEtaMs(at('2026-08-18T01:59:59.999Z'))).toBe(at('2026-08-18T02:00:00.000Z'));
  });

  it('exactly 02:00 UTC resolves to the NEXT day (strictly after)', () => {
    expect(nextReportEtaMs(at('2026-08-18T02:00:00.000Z'))).toBe(at('2026-08-19T02:00:00.000Z'));
  });

  it('just after 02:00 UTC resolves to the next day', () => {
    expect(nextReportEtaMs(at('2026-08-18T02:00:00.001Z'))).toBe(at('2026-08-19T02:00:00.000Z'));
  });

  it('handles month rollover (Aug 31 evening → Sep 1 02:00)', () => {
    expect(nextReportEtaMs(at('2026-08-31T23:30:00.000Z'))).toBe(at('2026-09-01T02:00:00.000Z'));
  });
});

describe('formatInstantKst', () => {
  it('converts a UTC instant to KST (+9) with the KST suffix', () => {
    expect(formatInstantKst('2026-08-18T02:00:41.000Z')).toBe('2026-08-18 11:00 KST');
  });

  it('rolls the date across midnight when +9 crosses it', () => {
    expect(formatInstantKst('2026-08-18T21:30:00.000Z')).toBe('2026-08-19 06:30 KST');
  });

  it('returns an em dash for null and unparsable input', () => {
    expect(formatInstantKst(null)).toBe('—');
    expect(formatInstantKst('not-a-date')).toBe('—');
  });
});
