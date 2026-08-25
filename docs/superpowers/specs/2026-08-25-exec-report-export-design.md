# 스펙: Executive 리포트 다운로드 (HTML · DOC)

- 날짜: 2026-08-25
- 상태: 설계 승인됨
- 범위: `/exec` 페이지에 "HTML 다운로드 / DOC 다운로드" 버튼 — 이미 로드된 요약
  데이터를 뷰티파이된 독립 문서로 클라이언트에서 생성·다운로드. 신규 의존성 0.

## 1. `lib/report-html.ts` (신규, 순수 — jest 대상)

```ts
export interface ExecReportInput {
  locale: 'ko' | 'en';
  days: number;
  generatedAtKst: string;                    // lib/freshness.formatInstantKst 재사용
  metrics: OverviewMetrics | null;
  trends: DailyTrend[];                      // 문서에는 기간 합계 + 최근 14일 표
  topUsers: CreditAnalysis['topUsers'];      // 상위 5, 마스킹된 값 그대로
  models: ModelDistribution[];               // 상위 5
}
export function escapeHtml(s: string): string
export function buildExecReportHtml(input: ExecReportInput): string  // 완전한 <!DOCTYPE html> 문서
export function wrapForWord(html: string): string  // BOM + mso(xmlns:w) 헤더 래핑 → .doc으로 Word가 서식 유지해 열음
```

- 문서 구성: Kiro 보라(#9046FF) 브랜드 헤더(제목·기간 N일·생성시각 KST) → KPI 4
  (총 사용자/메시지/대화/크레딧) → 최근 14일 일별 표 → 크레딧 상위 5(마스킹 이름·
  조직) → 모델 상위 5(모델·메시지·%) → 각주("데이터는 매일 02:00 UTC(= 11:00 KST)
  Kiro 리포트 기준 · 추정/마스킹 정책 안내")
- **라이트 배경 + 인라인 CSS만** (외부 리소스 0) — 이메일 첨부·오프라인 열람 안전
- **모든 데이터 값은 `escapeHtml` 경유** (사용자 이름 등 → 문서 깨짐/주입 방지)
- 라벨 i18n: React 컨텍스트 밖이므로 lib 내 `LABELS: Record<'ko'|'en', …>` 상수
- 빈 데이터: metrics null → KPI '—', trends 빈 배열 → "데이터 없음" 1행 (문서는 항상 생성됨)

## 2. `lib/export-report.ts` 확장

`export function downloadBlob(filename: string, mime: string, content: string): void`
— Blob + `<a download>` 클릭 (기존 exportMarkdown과 같은 방식·파일 내 위치).

## 3. `/exec` 배선

- Header 아래 버튼 2개(다크 우선, 보조 버튼 스타일), `disabled={loading || !metrics}`
- HTML: `downloadBlob('kiro-exec-report-<YYYYMMDD-HHmm>.html', 'text/html;charset=utf-8', html)`
- DOC: `downloadBlob('… .doc', 'application/msword', wrapForWord(html))`
- 입력 조립: `topUsers = (credits?.topUsers ?? []).slice(0, 5)`,
  `models = (modelUsage?.distribution ?? []).slice(0, 5)`, `generatedAtKst = formatInstantKst(new Date().toISOString())`
- i18n: `exec.downloadHtml`(HTML 다운로드/Download HTML), `exec.downloadDoc`(DOC 다운로드/Download DOC)

## 4. 테스트 — `tests/lib/report-html.test.ts`

DOCTYPE·<title> 존재 / escapeHtml 5종(& < > " ') / 악성 displayName(`<img …>`)이
문서에 리터럴로 안 들어감 / 마스킹 값(`Jo********`) 보존 / metrics null·trends 빈 배열
degrade / days·generatedAtKst 표기 / en 로케일 라벨 / wrapForWord: `﻿` BOM 시작 +
`urn:schemas-microsoft-com:office:word` 포함 + 원본 본문 보존.

## 5. 비목표 / 문서

- PDF(기존 AI 분석에 존재), 차트 이미지 임베드, 타 페이지 확장(후속 가능), 서버 생성.
- 문서: `lib/CLAUDE.md`(report-html 행 + export-report 행 갱신), `app/CLAUDE.md`(exec 행).
