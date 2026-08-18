import { compareByKey } from '@/lib/table-sort';

interface Row {
  name: string | null;
  count: number | null;
  note?: string;
}

const rows: Row[] = [
  { name: 'charlie', count: 3 },
  { name: 'alice', count: 10 },
  { name: 'bob', count: null },
  { name: null, count: 1 },
  { name: '', count: 7 },
];

describe('compareByKey — string kind', () => {
  it('sorts ascending with null and empty-string always last', () => {
    const sorted = [...rows].sort(compareByKey<Row>('name', 'string', 'asc'));
    expect(sorted.map((r) => r.name)).toEqual(['alice', 'bob', 'charlie', null, '']);
  });

  it('sorts descending with null and empty-string still last', () => {
    const sorted = [...rows].sort(compareByKey<Row>('name', 'string', 'desc'));
    expect(sorted.map((r) => r.name)).toEqual(['charlie', 'bob', 'alice', null, '']);
  });

  it('treats undefined as missing (optional fields)', () => {
    const withUndef: Row[] = [{ name: 'a', count: 1, note: 'z' }, { name: 'b', count: 2 }];
    const sorted = [...withUndef].sort(compareByKey<Row>('note', 'string', 'asc'));
    expect(sorted.map((r) => r.name)).toEqual(['a', 'b']);
  });
});

describe('compareByKey — number kind', () => {
  it('sorts ascending numerically (not lexicographically) with null last', () => {
    const sorted = [...rows].sort(compareByKey<Row>('count', 'number', 'asc'));
    expect(sorted.map((r) => r.count)).toEqual([1, 3, 7, 10, null]);
  });

  it('sorts descending with null still last', () => {
    const sorted = [...rows].sort(compareByKey<Row>('count', 'number', 'desc'));
    expect(sorted.map((r) => r.count)).toEqual([10, 7, 3, 1, null]);
  });

  it('treats NaN as missing', () => {
    const withNaN = [{ v: NaN }, { v: 2 }, { v: 1 }];
    const sorted = [...withNaN].sort(compareByKey<{ v: number }>('v', 'number', 'asc'));
    expect(sorted.map((r) => r.v)).toEqual([1, 2, NaN]);
  });

  it('missing values compare equal to each other', () => {
    const cmp = compareByKey<Row>('count', 'number', 'asc');
    expect(cmp({ name: 'x', count: null }, { name: 'y', count: null })).toBe(0);
  });
});
