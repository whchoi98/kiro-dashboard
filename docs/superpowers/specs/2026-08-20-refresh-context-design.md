# 스펙: 새로고침 버튼 수정 — RefreshProvider 컨텍스트 (옵션 B)

- 날짜: 2026-08-20
- 상태: 설계 승인됨
- 근본 원인: `Header.tsx:44`의 `router.refresh()`는 서버 컴포넌트만 재렌더 —
  클라이언트 `useEffect` fetch(16페이지 중 15)는 재실행되지 않아 버튼이 무동작.
  개요(`/`)만 서버 페치라 동작했음.

## 1. 설계

### `lib/refresh.tsx` (신규, 'use client')
```tsx
interface RefreshContextValue { nonce: number; refresh: () => void; }
export function RefreshProvider({ children }): JSX  // useState 카운터, useMemo value
export function useRefresh(): RefreshContextValue   // 기본값 {nonce:0, refresh:noop} — Provider 밖에서도 안전
```

### 배선
- `app/layout.tsx`: 기존 프로바이더 체인에 `RefreshProvider` 추가 (I18n/Theme와 동급)
- `Header.tsx` 버튼: `onClick={() => { refresh(); router.refresh(); }}` —
  nonce 범프(클라이언트 페치 재실행) + 기존 router.refresh(개요 서버 페치) 병행
- **14개 클라이언트 페치 파일**: `const { nonce } = useRefresh();` + fetch `useEffect`
  의존성 배열에 `nonce` 추가 (`[days]`→`[days, nonce]`, `[]`→`[nonce]`)
  - 12 페이지: adoption, credits, dev-activity, engagement, infra-cost,
    ingest-health, model-usage, productivity, rollout, subscription, trends, users
  - 2 컴포넌트: `OverviewClient.tsx`(days 변경 시 클라이언트 재페치 경로), `exec/page.tsx`

### 의도적 제외 (fetch-on-open/정적 — 전역 새로고침이 건드리면 안 됨)
- `ReleaseNotesDialog`·`UserDetailPanel`·`UserModelUsage`: 열릴 때 페치, 재오픈=재페치
- `/analyze`: 채팅 — 새로고침이 대화를 지우면 안 됨 (버튼은 무해한 router.refresh만)
- `/changelog`: 빌드 타임 정적

## 2. 회귀 방지 — 구조 테스트 (신규)
`tests/structure/refresh-wiring.test.ts` (date-literal-audit 관용구):
`app/**/*.tsx`에서 `fetch('/api` 또는 `` fetch(`/api ``를 포함하는 모든 파일은
`useRefresh`도 포함해야 한다. 허용 예외 목록(위 3개 컴포넌트) 명시.
→ 새 페이지가 fetch를 추가하며 nonce 배선을 잊으면 빌드가 깨진다.

## 3. 검증 / 문서
- `npx jest`(구조 테스트 RED→GREEN 포함) + `npm run build`
- 문서: `lib/CLAUDE.md`(refresh.tsx 행), `app/CLAUDE.md`(Layout 절 Provider 추가),
  `app/components/CLAUDE.md`(Header 행에 동작 설명)
