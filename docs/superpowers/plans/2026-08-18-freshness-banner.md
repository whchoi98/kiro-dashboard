# 데이터 신선도 배너 (Freshness Banner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/subscription`·`/adoption` 페이지에 "데이터 기준일 + 다음 리포트 카운트다운 + Kiro 콘솔 안내 링크" 한 줄 배너를 추가한다.

**Architecture:** 순수 계산은 `lib/freshness.ts`(jest 테스트 대상), 표시는 공용 클라이언트 컴포넌트 `FreshnessBanner`(마운트 후 60초 인터벌 카운트다운 — 하이드레이션 안전), 페이지는 이미 로드한 시계열의 날짜만 props로 전달. 신규 API·IAM·AWS 호출 없음.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind v4 (dark-first 팔레트 오버라이드), jest(ts-jest).

**Spec:** `docs/superpowers/specs/2026-08-18-freshness-banner-design.md`

## Global Constraints

- 스타일은 dark-first 클래스만 사용 — `dark:`/`light:` 변형 금지 (라이트 테마는 팔레트 오버라이드로 자동 처리). 링크 액센트는 `text-[#9046FF]`.
- `t(key)`는 보간 미지원 → `{h}`/`{m}` 플레이스홀더를 컴포넌트에서 `.replace()`로 치환한다.
- 모든 사용자 노출 문자열은 ko/en 양쪽 키 필수 (`lib/i18n.tsx`).
- 검증은 `npx jest` + `npm run build`만 사용 — 이 저장소는 `.eslintrc` 부재로 `next lint` 불가.
- jest는 `tests/**/*.test.ts`만 수집(`.tsx` 미수집) → 컴포넌트는 빌드로 검증한다.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` 트레일러.

---

### Task 1: `lib/freshness.ts` 순수 함수 + 테스트 + lib 문서

**Files:**
- Create: `lib/freshness.ts`
- Test: `tests/lib/freshness.test.ts`
- Modify: `lib/CLAUDE.md` (Files 표의 `i18n.tsx` 행 바로 아래에 행 추가)

**Interfaces:**
- Consumes: 없음 (표준 라이브러리만)
- Produces (Task 2가 import):
  - `REPORT_HOUR_UTC: number` (= 2)
  - `latestReportDate(dates: Array<string | null | undefined>): string | null`
  - `nextReportEtaMs(nowMs: number): number`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/freshness.test.ts`:

```ts
import { latestReportDate, nextReportEtaMs } from '@/lib/freshness';

describe('latestReportDate', () => {
  it('returns the lexicographic max of valid YYYY-MM-DD dates (unsorted input)', () => {
    expect(latestReportDate(['2026-08-15', '2026-08-17', '2026-08-16'])).toBe('2026-08-17');
  });

  it('filters malformed entries (MM-DD-YYYY, empty, undefined, null)', () => {
    expect(latestReportDate(['08-17-2026', '', undefined, null, '2026-08-14'])).toBe('2026-08-14');
  });

  it('returns null when no valid dates exist', () => {
    expect(latestReportDate([])).toBeNull();
    expect(latestReportDate(['not-a-date', undefined])).toBeNull();
  });
});

describe('nextReportEtaMs', () => {
  const at = (iso: string) => Date.parse(iso);

  it('before 02:00 UTC resolves to the same day 02:00', () => {
    expect(nextReportEtaMs(at('2026-08-18T01:59:59.999Z'))).toBe(at('2026-08-18T02:00:00.000Z'));
  });

  it('exactly 02:00 UTC resolves to the NEXT day (strictly after)', () => {
    expect(nextReportEtaMs(at('2026-08-18T02:00:00.000Z'))).toBe(at('2026-08-19T02:00:00.000Z'));
  });

  it('just after 02:00 UTC resolves to the next day', () => {
    expect(nextReportEtaMs(at('2026-08-18T02:00:00.001Z'))).toBe(at('2026-08-19T02:00:00.000Z'));
  });

  it('handles month rollover (Aug 31 evening → Sep 1 02:00)', () => {
    expect(nextReportEtaMs(at('2026-08-31T23:30:00.000Z'))).toBe(at('2026-09-01T02:00:00.000Z'));
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `npx jest tests/lib/freshness.test.ts`
Expected: FAIL — `Cannot find module '@/lib/freshness'`

- [ ] **Step 3: 최소 구현 작성**

`lib/freshness.ts`:

```ts
// Kiro user-activity reports land once daily at 02:00 UTC (kiro.dev docs).
// Both the banner countdown and the as-of derivation key off that fact.
export const REPORT_HOUR_UTC = 2;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Max valid YYYY-MM-DD (ISO strings compare lexicographically == chronologically).
export function latestReportDate(dates: Array<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const d of dates) {
    if (d && ISO_DATE.test(d) && (max === null || d > max)) max = d;
  }
  return max;
}

// Nearest 02:00:00.000 UTC strictly after nowMs — at exactly 02:00 the report
// for that instant is already (being) delivered, so point at the next one.
export function nextReportEtaMs(nowMs: number): number {
  const now = new Date(nowMs);
  const todayReportMs = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), REPORT_HOUR_UTC,
  );
  return nowMs < todayReportMs ? todayReportMs : todayReportMs + 86_400_000;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx jest tests/lib/freshness.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: `lib/CLAUDE.md` Files 표 갱신**

`i18n.tsx` 행 바로 아래에 추가:

```markdown
| `freshness.ts` | Pure helpers for the report-freshness banner — `latestReportDate` (max valid `YYYY-MM-DD`), `nextReportEtaMs` (next 02:00 UTC strictly after now), `REPORT_HOUR_UTC`; consumed by `app/components/ui/FreshnessBanner.tsx` |
```

- [ ] **Step 6: Commit**

```bash
git add lib/freshness.ts tests/lib/freshness.test.ts lib/CLAUDE.md
git commit -m "feat(lib): freshness helpers for the report-freshness banner

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: i18n 키 + `FreshnessBanner` 컴포넌트 + components 문서

**Files:**
- Modify: `lib/i18n.tsx` (ko 블록의 `'header.adoption.sub'` 행 아래, en 블록의 `'header.adoption.sub'` 행 아래 — 두 곳)
- Create: `app/components/ui/FreshnessBanner.tsx`
- Modify: `app/components/CLAUDE.md` (Directory Layout의 `ui/` 목록에 항목 추가)

**Interfaces:**
- Consumes: Task 1의 `latestReportDate`, `nextReportEtaMs` (`@/lib/freshness`); `useI18n` (`@/lib/i18n`)
- Produces (Task 3이 import): `FreshnessBanner` — default export, props `{ dates: string[] }`

- [ ] **Step 1: i18n 키 추가 (ko 블록 — `'header.adoption.sub': '신규 사용자 유입과 정착 추이',` 바로 아래)**

```ts
    'freshness.asOf': '데이터 기준일',
    'freshness.etaHours': '다음 리포트 약 {h}시간 후',
    'freshness.etaMinutes': '다음 리포트 약 {m}분 후',
    'freshness.schedule': '(매일 02:00 UTC · 11:00 KST)',
    'freshness.consoleCta': '실시간 구독 현황: Kiro 콘솔 대시보드',
```

- [ ] **Step 2: i18n 키 추가 (en 블록 — `'header.adoption.sub': 'New user inflow and activation trends',` 바로 아래)**

```ts
    'freshness.asOf': 'Data as of',
    'freshness.etaHours': 'Next report in ~{h}h',
    'freshness.etaMinutes': 'Next report in ~{m}m',
    'freshness.schedule': '(daily at 02:00 UTC · 11:00 KST)',
    'freshness.consoleCta': 'Live subscriptions: Kiro console dashboard',
```

- [ ] **Step 3: 컴포넌트 작성**

`app/components/ui/FreshnessBanner.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { latestReportDate, nextReportEtaMs } from '@/lib/freshness';

// No documented console deep link exists (kiro.dev only describes: sign in →
// switch to the Kiro console → Dashboard). Swap this constant if one is found.
const KIRO_CONSOLE_DASHBOARD_URL =
  'https://kiro.dev/docs/enterprise/monitor-and-track/dashboard/';

// One-line report-freshness banner: as-of date (max report date in the data
// the page already loaded) + countdown to the next daily 02:00 UTC report +
// a pointer to the console for live subscription state. No network calls.
export default function FreshnessBanner({ dates }: { dates: string[] }) {
  const { t } = useI18n();
  // null until mounted — countdown depends on the client clock, so rendering
  // it during SSR/hydration would mismatch. The interval keeps it fresh
  // across the 02:00 UTC boundary while the page stays open.
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      setEtaMinutes(Math.max(0, Math.round((nextReportEtaMs(now) - now) / 60_000)));
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const asOf = latestReportDate(dates) ?? '—';
  const eta =
    etaMinutes === null
      ? null
      : etaMinutes >= 60
        ? t('freshness.etaHours').replace('{h}', String(Math.round(etaMinutes / 60)))
        : t('freshness.etaMinutes').replace('{m}', String(etaMinutes));

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-2 text-xs text-gray-400">
      <span>
        {t('freshness.asOf')} <span className="font-bold text-gray-200">{asOf}</span>
      </span>
      {eta !== null && (
        <span>
          {eta} <span className="text-gray-500">{t('freshness.schedule')}</span>
        </span>
      )}
      <a
        href={KIRO_CONSOLE_DASHBOARD_URL}
        target="_blank"
        rel="noreferrer"
        className="text-[#9046FF] hover:underline"
      >
        {t('freshness.consoleCta')} ↗
      </a>
    </div>
  );
}
```

- [ ] **Step 4: `app/components/CLAUDE.md` 갱신**

Directory Layout의 `ui/` 항목 목록에 추가 (기존 항목들과 같은 형식으로):

```
    FreshnessBanner.tsx   Report-freshness banner (as-of date + next-report countdown + console docs link); props { dates }; used by /subscription and /adoption
```

- [ ] **Step 5: 타입 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음 (컴포넌트는 아직 미사용 — import 연결은 Task 3)

- [ ] **Step 6: Commit**

```bash
git add lib/i18n.tsx app/components/ui/FreshnessBanner.tsx app/components/CLAUDE.md
git commit -m "feat(ui): FreshnessBanner — as-of date, next-report countdown, console link

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 두 페이지 연결 + 전체 검증

**Files:**
- Modify: `app/subscription/page.tsx` (import 1줄 + Header 아래 1줄)
- Modify: `app/adoption/page.tsx` (import 1줄 + Header 아래 1줄)

**Interfaces:**
- Consumes: Task 2의 `FreshnessBanner` (default export, props `{ dates: string[] }`)
- Produces: 사용자 노출 결과물 (후속 태스크 없음)

- [ ] **Step 1: `/subscription` 연결**

`app/subscription/page.tsx` — import 블록에 추가:

```ts
import FreshnessBanner from '@/app/components/ui/FreshnessBanner';
```

`<Header … onDaysChange={setDays} />`의 닫는 `/>` 바로 다음, `<SkeletonGate …>` 시작 전에 삽입:

```tsx
      <FreshnessBanner dates={(data?.tierTrend ?? []).map((p) => p.date)} />
```

(`tierTrend` 포인트 타입은 `{ date: string; [tier: string]: string | number }` — `p.date`는 string.)

- [ ] **Step 2: `/adoption` 연결**

`app/adoption/page.tsx` — import 블록에 추가:

```ts
import FreshnessBanner from '@/app/components/ui/FreshnessBanner';
```

`<Header … onDaysChange={setDays} />`의 닫는 `/>` 바로 다음, `<SkeletonGate …>` 시작 전에 삽입:

```tsx
      <FreshnessBanner dates={(data?.trend ?? []).map((p) => p.date)} />
```

- [ ] **Step 3: 전체 테스트**

Run: `npx jest`
Expected: 전체 스위트 PASS (기존 테스트 회귀 없음 + 신규 7개)

- [ ] **Step 4: 프로덕션 빌드**

Run: `npm run build`
Expected: 성공. `/subscription`·`/adoption`이 기존과 동일하게 정적 프리렌더 목록에 남아 있는지 확인 (둘 다 클라이언트 fetch 구조라 빌드 산출물 유형이 바뀌면 안 됨).

- [ ] **Step 5: Commit**

```bash
git add app/subscription/page.tsx app/adoption/page.tsx
git commit -m "feat(pages): freshness banner on /subscription and /adoption

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
