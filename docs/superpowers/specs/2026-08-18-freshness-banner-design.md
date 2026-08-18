# 스펙: 데이터 신선도 배너 (Freshness Banner)

- 날짜: 2026-08-18
- 상태: 설계 승인됨 (구현 전)
- 적용 페이지: `/subscription`, `/adoption`

## 1. 배경과 결정

원래 요구는 "ECS 태스크 롤에 `user-subscriptions:ListUserSubscriptions` 권한을 추가해
실시간 구독 현황 기능 구현"이었다. 조사 결과 이 API는 **호출 수단이 존재하지 않는
콘솔 전용 내부 API**로 확인되어, 지원되는 범위 내 대안(본 스펙)으로 방향을 확정했다.

조사 증거 (2026-08-18 실측):

| 확인 항목 | 결과 |
|---|---|
| npm `@aws-sdk/client-user-subscriptions` | 404 — 존재하지 않음 |
| AWS CLI v2.34 / 로컬 botocore 서비스 모델 | 없음 (license-manager 변형만 존재) |
| 최신 upstream botocore (GitHub develop) | 없음 — 버전 문제가 아니라 원래 비공개 |
| `user-subscriptions.us-east-1.amazonaws.com` DNS | 해석 안 됨 (동일 프로브로 athena는 정상 해석) |
| kiro.dev 공식 대시보드 문서 | 대시보드는 console-only 명시. 해당 액션은 콘솔이 요구하는 IAM 권한으로만 등장 |

따라서 **태스크 롤 권한 추가는 하지 않는다** (호출 수단이 없어 무의미).

사용자 결정 사항:
1. 지원되는 범위 내 대안으로 진행 (역공학 스파이크 아님 — 단서는 §7에 보존)
2. 적용 범위는 `/subscription` + `/adoption` 두 페이지 (전역 헤더 아님)

## 2. 목표 / 비목표

**목표** — 두 페이지 Header 바로 아래에 한 줄 배너:
- 데이터 기준일(as-of): 현재 로드된 시계열의 최신 리포트 날짜
- 다음 리포트 도착까지 카운트다운 (매일 02:00 UTC = 11:00 KST)
- 실시간 구독 현황 안내 링크 (Kiro 콘솔 대시보드 공식 문서)

**비목표**:
- 실시간 구독 데이터 조회 (불가 — §1)
- 신규 IAM 권한, 신규 API 라우트, 신규 AWS 호출 (전부 불필요)
- 실제 CSV 도착 시각(분 단위) 표시 — 정밀 신선도는 `/ingest-health` 전담
- 전역(모든 페이지) 적용

## 3. 설계

### 3.1 `lib/freshness.ts` (신규, 순수 함수만)

```ts
export const REPORT_HOUR_UTC = 2;

// /^\d{4}-\d{2}-\d{2}$/ 형식만 필터 후 사전순 최댓값. 유효값 없으면 null.
export function latestReportDate(dates: Array<string | null | undefined>): string | null;

// nowMs '초과'인 가장 가까운 02:00:00.000 UTC의 epoch ms.
// now가 정확히 02:00:00.000이면 다음 날을 반환한다 (strictly after).
export function nextReportEtaMs(nowMs: number): number;
```

- ISO(YYYY-MM-DD) 문자열은 사전순 == 시간순이므로 Date 파싱 없이 비교한다.
- 시간/분 분해·문구 조립은 컴포넌트 책임 (lib는 숫자만).

### 3.2 `app/components/ui/FreshnessBanner.tsx` (신규)

- `'use client'`, props: `{ dates: string[] }`
- 파일 상단 상수:
  ```ts
  // 콘솔 직행 URL은 공식 미문서화(콘솔 로그인 → Kiro 콘솔 → Dashboard 메뉴만 안내).
  // 실제 콘솔 URL을 확보하면 이 상수만 교체한다.
  const KIRO_CONSOLE_DASHBOARD_URL =
    'https://kiro.dev/docs/enterprise/monitor-and-track/dashboard/';
  ```
- 카운트다운: `useState<number | null>(null)` 초기값으로 SSR/하이드레이션 안전 확보 후,
  `useEffect`에서 즉시 1회 계산 + 60초 `setInterval` (언마운트 시 정리).
  null인 동안 카운트다운 조각은 렌더하지 않는다.
- 서버 응답에 시각을 넣지 않으므로 쿼리 캐시(60초 메모·60분 결과 재사용)와 충돌 없음.
- 표기 (한 줄, 모바일 flex-wrap):
  `데이터 기준일 2026-08-17 · 다음 리포트 약 20시간 후 (매일 02:00 UTC · 11:00 KST) · 실시간 구독 현황: Kiro 콘솔 대시보드 ↗`
  - 남은 시간 < 1시간이면 "약 M분 후", 그 외 "약 H시간 후" (분 생략 — 배너 정밀도로 충분)
  - as-of 유효값 없으면 기준일 자리에 `—`
- 스타일 (dark-first, 팔레트 오버라이드 컨벤션 — `dark:`/`light:` 변형 금지):
  `bg-gray-900/50 border border-gray-800 rounded-lg px-4 py-2 text-xs text-gray-400
  flex flex-wrap items-center gap-x-4 gap-y-1`
  링크: `text-[#9046FF] hover:underline`, `target="_blank" rel="noreferrer"`.
  액센트 배경 위 텍스트 없음 → ADR-0005 대비 이슈 해당 없음.

### 3.3 i18n (`lib/i18n.tsx` 수정)

`t(key) => string`은 보간이 없으므로 `{h}`/`{m}` 플레이스홀더를 컴포넌트에서 치환한다.

| 키 | ko | en |
|---|---|---|
| `freshness.asOf` | `데이터 기준일` | `Data as of` |
| `freshness.etaHours` | `다음 리포트 약 {h}시간 후` | `Next report in ~{h}h` |
| `freshness.etaMinutes` | `다음 리포트 약 {m}분 후` | `Next report in ~{m}m` |
| `freshness.schedule` | `(매일 02:00 UTC · 11:00 KST)` | `(daily at 02:00 UTC · 11:00 KST)` |
| `freshness.consoleCta` | `실시간 구독 현황: Kiro 콘솔 대시보드` | `Live subscriptions: Kiro console dashboard` |

### 3.4 페이지 연결 (수정 2곳)

- `app/subscription/page.tsx`: `<FreshnessBanner dates={(data?.tierTrend ?? []).map((p) => p.date)} />`
- `app/adoption/page.tsx`: `<FreshnessBanner dates={(data?.trend ?? []).map((p) => p.date)} />`
- 위치: `<Header …/>` 바로 아래. 로딩 중에는 기존 `pageBodyOpacityClass` 체계를 그대로 따른다
  (배너도 페이지 본문 래퍼 안에 두어 별도 opacity 처리를 추가하지 않는다).

## 4. 엣지 케이스

- `dates` 빈 배열/전부 비정상 → 기준일 `—`, 카운트다운·링크는 유지 (신규 계정, 테이블 미생성 포함)
- 페이지가 열린 채 02:00 UTC를 넘김 → 60초 인터벌이 다음 날로 자동 갱신
- `days` 윈도우 변경 → props 변경만으로 재계산 (별도 처리 불필요)
- 클라이언트 시계 왜곡 → 허용 (분 단위 배너 용도)

## 5. 테스트 / 검증

- `tests/lib/freshness.test.ts` (jest):
  - `nextReportEtaMs`: 01:59:59.999Z → 당일 02:00, 02:00:00.000Z → 익일 02:00, 02:00:00.001Z → 익일 02:00, 23:xx → 익일
  - `latestReportDate`: 비정렬 입력, 형식 불량(`MM-DD-YYYY`·빈 문자열·undefined) 필터링, 전부 무효 → null
- 검증 명령: `npm run build` + `npx jest` (이 저장소는 `.eslintrc` 부재로 `next lint` 불가)

## 6. 문서 갱신 (auto-sync 규칙)

- `app/components/CLAUDE.md`: FreshnessBanner 항목 추가
- `lib/CLAUDE.md`: freshness.ts 항목 추가
- CHANGELOG는 릴리스 시점에 release skill로 처리

## 7. 부록 — 향후 실시간 경로 재검토용 기록

2026-08-18 05:58 UTC, 관리자가 Kiro 콘솔 대시보드를 열자 CloudTrail(us-east-1)에 실제 호출이 기록됨:

```json
{
  "eventSource": "user-subscriptions.amazonaws.com",
  "eventName": "ListUserSubscriptions",
  "awsRegion": "us-east-1",
  "readOnly": true,
  "requestParameters": {
    "instanceArn": "arn:aws:sso:::instance/ssoins-7223adb3b18d7eaf",
    "maxResults": 1000,
    "subscriptionRegion": "us-east-1"
  }
}
```

- userAgent가 일반 브라우저 → 콘솔 프런트엔드가 SigV4로 직접 호출. 표준 IAM 자격증명으로
  호출 가능한 엔드포인트가 존재한다는 뜻이나, 호스트명·와이어 프로토콜은 미확인
  (`user-subscriptions.us-east-1.amazonaws.com`은 DNS 미해석).
- 스파이크 시 필요한 것: 콘솔 페이지를 연 상태에서 브라우저 devtools 네트워크 탭으로
  실제 호스트명·페이로드 확보 → 수동 SigV4 클라이언트. 비공개 API이므로 예고 없는 변경 리스크.
- E2E 검증 대기: 신규 사용자 `b478b438-c061-7056-6e68-3162323771eb` (whchoi98@naver.com,
  2026-08-18 IdentityStore 즉시 반영 확인, 동일 시점 `user_report` 0행). 첫 사용 다음 날
  02:00 UTC 이후 같은 Athena 조회로 리포트 등장을 확인할 수 있다.
