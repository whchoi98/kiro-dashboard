# Exec 리포트 다운로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/exec`에서 로드된 요약 데이터를 뷰티파이된 독립 HTML/DOC 문서로 다운로드.

**Architecture:** 순수 문서 빌더 `lib/report-html.ts`(TDD) + `export-report.ts`의 `downloadBlob` + `/exec` 버튼 2개. **Word 호환성 때문에 문서 레이아웃은 flex/grid가 아닌 `<table>`만 사용**(같은 HTML이 .doc으로 열림). 신규 의존성 0.

**Spec:** `docs/superpowers/specs/2026-08-25-exec-report-export-design.md`

## Global Constraints

- 모든 동적 값은 `escapeHtml` 경유. 마스킹 값 원형 유지. 숫자는 `toLocaleString('en-US')`(테스트 결정성).
- 문서 내부 CSS는 인라인/`<style>`만, 외부 URL 0. 레이아웃은 table 기반(Word 호환).
- NEVER npm install/ci; NEVER touch .claude/settings.json. Build denied → 보고만.
- 검증: `npx jest` + `npm run build`. 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1 (단일): 문서 빌더 TDD + downloadBlob + /exec 배선 + i18n + 문서

**Files:**
- Create: `lib/report-html.ts`, `tests/lib/report-html.test.ts`
- Modify: `lib/export-report.ts`, `app/exec/page.tsx`, `lib/i18n.tsx`, `lib/CLAUDE.md`, `app/CLAUDE.md`

- [ ] **Step 1: 실패하는 테스트** — `tests/lib/report-html.test.ts`:

```ts
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

  it('degrades: null metrics → em dashes, empty trends → no-data row', () => {
    const empty = buildExecReportHtml({ ...BASE, metrics: null, trends: [], topUsers: [], models: [] });
    expect(empty).toContain('—');
    expect(empty).toContain('데이터 없음');
  });

  it('locale=en switches labels', () => {
    const en = buildExecReportHtml({ ...BASE, locale: 'en' });
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
```

- [ ] **Step 2: RED 확인** — `npx jest tests/lib/report-html.test.ts` → 모듈 없음 FAIL

- [ ] **Step 3: `lib/report-html.ts` 구현**

```ts
import { OverviewMetrics, DailyTrend, CreditAnalysis, ModelDistribution } from '@/types/dashboard';

export interface ExecReportInput {
  locale: 'ko' | 'en';
  days: number;
  generatedAtKst: string;
  metrics: OverviewMetrics | null;
  trends: DailyTrend[];
  topUsers: CreditAnalysis['topUsers'];
  models: ModelDistribution[];
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LABELS = {
  ko: {
    title: 'Kiro 사용 현황 리포트',
    subtitle: 'Executive Snapshot',
    period: (d: number) => `최근 ${d}일`,
    generated: '생성 시각',
    kpis: ['총 사용자', '총 메시지', '총 대화', '총 크레딧'] as const,
    daily: '최근 14일 일별 활동',
    dailyHead: ['날짜', '메시지', '대화', '크레딧', '활성 사용자'] as const,
    topUsers: '크레딧 상위 사용자 (마스킹)',
    topHead: ['사용자', '소속', '크레딧', '초과 크레딧'] as const,
    models: 'AI 모델 사용 상위',
    modelHead: ['모델', '메시지', '비중'] as const,
    noData: '데이터 없음',
    footer:
      '데이터는 매일 02:00 UTC(= 11:00 KST)에 적재되는 Kiro 사용자 활동 리포트 기준입니다. 사용자 식별 정보는 정책에 따라 마스킹되어 있습니다.',
  },
  en: {
    title: 'Kiro Usage Report',
    subtitle: 'Executive Snapshot',
    period: (d: number) => `Last ${d} days`,
    generated: 'Generated',
    kpis: ['Total Users', 'Total Messages', 'Total Conversations', 'Total Credits'] as const,
    daily: 'Daily Activity (last 14 days)',
    dailyHead: ['Date', 'Messages', 'Conversations', 'Credits', 'Active Users'] as const,
    topUsers: 'Top Users by Credits (masked)',
    topHead: ['User', 'Organization', 'Credits', 'Overage'] as const,
    models: 'Top AI Models',
    modelHead: ['Model', 'Messages', 'Share'] as const,
    noData: 'No data',
    footer:
      'Data comes from the Kiro user activity report delivered daily at 02:00 UTC (= 11:00 KST). User identifiers are masked by policy.',
  },
} as const;

const num = (n: number): string => n.toLocaleString('en-US');

// Layout uses TABLES ONLY: the same HTML is saved as .doc and opened by Word,
// which ignores flex/grid. Inline styles keep the file self-contained.
const TH = 'style="text-align:left;padding:8px 10px;background:#f4f0fb;color:#5b21b6;font-size:12px;border-bottom:2px solid #9046FF;"';
const TD = 'style="padding:7px 10px;border-bottom:1px solid #eee;font-size:13px;color:#222;"';
const TDR = 'style="padding:7px 10px;border-bottom:1px solid #eee;font-size:13px;color:#222;text-align:right;"';

function section(title: string, table: string): string {
  return `<h2 style="font-size:15px;color:#5b21b6;margin:28px 0 8px;">${title}</h2>${table}`;
}

function rowsOrNoData(rows: string[], cols: number, noData: string): string {
  if (rows.length) return rows.join('');
  return `<tr><td colspan="${cols}" ${TD}>${noData}</td></tr>`;
}

export function buildExecReportHtml(input: ExecReportInput): string {
  const L = LABELS[input.locale];
  const m = input.metrics;
  const kpiValues = [
    m ? num(m.totalUsers) : '—',
    m ? num(m.totalMessages) : '—',
    m ? num(m.totalConversations) : '—',
    m ? num(Math.round(m.totalCredits)) : '—',
  ];
  const kpiCells = L.kpis
    .map(
      (label, i) =>
        `<td style="width:25%;padding:14px;border:1px solid #eee;text-align:center;">` +
        `<div style="font-size:11px;color:#777;">${label}</div>` +
        `<div style="font-size:22px;font-weight:bold;color:#5b21b6;">${kpiValues[i]}</div></td>`,
    )
    .join('');

  const dailyRows = input.trends.slice(-14).map(
    (t) =>
      `<tr><td ${TD}>${escapeHtml(t.date)}</td><td ${TDR}>${num(t.messages)}</td>` +
      `<td ${TDR}>${num(t.conversations)}</td><td ${TDR}>${num(Math.round(t.credits))}</td>` +
      `<td ${TDR}>${num(t.activeUsers)}</td></tr>`,
  );

  const userRows = input.topUsers.map(
    (u) =>
      `<tr><td ${TD}>${escapeHtml(u.displayName)}</td><td ${TD}>${escapeHtml(u.organization)}</td>` +
      `<td ${TDR}>${num(Math.round(u.totalCredits))}</td><td ${TDR}>${num(Math.round(u.overageCredits))}</td></tr>`,
  );

  const modelRows = input.models.map(
    (mo) =>
      `<tr><td ${TD}>${escapeHtml(mo.model)}</td><td ${TDR}>${num(mo.messages)}</td>` +
      `<td ${TDR}>${mo.percentage.toFixed(1)}%</td></tr>`,
  );

  const head = (cols: readonly string[]) =>
    `<tr>${cols.map((c) => `<th ${TH}>${c}</th>`).join('')}</tr>`;
  const table = (inner: string) =>
    `<table style="width:100%;border-collapse:collapse;">${inner}</table>`;

  return `<!DOCTYPE html>
<html lang="${input.locale}">
<head>
<meta charset="utf-8">
<title>${L.title} — ${escapeHtml(input.generatedAtKst)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,'Segoe UI',Roboto,'Malgun Gothic',sans-serif;">
<div style="max-width:800px;margin:0 auto;padding:32px 24px;">
  <table style="width:100%;border-collapse:collapse;"><tr>
    <td style="border-left:6px solid #9046FF;padding:4px 14px;">
      <div style="font-size:22px;font-weight:bold;color:#1a1a1a;">${L.title}</div>
      <div style="font-size:12px;color:#777;">${L.subtitle} · ${L.period(input.days)} · ${L.generated}: ${escapeHtml(input.generatedAtKst)}</div>
    </td>
  </tr></table>
  <table style="width:100%;border-collapse:collapse;margin-top:20px;"><tr>${kpiCells}</tr></table>
  ${section(L.daily, table(head(L.dailyHead) + rowsOrNoData(dailyRows, 5, L.noData)))}
  ${section(L.topUsers, table(head(L.topHead) + rowsOrNoData(userRows, 4, L.noData)))}
  ${section(L.models, table(head(L.modelHead) + rowsOrNoData(modelRows, 3, L.noData)))}
  <p style="margin-top:28px;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;">${L.footer}</p>
</div>
</body>
</html>`;
}

export function wrapForWord(html: string): string {
  return (
    '﻿' +
    html.replace(
      /<html /,
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" ',
    )
  );
}
```

- [ ] **Step 4: GREEN** — `npx jest tests/lib/report-html.test.ts` → PASS (7 tests)

- [ ] **Step 5: `lib/export-report.ts`** — 파일을 읽고 기존 스타일에 맞춰 끝에 추가:

```ts
/** Client-side file download via Blob + anchor click (no server round trip). */
export function downloadBlob(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 6: i18n** — ko 블록 `'header.exec.sub'` 행 아래: `'exec.downloadHtml': 'HTML 다운로드',` `'exec.downloadDoc': 'DOC 다운로드',` / en 블록 같은 위치: `'Download HTML'`, `'Download DOC'`.

- [ ] **Step 7: `/exec` 배선** — `app/exec/page.tsx`:
  - import: `import { buildExecReportHtml } from '@/lib/report-html';` `import { downloadBlob } from '@/lib/export-report';` `import { formatInstantKst } from '@/lib/freshness';` `import { useI18n } from '@/lib/i18n';` (이미 있으면 생략)
  - 컴포넌트 안(기존 훅 옆): `const { t, locale } = useI18n();` (이미 t를 쓰면 locale만 추가)
  - 핸들러:
```tsx
  const buildReport = () => {
    const generatedAtKst = formatInstantKst(new Date().toISOString());
    return {
      html: buildExecReportHtml({
        locale,
        days,
        generatedAtKst,
        metrics,
        trends,
        topUsers: (credits?.topUsers ?? []).slice(0, 5),
        models: (modelUsage?.distribution ?? []).slice(0, 5),
      }),
      stamp: `${generatedAtKst.replace(/[^0-9]/g, '').slice(0, 8)}-${generatedAtKst.replace(/[^0-9]/g, '').slice(8, 12)}`,
    };
  };
```
  - Header 바로 아래 버튼 행:
```tsx
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || !metrics}
          onClick={() => {
            const { html, stamp } = buildReport();
            downloadBlob(`kiro-exec-report-${stamp}.html`, 'text/html;charset=utf-8', html);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-800 text-gray-300 hover:text-white hover:border-[#9046FF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('exec.downloadHtml')}
        </button>
        <button
          type="button"
          disabled={loading || !metrics}
          onClick={() => {
            const { html, stamp } = buildReport();
            downloadBlob(`kiro-exec-report-${stamp}.doc`, 'application/msword', wrapForWord(html));
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-800 text-gray-300 hover:text-white hover:border-[#9046FF] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('exec.downloadDoc')}
        </button>
      </div>
```
    (`wrapForWord`도 import에 포함)

- [ ] **Step 8: 전체 검증** — `npx jest` 전체 PASS(500+7) · `npm run build` 성공

- [ ] **Step 9: 문서** — `lib/CLAUDE.md`: `report-html.ts` 행 추가(`refresh.tsx` 행 아래; escape/table-layout/Word 래퍼 요지) + `export-report.ts` 행에 `downloadBlob` 언급. `app/CLAUDE.md`: exec 행에 `— HTML/DOC report download (lib/report-html.ts)` 추가.

- [ ] **Step 10: Commit** (`feat(exec): beautified HTML/DOC report download`)
