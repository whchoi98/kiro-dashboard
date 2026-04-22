# Kiro Analytics Dashboard

## Project Overview

Internal analytics dashboard for Kiro (AI coding assistant) user activity. Visualizes messages, conversations, credits, and engagement data from AWS Athena.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS 4, Recharts
- **Auth**: NextAuth + AWS Cognito
- **Data**: AWS Athena → Glue Catalog → S3 CSV (`user_report` table)
- **User Resolution**: AWS IAM Identity Center (Identity Store)
- **Infra**: AWS CDK 4-Stack (VPC → Security → ECS Fargate ARM64 → CloudFront)
- **Container**: Docker multi-stage build, node:20-alpine, ARM64
- **i18n**: Custom context-based (Korean/English)

## Directory Structure

```
app/                    # Next.js App Router pages
  page.tsx              # Overview dashboard (server→client hybrid)
  users/                # User leaderboard + detail drill-down
  trends/               # Daily activity trends
  credits/              # Credit usage analysis
  engagement/           # Engagement segmentation + funnel
  login/                # Cognito login
  api/                  # API routes (metrics, users, trends, credits, engagement, client-dist, idc-users, user-detail, health)
  components/           # UI components (charts/, layout/, ui/, tables/)
lib/                    # Shared utilities
  athena.ts             # Athena query execution with pagination, NORMALIZE_USERID
  auth.ts               # NextAuth Cognito config
  glue.ts               # Glue table name resolution
  identity.ts           # Identity Store user resolution (resolveUserDetails, resolveUsernames)
  i18n.tsx              # Korean/English translations
types/                  # TypeScript type definitions
  dashboard.ts          # All dashboard interfaces
infra/                  # AWS CDK infrastructure
  lib/network-stack.ts  # VPC, SSM endpoints
  lib/security-stack.ts # ALB/ECS SGs, Cognito UserPool
  lib/ecs-stack.ts      # Fargate, ALB, ECR, Auto Scaling
  lib/cdn-stack.ts      # CloudFront distribution
docs/                   # Documentation
  kiro-user-activity-report-schema.md  # Data schema reference
```

## Data Source

- **Table**: `titanlog.user_report` (Athena/Glue)
- **S3**: `s3://whchoi01-titan-q-log/q-user-log/AWSLogs/120443221648/KiroLogs/user_report/us-east-1/`
- **Columns**: Date, UserId, Client_Type, Chat_Conversations, Credits_Used, Overage_Cap, Overage_Credits_Used, Overage_Enabled, ProfileId, Subscription_Tier, Total_Messages
- **UserId normalization**: Some records have `d-90663be888.` prefix — use `NORMALIZE_USERID` from `lib/athena.ts`
- **Data latency**: T+1 batch (today's data appears tomorrow ~02:00 UTC)

## Key Conventions

- All Athena SQL uses **lowercase column names** (matching Glue catalog)
- Subscription_Tier values are **UPPERCASE** in CSV (POWER, PRO, PROPLUS)
- `Total_Messages` includes prompts + tool calls + responses (not just user messages)
- API routes accept `?days=N` parameter for date range filtering
- All sub-pages are client components with DateRangePicker (1/3/7/14/30/60/90 days)

## Infrastructure

- **Region**: ap-northeast-2 (CDK), us-east-1 (Athena/S3/Identity Store)
- **ECS**: Fargate ARM64, 512 CPU / 1GB, auto-scale 1-4 tasks at 70% CPU
- **CloudFront → ALB**: X-Custom-Secret header for origin access control
- **Cognito**: UserPool with email sign-in, authorization code grant

## Known Issues

- NEXTAUTH_SECRET is hardcoded (`change-me-in-production`)
- NEXTAUTH_URL is empty in ECS env — server-side fetch falls back to localhost
- Cognito callback URL only has localhost registered
- `resolveUsernames` (legacy) and `resolveUserDetails` (new) coexist in identity.ts
- ECS Task Role uses overly broad managed policies (AthenaFullAccess, S3FullAccess, GlueConsoleFullAccess)
