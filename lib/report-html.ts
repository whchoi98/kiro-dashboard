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
    '\ufeff' + // explicit escape — an invisible literal BOM in source is a maintenance trap
    html.replace(
      /<html /,
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" ',
    )
  );
}
