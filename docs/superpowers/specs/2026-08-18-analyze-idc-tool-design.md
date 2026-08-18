# 스펙: AI 챗봇 `list_idc_users` 도구 — 디렉터리·신규등록 조회

- 날짜: 2026-08-18
- 상태: 설계 승인됨 ("구현" 지시)
- 배경: 챗봇(`/api/analyze`)의 데이터 범위는 Athena 테이블 2개뿐이라
  "신규 등록자 누구야?" 류 질문(디렉터리·first-seen 원장 소관)에 답하지 못한다.
  기존 `lookup_users` 도구(IdentityStore, 마스킹)와 같은 패턴으로 도구를 추가한다.

## 1. 목표 / 비목표

**목표**
- 챗봇이 IdC 디렉터리 현황(활성/비활성/신규 등록, 휴면 등급)을 조회·요약 가능
- **마스킹 정책 유지**: 도구가 반환하는 이름/이메일/조직은 서버에서 이미 마스킹된 값
  (`resolveUserDetails`와 동일 규칙), `userId`(UUID)만 비마스킹
- `/api/idc-users`와 동일 소스·동일 결과 (로직 공유, 이중 구현 금지)

**비목표**
- 신규 IAM·API 라우트 없음. 구독(Pending) 실시간 조회 없음(콘솔 전용 — 기존 결정 유지)
- 챗봇의 마스킹 해제 없음

## 2. 리팩터: `lib/idc-users.ts` 추출 (선행 조건)

`/api/idc-users/route.ts`의 조립 로직 전체(현 ~250줄: `IdcUserStatus` 인터페이스,
`BUCKET_ORDER`·`SUSTAINED_ACTIVE_DAYS`·`gradeDormancy`·`daysSince`,
`fetchAllIdcUsers`, `fetchActiveUserStats`, GET 본문의 원장 결합·매핑·정렬·집계)를
**동작 변경 없이** `lib/idc-users.ts`로 이동한다.

- 신규 export: `getIdcUsersPayload(days: number): Promise<IdcUsersPayload>` —
  기존 라우트 응답 JSON과 동일 형태(`total/active/inactive/newRegistrants/windowDays/dormancy/funnel/users`)
- 라우트는 얇은 래퍼로 축소: `days` 파싱 → `getIdcUsersPayload(days)` →
  `NextResponse.json`; 기존 에러 처리(500)와 missing-table 저하는 lib 내부에 유지
- **감사망 유지**: SQL(`fetchActiveUserStats`)이 라우트 밖으로 나가므로
  `tests/api/date-literal-audit.test.ts`의 스캔 대상에 `lib/idc-users.ts`를 추가한다
  (CURRENT_DATE/DATE_ADD 금지가 lib로 이동한 SQL에도 계속 적용되도록)

## 3. 도구: `list_idc_users`

`app/api/analyze/route.ts`의 `tools` 배열에 추가 (기존 `lookup_users` 다음):

- 입력: `filter?: 'all'|'active'|'inactive'|'new'`(기본 all),
  `days?: number`(기본 90, 활동 판정 윈도우), `limit?: number`(기본 50, 최대 200)
- 실행: `getIdcUsersPayload(days)` → 순수 함수 `filterIdcUsers(users, filter, limit)`
  (lib/idc-users.ts export, jest 대상) → 요약 카운트 + 사용자 배열 + `truncated` 플래그 반환
- `filter: 'new'`는 `isNewRegistrant === true`만 (서버 게이트 그대로: days<7이면 배지
  억제 → 도구 기본 days=90이라 정상 동작)
- 반환 사용자 필드: userId, displayName(마스킹), email(마스킹), status, dormancy,
  isNewRegistrant, firstSeenAt, totalMessages, totalCredits, lastActive, activeDays
- 실패 시 기존 도구들과 동일하게 `{ error: message }` JSON 반환 (스트림 유지)

## 4. 시스템 프롬프트 (`lib/analyze-prompt.ts`)

`SYSTEM_PROMPT_BASE`에 도구 안내 추가:
- 디렉터리·등록·신규 등록 질문은 SQL이 아니라 `list_idc_users`를 사용할 것
- 이름/이메일은 **정책상 마스킹된 값**이며 그대로 표기할 것(복원 시도 금지),
  식별자는 userId(UUID)
- "신규 등록"의 정의: 디렉터리 최초 관측 ≤7일 && 아직 활동 리포트 없음
- **디렉터리는 Kiro 구독 명부가 아니다** — 활동 없는 사용자를 라이선스/좌석 낭비로
  단정하지 말 것 (기존 `/api/idc-users` 주석의 표준 문구와 동일한 취지)

## 5. 테스트 / 검증 / 문서

- `tests/lib/idc-users-filter.test.ts`: `filterIdcUsers` — 필터 4종, limit 절단 +
  truncated 플래그, limit 상한(200) 클램프
- `tests/api/date-literal-audit.test.ts` 확장이 실제로 lib/idc-users.ts를 스캔하는지
  (파일 목록에 포함) 확인
- 리팩터 무회귀: `npx jest` 전체 + `npm run build` + (배포 후) `/api/idc-users` 라이브
  응답이 리팩터 전과 동일 형태·동일 카운트인지 curl 파리티 확인
- 문서: `lib/CLAUDE.md`(idc-users.ts 행 + analyze-prompt 행 갱신),
  `app/api/CLAUDE.md`(idc-users 행에 "thin wrapper over lib/idc-users.ts",
  analyze 행에 3번째 도구), auto-sync 규칙 준수
