# 챗봇 `list_idc_users` 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/api/idc-users`의 조립 로직을 `lib/idc-users.ts`로 무회귀 추출하고, 챗봇에 마스킹 유지 `list_idc_users` 도구를 추가한다.

**Architecture:** Task 1은 순수 이동(라우트는 얇은 래퍼로), Task 2는 기존 `lookup_users` 패턴을 따르는 세 번째 도구 + 순수 필터 함수 + 프롬프트 안내.

**Tech Stack:** Next.js 14 route handlers, Bedrock Converse tools, jest.

**Spec:** `docs/superpowers/specs/2026-08-18-analyze-idc-tool-design.md`

## Global Constraints

- Task 1은 **동작 변경 0** — `/api/idc-users` 응답 JSON은 바이트 수준에서 동일해야 하며, `tests/api/route-empty-responses.test.ts`(모듈 경로 기반 mock — 이동 후에도 유효)가 그대로 통과해야 한다.
- 도구 출력의 이름/이메일/조직은 lib가 이미 마스킹한 값 그대로 — 추가 해제/복원 금지.
- SQL은 반드시 `isoDateLiteral` 유지(감사 대상에 lib/idc-users.ts 추가). `CURRENT_DATE`/`DATE_ADD` 금지.
- NEVER run `npm install`/`npm ci`; NEVER touch `.claude/settings.json`.
- 검증: `npx jest` + `npm run build`. 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: `lib/idc-users.ts` 추출 (무회귀) + 감사망 확장

**Files:**
- Create: `lib/idc-users.ts`
- Modify: `app/api/idc-users/route.ts` (얇은 래퍼로 전면 교체), `tests/api/date-literal-audit.test.ts`, `lib/CLAUDE.md`, `app/api/CLAUDE.md`

**Interfaces:**
- Produces (Task 2가 import): `getIdcUsersPayload(days: number): Promise<IdcUsersPayload>`; `export interface IdcUserStatus`(기존 라우트의 것 그대로); `export interface IdcUsersPayload { total: number; active: number; inactive: number; newRegistrants: number; windowDays: number; dormancy: DormancySummary[]; funnel: FunnelStep[]; users: IdcUserStatus[] }`

- [ ] **Step 1: `lib/idc-users.ts` 생성 — 라우트에서 그대로 이동**

`app/api/idc-users/route.ts`에서 다음을 **텍스트 그대로**(주석 포함) 이동한다:
`IdcUserStatus` 인터페이스(export 유지), `BUCKET_ORDER`, `SUSTAINED_ACTIVE_DAYS`, `gradeDormancy`, `daysSince`, `identityClient`, `fetchAllIdcUsers`, `UserStats`, `fetchActiveUserStats`.
필요 import도 함께 이동: `@/lib/athena`(executeQuery, safeFloat, safeInt, NORMALIZE_USERID, isMissingTableError), `@/lib/glue`, `@/lib/athena-window`, `@/lib/mask`, `@/types/dashboard`(DormancyBucket, DormancySummary, FunnelStep), `@aws-sdk/client-identitystore`, `@/lib/first-seen`.

파일 끝에 추가 (본문은 기존 GET try 블록 내부를 그대로 옮김 — `const days` 파싱과 최외곽 try/catch·NextResponse만 제외):

```ts
export interface IdcUsersPayload {
  total: number;
  active: number;
  inactive: number;
  newRegistrants: number;
  windowDays: number;
  dormancy: DormancySummary[];
  funnel: FunnelStep[];
  users: IdcUserStatus[];
}

/**
 * The full /api/idc-users assembly, extracted so the analyze chatbot's
 * list_idc_users tool shares ONE implementation with the route. Behavior
 * is identical to the pre-extraction route: the missing-table degrade and
 * the first-seen ledger try/catch both live HERE; only the outer 500
 * handler stays in the route.
 */
export async function getIdcUsersPayload(days: number): Promise<IdcUsersPayload> {
  // <기존 GET의 `const [idcUsers, activeStatsMap] = await Promise.all([...])`부터
  //  `return NextResponse.json({...})` 직전까지 본문을 그대로 붙여넣고,
  //  마지막의 `return NextResponse.json({ ... })`만 `return { ... };`로 바꾼다>
}
```

- [ ] **Step 2: 라우트를 얇은 래퍼로 교체** — `app/api/idc-users/route.ts` 전체를 다음으로:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getIdcUsersPayload } from '@/lib/idc-users';

// Thin wrapper: the whole assembly lives in lib/idc-users.ts so the analyze
// chatbot's list_idc_users tool shares one implementation with this route.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.ceil(parseFloat(searchParams.get('days') ?? '90')));
    return NextResponse.json(await getIdcUsersPayload(days));
  } catch (err) {
    console.error('[/api/idc-users] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch IdC users' }, { status: 500 });
  }
}
```

- [ ] **Step 3: 감사 테스트 확장** — `tests/api/date-literal-audit.test.ts`에서 `const EXEMPT = ['analyze'];` 아래에 추가:

```ts
/**
 * SQL that used to live in a route and moved to lib keeps the same audit:
 * result reuse dies just as silently there.
 */
const SQL_LIBS = [join(__dirname, '..', '..', 'lib', 'idc-users.ts')];
```

그리고 테스트가 파일 목록을 만드는 지점에서 `routeFiles(API_DIR)`에 `...SQL_LIBS`를 합친다 (relative() 표시가 lib 경로에서도 자연스럽도록 필요 시 표시 함수만 최소 수정).

- [ ] **Step 4: 검증** — `npx jest` 전체 PASS(무회귀: route-empty-responses 포함 461) · `npx tsc --noEmit 2>&1 | grep -E "^(app|lib|types)/"` 출력 없음

- [ ] **Step 5: 문서** — `lib/CLAUDE.md` Files 표(`table-sort.ts` 행 아래):

```markdown
| `idc-users.ts` | The full IdC directory assembly extracted from `/api/idc-users` (IdentityStore walk + Athena activity stats + first-seen ledger + dormancy/funnel + masking) — `getIdcUsersPayload(days)`; shared by the route (thin wrapper) and the analyze chatbot's `list_idc_users` tool. Its SQL is covered by tests/api/date-literal-audit.test.ts |
```

`app/api/CLAUDE.md`의 `/api/idc-users` 행 설명 끝에 `— thin wrapper over lib/idc-users.ts` 추가.

- [ ] **Step 6: Commit**

```bash
git add lib/idc-users.ts app/api/idc-users/route.ts tests/api/date-literal-audit.test.ts lib/CLAUDE.md app/api/CLAUDE.md
git commit -m "refactor(api): extract idc-users assembly into lib for tool reuse

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `list_idc_users` 도구 + 프롬프트 + 필터 테스트

**Files:**
- Modify: `lib/idc-users.ts` (filterIdcUsers 추가), `app/api/analyze/route.ts`, `lib/analyze-prompt.ts`, `lib/CLAUDE.md`, `app/api/CLAUDE.md`
- Test: `tests/lib/idc-users-filter.test.ts`

**Interfaces:**
- Consumes (Task 1): `getIdcUsersPayload`, `IdcUserStatus`, `IdcUsersPayload`
- Produces: `filterIdcUsers(users: IdcUserStatus[], filter: IdcFilter, limit: number): { users: IdcUserStatus[]; truncated: boolean }`, `type IdcFilter = 'all' | 'active' | 'inactive' | 'new'`

- [ ] **Step 1: 실패하는 테스트** — `tests/lib/idc-users-filter.test.ts`:

```ts
import { filterIdcUsers, IdcUserStatus } from '@/lib/idc-users';

function mkUser(over: Partial<IdcUserStatus>): IdcUserStatus {
  return {
    userId: 'u',
    displayName: 'Ma****',
    email: 'ma***@ex*****',
    status: 'inactive',
    totalMessages: 0,
    totalCredits: 0,
    lastActive: null,
    organization: 'ex*****',
    daysSinceLastActive: null,
    activeDays: 0,
    dormancy: 'never',
    firstSeenAt: null,
    isNewRegistrant: false,
    ...over,
  };
}

const USERS: IdcUserStatus[] = [
  mkUser({ userId: 'a', status: 'active', dormancy: 'active7' }),
  mkUser({ userId: 'n', isNewRegistrant: true, firstSeenAt: '2026-08-18T05:57:00Z' }),
  mkUser({ userId: 'i1' }),
  mkUser({ userId: 'i2' }),
];

describe('filterIdcUsers', () => {
  it("'all' returns everyone in order", () => {
    const { users, truncated } = filterIdcUsers(USERS, 'all', 50);
    expect(users.map((u) => u.userId)).toEqual(['a', 'n', 'i1', 'i2']);
    expect(truncated).toBe(false);
  });

  it("'active' / 'inactive' split on status", () => {
    expect(filterIdcUsers(USERS, 'active', 50).users.map((u) => u.userId)).toEqual(['a']);
    expect(filterIdcUsers(USERS, 'inactive', 50).users.map((u) => u.userId)).toEqual(['n', 'i1', 'i2']);
  });

  it("'new' returns only new registrants", () => {
    expect(filterIdcUsers(USERS, 'new', 50).users.map((u) => u.userId)).toEqual(['n']);
  });

  it('caps at limit and flags truncation', () => {
    const { users, truncated } = filterIdcUsers(USERS, 'all', 2);
    expect(users.map((u) => u.userId)).toEqual(['a', 'n']);
    expect(truncated).toBe(true);
  });

  it('clamps limit into [1, 200]', () => {
    expect(filterIdcUsers(USERS, 'all', 0).users).toHaveLength(1);
    expect(filterIdcUsers(USERS, 'all', 9999).users).toHaveLength(4);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest tests/lib/idc-users-filter.test.ts` → FAIL (filterIdcUsers 미존재)

- [ ] **Step 3: `filterIdcUsers` 구현** — `lib/idc-users.ts` 끝에:

```ts
export type IdcFilter = 'all' | 'active' | 'inactive' | 'new';

// Pure subset+cap for the analyze chatbot's list_idc_users tool. The cap
// bounds tool-result tokens; `truncated` tells the model the list is partial.
export function filterIdcUsers(
  users: IdcUserStatus[],
  filter: IdcFilter,
  limit: number,
): { users: IdcUserStatus[]; truncated: boolean } {
  const cap = Math.max(1, Math.min(200, Math.floor(limit) || 1));
  let rows = users;
  if (filter === 'active') rows = users.filter((u) => u.status === 'active');
  else if (filter === 'inactive') rows = users.filter((u) => u.status === 'inactive');
  else if (filter === 'new') rows = users.filter((u) => u.isNewRegistrant);
  return { users: rows.slice(0, cap), truncated: rows.length > cap };
}
```

- [ ] **Step 4: 통과 확인** — `npx jest tests/lib/idc-users-filter.test.ts` → PASS (5 tests)

- [ ] **Step 5: 도구 등록** — `app/api/analyze/route.ts`:

import 추가:
```ts
import { getIdcUsersPayload, filterIdcUsers, IdcFilter } from '@/lib/idc-users';
```

`tools` 배열의 `lookup_users` toolSpec 뒤에 추가:
```ts
  {
    toolSpec: {
      name: 'list_idc_users',
      description:
        'List IAM Identity Center directory users with activity status, dormancy grade, and new-registrant flag (registered <=7 days ago, no activity report yet). Names/emails are masked by policy. Use this — not SQL — for questions about the directory, registrations, or new registrants; that data is not in the Athena tables.',
      inputSchema: {
        json: {
          type: 'object',
          properties: {
            filter: {
              type: 'string',
              enum: ['all', 'active', 'inactive', 'new'],
              description: "Subset to return (default 'all'). 'new' = new registrants awaiting their first report.",
            },
            days: {
              type: 'number',
              description: 'Activity window in days for active/dormancy grading (default 90)',
            },
            limit: {
              type: 'number',
              description: 'Max users to return (default 50, max 200)',
            },
          },
          required: [],
        },
      },
    },
  },
```

`executeToolCall`의 `lookup_users` 블록 뒤(Unknown tool 반환 전)에 추가:
```ts
  if (name === 'list_idc_users') {
    try {
      const days = Math.max(1, Math.ceil(Number(input.days) || 90));
      const filter: IdcFilter = (['all', 'active', 'inactive', 'new'] as IdcFilter[]).includes(
        input.filter as IdcFilter,
      )
        ? (input.filter as IdcFilter)
        : 'all';
      const limit = Number(input.limit) || 50;
      const payload = await getIdcUsersPayload(days);
      const { users, truncated } = filterIdcUsers(payload.users, filter, limit);
      return {
        result: JSON.stringify({
          total: payload.total,
          active: payload.active,
          inactive: payload.inactive,
          newRegistrants: payload.newRegistrants,
          windowDays: payload.windowDays,
          filter,
          truncated,
          users,
        }),
        rowCount: users.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { result: JSON.stringify({ error: message }), rowCount: 0 };
    }
  }
```

- [ ] **Step 6: 프롬프트 갱신** — `lib/analyze-prompt.ts`의 `SYSTEM_PROMPT_BASE`에서 `- Always include data tables and key insights.` 줄 **앞**에 추가:

```
TOOLS BEYOND SQL:
- list_idc_users returns the IAM Identity Center directory joined with activity status, dormancy grade, and the new-registrant flag (registered <=7 days ago, no activity report yet). Use it — NOT SQL — for questions about the directory, who registered, or new registrants: that data does not exist in the Athena tables.
- lookup_users resolves user IDs to display name / email / organization.
- Names, emails, and organizations from these tools are MASKED by policy (e.g. 'Jo********', 'ad***@wh*******'). Present them exactly as returned; never guess or reconstruct originals. The stable identifier is userId (UUID).
- The directory is NOT a Kiro subscription roster: a user with no activity may simply have no subscription. Never present inactive directory users as wasted licenses or seats.
```

- [ ] **Step 7: 전체 검증** — `npx jest` 전체 PASS(461 + 5 = 466) · `npm run build` 성공 (denied면 보고만)

- [ ] **Step 8: 문서** — `lib/CLAUDE.md`의 `analyze-prompt.ts` 행이 있으면 "documents the three tools (query_athena, lookup_users, list_idc_users) and the masking rule" 취지로 갱신(없으면 idc-users.ts 행에 도구 공유 언급으로 충분). `app/api/CLAUDE.md`의 `/api/analyze` 행 설명에 `+ list_idc_users tool (directory/new-registrant questions; masked)` 추가.

- [ ] **Step 9: Commit**

```bash
git add lib/idc-users.ts app/api/analyze/route.ts lib/analyze-prompt.ts tests/lib/idc-users-filter.test.ts lib/CLAUDE.md app/api/CLAUDE.md
git commit -m "feat(analyze): list_idc_users tool — chatbot can answer directory/new-registrant questions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
