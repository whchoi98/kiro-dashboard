# CLAUDE.md — kiro-dashboard

## Project Overview

**Name**: kiro-dashboard
**Description**: Kiro IDE 사용자 분석 대시보드 — Next.js 14 (App Router) + CloudFront/ALB/ECS Fargate + Athena/Glue/S3 + Bedrock AI 분석
**Version**: 1.7.0
**Language**: Korean (primary), English (secondary)

Kiro IDE 사용자의 활동 데이터를 S3/Glue/Athena로 분석하고, Next.js 대시보드로 시각화하며, Amazon Bedrock으로 AI 인사이트를 제공하는 풀스택 분석 플랫폼.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS v4, dark/light theme (palette override), NanumSquare font, mobile-responsive |
| Charts | Recharts |
| Auth | Lambda@Edge + Cognito (PKCE, Hosted UI) |
| AWS Data | Athena, Glue, S3 |
| AWS AI | Bedrock Runtime (Claude models) |
| AWS Identity | IdentityStore (IAM Identity Center) |
| Infrastructure | AWS CDK (TypeScript), 6 stacks (incl. EdgeLambda in us-east-1, opt-in Catalog) |
| Container | Docker, ECS Fargate |
| CDN | CloudFront + ALB |

---

## Key Commands

```bash
# Development
npm run dev            # Local development server (port 3000)
npm run build          # Production build
npm run start          # Start production server
npm run lint           # ESLint checks

# Docker
docker build -t kiro-dashboard .
docker run -p 3000:3000 --env-file .env kiro-dashboard

# CDK Infrastructure
cd infra
npx cdk bootstrap      # First-time bootstrap (set CDK_DEFAULT_ACCOUNT + CDK_DEFAULT_REGION)
npx cdk bootstrap aws://<account>/us-east-1  # Required for Lambda@Edge (one-time)
npx cdk deploy --all   # Deploy all stacks (set -a; source .env.deploy; set +a first — see docs/runbooks/production-deploy.md)
npx cdk diff           # Preview changes
npx cdk destroy --all  # Tear down

# AWS ECR deploy
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-northeast-2.amazonaws.com
docker tag kiro-dashboard:latest <account>.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:latest
docker push <account>.dkr.ecr.ap-northeast-2.amazonaws.com/kiro-dashboard:latest
```

---

## Project Structure

```
app/                    Next.js App Router pages & API routes
  api/                  19 API route handlers (see app/api/CLAUDE.md)
  components/           Shared React components (see app/components/CLAUDE.md)
  analyze/              AI analysis chat page (Bedrock streaming)
  users/                User activity dashboard page
  credits/              Credit usage dashboard page
  trends/               Usage trend dashboard page
  engagement/           Engagement metrics dashboard page
  productivity/         Productivity metrics dashboard page
  model-usage/          AI model usage analysis page (S3 direct read)
  exec/                 Executive one-page snapshot (composes existing APIs)
  subscription/         Subscription tier & overage governance page
  adoption/             New-user inflow & activation page (S3 direct read)
  dev-activity/         Legacy deep dev metrics page (by_user_analytic)
  rollout/              Client rollout & cross-client adoption page (Client_Type)
  ingest-health/        Report delivery & freshness monitor (S3 inventory + header drift)
  changelog/            Bilingual changelog page (build-time static)
lib/                    Shared AWS service clients (see lib/CLAUDE.md)
types/                  TypeScript interfaces (see types/CLAUDE.md)
public/                 Static assets (kiro-logo.svg)
infra/                  AWS CDK infrastructure (see infra/CLAUDE.md)
  bin/app.ts            CDK app entry — instantiates 6 stacks (incl. opt-in Catalog)
  lib/                  Stack definitions: network, security, ecs, cdn
  lambda/edge-auth/     Lambda@Edge Cognito auth function (PKCE + JWT)
docs/                   Architecture docs, ADRs, runbooks
scripts/                Setup and utility scripts
tests/                  Project structure and hook tests
```

---

## Conventions

### Athena SQL
- All column names are **lowercase** in SQL queries
- UserId normalization (remove IAM Identity Center prefix):
  ```sql
  REGEXP_REPLACE(userid, '^d-[a-z0-9]+\.', '')
  ```
  This constant is exported as `NORMALIZE_USERID` from `lib/athena.ts`
- Tables are resolved dynamically via `lib/glue.ts` → `resolveTableName()`
- The primary Glue table is `user_report` (env: `GLUE_TABLE_NAME`)
- `by_user_analytic` is a secondary table used for per-user detailed queries

### Date Format Differences
| Table | Date Column Format |
|-------|--------------------|
| `user_report` | `YYYY-MM-DD` |
| `by_user_analytic` | `MM-DD-YYYY` |

Always cast dates appropriately when building WHERE clauses for each table.

### Data Masking
- All user identifiers (displayName, email, username, organization) are masked via `lib/mask.ts`
- `maskText(text)` — shows first 2 characters, replaces rest with `*` (e.g., `"John Smith"` → `"Jo********"`)
- `maskEmail(email)` — masks both local part and domain (e.g., `"admin@whchoi.net"` → `"ad***@wh*******"`)
- Masking is applied server-side in `lib/identity.ts` (resolveUserDetails) and `/api/idc-users`
- `userid` (UUID) is NOT masked — needed for user detail navigation

### i18n
- Korean/English switching via `lib/i18n.tsx` React context
- `useI18n()` hook returns `{ locale, setLocale, t }`
- All user-facing strings must support both `'ko'` and `'en'` keys
- Default language: Korean (`'ko'`)

### Branding & Theming
- **Kiro brand color**: `#9046FF`
- **Dark theme (default)**: page background `bg-black`, cards `bg-gray-900/50`
- **Light theme** — approach A palette override (`lib/theme.tsx` + `.light` block in `globals.css`): `html.light` remaps the Tailwind color variables (stops inverted 50↔950 … 400↔600), so **components keep writing dark-first classes** and light mode comes free. Consequences:
  - In light mode `text-white` renders near-black, `bg-gray-900` renders white — do NOT add `dark:`/`light:` variants
  - Text that sits on accent-colored backgrounds must be theme-invariant: inside `bg-[#9046FF]` it is handled by a bridge rule in globals.css; elsewhere use `text-[#ffffff]` (arbitrary values never invert)
  - Recharts props can't resolve CSS variables — use `useChartTheme()` from `lib/chart-theme.ts` for tick/tooltip colors; series accent fills stay invariant
  - Theme state: `useTheme()` from `lib/theme.tsx`; persisted as `localStorage['kiro-theme']`; no-FOUC bootstrap script in `app/layout.tsx`
- **Font**: NanumSquare (나눔스퀘어OTF web build) — self-hosted woff2 in `app/fonts/` (weights 300/400/700/800), loaded via `next/font/local` in `app/layout.tsx`, default sans stack via `@theme inline` in `globals.css`
- **Responsive**: mobile-first below `md` (768px) — sidebar becomes an off-canvas drawer with a fixed top bar; desktop appearance at `md+` must stay unchanged; grids use `grid-cols-1 sm:grid-cols-2 md:grid-cols-N`
- All new components are written dark-first (see Light theme above)
- KiroLogo and KiroMascot SVG assets in `app/components/ui/`

### Environment Variables
ECS task environment variables are defined in `infra/lib/ecs-stack.ts` (defaults shown; overridable per deploy via `.env.deploy` — see `.env.deploy.example` — except `AWS_REGION`, which is hardcoded to `us-east-1` in `EcsStack`):
```
AWS_REGION          = us-east-1
ATHENA_DATABASE     = titanlog
ATHENA_OUTPUT_BUCKET= s3://whchoi01-titan-q-log/athena-results/
GLUE_TABLE_NAME     = user_report
IDENTITY_STORE_ID   = d-90663be888
S3_REPORT_PREFIX    = q-user-log/AWSLogs/<deploy-account>/KiroLogs/user_report/us-east-1/   (account-derived)
S3_DATA_BUCKET      = (only set when ATHENA_DATA_BUCKET_NAME is configured — two-bucket deployments)
```

For local development, copy `.env.example` to `.env.local` and fill in values.

### API Route Pattern
Most API routes follow this pattern:
1. Accept query params via `req.url` / `new URL(req.url).searchParams`
2. Resolve Glue table with `resolveTableName()`
3. Build Athena SQL using `NORMALIZE_USERID` constant
4. Execute via `executeQuery()` from `lib/athena.ts`
5. Return `NextResponse.json(data)` or `NextResponse.json({ error }, { status: 500 })`

Exception: `/api/model-usage`, `/api/user-model-usage`, and `/api/adoption` read S3 CSV files directly via `lib/uar-s3.ts` because dynamic `{Model_name}_Messages` columns and the late-appended `New_User`/`User_Email` columns cannot be queried safely through Glue/Athena (OpenCSVSerDe uses positional mapping, but these columns appear in different positions across files; header-name CSV parsing sidesteps this).

Two Next.js constraints on `route.ts`, both of which fail *silently or confusingly*:
- **Export only route handlers and Next's config symbols.** Anything else fails the build with `Type '…' is not assignable to type 'never'`, which never mentions routes. Put helpers in `lib/` — e.g. the `/api/analyze` system prompt lives in `lib/analyze-prompt.ts`.
- **Never use `dynamic = 'force-static'` on a route whose response depends on a query param.** Next.js prerenders it once and hands the handler an *empty* `searchParams`, so the default branch gets baked into the build output and every caller receives it. This shipped Korean release notes to English users via `/api/release-notes`.

### Authentication Flow
- CloudFront Viewer Request triggers Lambda@Edge for every request
- Lambda@Edge validates JWT (id_token cookie) via `aws-jwt-verify`
- Invalid/missing tokens redirect to Cognito Hosted UI (PKCE flow)
- Successful auth sets HttpOnly cookies (id_token, access_token, refresh_token)
- Lambda@Edge injects `X-User-Email` and `X-User-Name` headers for downstream app
- Config stored in SSM Parameter Store (us-east-1) — cached on Lambda cold start
- Logout via `/auth/logout` → clears cookies → redirects to Cognito logout endpoint

### CDK Stack Deployment Order
`KiroDashboardNetwork` → `KiroDashboardSecurity` → `KiroDashboardEcs` → `KiroDashboardCdn` (+ `KiroDashboardEdgeLambda` auto-created in us-east-1)

CDK resolves cross-stack dependencies automatically via `npx cdk deploy --all`. The `KiroDashboardEdgeLambda` stack is automatically created by `cloudfront.experimental.EdgeFunction` in us-east-1 — requires CDK bootstrap in that region.

---

## Reference Documentation

The upstream contract for all Kiro data this project reads. **These four pages are authoritative** — when `docs/kiro-user-activity-report-schema.md` or any other repo doc disagrees with them, the upstream page wins and the repo doc should be corrected:

| Document | Defines |
|----------|---------|
| [Kiro IDE — Viewing per-user activity](https://kiro.dev/docs/enterprise/monitor-and-track/user-activity/) | `user_report` (13 static + dynamic model columns) and legacy `by_user_analytic` (44 metrics) schemas, S3 path layout, bucket policy |
| [Kiro CLI — View per-user activity](https://kiro.dev/docs/cli/enterprise/monitor-and-track/user-activity/) | Same feature, CLI side; per-`Client_Type` CSV split |
| [Kiro CLI — Log user prompts](https://kiro.dev/docs/cli/enterprise/monitor-and-track/prompt-logging/) | Prompt log JSON schema (opt-in, separate bucket). **Enabled in this account** (`s3://whchoi01-titan-q-prompt/q-prompt-logging/`, real `HH` partition, `.json.gz`) but **no code reads it** |
| [Kiro CLI — Viewing Kiro usage on the dashboard](https://kiro.dev/docs/cli/enterprise/monitor-and-track/dashboard/) | Kiro console's built-in aggregate view (no per-user detail); defines Active vs Pending (uncharged) subscriptions |

Facts that constrain implementation:
- Reports land **once daily at 02:00 UTC**, one CSV per client type. There is no intraday or on-demand generation — never write code that assumes fresher data.
- Days with **>1,000 active users** are split into `part_1`, `part_2`, … files. `lib/uar-s3.ts` collects every `.csv` key so this is handled; preserve that behaviour.
- Model message columns are dynamic (lowercase, alphabetical, Auto first) — hence the S3-direct-read path. See ADR-0004. **`Total_Messages` also ends in `_messages`**, so always pair `endsWith('_messages')` with the `!== 'total_messages'` exclusion as `app/api/model-usage/route.ts:25` does.
- The legacy `by_user_analytic` report is documented as **CLI and plugin usage only**, despite this repo historically labelling `/productivity` as "IDE productivity". It has **no `Client_Type` column at all**, so its rows cannot be attributed to a client. Do not add new IDE-specific claims sourced from that table without cross-checking `Client_Type` in `user_report`.
- **39 of the legacy report's 44 metric columns are the literal string `0` in every row** in this account. Before building any feature on a `by_user_analytic` column, run the value-existence check in `docs/kiro-user-activity-report-schema.md` §B-0 — otherwise you ship a page of zeros.
- Neither report contains a subscription roster. **Never infer licensed seats from IdentityStore `ListUsers`** or group membership; the real source is `user-subscriptions:ListUserSubscriptions`, which is not granted to the task role. Pending subscriptions are not charged.
- `New_User` means the **subscription was activated** that day, not first use. Activation days are by construction also activity days, so time-to-first-value is not measurable from this column.

Column-level detail, live-data cardinality (§B-0/§B-0b), and prompt-log observations (§D): `docs/kiro-user-activity-report-schema.md`.

---

## Auto-Sync Rules

When editing files in `app/` or `lib/`:
- If adding a new API endpoint, update `app/api/CLAUDE.md`
- If adding a new component, update `app/components/CLAUDE.md`
- If changing Athena/Glue logic, update `lib/CLAUDE.md` and `docs/architecture.md`
- If adding a new CDK stack or modifying ECS env vars, update `infra/CLAUDE.md`
- If adding new TypeScript interfaces, update `types/CLAUDE.md`

Run `/sync-docs` after significant changes to verify all module docs are current.
