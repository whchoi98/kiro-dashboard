import { safeFloat, safeInt, NORMALIZE_USERID } from '../../lib/athena';

describe('safeFloat', () => {
  it('parses valid float strings', () => {
    expect(safeFloat('3.14')).toBe(3.14);
    expect(safeFloat('0.0')).toBe(0);
    expect(safeFloat('-1.5')).toBe(-1.5);
  });

  it('returns 0 for NaN inputs', () => {
    expect(safeFloat('')).toBe(0);
    expect(safeFloat('abc')).toBe(0);
    expect(safeFloat('NaN')).toBe(0);
  });

  it('handles integer strings as floats', () => {
    expect(safeFloat('42')).toBe(42);
    expect(safeFloat('0')).toBe(0);
  });

  it('handles whitespace-padded values', () => {
    expect(safeFloat(' 3.14 ')).toBe(3.14);
  });
});

describe('safeInt', () => {
  it('parses valid integer strings', () => {
    expect(safeInt('42')).toBe(42);
    expect(safeInt('0')).toBe(0);
    expect(safeInt('-7')).toBe(-7);
  });

  it('returns 0 for NaN inputs', () => {
    expect(safeInt('')).toBe(0);
    expect(safeInt('abc')).toBe(0);
    expect(safeInt('NaN')).toBe(0);
  });

  it('truncates float strings to integers', () => {
    expect(safeInt('3.14')).toBe(3);
    expect(safeInt('9.99')).toBe(9);
  });

  it('handles whitespace-padded values', () => {
    expect(safeInt(' 42 ')).toBe(42);
  });
});

describe('NORMALIZE_USERID', () => {
  it('contains the correct regex pattern', () => {
    expect(NORMALIZE_USERID).toContain('REGEXP_REPLACE');
    expect(NORMALIZE_USERID).toContain("'^d-[a-z0-9]+\\.'");
  });

  it('is a valid SQL snippet for Athena', () => {
    expect(NORMALIZE_USERID).toBe(
      `REGEXP_REPLACE(userid, '^d-[a-z0-9]+\\.', '')`
    );
  });

  it('can be embedded in a SQL query', () => {
    const sql = `SELECT ${NORMALIZE_USERID} AS normalized_id FROM user_report`;
    expect(sql).toContain('REGEXP_REPLACE(userid');
    expect(sql).toContain('AS normalized_id');
  });
});
