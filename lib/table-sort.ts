export type SortKind = 'string' | 'number';
export type SortDir = 'asc' | 'desc';

// Missing values (null/undefined; '' for strings; non-number/NaN for numbers)
// sort LAST regardless of direction: sorting by "last active" should surface
// rows that HAVE a value first, both ascending and descending.
export function compareByKey<T>(
  key: keyof T & string,
  kind: SortKind,
  dir: SortDir,
): (a: T, b: T) => number {
  const sign = dir === 'asc' ? 1 : -1;
  const isMissing = (v: unknown): boolean => {
    if (v === null || v === undefined) return true;
    if (kind === 'string') return v === '';
    return typeof v !== 'number' || Number.isNaN(v);
  };
  return (a, b) => {
    const av = a[key] as unknown;
    const bv = b[key] as unknown;
    const aMissing = isMissing(av);
    const bMissing = isMissing(bv);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (kind === 'number') return sign * ((av as number) - (bv as number));
    return sign * String(av).localeCompare(String(bv));
  };
}
