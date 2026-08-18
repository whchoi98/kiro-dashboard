# Architecture — kiro-dashboard

<a href="#english"><img src="https://img.shields.io/badge/lang-English-blue.svg" alt="English"></a>
<a href="#korean"><img src="https://img.shields.io/badge/lang-한국어-red.svg" alt="Korean"></a>

---

<a id="english"></a>

## English

### System Overview

kiro-dashboard is a full-stack analytics platform that collects Kiro IDE user activity data stored in S3, processes it through AWS Glue/Athena, and presents it through a Next.js 14 dashboard with AI-powered insights via Amazon Bedrock. The application is containerized with Docker and deployed on ECS Fargate behind CloudFront. The UI is bilingual (Korean/English), responsive down to mobile (off-canvas sidebar drawer below 768px), and offers a dark (default) / light theme; the self-hosted NanumSquare font ships as woff2 via `next/font/local`. An optional custom domain (`kirodashboard.whchoi.net`) is served as a CloudFront alias.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Users (Browser)                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Amazon CloudFront (CDN)                          │
│               KiroDashboardCdn Stack                                │
│   ┌───────────────────────────────────────────────┐                │
│   │  Lambda@Edge (Viewer Request)                  │                │
│   │  - Validates Cognito JWT (id_token cookie)     │                │
│   │  - Redirects to Cognito Hosted UI if invalid   │                │
│   │  - Injects X-User-Email, X-User-Name headers  │                │
│   │  - Config from SSM Parameter Store (us-east-1) │                │
│   └───────────────────────────────────────────────┘                │
│   - Injects X-Custom-Secret header → ALB                           │
│   - Caches static assets, blocks direct ALB access                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP + X-Custom-Secret + User Headers
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Application Load Balancer (ALB)                       │
│               KiroDashboardEcs Stack                                │
│   - Listener Rule: forward only if X-Custom-Secret matches         │
│   - Default: 403 Forbidden (blocks direct access)                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│               ECS Fargate — Next.js 14 App                         │
│               KiroDashboardEcs Stack                                │
│   ┌─────────────────────────────────────────────────────┐          │
│   │  Next.js App Router                                  │          │
│   │  ┌───────────────────┐  ┌─────────────────────────────────┐ │  │
│   │  │ Pages (15)        │  │ API Routes (19)                 │ │  │
│   │  │ / /exec /users    │  │ metrics users trends            │ │  │
│   │  │ /adoption /trends │  │ credits engagement release-notes│ │  │
│   │  │ /credits          │  │ productivity analyze            │ │  │
│   │  │ /subscription     │  │ subscription adoption           │ │  │
│   │  │ /productivity     │  │ dev-activity idc-users          │ │  │
│   │  │ /dev-activity     │  │ user-detail client-dist         │ │  │
│   │  │ /engagement       │  │ rollout user-model-usage        │ │  │
│   │  │ /model-usage      │  │ model-usage (S3-direct)         │ │  │
│   │  │ /rollout /analyze │  │ ingest-health (S3+SQL)          │ │  │
│   │  │ /ingest-health    │  │ health  ← ECS health            │ │  │
│   │  │ /changelog        │  └───────────┬─────────────────────┘ │  │
│   │  └───────────────────┘              │               │          │
│   │  lib/                               │               │          │
│   │  ┌─────────────────────────────────────────────────┐│          │
│   │  │ athena · glue · identity · mask · uar-s3        ││          │
│   │  │ athena-window · i18n · version · useChatStream  ││          │
│   │  │ export-report · table-sort · theme · chart-theme││          │
│   │  │ chat-scroll · query-cache · freshness           ││          │
│   │  │ first-seen · idc-users · analyze-prompt         ││          │
│   │  └─────────────────────────────────────────────────┘│          │
│   └─────────────────────────────────────────────────────┘          │
└──────┬───────────┬───────────┬───────────┬──────────────────────────┘
       │           │           │           │
       ▼           ▼           ⇕           ▼   (⇕ = S3 write: idc-first-seen.json)
┌──────────┐ ┌─────────┐ ┌─────────┐ ┌──────────────────┐
│  Athena  │ │  Glue   │ │   S3    │ │  IAM Identity    │
│ (query)  │ │(catalog)│ │(data +  │ │  Center (IdC)    │
│          │ │         │ │results) │ │  IdentityStore   │
└──────────┘ └─────────┘ └─────────┘ └──────────────────┘
       │           │                  ┌──────────────────┐
       └─────┬─────┘                  │  Cognito         │
             ▼                        │  User Pool       │
      ┌─────────────┐                │  (Hosted UI)     │
      │   Bedrock   │                └──────────────────┘
      │  (Claude)   │
      │  AI analyze │
      └─────────────┘
```

### CDK Stack Composition

| Stack | Name | Region | Key Resources |
|-------|------|--------|---------------|
| Network | `KiroDashboardNetwork` | ap-northeast-2 | VPC, public/private subnets, NAT |
| Security | `KiroDashboardSecurity` | ap-northeast-2 | ALB SG, ECS SG, Cognito User Pool, EdgeAuthClient |
| ECS | `KiroDashboardEcs` | ap-northeast-2 | ECR, ECS Cluster, Fargate Task, ALB |
| CDN | `KiroDashboardCdn` | ap-northeast-2 | CloudFront + Lambda@Edge + SSM config + Cognito callback |
| EdgeLambda | `KiroDashboardEdgeLambda` | us-east-1 | Lambda@Edge function (auto-generated by CDK) |
| Catalog (opt-in) | `KiroDashboardCatalog` | `ATHENA_REGION` (default us-east-1) | Glue database + `user_report`/`by_user_analytic` external tables over a fork-owned bucket; activated by `ATHENA_DATA_BUCKET_NAME` |

### Data Flow Summary

```
Kiro UAR delivery (daily 02:00 UTC) → S3 (user_report / by_user_analytic CSVs)
→ Glue Catalog tables (opt-in CatalogStack or manual DDL — no crawler)
→ Athena SQL → Next.js API Routes → React Dashboard → User
```

S3-direct path (columns unsafe under OpenCSVSerDe positional mapping):
```
S3 CSVs → lib/uar-s3.ts (month-prefix parallel listing, header-name parsing)
→ /api/model-usage (dynamic model columns), /api/adoption (new_user flag),
  /api/ingest-health (object metadata + header sets — file-level, not column-level)
```

S3 is not read-only from the app: `/api/idc-users` writes the new-registrant first-seen ledger, `idc-first-seen.json`, back to S3 via `PutObject` under the `athena-results/` prefix — last-writer-wins, self-seeding (all-null) on first run, with blast radius limited to the new-registrant badge.

AI analysis path:
```
User question → /api/analyze → Bedrock (Claude) streaming → SSE to browser
```

### Key Design Decisions

1. **CloudFront + custom header secret** — The ALB is not publicly accessible. CloudFront injects a secret HTTP header; the ALB listener rule forwards only requests with the correct header. This prevents direct ALB access without WAF costs.

2. **ECS Fargate over Lambda** — Next.js App Router with server components and streaming responses requires a persistent container. Fargate avoids Lambda cold starts and the 15-minute timeout limit for Bedrock streaming.

3. **Athena for analytics** — User activity data is already in S3 as Kiro telemetry. Athena queries S3 directly via Glue catalog with no ETL pipeline needed, minimizing operational overhead.

4. **UserId normalization** — IAM Identity Center prefixes userIDs with `d-<store-id>.`. The `REGEXP_REPLACE` normalization in all SQL ensures consistent user identity across tables.

5. **Two date formats** — `user_report` uses `YYYY-MM-DD` (standard ISO); `by_user_analytic` uses `MM-DD-YYYY` (legacy). All queries must account for this difference.

6. **Dark-first UI with an opt-in light theme** — Dark is the default (internal developer/ops audience). A light theme is available via a sidebar toggle, implemented as a Tailwind v4 **palette override** on `html.light` (color variables remapped in `globals.css`) so components keep their dark-first classes — no `dark:`/`light:` variants. `useChartTheme()` (`lib/chart-theme.ts`) supplies the Recharts tick/tooltip/cursor colors that CSS variables cannot reach. Theme state lives in `lib/theme.tsx` (persisted to `localStorage`, no-FOUC bootstrap script). See ADR-0005. *(Supersedes the original "dark-only" decision.)*

7. **Lambda@Edge + Cognito PKCE** — Authentication moved from NextAuth.js (in-app) to Lambda@Edge (CDN layer). All requests are authenticated before reaching the origin. Uses PKCE flow with a public Cognito client (no client secret) to avoid Lambda@Edge environment variable limitations. Config is stored in SSM Parameter Store (us-east-1) and cached on cold start.

8. **Data masking** — All user identifiers (displayName, email, username, organization) are server-side masked via `lib/mask.ts` before reaching the browser. Shows first 2 characters with `*` padding. Applied at the `resolveUserDetails()` layer so all API consumers get masked data automatically.

9. **S3 direct read for positionally-unsafe columns** — The `user_report` CSV files contain dynamic `{Model_name}_Messages` columns and late-appended `New_User`/`User_Email` columns whose positions vary across files. Since the Glue table uses `OpenCSVSerDe` (positional mapping), these columns cannot be queried safely via Athena. The shared `lib/uar-s3.ts` helper lists CSVs with parallel month-prefix `ListObjectsV2` calls (one sequential call per day previously cost ~20s cross-region) and parses columns by header name; `/api/model-usage` (model columns) and `/api/adoption` (`new_user` flag) both use it. `/api/ingest-health` uses the same listing for a different purpose — object size/`lastModified` and per-file header *sets*, to detect schema drift and delivery gaps that Athena cannot see at all because `OpenCSVSerDe` silently maps drifted columns onto the wrong names. See ADR-0004.

10. **Derived rates over legacy columns are nullable, not zero** — 39 of `by_user_analytic`'s 44 metric columns are the literal string `0` in every row in this account (see `docs/kiro-user-activity-report-schema.md` §B-0), so any acceptance-rate denominator built on them is frequently `0`. `/api/productivity` gates every derived rate on a minimum denominator and returns `number | null`, which the UI renders as "not instrumented". Returning `0` would present an unmeasured quantity as a measured one — the single most likely way for this dashboard to mislead.

11. **Cross-report metrics are summed independently, never joined** — the credits-per-accepted-line KPI sums `user_report.credits_used` and `by_user_analytic`'s AI-code-line columns separately over a window computed from both tables' own bounds. 303 of `by_user_analytic`'s 541 (user, date) pairs have no `user_report` counterpart, so an inner join would silently discard over half the legacy data. The response therefore carries a distinct population `n` for each side, because they are not the same population.

12. **Date windows are resolved in the app, never by Athena** — every route interpolates an explicit `YYYY-MM-DD` literal from `lib/athena-window.ts` instead of `DATE_ADD('day', -N, CURRENT_DATE)`. This is a prerequisite, not a style choice: Athena's `ResultReuseByAgeConfiguration` matches on the query **string**, so an engine-resolved window produces a stable string whose meaning silently changes, and can never be reused. Measured live on identical SQL, reuse flag the only variable: 100 304 bytes / 808 ms → 0 bytes / 242 ms; `/api/metrics?days=90` end to end went 2.17 s → 1.07 s. Reuse is capped at 60 minutes (not 1440) because `/api/analyze` runs LLM-authored SQL that still resolves its own window, and an hour bounds how far such a result can predate the newest 02:00 UTC report. Two layers now cache: this cross-task reuse (`ATHENA_RESULT_REUSE`) plus the per-task in-process memo (`lib/query-cache.ts`) — only the former helps a cold Fargate task. Both are safe solely because reports land once daily, so a 60-minute-old answer cannot be staler than a source already up to 24 h old; `/api/ingest-health` bypasses both because it is the freshness monitor. Verify a hit with `ResultReuseInformation.ReusedPreviousResult` from `GetQueryExecution`, reading the whole `Statistics` object (a nested `--query` multi-select can render the field as if absent); `DataScannedInBytes` dropping to 0 agrees with it. Enforced by `tests/api/date-literal-audit.test.ts`.

13. **S3 first-seen ledger for new-registrant detection** — Neither `user_report` nor `by_user_analytic` carries a registration date, so "new registrant" status has to be derived and persisted somewhere durable. `lib/first-seen.ts` reads/writes `idc-first-seen.json` at the only S3 location the ECS task role can write to — the `athena-results/` output prefix — via `PutObject`. The ledger self-seeds with all-null timestamps on first run; any bucket lifecycle rule ever applied to that prefix must exclude `idc-first-seen.json`, or the ledger disappears and every user reappears as "new" once.

14. **Report-derived subscription data only — `ListUserSubscriptions` is console-only** — CloudTrail evidence gathered 2026-08-18 confirms `user-subscriptions:ListUserSubscriptions` is invoked by the Kiro console's own browser front-end via SigV4, with no public SDK, CLI, or documented endpoint. The dashboard does not chase it; `/api/subscription`'s freshness banner plus a pointer to the Kiro console fill the gap instead.

15. **PWA-lite without a service worker** — `app/manifest.ts` and three PNG icons make the dashboard installable, but no service worker ships. This is a realtime dashboard behind Lambda@Edge Cognito cookie auth: caching responses for offline use would show stale numbers, and a standalone install keeps its own separate cookie jar anyway (re-authenticates on first launch). Manifest-only gets the install affordance without the offline guarantee it can't honestly make.

### Operations

See `docs/runbooks/` for operational procedures.

### Reference Documentation

The upstream contract for every data source described above is the official Kiro enterprise documentation. Where this repo's docs and the upstream pages disagree, the upstream pages are authoritative:

- [Kiro IDE — Viewing per-user activity](https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/) — `user_report` / `by_user_analytic` schemas, 02:00 UTC daily cadence, S3 path layout, bucket policy
- [Kiro CLI — View per-user activity](https://kiro.dev/docs/cli/enterprise/monitor-and-track/user-activity/) — per-`Client_Type` CSV split; legacy report scope
- [Kiro CLI — Log user prompts](https://kiro.dev/docs/cli/enterprise/monitor-and-track/prompt-logging/) — prompt log JSON schema. **Enabled in this account** (separate bucket, real `HH` partition) but not ingested; ingesting it needs new `PROMPT_LOG_BUCKET`/`PROMPT_LOG_PREFIX` env vars plus an S3 read grant in `infra/lib/ecs-stack.ts` — a CDK change, not an app-layer one
- [Kiro CLI — Viewing Kiro usage on the dashboard](https://kiro.dev/docs/cli/enterprise/monitor-and-track/dashboard/) — Kiro console's aggregate-only view; the only source defining Active vs Pending (uncharged) subscriptions, which come from `user-subscriptions:ListUserSubscriptions` and are absent from both CSV reports

Column-level detail lives in `docs/kiro-user-activity-report-schema.md`.

---

<a id="korean"></a>

## 한국어

### 시스템 개요

kiro-dashboard는 Kiro IDE 사용자 활동 데이터를 S3에 수집하고, AWS Glue/Athena로 처리하며, Next.js 14 대시보드로 시각화하고 Amazon Bedrock으로 AI 인사이트를 제공하는 풀스택 분석 플랫폼입니다. Docker 컨테이너로 패키징되어 ECS Fargate에 CloudFront 뒤에 배포됩니다. UI는 한국어/영어 이중 언어를 지원하며, 768px 미만에서는 오프캔버스 사이드바 드로어로 전환되는 모바일 반응형이고, 다크(기본)/라이트 테마를 제공합니다. 자체 호스팅된 NanumSquare 폰트는 `next/font/local`을 통해 woff2로 제공됩니다. 선택적 커스텀 도메인(`kirodashboard.whchoi.net`)은 CloudFront 별칭으로 서비스됩니다.

### 아키텍처 다이어그램

위 [영문 섹션의 ASCII 다이어그램](#architecture-diagram)을 참고하세요.

### CDK 스택 구성

| 스택 | 이름 | 리전 | 주요 리소스 |
|------|------|------|------------|
| 네트워크 | `KiroDashboardNetwork` | ap-northeast-2 | VPC, 퍼블릭/프라이빗 서브넷, NAT |
| 보안 | `KiroDashboardSecurity` | ap-northeast-2 | ALB SG, ECS SG, Cognito User Pool, EdgeAuthClient |
| ECS | `KiroDashboardEcs` | ap-northeast-2 | ECR, ECS 클러스터, Fargate 태스크, ALB |
| CDN | `KiroDashboardCdn` | ap-northeast-2 | CloudFront + Lambda@Edge + SSM 설정 + Cognito 콜백 |
| EdgeLambda | `KiroDashboardEdgeLambda` | us-east-1 | Lambda@Edge 함수 (CDK 자동 생성) |
| Catalog (옵트-인) | `KiroDashboardCatalog` | `ATHENA_REGION` (기본 us-east-1) | 포크 소유 버킷 위 Glue 데이터베이스 + `user_report`/`by_user_analytic` 외부 테이블; `ATHENA_DATA_BUCKET_NAME` 설정 시 활성화 |

### 데이터 흐름 요약

```
Kiro UAR 전송 (매일 02:00 UTC) → S3 (user_report / by_user_analytic CSV)
→ Glue 카탈로그 테이블 (옵트-인 CatalogStack 또는 수동 DDL — 크롤러 없음)
→ Athena SQL → Next.js API 라우트 → React 대시보드 → 사용자
```

S3 직접 읽기 경로 (OpenCSVSerDe 위치 매핑으로 안전하게 조회 불가한 컬럼):
```
S3 CSV → lib/uar-s3.ts (월 프리픽스 병렬 리스팅, 헤더 이름 기반 파싱)
→ /api/model-usage (동적 모델 컬럼), /api/adoption (new_user 플래그),
  /api/ingest-health (객체 메타데이터 + 헤더 집합 — 컬럼 단위가 아닌 파일 단위)
```

S3는 더 이상 앱에서 읽기 전용이 아닙니다: `/api/idc-users`는 신규 가입자 최초 관측(first-seen) 원장인 `idc-first-seen.json`을 `PutObject`로 `athena-results/` 프리픽스에 다시 씁니다. 마지막 쓰기가 우선하며(last-writer-wins), 최초 실행 시 모든 값이 null인 상태로 자가 시딩되고, 영향 범위는 신규 가입자 배지에만 한정됩니다.

AI 분석 경로:
```
사용자 질문 → /api/analyze → Bedrock (Claude) 스트리밍 → SSE → 브라우저
```

### 주요 설계 결정

1. **CloudFront + 커스텀 헤더 시크릿** — ALB는 공개적으로 접근 불가. CloudFront가 시크릿 HTTP 헤더를 주입하고 ALB 리스너 규칙이 올바른 헤더가 있는 요청만 전달합니다. WAF 비용 없이 직접 ALB 접근을 차단합니다.

2. **ECS Fargate (Lambda 대신)** — Next.js App Router의 서버 컴포넌트와 스트리밍 응답은 영구 컨테이너가 필요합니다. Fargate는 Lambda 콜드 스타트와 15분 타임아웃 제한을 피할 수 있습니다.

3. **분석용 Athena** — 사용자 활동 데이터는 이미 S3에 Kiro 텔레메트리로 존재합니다. Athena는 ETL 파이프라인 없이 Glue 카탈로그를 통해 S3를 직접 쿼리하여 운영 부담을 최소화합니다.

4. **UserId 정규화** — IAM Identity Center는 사용자 ID에 `d-<스토어-id>.` 접두사를 붙입니다. 모든 SQL의 `REGEXP_REPLACE` 정규화로 테이블 간 일관된 사용자 식별이 가능합니다.

5. **두 가지 날짜 형식** — `user_report`는 `YYYY-MM-DD`(표준 ISO), `by_user_analytic`는 `MM-DD-YYYY`(레거시) 형식을 사용합니다. 모든 쿼리에서 이 차이를 반드시 처리해야 합니다.

6. **다크 우선 + 라이트 테마 옵션** — 기본은 다크(내부 개발자/운영팀 대상)이며, 사이드바 토글로 라이트 테마를 켤 수 있습니다. Tailwind v4 **팔레트 오버라이드** 방식으로 `html.light`에서 색상 변수를 재매핑(`globals.css`)하므로 컴포넌트는 다크 기준 클래스를 그대로 유지합니다 — `dark:`/`light:` 변형 없음. CSS 변수가 닿지 않는 Recharts 눈금/툴팁/커서 색상은 `useChartTheme()`(`lib/chart-theme.ts`)가 공급합니다. 테마 상태는 `lib/theme.tsx`(localStorage 저장, FOUC 방지 부트스트랩)에 있습니다. ADR-0005 참고. *(기존 "다크 전용" 결정을 대체함.)*

7. **Lambda@Edge + Cognito PKCE** — 인증을 NextAuth.js(앱 내)에서 Lambda@Edge(CDN 레이어)로 이전했습니다. 모든 요청은 오리진에 도달하기 전에 인증됩니다. Lambda@Edge 환경변수 제한을 피하기 위해 공개 Cognito 클라이언트(시크릿 없음)와 PKCE 플로우를 사용합니다. 설정은 SSM Parameter Store(us-east-1)에 저장되며 콜드 스타트 시 캐싱됩니다.

8. **데이터 마스킹** — 모든 사용자 식별자(displayName, email, username, organization)는 `lib/mask.ts`를 통해 브라우저에 전달되기 전 서버 측에서 마스킹됩니다. 첫 2글자만 표시하고 나머지는 `*`로 처리합니다. `resolveUserDetails()` 레이어에서 적용되어 모든 API 소비자가 자동으로 마스킹된 데이터를 받습니다.

9. **위치 매핑상 안전하지 않은 컬럼의 S3 직접 읽기** — `user_report` CSV 파일에는 동적 `{Model_name}_Messages` 컬럼과 나중에 추가된 `New_User`/`User_Email` 컬럼이 파일마다 다른 위치에 포함됩니다. Glue 테이블이 `OpenCSVSerDe`(위치 기반 매핑)를 사용하므로 Athena로는 안전한 쿼리가 불가능합니다. 공용 `lib/uar-s3.ts` 헬퍼가 월 프리픽스 병렬 `ListObjectsV2`로 CSV를 리스팅하고(기존의 하루 1회 순차 호출은 크로스 리전에서 약 20초 소요) 헤더 이름 기반으로 컬럼을 파싱하며, `/api/model-usage`(모델 컬럼)와 `/api/adoption`(`new_user` 플래그)이 함께 사용합니다. `/api/ingest-health`는 같은 리스팅을 다른 목적으로 사용합니다 — 객체 크기/`lastModified`와 파일별 헤더 *집합*을 읽어 스키마 드리프트와 전달 누락을 감지합니다. `OpenCSVSerDe`는 드리프트된 컬럼을 조용히 잘못된 이름에 매핑하므로 Athena로는 이 문제를 아예 볼 수 없습니다. ADR-0004 참고.

10. **레거시 컬럼 기반 파생 비율은 0이 아니라 nullable** — 이 계정에서는 `by_user_analytic`의 44개 지표 컬럼 중 39개가 모든 행에서 문자열 `0`입니다(`docs/kiro-user-activity-report-schema.md` §B-0 참고). 따라서 이 컬럼들로 만든 수락률 분모는 자주 `0`이 됩니다. `/api/productivity`는 모든 파생 비율에 최소 분모 조건을 걸고 `number | null`을 반환하며, UI는 이를 "계측되지 않음"으로 표시합니다. `0`을 반환하는 것은 측정하지 않은 값을 측정된 값처럼 제시하는 일이며, 이 대시보드가 사람을 오도할 가장 유력한 경로입니다.

11. **리포트 간 지표는 조인하지 않고 각각 합산** — 수락 코드 라인당 크레딧 KPI는 `user_report.credits_used`와 `by_user_analytic`의 AI 코드 라인 컬럼을 두 테이블 자체의 경계에서 계산한 공통 기간에 대해 각각 독립적으로 합산합니다. `by_user_analytic`의 541개 (사용자, 날짜) 쌍 중 303개가 `user_report`에 대응 행이 없으므로 내부 조인은 레거시 데이터의 절반 이상을 조용히 버립니다. 두 값은 서로 다른 모집단이므로 응답에는 각 항의 모집단 `n`이 별도로 담깁니다.

12. **날짜 기간은 Athena가 아니라 앱에서 계산** — 모든 라우트가 `DATE_ADD('day', -N, CURRENT_DATE)` 대신 `lib/athena-window.ts`의 명시적 `YYYY-MM-DD` 리터럴을 보간합니다. 이는 취향 문제가 아니라 전제 조건입니다. Athena의 `ResultReuseByAgeConfiguration`은 쿼리 **문자열**로 매칭하므로, 엔진이 기간을 계산하는 형태는 문자열은 그대로인데 의미만 조용히 바뀌어 절대 재사용되지 않습니다. 동일 SQL에서 재사용 플래그만 바꿔 실측: 100,304바이트 / 808ms → 0바이트 / 242ms. `/api/metrics?days=90`은 종단 간 2.17초 → 1.07초. 재사용 상한은 1440분이 아니라 60분입니다 — `/api/analyze`는 LLM이 작성한 SQL이 자체적으로 기간을 계산하므로, 1시간이면 그런 결과가 최신 02:00 UTC 리포트보다 앞설 수 있는 범위를 제한합니다. 이제 캐시 계층은 둘입니다: 태스크 간 공유되는 이 결과 재사용(`ATHENA_RESULT_REUSE`)과 태스크별 인프로세스 메모(`lib/query-cache.ts`) — 차가운 Fargate 태스크를 돕는 것은 전자뿐입니다. 두 계층 모두 안전한 이유는 리포트가 하루 한 번만 도착한다는 사실 하나입니다. 60분 지난 답이 이미 최대 24시간 지난 원본보다 더 오래됐을 수는 없습니다. `/api/ingest-health`는 신선도 모니터이므로 두 계층을 모두 우회합니다. 재사용 히트는 `GetQueryExecution`의 `ResultReuseInformation.ReusedPreviousResult`로 확인하며, `Statistics` 객체 전체를 읽으십시오(중첩 `--query` 다중 선택으로 뽑으면 필드가 없는 것처럼 보일 수 있습니다). `DataScannedInBytes`가 0으로 떨어지는 것도 함께 일치합니다. `tests/api/date-literal-audit.test.ts`가 이를 강제합니다.

13. **신규 가입자 감지를 위한 S3 최초 관측(first-seen) 원장** — `user_report`와 `by_user_analytic` 모두 가입일을 담고 있지 않으므로, "신규 가입자" 상태는 파생한 뒤 어딘가에 영속화해야 합니다. `lib/first-seen.ts`는 ECS 태스크 역할이 쓸 수 있는 유일한 S3 위치 — `athena-results/` 출력 프리픽스 — 에 `PutObject`로 `idc-first-seen.json`을 읽고 씁니다. 원장은 최초 실행 시 모든 타임스탬프가 null인 상태로 자가 시딩되며, 이 프리픽스에 버킷 수명주기 규칙을 적용할 경우 반드시 `idc-first-seen.json`을 제외해야 합니다. 그렇지 않으면 원장이 사라지고 모든 사용자가 한 번씩 "신규"로 재등장합니다.

14. **리포트 기반 구독 데이터만 사용 — `ListUserSubscriptions`는 콘솔 전용** — 2026-08-18에 수집한 CloudTrail 증거는 `user-subscriptions:ListUserSubscriptions`가 Kiro 콘솔 자체의 브라우저 프런트엔드가 SigV4로 직접 호출하는 API이며, 공개 SDK·CLI·문서화된 엔드포인트가 없음을 확인합니다. 대시보드는 이를 우회해서 얻으려 하지 않고, `/api/subscription`의 신선도 배너와 Kiro 콘솔로의 안내로 그 공백을 채웁니다.

15. **서비스 워커 없는 PWA-lite** — `app/manifest.ts`와 PNG 아이콘 3개로 설치 가능하게 만들지만 서비스 워커는 배포하지 않습니다. 이 대시보드는 실시간이며 Lambda@Edge Cognito 쿠키 인증 뒤에 있으므로, 오프라인용 응답 캐싱은 오래된 수치를 보여줄 것이고, standalone 설치는 어차피 별도의 쿠키 저장소를 가져 최초 실행 시 재인증이 필요합니다. 매니페스트만 제공하는 방식은 지킬 수 없는 오프라인 보장 없이 설치 가능성만 제공합니다.

### 운영

운영 절차는 `docs/runbooks/`를 참고하세요.

### 참고 문서

위에서 설명한 모든 데이터 소스의 상위 기준은 Kiro 엔터프라이즈 공식 문서입니다. 본 저장소 문서와 공식 문서가 다를 경우 공식 문서를 따릅니다:

- [Kiro IDE — Viewing per-user activity](https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/) — `user_report` / `by_user_analytic` 스키마, 매일 02:00 UTC 생성 주기, S3 경로 구조, 버킷 정책
- [Kiro CLI — View per-user activity](https://kiro.dev/docs/cli/enterprise/monitor-and-track/user-activity/) — `Client_Type`별 CSV 분리, 레거시 리포트 범위
- [Kiro CLI — Log user prompts](https://kiro.dev/docs/cli/enterprise/monitor-and-track/prompt-logging/) — 프롬프트 로그 JSON 스키마. **본 계정에서는 활성화되어 있으나**(별도 버킷, 실제 `HH` 파티션) 수집하지 않습니다. 수집하려면 `PROMPT_LOG_BUCKET`/`PROMPT_LOG_PREFIX` 환경변수와 `infra/lib/ecs-stack.ts`의 S3 읽기 권한 추가가 필요 — 앱 레이어가 아닌 CDK 변경 사항
- [Kiro CLI — Viewing Kiro usage on the dashboard](https://kiro.dev/docs/cli/enterprise/monitor-and-track/dashboard/) — Kiro 콘솔의 집계 전용 뷰. Active/Pending(미과금) 구독 상태를 정의하는 유일한 문서이며, 이 값은 `user-subscriptions:ListUserSubscriptions`에서 오고 두 CSV 리포트에는 존재하지 않습니다

컬럼 단위 상세는 `docs/kiro-user-activity-report-schema.md`에 있습니다.
