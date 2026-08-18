# IdC 필터 + 컬럼 정렬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IdC 사용자 표에 상태 필터 칩(전체/활성/비활성/신규 등록)과 9컬럼 타입 인지 정렬(3단 사이클)을 추가한다.

**Architecture:** 비교자는 순수 함수 `lib/table-sort.ts`(jest 대상), UI는 `IdcUserStatus.tsx`에서 `filtered`(필터+검색) → `sorted`(정렬) useMemo 2단. thead는 컬럼 설정 배열 기반으로 리팩터. API·서버 변경 없음.

**Tech Stack:** React 18, TypeScript, Tailwind v4 (dark-first), jest(ts-jest).

**Spec:** `docs/superpowers/specs/2026-08-18-idc-filter-sort-design.md`

## Global Constraints

- 스타일은 dark-first 클래스만, `dark:`/`light:` 변형 금지. 액센트는 `#9046FF` 계열만.
- 사용자 노출 문자열은 ko/en 양쪽 키 필수. `t(key)`는 보간 없음.
- 결측값(null/undefined, string이면 `''`, number면 비number/NaN)은 정렬 방향과 무관하게 **항상 맨 뒤**.
- 검증: `npx jest` + `npm run build`만 (`.eslintrc` 부재). jest는 `tests/**/*.test.ts`만 수집.
- NEVER run `npm install`/`npm ci`; NEVER touch `.claude/settings.json`.
- 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: `lib/table-sort.ts` + 테스트 + lib 문서

**Files:**
- Create: `lib/table-sort.ts`
- Test: `tests/lib/table-sort.test.ts`
- Modify: `lib/CLAUDE.md` (Files 표의 `first-seen.ts` 행 바로 아래에 행 추가)

**Interfaces:**
- Produces (Task 2가 import): `type SortKind = 'string' | 'number'`, `type SortDir = 'asc' | 'desc'`, `compareByKey<T>(key: keyof T & string, kind: SortKind, dir: SortDir): (a: T, b: T) => number`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/table-sort.test.ts`:

```ts
import { compareByKey } from '@/lib/table-sort';

interface Row {
  name: string | null;
  count: number | null;
  note?: string;
}

const rows: Row[] = [
  { name: 'charlie', count: 3 },
  { name: 'alice', count: 10 },
  { name: 'bob', count: null },
  { name: null, count: 1 },
  { name: '', count: 7 },
];

describe('compareByKey — string kind', () => {
  it('sorts ascending with null and empty-string always last', () => {
    const sorted = [...rows].sort(compareByKey<Row>('name', 'string', 'asc'));
    expect(sorted.map((r) => r.name)).toEqual(['alice', 'bob', 'charlie', null, '']);
  });

  it('sorts descending with null and empty-string still last', () => {
    const sorted = [...rows].sort(compareByKey<Row>('name', 'string', 'desc'));
    expect(sorted.map((r) => r.name)).toEqual(['charlie', 'bob', 'alice', null, '']);
  });

  it('treats undefined as missing (optional fields)', () => {
    const withUndef: Row[] = [{ name: 'a', count: 1, note: 'z' }, { name: 'b', count: 2 }];
    const sorted = [...withUndef].sort(compareByKey<Row>('note', 'string', 'asc'));
    expect(sorted.map((r) => r.name)).toEqual(['a', 'b']);
  });
});

describe('compareByKey — number kind', () => {
  it('sorts ascending numerically (not lexicographically) with null last', () => {
    const sorted = [...rows].sort(compareByKey<Row>('count', 'number', 'asc'));
    expect(sorted.map((r) => r.count)).toEqual([1, 3, 7, 10, null]);
  });

  it('sorts descending with null still last', () => {
    const sorted = [...rows].sort(compareByKey<Row>('count', 'number', 'desc'));
    expect(sorted.map((r) => r.count)).toEqual([10, 7, 3, 1, null]);
  });

  it('treats NaN as missing', () => {
    const withNaN = [{ v: NaN }, { v: 2 }, { v: 1 }];
    const sorted = [...withNaN].sort(compareByKey<{ v: number }>('v', 'number', 'asc'));
    expect(sorted.map((r) => r.v)).toEqual([1, 2, NaN]);
  });

  it('missing values compare equal to each other', () => {
    const cmp = compareByKey<Row>('count', 'number', 'asc');
    expect(cmp({ name: 'x', count: null }, { name: 'y', count: null })).toBe(0);
  });
});
```

주의: 첫 테스트의 기대 순서에서 `null`과 `''`는 둘 다 결측이므로 **원본 상대 순서 유지**(`Array.prototype.sort`는 ES2019+ 안정 정렬) — rows에서 null(4번째)이 ''(5번째)보다 앞.

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/lib/table-sort.test.ts`
Expected: FAIL — `Cannot find module '@/lib/table-sort'`

- [ ] **Step 3: 구현**

`lib/table-sort.ts`:

```ts
export type SortKind = 'string' | 'number';
export type SortDir = 'asc' | 'desc';

// Missing values (null/undefined; '' for strings; non-number/NaN for numbers)
// sort LAST regardless of direction: sorting by "last active" should surface
// rows that HAVE a value first, both ascending and descending.
export function compareByKey<T>(
  key: keyof T & string,
  kind: SortKind,
  dir: SortDir,
): (a: T, b: T) => number {
  const sign = dir === 'asc' ? 1 : -1;
  const isMissing = (v: unknown): boolean => {
    if (v === null || v === undefined) return true;
    if (kind === 'string') return v === '';
    return typeof v !== 'number' || Number.isNaN(v);
  };
  return (a, b) => {
    const av = a[key] as unknown;
    const bv = b[key] as unknown;
    const aMissing = isMissing(av);
    const bMissing = isMissing(bv);
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    if (kind === 'number') return sign * ((av as number) - (bv as number));
    return sign * String(av).localeCompare(String(bv));
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/lib/table-sort.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: `lib/CLAUDE.md` Files 표 갱신** — `first-seen.ts` 행 바로 아래에 추가:

```markdown
| `table-sort.ts` | Type-aware table comparator — `compareByKey<T>(key, kind: 'string'|'number', dir)`; missing values (null/undefined/''/NaN) always sort last regardless of direction; consumed by the IdC user table's column sorting |
```

- [ ] **Step 6: Commit**

```bash
git add lib/table-sort.ts tests/lib/table-sort.test.ts lib/CLAUDE.md
git commit -m "feat(lib): type-aware table comparator with missing-last semantics

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 컴포넌트 배선 (칩 필터 + 정렬 thead) + i18n + 전체 검증

**Files:**
- Modify: `app/components/charts/IdcUserStatus.tsx`
- Modify: `lib/i18n.tsx` (ko/en 두 곳)
- Modify: `app/components/CLAUDE.md` (IdcUserStatus.tsx 행에 필터·정렬 절 추가)

**Interfaces:**
- Consumes (Task 1): `compareByKey`, `SortKind`, `SortDir` from `@/lib/table-sort`

- [ ] **Step 1: i18n ko 키 추가** — `'idc.awaitingFirst': '신규 등록 (첫 리포트 대기)',` 바로 아래:

```ts
    'idc.filter.all': '전체',
    'idc.filter.active': '활성',
    'idc.filter.inactive': '비활성',
```

- [ ] **Step 2: i18n en 키 추가** — en 블록의 `'idc.awaitingFirst': 'New (awaiting first report)',` 바로 아래:

```ts
    'idc.filter.all': 'All',
    'idc.filter.active': 'Active',
    'idc.filter.inactive': 'Inactive',
```

- [ ] **Step 3: import + 타입/설정 추가** (`IdcUserStatus.tsx`)

import 블록에 추가:
```ts
import { compareByKey, SortDir, SortKind } from '@/lib/table-sort';
```

`BUCKET_COLORS` 선언 위에 추가:
```ts
type StatusFilter = 'all' | 'active' | 'inactive' | 'new';

const FILTER_LABEL_KEYS: Record<StatusFilter, string> = {
  all: 'idc.filter.all',
  active: 'idc.filter.active',
  inactive: 'idc.filter.inactive',
  new: 'idc.newRegistrant',
};

type SortKey =
  | 'status'
  | 'displayName'
  | 'email'
  | 'organization'
  | 'totalMessages'
  | 'totalCredits'
  | 'activeDays'
  | 'lastActive'
  | 'daysSinceLastActive';

// Column config drives BOTH the thead render and the comparator kind.
// thClass values are verbatim from the previous hardcoded <th> blocks.
const COLUMNS: Array<{ key: SortKey; labelKey: string; kind: SortKind; thClass: string }> = [
  { key: 'status', labelKey: 'idc.status', kind: 'string', thClass: 'text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-24' },
  { key: 'displayName', labelKey: 'idc.name', kind: 'string', thClass: 'text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-40' },
  { key: 'email', labelKey: 'idc.email', kind: 'string', thClass: 'text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider min-w-[220px]' },
  { key: 'organization', labelKey: 'idc.org', kind: 'string', thClass: 'text-left px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-44' },
  { key: 'totalMessages', labelKey: 'metric.messages', kind: 'number', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-28' },
  { key: 'totalCredits', labelKey: 'metric.credits', kind: 'number', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-28' },
  { key: 'activeDays', labelKey: 'idc.activeDays', kind: 'number', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-24' },
  { key: 'lastActive', labelKey: 'idc.lastActive', kind: 'string', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-32' },
  { key: 'daysSinceLastActive', labelKey: 'idc.daysSinceActive', kind: 'number', thClass: 'text-right px-4 py-3 text-gray-500 font-semibold uppercase tracking-wider w-24' },
];
```

- [ ] **Step 4: state + useMemo 확장**

`const [search, setSearch] = useState('');` 아래에 추가:
```ts
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);

  // asc → desc → back to the server's default order (active → new → inactive).
  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };
```

기존 `filtered` useMemo 전체를 다음으로 교체 (필터 → 검색 순):
```ts
  const filtered = useMemo(() => {
    let rows = data.users;
    if (statusFilter === 'active') rows = rows.filter((u) => u.status === 'active');
    else if (statusFilter === 'inactive') rows = rows.filter((u) => u.status === 'inactive');
    else if (statusFilter === 'new') rows = rows.filter((u) => u.isNewRegistrant);
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.organization.toLowerCase().includes(q),
    );
  }, [data.users, search, statusFilter]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = COLUMNS.find((c) => c.key === sort.key);
    if (!col) return filtered;
    return [...filtered].sort(compareByKey<IdcUserStatus>(sort.key, col.kind, sort.dir));
  }, [filtered, sort]);
```

- [ ] **Step 5: 칩 필터 행 추가** — 검색 `<input …/>`을 감싸는 `<div className="relative">…</div>` 닫힌 직후에:

```tsx
      <div className="flex flex-wrap gap-2">
        {(['all', 'active', 'inactive', 'new'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              statusFilter === f
                ? 'border-[#9046FF] text-[#9046FF] bg-[#9046FF]/10'
                : 'border-gray-800 text-gray-400 hover:text-gray-300'
            }`}
          >
            {t(FILTER_LABEL_KEYS[f])}
          </button>
        ))}
      </div>
```

- [ ] **Step 6: thead를 COLUMNS 기반으로 교체** — 기존 `<thead>…</thead>`(하드코딩 `<th>` 9개) 전체를 다음으로 교체:

```tsx
          <thead>
            <tr className="border-b border-gray-800 bg-gray-900/70">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  aria-sort={
                    sort?.key === col.key
                      ? sort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className={`${col.thClass} cursor-pointer select-none hover:text-gray-300`}
                >
                  {t(col.labelKey)}
                  {sort?.key === col.key && (
                    <span className="text-[#9046FF]">{sort.dir === 'asc' ? ' ▲' : ' ▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
```

- [ ] **Step 7: 본문·빈 상태·푸터 배선**

- `{filtered.length === 0 && (` → `{sorted.length === 0 && (` (빈 상태 행, colSpan 9 유지)
- `{filtered.map((user) => {` → `{sorted.map((user) => {`
- 푸터 조건 `{search && (` → `{(search || statusFilter !== 'all') && (` — 내부의 `filtered.length`는 그대로

- [ ] **Step 8: 전체 검증**

Run: `npx jest` → 전체 PASS (기존 450 + Task 1의 7 = 457)
Run: `npm run build` → 성공 (denied면 재시도·설정변경 금지, DONE_WITH_CONCERNS로 보고)

- [ ] **Step 9: `app/components/CLAUDE.md` 갱신** — IdcUserStatus.tsx 행의 설명 끝에 추가:

```
; status filter chips (all/active/inactive/new, ANDed with search) and 9-column type-aware sorting (asc→desc→default cycle, missing values always last) via lib/table-sort.ts
```

- [ ] **Step 10: Commit**

```bash
git add app/components/charts/IdcUserStatus.tsx lib/i18n.tsx app/components/CLAUDE.md
git commit -m "feat(ui): status filter chips and type-aware column sorting on IdC user table

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
