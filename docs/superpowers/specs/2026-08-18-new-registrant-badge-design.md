# 스펙: 신규 등록(첫 리포트 대기) 사용자 식별

- 날짜: 2026-08-18
- 상태: 설계 승인됨 (구현 전)
- 적용 위치: 개요 페이지 "IdC 사용자 현황" 섹션 (`/api/idc-users` + `IdcUserStatus.tsx`)

## 1. 배경과 결정

구독을 방금 추가한 사용자(예: 2026-08-18의 `b478b438-…`)는 첫 사용 다음 날 11:00 KST
리포트 전까지 활동 데이터가 없어, IdC 사용자 현황에서 수십 명의 기존 미사용 사용자와
구별되지 않는다. 관리자가 "등록했고 첫 리포트를 기다리는 중"인 사용자를 즉시 식별할
수 있어야 한다.

제약: IdentityStore API의 `User` 객체에는 생성 시각이 없다 (`CreatedAt`은
GroupMembership에만 존재하며 조회 권한도 없음). 정확한 등록 시각의 대안이던
CloudTrail(`LookupEvents`)은 IAM 추가 → Ecs+Cdn 동시 CDK 배포 강제 + 2 TPS 속도 문제로
기각. **사용자 결정: S3 first-seen 원장** — 대시보드가 처음 관측한 시각을 등록 시각의
근사로 사용한다.

## 2. 목표 / 비목표

**목표**
- `미사용(never)` 이면서 최초 관측 ≤ 7일인 사용자를 "신규 등록"으로 배지 + 상단 정렬
- 신규 등록 수를 StatCard로 노출
- IAM·CDK 변경 없음 (이미지 교체만으로 배포)

**비목표**
- 정확한 등록 시각 (CloudTrail 경로는 §1에서 기각 — 근사로 충분)
- 실시간 구독(Pending) 상태 표시 (콘솔 전용 — 2026-08-18 freshness-banner 스펙 §1 참조)
- 신규 사용자 알림/웹훅

## 3. 원장 (S3)

- 키: `ATHENA_OUTPUT_BUCKET`(예: `s3://whchoi01-titan-q-log/athena-results/`)에서 파싱한
  `<버킷>` + `<프리픽스>idc-first-seen.json` → `athena-results/idc-first-seen.json`.
  태스크 롤의 기존 쓰기 그랜트(`arn:aws:s3:::<results-bucket>/<results-prefix>/*`)와
  구성상 항상 일치한다.
- 형식:
  ```json
  { "version": 1, "seededAt": "2026-08-18T00:00:00Z",
    "users": { "<userId>": "<최초 관측 ISO>" 또는 null } }
  ```
  `null` = 시드 배치(도입 이전부터 있던 사용자, 신규 아님).
- **시드 규칙**: 파일이 없으면 현재 디렉터리 전원을 `null`로 자가 시드한다 — 도입 첫
  요청에서 아무도 오배지되지 않는 안전 기본값. 운영 시드(§7)가 이를 대체/선행한다.
- 이후 요청에서 원장에 없는 userId가 나타나면 그 시각을 기록하고 PUT한다.
  **PUT은 새 ID가 있을 때만** 발생한다. 동시 요청의 read-modify-write race는
  last-writer-wins로 허용 — 놓친 ID는 다음 요청이 다시 기록하며, 어긋나는 것은
  최초 관측 시각 몇 초뿐이다.

## 4. 서버 설계

### 4.1 `lib/first-seen.ts` (신규)

```ts
export const NEW_REGISTRANT_DAYS = 7;
export interface FirstSeenLedger {
  version: 1; seededAt: string;
  users: Record<string, string | null>;
}
// 순수: 새 ID에 nowIso 기록. 원장이 null이면(파일 없음) 전원 null 시드.
// changed=true일 때만 호출자가 PUT한다.
export function applyLedger(
  ledger: FirstSeenLedger | null, currentIds: string[], nowIso: string,
): { ledger: FirstSeenLedger; changed: boolean };
// 순수: 배지 판정. firstSeen null → false, nowMs - firstSeen ≤ 7일 → true.
export function withinNewRegistrantWindow(firstSeen: string | null | undefined, nowMs: number): boolean;
// IO: GET/PUT. 실패는 던진다 — 호출자(라우트)가 잡아서 배지 없이 degrade.
export async function loadLedger(): Promise<FirstSeenLedger | null>;
export async function saveLedger(l: FirstSeenLedger): Promise<void>;
```
- S3 클라이언트는 `lib/uar-s3.ts`와 동일한 패턴으로 자체 생성
  (`new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' })`).
- 버킷/키 파싱: `ATHENA_OUTPUT_BUCKET`에서 `s3://` 제거 → 첫 세그먼트가 버킷,
  나머지가 프리픽스. 프리픽스 뒤에 `idc-first-seen.json`.
- 미설정 시(`ATHENA_OUTPUT_BUCKET` 없음) `loadLedger`는 null을, `saveLedger`는 no-op을
  반환 — 신규 계정에서 기능이 조용히 꺼진다.

### 4.2 `/api/idc-users` 수정

- `fetchAllIdcUsers()` 후: `loadLedger()` → `applyLedger(ledger, ids, nowIso)` →
  `changed`면 `saveLedger` (전 과정 try/catch — 실패 시 원장 없이 진행, `console.warn`).
- `IdcUserStatus`(라우트의 export interface)에 필드 추가:
  `firstSeenAt: string | null`, `isNewRegistrant: boolean`
  (`isNewRegistrant = dormancy === 'never' && withinNewRegistrantWindow(firstSeenAt, nowMs)`).
- 정렬 변경: ① active(메시지 desc) → ② isNewRegistrant(firstSeenAt desc) → ③ 나머지
  inactive(기존 totalMessages desc 유지).
- 응답에 `newRegistrants: number` (isNewRegistrant 카운트) 추가.

## 5. UI 설계 (`app/components/charts/IdcUserStatus.tsx`)

- 컴포넌트 로컬 `IdcUserStatus` 인터페이스(파일 상단, 라우트와 별도 정의)에 같은
  2필드 추가, props 데이터 타입에 `newRegistrants: number` 추가.
- StatCard: 기존 3장 그리드(`grid grid-cols-1 sm:grid-cols-3 gap-3`, 138행 부근)를
  `grid grid-cols-2 sm:grid-cols-4 gap-3`으로 바꾸고 4번째 카드
  `idc.awaitingFirst` = `newRegistrants` 값, 값 텍스트는 액센트 `text-[#9046FF]` (StatCard의 기존 색 prop 관용구를 따름).
- 행 배지: 상태 필 옆에 `isNewRegistrant`일 때
  `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[#9046FF]/10 text-[#9046FF]">{t('idc.newRegistrant')}</span>`
  — 기존 active 필(`bg-emerald-500/10 text-emerald-400`)과 같은 관용구. 텍스트가
  invariant 액센트색이므로 라이트 테마 대비 문제 없음 (흰 텍스트가 아니므로
  CLAUDE.md의 액센트-알파-배경 금지 규칙에 해당하지 않음).
- i18n 키 (ko/en):
  | 키 | ko | en |
  |---|---|---|
  | `idc.newRegistrant` | `신규 등록` | `New` |
  | `idc.awaitingFirst` | `신규 등록 (첫 리포트 대기)` | `New (awaiting first report)` |

## 6. 엣지 케이스

- 원장 GET/PUT 실패 → 배지·카운트 없이 기존 화면 그대로 (목록은 절대 깨지지 않음)
- 시드 전 배포 → 자가 시드(전원 null), 오배지 없음; 운영 시드가 소급 반영
- 신규 사용자가 활동 시작 → `never`가 아니게 되어 배지 자동 소멸 (active 그룹 승격)
- 등록 후 7일 무사용 → 배지 소멸, 일반 미사용으로 합류 (퍼널/휴면 그레이딩이 담당)
- 디렉터리에서 삭제된 사용자 → 원장에 잔존하지만 무해 (목록에 없으므로 렌더 안 됨);
  정리(compaction)는 비목표

## 7. 운영 시드 (배포 전 1회)

2026-08-18 실측 라이브 응답의 46개 userId로 시드 파일 생성:
45명은 `null`, `b478b438-c061-7056-6e68-3162323771eb`(whchoi98@naver.com)은 CloudTrail로
확인된 등록 시각 `2026-08-18T05:57:00Z`. 업로드:
`s3://whchoi01-titan-q-log/athena-results/idc-first-seen.json` → 이후 Path A 배포.
순서 중요: 시드가 먼저 올라가야 첫 요청의 자가 시드(전원 null)가 naver 사용자를
덮어쓰지 않는다. (자가 시드가 먼저 실행돼도 수동 시드 업로드로 덮어쓰면 복구된다.)

## 8. 테스트 / 검증 / 문서

- `tests/lib/first-seen.test.ts` (jest): `applyLedger` 자가 시드(전원 null)·기존 원장에
  새 ID 추가·변경 없음이면 changed=false, `isNewRegistrant` 7일 경계(직전/정각/초과)·
  null·미래 시각 방어 (함수명 withinNewRegistrantWindow).
- 검증: `npx jest` + `npm run build` (`.eslintrc` 부재로 lint 불가).
- 문서: `lib/CLAUDE.md`(first-seen.ts), `app/api/CLAUDE.md`(idc-users 갱신),
  `infra/CLAUDE.md`는 변경 없음(IAM 그대로).
