import { buildExecReportHtml, wrapForWord, escapeHtml, ExecReportInput } from '@/lib/report-html';

const BASE: ExecReportInput = {
  locale: 'ko',
  days: 90,
  generatedAtKst: '2026-08-25 14:03 KST',
  metrics: {
    totalUsers: 7,
    totalMessages: 29700,
    totalConversations: 810,
    totalCredits: 34200.5,
    totalOverageCredits: 0,
    changeRates: {},
  },
  trends: [
    { date: '2026-08-17', messages: 397, conversations: 12, credits: 509, activeUsers: 2 },
    { date: '2026-08-18', messages: 345, conversations: 9, credits: 382.2, activeUsers: 2 },
  ],
  topUsers: [
    {
      userid: 'u-1', username: 'El*******', displayName: 'El*******',
      email: 'el***@da********', organization: 'da********',
      totalCredits: 24972.9, overageCredits: 0,
    },
  ] as ExecReportInput['topUsers'],
  models: [{ model: 'Claude Opus 4.8', messages: 10408, percentage: 52.4 }],
};

describe('escapeHtml', () => {
  it('escapes all five HTML special characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

describe('buildExecReportHtml', () => {
  const html = buildExecReportHtml(BASE);

  it('is a complete standalone document', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>');
    expect(html).not.toMatch(/src="http|href="http/);
    expect(html).not.toMatch(/display\s*:\s*(flex|grid)|position\s*:/);
  });

  it('carries period, generated-at, and the report-cadence footer', () => {
    expect(html).toContain('90');
    expect(html).toContain('2026-08-25 14:03 KST');
    expect(html).toContain('02:00 UTC');
  });

  it('renders masked identifiers verbatim and escapes hostile input', () => {
    expect(html).toContain('El*******');
    const hostile = buildExecReportHtml({
      ...BASE,
      topUsers: [{ ...BASE.topUsers[0], displayName: '<img src=x onerror=1>' }],
    });
    expect(hostile).not.toContain('<img src=x');
    expect(hostile).toContain('&lt;img src=x');
  });

  it('escapes hostile input in organization and model fields', () => {
    const hostileOrg = buildExecReportHtml({
      ...BASE,
      topUsers: [{ ...BASE.topUsers[0], organization: '<script>alert("xss")</script>' }],
    });
    expect(hostileOrg).not.toContain('<script>');
    expect(hostileOrg).toContain('&lt;script&gt;');

    const hostileModel = buildExecReportHtml({
      ...BASE,
      models: [{ model: '"><svg/onload=alert(1)>', messages: 100, percentage: 50 }],
    });
    expect(hostileModel).not.toContain('"><svg');
    expect(hostileModel).toContain('&quot;&gt;&lt;svg');
  });

  it('degrades: null metrics → em dashes, empty trends → no-data row', () => {
    const empty = buildExecReportHtml({ ...BASE, metrics: null, trends: [], topUsers: [], models: [] });
    expect(empty).toContain('—');
    expect(empty).toContain('데이터 없음');
  });

  it('locale=en switches labels', () => {
    const en = buildExecReportHtml({ ...BASE, locale: 'en', metrics: null, trends: [], topUsers: [], models: [] });
    expect(en).toContain('Kiro Usage Report');
    expect(en).toContain('No data');
  });
});

describe('wrapForWord', () => {
  it('prepends a BOM and injects the Word namespaces, preserving the body', () => {
    const html = buildExecReportHtml(BASE);
    const doc = wrapForWord(html);
    expect(doc.charCodeAt(0)).toBe(0xfeff);
    expect(doc).toContain('urn:schemas-microsoft-com:office:word');
    expect(doc).toContain('El*******');
  });
});
