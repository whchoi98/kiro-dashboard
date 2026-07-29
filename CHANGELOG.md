# Changelog

[![English](https://img.shields.io/badge/lang-English-blue.svg)](#english)
[![한국어](https://img.shields.io/badge/lang-한국어-red.svg)](#한국어)

---

# English

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.0] - 2026-07-29

Driven by a re-reading of the four authoritative Kiro documentation pages
(IDE user activity, CLI user activity, prompt logging, console dashboard),
which are now recorded as the project's reference contract in `CLAUDE.md` and
`docs/kiro-user-activity-report-schema.md`.

### Added

- **`/rollout` — client rollout & cross-client adoption.** Daily actives and
  cumulative adopters per `Client_Type`, IDE-only / CLI-only / both segments,
  and a per-user pickup-lag table. `Client_Type` is the only dimension in
  `user_report` with real cardinality in this account, so it is the one
  rollout question the data can actually answer. The cumulative curve is
  accumulated in JS from each (user, client) pair's `MIN(date)` because
  Athena/Presto rejects `COUNT(DISTINCT …) OVER (ORDER BY …)`. Pickup lag is
  `null` — not `0` — for users first seen on the window's opening date, since
  left-censored history cannot distinguish "adopted both the same day" from
  "we cannot see far enough back".
- **`/ingest-health` — report delivery & freshness monitor.** Latest report
  date, S3 object write time, report lag, a date × client delivery matrix,
  header-drift grouping, an Athena-vs-CSV row parity check, and a legacy
  column instrumentation strip. The matrix has deliberately only two states:
  Kiro writes a CSV *only* for client types that had activity that day and
  publishes no expected-file count, so "no file" and "delivery failed" are
  indistinguishable from the data — an amber "late" state would fire every
  weekend and train operators to ignore the page.
- **Directory user activity grading on the overview** — five dormancy buckets
  (≤7d / 8–30d / 31–60d / 60d+ / no activity) plus a directory → any activity
  → sustained (5+ active days) funnel, with per-user active-days and
  days-since columns. Graded over IAM Identity Center directory users; the
  directory is **not** a Kiro subscription roster (only
  `user-subscriptions:ListUserSubscriptions` is, and it is not granted to the
  task role), so these counts are never presented as licenses or seats.
- **Credits per accepted AI code line** on `/productivity` — `user_report`
  credits ÷ (`chat_aicodelines` + `inline_aicodelines`) over the window where
  both reports overlap, computed as two independent sums rather than a
  (user, date) join because 303 of `by_user_analytic`'s 541 pairs have no
  `user_report` counterpart. Window bounds are read from the data, never
  hardcoded. Rendered as a credit ratio with no currency symbol — Kiro
  publishes no credit→price rate.

### Fixed

- **Legacy acceptance-rate denominators.** `/api/dev-activity` computed
  DocGen's rate over line *additions* only, dropping
  `docgeneration_*lineupdates` from both numerator and denominator, and
  omitted all three `inlinechat_*linedeletions` counters from InlineChat's
  denominator. Both are now summed over the full accepted/rejected/dismissed
  column families, and the top-users accepted-lines total picks up the two
  missing accepted columns.
- **Never-referenced legacy columns surfaced.** `/api/productivity` now
  aggregates `chat_messagesinteracted`, `dev_generatedlines`,
  `dev_acceptanceeventcount`, `codereview_succeededeventcount`, and
  `codereview_failedeventcount`, and derives rates from them behind a
  minimum-denominator guard. Rates return `null`, rendered as "not
  instrumented", rather than a confident `0.0%` — 39 of the legacy report's 44
  metric columns are the literal string `0` in every row in this account.
- **`/api/idc-users` no longer 500s on a missing Glue table.** An
  unprovisioned catalog now grades every directory user as "no activity"
  instead of failing the whole listing, matching the `isMissingTableError`
  degradation every other route already had.

### Changed

- `app/page.tsx` and `OverviewClient.tsx` now import `IdcUsersData` from
  `types/dashboard.ts` instead of each maintaining a local duplicate that
  silently dropped fields the route had started returning.

## [1.5.0] - 2026-07-18

### Added

- **Dark/light theme switching** — 다크/라이트 toggle in the sidebar (default
  dark, persisted in `localStorage`, pre-hydration bootstrap so there is no
  flash). Tailwind v4 palette override: `html.light` remaps the color
  variables so components keep their dark-first classes; charts read
  `useChartTheme()` for the colors CSS variables cannot reach. See ADR-0005.
- **NanumSquare font** — self-hosted woff2 (weights 300/400/700/800, OFL
  license) loaded via `next/font/local` and wired into the Tailwind v4 sans
  stack; no runtime CDN dependency behind CloudFront.
- **Follow-up suggestion chips in the chat widget** — after an answer
  completes, the floating widget now shows quick-prompt suggestions as a
  horizontally scrollable chip row above the composer (previously
  page-variant only).
- **Mobile responsive layout** — below 768px the sidebar becomes an
  off-canvas drawer with a fixed hamburger top bar, the chat widget expands
  to a full-screen sheet (drag disabled), and grids/tables/filter rows
  across all 12 dashboard pages stack or scroll instead of overflowing.
  Desktop rendering at `md+` is unchanged.
- **CloudFront custom domain support** — optional `CUSTOM_DOMAIN` +
  `CUSTOM_DOMAIN_CERT_ARN` deploy vars add the distribution alias + ACM
  certificate and whitelist the domain on the Cognito app client (the edge
  auth derives `redirect_uri` from the request Host header). Live at
  `kirodashboard.whchoi.net`.

### Fixed

- **Chat scroll hijack** — the conversation no longer yanks to the bottom on
  every streamed chunk; auto-follow only runs while the user is pinned to
  the bottom (`lib/chat-scroll.ts` stick-to-bottom helper), and the view
  re-bottoms when the suggestion chip row appears at stream end.
- **Cognito `redirect_mismatch` on the custom domain** — accessing the CNAME
  showed Cognito's "An error was encountered with the requested page"
  because the domain was missing from the app client callback whitelist.
- iOS Safari focus auto-zoom on the chat composer (16px input below `md`).
- Chat launcher stacked above modal backdrops — moved below the drawer and
  user-detail panel so it dims and is inert while they are open.
- Body scroll-through behind the open mobile drawer and chat sheet;
  drawer footer (locale switcher, version link) clipped behind mobile
  browser toolbars.
- **Client-side "Application error" crashes on error API payloads** — pages
  that stored an `{ error }` response then read `data?.prop.length`/`.map`
  crashed (optional chaining stops at `prop`, so the terminal access threw).
  Guarded across `/engagement`, `/credits`, `/adoption`, `/model-usage`, and
  the user-detail panel.
- **Login self-heal** — the Lambda@Edge callback auto-retries once (via an
  `auth_retry` cookie) when Cognito rejects the token exchange
  (`invalid_grant`/`invalid_request`, a code↔PKCE-verifier mismatch) instead
  of dead-ending on "Authentication failed"; the `state`→return-path decode
  is hardened against open redirect (same-origin path only). See ADR-0006.

## [1.2.0] - 2026-07-18

### Added

- **Chatbot Agent** — global floating chat widget (structure borrowed from
  claude-code-dashboard): draggable panel available on every page, backed
  by the existing `/api/analyze` Bedrock agent (Athena SQL + IdC lookup
  tools), multi-turn history with a 12-turn cap, stop/new-chat controls.
  The `/analyze` page and the widget now share `lib/useChatStream.ts` and
  the `app/components/chat/` component set.
- **AI analysis export** — completed answers on `/analyze` can be saved as
  Markdown (`.md` download with question/date header) or PDF
  (`html2canvas-pro` + `jspdf` DOM capture — Korean text and dark-theme
  tables render intact; libraries load on demand).
- `EcsDashboardConfig` prop on `EcsStack` so forks can override every
  account-specific env (S3 buckets, Glue database/table, IdC store, report
  prefix) without editing the source. Maintainer defaults unchanged.
- Opt-in `KiroDashboardCatalog` CDK stack that provisions the Glue database
  and `user_report` external table over a fork-owned S3 bucket. Activated by
  setting `ATHENA_DATA_BUCKET_NAME` at `cdk deploy` time.
- `infra/sql/user-report-table.sql` — manual DDL alternative to the opt-in
  Catalog stack.
- README + `.env.example` now document the Kiro User Activity Report
  prerequisite and every CDK-time override env var.
- `.env.deploy.example` template (git-ignored as `.env.deploy`) bundles
  every CDK-time env var in one place so operators can
  `cp .env.deploy.example .env.deploy` → `set -a; source .env.deploy; set +a`
  → `cdk deploy` instead of repeating long `export` blocks at the
  command line.
- Sidebar footer now displays the app version (`v1.1.0`), read from
  `package.json` via `lib/version.ts`. A new `version-sync` test keeps
  `package.json`, `CHANGELOG.md` (both languages), `CLAUDE.md`, and the
  sidebar display in lockstep. The footer links to the new `/changelog` page.
- **Executive** menu (`/exec`) — one-page leadership snapshot composing
  existing APIs: KPI cards, daily active users & credits, model share,
  credits by tier, top credit users.
- **Subscription & Overage** menu (`/subscription`, `/api/subscription`) —
  tier mix (users/credits/messages per `subscription_tier`), tier credit
  share, and an overage governance watchlist (per-user
  `overage_credits_used` vs `overage_cap` utilization).
- **New Users & Adoption** menu (`/adoption`, `/api/adoption`) — daily new
  users (UAR `New_User` flag), active users, cumulative-user trend, and a
  recent-new-users table. Reads CSVs S3-direct with header-name parsing
  because OpenCSVSerDe positional mapping makes the late-appended
  `new_user` column unsafe to query through Athena.
- **Dev Activity Detail** menu (`/dev-activity`, `/api/dev-activity`) —
  five legacy `by_user_analytic` groups previously unused by the
  dashboard: TestGen, DocGen, Transform, InlineChat, CodeFix (events,
  generated vs accepted lines, acceptance rate, daily trend, top users).
- **Changelog** page (`/changelog`) — renders this bilingual file at build
  time (`force-static`), styled version cards with Added/Changed/Fixed
  groups; language follows the KO/EN switcher.
- `lib/uar-s3.ts` — shared UAR S3 helpers (bucket/prefix resolution,
  month-prefix parallel listing, CSV parsing) extracted from the
  model-usage route and reused by `/api/adoption`.

### Performance

- `/api/model-usage` dropped from ~20s to ~1.6s: the per-day sequential
  `ListObjectsV2` loop (90 cross-region round trips) was replaced with
  parallel month-prefix listing plus a date-window filter, with S3
  pagination now handled.

### Fixed

- Dashboard API routes (`/api/users`, `/api/trends`, `/api/credits`,
  `/api/engagement`, `/api/productivity`, `/api/metrics`, `/api/client-dist`)
  no longer surface a 500 when the underlying Glue table does not exist
  yet. They detect missing-table errors via `isMissingTableError` and
  return a 200 with an empty but well-shaped payload, so fresh accounts
  render empty tables instead of an "Application error" crash page.
- `app/users/page.tsx` and `app/trends/page.tsx` additionally gained
  `Array.isArray` guards around API responses to prevent `.map()` TypeErrors
  if any future route regresses to returning `{ error }`.
- `app/api/analyze/route.ts` system prompt no longer embeds the maintainer's
  `whchoi01-titan-q-log` bucket or `d-90663be888` IdC store. It now reads
  `ATHENA_DATABASE` + `ATHENA_OUTPUT_BUCKET` from the environment and tells
  the LLM to normalize any `d-xxxxxxxxxxxx.` prefix generically.
- `app/api/model-usage/route.ts` no longer falls back to the maintainer's
  `q-user-log/AWSLogs/120443221648/...` prefix when `S3_REPORT_PREFIX` is
  unset. Missing bucket/prefix now returns an empty-but-valid payload
  instead of issuing S3 calls against the wrong account.
- New regression test `tests/api/hardcode-audit.test.ts` fails the CI if
  any runtime file under `app/` or `lib/` mentions the maintainer bucket
  or account id again.
- `infra/cdk.json` no longer hardcodes `useExistingVpc=true` /
  `vpcId=vpc-005338aca7ac5fb96` (maintainer's VPC). Default is now
  "create a fresh 10.254.0.0/16 VPC" so a fresh-account `cdk deploy`
  no longer fails VPC lookup. Operators that want to reuse an
  existing VPC can set `EXISTING_VPC_ID` / `VPC_CIDR` — `bin/app.ts`
  feeds them into CDK context.

## [1.1.0] - 2026-04-24

### Added

- Lambda@Edge + Cognito PKCE authentication at CloudFront Viewer Request level, replacing NextAuth.js
- Lambda@Edge function with JWT validation (`aws-jwt-verify`), PKCE flow, token refresh, and HttpOnly cookie management
- SSM Parameter Store config loader (us-east-1) for Lambda@Edge with cold-start caching
- CDK `EdgeFunction` construct with esbuild bundling and cross-region deployment to us-east-1
- `AwsCustomResource` for SSM config writes and Cognito callback URL updates post-deploy
- Public Cognito `EdgeAuthClient` (no client secret) for Lambda@Edge PKCE compatibility
- Server-side data masking for all user identifiers via `lib/mask.ts` — first 2 characters shown, rest replaced with `*`
- Logout menu in sidebar with `/auth/logout` link (Lambda@Edge clears cookies and redirects to Cognito logout)
- Model Usage analysis page with AI model distribution pie chart, Auto vs Manual comparison, daily trend, and per-user model preference table
- `/api/model-usage` endpoint reading S3 CSV files directly for dynamic `{Model_name}_Messages` columns (bypasses Glue OpenCSVSerDe positional mapping limitation)
- `overage_cap` field added to `UserReport` TypeScript interface (was in Glue table but missing from types)

### Changed

- CDK infrastructure expanded from 4 to 5 stacks (`KiroDashboardEdgeLambda` auto-created in us-east-1)
- CdnStack rewritten to include Lambda@Edge, SSM config, and Cognito callback URL management
- SecurityStack updated with EdgeAuthClient UserPoolClient
- User identity resolution (`lib/identity.ts`) now returns masked values for displayName, email, username, organization
- All user-facing API routes (users, credits, productivity, user-detail, idc-users) return masked identifiers

### Removed

- NextAuth.js dependency and configuration (`lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`)
- Custom login page (`app/login/page.tsx`) — replaced by Cognito Hosted UI
- `NEXTAUTH_URL` and `NEXTAUTH_SECRET` environment variables

## [1.0.0] - 2026-04-21

### Added

- Full-stack Next.js 14 dashboard with 7 pages: Overview, Users, Trends, Credits, IDE Productivity, Engagement, AI Analysis
- 12 API routes querying Athena (user_report + by_user_analytic tables) with UserId prefix normalization
- AI-powered natural language analysis via Amazon Bedrock Claude Sonnet 4.6 with tool use (query_athena, lookup_users)
- React-markdown + remark-gfm rendering for AI analysis responses with custom dark theme components
- Identity Center integration displaying 45 IdC users with active/inactive status, display names, emails, and organizations
- User detail drill-down panel with daily activity breakdown and client type analysis
- IDE Productivity page using 46-column legacy by_user_analytic report (chat, inline completion, dev agent, code review, test/doc generation)
- Date range filtering with 14 presets: 1m, 5m, 10m, 1h, 3h, 6h, 12h, 1d, 3d, 7d, 14d, 30d, 60d, 90d
- Animated Kiro ghost mascot with page-themed accessories (dashboard grid, user avatars, trend arrows, coins, code terminal, chat bubbles)
- Animated mini Kiro characters as sidebar navigation icons with per-page accent colors
- Korean/English bilingual interface with sidebar language toggle
- Kiro brand identity using official purple (#9046FF) color palette from kiro.dev
- Real Kiro ghost SVG character from img/kiro.svg applied across all components
- AWS CDK infrastructure with 4 stacks: Network (mgmt-vpc), Security (SG, Cognito), ECS (Fargate, ALB, ECR), CDN (CloudFront)
- Docker multi-stage build (node:20-alpine, ARM64) with standalone Next.js output
- ECS Fargate service with Auto Scaling (1-4 tasks, CPU 70% target)
- CloudFront distribution with X-Custom-Secret header validation for ALB security
- Cognito User Pool with Lambda@Edge PKCE authentication
- Client distribution pie chart with real Athena data (KIRO_IDE vs KIRO_CLI)
- Engagement funnel and user segmentation (Power/Active/Light/Idle tiers)
- Metric cards in AWSops dashboard style (semi-transparent dark, hover effects, font-mono values)
- Athena query pagination via NextToken for datasets exceeding 1,000 rows
- Claude Code project structure with hooks, skills, commands, agents, and documentation

### Fixed

- CDK cross-stack dependency cycle resolved by moving IAM roles to EcsStack
- ARM64 runtime platform mismatch (exec format error) fixed with runtimePlatform setting
- Next.js standalone binding fixed with HOSTNAME=0.0.0.0 environment variable
- Static prerendering issue fixed with force-dynamic export on all data pages
- Empty NEXTAUTH_URL fallback fixed by changing ?? to || operator
- Athena S3 write permission fixed by upgrading to S3FullAccess for query results
- SQL column name case mismatch fixed (PascalCase to lowercase matching Glue catalog)
- Subscription tier case normalization (POWER vs Power) with toUpperCase() mapping
- changeRates key mismatch between API response and frontend consumption
- Bedrock model ID corrected to global inference profile (global.anthropic.claude-sonnet-4-6)
- Bedrock IAM policy expanded to include inference-profile ARN pattern

[Unreleased]: https://github.com/whchoi98/kiro-dashboard/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.2.0...v1.5.0
[1.2.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/whchoi98/kiro-dashboard/releases/tag/v1.0.0

---

# 한국어

이 프로젝트의 모든 주요 변경 사항은 이 파일에 기록됩니다.
이 문서는 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를 기반으로 하며,
[Semantic Versioning](https://semver.org/spec/v2.0.0.html)을 따릅니다.

## [Unreleased]

## [1.6.0] - 2026-07-29

Kiro 공식 문서 4종(IDE 사용자 활동, CLI 사용자 활동, 프롬프트 로깅, 콘솔
대시보드)을 다시 정독한 결과를 반영했습니다. 이 4개 페이지는 이제 `CLAUDE.md`와
`docs/kiro-user-activity-report-schema.md`에 프로젝트의 참조 계약으로
기록되어 있습니다.

### 추가됨

- **`/rollout` — 클라이언트 롤아웃 및 교차 사용 현황.** `Client_Type`별 일간
  활성 사용자와 누적 도입자, IDE 전용 / CLI 전용 / 양쪽 사용 세그먼트,
  사용자별 두 번째 클라이언트 도입 지연(pickup lag) 테이블. 이 계정에서
  `user_report`의 컬럼 중 실제로 여러 값을 갖는 것은 `Client_Type` 뿐이므로,
  데이터가 답할 수 있는 유일한 롤아웃 질문입니다. Athena/Presto가
  `COUNT(DISTINCT …) OVER (ORDER BY …)`를 거부하기 때문에 누적 곡선은 (사용자,
  클라이언트) 쌍별 `MIN(date)`를 JS에서 누적해 계산합니다. 조회 기간의 첫날에
  처음 나타난 사용자의 pickup lag은 `0`이 아니라 `null`입니다 — 좌측 절단된
  이력에서는 "같은 날 둘 다 도입"과 "그 이전을 볼 수 없음"을 구별할 수 없기
  때문입니다.
- **`/ingest-health` — 리포트 전달 및 신선도 모니터.** 최신 리포트 날짜, S3
  객체 기록 시각, 리포트 지연, 날짜 × 클라이언트 전달 매트릭스, 헤더 변형
  그룹화, Athena ↔ CSV 행 수 대조, 레거시 컬럼 계측 현황. 매트릭스는 의도적으로
  두 가지 상태만 가집니다: Kiro는 그날 활동이 있었던 클라이언트 타입에 대해서만
  CSV를 쓰고 기대 파일 수를 공개하지 않으므로, 데이터만으로는 "파일 없음"과
  "전달 실패"를 구별할 수 없습니다. 주말마다 켜지는 주의(amber) 상태는 운영자가
  이 페이지를 무시하도록 학습시킬 뿐입니다.
- **개요 페이지의 디렉터리 사용자 활동 등급** — 5개 휴면 구간(7일 이내 / 8~30일
  / 31~60일 / 60일 초과 / 활동 없음)과 디렉터리 → 활동 있음 → 지속 활동(5일
  이상) 전환, 사용자별 활동 일수·경과일 컬럼. IAM Identity Center 디렉터리
  사용자를 기준으로 산출하며, 디렉터리는 Kiro 구독 명부가 **아닙니다**(명부는
  `user-subscriptions:ListUserSubscriptions`뿐이며 태스크 역할에 부여되어 있지
  않음). 따라서 이 수치를 라이선스나 좌석으로 표현하지 않습니다.
- **`/productivity`의 수락 코드 라인당 크레딧** — 두 리포트가 겹치는 기간에
  대해 `user_report` 크레딧 ÷ (`chat_aicodelines` + `inline_aicodelines`).
  `by_user_analytic`의 541개 (사용자, 날짜) 쌍 중 303개가 `user_report`에 대응
  행이 없으므로 조인이 아니라 각각 독립적으로 합산합니다. 기간 경계는
  하드코딩하지 않고 데이터에서 읽습니다. Kiro가 크레딧→금액 환산율을 공개하지
  않으므로 통화 기호 없이 비율로만 표시합니다.

### 수정됨

- **레거시 수락률 분모 오류.** `/api/dev-activity`에서 DocGen 수락률이 라인
  *추가*분만으로 계산되어 `docgeneration_*lineupdates`가 분자·분모 양쪽에서
  빠져 있었고, InlineChat
  분모에서는 `inlinechat_*linedeletions` 3개 컬럼이 모두 누락되어 있었습니다.
  이제 accepted/rejected/dismissed 컬럼군 전체를 합산하며, 상위 사용자 수락
  라인 합계에도 빠져 있던 accepted 컬럼 2개가 반영됩니다.
- **한 번도 참조되지 않던 레거시 컬럼 노출.** `/api/productivity`가
  `chat_messagesinteracted`, `dev_generatedlines`, `dev_acceptanceeventcount`,
  `codereview_succeededeventcount`, `codereview_failedeventcount`를 집계하고
  최소 분모 가드를 거쳐 비율을 산출합니다. 이 계정에서는 레거시 리포트의 44개
  지표 컬럼 중 39개가 모든 행에서 문자열 `0`이므로, 확신에 찬 `0.0%` 대신
  `null`을 반환해 "계측되지 않음"으로 표시합니다.
- **`/api/idc-users`가 Glue 테이블 부재 시 500을 반환하지 않습니다.** 카탈로그가
  프로비저닝되지 않은 경우 전체 목록 조회를 실패시키는 대신 모든 디렉터리
  사용자를 "활동 없음"으로 등급화합니다. 다른 라우트가 이미 갖고 있던
  `isMissingTableError` 폴백과 동일한 동작입니다.

### 변경됨

- `app/page.tsx`와 `OverviewClient.tsx`가 각자 로컬 중복 정의를 두는 대신
  `types/dashboard.ts`의 `IdcUsersData`를 가져옵니다. 기존 중복 정의는 라우트가
  새로 반환하기 시작한 필드를 조용히 누락시켰습니다.

## [1.5.0] - 2026-07-18

### 추가됨

- **다크/라이트 테마 전환** — 사이드바 다크/라이트 토글 (기본 다크,
  `localStorage` 저장, hydration 전 부트스트랩으로 깜빡임 없음). Tailwind v4
  팔레트 오버라이드 방식: `html.light`가 색상 변수를 재매핑하므로 컴포넌트는
  다크 기준 클래스를 그대로 유지; 차트는 CSS 변수가 닿지 않는 색상을
  `useChartTheme()`로 읽음. ADR-0005 참고.
- **나눔스퀘어 폰트** — woff2 4종(300/400/700/800, OFL 라이선스)을
  `next/font/local`로 셀프호스팅하고 Tailwind v4 기본 산세리프 스택에 연결.
  CloudFront 뒤에서 외부 CDN 런타임 의존 없음.
- **챗봇 위젯 후속 추천 질문** — 답변 완료 후 플로팅 위젯에도 입력창 위
  가로 스크롤 칩으로 추천 질문 표시 (기존에는 /analyze 페이지 전용).
- **모바일 반응형 레이아웃** — 768px 미만에서 사이드바가 햄버거 상단바 +
  오프캔버스 드로어로 전환, 챗봇 위젯은 풀스크린 시트로 확장(드래그
  비활성), 12개 대시보드 페이지의 그리드/테이블/필터 행 스택·스크롤 처리.
  `md+` 데스크톱 렌더링은 무변경.
- **CloudFront 커스텀 도메인 지원** — 배포 변수 `CUSTOM_DOMAIN` +
  `CUSTOM_DOMAIN_CERT_ARN`으로 배포판 별칭 + ACM 인증서 + Cognito 앱
  클라이언트 허용 URL을 코드로 관리 (edge 인증이 Host 헤더로
  `redirect_uri`를 생성). `kirodashboard.whchoi.net` 운영 중.

### 수정됨

- **챗봇 스크롤 하이재킹** — 스트리밍 청크마다 대화가 바닥으로 강제
  스크롤되던 문제 수정; 사용자가 바닥에 있을 때만 자동 추적
  (`lib/chat-scroll.ts` stick-to-bottom 헬퍼), 스트림 종료 시 추천 칩
  등장에 맞춰 재정렬.
- **커스텀 도메인 Cognito `redirect_mismatch`** — CNAME 접속 시 "An error
  was encountered with the requested page" 에러가 나던 문제 수정 (앱
  클라이언트 콜백 허용 목록에 도메인 등록).
- iOS Safari에서 챗봇 입력창 포커스 시 자동 확대 문제 수정 (`md` 미만
  16px 입력).
- 챗봇 런처가 모달 백드롭 위에 떠 있던 z-order 충돌 수정 — 드로어/사용자
  상세 패널이 열리면 런처가 어두워지고 비활성화.
- 모바일 드로어·챗봇 시트 뒤 페이지 스크롤 관통 차단; 모바일 브라우저
  툴바에 드로어 하단(언어 전환, 버전 링크)이 가려지던 문제 수정.
- **에러 페이로드에서 클라이언트 "Application error" 크래시** — `{ error }`
  응답을 저장한 뒤 `data?.prop.length`/`.map`을 읽으면 옵셔널 체이닝이
  `prop`에서 멈춰 뒤 접근이 예외를 던지던 문제. `/engagement`, `/credits`,
  `/adoption`, `/model-usage`, 사용자 상세 패널 전반에 가드 추가.
- **로그인 자기치유** — Cognito가 토큰 교환을 거부할 때
  (`invalid_grant`/`invalid_request`, 코드↔PKCE verifier 불일치) "Authentication
  failed"로 막다르지 않고 Lambda@Edge 콜백이 `auth_retry` 쿠키로 1회 자동
  재시도; `state`→복귀 경로 디코딩을 오픈 리다이렉트로부터 보호(same-origin
  경로만 허용). ADR-0006 참고.

## [1.2.0] - 2026-07-18

### 추가됨

- **Chatbot Agent** — 전역 플로팅 챗봇 위젯 (claude-code-dashboard 구조
  차용): 모든 페이지에서 사용 가능한 드래그 패널, 기존 `/api/analyze`
  Bedrock 에이전트(Athena SQL + IdC 조회 툴) 기반, 12턴 캡 멀티턴
  히스토리, 중지/새 대화 컨트롤. `/analyze` 페이지와 위젯이
  `lib/useChatStream.ts`와 `app/components/chat/` 컴포넌트를 공유.
- **AI 분석 내보내기** — `/analyze`에서 완료된 답변을 Markdown(질문/날짜
  헤더 포함 `.md` 다운로드) 또는 PDF(`html2canvas-pro` + `jspdf` DOM
  캡처 — 한글과 다크 테마 표가 그대로 렌더링, 라이브러리는 클릭 시
  로드)로 저장.
- `EcsStack`에 `EcsDashboardConfig` prop 도입 — 포크가 계정별 값(S3
  버킷, Glue DB/테이블, IdC 스토어, 리포트 프리픽스)을 소스 수정 없이
  덮어쓸 수 있음. 메인테이너 기본값은 그대로 유지.
- 옵트-인 CDK 스택 `KiroDashboardCatalog` 추가 — `ATHENA_DATA_BUCKET_NAME`
  설정 시 포크 소유 S3 버킷 위에 Glue 데이터베이스와 `user_report`
  외부 테이블을 생성.
- `infra/sql/user-report-table.sql` — Catalog 스택을 쓰지 않는 경우의
  수동 DDL 대안.
- README와 `.env.example`에 Kiro User Activity Report 사전 요구 사항 및
  CDK 배포 시 오버라이드 환경 변수 전체를 문서화.
- `.env.deploy.example` 템플릿 추가 — CDK 배포 시 필요한 모든 환경 변수를
  한 파일에 모아서 `cp .env.deploy.example .env.deploy` →
  `set -a; source .env.deploy; set +a` → `cdk deploy` 순서로 배포할 수
  있게 함. `.env.deploy`는 `.gitignore`에 포함되어 계정별 값이
  커밋되지 않음.
- 사이드바 하단에 앱 버전(`v1.1.0`) 표기 — `lib/version.ts`를 통해
  `package.json`에서 읽어옴. 새 `version-sync` 테스트가 `package.json`,
  `CHANGELOG.md`(양 언어), `CLAUDE.md`, 사이드바 표기를 동기화 상태로
  강제함. 버전 표기는 새 `/changelog` 페이지로 연결됨.
- **Executive** 메뉴 (`/exec`) — 기존 API를 조합한 경영진용 원페이지
  스냅샷: KPI 카드, 일별 활성 사용자·크레딧, 모델 점유율, 티어별
  크레딧, 상위 크레딧 사용자.
- **구독·초과사용** 메뉴 (`/subscription`, `/api/subscription`) — 구독
  티어 구성(티어별 사용자/크레딧/메시지), 티어 크레딧 점유율, 사용자별
  `overage_credits_used` 대비 `overage_cap` 사용률 워치리스트.
- **신규 사용자·온보딩** 메뉴 (`/adoption`, `/api/adoption`) — UAR
  `New_User` 플래그 기반 일별 신규 사용자, 활성 사용자, 누적 사용자
  추이와 최근 신규 사용자 테이블. OpenCSVSerDe 위치 매핑 문제로
  `new_user` 컬럼은 Athena로 조회할 수 없어 S3 직접 읽기(헤더 이름
  기반 파싱)로 구현.
- **개발활동 상세** 메뉴 (`/dev-activity`, `/api/dev-activity`) —
  대시보드가 사용하지 않던 레거시 `by_user_analytic` 5개 그룹:
  TestGen, DocGen, Transform, InlineChat, CodeFix (이벤트, 생성 대비
  수락 라인, 수락률, 일별 추이, 상위 사용자).
- **Changelog** 페이지 (`/changelog`) — 이 이중언어 파일을 빌드 타임에
  렌더링(`force-static`), Added/Changed/Fixed 그룹별 버전 카드 스타일,
  KO/EN 스위처를 따라 언어 전환.
- `lib/uar-s3.ts` — model-usage 라우트에서 추출한 UAR S3 공용 헬퍼
  (버킷/프리픽스 결정, 월 프리픽스 병렬 리스팅, CSV 파싱),
  `/api/adoption`에서 재사용.

### 성능

- `/api/model-usage` 응답 시간 ~20초 → ~1.6초: 하루당 1회씩 순차
  호출하던 `ListObjectsV2`(크로스 리전 90회 왕복)를 월 프리픽스 병렬
  리스팅 + 기간 필터로 교체, S3 페이지네이션도 처리.

### 수정됨

- 대시보드 API 라우트(`/api/users`, `/api/trends`, `/api/credits`,
  `/api/engagement`, `/api/productivity`, `/api/metrics`, `/api/client-dist`)
  가 Glue 테이블이 아직 프로비저닝되지 않았을 때 더 이상 500을 내지
  않음. `isMissingTableError` 헬퍼로 감지해 200 + 빈 payload를 반환하여
  새 계정에서도 "Application error" 크래시 대신 빈 표로 렌더링됨.
- `app/users/page.tsx`, `app/trends/page.tsx`에 `Array.isArray` 가드 추가 —
  향후 어떤 라우트가 `{ error }` 객체를 반환해도 `.map()` TypeError를
  일으키지 않도록 방어선 강화.
- `app/api/analyze/route.ts`의 Bedrock 시스템 프롬프트에서 메인테이너
  버킷 `whchoi01-titan-q-log`와 IdC 스토어 `d-90663be888` 하드코딩 제거.
  이제 `ATHENA_DATABASE` / `ATHENA_OUTPUT_BUCKET` 환경 변수를 읽어
  구성하며, UserId 프리픽스 패턴도 `d-xxxxxxxxxxxx.` 로 일반화.
- `app/api/model-usage/route.ts`가 `S3_REPORT_PREFIX` 미설정 시 메인테이너의
  `q-user-log/AWSLogs/120443221648/...` 경로로 폴백하던 동작 제거. 대신
  버킷/프리픽스가 비어 있으면 빈 payload를 반환하여 엉뚱한 계정에
  S3 요청이 나가는 상황을 원천 차단.
- `tests/api/hardcode-audit.test.ts` 회귀 가드 추가 — `app/`, `lib/`
  하위의 런타임 코드에 메인테이너 버킷/계정 ID가 다시 들어가면
  CI가 실패함.
- `infra/cdk.json`의 `useExistingVpc=true` / `vpcId=vpc-005338aca7ac5fb96`
  메인테이너 VPC 하드코딩 제거. 기본값은 "새 VPC 생성"(10.254.0.0/16)
  으로 바뀌어 fresh 계정의 `cdk deploy`가 VPC lookup 실패 없이 성공.
  기존 VPC 재사용은 `EXISTING_VPC_ID` / `VPC_CIDR` 환경 변수로 지정
  (`bin/app.ts`가 CDK context로 주입).

## [1.1.0] - 2026-04-24

### Added

- CloudFront Viewer Request 레벨 Lambda@Edge + Cognito PKCE 인증 (NextAuth.js 대체)
- Lambda@Edge 함수: JWT 검증(`aws-jwt-verify`), PKCE 플로우, 토큰 갱신, HttpOnly 쿠키 관리
- SSM Parameter Store 설정 로더 (us-east-1) — Lambda@Edge 콜드 스타트 캐싱
- CDK `EdgeFunction` 구성: esbuild 번들링, us-east-1 크로스 리전 배포
- `AwsCustomResource`: SSM 설정 쓰기 및 Cognito 콜백 URL 배포 후 업데이트
- 공개 Cognito `EdgeAuthClient` (클라이언트 시크릿 없음) — Lambda@Edge PKCE 호환
- `lib/mask.ts` 서버 측 데이터 마스킹 — 모든 사용자 식별자 첫 2글자만 표시, 나머지 `*` 처리
- 사이드바 로그아웃 메뉴 — `/auth/logout` 링크 (Lambda@Edge가 쿠키 삭제 후 Cognito 로그아웃 리다이렉트)
- 모델 사용 분석 페이지: AI 모델 분포 파이 차트, Auto vs 수동 비교, 일별 추이, 사용자별 모델 선호도 테이블
- `/api/model-usage` 엔드포인트: 동적 `{Model_name}_Messages` 컬럼을 위한 S3 CSV 직접 읽기 (Glue OpenCSVSerDe 위치 매핑 한계 우회)
- `UserReport` TypeScript 인터페이스에 `overage_cap` 필드 추가 (Glue 테이블에 존재했으나 타입 누락)

### Changed

- CDK 인프라 4개 → 5개 스택 확장 (`KiroDashboardEdgeLambda` us-east-1 자동 생성)
- CdnStack 재작성: Lambda@Edge, SSM 설정, Cognito 콜백 URL 관리 포함
- SecurityStack에 EdgeAuthClient UserPoolClient 추가
- 사용자 ID 해석(`lib/identity.ts`)이 마스킹된 값 반환 (displayName, email, username, organization)
- 사용자 대면 API 라우트(users, credits, productivity, user-detail, idc-users) 마스킹된 식별자 반환

### Removed

- NextAuth.js 의존성 및 설정 (`lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`)
- 커스텀 로그인 페이지 (`app/login/page.tsx`) — Cognito Hosted UI로 대체
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET` 환경변수

## [1.0.0] - 2026-04-21

### Added

- Next.js 14 풀스택 대시보드 7개 페이지 구현: 대시보드, 사용자, 트렌드, 크레딧, IDE 생산성, 참여도, AI 분석
- Athena 연동 12개 API 라우트 구현 (user_report + by_user_analytic 테이블, UserId prefix 정규화 포함)
- Amazon Bedrock Claude Sonnet 4.6 기반 자연어 AI 분석 기능 (query_athena, lookup_users 도구 사용)
- react-markdown + remark-gfm 마크다운 렌더링 (다크 테마 커스텀 컴포넌트 적용)
- Identity Center 통합 — 45명 IdC 사용자 활성/비활성 상태, 이름, 이메일, 소속 표시
- 사용자 상세 드릴다운 패널 (일별 활동 내역, 클라이언트 유형별 분석)
- IDE 생산성 페이지 — 46개 컬럼 레거시 리포트 활용 (채팅, 인라인 완성, Dev Agent, 코드 리뷰, 테스트/문서 생성)
- 14개 기간 프리셋 필터링: 1분, 5분, 10분, 1시간, 3시간, 6시간, 12시간, 1일, 3일, 7일, 14일, 30일, 60일, 90일
- 페이지별 테마 액세서리를 가진 애니메이션 Kiro 유령 마스코트 (대시보드 그리드, 사용자 아바타, 트렌드 화살표, 코인, 코드 터미널, 채팅 말풍선)
- 사이드바 네비게이션 미니 Kiro 캐릭터 애니메이션 (페이지별 고유 액센트 색상)
- 한국어/영어 이중 언어 인터페이스 (사이드바 언어 전환)
- kiro.dev 공식 보라색(#9046FF) 컬러 팔레트 기반 Kiro 브랜드 적용
- img/kiro.svg 실제 Kiro 유령 SVG 캐릭터 전체 컴포넌트 적용
- AWS CDK 4개 스택 인프라: Network(mgmt-vpc), Security(SG, Cognito), ECS(Fargate, ALB, ECR), CDN(CloudFront)
- Docker 멀티 스테이지 빌드 (node:20-alpine, ARM64, standalone 출력)
- ECS Fargate 서비스 오토 스케일링 (1-4 태스크, CPU 70% 타겟)
- CloudFront X-Custom-Secret 헤더 검증을 통한 ALB 보안
- Cognito User Pool + Lambda@Edge PKCE 인증
- Athena 실제 데이터 기반 클라이언트 분포 파이 차트 (KIRO_IDE vs KIRO_CLI)
- 참여도 퍼널 및 사용자 세그먼트 (Power/Active/Light/Idle 등급)
- AWSops 스타일 메트릭 카드 (반투명 다크, hover 효과, font-mono 값)
- NextToken 기반 Athena 쿼리 페이지네이션 (1,000행 초과 데이터셋 대응)
- Claude Code 프로젝트 구조 초기화 (훅, 스킬, 커맨드, 에이전트, 문서)

### Fixed

- CDK 크로스 스택 순환 참조 해결 (IAM 역할을 EcsStack으로 이동)
- ARM64 런타임 플랫폼 불일치 수정 (exec format error, runtimePlatform 설정)
- Next.js standalone 바인딩 수정 (HOSTNAME=0.0.0.0 환경변수 추가)
- 정적 프리렌더링 문제 수정 (모든 데이터 페이지에 force-dynamic 적용)
- 빈 NEXTAUTH_URL 폴백 수정 (?? → || 연산자 변경)
- Athena S3 쓰기 권한 수정 (쿼리 결과 저장을 위한 S3FullAccess 부여)
- SQL 컬럼명 대소문자 불일치 수정 (PascalCase → Glue 카탈로그 소문자 일치)
- Subscription Tier 대소문자 정규화 (POWER vs Power, toUpperCase() 매핑)
- changeRates 키 불일치 수정 (API 응답과 프론트엔드 간 키 이름 통일)
- Bedrock 모델 ID 수정 (global inference profile global.anthropic.claude-sonnet-4-6 적용)
- Bedrock IAM 정책 확장 (inference-profile ARN 패턴 추가)

[Unreleased]: https://github.com/whchoi98/kiro-dashboard/compare/v1.5.0...HEAD
[1.5.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.2.0...v1.5.0
[1.2.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/whchoi98/kiro-dashboard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/whchoi98/kiro-dashboard/releases/tag/v1.0.0
