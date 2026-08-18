import { filterIdcUsers, IdcUserStatus } from '@/lib/idc-users';

function mkUser(over: Partial<IdcUserStatus>): IdcUserStatus {
  return {
    userId: 'u',
    displayName: 'Ma****',
    email: 'ma***@ex*****',
    status: 'inactive',
    totalMessages: 0,
    totalCredits: 0,
    lastActive: null,
    organization: 'ex*****',
    daysSinceLastActive: null,
    activeDays: 0,
    dormancy: 'never',
    firstSeenAt: null,
    isNewRegistrant: false,
    ...over,
  };
}

const USERS: IdcUserStatus[] = [
  mkUser({ userId: 'a', status: 'active', dormancy: 'active7' }),
  mkUser({ userId: 'n', isNewRegistrant: true, firstSeenAt: '2026-08-18T05:57:00Z' }),
  mkUser({ userId: 'i1' }),
  mkUser({ userId: 'i2' }),
];

describe('filterIdcUsers', () => {
  it("'all' returns everyone in order", () => {
    const { users, truncated } = filterIdcUsers(USERS, 'all', 50);
    expect(users.map((u) => u.userId)).toEqual(['a', 'n', 'i1', 'i2']);
    expect(truncated).toBe(false);
  });

  it("'active' / 'inactive' split on status", () => {
    expect(filterIdcUsers(USERS, 'active', 50).users.map((u) => u.userId)).toEqual(['a']);
    expect(filterIdcUsers(USERS, 'inactive', 50).users.map((u) => u.userId)).toEqual(['n', 'i1', 'i2']);
  });

  it("'new' returns only new registrants", () => {
    expect(filterIdcUsers(USERS, 'new', 50).users.map((u) => u.userId)).toEqual(['n']);
  });

  it('caps at limit and flags truncation', () => {
    const { users, truncated } = filterIdcUsers(USERS, 'all', 2);
    expect(users.map((u) => u.userId)).toEqual(['a', 'n']);
    expect(truncated).toBe(true);
  });

  it('clamps limit into [1, 200]', () => {
    expect(filterIdcUsers(USERS, 'all', 0).users).toHaveLength(1);
    expect(filterIdcUsers(USERS, 'all', 9999).users).toHaveLength(4);
  });
});
