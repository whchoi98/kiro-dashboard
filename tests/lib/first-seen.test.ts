import { applyLedger, withinNewRegistrantWindow, NEW_REGISTRANT_DAYS } from '@/lib/first-seen';

describe('applyLedger', () => {
  const NOW = '2026-08-18T12:00:00.000Z';

  it('self-seeds every current id as null when no ledger exists', () => {
    const { ledger, changed } = applyLedger(null, ['a', 'b'], NOW);
    expect(changed).toBe(true);
    expect(ledger.users).toEqual({ a: null, b: null });
    expect(ledger.seededAt).toBe(NOW);
    expect(ledger.version).toBe(1);
  });

  it('stamps only ids missing from an existing ledger', () => {
    const existing = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { a: null as string | null } };
    const { ledger, changed } = applyLedger(existing, ['a', 'b'], NOW);
    expect(changed).toBe(true);
    expect(ledger.users).toEqual({ a: null, b: NOW });
  });

  it('reports changed=false and returns the same object when every id is known', () => {
    const existing = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { a: null as string | null, b: '2026-08-10T00:00:00Z' as string | null } };
    const { ledger, changed } = applyLedger(existing, ['a', 'b'], NOW);
    expect(changed).toBe(false);
    expect(ledger).toBe(existing);
  });

  it('keeps ledger entries for users deleted from the directory', () => {
    const existing = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { gone: '2026-08-02T00:00:00Z' as string | null } };
    const { ledger } = applyLedger(existing, ['a'], NOW);
    expect(ledger.users.gone).toBe('2026-08-02T00:00:00Z');
    expect(ledger.users.a).toBe(NOW);
  });
});

describe('withinNewRegistrantWindow', () => {
  const now = Date.parse('2026-08-18T12:00:00.000Z');

  it('null / undefined / unparsable → false', () => {
    expect(withinNewRegistrantWindow(null, now)).toBe(false);
    expect(withinNewRegistrantWindow(undefined, now)).toBe(false);
    expect(withinNewRegistrantWindow('not-a-date', now)).toBe(false);
  });

  it('exactly at the 7-day boundary → true', () => {
    const atBoundary = new Date(now - NEW_REGISTRANT_DAYS * 86_400_000).toISOString();
    expect(withinNewRegistrantWindow(atBoundary, now)).toBe(true);
  });

  it('1ms past the 7-day boundary → false', () => {
    const past = new Date(now - NEW_REGISTRANT_DAYS * 86_400_000 - 1).toISOString();
    expect(withinNewRegistrantWindow(past, now)).toBe(false);
  });

  it('future stamp (clock skew) still counts as new', () => {
    const future = new Date(now + 60_000).toISOString();
    expect(withinNewRegistrantWindow(future, now)).toBe(true);
  });
});
