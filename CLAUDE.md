# CLAUDE.md — kiro-dashboard

## Project Overview

**Name**: kiro-dashboard
**Description**: Kiro IDE 사용자 분석 대시보드 — Next.js 14 (App Router) + CloudFront/ALB/ECS Fargate + Athena/Glue/S3 + Bedrock AI 분석
**Version**: 1.0.0
**Language**: Korean (primary), English (secondary)

Kiro IDE 사용자의 활동 데이터를 S3/Glue/Athena로 분석하고, Next.js 대시보드로 시각화하며, Amazon Bedrock으로 AI 인사이트를 제공하는 풀스택 분석 플랫폼.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS v4, dark theme |
| Charts | Recharts |
| Auth | Lambda@Edge + Cognito (PKCE, Hosted UI) |
| AWS Data | Athena, Glue, S3 |
| AWS AI | Bedrock Runtime (Claude models) |
| AWS Identity | IdentityStore (IAM Identity Center) |
| Infrastructure | AWS CDK (TypeScript), 5 stacks (incl. EdgeLambda in us-east-1) |
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
npx cdk deploy --all   # Deploy all 5 stacks
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
  api/                  11 API route handlers (see app/api/CLAUDE.md)
  components/           Shared React components (see app/components/CLAUDE.md)
  analyze/              AI analysis chat page (Bedrock streaming)
  users/                User activity dashboard page
  credits/              Credit usage dashboard page
  trends/               Usage trend dashboard page
  engagement/           Engagement metrics dashboard page
  productivity/         Productivity metrics dashboard page
lib/                    Shared AWS service clients (see lib/CLAUDE.md)
types/                  TypeScript interfaces (see types/CLAUDE.md)
public/                 Static assets (kiro-logo.svg)
infra/                  AWS CDK infrastructure (see infra/CLAUDE.md)
  bin/app.ts            CDK app entry — instantiates 5 stacks
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
- **Dark theme**: page background `bg-black`, cards `bg-gray-900/50`
- All new components must use the dark theme
- KiroLogo and KiroMascot SVG assets in `app/components/ui/`

### Environment Variables
ECS task environment variables are defined in `infra/lib/ecs-stack.ts`:
```
AWS_REGION          = us-east-1
ATHENA_DATABASE     = titanlog
ATHENA_OUTPUT_BUCKET= s3://whchoi01-titan-q-log/athena-results/
GLUE_TABLE_NAME     = user_report
IDENTITY_STORE_ID   = d-90663be888
```

For local development, copy `.env.example` to `.env.local` and fill in values.

### API Route Pattern
All API routes follow this pattern:
1. Accept query params via `req.url` / `new URL(req.url).searchParams`
2. Resolve Glue table with `resolveTableName()`
3. Build Athena SQL using `NORMALIZE_USERID` constant
4. Execute via `executeQuery()` from `lib/athena.ts`
5. Return `NextResponse.json(data)` or `NextResponse.json({ error }, { status: 500 })`

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

## Auto-Sync Rules

When editing files in `app/` or `lib/`:
- If adding a new API endpoint, update `app/api/CLAUDE.md`
- If adding a new component, update `app/components/CLAUDE.md`
- If changing Athena/Glue logic, update `lib/CLAUDE.md` and `docs/architecture.md`
- If adding a new CDK stack or modifying ECS env vars, update `infra/CLAUDE.md`
- If adding new TypeScript interfaces, update `types/CLAUDE.md`

Run `/sync-docs` after significant changes to verify all module docs are current.
