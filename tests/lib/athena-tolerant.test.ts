import { isMissingTableError } from '../../lib/athena';

describe('isMissingTableError', () => {
  it('recognizes Athena COLUMN_NOT_FOUND errors as missing-table signals', () => {
    const err = new Error(
      "Query FAILED: COLUMN_NOT_FOUND: line 2:24: Column 'userid' cannot be resolved or requester is not authorized to access requested resources"
    );
    expect(isMissingTableError(err)).toBe(true);
  });

  it('recognizes TABLE_NOT_FOUND errors', () => {
    const err = new Error("Query FAILED: TABLE_NOT_FOUND: line 3:14: Table 'titanlog.user_report' does not exist");
    expect(isMissingTableError(err)).toBe(true);
  });

  it('recognizes Glue EntityNotFoundException', () => {
    const err = Object.assign(new Error('Database titanlog not found.'), { name: 'EntityNotFoundException' });
    expect(isMissingTableError(err)).toBe(true);
  });

  it('recognizes a plain "Database ... not found" text (Athena lowercases)', () => {
    const err = new Error("Query FAILED: line 1:1: Schema 'awsdatacatalog.titanlog' does not exist");
    expect(isMissingTableError(err)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isMissingTableError(new Error('NetworkTimeoutError'))).toBe(false);
    expect(isMissingTableError(new Error('syntax error near SELECT'))).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
    expect(isMissingTableError(undefined)).toBe(false);
    expect(isMissingTableError('not an error object')).toBe(false);
  });
});
