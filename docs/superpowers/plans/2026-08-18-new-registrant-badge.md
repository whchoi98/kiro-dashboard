# 신규 등록(첫 리포트 대기) 배지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IdC 사용자 현황에서 "등록됐지만 첫 리포트를 기다리는" 사용자를 S3 first-seen 원장 기반 배지·정렬·카운트로 식별한다.

**Architecture:** 순수 로직은 `lib/first-seen.ts`(applyLedger/withinNewRegistrantWindow — jest 대상), S3 GET/PUT은 같은 파일의 IO 함수로 분리. `/api/idc-users`가 원장을 읽고(실패 시 배지 없이 안전 저하) `firstSeenAt`/`isNewRegistrant`를 부여, UI는 배지+4번째 StatCard+3단 정렬로 표시. IAM·CDK 변경 없음.

**Tech Stack:** Next.js 14, @aws-sdk/client-s3 (기존 의존성), jest(ts-jest).

**Spec:** `docs/superpowers/specs/2026-08-18-new-registrant-badge-design.md`

## Global Constraints

- IAM·CDK 변경 금지 — 원장은 태스크 롤이 이미 쓰기 가능한 `ATHENA_OUTPUT_BUCKET` 프리픽스에만 둔다.
- 원장 GET/PUT 실패는 **절대** 목록 응답을 깨지 않는다 (try/catch → 배지 없이 렌더).
- `NEW_REGISTRANT_DAYS = 7` (상수, lib/first-seen.ts).
- 스타일은 dark-first 클래스만, `dark:`/`light:` 변형 금지. 배지는 `bg-[#9046FF]/10 text-[#9046FF]` (기존 emerald 필 관용구).
- 사용자 노출 문자열은 ko/en 양쪽 키 필수 (`lib/i18n.tsx`).
- 검증은 `npx jest` + `npm run build`만 (`.eslintrc` 부재로 lint 불가). jest는 `tests/**/*.test.ts`만 수집.
- 커밋 트레일러: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: `lib/first-seen.ts` + 테스트 + lib 문서

**Files:**
- Create: `lib/first-seen.ts`
- Test: `tests/lib/first-seen.test.ts`
- Modify: `lib/CLAUDE.md` (Files 표의 `freshness.ts` 행 바로 아래에 행 추가)

**Interfaces:**
- Consumes: `@aws-sdk/client-s3` (기존 의존성), env `ATHENA_OUTPUT_BUCKET`, `AWS_REGION`
- Produces (Task 2가 import):
  - `NEW_REGISTRANT_DAYS: number` (= 7)
  - `interface FirstSeenLedger { version: 1; seededAt: string; users: Record<string, string | null> }`
  - `applyLedger(ledger: FirstSeenLedger | null, currentIds: string[], nowIso: string): { ledger: FirstSeenLedger; changed: boolean }`
  - `withinNewRegistrantWindow(firstSeen: string | null | undefined, nowMs: number): boolean`
  - `loadLedger(): Promise<FirstSeenLedger | null>` / `saveLedger(l: FirstSeenLedger): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/first-seen.test.ts`:

```ts
import { applyLedger, withinNewRegistrantWindow, NEW_REGISTRANT_DAYS } from '@/lib/first-seen';

describe('applyLedger', () => {
  const NOW = '2026-08-18T12:00:00.000Z';

  it('self-seeds every current id as null when no ledger exists', () => {
    const { ledger, changed } = applyLedger(null, ['a', 'b'], NOW);
    expect(changed).toBe(true);
    expect(ledger.users).toEqual({ a: null, b: null });
    expect(ledger.seededAt).toBe(NOW);
    expect(ledger.version).toBe(1);
  });

  it('stamps only ids missing from an existing ledger', () => {
    const existing = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { a: null as string | null } };
    const { ledger, changed } = applyLedger(existing, ['a', 'b'], NOW);
    expect(changed).toBe(true);
    expect(ledger.users).toEqual({ a: null, b: NOW });
  });

  it('reports changed=false and returns the same object when every id is known', () => {
    const existing = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { a: null as string | null, b: '2026-08-10T00:00:00Z' as string | null } };
    const { ledger, changed } = applyLedger(existing, ['a', 'b'], NOW);
    expect(changed).toBe(false);
    expect(ledger).toBe(existing);
  });

  it('keeps ledger entries for users deleted from the directory', () => {
    const existing = { version: 1 as const, seededAt: '2026-08-01T00:00:00Z', users: { gone: '2026-08-02T00:00:00Z' as string | null } };
    const { ledger } = applyLedger(existing, ['a'], NOW);
    expect(ledger.users.gone).toBe('2026-08-02T00:00:00Z');
    expect(ledger.users.a).toBe(NOW);
  });
});

describe('withinNewRegistrantWindow', () => {
  const now = Date.parse('2026-08-18T12:00:00.000Z');

  it('null / undefined / unparsable → false', () => {
    expect(withinNewRegistrantWindow(null, now)).toBe(false);
    expect(withinNewRegistrantWindow(undefined, now)).toBe(false);
    expect(withinNewRegistrantWindow('not-a-date', now)).toBe(false);
  });

  it('exactly at the 7-day boundary → true', () => {
    const atBoundary = new Date(now - NEW_REGISTRANT_DAYS * 86_400_000).toISOString();
    expect(withinNewRegistrantWindow(atBoundary, now)).toBe(true);
  });

  it('1ms past the 7-day boundary → false', () => {
    const past = new Date(now - NEW_REGISTRANT_DAYS * 86_400_000 - 1).toISOString();
    expect(withinNewRegistrantWindow(past, now)).toBe(false);
  });

  it('future stamp (clock skew) still counts as new', () => {
    const future = new Date(now + 60_000).toISOString();
    expect(withinNewRegistrantWindow(future, now)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/lib/first-seen.test.ts`
Expected: FAIL — `Cannot find module '@/lib/first-seen'`

- [ ] **Step 3: 구현**

`lib/first-seen.ts`:

```ts
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// Days a first-seen directory user counts as "신규 등록" while still inactive.
export const NEW_REGISTRANT_DAYS = 7;

export interface FirstSeenLedger {
  version: 1;
  seededAt: string;
  // null = seed batch (pre-existing user, never badged as new).
  users: Record<string, string | null>;
}

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

// The ledger lives under the Athena-results prefix because that is the only
// S3 location the task role can PUT to — no new IAM for this feature.
function ledgerLocation(): { bucket: string; key: string } | null {
  const raw = process.env.ATHENA_OUTPUT_BUCKET || '';
  if (!raw) return null;
  const [bucket, ...rest] = raw.replace('s3://', '').split('/');
  if (!bucket) return null;
  const prefix = rest.filter(Boolean).join('/');
  return { bucket, key: prefix ? `${prefix}/idc-first-seen.json` : 'idc-first-seen.json' };
}

export function applyLedger(
  ledger: FirstSeenLedger | null,
  currentIds: string[],
  nowIso: string,
): { ledger: FirstSeenLedger; changed: boolean } {
  if (ledger === null) {
    // First ever run: seed everyone as pre-existing so nobody is falsely
    // badged when the feature first deploys.
    const users: Record<string, string | null> = {};
    for (const id of currentIds) users[id] = null;
    return { ledger: { version: 1, seededAt: nowIso, users }, changed: true };
  }
  let changed = false;
  const users = { ...ledger.users };
  for (const id of currentIds) {
    if (!(id in users)) {
      users[id] = nowIso;
      changed = true;
    }
  }
  return { ledger: changed ? { ...ledger, users } : ledger, changed };
}

export function withinNewRegistrantWindow(
  firstSeen: string | null | undefined,
  nowMs: number,
): boolean {
  if (!firstSeen) return false;
  const seenMs = Date.parse(firstSeen);
  if (Number.isNaN(seenMs)) return false;
  // A stamp slightly in the future (clock skew) is still "new".
  return nowMs - seenMs <= NEW_REGISTRANT_DAYS * 86_400_000;
}

export async function loadLedger(): Promise<FirstSeenLedger | null> {
  const loc = ledgerLocation();
  if (!loc) return null;
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: loc.bucket, Key: loc.key }));
    const body = (await resp.Body?.transformToString()) ?? '';
    const parsed = JSON.parse(body);
    if (parsed?.version !== 1 || typeof parsed?.users !== 'object' || parsed.users === null) {
      // Unrecognized shape → treat as absent; the caller re-seeds (all null),
      // which self-heals a corrupt ledger at the cost of its history.
      return null;
    }
    return parsed as FirstSeenLedger;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (name === 'NoSuchKey' || status === 404) return null;
    throw err;
  }
}

export async function saveLedger(ledger: FirstSeenLedger): Promise<void> {
  const loc = ledgerLocation();
  if (!loc) return;
  await s3.send(new PutObjectCommand({
    Bucket: loc.bucket,
    Key: loc.key,
    Body: JSON.stringify(ledger),
    ContentType: 'application/json',
  }));
}
```

주의: `withinNewRegistrantWindow`의 boundary는 `<=` (정확히 7일 = true) — 테스트와 일치.

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/lib/first-seen.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: `lib/CLAUDE.md` Files 표 갱신** — `freshness.ts` 행 바로 아래에 추가:

```markdown
| `first-seen.ts` | S3 first-seen ledger for the IdC new-registrant badge — pure `applyLedger` (self-seeds all-null on first run so nobody is falsely badged) + `withinNewRegistrantWindow` (7-day window, `NEW_REGISTRANT_DAYS`), and `loadLedger`/`saveLedger` IO against `<ATHENA_OUTPUT_BUCKET>/idc-first-seen.json` (the only task-role-writable prefix); consumed by `/api/idc-users` |
```

- [ ] **Step 6: Commit**

```bash
git add lib/first-seen.ts tests/lib/first-seen.test.ts lib/CLAUDE.md
git commit -m "feat(lib): S3 first-seen ledger for IdC new-registrant detection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `/api/idc-users` — 원장 결합, 필드·정렬·카운트

**Files:**
- Modify: `app/api/idc-users/route.ts`
- Modify: `app/api/CLAUDE.md` (idc-users 행의 설명 갱신)

**Interfaces:**
- Consumes (Task 1): `applyLedger`, `withinNewRegistrantWindow`, `loadLedger`, `saveLedger` from `@/lib/first-seen`
- Produces (Task 3이 소비): `IdcUserStatus`에 `firstSeenAt: string | null`, `isNewRegistrant: boolean` 추가; 응답 JSON에 `newRegistrants: number` 추가

- [ ] **Step 1: import 추가** (기존 import 블록 아래)

```ts
import { applyLedger, withinNewRegistrantWindow, loadLedger, saveLedger } from '@/lib/first-seen';
```

- [ ] **Step 2: `export interface IdcUserStatus`에 필드 2개 추가** (`dormancy: DormancyBucket;` 아래)

```ts
  firstSeenAt: string | null;
  isNewRegistrant: boolean;
```

- [ ] **Step 3: GET 핸들러에서 원장 로드** — `const [idcUsers, activeStatsMap] = await Promise.all([...]);` 바로 다음에 삽입:

```ts
    // First-seen ledger — failures must never break the directory listing.
    let firstSeen: Record<string, string | null> = {};
    try {
      const { ledger, changed } = applyLedger(
        await loadLedger(),
        idcUsers.map((u) => u.userId),
        new Date().toISOString(),
      );
      if (changed) await saveLedger(ledger);
      firstSeen = ledger.users;
    } catch (err) {
      console.warn('[/api/idc-users] first-seen ledger unavailable:', err);
    }
    const nowMs = Date.now();
```

- [ ] **Step 4: users 매핑 수정** — `idcUsers.map((idcUser) => { ... })` 내부에서 `lastActive`/`daysSinceLastActive` 계산 다음에 dormancy를 지역 변수로 뽑고 두 필드를 추가:

기존:
```ts
      return {
        ...
        dormancy: gradeDormancy(daysSinceLastActive),
      };
```
변경:
```ts
      const dormancy = gradeDormancy(daysSinceLastActive);
      const firstSeenAt = firstSeen[idcUser.userId] ?? null;

      return {
        userId: idcUser.userId,
        displayName: maskText(idcUser.displayName),
        email: maskEmail(idcUser.email),
        status: isActive ? 'active' : 'inactive',
        totalMessages: isActive ? stats.totalMessages : 0,
        totalCredits: isActive ? stats.totalCredits : 0,
        lastActive,
        organization: maskText(organization),
        daysSinceLastActive,
        activeDays: isActive ? stats.activeDays : 0,
        dormancy,
        firstSeenAt,
        isNewRegistrant: dormancy === 'never' && withinNewRegistrantWindow(firstSeenAt, nowMs),
      };
```
(반환 객체 전체를 위 형태로 교체 — `dormancy: gradeDormancy(...)` 인라인 호출이 지역 변수 참조로 바뀌는 것 외에 기존 필드는 동일.)

- [ ] **Step 5: 정렬 교체** — 기존 `users.sort((a, b) => { ... });` 블록을 다음으로 교체:

```ts
    // Sort: active (messages desc) → new registrants (first-seen desc) → other
    // inactive (messages desc — all zero, so stable directory order).
    users.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1;
      }
      if (a.isNewRegistrant !== b.isNewRegistrant) {
        return a.isNewRegistrant ? -1 : 1;
      }
      if (a.isNewRegistrant && b.isNewRegistrant) {
        return (b.firstSeenAt ?? '').localeCompare(a.firstSeenAt ?? '');
      }
      return b.totalMessages - a.totalMessages;
    });
```

- [ ] **Step 6: 응답에 카운트 추가** — `NextResponse.json({ ... })`의 `inactive:` 다음 줄에:

```ts
      newRegistrants: users.filter((u) => u.isNewRegistrant).length,
```

- [ ] **Step 7: 타입 검증**

Run: `npx tsc --noEmit 2>&1 | grep -v "^tests/"`
Expected: 출력 없음 (기존 `tests/**`의 jest 전역 타입 노이즈만 존재 — 무시 대상)

- [ ] **Step 8: `app/api/CLAUDE.md` 갱신** — 엔드포인트 표의 `/api/idc-users` 행 설명을 다음으로 교체:

```markdown
| `GET /api/idc-users` | `idc-users/route.ts` | IAM Identity Center user list via IdentityStore SDK + dormancy grading, directory→activity funnel, and S3 first-seen ledger (`lib/first-seen.ts`) marking `isNewRegistrant` (registered ≤7d, no activity yet; ledger failure degrades to no badges) (masked) |
```

- [ ] **Step 9: Commit**

```bash
git add app/api/idc-users/route.ts app/api/CLAUDE.md
git commit -m "feat(api): idc-users first-seen ledger — firstSeenAt/isNewRegistrant + sort + count

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: UI 배지·StatCard·i18n + 전체 검증

**Files:**
- Modify: `app/components/charts/IdcUserStatus.tsx`
- Modify: `lib/i18n.tsx` (ko/en 두 곳)

**Interfaces:**
- Consumes (Task 2): 응답의 `newRegistrants: number`, user의 `isNewRegistrant: boolean`
- Produces: 사용자 노출 UI (후속 태스크 없음)

- [ ] **Step 1: i18n ko 키 추가** — `'idc.searchPlaceholder': '사용자 검색...',` 바로 아래:

```ts
    'idc.newRegistrant': '신규 등록',
    'idc.awaitingFirst': '신규 등록 (첫 리포트 대기)',
```

- [ ] **Step 2: i18n en 키 추가** — en 블록의 `'idc.searchPlaceholder'` 행 바로 아래:

```ts
    'idc.newRegistrant': 'New',
    'idc.awaitingFirst': 'New (awaiting first report)',
```

- [ ] **Step 3: 컴포넌트 타입 확장** — `export interface IdcUserStatus`(파일 상단, 라우트와 별도 정의)의 `dormancy?: DormancyBucket;` 아래:

```ts
  firstSeenAt?: string | null;
  isNewRegistrant?: boolean;
```

`interface IdcUserStatusData`의 `funnel?: FunnelStep[];` 아래:

```ts
  newRegistrants?: number;
```

- [ ] **Step 4: StatCard 4번째 카드** — `<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">`를 `<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">`로 바꾸고, `idc.inactive` StatCard 다음에:

```tsx
        <StatCard
          label={t('idc.awaitingFirst')}
          value={data.newRegistrants ?? 0}
          colorClass="text-[#9046FF]"
          dot="bg-[#9046FF]"
        />
```

- [ ] **Step 5: 행 배지** — 상태 필 `<span …>{isActive ? 'Active' : 'Inactive'}</span>` 닫힌 직후(같은 `<td>` 안)에:

```tsx
                    {user.isNewRegistrant && (
                      <span className="ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#9046FF]/10 text-[#9046FF]">
                        {t('idc.newRegistrant')}
                      </span>
                    )}
```

- [ ] **Step 6: 전체 테스트 + 빌드**

Run: `npx jest`
Expected: 전체 PASS (기존 + Task 1의 8개)

Run: `npm run build`
Expected: 성공 (`✓ Compiled successfully` — API 라우트들의 "Dynamic server usage" 로그는 정상 출력)

- [ ] **Step 7: Commit**

```bash
git add app/components/charts/IdcUserStatus.tsx lib/i18n.tsx
git commit -m "feat(ui): new-registrant badge, stat card, and sort surfacing in IdC status

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 운영 — 시드 업로드 → Path A 배포 → 라이브 검증 (컨트롤러/운영자 실행)

**Files:** 코드 변경 없음. 산출물: `s3://whchoi01-titan-q-log/athena-results/idc-first-seen.json`

**Interfaces:**
- Consumes: Task 1–3이 머지된 main, 현재 디렉터리의 실제 userId 목록, naver 사용자 등록 시각 `2026-08-18T05:57:00Z` (CloudTrail 실측)

- [ ] **Step 1: 시드 파일 생성 + 업로드** (배포 **전에** — 스펙 §7의 순서 규칙)

```bash
aws identitystore list-users --identity-store-id d-90663be888 --region us-east-1 \
  --query 'Users[].UserId' --output json > /tmp/idc-ids.json
python3 - << 'PY'
import json, sys
ids = json.load(open('/tmp/idc-ids.json'))
NEW_ID = 'b478b438-c061-7056-6e68-3162323771eb'  # whchoi98@naver.com, added 2026-08-18
users = {i: None for i in ids}
if NEW_ID in users:
    users[NEW_ID] = '2026-08-18T05:57:00Z'
else:
    sys.exit('expected new user id missing from directory — investigate before seeding')
json.dump({'version': 1, 'seededAt': '2026-08-18T05:57:00Z', 'users': users},
          open('/tmp/idc-first-seen.json', 'w'))
PY
aws s3 cp /tmp/idc-first-seen.json s3://whchoi01-titan-q-log/athena-results/idc-first-seen.json \
  --content-type application/json
```

- [ ] **Step 2: Path A 배포** (직전 배포와 동일 절차 — CDK 없음)

```bash
npm run build && docker build -t kiro-dashboard .
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin 120443221648.dkr.ecr.ap-northeast-2.amazonaws.com
SHA=$(git rev-parse --short HEAD)
docker tag kiro-dashboard:latest 120443221648.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:latest
docker tag kiro-dashboard:latest 120443221648.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:$SHA
docker push 120443221648.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:latest
docker push 120443221648.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:$SHA
aws ecs update-service --cluster kiro-dashboard-cluster \
  --service KiroDashboardEcs-ServiceD69D759B-nu71sQVIQrfs \
  --force-new-deployment --region ap-northeast-2
aws ecs wait services-stable --cluster kiro-dashboard-cluster \
  --services KiroDashboardEcs-ServiceD69D759B-nu71sQVIQrfs --region ap-northeast-2
```

- [ ] **Step 3: 라이브 검증**

```bash
SECRET=$(aws cloudfront get-distribution-config --id EYIGNKS7E8VUM \
  --query 'DistributionConfig.Origins.Items[0].CustomHeaders.Items[?HeaderName==`X-Custom-Secret`].HeaderValue' --output text)
ALB=$(aws elbv2 describe-load-balancers --names kiro-dashboard-alb --region ap-northeast-2 \
  --query 'LoadBalancers[0].DNSName' --output text)
curl -s -H "X-Custom-Secret: $SECRET" "http://$ALB/api/idc-users?days=90" | python3 -c "
import json, sys
d = json.load(sys.stdin)
u = next(x for x in d['users'] if x['userId'] == 'b478b438-c061-7056-6e68-3162323771eb')
print('newRegistrants:', d['newRegistrants'])
print('badge:', u['isNewRegistrant'], 'firstSeenAt:', u['firstSeenAt'], 'row:', d['users'].index(u) + 1)
"
curl -s -o /dev/null -w "health:%{http_code}\n" https://kirodashboard.whchoi.net/api/health
```

Expected: `newRegistrants: 1`; badge `True`, firstSeenAt `2026-08-18T05:57:00Z`, row `8` (active 7명 바로 다음); health 200. 추가로 실행 태스크 digest가 방금 푸시한 digest와 일치하는지 `aws ecs describe-tasks`로 확인.
