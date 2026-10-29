/**
 * Usage intensity / credit efficiency for /api/engagement. Measured on this
 * account (90 days): IDE 45.9 vs CLI 28.3 messages per conversation — the
 * split is the point, so the per-client math and the org-wide row are pinned.
 */

import { buildEfficiency, rate } from '../../lib/usage-efficiency';

describe('rate', () => {
  it('is null, not 0, when there is nothing to divide by', () => {
    expect(rate(10, 0)).toBeNull();
    expect(rate(0, 0)).toBeNull();
    expect(rate(10, 4)).toBe(2.5);
  });
});

describe('buildEfficiency', () => {
  const rows = [
    { clientType: 'KIRO_IDE', users: 3, messages: 19896, conversations: 433, credits: 23170 },
    { clientType: 'KIRO_CLI', users: 5, messages: 37548, conversations: 1326, credits: 46520 },
  ];

  it('computes per-client rates and sorts clients by name', () => {
    const { byClient } = buildEfficiency(rows, 5);
    expect(byClient.map((r) => r.clientType)).toEqual(['KIRO_CLI', 'KIRO_IDE']);
    const ide = byClient.find((r) => r.clientType === 'KIRO_IDE')!;
    expect(ide.messagesPerConversation).toBeCloseTo(45.95, 1);
    expect(ide.creditsPerMessage).toBeCloseTo(23170 / 19896);
    expect(ide.creditsPerConversation).toBeCloseTo(23170 / 433);
  });

  it('counts each user once in the ALL row instead of summing client rows', () => {
    // 3 IDE + 5 CLI users, but the three IDE users also use the CLI.
    const { overall } = buildEfficiency(rows, 5);
    expect(overall?.clientType).toBe('ALL');
    expect(overall?.users).toBe(5);
    expect(overall?.messages).toBe(19896 + 37548);
    expect(overall?.messagesPerConversation).toBeCloseTo((19896 + 37548) / (433 + 1326));
  });

  it('leaves rates null for a client with messages but no conversations', () => {
    const { byClient } = buildEfficiency(
      [{ clientType: 'PLUGIN', users: 1, messages: 7, conversations: 0, credits: 2 }],
      1
    );
    expect(byClient[0].messagesPerConversation).toBeNull();
    expect(byClient[0].creditsPerConversation).toBeNull();
    expect(byClient[0].creditsPerMessage).toBeCloseTo(2 / 7);
  });

  it('returns no overall row when the window has no usage', () => {
    expect(buildEfficiency([], 0)).toEqual({ overall: null, byClient: [] });
    expect(
      buildEfficiency([{ clientType: 'KIRO_IDE', users: 1, messages: 0, conversations: 0, credits: 0 }], 1)
    ).toEqual({ overall: null, byClient: [] });
  });
});
