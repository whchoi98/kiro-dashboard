# 스펙: IdC 사용자 표 — 상태 필터 + 타입 인지 컬럼 정렬

- 날짜: 2026-08-18
- 상태: 설계 승인됨 ("실행" 지시로 게이트 생략)
- 적용 위치: `app/components/charts/IdcUserStatus.tsx` (개요 페이지 IdC 사용자 현황)

## 1. 요구

관리자가 IdC 사용자 표를 (a) 상태별로 필터링(신규등록/활성/비활성)하고
(b) 아무 컬럼이나 클릭해 정렬(문자열/숫자 타입 구분)할 수 있어야 한다.
순수 클라이언트 기능 — API·서버·IAM 변경 없음.

사용자 결정: 필터는 **칩 버튼 행**(검색창 아래), 정렬은 **3단 사이클**
(오름차순 → 내림차순 → 기본 정렬 복귀).

## 2. 상태 필터

- 칩 4개: `all`(전체) / `active`(활성) / `inactive`(비활성) / `new`(신규 등록), 단일 선택, 기본 `all`
- 판정: `active`→`status==='active'`, `inactive`→`status==='inactive'`, `new`→`isNewRegistrant===true`
- 검색어와 **AND** 결합 (기존 `filtered` useMemo 확장; 적용 순서: 필터→검색→정렬)
- 스타일: 선택 `border-[#9046FF] text-[#9046FF] bg-[#9046FF]/10`, 비선택 `border-gray-800 text-gray-400 hover:text-gray-300` — dark-first, `dark:` 변형 금지
- 푸터 카운트 `N / total 등록됨` 표시 조건을 `search || statusFilter !== 'all'`로 확장
- i18n 신규 3키(ko/en): `idc.filter.all` 전체/All, `idc.filter.active` 활성/Active,
  `idc.filter.inactive` 비활성/Inactive. 신규 칩 라벨은 기존 `idc.newRegistrant` 재사용

## 3. 컬럼 정렬

### 3.1 `lib/table-sort.ts` (신규, 순수)

```ts
export type SortKind = 'string' | 'number';
export type SortDir = 'asc' | 'desc';
// 결측(null/undefined, string이면 '' 포함, number면 비number/NaN 포함)은
// 방향과 무관하게 항상 맨 뒤 — "마지막 활동" 정렬 시 값이 있는 행이 먼저 와야 한다.
export function compareByKey<T>(key: keyof T & string, kind: SortKind, dir: SortDir): (a: T, b: T) => number;
```

- string: `String(v).localeCompare` (lastActive는 YYYY-MM-DD라 사전순=시간순)
- number: 수치 차 비교

### 3.2 컴포넌트 배선

- `sort: { key, dir } | null` state — null이면 서버 기본 순서(활성→신규→비활성) 그대로, 복사 없음
- 9컬럼 전부 정렬 가능. kind 매핑: status/displayName/email/organization/lastActive = string;
  totalMessages/totalCredits/activeDays/daysSinceLastActive = number
- 헤더 클릭 사이클: 같은 컬럼 asc→desc→null, 다른 컬럼은 asc부터
- thead를 컬럼 설정 배열(`COLUMNS`) 기반 렌더로 리팩터 (9개 하드코딩 th 제거, 기존
  width/정렬 클래스 유지), 활성 컬럼에 ▲/▼(액센트색) + `aria-sort`
- 본문은 `sorted` useMemo(`[...filtered].sort(compareByKey(...))`) 렌더

## 4. 엣지 케이스

- 필터 결과 0행 → 기존 "No results" 행 재사용 (colSpan 9 유지)
- 비활성 사용자: lastActive null·daysSinceLastActive null → 결측 규칙으로 항상 뒤
- 컴포넌트 인터페이스의 optional 필드(activeDays? 등) → undefined도 결측 처리
- 신규 필터 + 사용자가 활동 시작(배지 소멸) → 자연스럽게 빈 결과 (정상)

## 5. 테스트 / 검증 / 문서

- `tests/lib/table-sort.test.ts`: string asc/desc, number asc/desc, null/undefined/''/NaN
  결측이 양방향 모두 맨 뒤, 결측끼리 동순위
- 검증: `npx jest` + `npm run build`
- 문서: `lib/CLAUDE.md`(table-sort.ts 행), `app/components/CLAUDE.md`(IdcUserStatus 행에 필터·정렬 절)
