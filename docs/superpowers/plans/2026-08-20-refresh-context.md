# 새로고침 컨텍스트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Header 새로고침 버튼이 16개 페이지 전부에서 실제로 데이터를 재조회하게 한다 (기간 선택·화면 상태 유지).

**Architecture:** `RefreshProvider`(nonce 카운터)를 레이아웃에 추가, Header가 nonce 범프+router.refresh 병행, 14개 클라이언트 페치 파일의 useEffect 의존성에 nonce 추가. 구조 테스트가 미래의 미배선을 차단.

**Spec:** `docs/superpowers/specs/2026-08-20-refresh-context-design.md`

## Global Constraints

- 의도적 제외 5종(ReleaseNotesDialog/UserDetailPanel/UserModelUsage/analyze/changelog)은 절대 배선하지 않는다.
- NEVER npm install/ci; NEVER touch .claude/settings.json. `npm run build` denied 시 보고만.
- 검증: `npx jest` + `npm run build`. 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 컨텍스트 + 레이아웃 + Header + 구조 테스트(RED 상태로 커밋하지 않음 — Task 2와 한 브랜치에서 순차)

**Files:**
- Create: `lib/refresh.tsx`, `tests/structure/refresh-wiring.test.ts`
- Modify: `app/layout.tsx`, `app/components/layout/Header.tsx`, `lib/CLAUDE.md`, `app/CLAUDE.md`, `app/components/CLAUDE.md`

**Interfaces:** Produces: `RefreshProvider`, `useRefresh(): { nonce: number; refresh: () => void }` from `@/lib/refresh`.

- [ ] **Step 1: `lib/refresh.tsx`**

```tsx
'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface RefreshContextValue {
  nonce: number;
  refresh: () => void;
}

// Default keeps useRefresh safe outside the provider (SSR, tests): nonce is
// stable 0 and refresh is a no-op.
const RefreshContext = createContext<RefreshContextValue>({ nonce: 0, refresh: () => {} });

/**
 * Global manual-refresh signal. Header's 새로고침 button bumps `nonce`; every
 * client page includes `nonce` in its fetch-useEffect deps, so a bump re-runs
 * the SAME code path the days picker already exercises — days selection,
 * scroll, and open panels are preserved. router.refresh() alone cannot do
 * this: it re-renders server components only and never re-runs client effects
 * (the original bug — the button was a no-op on 15 of 16 pages).
 */
export function RefreshProvider({ children }: { children: React.ReactNode }) {
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo(() => ({ nonce, refresh }), [nonce, refresh]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export function useRefresh(): RefreshContextValue {
  return useContext(RefreshContext);
}
```

- [ ] **Step 2: `app/layout.tsx`** — import `RefreshProvider` from `@/lib/refresh`; 기존 프로바이더 체인(I18nProvider/ThemeProvider가 감싸는 지점)을 읽고 같은 깊이에 `<RefreshProvider>`를 추가해 전체 앱을 감싼다 (기존 중첩 순서 유지, Provider 하나 추가만).

- [ ] **Step 3: `Header.tsx`** — import `useRefresh`; 컴포넌트에서 `const { refresh } = useRefresh();`; 버튼을:

```tsx
          onClick={() => {
            // Bump the client-fetch nonce AND refresh server components: the
            // overview page fetches server-side, everything else client-side.
            refresh();
            router.refresh();
          }}
```

- [ ] **Step 4: 구조 테스트** — `tests/structure/refresh-wiring.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const APP_DIR = join(__dirname, '..', '..', 'app');

/**
 * Every client file that fetches /api data must be wired to the global
 * refresh nonce — otherwise Header's 새로고침 button silently skips it (the
 * original bug: router.refresh() never re-runs client effects).
 */
const EXEMPT = [
  // fetch-on-open semantics: a global refresh must not churn open modals,
  // and reopening already refetches.
  'components/ui/ReleaseNotesDialog.tsx',
  'components/ui/UserDetailPanel.tsx',
  'components/ui/UserModelUsage.tsx',
];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const fetchers = tsxFiles(APP_DIR).filter((f) => {
  const src = readFileSync(f, 'utf8');
  return /fetch\((["'`])\/api/.test(src);
});

describe('refresh wiring', () => {
  it('found the expected fetching files (guards the scan itself)', () => {
    expect(fetchers.length).toBeGreaterThanOrEqual(14);
  });

  it.each(fetchers.map((f) => [f.slice(f.indexOf('app/'))] as const))(
    '%s subscribes to useRefresh (or is exempt)',
    (rel) => {
      const full = join(APP_DIR, '..', rel);
      const src = readFileSync(full, 'utf8');
      const exempt = EXEMPT.some((e) => rel.endsWith(e));
      if (exempt) return;
      expect(src).toContain('useRefresh');
    },
  );
});
```

- [ ] **Step 5: RED 확인** — `npx jest tests/structure/refresh-wiring.test.ts` → 14개 파일이 아직 미배선이라 FAIL (예상된 RED — Task 2가 GREEN으로 만든다)

- [ ] **Step 6: 문서** — `lib/CLAUDE.md` Files 표(`infra-cost.ts` 행 아래): `| \`refresh.tsx\` | Global manual-refresh context — Header bumps \`nonce\`, every client fetch effect depends on it (pinned by tests/structure/refresh-wiring.test.ts); router.refresh() alone cannot re-run client effects |`; `app/CLAUDE.md` Layout 절에 `- RefreshProvider from lib/refresh.tsx — global 새로고침 nonce (Header button re-runs every client fetch effect)`; `app/components/CLAUDE.md` Header 항목에 동작 한 줄.

- [ ] **Step 7: Commit** (`feat(lib): global refresh context — Header button re-runs client fetch effects`)

---

### Task 2: 14개 파일 배선 (구조 테스트 GREEN)

**Files (Modify, 각각 2줄):** `app/adoption/page.tsx`, `app/credits/page.tsx`, `app/dev-activity/page.tsx`, `app/engagement/page.tsx`, `app/infra-cost/page.tsx`, `app/ingest-health/page.tsx`, `app/model-usage/page.tsx`, `app/productivity/page.tsx`, `app/rollout/page.tsx`, `app/subscription/page.tsx`, `app/trends/page.tsx`, `app/users/page.tsx`, `app/exec/page.tsx`, `app/components/OverviewClient.tsx`

- [ ] **Step 1: 각 파일에 동일 패턴 적용**
  1. import 추가: `import { useRefresh } from '@/lib/refresh';`
  2. 컴포넌트 본문 상단(기존 훅들 옆): `const { nonce } = useRefresh();`
  3. **데이터 fetch를 수행하는 useEffect의 의존성 배열**에 `nonce` 추가:
     `}, [days]);` → `}, [days, nonce]);` · infra-cost의 `}, []);` → `}, [nonce]);` ·
     exec/OverviewClient는 해당 fetch effect의 기존 배열에 `nonce`를 덧붙인다.
  주의: 파일당 fetch effect가 여러 개면(없을 것으로 예상) 모두에 추가. 다른 용도의
  useEffect(테마, 스크롤 등)에는 넣지 않는다.

- [ ] **Step 2: GREEN 확인** — `npx jest tests/structure/refresh-wiring.test.ts` → PASS

- [ ] **Step 3: 전체 검증** — `npx jest` 전체 PASS · `npm run build` 성공

- [ ] **Step 4: Commit** (`fix(ui): wire all client fetch effects to the refresh nonce`)
